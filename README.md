# TodayOnline Leadsysteem

Webapp waarmee salesmedewerkers prospects kwalificeren. Gebouwd met Next.js en Supabase, draait op Vercel.

De rechten worden afgedwongen in de database (Row Level Security), niet alleen in de pagina.
Test ze lokaal met `supabase/tests/`.

## Live zetten

### 1. Vercel en Supabase koppelen
1. Vercel: **Add New → Project** en importeer deze repo.
2. Open [Supabase in de Vercel Marketplace](https://vercel.com/marketplace/supabase), klik op **Install**, maak een project aan (Europese regio als die er staat) en koppel het aan dit Vercel-project.
3. Redeploy het project in Vercel, zodat de nieuwe sleutels worden gebruikt.

### 2. Database aanmaken
Open in Supabase de **SQL Editor**, plak de volledige inhoud van `supabase/migrations/0001_leadsysteem.sql` en klik op **Run**.

### 3. E-mail instellen
De standaardmail van Supabase werkt alleen voor eigen teamleden, en maximaal 2 berichten per uur.

1. Maak een account bij een e-maildienst, bijvoorbeeld Resend, en verifieer `todayonline.nl` met de DNS-records die de dienst geeft.
2. Supabase → **Authentication**: vul de SMTP-gegevens in. Afzender: `no-reply@todayonline.nl`.
3. Supabase → **Authentication → Email Templates**: vervang de link in deze sjablonen:

| Sjabloon | Link |
|---|---|
| Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/` |
| Invite user | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/wachtwoord` |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/wachtwoord` |

4. Vercel → **Settings → Environment Variables**: voeg `RESEND_API_KEY` toe en redeploy. Hiermee krijgt de master een melding als iemand wacht op goedkeuring, en krijgt de gebruiker een mail na goedkeuring.

### 4. CAPTCHA instellen
1. Cloudflare → **Turnstile**: maak een widget voor `leads.todayonline.nl`.
2. Supabase → **Authentication → Bot and Abuse Protection**: zet CAPTCHA aan, kies Turnstile en vul de **geheime** sleutel in.
3. Vercel → **Settings → Environment Variables**: voeg `NEXT_PUBLIC_TURNSTILE_SITE_KEY` toe met de **openbare** sitekey en redeploy.

Doe stap 2 en 3 kort na elkaar: zolang alleen Supabase de CAPTCHA vereist, lukt inloggen niet.

### 5. Domein koppelen
1. Vercel → **Settings → Domains → Add Domain**: `leads.todayonline.nl`. Kopieer de CNAME-waarde.
2. Plesk → domein → **DNS-instellingen → Record toevoegen**: type `CNAME`, naam `leads`, waarde uit Vercel. Gebruik niet "Subdomein toevoegen".
3. Wacht tot Vercel **Valid Configuration** toont.
4. Supabase → **Authentication → URL Configuration**: zet de Site URL op `https://leads.todayonline.nl` en voeg `https://leads.todayonline.nl/**` toe aan de Redirect URLs.

### 6. Master-account maken
Maak via `/registreren` je eigen account aan en bevestig je e-mail. Voer daarna in de SQL Editor uit:

```sql
update public.profiles
set role = 'master', status = 'active'
where email = 'bart@todayonline.nl';
```

### 7. Testen vóór echte gegevens
Maak twee testaccounts, keur ze goed en controleer dat ze elkaars leads niet kunnen openen.

## Database bijwerken
Voer nieuwe migraties uit `supabase/migrations/` één keer uit in de SQL Editor, op volgorde van hun nummer. Doe dat vóór je de bijbehorende code live zet.

## Rechten lokaal testen

```sh
# In een lege lokale PostgreSQL-database:
psql -f supabase/tests/stub_supabase.sql
psql -f supabase/migrations/0001_leadsysteem.sql
psql -f supabase/migrations/0002_terugzetten_en_selectie.sql
psql -f supabase/tests/rls_test.sql
psql -f supabase/tests/rls_test_2.sql
psql -f supabase/migrations/0003_filters_naam_rechtsvorm.sql
psql -f supabase/tests/rls_test_3.sql
psql -f supabase/migrations/0004_verkoopstatus_en_commissie.sql
psql -f supabase/tests/rls_test_4.sql
```

Voer dit nooit uit op de productiedatabase.
