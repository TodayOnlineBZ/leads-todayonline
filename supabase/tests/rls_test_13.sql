-- Test voor de Moneybird-status. Draai na rls_test_12.sql en 0013 op dezelfde lokale database.
\set ON_ERROR_STOP on
select set_config('test.aal', 'aal2', false);
insert into public.leads (id, "values", owner_id, sale_status) values
  ('13000000-0000-0000-0000-000000000001', '{"organisatie":"PN Test"}', '00000000-0000-0000-0000-000000000071', 'Contact gemaakt');
insert into public.proposals (id, lead_id, slug, status, price_cents, final_cents, expires_at, created_by, moneybird_estimate_id) values
  ('13000000-0000-0000-0000-0000000000a1', '13000000-0000-0000-0000-000000000001', 'mb-abc', 'ready', 300000, 270000, now() + interval '30 days', '00000000-0000-0000-0000-00000000000b', 'e1');

-- Gebruikers kunnen de functie en de tabel niet gebruiken.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
select public.expect_denied($$select public.apply_moneybird_state('13000000-0000-0000-0000-0000000000a1', 'open', 1)$$, 'master roept functie aan');
select public.expect_denied($$select * from public.moneybird_webhooks$$, 'master leest webhooks');
select set_config('test.uid', '00000000-0000-0000-0000-000000000071', false);
select public.expect_denied($$select public.apply_moneybird_state('13000000-0000-0000-0000-0000000000a1', 'accepted', 1)$$, 'sales roept functie aan');
reset role;

do $$ declare r text; begin
  assert public.apply_moneybird_state('13000000-0000-0000-0000-0000000000a1', 'draft', 0) = 'opgeslagen', 'concept verandert niets';
  assert (select sale_status from public.leads where id = '13000000-0000-0000-0000-000000000001') = 'Contact gemaakt', 'concept laat status';
  r := public.apply_moneybird_state('13000000-0000-0000-0000-0000000000a1', 'open', 265000);
  assert r = 'bijgewerkt', 'verstuurd: ' || r;
  assert (select sale_status from public.leads where id = '13000000-0000-0000-0000-000000000001') = 'Offerte verstuurd', 'status verstuurd';
  assert (select quote_amount_cents from public.leads where id = '13000000-0000-0000-0000-000000000001') = 265000, 'bedrag uit Moneybird';
  assert (select commission_cents from public.leads where id = '13000000-0000-0000-0000-000000000001') = 53000, 'commissie 20%';
  assert (select changed_by_name from public.lead_sale_events where lead_id = '13000000-0000-0000-0000-000000000001') = 'Moneybird (automatisch)', 'logboek';
  assert (select count(*) from public.lead_proposal_events where kind = 'moneybird_sent') = 1, 'voorstel-logboek';
  assert public.apply_moneybird_state('13000000-0000-0000-0000-0000000000a1', 'open', 265000) = 'ongewijzigd', 'dubbele melding';
  assert public.apply_moneybird_state('13000000-0000-0000-0000-0000000000a1', 'late', 265000) = 'opgeslagen', 'te laat blijft verstuurd';
  assert (select count(*) from public.lead_sale_events where lead_id = '13000000-0000-0000-0000-000000000001') = 1, 'geen extra regel';
  assert public.apply_moneybird_state('13000000-0000-0000-0000-0000000000a1', 'accepted', 265000) = 'bijgewerkt', 'geaccepteerd';
  assert (select sale_status from public.leads where id = '13000000-0000-0000-0000-000000000001') = 'Offerte geaccepteerd', 'status geaccepteerd';
  assert public.apply_moneybird_state('13000000-0000-0000-0000-0000000000a1', 'billed', 265000) = 'opgeslagen', 'gefactureerd blijft geaccepteerd';
  -- Terug naar open in Moneybird zet de status niet terug.
  assert public.apply_moneybird_state('13000000-0000-0000-0000-0000000000a1', 'open', 265000) = 'status blijft', 'niet terug';
  assert (select sale_status from public.leads where id = '13000000-0000-0000-0000-000000000001') = 'Offerte geaccepteerd', 'blijft geaccepteerd';
  assert public.apply_moneybird_state('13000000-0000-0000-0000-0000000000a1', 'rejected', 265000) = 'bijgewerkt', 'afgewezen na geaccepteerd';
  assert (select sale_status from public.leads where id = '13000000-0000-0000-0000-000000000001') = 'Afgewezen', 'status afgewezen';
  assert (select commission_cents from public.leads where id = '13000000-0000-0000-0000-000000000001') is null, 'geen commissie bij afgewezen';
  assert public.apply_moneybird_state('13000000-0000-0000-0000-000000000099', 'open', 1) = 'onbekend', 'onbekend voorstel';
  -- Zonder bedrag uit Moneybird geldt het bedrag van het voorstel.
  update public.leads set sale_status = 'Nog geen contact', quote_amount_cents = null where id = '13000000-0000-0000-0000-000000000001';
  update public.proposals set moneybird_state = 'draft' where id = '13000000-0000-0000-0000-0000000000a1';
  assert public.apply_moneybird_state('13000000-0000-0000-0000-0000000000a1', 'open', null) = 'bijgewerkt', 'zonder bedrag';
  assert (select quote_amount_cents from public.leads where id = '13000000-0000-0000-0000-000000000001') = 270000, 'bedrag voorstel';
  -- Teruggezette lead blijft ongemoeid.
  update public.proposals set moneybird_state = 'draft' where id = '13000000-0000-0000-0000-0000000000a1';
  update public.leads set archived_at = now() where id = '13000000-0000-0000-0000-000000000001';
  assert public.apply_moneybird_state('13000000-0000-0000-0000-0000000000a1', 'accepted', 1) = 'lead niet actief', 'teruggezet';
end $$;

set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin assert (select moneybird_state from public.proposals where id = '13000000-0000-0000-0000-0000000000a1') = 'accepted', 'master leest stand'; end $$;
reset role;
select 'TESTS MONEYBIRD-STATUS GESLAAGD';
