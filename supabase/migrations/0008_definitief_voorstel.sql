-- Definitief voorstel en logboek. Voer dit één keer uit in de SQL Editor. Bestaande gegevens blijven staan.
alter table public.proposals
  add column finalized_at timestamptz,
  add column finalized_by_name text;
grant select (finalized_at, finalized_by_name) on public.proposals to authenticated;
-- Per lead kan maar één voorstel definitief zijn; dit vangt ook gelijktijdige klikken af.
create unique index proposals_one_final_per_lead on public.proposals (lead_id) where finalized_at is not null;

create table public.lead_proposal_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  kind text not null check (kind in ('created', 'finalized', 'unfinalized')),
  price_cents bigint,
  final_cents bigint,
  actor_name text not null,
  created_at timestamptz not null default now()
);
create index lead_proposal_events_lead_idx on public.lead_proposal_events (lead_id);
alter table public.lead_proposal_events enable row level security;
create policy proposal_events_select on public.lead_proposal_events for select to authenticated using (public.is_master());
revoke all on public.lead_proposal_events from anon, public, authenticated;
grant select on public.lead_proposal_events to authenticated;

-- Voorstellen die al klaar waren komen ook in het logboek.
insert into public.lead_proposal_events (lead_id, proposal_id, kind, price_cents, final_cents, actor_name, created_at)
  select pr.lead_id, pr.id, 'created', pr.price_cents, pr.final_cents, coalesce(p.name, 'Onbekend'), pr.created_at
  from public.proposals pr left join public.profiles p on p.id = pr.created_by
  where pr.status = 'ready';

create function public.log_proposal_ready() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.lead_proposal_events (lead_id, proposal_id, kind, price_cents, final_cents, actor_name)
  values (new.lead_id, new.id, 'created', new.price_cents, new.final_cents,
          coalesce((select p.name from public.profiles p where p.id = new.created_by), 'Onbekend'));
  return null;
end $$;
revoke all on function public.log_proposal_ready() from public, anon, authenticated;
create trigger proposals_log_ready after update of status on public.proposals
  for each row when (old.status is distinct from 'ready' and new.status = 'ready')
  execute function public.log_proposal_ready();

-- De inhoud van een definitief voorstel ligt vast, ook voor de server. De link verlengen of uitzetten mag wel.
create function public.guard_final_proposal() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.finalized_at is not null and (
    new.price_cents, new.discount_percent, new.final_cents, new.mvp_html, new.document, new.status, new.lead_id
  ) is distinct from (
    old.price_cents, old.discount_percent, old.final_cents, old.mvp_html, old.document, old.status, old.lead_id
  ) then
    raise exception 'Een definitief voorstel kan niet worden gewijzigd.';
  end if;
  return new;
end $$;
revoke all on function public.guard_final_proposal() from public, anon, authenticated;
create trigger proposals_guard_final before update on public.proposals
  for each row execute function public.guard_final_proposal();

create function public.finalize_proposal(p_id uuid, p_replace boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.proposals;
  other public.proposals;
  actor text;
begin
  if not public.is_master() then raise exception 'Geen toegang.'; end if;
  select * into v from public.proposals where id = p_id;
  if not found then raise exception 'Voorstel niet gevonden.'; end if;
  perform 1 from public.leads where id = v.lead_id for update;
  select * into v from public.proposals where id = p_id for update;
  if v.finalized_at is not null then return; end if;
  if v.status <> 'ready' or v.disabled_at is not null or v.expires_at <= now() then
    raise exception 'Alleen een geldig, afgerond voorstel kan definitief worden.';
  end if;
  actor := coalesce((select p.name from public.profiles p where p.id = auth.uid()), 'Onbekend');
  select * into other from public.proposals where lead_id = v.lead_id and finalized_at is not null;
  if found then
    if not p_replace then raise exception 'Er is al een definitief voorstel.'; end if;
    update public.proposals set finalized_at = null, finalized_by_name = null where id = other.id;
    insert into public.lead_proposal_events (lead_id, proposal_id, kind, price_cents, final_cents, actor_name)
    values (other.lead_id, other.id, 'unfinalized', other.price_cents, other.final_cents, actor);
  end if;
  update public.proposals set finalized_at = now(), finalized_by_name = actor where id = v.id;
  insert into public.lead_proposal_events (lead_id, proposal_id, kind, price_cents, final_cents, actor_name)
  values (v.lead_id, v.id, 'finalized', v.price_cents, v.final_cents, actor);
end $$;
revoke all on function public.finalize_proposal(uuid, boolean) from public, anon;
grant execute on function public.finalize_proposal(uuid, boolean) to authenticated;
