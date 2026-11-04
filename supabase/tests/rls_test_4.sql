-- Test voor verkoopstatus en commissie. Draai na rls_test_3.sql op dezelfde lokale database.
\set ON_ERROR_STOP on
insert into auth.users values
  ('00000000-0000-0000-0000-000000000021', 'kees@voorbeeld.nl', '{"name":"Kees"}'),
  ('00000000-0000-0000-0000-000000000022', 'ria@voorbeeld.nl', '{"name":"Ria"}');
update public.profiles set status = 'active' where email in ('kees@voorbeeld.nl', 'ria@voorbeeld.nl');
insert into public.companies (id, name, city, province, branch, phone, legal_form, source) values
  ('30000000-0000-0000-0000-000000000001', 'Omzet Een', 'Goes', 'Zeeland', 'Bouw', '1', 'BV', 'Test'),
  ('30000000-0000-0000-0000-000000000002', 'Omzet Twee', 'Goes', 'Zeeland', 'Bouw', '2', 'BV', 'Test');

create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated;

set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000021', false);
do $$ begin
  insert into ids values ('kees', public.claim_company('30000000-0000-0000-0000-000000000001'));
  assert (select sale_status from public.leads where id = (select id from ids where name = 'kees')) = 'Nog geen contact', 'nieuwe lead start op Nog geen contact';
end $$;
-- Kees mag niets aan status of commissie doen.
select public.expect_denied($$update public.leads set sale_status = 'Offerte geaccepteerd', quote_amount_cents = 100 where id = (select id from ids where name = 'kees')$$, 'status direct wijzigen');
select public.expect_denied($$update public.leads set commission_cents = 999999 where id = (select id from ids where name = 'kees')$$, 'commissie direct wijzigen');
select public.expect_denied($$update public.leads set commission_percent = 100 where id = (select id from ids where name = 'kees')$$, 'percentage direct wijzigen');
select public.expect_denied($$select public.set_lead_sale((select id from ids where name = 'kees'), 'Contact gemaakt')$$, 'sales gebruikt set_lead_sale');
select public.expect_denied($$insert into public.leads ("values", sale_status, quote_amount_cents) values ('{"organisatie":"X"}', 'Offerte verstuurd', 100)$$, 'lead met status invoegen');
select public.expect_denied($$insert into public.leads ("values", commission_cents) values ('{"organisatie":"X"}', 5)$$, 'lead met commissie invoegen');
select public.expect_denied($$select public.current_commission_percent()$$, 'percentfunctie is niet aan te roepen');
do $$ begin
  assert (select count(*) from public.lead_sale_events) = 0, 'sales ziet geen geschiedenis';
end $$;
select public.expect_denied($$insert into public.lead_sale_events (lead_id, old_status, new_status, changed_by, changed_by_name) values ((select id from ids where name = 'kees'), 'a', 'b', '00000000-0000-0000-0000-000000000021', 'x')$$, 'geschiedenis schrijven');
reset role;

-- ---- Master -------------------------------------------------------------------
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
do $$ declare l uuid := (select id from ids where name = 'kees'); begin
  perform public.set_lead_sale(l, 'Contact gemaakt');
  assert (select commission_cents from public.leads where id = l) is null, 'geen commissie bij contact';
  perform public.set_lead_sale(l, 'Offerte verstuurd', 200000);
  assert (select commission_cents from public.leads where id = l) = 40000, '2000 euro wordt 400 euro';
  assert (select commission_percent from public.leads where id = l) = 20, 'percentage 20';
  perform public.set_lead_sale(l, 'Offerte geaccepteerd', 123456);
  assert (select commission_cents from public.leads where id = l) = 24691, 'bedrag met centen: 1234,56 wordt 246,91';
  perform public.set_lead_sale(l, 'Offerte geaccepteerd', 123456);
  assert (select count(*) from public.lead_sale_events where lead_id = l) = 3, 'geen wijziging geeft geen regel';
  assert (select old_status || '>' || new_status || '>' || changed_by_name from public.lead_sale_events where lead_id = l order by created_at desc limit 1) in ('Offerte verstuurd>Offerte geaccepteerd>Bart', 'Contact gemaakt>Offerte verstuurd>Bart', 'Nog geen contact>Contact gemaakt>Bart'), 'geschiedenis met naam';
  assert exists (select 1 from public.lead_sale_events where lead_id = l and old_status = 'Offerte verstuurd' and new_status = 'Offerte geaccepteerd' and old_amount_cents = 200000 and new_amount_cents = 123456), 'bedragen in geschiedenis';
end $$;
select public.expect_denied($$select public.set_lead_sale((select id from ids where name = 'kees'), 'Offerte verstuurd')$$, 'offerte zonder bedrag');
select public.expect_denied($$select public.set_lead_sale((select id from ids where name = 'kees'), 'Offerte verstuurd', 0)$$, 'bedrag nul');
select public.expect_denied($$select public.set_lead_sale((select id from ids where name = 'kees'), 'Offerte verstuurd', -5)$$, 'negatief bedrag');
select public.expect_denied($$select public.set_lead_sale((select id from ids where name = 'kees'), 'Onzin', 100)$$, 'ongeldige status');
select public.expect_denied($$update public.leads set sale_status = 'Afgewezen' where id = (select id from ids where name = 'kees')$$, 'ook master niet rechtstreeks');
select public.expect_denied($$select public.release_lead((select id from ids where name = 'kees'), 'Niet bereikt')$$, 'master zet geaccepteerde offerte terug');
reset role;

-- Percentage later wijzigen raakt geaccepteerde offertes niet.
create or replace function public.current_commission_percent() returns numeric language sql immutable set search_path = '' as $$ select 25.00::numeric $$;
set role authenticated;
do $$ declare l uuid := (select id from ids where name = 'kees'); begin
  perform public.set_lead_sale(l, 'Offerte geaccepteerd', 200000);
  assert (select commission_percent from public.leads where id = l) = 20, 'geaccepteerd houdt 20 procent';
  assert (select commission_cents from public.leads where id = l) = 40000, 'correctie bedrag met oud percentage';
end $$;
reset role;
create or replace function public.current_commission_percent() returns numeric language sql immutable set search_path = '' as $$ select 20.00::numeric $$;

-- ---- Collega en eigenaar ---------------------------------------------------------
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000022', false);
do $$ begin
  assert (select count(*) from public.leads) = 0, 'ria ziet geen cijfers van kees';
  assert (select count(*) from public.lead_sale_events) = 0, 'ria ziet geen geschiedenis';
  insert into ids values ('ria', public.claim_company('30000000-0000-0000-0000-000000000002'));
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-000000000021', false);
do $$ declare l uuid := (select id from ids where name = 'kees'); begin
  assert (select commission_cents from public.leads where id = l) = 40000, 'kees leest eigen commissie';
  assert (select count(*) from public.leads) = 1, 'kees ziet alleen eigen lead';
end $$;
select public.expect_denied($$select public.release_lead((select id from ids where name = 'kees'), 'Niet bereikt')$$, 'sales zet geaccepteerde offerte terug');
reset role;

-- ---- Afgewezen, toewijzen, terugzetten -----------------------------------------
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
do $$ declare l uuid := (select id from ids where name = 'kees'); r uuid := (select id from ids where name = 'ria'); begin
  update public.leads set owner_id = '00000000-0000-0000-0000-000000000022' where id = l;
  assert (select sale_status from public.leads where id = l) = 'Offerte geaccepteerd', 'status blijft bij toewijzen';
  assert (select commission_cents from public.leads where id = l) = 40000, 'commissie blijft bij toewijzen';
  perform public.set_lead_sale(r, 'Offerte verstuurd', 100000);
  perform public.set_lead_sale(r, 'Afgewezen', 100000);
  assert (select commission_cents from public.leads where id = r) is null, 'afgewezen geeft geen commissie';
  assert (select quote_amount_cents from public.leads where id = r) = 100000, 'bedrag blijft bewaard';
  perform public.release_lead(r, 'Geen interesse');
  assert (select sale_status from public.leads where id = r) = 'Afgewezen', 'status bewaard in archief';
  assert (select quote_amount_cents from public.leads where id = r) = 100000, 'bedrag bewaard in archief';
end $$;
select public.expect_denied($$select public.set_lead_sale((select id from ids where name = 'ria'), 'Contact gemaakt')$$, 'archief wijzigen');
select set_config('test.uid', '00000000-0000-0000-0000-000000000022', false);
do $$ begin
  assert (select count(*) from public.leads where id = (select id from ids where name = 'kees')) = 1, 'nieuwe eigenaar ziet de lead';
  assert (select commission_cents from public.leads where id = (select id from ids where name = 'kees')) = 40000, 'commissie hoort bij nieuwe eigenaar';
  assert (select count(*) from public.leads where id = (select id from ids where name = 'ria')) = 0, 'gearchiveerd niet zichtbaar voor eigenaar';
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-000000000021', false);
do $$ begin assert (select count(*) from public.leads) = 0, 'oude eigenaar ziet commissie niet meer'; end $$;
reset role;

-- Bestaande leads: de migratie geeft ze allemaal de beginstatus.
do $$ begin
  assert (select count(*) from public.leads where sale_status = 'Nog geen contact' and "values" ->> 'organisatie' = 'Handmatig Anna') = 1, 'bestaande lead behouden';
end $$;
select 'TESTS VERKOOPSTATUS GESLAAGD' as resultaat;
