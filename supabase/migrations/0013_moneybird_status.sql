-- Verkoopstatus automatisch bijwerken vanuit Moneybird (verstuurd, geaccepteerd, afgewezen).
-- Voer dit één keer uit in de SQL Editor, nadat 0012_aangeleverde_bestanden.sql is uitgevoerd.
-- Er gaan geen gegevens verloren.

-- Een automatische wijziging heeft geen gebruiker; de naam blijft wel bewaard.
alter table public.lead_sale_events alter column changed_by drop not null;

alter table public.proposals
  add column moneybird_state text,
  add column moneybird_state_at timestamptz;
grant select (moneybird_state, moneybird_state_at) on public.proposals to authenticated;

alter table public.lead_proposal_events drop constraint lead_proposal_events_kind_check;
alter table public.lead_proposal_events add constraint lead_proposal_events_kind_check
  check (kind in ('created', 'finalized', 'unfinalized', 'moneybird_draft', 'regenerated_mvp', 'regenerated_document', 'restored_mvp', 'restored_document', 'moneybird_sent', 'moneybird_accepted', 'moneybird_rejected'));

-- Alleen de server gebruikt deze tabel; gebruikers kunnen er niet bij.
create table public.moneybird_webhooks (
  id text primary key,
  token text not null,
  url text not null,
  created_at timestamptz not null default now()
);
alter table public.moneybird_webhooks enable row level security;
revoke all on public.moneybird_webhooks from anon, public, authenticated;

-- Verwerkt de stand van een offerte in Moneybird. De status gaat alleen vooruit:
-- een handmatig gekozen latere status wordt nooit teruggezet.
create function public.apply_moneybird_state(p_proposal uuid, p_state text, p_amount_cents bigint default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  p public.proposals;
  l public.leads;
  old_group text;
  new_group text;
  target text;
  old_rank int;
  new_rank int;
  amount bigint;
  updated_commission bigint;
  ranks constant jsonb := '{"Nog geen contact":0,"Contact gemaakt":1,"Offerte verstuurd":2,"Offerte geaccepteerd":3,"Afgewezen":3}';
begin
  select * into p from public.proposals where id = p_proposal for update;
  if not found then return 'onbekend'; end if;
  if p.moneybird_state is not distinct from p_state then return 'ongewijzigd'; end if;
  old_group := case when p.moneybird_state in ('open', 'late') then 'sent' when p.moneybird_state in ('accepted', 'billed') then 'accepted' when p.moneybird_state = 'rejected' then 'rejected' end;
  new_group := case when p_state in ('open', 'late') then 'sent' when p_state in ('accepted', 'billed') then 'accepted' when p_state = 'rejected' then 'rejected' end;
  update public.proposals set moneybird_state = p_state, moneybird_state_at = now() where id = p.id;
  if new_group is null or new_group is not distinct from old_group then return 'opgeslagen'; end if;
  insert into public.lead_proposal_events (lead_id, proposal_id, kind, price_cents, final_cents, actor_name)
    values (p.lead_id, p.id, 'moneybird_' || new_group, p.price_cents, p.final_cents, 'Moneybird');

  target := case new_group when 'sent' then 'Offerte verstuurd' when 'accepted' then 'Offerte geaccepteerd' else 'Afgewezen' end;
  select * into l from public.leads where id = p.lead_id for update;
  if not found or l.archived_at is not null then return 'lead niet actief'; end if;
  old_rank := (ranks ->> l.sale_status)::int;
  new_rank := (ranks ->> target)::int;
  if l.sale_status = target or new_rank < old_rank or (new_rank = old_rank and new_rank < 3) then return 'status blijft'; end if;
  amount := case when target = 'Afgewezen' then l.quote_amount_cents else coalesce(nullif(p_amount_cents, 0), l.quote_amount_cents, p.final_cents) end;
  update public.leads set sale_status = target, quote_amount_cents = amount where id = l.id;
  perform public.refresh_lead_split(l.id, null);
  select commission_cents into updated_commission from public.leads where id = l.id;
  insert into public.lead_sale_events (lead_id, old_status, new_status, old_amount_cents, new_amount_cents, changed_by, changed_by_name, old_commission_cents, new_commission_cents)
    values (l.id, l.sale_status, target, l.quote_amount_cents, amount, null, 'Moneybird (automatisch)', l.commission_cents, updated_commission);
  return 'bijgewerkt';
end;
$$;
revoke all on function public.apply_moneybird_state(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.apply_moneybird_state(uuid, text, bigint) to service_role;
