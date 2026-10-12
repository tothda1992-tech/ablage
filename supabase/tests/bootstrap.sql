-- TEST ONLY: empty disposable PostgreSQL, NEVER a real Supabase project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb; $$;
grant usage on schema auth,public,storage to anon,authenticated,service_role;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
alter table storage.objects enable row level security;
grant select on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]; $$;
create schema tests;
grant usage on schema tests to authenticated,anon;
create function tests.assert(ok boolean,label text) returns void language plpgsql security invoker as $$
begin
 if ok is distinct from true then raise exception 'FAILED: %',label; end if;
 perform set_config('tests.assertions',(coalesce(nullif(current_setting('tests.assertions',true),''),'0')::integer+1)::text,false);
end; $$;
create function tests.denied(statement text,label text,codes text[] default array['42501']) returns void language plpgsql security invoker as $$
declare failed boolean=false;
begin
 begin execute statement;
 exception when others then
  if not sqlstate=any(codes) then raise exception 'WRONG DENIAL: % / % / %',label,sqlstate,sqlerrm; end if;
  failed=true;
 end;
 perform tests.assert(failed,label);
end; $$;
create function tests.uid(n integer) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid; $$;
create function tests.sid(n integer) returns uuid language sql immutable as $$ select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid; $$;
create function tests.login(n integer,s integer default null) returns void language plpgsql security invoker as $$
begin
 perform set_config('request.jwt.claim.sub',tests.uid(n)::text,false);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',tests.uid(n),'session_id',tests.sid(coalesce(s,n)))::text,false);
end; $$;
