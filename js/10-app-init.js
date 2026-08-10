import { loadCustomItems, loadDayLogs, loadPeriods, loadSettings } from './01-storage.js';
import { State, applyColorScheme } from './02-state-theme.js';
import { renderCalendarView } from './04-calendar.js';
import { renderViewByState, replaceView } from './05-navigation.js';
import { APP_DATA } from './data/app-data.js';
// Reiner Seiteneffekt-Import: registriert den PWA-Update-Mechanismus
// (initUpdateMechanism(), 11-update.js). index.html lädt nur noch DIESE Datei
// als <script type="module">; jede andere JS-Datei wird automatisch über die
// import-Kette hier und in den importierten Dateien mitgeladen — die
// Ladereihenfolge ergibt sich dadurch aus dem Abhängigkeitsgraphen (jedes
// Modul läuft erst, NACHDEM alle seine Imports fertig ausgewertet sind),
// nicht mehr aus der Reihenfolge von <script>-Tags.
import './11-update.js';

/* ---------------------------------------------------
   APP-INIT
   Einstiegspunkt der App (einziges <script type="module"> in index.html).
   DOM ist zu diesem Zeitpunkt bereits geparst, da Modul-Skripte wie deferred
   Skripte erst nach dem HTML-Parsing ausgeführt werden.
--------------------------------------------------- */
export function initApp(){
  State.periods = loadPeriods();
  State.dayLogs = new Map(loadDayLogs().map(e => [e.date, e]));
  State.customItems = loadCustomItems();
  State.settings = { ...State.settings, ...loadSettings() };
  if (!Array.isArray(State.settings.hiddenItems)) State.settings.hiddenItems = [];
  if (!State.settings.themePreset) State.settings.themePreset = APP_DATA.DEFAULT_THEME_PRESET_ID;
  if (!State.settings.detailLevel) State.settings.detailLevel = 'quick';
  // Setzt Hell/Dunkel UND wendet direkt den passenden Variablensatz des
  // gespeicherten Farbthemas an (reapplyThemePresetVars() in 02-state-theme.js) —
  // ein separater applyThemeVars(loadThemeOverrides())-Aufruf ist dadurch nicht
  // mehr nötig.
  applyColorScheme(State.settings.colorScheme || 'system');

  // Bei 'system' live auf eine OS-Umschaltung zwischen Hell/Dunkel reagieren
  // (z.B. automatischer Wechsel bei Sonnenuntergang), ohne dass die App neu
  // geladen werden muss.
  if (window.matchMedia){
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (State.settings.colorScheme === 'system') applyColorScheme('system');
    });
  }

  // Bei einem Reload überlebt history.state für den aktuellen Verlaufseintrag
  // (siehe pushView/replaceView in 05-navigation.js) — so bleibt man z.B. nach
  // einem Reload auf "Stats" statt immer auf den Kalender zurückzuspringen.
  if (history.state && history.state.view){
    renderViewByState(history.state);
  } else {
    replaceView('calendar');
    renderCalendarView();
  }
}

initApp();
