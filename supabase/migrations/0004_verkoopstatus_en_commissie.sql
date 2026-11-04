-- Verkoopstatus, offertebedrag en commissie per lead.
-- Voer dit één keer uit in de SQL Editor, nadat 0003_filters_naam_rechtsvorm.sql is uitgevoerd.
-- Bestaande leads krijgen de status "Nog geen contact". Er gaan geen gegevens verloren.

alter table public.leads
  add column sale_status text not null default 'Nog geen contact'
    check (sale_status in ('Nog geen contact', 'Contact gemaakt', 'Offerte verstuurd', 'Offerte geaccepteerd', 'Afgewezen')),
  add column quote_amount_cents bigint check (quote_amount_cents > 0),
  add column commission_percent numeric(5, 2),
  add column commission_cents bigint,
  add constraint leads_quote_required
    check (sale_status not in ('Offerte verstuurd', 'Offerte geaccepteerd') or quote_amount_cents is not null);

create index leads_sale_status_idx on public.leads (sale_status);

-- Geschiedenis: alleen de master leest dit, en alleen de functie hieronder schrijft.
create table public.lead_sale_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  old_status text not null,
  new_status text not null,
  old_amount_cents bigint,
  new_amount_cents bigint,
  changed_by uuid not null,
  changed_by_name text not null,
  created_at timestamptz not null default now()
);
create index lead_sale_events_lead_idx on public.lead_sale_events (lead_id);
alter table public.lead_sale_events enable row level security;
create policy sale_events_select on public.lead_sale_events for select to authenticated
  using (public.is_master());
revoke all on public.lead_sale_events from anon, public;
grant select on public.lead_sale_events to authenticated;

-- Het percentage staat hier, zodat de pagina het niet kan beïnvloeden. Bij een nieuw percentage
-- vervang je deze functie; geaccepteerde offertes houden hun opgeslagen percentage.
create function public.current_commission_percent() returns numeric
language sql immutable set search_path = '' as $$ select 20.00::numeric $$;

-- Status en bedrag gaan alleen via set_lead_sale(), ook voor de master.
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
    if new.sale_status is distinct from old.sale_status
       or new.quote_amount_cents is distinct from old.quote_amount_cents
       or new.commission_percent is distinct from old.commission_percent
       or new.commission_cents is distinct from old.commission_cents then
      raise exception 'De verkoopstatus kan alleen de master wijzigen.';
    end if;
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

drop policy leads_insert on public.leads;
create policy leads_insert on public.leads for insert to authenticated
  with check (
    archived_at is null and archived_company_id is null
    and sale_status = 'Nog geen contact' and quote_amount_cents is null
    and commission_percent is null and commission_cents is null
    and (public.is_master() or (public.is_active() and owner_id = auth.uid() and company_id is null))
  );

-- Bewaart status en bedrag, berekent de commissie en legt de wijziging vast.
create function public.set_lead_sale(p_lead uuid, p_status text, p_amount_cents bigint default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target public.leads;
  actor text;
  pct numeric(5, 2);
  commission bigint;
begin
  if not public.is_master() then
    raise exception 'Alleen de master kan de verkoopstatus wijzigen.';
  end if;
  if p_status is null or p_status not in ('Nog geen contact', 'Contact gemaakt', 'Offerte verstuurd', 'Offerte geaccepteerd', 'Afgewezen') then
    raise exception 'Kies een geldige status.';
  end if;
  if p_amount_cents is not null and p_amount_cents <= 0 then
    raise exception 'Het offertebedrag moet hoger zijn dan nul.';
  end if;
  if p_status in ('Offerte verstuurd', 'Offerte geaccepteerd') and p_amount_cents is null then
    raise exception 'Vul eerst het offertebedrag in.';
  end if;
  select * into target from public.leads where id = p_lead for update;
  if not found then
    raise exception 'Deze lead bestaat niet.';
  end if;
  if target.archived_at is not null then
    raise exception 'Een teruggezette lead kan niet meer worden gewijzigd.';
  end if;
  if target.sale_status = p_status and target.quote_amount_cents is not distinct from p_amount_cents then
    return;
  end if;
  if p_status = 'Offerte geaccepteerd' then
    -- Een al geaccepteerde offerte houdt haar percentage, ook als het bedrag wordt gecorrigeerd.
    pct := case when target.sale_status = 'Offerte geaccepteerd' then coalesce(target.commission_percent, public.current_commission_percent())
                else public.current_commission_percent() end;
  elsif p_status = 'Offerte verstuurd' then
    pct := public.current_commission_percent();
  end if;
  if pct is not null then
    commission := round(p_amount_cents::numeric * pct / 100);
  end if;
  select p.name into actor from public.profiles p where p.id = auth.uid();
  update public.leads
    set sale_status = p_status, quote_amount_cents = p_amount_cents, commission_percent = pct, commission_cents = commission
    where id = p_lead;
  insert into public.lead_sale_events (lead_id, old_status, new_status, old_amount_cents, new_amount_cents, changed_by, changed_by_name)
    values (p_lead, target.sale_status, p_status, target.quote_amount_cents, p_amount_cents, auth.uid(), actor);
end;
$$;

-- Zelfde als in 0002, maar een lopende offerte kan niet meer worden teruggezet.
create or replace function public.release_lead(p_lead uuid, p_reason text, p_note text default null) returns void
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
  if target.sale_status in ('Offerte verstuurd', 'Offerte geaccepteerd') then
    raise exception 'Wijzig eerst de verkoopstatus van deze lead.';
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

revoke execute on function public.current_commission_percent(), public.set_lead_sale(uuid, text, bigint) from anon, public;
grant execute on function public.set_lead_sale(uuid, text, bigint) to authenticated;
