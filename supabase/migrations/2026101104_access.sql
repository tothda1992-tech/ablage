-- Additive access hardening. No employee accounts or passwords are created here.
begin;
alter table public.profiles add column access_valid_after timestamptz not null default '-infinity';
-- PostgREST verifies the JWT. Also reject signed but revoked/old sessions.
create function private.live_session() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join public.profiles p on p.id=s.user_id
  where p.id=auth.uid() and p.active and s.id::text=(auth.jwt()->>'session_id')
    and s.created_at >= p.access_valid_after);
$$;
revoke all on function private.live_session() from public,anon;
grant execute on function private.live_session() to authenticated;
create or replace function private.member_of(p_workspace uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.live_session() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.workspace_id=p_workspace);
$$;
create or replace function private.manager_for(p_workspace uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.live_session() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.role='manager' and p.workspace_id=p_workspace);
$$;
drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using((private.live_session() and id=auth.uid()) or private.manager_for(workspace_id));
drop policy products_read on public.products;
create policy products_read on public.products for select to authenticated using(private.live_session());
drop policy categories_read on public.downtime_categories;
create policy categories_read on public.downtime_categories for select to authenticated using(private.live_session());
-- Privileged implementations stay outside the exposed public schema.
alter function public.save_workday(date,jsonb,integer) set schema private;
alter function private.save_workday(date,jsonb,integer) rename to save_workday_impl;
alter function public.manager_decide(uuid,date,integer,text,text) set schema private;
alter function private.manager_decide(uuid,date,integer,text,text) rename to manager_decide_impl;
revoke all on function private.save_workday_impl(date,jsonb,integer),private.manager_decide_impl(uuid,date,integer,text,text) from public,anon,authenticated;
create function private.save_workday_checked(p_date date,p_payload jsonb,p_expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not private.live_session() then raise exception 'Aktív bejelentkezés szükséges.' using errcode='42501'; end if;
 return private.save_workday_impl(p_date,p_payload,p_expected);
end; $$;
create function private.manager_decide_checked(p_employee uuid,p_date date,p_expected integer,p_action text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not private.live_session() then raise exception 'Aktív bejelentkezés szükséges.' using errcode='42501'; end if;
 return private.manager_decide_impl(p_employee,p_date,p_expected,p_action,p_reason);
end; $$;
create function public.save_workday(p_date date,p_payload jsonb,p_expected integer) returns jsonb
language sql security invoker set search_path='' as $$ select private.save_workday_checked(p_date,p_payload,p_expected); $$;
create function public.manager_decide(p_employee uuid,p_date date,p_expected integer,p_action text,p_reason text default '') returns jsonb
language sql security invoker set search_path='' as $$ select private.manager_decide_checked(p_employee,p_date,p_expected,p_action,p_reason); $$;
revoke all on function private.save_workday_checked(date,jsonb,integer),private.manager_decide_checked(uuid,date,integer,text,text),public.save_workday(date,jsonb,integer),public.manager_decide(uuid,date,integer,text,text) from public,anon;
grant execute on function private.save_workday_checked(date,jsonb,integer),private.manager_decide_checked(uuid,date,integer,text,text),public.save_workday(date,jsonb,integer),public.manager_decide(uuid,date,integer,text,text) to authenticated;
-- Disable/restore access without deleting records. Restoration needs a new login.
create function private.set_employee_access(p_employee uuid,p_active boolean,p_expected boolean,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.profiles; target public.profiles; before_active boolean;
begin
 if not private.live_session() then raise exception 'Aktív bejelentkezés szükséges.' using errcode='42501'; end if;
 select * into actor from public.profiles where id=auth.uid() and active and role='manager';
 if not found then raise exception 'Vezetői jogosultság szükséges.' using errcode='42501'; end if;
 if p_active is null or p_expected is null or p_reason is null or length(trim(p_reason))<3 or length(p_reason)>1000 then raise exception 'Állapot és 3–1000 karakteres indok szükséges.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('access:'||p_employee::text,0));
 select * into target from public.profiles where id=p_employee and workspace_id=actor.workspace_id and role='employee' for update;
 if not found then raise exception 'Nem elérhető dolgozói fiók.' using errcode='42501'; end if;
 if target.active<>p_expected then raise exception 'A fiók állapota változott. Frissíts.' using errcode='40001'; end if;
 if target.active=p_active then return jsonb_build_object('id',target.id,'active',target.active,'changed',false); end if;
 before_active=target.active;
 update public.profiles set active=p_active,access_valid_after=clock_timestamp() where id=target.id;
 insert into public.audit_events(workspace_id,employee_id,actor_id,actor_name,action,reason,before_data,after_data)
 values(actor.workspace_id,target.id,actor.id,actor.display_name,
 case when p_active then 'Dolgozói hozzáférés visszaállítva' else 'Dolgozói hozzáférés letiltva' end,
 trim(p_reason),jsonb_build_object('active',before_active),jsonb_build_object('active',p_active));
 return jsonb_build_object('id',target.id,'active',p_active,'changed',true);
end; $$;
create function public.set_employee_access(p_employee uuid,p_active boolean,p_expected boolean,p_reason text) returns jsonb
language sql security invoker set search_path='' as $$ select private.set_employee_access(p_employee,p_active,p_expected,p_reason); $$;
revoke all on function private.set_employee_access(uuid,boolean,boolean,text),public.set_employee_access(uuid,boolean,boolean,text) from public,anon;
grant execute on function private.set_employee_access(uuid,boolean,boolean,text),public.set_employee_access(uuid,boolean,boolean,text) to authenticated;
commit;
