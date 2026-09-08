# Brouwersdam Sticker-Jagd

Eigenständiger Nachbau der 5-Tage-Sticker-Schnitzeljagd (Original: code-quest-brouwersdam.lovable.app).
Reines statisches HTML/CSS/JS (kein Build-Schritt, kein Node nötig) + Supabase als Backend.

## Was ist anders / besser als das Original

- **Kein Lovable-Lock-in**: eigener, lesbarer Code, überall hostbar (Netlify, Vercel, Cloudflare Pages, GitHub Pages, eigener Server).
- **Ausgebauter Admin-Bereich**: Tabs für Tage & Rätsel, Spieler (zurücksetzen/löschen) und Einstellungen (Passwort ändern) statt nur eines Passwort-Gates. Rätsel sind pro Tag frei konfigurierbar (Text-Rätsel, Multiple Choice, Minigame) inkl. Punkte, Bonuspunkte und Bonus-Zeitfenster.
- **Sauberere Sicherheit**: PINs und das Admin-Passwort werden gehasht (bcrypt via `pgcrypto`) gespeichert, nie im Klartext übertragen. Alle Datenbankzugriffe laufen ausschließlich über serverseitig geprüfte Postgres-Funktionen (`SECURITY DEFINER`), Tabellen sind per Row Level Security komplett gesperrt.
- **Visuelles Polish**: neue Kartenoptik, Fortschrittsbalken, Live-Countdown für zeitgesteuerte Tage, Toast-Benachrichtigungen statt `alert()`, dezente Animationen.
- **Neues Segeltrimm-Minigame**: ein kleines Timing-Spiel (Zeiger in die Zielzone treffen), Punkte werden serverseitig aus der Trefferquote berechnet, damit nichts manipulierbar ist.

## Setup

### 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) kostenlos ein Projekt erstellen.
2. Im Dashboard: **SQL Editor → New query**, den kompletten Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen und ausführen. Das legt Tabellen, Beispieldaten für die 5 Tage und alle Funktionen an.
3. Unter **Project Settings → API** die **Project URL** und den **anon public key** kopieren.

### 2. Frontend konfigurieren

In [`js/config.js`](js/config.js) die beiden Platzhalter ersetzen:

```js
window.SUPABASE_URL = "https://xxxxxxxx.supabase.co";
window.SUPABASE_ANON_KEY = "eyJ...";
```

Der `anon`-Key ist bewusst öffentlich (er landet im Browser) – das ist bei Supabase normal, solange die Datenbank per RLS abgesichert ist, was hier bereits der Fall ist.

### 3. Admin-Passwort setzen

Das Start-Passwort aus `schema.sql` ist `brouwersdam2026`. **Direkt nach dem Einrichten** unter `/admin.html` einloggen und unter „Einstellungen" ein eigenes Passwort setzen.

### 4. Lokal ansehen

Ohne Node/Python reicht das mitgelieferte PowerShell-Script (nutzt nur .NET, das auf Windows immer vorhanden ist):

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tools/dev-server.ps1 -Port 5173
```

Dann `http://localhost:5173` öffnen. Alternativ jeden beliebigen statischen Server nutzen (`npx serve`, `python -m http.server`, VS-Code „Live Server" o. ä.) – es gibt keine Server-seitige Logik außerhalb von Supabase.

### 5. Deployen

Da es eine reine statische Seite ist: den kompletten Ordner (außer `supabase/` und `tools/`, die werden nicht ausgeliefert) auf Netlify, Vercel, Cloudflare Pages oder GitHub Pages ziehen. Kein Build-Command nötig, Root-Verzeichnis ist gleichzeitig das Publish-Verzeichnis.

## Tage & Rätsel anpassen

Alles läuft über den Admin-Bereich (`/admin.html` → „Tage & Rätsel"): Titel, Teaser-Text, 4-stelliger Sticker-Code, optionaler Freischalt-Zeitpunkt, Rätseltyp (Text-Rätsel / Multiple Choice / Minigame), Frage, Antwort bzw. Auswahlmöglichkeiten, Basis- und Bonuspunkte, Bonus-Zeitfenster. Änderungen wirken sofort für alle Spieler.

## Projektstruktur

```
index.html          Startseite mit Anmeldung (Name + PIN)
mein-bereich.html    Spieler-Dashboard: 5 Tageskarten, Freischaltung, Rätsel, Mini-Rangliste
rangliste.html       Öffentliche Rangliste
admin.html           Admin-Login + Verwaltung
css/style.css        Design-System
js/app.js             Supabase-Client, Session-Handling, Header/Footer, Toasts
js/start.js           Login/Registrierung
js/mein-bereich.js    Dashboard-Logik
js/minigame.js         Segeltrimm-Minigame
js/rangliste.js        Rangliste
js/admin.js             Admin-Dashboard
supabase/schema.sql    Datenbankschema + alle RPC-Funktionen
tools/dev-server.ps1     Minimaler statischer Server für die lokale Vorschau
```

## Hinweis zur Recherche

Beim Anschauen des Originals wurde dort testweise ein Spieler „TestClaude" (PIN 1234) angelegt, um den Ablauf (Freischalten, Rätsel, Rangliste) zu verstehen. Über den echten Admin-Bereich der Originalseite lässt sich dieser Testeintrag bei Bedarf löschen.
