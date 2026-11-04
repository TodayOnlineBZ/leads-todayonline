-- Test voor verplichte 2FA. Draai na rls_test_4.sql op dezelfde lokale database.
\set ON_ERROR_STOP on
insert into auth.users values
  ('00000000-0000-0000-0000-000000000031', 'twee@voorbeeld.nl', '{"name":"Twee"}');
update public.profiles set status = 'active' where email = 'twee@voorbeeld.nl';
insert into public.companies (id, name, city, province, branch, phone, legal_form, source) values
  ('40000000-0000-0000-0000-000000000001', 'Tweefactor BV', 'Goes', 'Zeeland', 'Bouw', '1', 'BV', 'Test');

-- Met 2FA: gewoon toegang.
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000031', false);
select set_config('test.aal', 'aal2', false);
do $$ begin
  assert public.is_active(), 'actief met 2FA';
  assert (select count(*) from public.random_companies()) > 0, 'selectie met 2FA';
  perform public.claim_company('40000000-0000-0000-0000-000000000001');
  assert (select count(*) from public.leads) = 1, 'eigen lead met 2FA';
end $$;

-- Zonder 2FA: alleen het eigen profiel, zodat de app het juiste scherm kan tonen.
select set_config('test.aal', 'aal1', false);
do $$ begin
  assert not public.is_active(), 'niet actief zonder 2FA';
  assert (select count(*) from public.leads) = 0, 'geen leads zonder 2FA';
  assert (select count(*) from public.lead_notes) = 0, 'geen notities zonder 2FA';
  assert (select count(*) from public.companies) = 0, 'geen bedrijven zonder 2FA';
  assert (select count(*) from public.profiles) = 1, 'eigen profiel blijft leesbaar';
  update public.leads set "values" = '{"organisatie":"Gehackt"}';
end $$;
select public.expect_denied($$select public.random_companies()$$, 'selectie zonder 2FA');
select public.expect_denied($$select public.search_companies(p_province => 'Zeeland')$$, 'zoeken zonder 2FA');
select public.expect_denied($$select public.claim_company('20000000-0000-0000-0000-000000000008')$$, 'claimen zonder 2FA');
select public.expect_denied($$insert into public.leads ("values") values ('{"organisatie":"X"}')$$, 'lead maken zonder 2FA');
select public.expect_denied($$select public.company_legal_forms()$$, 'rechtsvormen zonder 2FA');

-- Master zonder 2FA heeft ook geen extra rechten.
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert not public.is_master(), 'master zonder 2FA telt niet';
  assert (select count(*) from public.leads) = 0, 'master ziet zonder 2FA geen leads';
  assert (select count(*) from public.profiles) = 1, 'master ziet zonder 2FA alleen zichzelf';
  assert (select count(*) from public.lead_sale_events) = 0, 'geen geschiedenis zonder 2FA';
  update public.profiles set status = 'active' where email = 'lisa@voorbeeld.nl';
end $$;
select public.expect_denied($$select public.import_companies('[]')$$, 'importeren zonder 2FA');
select public.expect_denied($$select public.set_lead_sale('00000000-0000-0000-0000-000000000000', 'Afgewezen')$$, 'status zonder 2FA');
reset role;
do $$ begin
  assert (select status from public.profiles where email = 'lisa@voorbeeld.nl') = 'pending', 'goedkeuren zonder 2FA werkt niet';
  assert (select count(*) from public.leads where "values" ->> 'organisatie' = 'Gehackt') = 0, 'wijzigen zonder 2FA werkt niet';
end $$;

-- Master met 2FA: weer alles.
set role authenticated;
select set_config('test.aal', 'aal2', false);
do $$ begin
  assert public.is_master(), 'master met 2FA';
  assert (select count(*) from public.leads) > 0, 'master ziet leads met 2FA';
end $$;
reset role;
select 'TESTS 2FA GESLAAGD' as resultaat;
