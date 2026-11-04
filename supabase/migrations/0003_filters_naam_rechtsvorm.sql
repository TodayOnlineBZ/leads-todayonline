-- Filters op naam en rechtsvorm bij Bedrijven zoeken.
-- Voer dit één keer uit in de SQL Editor, nadat 0002_terugzetten_en_selectie.sql is uitgevoerd.
-- Supabase toont hierbij een waarschuwing vanwege DROP FUNCTION. Er gaan geen gegevens verloren.

drop function public.search_companies(text, text);
drop function public.random_companies(text, text, uuid[], integer);

create function public.like_pattern(p_text text) returns text
language sql immutable set search_path = '' as $$
  select '%' || replace(replace(replace(btrim(p_text), '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;

create function public.search_companies(
  p_province text default null, p_branch text default null, p_name text default null, p_legal_form text default null
)
returns table (
  id uuid, name text, city text, province text, branch text, phone text, website text,
  legal_form text, source text, consent text, do_not_call boolean,
  release_count integer, last_release_reason text,
  lead_id uuid, owner_id uuid, owner_name text, owner_status text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active() then
    raise exception 'Je account is niet actief.';
  end if;
  if nullif(p_province, '') is null and nullif(p_branch, '') is null
     and nullif(btrim(coalesce(p_name, '')), '') is null and nullif(p_legal_form, '') is null then
    raise exception 'Kies minstens één filter.';
  end if;
  return query
    select c.id, c.name, c.city, c.province, c.branch,
           case when c.do_not_call then null else c.phone end,
           c.website, c.legal_form, c.source, c.consent, c.do_not_call,
           c.release_count, c.last_release_reason,
           case when l.owner_id = auth.uid() or public.is_master() then l.id end,
           l.owner_id, p.name, p.status
    from public.companies c
    left join public.leads l on l.company_id = c.id
    left join public.profiles p on p.id = l.owner_id
    where (nullif(p_province, '') is null or c.province = p_province)
      and (nullif(p_branch, '') is null or c.branch = p_branch)
      and (nullif(p_legal_form, '') is null or lower(c.legal_form) = lower(p_legal_form))
      and (nullif(btrim(coalesce(p_name, '')), '') is null or c.name ilike public.like_pattern(p_name))
    order by c.name
    limit 200;
end;
$$;

create function public.random_companies(
  p_province text default null, p_branch text default null, p_exclude uuid[] default '{}', p_limit integer default 25,
  p_name text default null, p_legal_form text default null
)
returns table (
  id uuid, name text, city text, province text, branch text, phone text, website text,
  legal_form text, source text, consent text, do_not_call boolean,
  release_count integer, last_release_reason text,
  lead_id uuid, owner_id uuid, owner_name text, owner_status text
)
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_active() then
    raise exception 'Je account is niet actief.';
  end if;
  return query
    select c.id, c.name, c.city, c.province, c.branch, c.phone,
           c.website, c.legal_form, c.source, c.consent, c.do_not_call,
           c.release_count, c.last_release_reason,
           null::uuid, null::uuid, null::text, null::text
    from public.companies c
    where not c.do_not_call
      and not exists (select 1 from public.leads l where l.company_id = c.id)
      and (nullif(p_province, '') is null or c.province = p_province)
      and (nullif(p_branch, '') is null or c.branch = p_branch)
      and (nullif(p_legal_form, '') is null or lower(c.legal_form) = lower(p_legal_form))
      and (nullif(btrim(coalesce(p_name, '')), '') is null or c.name ilike public.like_pattern(p_name))
    order by (c.id = any (coalesce(p_exclude, '{}'))), random()
    limit least(greatest(coalesce(p_limit, 25), 1), 25);
end;
$$;

create function public.company_legal_forms() returns setof text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active() then
    raise exception 'Je account is niet actief.';
  end if;
  return query select distinct c.legal_form from public.companies c order by 1;
end;
$$;

revoke execute on function public.like_pattern(text),
  public.search_companies(text, text, text, text),
  public.random_companies(text, text, uuid[], integer, text, text),
  public.company_legal_forms() from anon, public;
grant execute on function public.like_pattern(text),
  public.search_companies(text, text, text, text),
  public.random_companies(text, text, uuid[], integer, text, text),
  public.company_legal_forms() to authenticated;
