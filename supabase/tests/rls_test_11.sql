-- Test voor versies. Draai na rls_test_10.sql en 0011 op dezelfde lokale database.
\set ON_ERROR_STOP on
select set_config('test.aal', 'aal2', false);
do $$ begin
  assert (select count(*) from public.proposal_versions where part = 'mvp') >= 1, 'bestaande MVP is eerste versie';
  assert (select count(*) from public.proposals p where p.status = 'ready' and p.mvp_html is not null and p.current_mvp_version_id is null) = 0, 'huidige versie is ingesteld';
end $$;
select id as open_id, lead_id as lid from public.proposals where finalized_at is null and status = 'ready' limit 1 \gset
select id as final_id from public.proposals where finalized_at is not null limit 1 \gset
insert into public.proposal_versions (proposal_id, part, mvp_html) values (:'open_id', 'mvp', 'geheim');
select public.expect_denied(format($q$insert into public.proposal_versions (proposal_id, part) values (%L, 'mvp')$q$, :'open_id'), 'tweede tegelijk');
insert into public.proposal_versions (proposal_id, part) values (:'open_id', 'document');
update public.proposal_versions set status = 'failed' where proposal_id = :'open_id' and status = 'generating';
select public.expect_denied(format($q$insert into public.proposal_versions (proposal_id, part, wish) values (%L, 'mvp', repeat('x', 1001))$q$, :'open_id'), 'te lange wens');
insert into public.lead_proposal_events (lead_id, proposal_id, kind, actor_name) values (:'lid', :'open_id', 'restored_mvp', 'Bart');
select public.expect_denied(format($q$update public.proposals set mvp_html = 'anders' where id = %L$q$, :'final_id'), 'definitief ligt vast');
update public.proposals set moneybird_status = 'draft' where id = :'open_id';
select public.expect_denied(format($q$update public.proposals set document = '{}' where id = %L$q$, :'open_id'), 'concept ligt vast');
update public.proposals set expires_at = now() + interval '14 days' where id = :'open_id';
update public.proposals set moneybird_status = null where id = :'open_id';
update public.proposals set mvp_html = 'nieuw' where id = :'open_id';

set role anon;
select public.expect_denied($$select id from public.proposal_versions$$, 'anon leest versies');
reset role;
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000041', false);
do $$ begin assert (select count(id) from public.proposal_versions) = 0, 'sales ziet geen versies'; end $$;
select public.expect_denied($$select mvp_html from public.proposal_versions$$, 'sales leest inhoud');
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin assert (select count(id) from public.proposal_versions) >= 2, 'master ziet versies'; end $$;
select public.expect_denied($$select mvp_html from public.proposal_versions$$, 'inhoud alleen via de server');
select public.expect_denied(format($q$insert into public.proposal_versions (proposal_id, part) values (%L, 'mvp')$q$, :'open_id'), 'master schrijft rechtstreeks');
select public.expect_denied($$delete from public.proposal_versions$$, 'master verwijdert rechtstreeks');
select set_config('test.aal', 'aal1', false);
do $$ begin assert (select count(id) from public.proposal_versions) = 0, 'zonder 2FA niets'; end $$;
reset role;
select 'TESTS VERSIES GESLAAGD' as resultaat;
