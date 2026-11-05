-- Versies per onderdeel van een voorstel. Voer dit één keer uit in de SQL Editor.
-- De huidige inhoud van voorstellen verandert niet; die wordt alleen als eerste versie vastgelegd.
create table public.proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  part text not null check (part in ('mvp', 'document')),
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed')),
  mvp_html text,
  document jsonb,
  wish text check (char_length(wish) <= 1000),
  quality text,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd numeric(8, 4),
  notes jsonb not null default '[]'::jsonb,
  error text,
  created_by_name text not null default 'Onbekend',
  created_at timestamptz not null default now()
);
create index proposal_versions_proposal_idx on public.proposal_versions (proposal_id, part, created_at desc);
-- Per onderdeel kan er maar één tegelijk worden gemaakt, ook bij gelijktijdige klikken.
create unique index proposal_versions_one_running on public.proposal_versions (proposal_id, part) where status = 'generating';
alter table public.proposal_versions enable row level security;
create policy proposal_versions_select on public.proposal_versions for select to authenticated using (public.is_master());
revoke all on public.proposal_versions from anon, public, authenticated;
-- De inhoud zelf gaat alleen via de server, net als bij voorstellen.
grant select (id, proposal_id, part, status, wish, quality, input_tokens, output_tokens, cost_usd, notes, error, created_by_name, created_at)
  on public.proposal_versions to authenticated;

alter table public.proposals
  add column current_mvp_version_id uuid references public.proposal_versions (id) on delete set null,
  add column current_document_version_id uuid references public.proposal_versions (id) on delete set null;
grant select (current_mvp_version_id, current_document_version_id) on public.proposals to authenticated;

insert into public.proposal_versions (proposal_id, part, status, mvp_html, quality, input_tokens, output_tokens, cost_usd, created_by_name, created_at)
  select pr.id, 'mvp', 'ready', pr.mvp_html, pr.quality, pr.input_tokens, pr.output_tokens, pr.cost_usd, coalesce(p.name, 'Onbekend'), pr.created_at
  from public.proposals pr left join public.profiles p on p.id = pr.created_by
  where pr.status = 'ready' and pr.mvp_html is not null;
insert into public.proposal_versions (proposal_id, part, status, document, created_by_name, created_at)
  select pr.id, 'document', 'ready', pr.document, coalesce(p.name, 'Onbekend'), pr.created_at
  from public.proposals pr left join public.profiles p on p.id = pr.created_by
  where pr.status = 'ready' and pr.document is not null;
update public.proposals pr set
  current_mvp_version_id = (select v.id from public.proposal_versions v where v.proposal_id = pr.id and v.part = 'mvp'),
  current_document_version_id = (select v.id from public.proposal_versions v where v.proposal_id = pr.id and v.part = 'document');

-- Ook een voorstel met Moneybird-concept ligt inhoudelijk vast.
create or replace function public.guard_final_proposal() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (old.finalized_at is not null or old.moneybird_status is not null) and (
    new.price_cents, new.discount_percent, new.final_cents, new.mvp_html, new.document, new.status, new.lead_id
  ) is distinct from (
    old.price_cents, old.discount_percent, old.final_cents, old.mvp_html, old.document, old.status, old.lead_id
  ) then
    raise exception 'Een definitief voorstel kan niet worden gewijzigd.';
  end if;
  return new;
end $$;

alter table public.lead_proposal_events drop constraint lead_proposal_events_kind_check;
alter table public.lead_proposal_events add constraint lead_proposal_events_kind_check
  check (kind in ('created', 'finalized', 'unfinalized', 'moneybird_draft', 'regenerated_mvp', 'regenerated_document', 'restored_mvp', 'restored_document'));
