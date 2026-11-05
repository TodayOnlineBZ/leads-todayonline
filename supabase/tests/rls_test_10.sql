-- Test voor Moneybird-velden. Draai na rls_test_9.sql en 0010 op dezelfde lokale database.
\set ON_ERROR_STOP on
select set_config('test.aal', 'aal2', false);
select id as pid, lead_id as lid from public.proposals where finalized_at is not null \gset
update public.proposals set moneybird_status = 'draft', moneybird_estimate_id = '1', quality = 'concept', cost_usd = 0.5 where id = :'pid';
insert into public.lead_proposal_events (lead_id, proposal_id, kind, actor_name) values (:'lid', :'pid', 'moneybird_draft', 'Bart');
select public.expect_denied(format($q$update public.proposals set moneybird_status = 'iets' where id = %L$q$, :'pid'), 'onbekende status');
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000041', false);
do $$ begin assert (select count(moneybird_url) from public.proposals) = 0, 'sales ziet niets'; end $$;
select public.expect_denied(format($q$update public.proposals set moneybird_status = null where id = %L$q$, :'pid'), 'sales wijzigt');
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin assert (select moneybird_status from public.proposals where moneybird_estimate_id = '1') = 'draft', 'master leest'; end $$;
select public.expect_denied(format($q$update public.proposals set moneybird_status = null where id = %L$q$, :'pid'), 'master schrijft niet rechtstreeks');
reset role;
select 'TESTS MONEYBIRD GESLAAGD' as resultaat;
