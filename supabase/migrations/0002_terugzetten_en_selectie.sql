-- Willekeurige selectie bij Bedrijven zoeken en bedrijven terugzetten in de lijst.
-- Voer dit één keer uit in de SQL Editor, nadat 0001_leadsysteem.sql is uitgevoerd.

-- ---------------------------------------------------------------------------
-- Kolommen
-- ---------------------------------------------------------------------------

alter table public.leads
  add column archived_at timestamptz,
  add column archived_by uuid,
  add column archived_by_name text,
  add column archive_reason text,
  add column archive_note text,
  add column archived_company_id uuid references public.companies (id) on delete set null;

create index leads_archived_company_idx on public.leads (archived_company_id);

alter table public.companies
  add column release_count integer not null default 0,
  add column last_release_reason text;

-- ---------------------------------------------------------------------------
-- Beveiliging van leads
-- ---------------------------------------------------------------------------

-- Draait bewust met de rechten van de aanroeper. Rechtstreekse wijzigingen komen binnen
-- als 'authenticated'; de databasefuncties hieronder draaien als eigenaar van de tabel.
create or replace function public.guard_lead_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    if not public.is_master()
       and (new.owner_id is distinct from old.owner_id or new.company_id is distinct from old.company_id) then
      raise exception 'Alleen de master kan een lead toewijzen.';
    end if;
    if new.archived_at is distinct from old.archived_at
       or new.archived_by is distinct from old.archived_by
       or new.archived_by_name is distinct from old.archived_by_name
       or new.archive_reason is distinct from old.archive_reason
       or new.archive_note is distinct from old.archive_note
       or new.archived_company_id is distinct from old.archived_company_id then
      raise exception 'Terugzetten kan alleen via de knop Terugzetten in de lijst.';
    end if;
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

-- Bedrijven mogen niet rechtstreeks een andere teruggezet-status krijgen.
create function public.guard_company_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'authenticated'
     and (new.release_count is distinct from old.release_count
          or new.last_release_reason is distinct from old.last_release_reason) then
    raise exception 'Deze gegevens worden automatisch bijgehouden.';
  end if;
  return new;
end;
$$;

create trigger companies_guard_update
  before update on public.companies
  for each row execute function public.guard_company_update();

-- Gearchiveerde leads: alleen de master leest ze, en niemand wijzigt ze rechtstreeks.
drop policy leads_select on public.leads;
create policy leads_select on public.leads for select to authenticated
  using (public.is_master() or (public.is_active() and owner_id = auth.uid() and archived_at is null));

drop policy leads_insert on public.leads;
create policy leads_insert on public.leads for insert to authenticated
  with check (
    archived_at is null and archived_company_id is null
    and (public.is_master() or (public.is_active() and owner_id = auth.uid() and company_id is null))
  );

drop policy leads_update on public.leads;
create policy leads_update on public.leads for update to authenticated
  using (archived_at is null and (public.is_master() or (public.is_active() and owner_id = auth.uid())))
  with check (archived_at is null and (public.is_master() or (public.is_active() and owner_id = auth.uid())));

drop policy notes_insert on public.lead_notes;
create policy notes_insert on public.lead_notes for insert to authenticated
  with check (exists (select 1 from public.leads l where l.id = lead_id and l.archived_at is null));

drop policy notes_update on public.lead_notes;
create policy notes_update on public.lead_notes for update to authenticated
  using (
    (public.is_master() or author_id = auth.uid())
    and exists (select 1 from public.leads l where l.id = lead_id and l.archived_at is null)
  )
  with check (
    (public.is_master() or author_id = auth.uid())
    and exists (select 1 from public.leads l where l.id = lead_id and l.archived_at is null)
  );

drop policy notes_delete on public.lead_notes;
create policy notes_delete on public.lead_notes for delete to authenticated
  using (public.is_master() and exists (select 1 from public.leads l where l.id = lead_id and l.archived_at is null));

-- ---------------------------------------------------------------------------
-- Functies die de app aanroept
-- ---------------------------------------------------------------------------

-- Vervangt de oude versie: filters zijn optioneel, maar één filter is hier wel nodig,
-- en het aantal is beperkt zodat de browser nooit de hele lijst ontvangt.
drop function public.search_companies(text, text);
create function public.search_companies(p_province text default null, p_branch text default null)
returns table (
  id uuid, name text, city text, province text, branch text, phone text, website text,
  legal_form text, source text, consent text, do_not_call boolean,
  release_count integer, last_release_reason text,
  lead_id uuid, owner_id uuid, owner_name text, owner_status text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active() then
    raise exception 'Je account is niet actief.';
  end if;
  if nullif(p_province, '') is null and nullif(p_branch, '') is null then
    raise exception 'Kies minstens een provincie of branche.';
  end if;
  return query
    select c.id, c.name, c.city, c.province, c.branch,
           case when c.do_not_call then null else c.phone end,
           c.website, c.legal_form, c.source, c.consent, c.do_not_call,
           c.release_count, c.last_release_reason,
           case when l.owner_id = auth.uid() or public.is_master() then l.id end,
           l.owner_id, p.name, p.status
    from public.companies c
    left join public.leads l on l.company_id = c.id
    left join public.profiles p on p.id = l.owner_id
    where (nullif(p_province, '') is null or c.province = p_province)
      and (nullif(p_branch, '') is null or c.branch = p_branch)
    order by c.name
    limit 200;
end;
$$;

-- Willekeurige beschikbare bedrijven. Bedrijven in p_exclude komen pas terug als er
-- niet genoeg andere meer zijn.
create function public.random_companies(
  p_province text default null, p_branch text default null, p_exclude uuid[] default '{}', p_limit integer default 25
)
returns table (
  id uuid, name text, city text, province text, branch text, phone text, website text,
  legal_form text, source text, consent text, do_not_call boolean,
  release_count integer, last_release_reason text,
  lead_id uuid, owner_id uuid, owner_name text, owner_status text
)
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_active() then
    raise exception 'Je account is niet actief.';
  end if;
  return query
    select c.id, c.name, c.city, c.province, c.branch, c.phone,
           c.website, c.legal_form, c.source, c.consent, c.do_not_call,
           c.release_count, c.last_release_reason,
           null::uuid, null::uuid, null::text, null::text
    from public.companies c
    where not c.do_not_call
      and not exists (select 1 from public.leads l where l.company_id = c.id)
      and (nullif(p_province, '') is null or c.province = p_province)
      and (nullif(p_branch, '') is null or c.branch = p_branch)
    order by (c.id = any (coalesce(p_exclude, '{}'))), random()
    limit least(greatest(coalesce(p_limit, 25), 1), 25);
end;
$$;

-- Atomair: archiveert de lead en maakt het bedrijf in één keer weer vrij.
create function public.release_lead(p_lead uuid, p_reason text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target public.leads;
  actor text;
  note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
begin
  if not public.is_active() then
    raise exception 'Je account is niet actief.';
  end if;
  if p_reason is null or p_reason not in ('Niet bereikt', 'Verkeerde persoon gesproken', 'Geen interesse', 'Anders') then
    raise exception 'Kies een geldige reden.';
  end if;
  if p_reason = 'Anders' and note is null then
    raise exception 'Geef een toelichting bij Anders.';
  end if;
  select * into target from public.leads where id = p_lead for update;
  if not found or (target.owner_id <> auth.uid() and not public.is_master()) then
    raise exception 'Deze lead bestaat niet of is niet van jou.';
  end if;
  if target.archived_at is not null then
    raise exception 'Deze lead is al teruggezet.';
  end if;
  if target.company_id is null then
    raise exception 'Een handmatige lead kan niet worden teruggezet.';
  end if;
  select p.name into actor from public.profiles p where p.id = auth.uid();
  update public.companies
    set release_count = release_count + 1, last_release_reason = p_reason
    where id = target.company_id;
  update public.leads
    set archived_at = now(), archived_by = auth.uid(), archived_by_name = actor,
        archive_reason = p_reason, archive_note = note,
        archived_company_id = company_id, company_id = null
    where id = p_lead;
end;
$$;

revoke execute on function public.guard_company_update(), public.guard_lead_update(),
  public.search_companies(text, text),
  public.random_companies(text, text, uuid[], integer),
  public.release_lead(uuid, text, text) from anon, public;
grant execute on function public.search_companies(text, text),
  public.random_companies(text, text, uuid[], integer),
  public.release_lead(uuid, text, text) to authenticated;
