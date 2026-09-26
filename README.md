# Serien

## Supabase-Konten einrichten

Für Registrierungslinks, Nutzernamen-Login, Kontoverwaltung und Rollenverwaltung zuerst
[`supabase-account-setup.sql`](supabase-account-setup.sql) vollständig im Supabase SQL Editor ausführen.
Falls das Kontoschema bereits eingerichtet wurde, führe das aktualisierte SQL-Script erneut aus,
damit die Tabelle und Funktionen für einmalige Registrierungslinks, das Löschen des eigenen Kontos
und die Admin-Kontoverwaltung angelegt werden.
Wenn beim Erstellen eines Registrierungslinks eine Datenbankfehlermeldung erscheint, prüfe, ob
dieses aktualisierte Script erfolgreich ausgeführt wurde; der Admin-Link wird in
`public.registration_invites` gespeichert.

Deaktiviere in Supabase unter **Authentication > Settings > User Signups** öffentliche Registrierungen,
damit niemand die Login-Maske oder die öffentliche Auth-API zur Kontoerstellung verwenden kann.
Admin-Registrierungslinks werden weiterhin serverseitig erstellt; das aktualisierte SQL-Script legt
dafür eine Tabelle mit gehashten, einmalig nutzbaren Tokens an.

Die Edge Functions mit der Supabase CLI aus PowerShell im Projektordner bereitstellen:

```sh
supabase link --project-ref tqxyofqzlflnpfomslky
supabase functions deploy login-with-username --project-ref tqxyofqzlflnpfomslky
supabase functions deploy create-user-invite --project-ref tqxyofqzlflnpfomslky
supabase functions deploy complete-user-registration --project-ref tqxyofqzlflnpfomslky
supabase functions deploy manage-user-account --project-ref tqxyofqzlflnpfomslky
supabase secrets set APP_ORIGIN=https://keinsuchti.github.io
```

Nach Änderungen an Registrierung oder Username-Login müssen die aktualisierten Funktionen
`complete-user-registration` und `login-with-username` erneut deployed werden. Das SQL-Script wird
nicht in PowerShell ausgeführt, sondern im Supabase Dashboard unter **SQL Editor**.

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
Damit automatische Link-Prüfer in E-Mail-Systemen den einmaligen Reset-Link nicht vor dem Nutzer
verbrauchen, ändere unter **Authentication > Email Templates > Reset Password** den Link so, dass
er den Token-Hash an die Webseite übergibt, statt `{{ .ConfirmationURL }}` zu verwenden:

```html
<h2>Passwort zurücksetzen</h2>
<p>Öffne die Seite und bestätige den Reset erst nach dem Laden:</p>
<p><a href="{{ .RedirectTo }}#token_hash={{ .TokenHash }}&amp;type=recovery">Passwort zurücksetzen</a></p>
```

Die Webseite fragt erst nach einem bewussten Klick auf „Reset-Link bestätigen“ bei Supabase nach
dem Token. Er steht im URL-Fragment und wird daher nicht an den Webseitenserver übertragen. Der
Token wird nicht automatisch eingelöst, wenn ein E-Mail-Scanner den Link nur öffnet.
Nach der Bestätigung kann ein neues Passwort gesetzt werden. Falls ein Reset-Link nicht versendet
wird, zeigt die Webseite nun Supabase' konkrete Fehlermeldung und, sofern verfügbar, den Fehlercode;
prüfe zusätzlich **Authentication > Logs**, die SMTP-/E-Mail-Provider-Protokolle, Rate-Limits und
die Redirect-Allowlist.

Das SQL-Script legt die Rollen `user` und `admin` an, schützt Profile per Row Level Security und
erstellt den Admin-Bereich für Rollenverwaltung. Normale Nutzer können ihr eigenes Profil verwalten;
Admins können Konten einsehen, Rollen ändern, Nutzerkonten sperren und löschen sowie Passwort-Reset-
E-Mails für andere Konten einschließlich anderer Admins anfordern. Sperren, Löschen und Herabstufen
schützen das letzte aktive Administratorkonto. Dafür müssen das aktualisierte SQL-Script ausgeführt und
`manage-user-account` deployed sein. Ein bereits vorhandener, bestätigter
Account mit der Adresse `1keinsuchti1@gmail.com` wird beim Ausführen zum Admin. Falls der Account
erst danach per Admin-Einladung erstellt wird, das Script nach dem Erstellen des Kontos erneut
ausführen. Nutzer können ihr eigenes Konto im Benutzerkonto löschen; das SQL verhindert dabei, dass
der letzte Admin sein Konto entfernt.

Das Administratorkonto `1keinsuchti1@gmail.com` wird beim Ausführen des SQL-Scripts als geschützt
markiert. Andere Konten können dessen Rolle, Zugriff und Passwort nicht über den Adminbereich ändern
oder das Konto löschen. Im eigenen Benutzerkonto wird für dieses Konto die Kontolöschung ausgeblendet.
Der Schutz bleibt auch dann bestehen, wenn die E-Mail-Adresse des Kontos später geändert wird.

Nutzernamen dürfen 3 bis 24 Zeichen aus Groß- und Kleinbuchstaben, Zahlen, Punkt, Bindestrich und
Unterstrich enthalten. Die Schreibweise bleibt erhalten, beim Login wird der Name unabhängig von
Groß- und Kleinschreibung gefunden. Führe das aktualisierte SQL-Script aus, damit die Datenbank diese
Regel ebenfalls zulässt.