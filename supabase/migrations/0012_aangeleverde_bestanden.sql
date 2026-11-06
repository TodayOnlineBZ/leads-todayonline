-- Aangeleverde bestanden per lead, in een afgeschermde opslag. Voer dit één keer uit in de SQL Editor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lead-files', 'lead-files', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf', 'application/zip', 'application/x-zip-compressed']);

-- Eigenaar van een lopende lead of de master; is_active en is_master eisen ook 2FA.
create function public.can_access_lead(p_lead uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_master() or (public.is_active() and exists (
    select 1 from public.leads l where l.id = p_lead and l.owner_id = auth.uid() and l.archived_at is null
  ));
$$;
create function public.can_access_lead_path(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
    then public.can_access_lead(split_part(p_name, '/', 1)::uuid) else false end;
$$;
revoke all on function public.can_access_lead(uuid), public.can_access_lead_path(text) from public, anon;
grant execute on function public.can_access_lead(uuid), public.can_access_lead_path(text) to authenticated;

create policy lead_files_read on storage.objects for select to authenticated using (bucket_id = 'lead-files' and public.can_access_lead_path(name));
create policy lead_files_add on storage.objects for insert to authenticated with check (bucket_id = 'lead-files' and public.can_access_lead_path(name));
create policy lead_files_remove on storage.objects for delete to authenticated using (bucket_id = 'lead-files' and public.can_access_lead_path(name));

create table public.lead_files (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  path text not null unique,
  size_bytes bigint not null check (size_bytes >= 0),
  mime_type text not null,
  kind text not null default 'foto' check (kind in ('foto', 'logo', 'zip', 'overig')),
  uploaded_by uuid not null default auth.uid(),
  uploaded_by_name text not null default 'Onbekend',
  created_at timestamptz not null default now(),
  check (path like lead_id::text || '/%')
);
create index lead_files_lead_idx on public.lead_files (lead_id, created_at desc);
alter table public.lead_files enable row level security;
create policy lead_files_select on public.lead_files for select to authenticated using (public.can_access_lead(lead_id));
create policy lead_files_insert on public.lead_files for insert to authenticated with check (public.can_access_lead(lead_id) and uploaded_by = auth.uid());
create policy lead_files_update on public.lead_files for update to authenticated using (public.can_access_lead(lead_id)) with check (public.can_access_lead(lead_id));
create policy lead_files_delete on public.lead_files for delete to authenticated using (public.can_access_lead(lead_id));
revoke all on public.lead_files from anon, public, authenticated;
grant select, delete on public.lead_files to authenticated;
grant insert (lead_id, name, path, size_bytes, mime_type, kind) on public.lead_files to authenticated;
grant update (kind) on public.lead_files to authenticated;

-- De naam komt uit het profiel en kan dus niet worden vervalst.
create function public.lead_files_set_author() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Bij een ingelogde gebruiker; de server geeft zelf de naam van de uploader mee.
  if auth.uid() is not null then
    new.uploaded_by := auth.uid();
    new.uploaded_by_name := coalesce((select p.name from public.profiles p where p.id = auth.uid()), 'Onbekend');
  end if;
  return new;
end $$;
revoke all on function public.lead_files_set_author() from public, anon, authenticated;
create trigger lead_files_author before insert on public.lead_files for each row execute function public.lead_files_set_author();
