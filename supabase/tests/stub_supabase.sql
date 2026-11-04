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
