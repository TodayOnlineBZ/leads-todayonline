-- Test voor verdeling en rechten. Draai na rls_test_5.sql en 0006 op dezelfde lokale database.
\set ON_ERROR_STOP on
insert into auth.users values
  ('00000000-0000-0000-0000-000000000041', 'vera@voorbeeld.nl', '{"name":"Vera"}'),
  ('00000000-0000-0000-0000-000000000042', 'wim@voorbeeld.nl', '{"name":"Wim"}');
update public.profiles set status = 'active' where email in ('vera@voorbeeld.nl', 'wim@voorbeeld.nl');
insert into public.companies (id, name, city, province, branch, phone, legal_form, source) values
  ('50000000-0000-0000-0000-000000000001', 'Verdeling Een', 'Goes', 'Zeeland', 'Bouw', '1', 'BV', 'Test'),
  ('50000000-0000-0000-0000-000000000002', 'Verdeling Twee', 'Goes', 'Zeeland', 'Bouw', '2', 'BV', 'Test'),
  ('50000000-0000-0000-0000-000000000003', 'Verdeling Drie', 'Goes', 'Zeeland', 'Bouw', '3', 'BV', 'Test');
create temp table ids6 (name text primary key, id uuid);
grant select, insert on ids6 to authenticated;

select set_config('test.aal', 'aal2', false);
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000041', false);
do $$ begin insert into ids6 values ('vera', public.claim_company('50000000-0000-0000-0000-000000000001')); end $$;
-- Sales: niet meer bellen is volledig dicht.
select public.expect_denied($$select public.set_do_not_call('50000000-0000-0000-0000-000000000002', true)$$, 'sales zet vrij bedrijf op niet bellen');
select public.expect_denied($$select public.set_do_not_call('50000000-0000-0000-0000-000000000001', true)$$, 'sales zet eigen bedrijf op niet bellen');
do $$ begin
  update public.companies set do_not_call = true where id = '50000000-0000-0000-0000-000000000001';
end $$;
select public.expect_denied($$select public.compute_split(100, '00000000-0000-0000-0000-000000000041')$$, 'rekenfunctie aanroepen');
select public.expect_denied($$select public.refresh_lead_split((select id from ids6 where name = 'vera'))$$, 'verdeling herberekenen');
select public.expect_denied($$select public.assign_lead((select id from ids6 where name = 'vera'), '00000000-0000-0000-0000-000000000042')$$, 'sales wijst toe');
select public.expect_denied($$select public.preview_assign((select id from ids6 where name = 'vera'), '00000000-0000-0000-0000-000000000042')$$, 'sales bekijkt toewijzing');
select public.expect_denied($$select public.set_do_not_call('50000000-0000-0000-0000-000000000001', false)$$, 'sales herstelt');
reset role;
do $$ begin
  assert (select do_not_call from public.companies where id = '50000000-0000-0000-0000-000000000001') = false, 'sales wijzigt geen niet-bellen-status';
end $$;

-- Master berekent.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
do $$ declare l uuid := (select id from ids6 where name = 'vera'); m uuid; p record; begin
  perform public.set_lead_sale(l, 'Offerte verstuurd', 200000);
  assert (select sales_cents from public.lead_splits where lead_id = l) = 40000, 'sales 400';
  assert (select master_cents from public.lead_splits where lead_id = l) = 160000, 'master 1600';
  perform public.set_lead_sale(l, 'Offerte geaccepteerd', 123456);
  assert (select sales_cents from public.lead_splits where lead_id = l) = 24691, 'sales 246,91';
  assert (select master_cents from public.lead_splits where lead_id = l) = 98765, 'master 987,65';
  assert (select sales_cents + master_cents from public.lead_splits where lead_id = l) = 123456, 'som klopt';
  perform public.set_lead_sale(l, 'Offerte geaccepteerd', 200000);

  -- Eigen lead master.
  m := public.claim_company('50000000-0000-0000-0000-000000000002');
  insert into ids6 values ('master', m);
  perform public.set_lead_sale(m, 'Offerte geaccepteerd', 200000);
  assert (select master_cents from public.lead_splits where lead_id = m) = 200000, 'master 100 procent';
  assert (select sales_cents from public.lead_splits where lead_id = m) = 0, 'sales 0 bij master';
  assert (select commission_cents from public.leads where id = m) = 0, 'geen sales-commissie op master-lead';

  -- Toewijzen sales -> master bij geaccepteerde offerte.
  select * into p from public.preview_assign(l, '00000000-0000-0000-0000-00000000000b');
  assert p.old_sales_cents = 40000 and p.old_master_cents = 160000 and p.new_sales_cents = 0 and p.new_master_cents = 200000, 'voorbeeld naar master';
  perform public.assign_lead(l, '00000000-0000-0000-0000-00000000000b');
  assert (select master_cents from public.lead_splits where lead_id = l) = 200000, 'na toewijzen master 100';
  assert (select commission_cents from public.leads where id = l) = 0, 'sales 0 na toewijzen';
  assert (select sale_status from public.leads where id = l) = 'Offerte geaccepteerd', 'status blijft';
  -- En terug: master -> sales.
  perform public.assign_lead(l, '00000000-0000-0000-0000-000000000042');
  assert (select sales_cents from public.lead_splits where lead_id = l) = 40000, 'terug naar sales 400';
  assert (select master_cents from public.lead_splits where lead_id = l) = 160000, 'terug naar sales master 1600';
  assert (select owner_id from public.lead_splits where lead_id = l) = '00000000-0000-0000-0000-000000000042', 'eigenaar vastgelegd';
  assert (select count(*) from public.lead_sale_events where lead_id = l and new_owner_name = 'Wim' and old_owner_name = 'Bart') = 1, 'toewijzing in geschiedenis';
  perform public.assign_lead(l, '00000000-0000-0000-0000-000000000042');
  assert (select count(*) from public.lead_sale_events where lead_id = l and new_owner_name = 'Wim') = 1, 'zelfde eigenaar geeft geen regel';

  -- Afgewezen: geen verdeling.
  perform public.set_lead_sale(m, 'Afgewezen', 200000);
  assert not exists (select 1 from public.lead_splits where lead_id = m), 'afgewezen heeft geen verdeling';
  assert (select commission_cents from public.leads where id = m) is null, 'afgewezen geen commissie';
  perform public.set_lead_sale(m, 'Offerte verstuurd', 100000);
  assert (select master_cents from public.lead_splits where lead_id = m) = 100000, 'mogelijke verdeling master';
  perform public.set_lead_sale(m, 'Contact gemaakt', 100000);

  -- Master mag wel niet-bellen zetten.
  perform public.set_do_not_call('50000000-0000-0000-0000-000000000003', true);
  perform public.set_do_not_call('50000000-0000-0000-0000-000000000003', false);
end $$;
select public.expect_denied($$update public.leads set owner_id = '00000000-0000-0000-0000-000000000041' where id = (select id from ids6 where name = 'master')$$, 'master wijst direct toe');
select public.expect_denied($$select public.assign_lead((select id from ids6 where name = 'master'), '00000000-0000-0000-0000-000000000003')$$, 'toewijzen aan wachtend account');
reset role;

-- Percentage later wijzigen raakt een geaccepteerde deal niet.
create or replace function public.current_commission_percent() returns numeric language sql immutable set search_path = '' as $$ select 25.00::numeric $$;
set role authenticated;
do $$ declare l uuid := (select id from ids6 where name = 'vera'); begin
  perform public.assign_lead(l, '00000000-0000-0000-0000-000000000041');
  assert (select sales_percent from public.lead_splits where lead_id = l) = 20, 'geaccepteerd houdt 20 procent bij toewijzen';
end $$;
reset role;
create or replace function public.current_commission_percent() returns numeric language sql immutable set search_path = '' as $$ select 20.00::numeric $$;

-- Sales ziet de eigen commissie, maar niet het aandeel master.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000041', false);
do $$ declare l uuid := (select id from ids6 where name = 'vera'); begin
  assert (select commission_cents from public.leads where id = l) = 40000, 'eigen commissie zichtbaar';
  assert (select quote_amount_cents from public.leads where id = l) = 200000, 'offertebedrag zichtbaar';
  assert (select count(*) from public.lead_splits) = 0, 'aandeel master niet zichtbaar';
  assert (select count(*) from public.lead_sale_events) = 0, 'geschiedenis niet zichtbaar';
end $$;
select public.expect_denied($$insert into public.lead_splits values ((select id from ids6 where name = 'vera'), '00000000-0000-0000-0000-000000000041', 100, 1, 0, 0)$$, 'verdeling schrijven');
select set_config('test.uid', '00000000-0000-0000-0000-000000000042', false);
do $$ begin
  assert (select count(*) from public.leads where id = (select id from ids6 where name = 'vera')) = 0, 'oude eigenaar ziet commissie niet meer';
end $$;
-- Terugzetten bleef werken, en zonder 2FA is alles dicht.
select set_config('test.aal', 'aal1', false);
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin assert (select count(*) from public.lead_splits) = 0, 'geen verdeling zonder 2FA'; end $$;
select public.expect_denied($$select public.assign_lead((select id from ids6 where name = 'master'), '00000000-0000-0000-0000-000000000041')$$, 'toewijzen zonder 2FA');
reset role;
select 'TESTS VERDELING GESLAAGD' as resultaat;
