-- TEST ONLY: disposable PostgreSQL after bootstrap + access regression + migrations 05/06.
-- No Supabase Auth HTTP, no real users, no external network or Excel delivery.
grant usage on schema tests to service_role;
insert into public.workspaces(id,name) values(tests.uid(401),'Piszkozat teszt A'),(tests.uid(402),'Piszkozat teszt B');
insert into auth.users select tests.uid(i) from generate_series(301,323) i;
insert into auth.sessions select tests.sid(i),tests.uid(i),clock_timestamp() from generate_series(301,323) i;
insert into public.profiles(id,workspace_id,worker_code,display_name,role)
 select tests.uid(i),tests.uid(case when i<=321 then 401 else 402 end),'T'||i,'Kitalált próba '||i,
 case when i in(321,323) then 'manager' else 'employee' end from generate_series(301,323) i;
create function tests.payload(n integer) returns jsonb language sql immutable as $$
 select jsonb_build_object('counts',jsonb_build_object('product_3243',n),'downtime','{}'::jsonb,'workCentiMinutes',48000,'brazilCount',0,'spoiler','','note','Csak teszt');
$$;
select set_config('tests.draft_start',current_setting('tests.assertions'),false);
set role authenticated;
select tests.login(301);
do $$declare r jsonb;begin
 r=public.save_workday_draft('2026-11-02',tests.payload(3),0,tests.sid(10001));
 perform tests.assert(r->'workday'->>'status'='draft','save does NOT submit');
 perform tests.assert((r->'workday'->>'version')::int=1,'first draft version 1');
 perform tests.assert((r->'workday'->>'total_centi_minutes')::int=4914,'server recomputes exact norm');
 perform tests.assert(not (r->>'replayed')::boolean,'first write not replay');
 r=public.save_workday_draft('2026-11-02',tests.payload(3),0,tests.sid(10001));
 perform tests.assert((r->>'replayed')::boolean,'lost-response retry acknowledged');
 perform tests.assert((r->'workday'->>'version')::int=1,'retry does not increment version');
 perform tests.assert((select count(*)=1 from public.audit_events),'retry produces no duplicate audit');
 perform tests.assert((select generation=1 from public.report_jobs),'retry produces no duplicate individual report job');
 r=public.save_workday_draft('2026-11-02',tests.payload(5),1,tests.sid(10002));
 perform tests.assert((r->'workday'->>'total_centi_minutes')::int=8190,'second draft has five pieces');
 r=public.save_workday_draft('2026-11-02',tests.payload(3),0,tests.sid(10001));
 perform tests.assert((r->>'applied_version')::int=1 and (r->'workday'->>'version')::int=2,'replay includes current record, not stale snapshot');
end;$$;
select tests.denied(format('select public.save_workday_draft(''2026-11-02'',%L::jsonb,1,%L)',tests.payload(7),tests.sid(10003)),'stale second-device version rejected',array['40001']);
select tests.denied(format('select public.save_workday_draft(''2026-11-02'',%L::jsonb,0,%L)',tests.payload(9),tests.sid(10001)),'request UUID reuse with changed body denied',array['22023']);
select tests.denied(format('select public.save_workday_draft(''2026-11-02'',%L::jsonb,2,%L)',tests.payload(9)||jsonb_build_object('employee_id',tests.uid(302)),tests.sid(10004)),'client cannot set employee ID',array['22023']);
select tests.denied('select * from private.workday_requests','request receipts inaccessible directly');
select tests.assert((select count(*)=0 from public.team_workbook_jobs),'employee cannot see team workbook jobs');
select tests.denied('select public.read_team_workbook(''2026-11-01'')','employee cannot download everyone workbook');
select tests.denied(format('select public.submit_workday(''2026-11-03'',0,%L)',tests.sid(10010)),'cannot submit nonexistent draft',array['22023']);
do $$declare r jsonb;begin
 r=public.submit_workday('2026-11-02',2,tests.sid(10005));
 perform tests.assert(r->'workday'->>'status'='submitted','separate Submit freezes draft');
 perform tests.assert((r->'workday'->>'version')::int=3,'submit increments version');
 r=public.submit_workday('2026-11-02',2,tests.sid(10005));
 perform tests.assert((r->>'replayed')::boolean and (r->'workday'->>'version')::int=3,'submit retry is idempotent');
 perform tests.assert((select count(*)=3 from public.audit_events),'two draft saves and one submit audited once each');
end;$$;
select tests.denied(format('select public.save_workday_draft(''2026-11-02'',%L::jsonb,3,%L)',tests.payload(7),tests.sid(10006)),'new write to submitted day denied');
select tests.login(321);
select tests.assert((select count(*)=1 from public.workdays),'manager sees new draft/submitted workday');
select tests.denied(format('select public.save_workday_draft(''2026-11-02'',%L::jsonb,0,%L)',tests.payload(7),tests.sid(10007)),'manager cannot impersonate employee autosave');
select public.manager_decide(tests.uid(301),'2026-11-02',3,'reopen','Próba javítás');
select tests.login(301);
select public.save_workday_draft('2026-11-02',tests.payload(8),4,tests.sid(10006));
select tests.assert((select status='draft' and version=5 and total_centi_minutes=13104 from public.workdays),'reopened draft editable with current version');
-- Twenty employees: all write to the one month but can read only their own record.
do $$declare i int;r jsonb;begin
 for i in 302..320 loop
  perform tests.login(i);r=public.save_workday_draft('2026-11-02',tests.payload(i-300),0,tests.sid(11000+i));
  perform tests.assert(r->'workday'->>'employee_id'=tests.uid(i)::text,'write bound to authenticated identity '||i);
  perform tests.assert((select count(*)=1 from public.workdays),'one own day visible '||i);
  perform tests.assert(not exists(select 1 from public.workdays where employee_id=tests.uid(301)),'other worker hidden '||i);
 end loop;
end;$$;
select tests.login(323);
select tests.assert((select count(*)=0 from public.workdays),'other company manager sees no test A records');
select tests.login(321);
select tests.assert((select count(*)=20 from public.workdays),'manager sees all twenty employees');
select tests.assert((select count(*)=1 from public.team_workbook_jobs),'one shared monthly workbook job');
reset role;
select tests.assert((select count(*)=1 from public.team_workbook_jobs where workspace_id=tests.uid(401)),'one team/month key despite all saves');
set role service_role;
do $$declare s jsonb;g bigint;begin
 s=public.team_workbook_snapshot(tests.uid(401),'2026-11-01');g=(s->>'revision')::bigint;
 perform tests.assert(jsonb_array_length(s->'profiles')=20 and jsonb_array_length(s->'records')=20,'one coherent export snapshot for twenty workers');
 perform tests.assert(public.commit_team_workbook(tests.uid(401),'2026-11-01',g,'UEsDBA=='),'CAS accepts current generation fixture');
 perform set_config('tests.old_generation',g::text,false);
end;$$;
reset role;
set role authenticated;
select tests.login(303);
select public.save_workday_draft('2026-11-02',tests.payload(7),1,tests.sid(20001));
select tests.login(321);
select tests.assert(public.read_team_workbook('2026-11-01')->>'status'='pending','stale master is hidden until rebuilt');
reset role;
set role service_role;
select tests.assert(not public.commit_team_workbook(tests.uid(401),'2026-11-01',current_setting('tests.old_generation')::bigint,'UEsDBA=='),'late old exporter cannot replace new master');
do $$declare s jsonb;begin
 s=public.team_workbook_snapshot(tests.uid(401),'2026-11-01');
 perform tests.assert(public.commit_team_workbook(tests.uid(401),'2026-11-01',(s->>'revision')::bigint,'UEsDBA=='),'current master overwrites same row');
end;$$;
reset role;
select tests.assert((select count(*)=1 from private.team_workbook_files where workspace_id=tests.uid(401)),'still one canonical file row, not daily copies');
set role authenticated;
select tests.login(321);
select tests.assert(public.read_team_workbook('2026-11-01')->>'status'='ready','manager reads latest canonical generation');
select public.set_employee_access(tests.uid(301),false,true,'Csak teszt letiltás');
select tests.login(301);
select tests.denied(format('select public.save_workday_draft(''2026-11-02'',%L::jsonb,0,%L)',tests.payload(3),tests.sid(10001)),'disabled actor cannot replay old request');
reset role;
set role anon;
select tests.denied(format('select public.save_workday_draft(''2026-11-02'',%L::jsonb,0,%L)',tests.payload(3),tests.sid(10001)),'anonymous draft write denied');
select tests.denied(format('select public.submit_workday(''2026-11-02'',0,%L)',tests.sid(10001)),'anonymous submit denied');
reset role;
select tests.assert(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef),'all public RPC entry points are invoker, checked implementations private');
select 'PASS: '||(current_setting('tests.assertions')::int-current_setting('tests.draft_start')::int)||' draft/sync assertions; '||current_setting('tests.assertions')||' total database assertions' as result;
