# Ciclo

Periodenkalender: Verlauf und Vorhersage — alle Daten bleiben lokal auf dem
Gerät (localStorage), keine Server, kein Tracking.

## App ausführen

Die App selbst braucht **kein npm, keinen Build-Schritt, keinen Bundler**.
`index.html` öffnen (oder über einen beliebigen statischen Webserver
ausliefern, z.B. GitHub Pages) — fertig. Alle JS-Dateien sind native
ES-Module (`import`/`export`), die der Browser direkt auflöst.

```
index.html            Einstiegspunkt, ein einziges <script type="module">
css/styles.css         Design-Tokens (CSS-Custom-Properties) + Layout
js/data/app-data.js    Konstanten, Defaults, Storage-Keys (keine Logik)
js/types.js            Zentrale JSDoc-Typdefinitionen (reine Doku, kein Code)
js/01-storage.js        Persistenz (localStorage)
js/02-state-theme.js    Globaler State + Farbthemen
js/03-utils.js          Reine Rechenfunktionen (Datum, Zyklus-Vorhersage, Stats)
js/04-calendar.js       Kalender-View + Tages-Erfassungs-Sheet
js/05-navigation.js     Bottom-Nav + Zurück-Taste
js/06-import.js         Drip-CSV-Import
js/07-chart.js          Chart-View (SVG-Diagramme)
js/08-stats-progress.js Stats-View
js/09-settings.js       Einstellungen
js/10-app-init.js       App-Init (lädt transitiv alle anderen Module)
js/11-update.js         PWA-Update-Mechanismus
sw.js                   Service Worker (Cache-First, offlinefähig)
```

Beim Ändern von etwas in `js/` oder `css/`: `CACHE_NAME` in `sw.js`
hochzählen, sonst liefert der Service Worker weiterhin die alte, gecachte
Fassung aus.

## Entwickler-Tooling (optional)

Für Tests und optionale Typprüfung — betrifft NUR die Entwicklung, hat keinen
Einfluss auf die ausgelieferte App:

```
npm install        # einmalig
npm test            # Vitest-Testsuite (Rechenlogik + Storage-Schicht)
npm run test:watch  # Tests im Watch-Modus
npm run typecheck   # JSDoc-Typprüfung über TypeScript (--checkJs, kein Build)
```

Die Tests decken die reine Rechenlogik ab (Zyklus-Vorhersage, Trend-
Regression, Phasenzuordnung, Ausreißer-Erkennung, Farb-Generator für "Eigene
Farbe") sowie die komplette Persistenz-Schicht (Perioden, Schmerz-/Symptom-/
Stimmungs-Einträge, Backup-Export/-Import, Migrationen alter Datenformate).
