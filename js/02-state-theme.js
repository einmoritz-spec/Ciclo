/**
 * 02-state-theme.js
 * -----------------------------------------------------------------------
 * Einzige Quelle für globalen State. Tiefere Module (05, 06, ...) lesen
 * und schreiben ausschließlich über das State-Objekt, legen aber NIE neue
 * globale Variablen an.
 * -----------------------------------------------------------------------
 */

const State = {
  // Geladene Perioden-Einträge: [{ id, start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }]
  periods: [],

  // Aktive Tab-View: 'calendar' | 'chart' | 'stats'
  currentView: 'calendar',

  // Kalender-Laufzeitstatus
  calendar: {
    earliestLoaded: null,        // { year, month } ältester geladener Monat
    latestLoaded: null,          // { year, month } neuester geladener Monat
    selection: { start: null }   // laufende Klick-Auswahl (ISO-Datum) für Perioden-Eingabe
  },

  today: new Date(),

  // Nutzer-Einstellungen (09-settings.js). colorScheme: 'light' | 'dark' | 'system'.
  // themePreset: id aus APP_DATA.THEME_PRESETS ('sand' | 'wald' | 'ton' | 'stein').
  // detailLevel: 'quick' | 'detailed' — steuert, ob ein per langem Druck markierter
  // Schmerztag nur pauschal (quick) oder mit Kategorien aus APP_DATA.PAIN_CATEGORIES
  // (detailed) erfasst wird, siehe openDayDetailSheet() in 04-calendar.js.
  // hiddenItems: Array von IDs aus APP_DATA.VISIBILITY_GROUPS, die per langem Druck
  // ausgeblendet wurden (siehe hideItem()/showItem() unten).
  // Wird in initApp() (10-app-init.js) mit dem gespeicherten Wert aus loadSettings()
  // überschrieben; die Defaults hier gelten nur für Erstinstallationen.
  settings: { colorScheme: 'system', themePreset: 'wald', detailLevel: 'quick', hiddenItems: [] },

  // Map von ISO-Datum -> Tages-Log ({ date, pain: [...], symptoms: [...], moods: [...] }),
  // befüllt in initApp() aus loadDayLogs() (01-storage.js). pain ist ein Array,
  // da ein Tag mehrere Schmerz-Einträge (je mit Kategorie/Intensität/Tageszeit)
  // haben kann; im "Schnell"-Detailgrad enthält es höchstens einen generischen
  // Eintrag ohne Kategorie/Intensität. symptoms/moods sind Arrays von IDs aus
  // APP_DATA.SYMPTOM_CATEGORIES/MOOD_CATEGORIES bzw. State.customItems — beide
  // nur im Detailgrad "Detailliert" befüllbar (siehe openDayDetailSheet() in
  // 04-calendar.js).
  dayLogs: new Map(),

  // Nutzerdefinierte, zusätzliche Symptom-/Stimmungs-Chips (siehe
  // addCustomSymptom()/addCustomMood() in 01-storage.js), ergänzen die festen
  // Listen aus APP_DATA. Befüllt in initApp() aus loadCustomItems().
  customItems: { symptoms: [], moods: [] }
};

/** Volle Symptom-/Stimmungs-Liste (feste Katalog-Einträge + eigene, per
    "+ Eigenes" ergänzte Chips) — einzige Quelle für Sheet-Anzeige UND
    Label-Auflösung in den Statistiken (08-stats-progress.js/07-chart.js). */
function symptomCatalog(){
  return APP_DATA.SYMPTOM_CATEGORIES.concat(State.customItems.symptoms || []);
}
function moodCatalog(){
  return APP_DATA.MOOD_CATEGORIES.concat(State.customItems.moods || []);
}

/**
 * Setzt Hell/Dunkel über ein data-Attribut auf <html> — die dunklen Varianten der
 * Farb-Variablen liegen als :root[data-theme="dark"]-Block in css/styles.css.
 * Bei 'system' wird die Betriebssystem-Einstellung per prefers-color-scheme gelesen.
 * Da jedes Farbthema (APP_DATA.THEME_PRESETS) einen eigenen Hell- UND Dunkel-
 * Variablensatz mitbringt, wird nach dem Umschalten direkt der zum aktiven
 * Thema passende Satz erneut angewendet (reapplyThemePresetVars()) — sonst
 * würde applyThemeVars() als Inline-Style weiterhin die Werte des vorherigen
 * Modus überschreiben.
 */
function applyColorScheme(mode){
  const resolved = mode === 'system'
    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode;
  document.documentElement.dataset.theme = resolved;
  State.settings.colorScheme = mode;
  reapplyThemePresetVars();
}

/**
 * Wendet ein Objekt aus CSS-Custom-Properties als Inline-Styles auf :root an.
 * Wird sowohl von reapplyThemePresetVars() (Farbthema-Wechsel) als auch beim
 * Wiederherstellen eines Backups genutzt.
 */
function applyThemeVars(overrides) {
  if (!overrides || typeof overrides !== 'object') return;
  const root = document.documentElement;
  Object.keys(overrides).forEach(key => {
    if (key.startsWith('--')) {
      root.style.setProperty(key, overrides[key]);
    }
  });
}

/** Liefert das aktuell aufgelöste Hell/Dunkel ('light'|'dark'), unabhängig davon,
    ob State.settings.colorScheme auf 'system' steht oder fest gesetzt ist. */
function resolvedColorScheme(){
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Wendet den Variablensatz (light/dark) des aktuell in State.settings.themePreset
    gewählten Farbthemas an und sichert ihn zusätzlich als rohes Overrides-Objekt
    (loadThemeOverrides()/saveThemeOverrides(), 01-storage.js) — u.a. damit ein
    Vollbackup (exportAllData()) den aktuellen Anzeigezustand mitsichert.
    Aktualisiert zusätzlich das <meta name="theme-color">-Tag: das steuert bei
    einer installierten PWA auf Android die Farbe der System-Statusleiste. Ohne
    diesen Schritt bliebe die Statusleiste unabhängig vom gewählten Farbthema
    fest auf der Farbe aus index.html (Wald, das Default-Thema) stehen. */
function reapplyThemePresetVars(){
  const presetId = State.settings.themePreset || APP_DATA.DEFAULT_THEME_PRESET_ID;
  let vars;
  if (presetId === 'custom' && State.settings.customThemeColor){
    // "Eigene Farbe": kein fester Eintrag in APP_DATA.THEME_PRESETS, sondern
    // live aus der gespeicherten Basisfarbe abgeleitet (generateEarthyTheme(),
    // 03-utils.js) — so bleibt der Vorrat an "fest hinterlegten" Themen klein
    // und trotzdem lässt sich aus der ganzen Palette wählen.
    const generated = generateEarthyTheme(State.settings.customThemeColor);
    vars = resolvedColorScheme() === 'dark' ? generated.dark : generated.light;
  } else {
    const preset = APP_DATA.THEME_PRESETS.find(p => p.id === presetId)
      || APP_DATA.THEME_PRESETS.find(p => p.id === APP_DATA.DEFAULT_THEME_PRESET_ID);
    vars = resolvedColorScheme() === 'dark' ? preset.dark : preset.light;
  }
  applyThemeVars(vars);
  saveThemeOverrides(vars);

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor && vars['--color-header-bg']) metaThemeColor.setAttribute('content', vars['--color-header-bg']);
}

/** Wechselt das Farbthema (Sand/Wald/Ton/Stein, siehe APP_DATA.THEME_PRESETS)
    und persistiert die Wahl in State.settings (09-settings.js). */
function applyThemePreset(presetId){
  State.settings.themePreset = presetId;
  saveSettings(State.settings);
  reapplyThemePresetVars();
}

/* ---------------------------------------------------
   SICHTBARKEIT VON STATS-/CHART-ELEMENTEN
   Jede Karte/Zeile in Stats und Chart kann per langem Druck ausgeblendet
   werden (siehe attachLongPress() unten, verwendet in 08-stats-progress.js
   und 07-chart.js) und in den Einstellungen unter "Sichtbare Bereiche"
   wieder eingeblendet werden (09-settings.js). Die IDs kommen zentral aus
   APP_DATA.VISIBILITY_GROUPS. Persistiert als Teil von State.settings, also
   über dieselbe loadSettings()/saveSettings()-Ablage wie das Farbschema.
--------------------------------------------------- */
function isItemHidden(id){
  return (State.settings.hiddenItems || []).includes(id);
}

function hideItem(id){
  const hidden = new Set(State.settings.hiddenItems || []);
  hidden.add(id);
  State.settings.hiddenItems = Array.from(hidden);
  saveSettings(State.settings);
}

function showItem(id){
  const hidden = new Set(State.settings.hiddenItems || []);
  hidden.delete(id);
  State.settings.hiddenItems = Array.from(hidden);
  saveSettings(State.settings);
}

/** Registriert Long-Press (500ms Pointer-Halten, bricht bei >10px Bewegung ab —
    gleiches Timing wie der Schmerztag-Long-Press im Kalender, 04-calendar.js,
    aber als eigenständige, wiederverwendbare Version für einzelne Elemente statt
    einen delegierten Container-Handler) auf einem einzelnen Element. Pointer
    Events statt separater Touch-/Maus-Handler, deckt beides ab. Unterdrückt den
    direkt folgenden Klick, damit kein onClick auf demselben Element danach
    zusätzlich feuert. */
function attachLongPress(el, onLongPress, duration){
  let timer = null;
  let startX = 0, startY = 0;
  let triggered = false;

  const cancelTimer = () => { if (timer) clearTimeout(timer); timer = null; };

  el.addEventListener('pointerdown', (e) => {
    startX = e.clientX; startY = e.clientY;
    triggered = false;
    cancelTimer();
    timer = setTimeout(() => { triggered = true; onLongPress(); }, duration ?? 500);
  });
  el.addEventListener('pointermove', (e) => {
    if (!timer) return;
    if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) cancelTimer();
  });
  el.addEventListener('pointerup', cancelTimer);
  el.addEventListener('pointercancel', cancelTimer);
  el.addEventListener('click', (e) => {
    if (triggered){
      e.preventDefault();
      e.stopPropagation();
      triggered = false;
    }
  }, true);
}

/** Alle Sichtbarkeits-Items aus APP_DATA.VISIBILITY_GROUPS als flache Liste
    (ohne Gruppierung) — für Stellen, die nur die id->label-Auflösung brauchen,
    nicht die Gruppen-Struktur (z.B. wireVisibilityLongPress() unten). Die
    Gruppen selbst werden nur für die Anzeige in "Sichtbare Bereiche" (09-
    settings.js) gebraucht. */
function flatVisibilityItems(){
  return APP_DATA.VISIBILITY_GROUPS.flatMap(g => g.items);
}

/** Sucht innerhalb von `root` alle Elemente mit einem data-vis-id-Attribut und
    hängt attachLongPress() dran: beim Auslösen wird NICHT sofort ausgeblendet,
    sondern ein Bestätigungs-Toast mit "Ausblenden"-Button gezeigt (showToast()
    unten) — erst ein zusätzlicher Tap auf den Button blendet die Karte aus und
    ruft rerenderFn() auf. Ohne Bestätigung (Timeout/ignoriert) bleibt die Karte
    unverändert sichtbar, damit ein versehentlicher langer Druck nichts auslöst. */
function wireVisibilityLongPress(root, rerenderFn){
  root.querySelectorAll('[data-vis-id]').forEach(el => {
    attachLongPress(el, () => {
      const id = el.dataset.visId;
      const item = flatVisibilityItems().find(i => i.id === id);
      const label = item ? item.label : 'Element';
      showToast(`"${label}" ausblenden?`, {
        label: 'Ausblenden',
        onConfirm: () => {
          hideItem(id);
          rerenderFn();
        }
      });
    });
  });
}

/** Kurzer, selbst verschwindender Hinweistext unten im Bildschirm. Ohne `action`
    reines Feedback (z.B. für zukünftige Meldungen), MIT `action` ein Bestätigungs-
    Toast mit Button: die eigentliche Wirkung (z.B. Ausblenden) passiert erst bei
    Tap auf den Button (action.onConfirm), nicht schon beim Long-Press selbst —
    siehe wireVisibilityLongPress() oben. Bestätigungs-Toasts bleiben länger stehen
    und sind (anders als reine Hinweis-Toasts) tap-fähig (pointer-events). */
function showToast(text, action){
  const el = document.createElement('div');
  el.className = 'visibility-toast' + (action ? ' is-confirm' : '');

  const textEl = document.createElement('span');
  textEl.className = 'visibility-toast-text';
  textEl.textContent = text;
  el.appendChild(textEl);

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    el.remove();
  };

  if (action){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'visibility-toast-btn';
    btn.textContent = action.label;
    btn.onclick = () => {
      action.onConfirm();
      remove();
    };
    el.appendChild(btn);
  }

  document.body.appendChild(el);
  setTimeout(remove, action ? 4700 : 2600);
}
