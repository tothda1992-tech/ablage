-- ADDITIVE staging migration. Run ONLY after 01/02/04, after company approval.
-- Does NOT create users or enable a public workbook. One canonical XLSX per team/month.
-- Stored privately in one database row: generation-CAS and file replacement are atomic.
begin;
create table public.team_workbook_jobs(
 workspace_id uuid not null references public.workspaces(id),
 report_month date not null check(report_month>='2000-01-01' and report_month<'2200-01-01' and extract(day from report_month)=1),
 generation bigint not null default 1 check(generation>0),
 processed_generation bigint not null default 0,
 updated_at timestamptz not null default now(), primary key(workspace_id,report_month)
);
create table private.team_workbook_files(
 workspace_id uuid not null,report_month date not null,
 generation bigint not null,workbook_base64 text not null check(octet_length(workbook_base64) between 4 and 80000000),
 updated_at timestamptz not null default now(),primary key(workspace_id,report_month),
 foreign key(workspace_id,report_month) references public.team_workbook_jobs(workspace_id,report_month)
);
alter table public.team_workbook_jobs enable row level security;
alter table private.team_workbook_files enable row level security;
revoke all on public.team_workbook_jobs,private.team_workbook_files from public,anon,authenticated,service_role;
grant select on public.team_workbook_jobs to authenticated;
create policy team_workbook_manager_read on public.team_workbook_jobs for select to authenticated using(private.manager_for(workspace_id));

create function private.queue_team_workbook(p_workspace uuid,p_date date) returns void
language sql security definer set search_path='' as $$
 insert into public.team_workbook_jobs(workspace_id,report_month) values(p_workspace,date_trunc('month',p_date)::date)
 on conflict(workspace_id,report_month) do update set generation=public.team_workbook_jobs.generation+1,updated_at=now();
$$;
create function private.workday_queues_team_workbook() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then perform private.queue_team_workbook(OLD.workspace_id,OLD.work_date);
 else
  perform private.queue_team_workbook(NEW.workspace_id,NEW.work_date);
  if TG_OP='UPDATE' and (OLD.workspace_id<>NEW.workspace_id or date_trunc('month',OLD.work_date)<>date_trunc('month',NEW.work_date)) then
   perform private.queue_team_workbook(OLD.workspace_id,OLD.work_date);
  end if;
 end if;
 return null;
end; $$;
create trigger workday_team_book after insert or update or delete on public.workdays for each row execute function private.workday_queues_team_workbook();
create function private.profile_queues_team_workbook() returns trigger
language plpgsql security definer set search_path='' as $$
declare w uuid; d date;
begin
 for w in select distinct workspace_id from (select NEW.workspace_id union all select case when TG_OP='UPDATE' then OLD.workspace_id else NEW.workspace_id end) ids loop
  for d in select report_month from public.team_workbook_jobs where workspace_id=w
   union select date_trunc('month',work_date)::date from public.workdays where workspace_id=w loop
    perform private.queue_team_workbook(w,d);
  end loop;
 end loop;return null;
end; $$;
create trigger profile_team_book after insert or update of display_name,worker_code,active,workspace_id,role on public.profiles for each row execute function private.profile_queues_team_workbook();
revoke all on function private.queue_team_workbook(uuid,date),private.workday_queues_team_workbook(),private.profile_queues_team_workbook() from public,anon,authenticated;

-- Service-only export snapshot: profiles, workdays and generation are read by ONE statement.
-- Employee callers must first pass the Edge actor check; they never receive this payload.
create function public.team_workbook_snapshot(p_workspace uuid,p_month date) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_month is null or extract(day from p_month)<>1 then raise exception 'Hibás hónap.';end if;
 insert into public.team_workbook_jobs(workspace_id,report_month) values(p_workspace,p_month) on conflict do nothing;
 return (select jsonb_build_object('schemaVersion',1,'workspace',p_workspace::text,'bookId',p_workspace::text,
 'month',to_char(p_month,'YYYY-MM'),'revision',j.generation,'demo',false,
 'profiles',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'worker_code',p.worker_code,'display_name',p.display_name,'role',p.role,'active',p.active) order by p.worker_code)
  from public.profiles p where p.workspace_id=p_workspace and p.role='employee'),'[]'::jsonb),
 'records',coalesce((select jsonb_agg(jsonb_build_object('employee_id',d.employee_id,'work_date',d.work_date,'status',d.status,'version',d.version,'payload',d.payload,'norms',d.norms) order by d.employee_id,d.work_date)
  from public.workdays d where d.workspace_id=p_workspace and d.work_date>=p_month and d.work_date<(p_month+interval '1 month')),'[]'::jsonb))
 from public.team_workbook_jobs j where j.workspace_id=p_workspace and j.report_month=p_month);
end; $$;
create function public.commit_team_workbook(p_workspace uuid,p_month date,p_generation bigint,p_base64 text) returns boolean
language plpgsql security definer set search_path='' as $$
declare g bigint;
begin
 select generation into g from public.team_workbook_jobs where workspace_id=p_workspace and report_month=p_month for update;
 if not found or g<>p_generation then return false;end if;
 -- Base64 is generated only by the trusted exporter. Length is bounded before decoding/commit.
 if p_base64 is null or octet_length(p_base64)>80000000 or p_base64!~'^[A-Za-z0-9+/=]+$' then raise exception 'Hibás munkafüzet.';end if;
 insert into private.team_workbook_files(workspace_id,report_month,generation,workbook_base64)
 values(p_workspace,p_month,p_generation,p_base64)
 on conflict(workspace_id,report_month) do update set generation=excluded.generation,workbook_base64=excluded.workbook_base64,updated_at=now();
 update public.team_workbook_jobs set processed_generation=p_generation where workspace_id=p_workspace and report_month=p_month;
 return true;
end; $$;
revoke all on function public.team_workbook_snapshot(uuid,date),public.commit_team_workbook(uuid,date,bigint,text) from public,anon,authenticated;
grant execute on function public.team_workbook_snapshot(uuid,date),public.commit_team_workbook(uuid,date,bigint,text) to service_role;

-- Only a live MANAGER can read all 20 workers. No employee or public bucket access.
create function public.read_team_workbook(p_month date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w uuid;g bigint;done bigint;result jsonb;
begin
 select workspace_id into w from public.profiles where id=auth.uid() and active and role='manager';
 if not found or not private.manager_for(w) then raise exception 'Vezetői jogosultság szükséges.' using errcode='42501';end if;
 select jsonb_build_object('status','ready','generation',f.generation,'base64',f.workbook_base64) into result
 from private.team_workbook_files f join public.team_workbook_jobs j
  on j.workspace_id=f.workspace_id and j.report_month=f.report_month
  and j.generation=f.generation and j.processed_generation=j.generation
 where f.workspace_id=w and f.report_month=p_month;
 return coalesce(result,jsonb_build_object('status','pending'));
end; $$;
revoke all on function public.read_team_workbook(date) from public,anon;
grant execute on function public.read_team_workbook(date) to authenticated;
-- Initial jobs for existing historical months, not new workdays.
insert into public.team_workbook_jobs(workspace_id,report_month)
 select distinct workspace_id,date_trunc('month',work_date)::date from public.workdays on conflict do nothing;
commit;
