-- Test voor aangeleverde bestanden. Draai na rls_test_11.sql en 0012 op dezelfde lokale database.
\set ON_ERROR_STOP on
select set_config('test.aal', 'aal2', false);
insert into auth.users values ('00000000-0000-0000-0000-000000000071', 'eigen@voorbeeld.nl', '{"name":"Eigen"}'), ('00000000-0000-0000-0000-000000000072', 'ander@voorbeeld.nl', '{"name":"Ander"}');
update public.profiles set status = 'active' where id in ('00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000072');
insert into public.leads (id, "values", owner_id) values ('77000000-0000-0000-0000-000000000001', '{"organisatie":"Bestand BV"}', '00000000-0000-0000-0000-000000000071');
\set good '''77000000-0000-0000-0000-000000000001/a.jpg'''

set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-000000000071', false);
insert into public.lead_files (lead_id, name, path, size_bytes, mime_type) values ('77000000-0000-0000-0000-000000000001', 'a.jpg', :good, 10, 'image/jpeg');
insert into storage.objects (bucket_id, name) values ('lead-files', :good);
do $$ begin
  assert (select uploaded_by_name from public.lead_files) = 'Eigen', 'naam uit profiel';
  assert (select count(*) from storage.objects where bucket_id = 'lead-files') = 1, 'eigenaar ziet bestand';
end $$;
update public.lead_files set kind = 'logo';
select public.expect_denied($$update public.lead_files set path = 'x/y'$$, 'pad wijzigen');
select public.expect_denied($$update public.lead_files set uploaded_by_name = 'Bart'$$, 'naam wijzigen');
select public.expect_denied($$insert into public.lead_files (lead_id, name, path, size_bytes, mime_type) values ('77000000-0000-0000-0000-000000000001', 'b', 'andere-map/b', 1, 'image/png')$$, 'pad buiten de lead');
select public.expect_denied($$insert into storage.objects (bucket_id, name) values ('lead-files', '../77000000-0000-0000-0000-000000000001/x')$$, 'pad met omweg');
select public.expect_denied($$insert into storage.objects (bucket_id, name) values ('lead-files', '77000000-0000-0000-0000-000000000001/sub/x')$$, 'submap');

select set_config('test.uid', '00000000-0000-0000-0000-000000000072', false);
do $$ begin
  assert (select count(*) from public.lead_files) = 0, 'ander ziet geen bestanden';
  assert (select count(*) from storage.objects where bucket_id = 'lead-files') = 0, 'ander ziet geen opslag';
  delete from public.lead_files; delete from storage.objects where bucket_id = 'lead-files';
end $$;
select public.expect_denied($$insert into public.lead_files (lead_id, name, path, size_bytes, mime_type) values ('77000000-0000-0000-0000-000000000001', 'b', '77000000-0000-0000-0000-000000000001/b', 1, 'image/png')$$, 'ander voegt toe');
select public.expect_denied($$insert into storage.objects (bucket_id, name) values ('lead-files', '77000000-0000-0000-0000-000000000001/b')$$, 'ander uploadt');

select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin assert (select count(*) from public.lead_files) = 1, 'master ziet bestand'; end $$;
select set_config('test.aal', 'aal1', false);
do $$ begin assert (select count(*) from public.lead_files) = 0, 'zonder 2FA niets'; end $$;
select set_config('test.aal', 'aal2', false);
select set_config('test.uid', '00000000-0000-0000-0000-000000000071', false);
reset role;
update public.leads set archived_at = now() where id = '77000000-0000-0000-0000-000000000001';
set role authenticated;
do $$ begin assert (select count(*) from public.lead_files) = 0, 'teruggezet: eigenaar ziet niets meer'; end $$;
reset role;
set role anon;
select set_config('test.uid', '', false);
select public.expect_denied($$select * from public.lead_files$$, 'anon leest');
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'lead-files') = 0, 'anon ziet opslag niet'; end $$;
reset role;
select 'TESTS BESTANDEN GESLAAGD' as resultaat;
