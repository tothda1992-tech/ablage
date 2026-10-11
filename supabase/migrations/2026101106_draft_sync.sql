-- STAGING ONLY. Requires 01,02,04,05; no accounts, credentials or cloud resources created.
-- Draft autosave is distinct from final submission. Retrying a request is idempotent.
begin;
create table private.workday_requests(
 employee_id uuid not null references public.profiles(id),request_id uuid not null,
 work_date date not null,arguments jsonb not null,applied_version integer not null,
 created_at timestamptz not null default now(),primary key(employee_id,request_id)
);
alter table private.workday_requests enable row level security;
revoke all on private.workday_requests from public,anon,authenticated,service_role;

create function private.workday_write_v2(p_date date,p_payload jsonb,p_expected integer,p_request_id uuid,p_submit boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; oldrow public.workdays; result public.workdays; prior private.workday_requests;
 args jsonb; rates jsonb; item record; old_exists boolean; units bigint; unit_rate bigint;
 norm_total bigint=0; other_total bigint=0; hours bigint; body jsonb;
begin
 if not private.live_session() then raise exception 'Aktív bejelentkezés szükséges.' using errcode='42501';end if;
 select * into actor from public.profiles where id=auth.uid() and active and role='employee' for share;
 if not found then raise exception 'Aktív dolgozói jogosultság szükséges.' using errcode='42501';end if;
 if p_date is null or p_date<'2000-01-01' or p_date>='2200-01-01' or p_expected is null or p_expected<0 or p_expected>2147483646 or p_request_id is null or p_submit is null then
  raise exception 'Hibás nap, verzió vagy mentési azonosító.' using errcode='22023';end if;
 if p_submit and p_payload is not null then raise exception 'Beküldéskor a már mentett napot kell használni.' using errcode='22023';end if;
 if not p_submit and (p_payload is null or octet_length(p_payload::text)>40000) then raise exception 'Hibás napi adatok.' using errcode='22023';end if;
 args=jsonb_build_object('date',p_date,'payload',p_payload,'expected',p_expected,'submit',p_submit);
 -- Request lock prevents reuse of one UUID for different dates; day lock matches legacy/manager RPCs.
 perform pg_advisory_xact_lock(hashtextextended('request:'||actor.id::text||':'||p_request_id::text,0));
 select * into prior from private.workday_requests where employee_id=actor.id and request_id=p_request_id;
 if found then
  if prior.arguments is distinct from args then raise exception 'Ez a mentési azonosító más adatokhoz tartozik.' using errcode='22023';end if;
  select * into result from public.workdays where employee_id=actor.id and work_date=p_date and workspace_id=actor.workspace_id;
  if not found then raise exception 'A korábbi mentés jelenlegi napja nem elérhető.' using errcode='42501';end if;
  -- Replay returns the CURRENT record, not an old snapshot which could overwrite newer UI data.
  return jsonb_build_object('request_id',p_request_id,'applied_version',prior.applied_version,'replayed',true,'workday',to_jsonb(result));
 end if;
 perform pg_advisory_xact_lock(hashtextextended(actor.id::text||':'||p_date::text,0));
 select * into oldrow from public.workdays where employee_id=actor.id and work_date=p_date for update;
 old_exists=found;
 if old_exists and oldrow.workspace_id<>actor.workspace_id then raise exception 'Másik csapat napja nem módosítható.' using errcode='42501';end if;
 if (old_exists and oldrow.version<>p_expected) or (not old_exists and p_expected<>0) then
  raise exception 'Másik eszköz módosította a napot. Frissíts és ellenőrizd.' using errcode='40001';end if;
 if old_exists and oldrow.status<>'draft' then raise exception 'A nap már beküldött. Vezetői visszaadás szükséges.' using errcode='42501';end if;
 if p_submit and not old_exists then raise exception 'Előbb mentsd el a munkanapot.' using errcode='22023';end if;
 body=case when p_submit then oldrow.payload else p_payload end;
 if jsonb_typeof(body) is distinct from 'object' or octet_length(body::text)>40000 then raise exception 'Hibás napi adatok.' using errcode='22023';end if;
 if exists(select 1 from jsonb_object_keys(body) k where k not in ('counts','downtime','workCentiMinutes','brazilCount','spoiler','note')) then raise exception 'Ismeretlen napi mező.' using errcode='22023';end if;
 if jsonb_typeof(body->'counts') is distinct from 'object' or jsonb_typeof(body->'downtime') is distinct from 'object' then raise exception 'Hibás mennyiségek.' using errcode='22023';end if;
 hours=private.checked_integer(body->'workCentiMinutes',288000);
 if hours%60<>0 then raise exception 'A munkaóra legfeljebb két tizedes lehet.' using errcode='22023';end if;
 perform private.checked_integer(body->'brazilCount',99999);
 if jsonb_typeof(body->'note') is distinct from 'string' or length(body->>'note')>3000 or jsonb_typeof(body->'spoiler') is distinct from 'string' or length(body->>'spoiler')>1000 then raise exception 'Hibás megjegyzés.' using errcode='22023';end if;
 if old_exists then rates=oldrow.norms;else select jsonb_object_agg(id,rate) into rates from public.products;end if;
 for item in select key,value from jsonb_each(body->'counts') loop
  if not exists(select 1 from public.products where id=item.key) then raise exception 'Ismeretlen termék.' using errcode='22023';end if;
  units=private.checked_integer(item.value,99999);unit_rate=private.checked_integer(rates->item.key,1000000);norm_total=norm_total+units*unit_rate;
 end loop;
 for item in select key,value from jsonb_each(body->'downtime') loop
  if not exists(select 1 from public.downtime_categories where id=item.key) then raise exception 'Ismeretlen egyéb jogcím.' using errcode='22023';end if;
  other_total=other_total+private.checked_integer(item.value,144000);
 end loop;
 insert into public.workdays(employee_id,workspace_id,work_date,payload,norms,status,version,norm_centi_minutes,downtime_centi_minutes,total_centi_minutes)
 values(actor.id,actor.workspace_id,p_date,body,rates,case when p_submit then 'submitted' else 'draft' end,p_expected+1,norm_total,other_total,norm_total+other_total)
 on conflict(employee_id,work_date) do update set payload=excluded.payload,status=excluded.status,version=excluded.version,
 norm_centi_minutes=excluded.norm_centi_minutes,downtime_centi_minutes=excluded.downtime_centi_minutes,total_centi_minutes=excluded.total_centi_minutes,updated_at=now()
 returning * into result;
 insert into public.audit_events(workspace_id,employee_id,actor_id,actor_name,work_date,action,before_data,after_data)
 values(actor.workspace_id,actor.id,actor.id,actor.display_name,p_date,case when p_submit then 'Nap beküldve' else 'Piszkozat mentve' end,case when old_exists then to_jsonb(oldrow) else null end,to_jsonb(result));
 perform private.queue_report(actor.id,actor.workspace_id,p_date);
 -- The existing workday trigger also queues the SAME team/month workbook atomically.
 insert into private.workday_requests(employee_id,request_id,work_date,arguments,applied_version)
 values(actor.id,p_request_id,p_date,args,result.version);
 return jsonb_build_object('request_id',p_request_id,'applied_version',result.version,'replayed',false,'workday',to_jsonb(result));
end; $$;
create function public.save_workday_draft(p_date date,p_payload jsonb,p_expected integer,p_request_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.workday_write_v2(p_date,p_payload,p_expected,p_request_id,false);$$;
create function public.submit_workday(p_date date,p_expected integer,p_request_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.workday_write_v2(p_date,null,p_expected,p_request_id,true);$$;
revoke all on function private.workday_write_v2(date,jsonb,integer,uuid,boolean),public.save_workday_draft(date,jsonb,integer,uuid),public.submit_workday(date,integer,uuid) from public,anon;
grant execute on function private.workday_write_v2(date,jsonb,integer,uuid,boolean),public.save_workday_draft(date,jsonb,integer,uuid),public.submit_workday(date,integer,uuid) to authenticated;

-- Preserve the existing workbook APIs but keep privileged implementations out of exposed schema.
alter function public.team_workbook_snapshot(uuid,date) set schema private;
alter function public.commit_team_workbook(uuid,date,bigint,text) set schema private;
alter function public.read_team_workbook(date) set schema private;
create function public.team_workbook_snapshot(p_workspace uuid,p_month date) returns jsonb
language sql security invoker set search_path='' as $$select private.team_workbook_snapshot(p_workspace,p_month);$$;
create function public.commit_team_workbook(p_workspace uuid,p_month date,p_generation bigint,p_base64 text) returns boolean
language sql security invoker set search_path='' as $$select private.commit_team_workbook(p_workspace,p_month,p_generation,p_base64);$$;
create function public.read_team_workbook(p_month date) returns jsonb
language sql security invoker set search_path='' as $$select private.read_team_workbook(p_month);$$;
revoke all on function private.team_workbook_snapshot(uuid,date),private.commit_team_workbook(uuid,date,bigint,text),public.team_workbook_snapshot(uuid,date),public.commit_team_workbook(uuid,date,bigint,text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.team_workbook_snapshot(uuid,date),private.commit_team_workbook(uuid,date,bigint,text),public.team_workbook_snapshot(uuid,date),public.commit_team_workbook(uuid,date,bigint,text) to service_role;
revoke all on function private.read_team_workbook(date),public.read_team_workbook(date) from public,anon;
grant execute on function private.read_team_workbook(date),public.read_team_workbook(date) to authenticated;
commit;
