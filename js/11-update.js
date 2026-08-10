import { consumeHardUpdatePending, exportAllData, setHardUpdatePending } from './01-storage.js';
import { State } from './02-state-theme.js';
import { formatISODate } from './03-utils.js';
import { downloadJSON, goSettings } from './09-settings.js';

/* ---------------------------------------------------
   PWA-UPDATE-MECHANISMUS
   Erkennt eine neue Service-Worker-Version und zeigt ein Banner "Neue
   Version verfügbar" statt automatisch neu zu laden -- ein Reload mitten in
   einer offenen Kalender-Auswahl, einem Import oder einem Bericht-Zeitraum
   wäre unerwünscht. Der Nutzer entscheidet per Tap.

   Der Browser erkennt den neuen Worker AUSSCHLIESSLICH an einer byteweisen
   Änderung von sw.js -- Änderungen an js/ oder css/ allein lösen nichts aus.
   Deshalb: bei jedem Deploy CACHE_NAME in sw.js hochzählen, sonst bleibt
   dieser gesamte Mechanismus wirkungslos.

   Zwei Caches liegen übereinander, und nur einer gehört der App: Cache
   Storage (self.caches, per JS löschbar, siehe sw.js) UND der HTTP-Cache des
   Browsers (GitHub Pages liefert Cache-Control: max-age=600, aus JS heraus
   NICHT direkt löschbar). runHardUpdate() unten räumt beide auf: erst
   Service Worker abmelden + Cache Storage leeren, dann jede App-Shell-Datei
   per fetch(url, { cache: 'reload' }) am HTTP-Cache vorbei neu anfragen --
   das überschreibt dabei den HTTP-Cache-Eintrag. Erst danach liefert ein
   normales location.reload() wirklich frische Dateien aus.

   Läuft bewusst NACH js/10-app-init.js (siehe Kommentar dort): der
   State-abhängige Teil hier (showPostHardUpdateBanner(), ruft goSettings()
   auf) feuert erst im 'load'-Handler, also garantiert nach dem synchron
   davor bereits gelaufenen initApp().
--------------------------------------------------- */

/** Cross-Origin-Ressourcen (z.B. externe Web-Fonts) werden bewusst
    ausgeschlossen: ändern sich nicht und würden ohne CORS nur Fehler
    produzieren. Anders als vor der Umstellung auf ES-Module lässt sich die
    JS-Dateiliste NICHT mehr vollständig per DOM-Scan ermitteln (siehe
    JS_MODULE_FILES unten). */
// Alle über den ES-Modul-Graphen geladenen JS-Dateien — seit der Umstellung
// auf ein einziges <script type="module"> (js/10-app-init.js, siehe
// index.html) sind die anderen JS-Dateien NICHT mehr als eigene <script>-Tags
// im DOM auffindbar, sondern nur noch als import-Ziele. Diese Liste muss
// deshalb von Hand mit APP_SHELL in sw.js synchron gehalten werden (gleiche
// Sorgfaltspflicht wie beim CACHE_NAME-Hochzählen dort).
const JS_MODULE_FILES = [
  './js/data/app-data.js',
  './js/types.js',
  './js/01-storage.js',
  './js/02-state-theme.js',
  './js/03-utils.js',
  './js/04-calendar.js',
  './js/05-navigation.js',
  './js/06-import.js',
  './js/07-chart.js',
  './js/08-stats-progress.js',
  './js/09-settings.js',
  './js/10-app-init.js',
  './js/11-update.js'
];

/** Liste aller App-Shell-URLs, die beim Hard-Update am HTTP-Cache vorbei neu
    angefragt werden (siehe runHardUpdate() unten). Kombiniert die per DOM
    auffindbaren Ressourcen (index.html-Grunddokument, Stylesheet, das eine
    Modul-<script>-Tag) mit der oben von Hand gepflegten JS_MODULE_FILES-Liste
    für die restlichen, nur per import geladenen Module. */
function appShellUrlsFromDocument(){
  const urls = ['./', 'index.html', 'manifest.json', ...JS_MODULE_FILES];
  document.querySelectorAll('script[src]').forEach(el => {
    const src = el.getAttribute('src');
    if (src && !/^https?:/i.test(src)) urls.push(src);
  });
  document.querySelectorAll('link[rel="stylesheet"]').forEach(el => {
    const href = el.getAttribute('href');
    if (href && !/^https?:/i.test(href)) urls.push(href);
  });
  return Array.from(new Set(urls));
}

/** Backup vor dem Hard-Update -- nutzt dieselbe downloadJSON()/exportAllData()-
    Kombination wie der reguläre "Daten exportieren"-Button (handleExportClick(),
    09-settings.js), damit die Backup-Datei exakt dasselbe Format hat wie ein
    manueller Export. Schlägt der Download aus irgendeinem Grund fehl, bricht
    der Update-Ablauf trotzdem NICHT ab -- ein Backup ist ein Sicherheitsnetz,
    kein Update-Blocker. */
function backupBeforeHardUpdate(){
  try {
    downloadJSON(exportAllData(), `ciclo-backup-vor-update-${formatISODate(State.today)}.json`);
  } catch (err) {
    console.error('[update] Backup vor Update fehlgeschlagen:', err);
  }
}

/** Kompletter Hard-Update-Ablauf, ausgelöst per Tap auf den Update-Toast
    (siehe wireUpdateToast()). Reihenfolge ist wichtig: erst sichern (Backup +
    Marker), dann abräumen (Service Worker + beide Caches), zuletzt neu laden. */
async function runHardUpdate(){
  backupBeforeHardUpdate();
  setHardUpdatePending();

  if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations){
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister().catch(() => {})));
  }

  if (window.caches){
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
  }

  // Der entscheidende Schritt gegen den HTTP-Cache des Browsers (siehe
  // Datei-Kommentar oben) -- ohne ihn würde ein normales location.reload()
  // JS/CSS trotz geleertem Service-Worker-Cache weiter aus dem HTTP-Cache
  // ausliefern.
  await Promise.all(appShellUrlsFromDocument().map(u =>
    fetch(u, { cache: 'reload' }).catch(() => {})
  ));

  location.reload();
}

function showUpdateToast(){
  const toast = document.getElementById('updateToast');
  if (toast) toast.classList.add('is-visible');
}

/** Wiring für den "Aktualisieren"-Button -- sofort beim Laden verfügbar (das
    Markup steht statisch in index.html), unabhängig davon, ob der Toast
    gerade sichtbar ist. Button wird beim Tap deaktiviert, damit ein zweiter
    Tap während des laufenden Ablaufs (Backup-Download + Cache-Aufräumen kann
    kurz dauern) nicht versehentlich runHardUpdate() doppelt anstößt. */
function wireUpdateToast(){
  const btn = document.getElementById('updateToastBtn');
  if (!btn) return;
  btn.onclick = () => {
    btn.disabled = true;
    btn.textContent = 'Aktualisiere …';
    runHardUpdate();
  };
}

/** Zeigt einmalig den Hinweis-Banner nach einem abgeschlossenen Hard-Update
    (Marker siehe setHardUpdatePending()/consumeHardUpdatePending(), 01-
    storage.js). "Einstellungen"-Button führt zur bestehenden Backup-Import-
    Funktion (Einstellungen -> Backup importieren, 09-settings.js) statt hier
    eine zweite Import-Ecke zu bauen. */
function showPostHardUpdateBanner(){
  if (!consumeHardUpdatePending()) return;

  const toast = document.getElementById('postUpdateToast');
  if (!toast) return;
  toast.classList.add('is-visible');

  const settingsBtn = document.getElementById('postUpdateToastBtn');
  if (settingsBtn){
    settingsBtn.onclick = () => {
      toast.classList.remove('is-visible');
      goSettings();
    };
  }
  const dismissBtn = document.getElementById('postUpdateToastDismiss');
  if (dismissBtn){
    dismissBtn.onclick = () => toast.classList.remove('is-visible');
  }
}

/** Registriert den Service Worker und beobachtet ihn auf eine neue Version.
    Kein automatischer Reload, siehe Datei-Kommentar oben -- der Nutzer
    entscheidet per Tap auf den Toast (wireUpdateToast()). */
function initUpdateMechanism(){
  wireUpdateToast();

  window.addEventListener('load', () => {
    showPostHardUpdateBanner();

    if (!('serviceWorker' in navigator)) return;

    const hadControllerBefore = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.register('sw.js').then((registration) => {
      // Ein bereits wartender Worker feuert 'updatefound' NICHT erneut -> separat
      // prüfen, sonst bleibt der Toast nach einem Tab-Wechsel/Reload unsichtbar.
      if (registration.waiting && hadControllerBefore) showUpdateToast();

      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;
        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && hadControllerBefore) showUpdateToast();
        });
      });

      // Periodisch + bei Rückkehr in den Tab erneut prüfen -- sonst prüft der
      // Browser bei einer installierten PWA teils tagelang nicht von selbst nach.
      setInterval(() => registration.update().catch(() => {}), 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) registration.update().catch(() => {});
      });
    }).catch((err) => {
      console.error('[update] Service Worker Registrierung fehlgeschlagen:', err);
    });
  });
}

initUpdateMechanism();
