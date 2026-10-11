-- New dedicated STAGING project only. No accounts, secrets, scheduler or cloud writes.
begin;
alter table public.team_workbook_jobs
 add column lease_token uuid,
 add column lease_until timestamptz not null default '-infinity',
 add column retry_after timestamptz not null default '-infinity',
 add column attempts integer not null default 0,
 add column last_error text;
create table private.workbook_worker_health(singleton boolean primary key default true check(singleton),last_seen timestamptz not null);
revoke all on private.workbook_worker_health from public,anon,authenticated,service_role;
create or replace function private.queue_team_workbook(p_workspace uuid,p_date date) returns void
language sql security definer set search_path='' as $$
 insert into public.team_workbook_jobs(workspace_id,report_month) values(p_workspace,date_trunc('month',p_date)::date)
 on conflict(workspace_id,report_month) do update set generation=public.team_workbook_jobs.generation+1,updated_at=now(),retry_after='-infinity',attempts=0,last_error=null;
$$;
create function private.claim_team_workbook() returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.team_workbook_jobs;
begin
 insert into private.workbook_worker_health(singleton,last_seen) values(true,now()) on conflict(singleton) do update set last_seen=excluded.last_seen;
 select * into j from public.team_workbook_jobs
 where processed_generation<generation and lease_until<clock_timestamp() and retry_after<=clock_timestamp()
 order by updated_at for update skip locked limit 1;
 if not found then return null;end if;
 update public.team_workbook_jobs set lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '3 minutes'
 where workspace_id=j.workspace_id and report_month=j.report_month returning * into j;
 return jsonb_build_object('workspace',j.workspace_id,'month',to_char(j.report_month,'YYYY-MM'),'token',j.lease_token);
end;$$;
create function public.claim_team_workbook() returns jsonb language sql security invoker set search_path='' as $$select private.claim_team_workbook();$$;
create function private.finish_team_workbook(p_workspace uuid,p_month date,p_token uuid,p_error text default null) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.team_workbook_jobs set lease_token=null,lease_until='-infinity',
 attempts=case when p_error is null then 0 else least(attempts+1,20) end,
 retry_after=case when p_error is null then clock_timestamp() else clock_timestamp()+make_interval(secs=>least(300,5*power(2,least(attempts,6))::integer)) end,
 last_error=case when p_error is null then null else left(p_error,500) end
 where workspace_id=p_workspace and report_month=p_month and lease_token=p_token;
 return found;
end;$$;
create function public.finish_team_workbook(p_workspace uuid,p_month date,p_token uuid,p_error text default null) returns boolean
language sql security invoker set search_path='' as $$select private.finish_team_workbook(p_workspace,p_month,p_token,p_error);$$;
revoke all on function private.claim_team_workbook(),public.claim_team_workbook(),private.finish_team_workbook(uuid,date,uuid,text),public.finish_team_workbook(uuid,date,uuid,text) from public,anon,authenticated;
grant execute on function private.claim_team_workbook(),public.claim_team_workbook(),private.finish_team_workbook(uuid,date,uuid,text),public.finish_team_workbook(uuid,date,uuid,text) to service_role;
create function private.pilot_readiness() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.live_session() then raise exception 'Aktív próbabejelentkezés szükséges.' using errcode='42501';end if;
 return jsonb_build_object('schema_version',7,'environment','staging','product_count',(select count(*) from public.products),
 'worker_last_seen',case when exists(select 1 from public.profiles where id=auth.uid() and role='manager') then (select last_seen from private.workbook_worker_health where singleton) else null end);
end;$$;
create function public.pilot_readiness() returns jsonb language sql security invoker set search_path='' as $$select private.pilot_readiness();$$;
revoke all on function private.pilot_readiness(),public.pilot_readiness() from public,anon;
grant execute on function private.pilot_readiness(),public.pilot_readiness() to authenticated;
commit;
