-- Instellingen: e-mailadres gelijk houden en foute wachtwoordpogingen beperken.
-- Voer dit één keer uit in de SQL Editor. Bestaande gegevens blijven staan.
create function public.sync_profile_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return null;
end $$;
revoke all on function public.sync_profile_email() from public, anon, authenticated;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email and new.email is not null)
  execute function public.sync_profile_email();
update public.profiles p set email = u.email
  from auth.users u where p.id = u.id and u.email is not null and p.email is distinct from u.email;

-- Alleen de server gebruikt deze tabel; gebruikers kunnen er niet bij.
create table public.password_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index password_attempts_user_idx on public.password_attempts (user_id, created_at);
alter table public.password_attempts enable row level security;
revoke all on public.password_attempts from anon, public, authenticated;
