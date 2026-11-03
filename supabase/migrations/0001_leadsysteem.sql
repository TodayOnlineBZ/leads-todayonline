-- TodayOnline leadsysteem: tabellen, triggers, functies en rechten.
-- Plak dit bestand in zijn geheel in de SQL Editor van Supabase en klik op Run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

-- Bewust geen foreign key naar auth.users: als een account wordt verwijderd,
-- blijft de naam bestaan zodat leads en notities leesbaar blijven.
create table public.profiles (
  id uuid primary key,
  name text not null,
  email text not null,
  role text not null default 'sales' check (role in ('sales', 'master')),
  status text not null default 'pending' check (status in ('pending', 'active', 'removed')),
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  city text not null check (btrim(city) <> ''),
  province text not null,
  branch text not null,
  phone text not null default '',
  website text not null default '',
  legal_form text not null check (btrim(legal_form) <> ''),
  source text not null check (btrim(source) <> ''),
  consent text not null default 'Nog te controleren',
  do_not_call boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index companies_name_city_key on public.companies (lower(name), lower(city));
create index companies_search_idx on public.companies (province, branch);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id),
  company_id uuid unique references public.companies (id) on delete set null,
  "values" jsonb not null default '{}'::jsonb
    check (btrim(coalesce("values" ->> 'organisatie', '')) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_owner_idx on public.leads (owner_id);

create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  author_id uuid not null,
  author_name text not null,
  body text not null check (btrim(body) <> ''),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index lead_notes_lead_idx on public.lead_notes (lead_id);

-- ---------------------------------------------------------------------------
-- Hulpfuncties voor de rechten
-- ---------------------------------------------------------------------------

create function public.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active');
$$;

create function public.is_master() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.status = 'active' and p.role = 'master');
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Elk nieuw account begint als salesmedewerker die op goedkeuring wacht.
-- De naam komt uit gebruikersinvoer; rol en status bewust nooit.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(nullif(left(btrim(new.raw_user_meta_data ->> 'name'), 100), ''), split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.guard_lead_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_master() then
    if new.owner_id is distinct from old.owner_id or new.company_id is distinct from old.company_id then
      raise exception 'Alleen de master kan een lead toewijzen.';
    end if;
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger leads_guard_update
  before update on public.leads
  for each row execute function public.guard_lead_update();

-- Auteur en tijd bepaalt de database, zodat niemand op naam van een ander schrijft.
create function public.prepare_note_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  author text;
begin
  select p.name into author from public.profiles p where p.id = auth.uid();
  if author is null then
    raise exception 'Onbekende gebruiker.';
  end if;
  new.author_id := auth.uid();
  new.author_name := author;
  new.created_at := now();
  new.edited_at := null;
  return new;
end;
$$;

create trigger lead_notes_prepare_insert
  before insert on public.lead_notes
  for each row execute function public.prepare_note_insert();

create function public.prepare_note_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.lead_id := old.lead_id;
  new.author_id := old.author_id;
  new.author_name := old.author_name;
  new.created_at := old.created_at;
  new.edited_at := now();
  return new;
end;
$$;

create trigger lead_notes_prepare_update
  before update on public.lead_notes
  for each row execute function public.prepare_note_update();

create function public.touch_lead_from_note() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.leads set updated_at = now() where id = coalesce(new.lead_id, old.lead_id);
  return null;
end;
$$;

create trigger lead_notes_touch_lead
  after insert or update or delete on public.lead_notes
  for each row execute function public.touch_lead_from_note();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.leads enable row level security;
alter table public.lead_notes enable row level security;

-- Profielen: iedereen ziet zichzelf, de master ziet iedereen.
-- Niemand behalve de master kan een rol of status wijzigen.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_master());
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_master()) with check (public.is_master());

-- Bedrijven: salesmedewerkers zoeken via search_companies() en lezen rechtstreeks
-- alleen de bedrijven van hun eigen leads. Schrijven doet alleen de master.
create policy companies_select on public.companies for select to authenticated
  using (
    public.is_master()
    or (public.is_active() and exists (
      select 1 from public.leads l where l.company_id = companies.id and l.owner_id = auth.uid()
    ))
  );
create policy companies_write on public.companies for all to authenticated
  using (public.is_master()) with check (public.is_master());

-- Leads: de eigenaar en de master. Een gekoppeld bedrijf komt alleen via claim_company().
create policy leads_select on public.leads for select to authenticated
  using (public.is_master() or (public.is_active() and owner_id = auth.uid()));
create policy leads_insert on public.leads for insert to authenticated
  with check (public.is_master() or (public.is_active() and owner_id = auth.uid() and company_id is null));
create policy leads_update on public.leads for update to authenticated
  using (public.is_master() or (public.is_active() and owner_id = auth.uid()))
  with check (public.is_master() or (public.is_active() and owner_id = auth.uid()));
create policy leads_delete on public.leads for delete to authenticated
  using (public.is_master());

-- Notities: zichtbaar bij leads die je mag zien (de subquery volgt het leadsbeleid).
create policy notes_select on public.lead_notes for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));
create policy notes_insert on public.lead_notes for insert to authenticated
  with check (exists (select 1 from public.leads l where l.id = lead_id));
create policy notes_update on public.lead_notes for update to authenticated
  using (public.is_master() or (author_id = auth.uid() and exists (select 1 from public.leads l where l.id = lead_id)))
  with check (public.is_master() or (author_id = auth.uid() and exists (select 1 from public.leads l where l.id = lead_id)));
create policy notes_delete on public.lead_notes for delete to authenticated
  using (public.is_master());

-- ---------------------------------------------------------------------------
-- Functies die de app aanroept
-- ---------------------------------------------------------------------------

-- Toont de status van een bedrijf zonder de inhoud van andermans lead prijs te geven.
-- Het nummer van een bedrijf dat niet meer gebeld wil worden, gaat niet naar de browser.
create function public.search_companies(p_province text, p_branch text)
returns table (
  id uuid, name text, city text, province text, branch text, phone text, website text,
  legal_form text, source text, consent text, do_not_call boolean,
  lead_id uuid, owner_id uuid, owner_name text, owner_status text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active() then
    raise exception 'Je account is niet actief.';
  end if;
  return query
    select c.id, c.name, c.city, c.province, c.branch,
           case when c.do_not_call then null else c.phone end,
           c.website, c.legal_form, c.source, c.consent, c.do_not_call,
           case when l.owner_id = auth.uid() or public.is_master() then l.id end,
           l.owner_id, p.name, p.status
    from public.companies c
    left join public.leads l on l.company_id = c.id
    left join public.profiles p on p.id = l.owner_id
    where c.province = p_province and c.branch = p_branch
    order by c.name;
end;
$$;

-- Atomair: als twee mensen tegelijk klikken, krijgt er precies een het bedrijf.
create function public.claim_company(p_company uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c public.companies;
  new_lead uuid;
begin
  if not public.is_active() then
    raise exception 'Je account is niet actief.';
  end if;
  select * into c from public.companies where id = p_company for update;
  if not found then
    raise exception 'Dit bedrijf bestaat niet meer.';
  end if;
  if c.do_not_call then
    raise exception 'Dit bedrijf wil niet meer gebeld worden.';
  end if;
  if exists (select 1 from public.leads where company_id = p_company) then
    raise exception 'Dit bedrijf is al in behandeling.';
  end if;
  insert into public.leads (owner_id, company_id, "values")
  values (auth.uid(), p_company, jsonb_build_object(
    'organisatie', c.name, 'telefoon', c.phone, 'site', c.website,
    'provincie', c.province, 'branche', c.branch
  ))
  returning id into new_lead;
  return new_lead;
end;
$$;

-- Niet meer bellen zetten mag bij een vrij bedrijf of je eigen lead; terugdraaien alleen de master.
create function public.set_do_not_call(p_company uuid, p_value boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  lead_owner uuid;
begin
  if not public.is_active() then
    raise exception 'Je account is niet actief.';
  end if;
  if not public.is_master() then
    if not p_value then
      raise exception 'Alleen de master kan deze status herstellen.';
    end if;
    select l.owner_id into lead_owner from public.leads l where l.company_id = p_company;
    if lead_owner is not null and lead_owner <> auth.uid() then
      raise exception 'Dit bedrijf is in behandeling bij een collega.';
    end if;
  end if;
  update public.companies set do_not_call = p_value where id = p_company;
end;
$$;

-- CSV-import door de master. Bestaande bedrijven (zelfde naam en plaats) worden overgeslagen.
create function public.import_companies(p_rows jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  inserted integer;
begin
  if not public.is_master() then
    raise exception 'Alleen de master kan bedrijven importeren.';
  end if;
  insert into public.companies (name, city, province, branch, phone, website, legal_form, source, consent)
  select r ->> 'name', r ->> 'city', r ->> 'province', r ->> 'branch',
         coalesce(r ->> 'phone', ''), coalesce(r ->> 'website', ''),
         r ->> 'legal_form', r ->> 'source',
         coalesce(nullif(r ->> 'consent', ''), 'Nog te controleren')
  from jsonb_array_elements(p_rows) as r
  on conflict do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rechten: alleen ingelogde gebruikers, en anon krijgt niets
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.companies, public.leads, public.lead_notes from anon, public;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.companies, public.leads, public.lead_notes to authenticated;

revoke execute on all functions in schema public from anon, public;
grant execute on function public.is_active(), public.is_master(),
  public.search_companies(text, text), public.claim_company(uuid),
  public.set_do_not_call(uuid, boolean), public.import_companies(jsonb)
  to authenticated;
