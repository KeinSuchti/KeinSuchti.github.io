# Serien

## Supabase-Konten einrichten

Für Registrierungslinks, Nutzernamen-Login, Kontoverwaltung und Rollenverwaltung zuerst
[`supabase-account-setup.sql`](supabase-account-setup.sql) vollständig im Supabase SQL Editor ausführen.
Falls das Kontoschema bereits eingerichtet wurde, führe das aktualisierte SQL-Script erneut aus,
damit die Tabelle und Funktionen für einmalige Registrierungslinks und das Löschen des eigenen
Kontos angelegt werden.
Wenn beim Erstellen eines Registrierungslinks eine Datenbankfehlermeldung erscheint, prüfe, ob
dieses aktualisierte Script erfolgreich ausgeführt wurde; der Admin-Link wird in
`public.registration_invites` gespeichert.

Deaktiviere in Supabase unter **Authentication > Settings > User Signups** öffentliche Registrierungen,
damit niemand die Login-Maske oder die öffentliche Auth-API zur Kontoerstellung verwenden kann.
Admin-Registrierungslinks werden weiterhin serverseitig erstellt; das aktualisierte SQL-Script legt
dafür eine Tabelle mit gehashten, einmalig nutzbaren Tokens an.

Die Funktionen für Username-Login, Registrierungslinks und Kontoerstellung mit der Supabase CLI bereitstellen:

```sh
supabase link --project-ref tqxyofqzlflnpfomslky
supabase functions deploy login-with-username
supabase functions deploy create-user-invite
supabase functions deploy complete-user-registration
supabase secrets set APP_ORIGIN=https://keinsuchti.github.io
```

Supabase stellt `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` für die Edge Functions bereit;
Username-Login und Registrierung verwenden zusätzlich `SUPABASE_ANON_KEY`. `APP_ORIGIN` muss auf
die HTTPS-Ursprungsadresse der Webseite zeigen. Der Service-Role-Key bleibt serverseitig und darf
nicht in `index.html` veröffentlicht werden.

Neue Konten können nur Admins im Administratorbereich ermöglichen. Der Admin erstellt einen
einmaligen Registrierungslink und kopiert ihn über den Copy-Button. Der Link läuft nach sieben Tagen
ab; der eingeladene Nutzer trägt auf der Registrierungsseite E-Mail-Adresse, Nutzernamen und Passwort
ein. Der Link wird serverseitig einmalig eingelöst; in der Datenbank wird nur sein Hash gespeichert.
Setze in Supabase **Authentication > URL Configuration > Site URL** auf
`https://keinsuchti.github.io/` und erlaube dieselbe Adresse als Redirect-URL für Passwort-Resets.

Das SQL-Script legt die Rollen `user` und `admin` an, schützt Profile per Row Level Security und
erstellt den Admin-Bereich für Rollenverwaltung. Normale Nutzer können ihr eigenes Profil verwalten;
Admins können Konten einsehen und Rollen anderer Konten ändern. Ein bereits vorhandener, bestätigter
Account mit der Adresse `1keinsuchti1@gmail.com` wird beim Ausführen zum Admin. Falls der Account
erst danach per Admin-Einladung erstellt wird, das Script nach dem Erstellen des Kontos erneut
ausführen. Nutzer können ihr eigenes Konto im Benutzerkonto löschen; das SQL verhindert dabei, dass
der letzte Admin sein Konto entfernt.