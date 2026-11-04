-- Test voor voorstellen. Draai na rls_test_6.sql en 0007 op dezelfde lokale database.
\set ON_ERROR_STOP on
select set_config('test.aal', 'aal2', false);
insert into public.proposals (lead_id, slug, status, price_cents, final_cents, mvp_html, expires_at, created_by)
  select id, 'geheim-abc', 'ready', 200000, 180000, '<html>geheim</html>', now() + interval '30 days', '00000000-0000-0000-0000-00000000000b'
  from public.leads limit 1;

set role anon;
select set_config('test.uid', '', false);
select public.expect_denied($$select * from public.proposals$$, 'anon leest voorstellen');
reset role;

set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000041', false);
do $$ begin assert (select count(slug) from public.proposals) = 0, 'sales ziet geen voorstellen'; end $$;
select public.expect_denied($$insert into public.proposals (lead_id, slug, price_cents, final_cents, expires_at, created_by) select id, 'x', 1, 1, now(), id from public.leads limit 1$$, 'sales maakt voorstel');
select public.expect_denied($$update public.proposals set expires_at = now() + interval '9 years'$$, 'sales verlengt');
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin assert (select count(slug) from public.proposals) = 1, 'master ziet voorstel'; end $$;
select public.expect_denied($$update public.proposals set expires_at = now() + interval '9 years'$$, 'master schrijft rechtstreeks');
select public.expect_denied($$delete from public.proposals$$, 'master verwijdert rechtstreeks');
select set_config('test.aal', 'aal1', false);
do $$ begin assert (select count(slug) from public.proposals) = 0, 'master zonder 2FA ziet niets'; end $$;
reset role;
select 'TESTS VOORSTELLEN GESLAAGD' as resultaat;
