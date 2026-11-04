-- Alleen lezen: toont wat migratie 0006 verandert. Voer dit uit vóór de migratie.
select l."values" ->> 'organisatie' as bedrijf,
       p.name as eigenaar,
       p.role as rol,
       l.sale_status as status,
       l.quote_amount_cents / 100.0 as offerte_euro,
       l.commission_cents / 100.0 as commissie_nu,
       case when p.role = 'master' then 0 else l.commission_cents / 100.0 end as commissie_na_migratie,
       case when p.role = 'master' then l.quote_amount_cents / 100.0
            else (l.quote_amount_cents - l.commission_cents) / 100.0 end as aandeel_master_na_migratie
from public.leads l
join public.profiles p on p.id = l.owner_id
where l.sale_status in ('Offerte verstuurd', 'Offerte geaccepteerd')
order by bedrijf;
