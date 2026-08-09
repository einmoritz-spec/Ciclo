/* ---------------------------------------------------
   APP-INIT
   Letztes Skript im Ladeauftrag (ohne defer, daher ist die Reihenfolge der
   <script>-Tags in index.html verbindlich). DOM ist zu diesem Zeitpunkt
   bereits geparst, da die Tags am Ende von <body> stehen.
--------------------------------------------------- */
function initApp(){
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
