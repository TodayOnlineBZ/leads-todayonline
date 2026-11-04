-- Test voor definitieve voorstellen. Draai na rls_test_7.sql en 0008 op dezelfde lokale database.
\set ON_ERROR_STOP on
select set_config('test.aal', 'aal2', false);
do $$ begin
  assert (select count(*) from public.lead_proposal_events where kind = 'created') = 1, 'bestaand voorstel staat in het logboek';
end $$;
insert into public.proposals (lead_id, slug, status, price_cents, final_cents, expires_at, created_by)
  select lead_id, 'tweede-abc', 'generating', 300000, 270000, now() + interval '30 days', created_by from public.proposals where slug = 'geheim-abc';
insert into public.proposals (lead_id, slug, status, price_cents, final_cents, expires_at, created_by)
  select lead_id, 'verlopen-abc', 'ready', 300000, 270000, now() - interval '1 day', created_by from public.proposals where slug = 'geheim-abc';
update public.proposals set status = 'ready', mvp_html = 'x' where slug = 'tweede-abc';
do $$ begin
  assert (select count(*) from public.lead_proposal_events pe join public.proposals p on p.id = pe.proposal_id where p.slug = 'tweede-abc' and kind = 'created') = 1, 'klaar wordt gelogd';
end $$;

set role anon;
select public.expect_denied($$select public.finalize_proposal('00000000-0000-0000-0000-000000000000')$$, 'anon maakt definitief');
select public.expect_denied($$select * from public.lead_proposal_events$$, 'anon leest logboek');
reset role;

select id as geheim from public.proposals where slug = 'geheim-abc' \gset
select id as tweede from public.proposals where slug = 'tweede-abc' \gset
select id as verlopen from public.proposals where slug = 'verlopen-abc' \gset

set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000041', false);
select public.expect_denied(format('select public.finalize_proposal(%L)', :'geheim'), 'sales maakt definitief');
do $$ begin assert (select count(*) from public.lead_proposal_events) = 0, 'sales ziet geen logboek'; end $$;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
select set_config('test.aal', 'aal1', false);
select public.expect_denied(format('select public.finalize_proposal(%L)', :'geheim'), 'master zonder 2FA');
select set_config('test.aal', 'aal2', false);
select public.expect_denied(format('select public.finalize_proposal(%L)', :'verlopen'), 'verlopen voorstel');
select public.finalize_proposal(:'geheim');
select public.finalize_proposal(:'geheim');
select public.expect_denied(format('select public.finalize_proposal(%L)', :'tweede'), 'tweede zonder bevestiging');
select public.expect_denied(format($q$update public.proposals set finalized_at = now() where id = %L$q$, :'tweede'), 'rechtstreeks definitief');
do $$ begin assert (select count(*) from public.proposals where finalized_at is not null) = 1, 'één definitief'; end $$;
reset role;

select public.expect_denied(format($q$update public.proposals set price_cents = 1 where id = %L$q$, :'geheim'), 'prijs van definitief wijzigen, ook als server');
select public.expect_denied(format($q$update public.proposals set mvp_html = 'anders' where id = %L$q$, :'geheim'), 'MVP van definitief wijzigen, ook als server');
update public.proposals set expires_at = now() + interval '60 days' where id = :'geheim';
select public.expect_denied(format($q$update public.proposals set finalized_at = now() where id = %L$q$, :'tweede'), 'tweede definitief via index');

set role authenticated;
select public.finalize_proposal(:'tweede', true);
do $$ begin
  assert (select slug from public.proposals where finalized_at is not null) = 'tweede-abc', 'vervangen werkt';
  assert (select finalized_by_name from public.proposals where slug = 'tweede-abc') = 'Bart', 'naam komt uit de database';
  assert (select count(*) from public.lead_proposal_events where kind = 'finalized') = 2, 'definitief gelogd';
  assert (select count(*) from public.lead_proposal_events where kind = 'unfinalized') = 1, 'vervanging gelogd';
end $$;
reset role;
select 'TESTS DEFINITIEF VOORSTEL GESLAAGD' as resultaat;
