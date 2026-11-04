-- Gegenereerde voorstellen: MVP en uitwerking per lead, met einddatum.
-- Voer dit één keer uit in de SQL Editor. Bestaande gegevens veranderen niet.
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  slug text not null unique,
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed')),
  price_cents bigint not null check (price_cents > 0),
  discount_percent numeric(5, 2) not null default 10,
  final_cents bigint not null check (final_cents > 0),
  mvp_html text,
  document jsonb,
  error text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  expires_at timestamptz not null,
  disabled_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index proposals_lead_idx on public.proposals (lead_id);
alter table public.proposals enable row level security;

-- Alleen de master leest dit. Schrijven en de openbare pagina lopen via de server.
-- Geen beleid voor schrijven en geen rechten voor anon: de link werkt alleen via de app.
create policy proposals_select on public.proposals for select to authenticated using (public.is_master());
revoke all on public.proposals from anon, public, authenticated;
grant select (id, lead_id, slug, status, price_cents, discount_percent, final_cents, document, error, input_tokens, output_tokens, expires_at, disabled_at, last_viewed_at, view_count, created_at)
  on public.proposals to authenticated;
