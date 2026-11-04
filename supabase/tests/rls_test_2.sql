-- Test voor willekeurige selectie en terugzetten. Draai na rls_test.sql op dezelfde lokale database.
\set ON_ERROR_STOP on

insert into auth.users values
  ('00000000-0000-0000-0000-000000000011', 'anna@voorbeeld.nl', '{"name":"Anna"}'),
  ('00000000-0000-0000-0000-000000000012', 'piet@voorbeeld.nl', '{"name":"Piet"}');
update public.profiles set status = 'active' where email in ('anna@voorbeeld.nl', 'piet@voorbeeld.nl');

insert into public.companies (id, name, city, province, branch, phone, legal_form, source, do_not_call)
select ('20000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'Selectie ' || g, 'Plaats', 'Friesland',
       case when g % 2 = 0 then 'Bouw' else 'Retail' end, '000 ' || g, 'BV', 'Test', g = 1
from generate_series(1, 60) g;

-- ---- Willekeurige selectie -------------------------------------------------
set role anon;
select set_config('test.uid', '', false);
select public.expect_denied($$select public.random_companies()$$, 'anon haalt selectie op');
select public.expect_denied($$select public.release_lead('00000000-0000-0000-0000-000000000000', 'Niet bereikt')$$, 'anon zet terug');
reset role;

set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000003', false);
reset role;
update public.profiles set status = 'pending' where email = 'lisa@voorbeeld.nl';
set role authenticated;
select public.expect_denied($$select public.random_companies()$$, 'pending haalt selectie op');
select set_config('test.uid', '00000000-0000-0000-0000-000000000011', false);
do $$ declare a uuid[]; b uuid[]; l uuid; begin
  assert (select count(*) from public.random_companies()) = 25, 'zonder filter 25 bedrijven';
  assert (select count(*) from public.random_companies(p_limit => 100000)) = 25, 'limiet is niet te omzeilen';
  assert (select count(*) from public.companies) = 0, 'geen directe toegang tot de lijst';
  assert (select count(*) from public.random_companies(p_province => 'Friesland', p_branch => 'Bouw')) = 25, 'twee filters';
  assert (select bool_and(province = 'Friesland') from public.random_companies(p_province => 'Friesland')), 'filter provincie';
  assert (select bool_and(branch = 'Retail') from public.random_companies(p_branch => 'Retail')), 'filter branche';
  assert not exists (select 1 from public.random_companies(p_province => 'Friesland', p_branch => 'Retail') where name = 'Selectie 1'), 'geblokkeerd staat er niet in';
  select array_agg(id) into a from public.random_companies(p_province => 'Friesland');
  select array_agg(id) into b from public.random_companies(p_province => 'Friesland', p_exclude => a);
  assert not (a && b), 'nieuwe selectie toont andere bedrijven';
  l := public.claim_company('20000000-0000-0000-0000-000000000002');
  assert not exists (select 1 from public.random_companies(p_province => 'Friesland', p_branch => 'Bouw') where name = 'Selectie 2'), 'in behandeling staat er niet in';
  insert into public.lead_notes (lead_id, body, author_id, author_name) values (l, 'Geheime notitie', '00000000-0000-0000-0000-000000000011', 'Anna');
  update public.leads set "values" = "values" || '{"v1":"Geheim antwoord"}' where id = l;
  insert into public.leads ("values") values ('{"organisatie":"Handmatig Anna"}');
end $$;
select public.expect_denied($$select public.search_companies()$$, 'volledige lijst zonder filter');
-- Archiefvelden en de teller zijn niet rechtstreeks te wijzigen.
select public.expect_denied($$update public.leads set archived_at = now() where "values"->>'organisatie' = 'Selectie 2'$$, 'zelf archiveren via update');
select public.expect_denied($$insert into public.leads ("values", archived_at) values ('{"organisatie":"X"}', now())$$, 'gearchiveerde lead invoegen');
select public.expect_denied($$update public.leads set archived_company_id = '20000000-0000-0000-0000-000000000004' where "values"->>'organisatie' = 'Selectie 2'$$, 'archiefkoppeling wijzigen');
reset role;

-- ---- Collega kan niet terugzetten ----------------------------------------------
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000012', false);
select public.expect_denied($$select public.release_lead((select l.id from public.leads l limit 1), 'Niet bereikt')$$, 'lead null');
reset role;
create temp table anna_lead as select id from public.leads where company_id = '20000000-0000-0000-0000-000000000002';
create temp table anna_manual as select id from public.leads where "values"->>'organisatie' = 'Handmatig Anna';
grant select on anna_lead, anna_manual to authenticated;
set role authenticated;
select public.expect_denied($$select public.release_lead((select id from anna_lead), 'Niet bereikt')$$, 'lead van collega terugzetten');
do $$ begin
  update public.leads set "values" = '{"organisatie":"Gehackt"}' where id = (select id from anna_lead);
end $$;
reset role;
do $$ begin
  assert (select "values"->>'organisatie' from public.leads where id = (select id from anna_lead)) = 'Selectie 2', 'collega wijzigt niets';
  assert (select archived_at from public.leads where id = (select id from anna_lead)) is null, 'lead is nog actief';
end $$;

-- ---- Anna zet haar eigen lead terug ---------------------------------------------
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000011', false);
select public.expect_denied($$select public.release_lead((select id from anna_lead), 'Onzin')$$, 'ongeldige reden');
select public.expect_denied($$select public.release_lead((select id from anna_lead), 'Anders', '   ')$$, 'Anders zonder toelichting');
select public.expect_denied($$select public.release_lead((select id from anna_manual), 'Niet bereikt')$$, 'handmatige lead');
select public.release_lead((select id from anna_lead), 'Anders', 'Bedrijf is verhuisd');
do $$ begin
  assert (select count(*) from public.leads where id = (select id from anna_lead)) = 0, 'lead verdwijnt uit overzicht eigenaar';
  assert (select count(*) from public.lead_notes where body = 'Geheime notitie') = 0, 'notitie is niet meer zichtbaar voor eigenaar';
  update public.leads set "values" = '{"organisatie":"Gewijzigd"}' where id = (select id from anna_lead);
end $$;
select public.expect_denied($$select public.release_lead((select id from anna_lead), 'Niet bereikt')$$, 'tweemaal terugzetten');
select public.expect_denied($$insert into public.lead_notes (lead_id, body, author_id, author_name) values ((select id from anna_lead), 'x', '00000000-0000-0000-0000-000000000011', 'Anna')$$, 'notitie na terugzetten');
reset role;

-- ---- Piet neemt het over en ziet niets van Anna -----------------------------------
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000012', false);
do $$ declare l uuid; c record; begin
  select * into c from public.search_companies(p_province => 'Friesland', p_branch => 'Bouw') s where s.name = 'Selectie 2';
  assert c.owner_id is null and c.lead_id is null, 'bedrijf is weer beschikbaar';
  assert c.release_count = 1, 'teller staat op 1';
  assert c.last_release_reason = 'Anders', 'laatste reden zichtbaar';
  assert (select count(*) from public.search_companies('Friesland', 'Bouw') s where s.name = 'Selectie 2' and s.last_release_reason like '%verhuisd%') = 0, 'toelichting van Anna blijft weg';
  l := public.claim_company('20000000-0000-0000-0000-000000000002');
  assert (select "values" ->> 'v1' from public.leads where id = l) is null, 'nieuwe lead is leeg';
  assert (select count(*) from public.lead_notes) = 0, 'piet ziet geen oude notities';
  assert (select count(*) from public.leads where archived_at is not null) = 0, 'piet ziet geen archief';
  assert (select count(*) from public.leads where archived_company_id is not null) = 0, 'piet ziet ook via het bedrijf geen archief';
  assert (select release_count from public.companies where id = '20000000-0000-0000-0000-000000000002') = 1, 'piet ziet teller bij eigen lead';
end $$;
reset role;

-- ---- Terugzetten maakt een geblokkeerd bedrijf niet beschikbaar --------------------
set role authenticated;
do $$ declare l uuid; begin
  l := public.claim_company('20000000-0000-0000-0000-000000000004');
  perform public.set_do_not_call('20000000-0000-0000-0000-000000000004', true);
  perform public.release_lead(l, 'Geen interesse');
  assert not exists (select 1 from public.random_companies(p_province => 'Friesland', p_branch => 'Bouw') where name = 'Selectie 4'), 'blijft geblokkeerd in selectie';
end $$;
select public.expect_denied($$select public.claim_company('20000000-0000-0000-0000-000000000004')$$, 'geblokkeerd bedrijf claimen na terugzetten');
reset role;

-- ---- Master ------------------------------------------------------------------------
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
do $$ declare l uuid; begin
  assert (select count(*) from public.leads where archived_at is not null) = 2, 'master ziet archief';
  assert (select archive_reason || '|' || archive_note || '|' || archived_by_name from public.leads where id = (select id from anna_lead)) = 'Anders|Bedrijf is verhuisd|Anna', 'reden, toelichting en naam bewaard';
  assert (select archived_at from public.leads where id = (select id from anna_lead)) is not null, 'datum bewaard';
  assert (select "values" ->> 'v1' from public.leads where id = (select id from anna_lead)) = 'Geheim antwoord', 'antwoorden bewaard';
  assert (select count(*) from public.lead_notes where body = 'Geheime notitie') = 1, 'notities bewaard';
  update public.leads set "values" = '{"organisatie":"Gewijzigd"}' where id = (select id from anna_lead);
  assert (select "values" ->> 'v1' from public.leads where id = (select id from anna_lead)) = 'Geheim antwoord', 'archief is alleen-lezen';
  delete from public.lead_notes where body = 'Geheime notitie';
  assert (select count(*) from public.lead_notes where body = 'Geheime notitie') = 1, 'notitie in archief blijft staan';
  -- Master mag een lead van een ander terugzetten.
  select id into l from public.leads where company_id = '20000000-0000-0000-0000-000000000002';
  perform public.release_lead(l, 'Niet bereikt');
  assert (select archived_by_name from public.leads where id = l) = 'Bart', 'naam van master bewaard';
  assert (select release_count from public.companies where id = '20000000-0000-0000-0000-000000000002') = 2, 'teller staat op 2';
  assert (select last_release_reason from public.companies where id = '20000000-0000-0000-0000-000000000002') = 'Niet bereikt', 'laatste reden bijgewerkt';
end $$;
select public.expect_denied($$update public.leads set archive_reason = 'x' where id = (select l.id from public.leads l where l.archived_at is null limit 1)$$, 'master wijzigt archiefveld rechtstreeks');
select public.expect_denied($$update public.companies set release_count = 0 where id = '20000000-0000-0000-0000-000000000002'$$, 'teller rechtstreeks wijzigen');
reset role;

select 'TESTS TERUGZETTEN EN SELECTIE GESLAAGD' as resultaat;
