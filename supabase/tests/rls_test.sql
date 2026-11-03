-- Lokale rechtentest. Elke check stopt het script met een foutmelding als hij niet klopt.
\set ON_ERROR_STOP on

-- Vier accounts via de echte trigger. Sanne probeert zichzelf master te maken via haar metadata.
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000b', 'bart@todayonline.nl', '{"name":"Bart"}'),
  ('00000000-0000-0000-0000-000000000001', 'sanne@voorbeeld.nl', '{"name":"Sanne","role":"master","status":"active"}'),
  ('00000000-0000-0000-0000-000000000002', 'tim@voorbeeld.nl', '{"name":"Tim"}'),
  ('00000000-0000-0000-0000-000000000003', 'lisa@voorbeeld.nl', '{"name":"Lisa"}');

do $$ begin
  assert (select count(*) from public.profiles where status = 'pending' and role = 'sales') = 4,
    'nieuwe accounts moeten pending sales zijn, ongeacht metadata';
end $$;

update public.profiles set role = 'master', status = 'active' where email = 'bart@todayonline.nl';
update public.profiles set status = 'active' where email in ('sanne@voorbeeld.nl', 'tim@voorbeeld.nl');

insert into public.companies (id, name, city, province, branch, phone, legal_form, source, do_not_call) values
  ('10000000-0000-0000-0000-000000000001', 'Vrij BV', 'Haarlem', 'Noord-Holland', 'Logistiek', '000 1', 'BV', 'Test', false),
  ('10000000-0000-0000-0000-000000000002', 'Geblokkeerd BV', 'Haarlem', 'Noord-Holland', 'Logistiek', '000 2', 'BV', 'Test', true),
  ('10000000-0000-0000-0000-000000000003', 'Tweede BV', 'Haarlem', 'Noord-Holland', 'Logistiek', '000 3', 'BV', 'Test', false);

-- Hulpfunctie: verwacht dat een statement wordt geweigerd.
create function public.expect_denied(stmt text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    return;
  end;
  raise exception 'Had geweigerd moeten worden: %', label;
end $$;
grant execute on function public.expect_denied(text, text) to anon, authenticated;

-- ---- Anon ziet niets -------------------------------------------------------
set role anon;
select set_config('test.uid', '', false);
select public.expect_denied('select * from public.leads', 'anon leest leads');
select public.expect_denied('select * from public.profiles', 'anon leest profielen');
select public.expect_denied($$select public.search_companies('Noord-Holland','Logistiek')$$, 'anon zoekt');
select public.expect_denied($$select public.claim_company('10000000-0000-0000-0000-000000000001')$$, 'anon claimt');
reset role;

-- ---- Lisa wacht op goedkeuring ---------------------------------------------
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000003', false);
do $$ begin
  assert (select count(*) from public.profiles) = 1, 'pending ziet alleen zichzelf';
  assert (select count(*) from public.companies) = 0, 'pending ziet geen bedrijven';
end $$;
select public.expect_denied($$select public.search_companies('Noord-Holland','Logistiek')$$, 'pending zoekt');
select public.expect_denied($$select public.claim_company('10000000-0000-0000-0000-000000000001')$$, 'pending claimt');
select public.expect_denied($$insert into public.leads ("values") values ('{"organisatie":"X"}')$$, 'pending maakt lead');
-- Zichzelf goedkeuren doet niets: de update raakt geen rijen.
update public.profiles set status = 'active', role = 'master';
reset role;
do $$ begin
  assert (select status from public.profiles where email = 'lisa@voorbeeld.nl') = 'pending', 'zelf goedkeuren mag niet werken';
  assert (select role from public.profiles where email = 'lisa@voorbeeld.nl') = 'sales', 'zelf master worden mag niet werken';
end $$;

-- ---- Sanne werkt met eigen leads -------------------------------------------
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000001', false);
update public.profiles set role = 'master';
do $$ declare new_id uuid; begin
  assert not public.is_master(), 'sanne mag geen master worden';
  assert (select count(*) from public.search_companies('Noord-Holland', 'Logistiek')) = 3, 'zoeken toont drie bedrijven';
  assert (select phone from public.search_companies('Noord-Holland', 'Logistiek') where name = 'Geblokkeerd BV') is null, 'nummer geblokkeerd bedrijf blijft weg';
  assert (select count(*) from public.companies) = 0, 'geen directe toegang tot bedrijvenlijst';
  new_id := public.claim_company('10000000-0000-0000-0000-000000000001');
  assert (select "values" ->> 'organisatie' from public.leads where id = new_id) = 'Vrij BV', 'gegevens vooraf ingevuld';
  assert (select count(*) from public.companies) = 1, 'bedrijf van eigen lead is leesbaar';
  insert into public.lead_notes (lead_id, body, author_id, author_name)
    values (new_id, 'Eerste gesprek', '00000000-0000-0000-0000-00000000000b', 'Bart');
  assert (select author_name from public.lead_notes) = 'Sanne', 'auteur kan niet worden vervalst';
  insert into public.leads ("values") values ('{"organisatie":"Handmatig Sanne"}');
end $$;
select public.expect_denied($$select public.claim_company('10000000-0000-0000-0000-000000000002')$$, 'geblokkeerd bedrijf claimen');
select public.expect_denied($$select public.claim_company('10000000-0000-0000-0000-000000000001')$$, 'bedrijf tweemaal claimen');
select public.expect_denied($$insert into public.leads ("values", company_id) values ('{"organisatie":"X"}', '10000000-0000-0000-0000-000000000003')$$, 'claim omzeilen via insert');
select public.expect_denied($$insert into public.leads ("values", owner_id) values ('{"organisatie":"X"}', '00000000-0000-0000-0000-000000000002')$$, 'lead op naam van ander');
select public.expect_denied($$update public.leads set owner_id = '00000000-0000-0000-0000-000000000002'$$, 'eigen lead weggeven');
select public.expect_denied($$update public.leads set company_id = '10000000-0000-0000-0000-000000000003'$$, 'bedrijf koppelen via update');
select public.expect_denied($$update public.companies set do_not_call = false where true; select public.set_do_not_call('10000000-0000-0000-0000-000000000002', false)$$, 'blokkade herstellen');
select public.expect_denied($$select public.import_companies('[]')$$, 'sales importeert');
reset role;

-- ---- Tim mag niets van Sanne --------------------------------------------------
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000002', false);
do $$ declare claimed uuid; begin
  assert (select count(*) from public.leads) = 0, 'tim ziet geen leads van sanne';
  assert (select count(*) from public.lead_notes) = 0, 'tim ziet geen notities van sanne';
  assert (select count(*) from public.profiles) = 1, 'tim ziet alleen zichzelf';
  select lead_id into claimed from public.search_companies('Noord-Holland', 'Logistiek') where name = 'Vrij BV';
  assert claimed is null, 'tim krijgt geen lead-id van sanne';
  assert (select owner_name from public.search_companies('Noord-Holland', 'Logistiek') where name = 'Vrij BV') = 'Sanne', 'tim ziet wel de naam';
  update public.leads set "values" = '{"organisatie":"Gehackt"}';
  delete from public.lead_notes;
  update public.lead_notes set body = 'Gehackt';
end $$;
select public.expect_denied($$select public.claim_company('10000000-0000-0000-0000-000000000001')$$, 'bedrijf van collega claimen');
select public.expect_denied($$select public.set_do_not_call('10000000-0000-0000-0000-000000000001', true)$$, 'bedrijf van collega blokkeren');
select public.expect_denied($$insert into public.lead_notes (lead_id, body, author_id, author_name) select id, 'x', '00000000-0000-0000-0000-000000000002', 'Tim' from (select l.id from public.leads l) s union all select '00000000-0000-0000-0000-0000000000ff'::uuid, 'x', '00000000-0000-0000-0000-000000000002', 'Tim'$$, 'notitie bij onbekende lead');
reset role;
do $$ begin
  assert (select count(*) from public.leads where "values" ->> 'organisatie' = 'Gehackt') = 0, 'tim mag niet wijzigen';
  assert (select body from public.lead_notes) = 'Eerste gesprek', 'tim mag notitie niet wijzigen';
end $$;

-- ---- Sanne: delete van notitie mag niet, eigen bewerken wel ----------------------
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000001', false);
do $$ begin
  delete from public.lead_notes;
  assert (select count(*) from public.lead_notes) = 1, 'sales mag notitie niet verwijderen';
  update public.lead_notes set body = 'Bewerkt door Sanne';
  assert (select body from public.lead_notes) = 'Bewerkt door Sanne', 'eigen notitie bewerken';
  assert (select edited_at from public.lead_notes) is not null, 'bewerking wordt vastgelegd';
end $$;
reset role;

-- ---- Bart de master ziet en wijzigt alles ---------------------------------------
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
do $$ declare first_lead uuid; note_id uuid; begin
  assert public.is_master(), 'bart is master';
  assert (select count(*) from public.leads) = 2, 'master ziet alle leads';
  assert (select count(*) from public.profiles) = 4, 'master ziet alle gebruikers';
  assert (select count(*) from public.companies) = 3, 'master ziet alle bedrijven';
  assert (select lead_id from public.search_companies('Noord-Holland', 'Logistiek') where name = 'Vrij BV') is not null, 'master krijgt lead-id';
  select id into first_lead from public.leads where company_id is not null;
  update public.leads set owner_id = '00000000-0000-0000-0000-000000000002', "values" = "values" || '{"contact":"Door Bart"}' where id = first_lead;
  assert (select owner_id from public.leads where id = first_lead) = '00000000-0000-0000-0000-000000000002', 'master wijst toe';
  update public.lead_notes set body = 'Bewerkt door Bart';
  assert (select author_name from public.lead_notes) = 'Sanne', 'auteur blijft staan';
  update public.profiles set status = 'active' where email = 'lisa@voorbeeld.nl';
  assert (select status from public.profiles where email = 'lisa@voorbeeld.nl') = 'active', 'master keurt goed';
  assert public.import_companies('[{"name":"Nieuw BV","city":"Goes","province":"Zeeland","branch":"Retail","legal_form":"BV","source":"Lijst"},{"name":"vrij bv","city":"HAARLEM","province":"Noord-Holland","branch":"Logistiek","legal_form":"BV","source":"Lijst"}]') = 1, 'dubbele import overgeslagen';
  perform public.set_do_not_call('10000000-0000-0000-0000-000000000002', false);
  assert (select phone from public.search_companies('Noord-Holland', 'Logistiek') where name = 'Geblokkeerd BV') = '000 2', 'master herstelt';
  delete from public.lead_notes;
  assert (select count(*) from public.lead_notes) = 0, 'master verwijdert notitie';
end $$;
reset role;

-- ---- Verwijderde gebruiker: leads blijven, toegang stopt ------------------------
update public.profiles set status = 'removed' where email = 'tim@voorbeeld.nl';
delete from auth.users where email = 'tim@voorbeeld.nl';
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000002', false);
do $$ begin
  assert (select count(*) from public.leads) = 0, 'verwijderde gebruiker ziet niets meer';
end $$;
select public.expect_denied($$select public.search_companies('Noord-Holland','Logistiek')$$, 'verwijderde gebruiker zoekt');
reset role;
do $$ begin
  assert (select count(*) from public.leads where owner_id = '00000000-0000-0000-0000-000000000002') = 1, 'lead van verwijderde gebruiker blijft bestaan';
end $$;

select 'ALLE RECHTENTESTS GESLAAGD' as resultaat;
