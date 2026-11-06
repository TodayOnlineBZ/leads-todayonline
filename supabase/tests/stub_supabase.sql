-- Alleen voor lokale tests: bootst de onderdelen van Supabase na die de migratie nodig heeft.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- 2FA-niveau van de sessie: standaard aal2, zodat oudere tests hetzelfde blijven werken.
create function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object('aal', coalesce(nullif(current_setting('test.aal', true), ''), 'aal2'));
$$;
grant execute on function auth.jwt() to anon, authenticated;

-- Opslag van Supabase, voor de test van aangeleverde bestanden.
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
