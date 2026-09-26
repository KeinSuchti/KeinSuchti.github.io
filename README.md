# Serien

## Supabase-Konten einrichten

Für Registrierung, Nutzernamen-Login, Kontoverwaltung und Rollenverwaltung zuerst
[`supabase-account-setup.sql`](supabase-account-setup.sql) vollständig im Supabase SQL Editor ausführen.
In Supabase Auth muss außerdem die E-Mail-Bestätigung aktiviert sein. Den privaten Username-Login
anschließend mit der Supabase CLI bereitstellen:

```sh
supabase link --project-ref tqxyofqzlflnpfomslky
supabase functions deploy login-with-username
```

Die Edge Function verwendet die von Supabase bereitgestellten Umgebungsvariablen
`SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY`. Der Service-Role-Key bleibt
serverseitig und darf nicht in `index.html` veröffentlicht werden. Danach können neue Nutzer sich
registrieren, die Adresse bestätigen und sich mit Nutzername oder E-Mail-Adresse anmelden.

Das SQL-Script legt die Rollen `user` und `admin` an, schützt Profile per Row Level Security und
erstellt den Admin-Bereich für Rollenverwaltung. Normale Nutzer können ihr eigenes Profil verwalten;
Admins können Konten einsehen und Rollen anderer Konten ändern. Ein bereits vorhandener, bestätigter
Account mit der Adresse `1keinsuchti1@gmail.com` wird beim Ausführen zum Admin. Falls der Account
erst danach registriert wird, das Script nach der E-Mail-Bestätigung erneut ausführen.