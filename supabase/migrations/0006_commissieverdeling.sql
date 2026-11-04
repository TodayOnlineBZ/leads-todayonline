-- Commissieverdeling (sales 20%, master 80%; eigen lead master 100%), atomair toewijzen,
-- en "Niet meer bellen" alleen voor de master.
-- Bekijk eerst supabase/controle/0006_controle_vooraf.sql. Voer dit één keer uit in de SQL Editor.

-- Aparte tabel: het aandeel van de master is voor salesmedewerkers niet op te halen.
create table public.lead_splits (
  lead_id uuid primary key references public.leads (id) on delete cascade,
  owner_id uuid not null,
  sales_percent numeric(5, 2) not null,
  sales_cents bigint not null,
  master_percent numeric(5, 2) not null,
  master_cents bigint not null,
  updated_at timestamptz not null default now(),
  check (sales_cents >= 0 and master_cents >= 0)
);
alter table public.lead_splits enable row level security;
create policy lead_splits_select on public.lead_splits for select to authenticated using (public.is_master());
revoke all on public.lead_splits from anon, public;
grant select on public.lead_splits to authenticated;

alter table public.lead_sale_events
  add column old_owner_name text,
  add column new_owner_name text,
  add column old_commission_cents bigint,
  add column new_commission_cents bigint;

-- Berekent de verdeling. De master krijgt de rest, dus de som is altijd het offertebedrag.
create function public.compute_split(p_amount bigint, p_owner uuid, p_existing_percent numeric default null)
returns table (sales_percent numeric, sales_cents bigint, master_percent numeric, master_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  pct numeric;
  sales bigint;
begin
  if (select p.role from public.profiles p where p.id = p_owner) = 'master' then
    pct := 0;
  else
    pct := coalesce(nullif(p_existing_percent, 0), public.current_commission_percent());
  end if;
  sales := round(p_amount::numeric * pct / 100);
  return query select pct::numeric, sales, (100 - pct)::numeric, p_amount - sales;
end;
$$;

-- Zet commissie en verdeling op de lead. p_existing_percent houdt een geaccepteerd percentage vast.
create function public.refresh_lead_split(p_lead uuid, p_existing_percent numeric default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  l public.leads;
  s record;
begin
  select * into l from public.leads where id = p_lead;
  if l.sale_status in ('Offerte verstuurd', 'Offerte geaccepteerd') then
    select * into s from public.compute_split(l.quote_amount_cents, l.owner_id, p_existing_percent);
    update public.leads set commission_percent = s.sales_percent, commission_cents = s.sales_cents where id = p_lead;
    insert into public.lead_splits (lead_id, owner_id, sales_percent, sales_cents, master_percent, master_cents)
      values (p_lead, l.owner_id, s.sales_percent, s.sales_cents, s.master_percent, s.master_cents)
      on conflict (lead_id) do update set owner_id = excluded.owner_id, sales_percent = excluded.sales_percent,
        sales_cents = excluded.sales_cents, master_percent = excluded.master_percent,
        master_cents = excluded.master_cents, updated_at = now();
  else
    update public.leads set commission_percent = null, commission_cents = null where id = p_lead;
    delete from public.lead_splits where lead_id = p_lead;
  end if;
end;
$$;

create or replace function public.set_lead_sale(p_lead uuid, p_status text, p_amount_cents bigint default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target public.leads;
  actor text;
  updated_commission bigint;
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
  update public.leads set sale_status = p_status, quote_amount_cents = p_amount_cents where id = p_lead;
  perform public.refresh_lead_split(p_lead,
    case when target.sale_status = 'Offerte geaccepteerd' and p_status = 'Offerte geaccepteerd' then target.commission_percent end);
  select commission_cents into updated_commission from public.leads where id = p_lead;
  select p.name into actor from public.profiles p where p.id = auth.uid();
  insert into public.lead_sale_events (lead_id, old_status, new_status, old_amount_cents, new_amount_cents, changed_by, changed_by_name, old_commission_cents, new_commission_cents)
    values (p_lead, target.sale_status, p_status, target.quote_amount_cents, p_amount_cents, auth.uid(), actor, target.commission_cents, updated_commission);
end;
$$;

-- Toont de master vooraf wat toewijzen verandert.
create function public.preview_assign(p_lead uuid, p_owner uuid)
returns table (old_sales_cents bigint, old_master_cents bigint, new_sales_cents bigint, new_master_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.leads;
begin
  if not public.is_master() then
    raise exception 'Alleen de master kan een lead toewijzen.';
  end if;
  select * into l from public.leads where id = p_lead;
  if not found then
    raise exception 'Deze lead bestaat niet.';
  end if;
  return query
    select sp.sales_cents, sp.master_cents, c.sales_cents, c.master_cents
    from public.compute_split(l.quote_amount_cents, p_owner,
           case when l.sale_status = 'Offerte geaccepteerd' then l.commission_percent end) c
    left join public.lead_splits sp on sp.lead_id = p_lead;
end;
$$;

-- Atomair: nieuwe eigenaar, nieuwe verdeling en een regel in de geschiedenis.
create function public.assign_lead(p_lead uuid, p_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target public.leads;
  actor text;
  old_name text;
  new_name text;
  updated_commission bigint;
begin
  if not public.is_master() then
    raise exception 'Alleen de master kan een lead toewijzen.';
  end if;
  select * into target from public.leads where id = p_lead for update;
  if not found then
    raise exception 'Deze lead bestaat niet.';
  end if;
  if target.archived_at is not null then
    raise exception 'Een teruggezette lead kan niet meer worden gewijzigd.';
  end if;
  select p.name into new_name from public.profiles p where p.id = p_owner and p.status = 'active';
  if new_name is null then
    raise exception 'Kies een actieve gebruiker.';
  end if;
  if target.owner_id = p_owner then
    return;
  end if;
  select p.name into old_name from public.profiles p where p.id = target.owner_id;
  select p.name into actor from public.profiles p where p.id = auth.uid();
  update public.leads set owner_id = p_owner where id = p_lead;
  perform public.refresh_lead_split(p_lead,
    case when target.sale_status = 'Offerte geaccepteerd' then target.commission_percent end);
  select commission_cents into updated_commission from public.leads where id = p_lead;
  insert into public.lead_sale_events (lead_id, old_status, new_status, old_amount_cents, new_amount_cents, changed_by, changed_by_name, old_owner_name, new_owner_name, old_commission_cents, new_commission_cents)
    values (p_lead, target.sale_status, target.sale_status, target.quote_amount_cents, target.quote_amount_cents, auth.uid(), actor, old_name, new_name, target.commission_cents, updated_commission);
end;
$$;

-- Niet meer bellen: alleen de master, in beide richtingen.
create or replace function public.set_do_not_call(p_company uuid, p_value boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_master() then
    raise exception 'Alleen de master kan deze status wijzigen.';
  end if;
  update public.companies set do_not_call = p_value where id = p_company;
end;
$$;

-- Toewijzen gaat voortaan alleen via assign_lead().
create or replace function public.guard_lead_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Toewijzen kan alleen via de functie voor toewijzen.';
    end if;
    if not public.is_master() and new.company_id is distinct from old.company_id then
      raise exception 'Alleen de master kan het bedrijf van een lead wijzigen.';
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

-- Bestaande offertes: ook teruggezette leads krijgen een verdeling, de 20% van sales blijft staan.
do $$
declare
  r record;
begin
  for r in select id, commission_percent from public.leads where sale_status in ('Offerte verstuurd', 'Offerte geaccepteerd') loop
    perform public.refresh_lead_split(r.id, r.commission_percent);
  end loop;
end;
$$;

revoke execute on function public.compute_split(bigint, uuid, numeric), public.refresh_lead_split(uuid, numeric) from anon, public, authenticated;
revoke execute on function public.preview_assign(uuid, uuid), public.assign_lead(uuid, uuid) from anon, public;
grant execute on function public.preview_assign(uuid, uuid), public.assign_lead(uuid, uuid) to authenticated;
