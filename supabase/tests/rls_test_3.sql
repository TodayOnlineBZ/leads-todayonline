-- Test voor de filters op naam en rechtsvorm. Draai na rls_test_2.sql op dezelfde lokale database.
\set ON_ERROR_STOP on
insert into public.companies (name, city, province, branch, phone, legal_form, source) values
  ('Filter 100% Transport', 'Goes', 'Zeeland', 'Logistiek', '1', 'BV', 'Test'),
  ('Filter 100 Transport', 'Goes', 'Zeeland', 'Logistiek', '2', 'Onbekend', 'Test'),
  ('Filter_Koerier', 'Goes', 'Zeeland', 'Logistiek', '3', 'Eenmanszaak', 'Test');

set role anon;
select set_config('test.uid', '', false);
select public.expect_denied($$select public.company_legal_forms()$$, 'anon leest rechtsvormen');
reset role;

set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000003', false);
select public.expect_denied($$select public.company_legal_forms()$$, 'wachtend account leest rechtsvormen');
select set_config('test.uid', '00000000-0000-0000-0000-000000000011', false);
do $$ begin
  assert (select count(*) from public.search_companies(p_name => 'filter 100')) = 2, 'naam zonder hoofdletters';
  assert (select count(*) from public.search_companies(p_name => '100%')) = 1, 'procent wordt letterlijk gezocht';
  assert (select count(*) from public.search_companies(p_name => 'r_1')) = 0, 'underscore wordt letterlijk gezocht';
  assert (select count(*) from public.search_companies(p_name => 'Filter_K')) = 1, 'underscore in naam gevonden';
  assert (select count(*) from public.random_companies(p_name => 'filter', p_legal_form => 'onbekend')) = 1, 'naam en rechtsvorm samen';
  assert (select count(*) from public.search_companies(p_legal_form => 'Eenmanszaak', p_province => 'Zeeland')) = 1, 'rechtsvorm en provincie';
  assert (select bool_and(legal_form = 'BV') from public.random_companies(p_legal_form => 'BV')), 'selectie filtert op rechtsvorm';
  assert 'Eenmanszaak' in (select public.company_legal_forms()), 'rechtsvormen beschikbaar';
  assert (select count(*) from public.random_companies(p_province => 'Zeeland', p_branch => 'Logistiek', p_exclude => '{}')) >= 3, 'oude aanroep werkt nog';
end $$;
select public.expect_denied($$select public.search_companies(p_name => '   ')$$, 'lege naam geeft geen volledige lijst');
reset role;
select 'TESTS FILTERS GESLAAGD' as resultaat;
