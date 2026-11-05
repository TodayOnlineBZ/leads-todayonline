-- Moneybird-concepten en kwaliteitsvergelijking. Voer dit één keer uit in de SQL Editor. Bestaande gegevens blijven staan.
alter table public.proposals
  add column quality text not null default 'standaard',
  add column cost_usd numeric(8, 4),
  add column moneybird_status text check (moneybird_status in ('creating', 'draft')),
  add column moneybird_started_at timestamptz,
  add column moneybird_estimate_id text,
  add column moneybird_url text;
grant select (quality, cost_usd, moneybird_status, moneybird_estimate_id, moneybird_url) on public.proposals to authenticated;

alter table public.lead_proposal_events drop constraint lead_proposal_events_kind_check;
alter table public.lead_proposal_events add constraint lead_proposal_events_kind_check
  check (kind in ('created', 'finalized', 'unfinalized', 'moneybird_draft'));
