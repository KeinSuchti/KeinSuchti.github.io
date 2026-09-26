# Serien

## Supabase-Konten einrichten

Für Registrierung, Nutzernamen-Login, Kontoverwaltung und Rollenverwaltung zuerst
[`supabase-account-setup.sql`](supabase-account-setup.sql) vollständig im Supabase SQL Editor ausführen.
Deaktiviere in Supabase unter **Authentication > Settings > User Signups** öffentliche Registrierungen,
damit niemand die Login-Maske oder die öffentliche Auth-API zur Kontoerstellung verwenden kann.
Admin-Einladungen werden weiterhin über die serverseitige Admin-API erstellt.

Die Funktionen für Username-Login und Admin-Einladungen mit der Supabase CLI bereitstellen:

```sh
supabase link --project-ref tqxyofqzlflnpfomslky
supabase functions deploy login-with-username
supabase functions deploy create-user-invite
supabase secrets set APP_ORIGIN=https://keinsuchti.github.io
```

Für beide Edge Functions stellt Supabase `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` bereit;
`login-with-username` verwendet zusätzlich `SUPABASE_ANON_KEY`. `APP_ORIGIN` muss auf die HTTPS-
Ursprungsadresse der Webseite zeigen. Der Service-Role-Key bleibt serverseitig und darf nicht in
`index.html` veröffentlicht werden.

Neue Konten können nur Admins im Administratorbereich einladen. Der Admin gibt E-Mail-Adresse und
Nutzernamen an und erstellt einen einmaligen Einladungslink. Der eingeladene Nutzer öffnet den Link
und legt ein Passwort fest. In Supabase Auth muss die Redirect-URL `https://keinsuchti.github.io/`
mit dem Einladungsparameter `https://keinsuchti.github.io/?invite=1` als erlaubte Redirect-URL
eingetragen sein.

Das SQL-Script legt die Rollen `user` und `admin` an, schützt Profile per Row Level Security und
erstellt den Admin-Bereich für Rollenverwaltung. Normale Nutzer können ihr eigenes Profil verwalten;
Admins können Konten einsehen und Rollen anderer Konten ändern. Ein bereits vorhandener, bestätigter
Account mit der Adresse `1keinsuchti1@gmail.com` wird beim Ausführen zum Admin. Falls der Account
erst danach per Admin-Einladung erstellt wird, das Script nach dem Erstellen des Kontos erneut
ausführen.