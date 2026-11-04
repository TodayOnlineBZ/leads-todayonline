-- Test voor instellingen. Draai na rls_test_8.sql en 0009 op dezelfde lokale database.
\set ON_ERROR_STOP on
select set_config('test.aal', 'aal2', false);
update auth.users set email = 'nieuw-bart@todayonline.nl' where id = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select email from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'nieuw-bart@todayonline.nl', 'profiel volgt het nieuwe adres';
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'master', 'rol blijft';
end $$;
update auth.users set email = 'sanne-nieuw@voorbeeld.nl' where id = '00000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-000000000001') = 'sales', 'nieuw adres geeft geen rechten';
  assert (select status from public.profiles where id = '00000000-0000-0000-0000-000000000001') = 'active', 'status blijft';
end $$;

insert into public.password_attempts (user_id) values ('00000000-0000-0000-0000-000000000001');
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000001', false);
select public.expect_denied($$select * from public.password_attempts$$, 'gebruiker leest pogingen');
select public.expect_denied($$delete from public.password_attempts$$, 'gebruiker wist pogingen');
select public.expect_denied($$select public.sync_profile_email()$$, 'gebruiker roept sync aan');
update public.profiles set email = 'bart@todayonline.nl';
reset role;
do $$ begin
  assert (select email from public.profiles where id = '00000000-0000-0000-0000-000000000001') = 'sanne-nieuw@voorbeeld.nl', 'eigen adres niet rechtstreeks wijzigbaar';
end $$;
set role anon;
select public.expect_denied($$select * from public.password_attempts$$, 'anon leest pogingen');
reset role;
select 'TESTS INSTELLINGEN GESLAAGD' as resultaat;
