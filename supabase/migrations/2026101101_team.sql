-- Dedicated project only. No real employees or passwords are seeded.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table public.workspaces(id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120));
create table public.profiles(
 id uuid primary key references auth.users(id), workspace_id uuid not null references public.workspaces(id),
 worker_code text not null unique check(worker_code ~ '^[A-Z0-9_-]{2,32}$'),
 display_name text not null check(length(display_name) between 1 and 80),
 role text not null default 'employee' check(role in ('employee','manager')), active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.products(id text primary key, code text not null, rate integer not null check(rate between 0 and 1000000), position text not null check(position in ('upper','lower','accessory')), excel_row integer not null);
create table public.downtime_categories(id text primary key, label text not null, excel_row integer not null);
create table public.workdays(
 employee_id uuid not null references public.profiles(id), workspace_id uuid not null references public.workspaces(id),
 work_date date not null check(work_date>='2000-01-01' and work_date<'2200-01-01'),
 payload jsonb not null, norms jsonb not null, status text not null check(status in ('draft','submitted','approved')),
 version integer not null check(version>0), norm_centi_minutes bigint not null, downtime_centi_minutes bigint not null,
 total_centi_minutes bigint not null, updated_at timestamptz not null default now(),
 primary key(employee_id,work_date)
);
create index workdays_workspace_date on public.workdays(workspace_id,work_date);
create table public.audit_events(
 id bigint generated always as identity primary key, workspace_id uuid not null references public.workspaces(id),
 employee_id uuid not null references public.profiles(id), actor_id uuid not null references public.profiles(id), actor_name text not null,
 work_date date, action text not null, reason text not null default '', before_data jsonb, after_data jsonb,
 created_at timestamptz not null default now()
);
create index audit_workspace_date on public.audit_events(workspace_id,created_at);
create table public.report_jobs(
 employee_id uuid not null references public.profiles(id), workspace_id uuid not null references public.workspaces(id),
 report_month date not null check(extract(day from report_month)=1),
 generation bigint not null default 1, processed_generation bigint not null default 0,
 object_key text, last_error text, updated_at timestamptz not null default now(),
 primary key(employee_id,report_month)
);
create function private.manager_for(p_workspace uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.role='manager' and p.workspace_id=p_workspace);
$$;
create function private.member_of(p_workspace uuid) returns boolean
 language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.workspace_id=p_workspace);
$$;
grant usage on schema private to authenticated;
revoke all on function private.manager_for(uuid),private.member_of(uuid) from public,anon;
grant execute on function private.manager_for(uuid),private.member_of(uuid) to authenticated;
alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.downtime_categories enable row level security;
alter table public.workdays enable row level security;
alter table public.audit_events enable row level security;
alter table public.report_jobs enable row level security;
revoke all on public.workspaces,public.profiles,public.products,public.downtime_categories,public.workdays,public.audit_events,public.report_jobs from anon,authenticated;
grant select on public.workspaces,public.profiles,public.products,public.downtime_categories,public.workdays,public.audit_events,public.report_jobs to authenticated;
create policy workspace_read on public.workspaces for select to authenticated using(private.member_of(id));
create policy profiles_read on public.profiles for select to authenticated using((id=auth.uid() and active) or private.manager_for(workspace_id));
create policy products_read on public.products for select to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.active));
create policy categories_read on public.downtime_categories for select to authenticated using(exists(select 1 from public.profiles p where p.id=auth.uid() and p.active));
create policy days_read on public.workdays for select to authenticated using(private.member_of(workspace_id) and (employee_id=auth.uid() or private.manager_for(workspace_id)));
create policy audit_read on public.audit_events for select to authenticated using(private.member_of(workspace_id) and (employee_id=auth.uid() or private.manager_for(workspace_id)));
create policy jobs_read on public.report_jobs for select to authenticated using(private.member_of(workspace_id) and (employee_id=auth.uid() or private.manager_for(workspace_id)));
create function private.checked_integer(p_value jsonb,p_max bigint) returns bigint
 language plpgsql immutable set search_path='' as $$
 declare n numeric;
 begin
  if p_value is null or jsonb_typeof(p_value)<>'number' then raise exception 'Érvénytelen szám.'; end if;
  n=(p_value#>>'{}')::numeric;
  if n<0 or n>p_max or n<>trunc(n) then raise exception 'Érvénytelen egész szám.'; end if;
  return n::bigint;
 end;
$$;
create function private.queue_report(p_employee uuid,p_workspace uuid,p_date date) returns void
 language sql security definer set search_path='' as $$
 insert into public.report_jobs(employee_id,workspace_id,report_month)
 values(p_employee,p_workspace,date_trunc('month',p_date)::date)
 on conflict(employee_id,report_month) do update set generation=public.report_jobs.generation+1,updated_at=now(),last_error=null;
$$;
revoke all on function private.checked_integer(jsonb,bigint),private.queue_report(uuid,uuid,date) from public,anon,authenticated;
create function public.save_workday(p_date date,p_payload jsonb,p_expected integer) returns jsonb
 language plpgsql security definer set search_path='' as $$
 declare actor public.profiles; oldrow public.workdays; result public.workdays; rates jsonb; item record;
         quantity bigint; rate bigint; norm_total bigint=0; other_total bigint=0; old_exists boolean; hours bigint;
 begin
  select * into actor from public.profiles where id=auth.uid() and active and role='employee';
  if not found then raise exception 'Aktív dolgozói jogosultság szükséges.' using errcode='42501'; end if;
  if p_date is null or p_date<'2000-01-01' or p_date>='2200-01-01' or p_expected is null or p_expected<0 then raise exception 'Érvénytelen dátum vagy verzió.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor.id::text||':'||p_date::text,0));
  select * into oldrow from public.workdays where employee_id=actor.id and work_date=p_date for update;
  old_exists=found;
  if (old_exists and oldrow.version<>p_expected) or (not old_exists and p_expected<>0) then raise exception 'Másik eszköz módosította a napot. Frissíts, majd ellenőrizd.' using errcode='40001'; end if;
  if old_exists and oldrow.status<>'draft' then raise exception 'A nap már be van küldve. Vezetői újranyitás szükséges.' using errcode='42501'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>40000 then raise exception 'Hibás napi adatok.'; end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('counts','downtime','workCentiMinutes','brazilCount','spoiler','note')) then raise exception 'Ismeretlen napi mező.'; end if;
  if jsonb_typeof(p_payload->'counts') is distinct from 'object' or jsonb_typeof(p_payload->'downtime') is distinct from 'object' then raise exception 'Hibás mennyiségek.'; end if;
  hours=private.checked_integer(p_payload->'workCentiMinutes',288000);
  if hours%60<>0 then raise exception 'A munkaóra legfeljebb két tizedes lehet.'; end if;
  perform private.checked_integer(p_payload->'brazilCount',99999);
  if jsonb_typeof(p_payload->'note') is distinct from 'string' or length(p_payload->>'note')>3000 or jsonb_typeof(p_payload->'spoiler') is distinct from 'string' or length(p_payload->>'spoiler')>1000 then raise exception 'Hibás megjegyzés.'; end if;
  if old_exists then rates=oldrow.norms; else select jsonb_object_agg(p.id,p.rate) into rates from public.products p; end if;
  for item in select key,value from jsonb_each(p_payload->'counts') loop
   if not exists(select 1 from public.products where id=item.key) then raise exception 'Ismeretlen termék.'; end if;
   quantity=private.checked_integer(item.value,99999);rate=private.checked_integer(rates->item.key,1000000);norm_total=norm_total+quantity*rate;
  end loop;
  for item in select key,value from jsonb_each(p_payload->'downtime') loop
   if not exists(select 1 from public.downtime_categories where id=item.key) then raise exception 'Ismeretlen egyéb jogcím.'; end if;
   other_total=other_total+private.checked_integer(item.value,144000);
  end loop;
  insert into public.workdays(employee_id,workspace_id,work_date,payload,norms,status,version,norm_centi_minutes,downtime_centi_minutes,total_centi_minutes)
   values(actor.id,actor.workspace_id,p_date,p_payload,rates,'submitted',p_expected+1,norm_total,other_total,norm_total+other_total)
   on conflict(employee_id,work_date) do update set payload=excluded.payload,status='submitted',version=excluded.version,norm_centi_minutes=excluded.norm_centi_minutes,downtime_centi_minutes=excluded.downtime_centi_minutes,total_centi_minutes=excluded.total_centi_minutes,updated_at=now()
   returning * into result;
  insert into public.audit_events(workspace_id,employee_id,actor_id,actor_name,work_date,action,before_data,after_data)
   values(actor.workspace_id,actor.id,actor.id,actor.display_name,p_date,'Nap beküldve',case when old_exists then to_jsonb(oldrow) else null end,to_jsonb(result));
  perform private.queue_report(actor.id,actor.workspace_id,p_date);
  return to_jsonb(result);
 end;
$$;
create function public.manager_decide(p_employee uuid,p_date date,p_expected integer,p_action text,p_reason text default '') returns jsonb
 language plpgsql security definer set search_path='' as $$
 declare actor public.profiles; oldrow public.workdays; result public.workdays;
 begin
  select * into actor from public.profiles where id=auth.uid() and active and role='manager';
  if not found then raise exception 'Vezetői jogosultság szükséges.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_employee::text||':'||p_date::text,0));
  select * into oldrow from public.workdays where employee_id=p_employee and work_date=p_date and workspace_id=actor.workspace_id for update;
  if not found then raise exception 'Nem elérhető munkanap.' using errcode='42501'; end if;
  if p_expected is null or oldrow.version<>p_expected then raise exception 'A nap változott. Frissíts.' using errcode='40001'; end if;
  if length(coalesce(p_reason,''))>1000 then raise exception 'Túl hosszú indok.'; end if;
  if p_action is null or p_action not in ('approve','reopen') then raise exception 'Ismeretlen művelet.'; end if;
  if p_action='approve' and oldrow.status<>'submitted' then raise exception 'Csak beküldött nap hagyható jóvá.'; end if;
  if p_action='reopen' and (oldrow.status='draft' or p_reason is null or length(trim(p_reason))<3 or length(p_reason)>1000) then raise exception 'Adj meg javítási indokot (3–1000 karakter).'; end if;
  update public.workdays set status=case when p_action='approve' then 'approved' else 'draft' end,version=version+1,updated_at=now() where employee_id=p_employee and work_date=p_date returning * into result;
  insert into public.audit_events(workspace_id,employee_id,actor_id,actor_name,work_date,action,reason,before_data,after_data)
   values(actor.workspace_id,p_employee,actor.id,actor.display_name,p_date,case when p_action='approve' then 'Jóváhagyva' else 'Javításra visszaküldve' end,coalesce(p_reason,''),to_jsonb(oldrow),to_jsonb(result));
  perform private.queue_report(p_employee,actor.workspace_id,p_date);
  return to_jsonb(result);
 end;
$$;
revoke all on function public.save_workday(date,jsonb,integer),public.manager_decide(uuid,date,integer,text,text) from public,anon;
grant execute on function public.save_workday(date,jsonb,integer),public.manager_decide(uuid,date,integer,text,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('work-reports','work-reports',false,5242880,array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
 on conflict(id) do update set public=false;
create policy report_read on storage.objects for select to authenticated using(
 bucket_id='work-reports' and exists(select 1 from public.profiles p where p.id::text=(storage.foldername(name))[1] and private.member_of(p.workspace_id) and (p.id=auth.uid() or private.manager_for(p.workspace_id)))
);
commit;
