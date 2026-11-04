-- Maakt 2FA verplicht voor alle gegevens in de tool.
-- LET OP: voer dit pas uit als de nieuwe code live staat en jouw eigen master-account 2FA heeft ingesteld.
-- Alle rechten en functies lopen via deze twee controles. Ze eisen nu een sessie met 2FA (aal2).

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active');
$$;

create or replace function public.is_master() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.status = 'active' and p.role = 'master');
$$;
