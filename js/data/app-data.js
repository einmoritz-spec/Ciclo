/**
 * app-data.js
 * -----------------------------------------------------------------------
 * Zentrale Datenschicht: Konstanten, Defaults, Storage-Key-Namen.
 * Enthält KEINE Logik und KEINEN State — nur statische Werte.
 * Wird als erstes Skript geladen (vor 01-storage.js).
 * -----------------------------------------------------------------------
 */

const APP_DATA = {
  APP_NAME: 'Ciclo',
  APP_VERSION: '0.1.0',

  // Zentrale Storage-Keys (Single Source of Truth für 01-storage.js). Bleiben
  // bewusst beim alten "tracker_"-Präfix aus der Zeit vor der Umbenennung zu
  // "Ciclo" — ein Umbenennen der Keys würde bei bereits installierten
  // Nutzer:innen beim nächsten Laden alle lokal gespeicherten Perioden/
  // Einstellungen verlieren (localStorage kennt die alten Keys nicht mehr).
  STORAGE_KEYS: {
    PERIODS: 'tracker_periods_v1',
    THEME: 'tracker_theme_v1',
    SETTINGS: 'tracker_settings_v1',
    PAIN_DAYS: 'tracker_pain_days_v1'
  },

  // Zyklus-Defaults für die spätere Vorhersage-Engine (03-utils.js)
  CYCLE_DEFAULTS: {
    AVERAGE_CYCLE_LENGTH: 28,   // Tage zwischen zwei Periodenstarts
    AVERAGE_PERIOD_LENGTH: 5,   // Tage Regelblutung
    LUTEAL_PHASE_LENGTH: 14,    // Tage zwischen Eisprung und nächster Periode
    MAX_SELECTION_RANGE_DAYS: 12 // Max. Abstand für Drag/Klick-Bereichsauswahl
  },

  // Wochentags-Labels, Montag-first (wie im Kalenderraster verwendet)
  WEEKDAYS_DE: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],

  // Inline-SVGs für die Bottom-Nav (stroke="currentColor" -> folgt automatisch der
  // Textfarbe/den Theme-Variablen, kein externer Icon-Font/CDN nötig -> offlinefest).
  ICONS: {
    NAV_CALENDAR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"></rect><line x1="3" y1="10" x2="21" y2="10"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="16" y1="2" x2="16" y2="6"></line></svg>',
    NAV_CHART: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 8 10 12 14 16 6 21 11"></polyline><line x1="3" y1="21" x2="21" y2="21"></line></svg>',
    NAV_STATS: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 3 v9 h9"></path></svg>',
    IMPORT: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"></path><path d="M7 10l5 5 5-5"></path><path d="M4 21h16"></path></svg>',
    SETTINGS: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg>',
    CHECK: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 12.5 9.5 18 20 6"></polyline></svg>'
  },

  // Vorausgewähltes Farbthema für Erstinstallationen (siehe State.settings in
  // 02-state-theme.js) — Reihenfolge von THEME_PRESETS unten entspricht der
  // Anzeige-Reihenfolge in den Einstellungen (Sand, Wald, Ton, Stein) und soll
  // NICHT verändert werden, nur weil sich der Default ändert.
  DEFAULT_THEME_PRESET_ID: 'wald',

  // Vollständige Farbthemen für die "Farbthema"-Auswahl in 09-settings.js
  // (ersetzt die frühere einzelne Akzentfarben-Auswahl). Jedes Thema liefert
  // ZWEI komplette Variablensätze — "light" und "dark" — damit der bestehende
  // Hell/Dunkel/System-Umschalter (applyColorScheme(), 02-state-theme.js)
  // unabhängig vom gewählten Thema weiter funktioniert; reapplyThemePresetVars()
  // wählt je nach aufgelöstem Farbschema den passenden Satz. "swatch" sind die
  // drei Vorschau-Streifen in der Themen-Zeile (Akzent/Hintergrund/Header-Ton),
  // an die "Sand/Wald/Ton/Stein"-Vorlage angelehnt.
  THEME_PRESETS: [
    {
      id: 'sand',
      name: 'Sand',
      swatch: ['#CC8B49', '#F3ECDF', '#5C4530'],
      light: {
        '--color-header-bg': '#332A1D',
        '--color-header-text': '#FFFFFF',
        '--color-brand': '#E3C08B',
        '--color-bg': '#F3EEE2',
        '--color-surface': '#FFFFFF',
        '--color-accent': '#CC8B49',
        '--color-text-heading': '#332A1D',
        '--color-text-day': '#5C4E3D',
        '--color-text-muted': '#9C8F79',
        '--color-period-bg': '#E8C9AE',
        '--color-period-text': '#7A4A28',
        '--color-predicted-rgb': '196, 108, 58',
        '--color-pain': '#9A6B8B',
        '--color-selecting-outline': '#CC8B49',
        '--color-nav-inactive': '#B4A791'
      },
      dark: {
        '--color-header-bg': '#241D14',
        '--color-header-text': '#FFFFFF',
        '--color-brand': '#E3C08B',
        '--color-bg': '#1A150F',
        '--color-surface': '#2B241A',
        '--color-accent': '#CC8B49',
        '--color-text-heading': '#F3ECE0',
        '--color-text-day': '#D8CBB8',
        '--color-text-muted': '#A79A85',
        '--color-period-bg': '#4A3624',
        '--color-period-text': '#E8C9AE',
        '--color-predicted-rgb': '196, 108, 58',
        '--color-pain': '#B48CA6',
        '--color-selecting-outline': '#CC8B49',
        '--color-nav-inactive': '#6E6353'
      }
    },
    {
      id: 'wald',
      name: 'Wald',
      swatch: ['#6E8F52', '#EEF0E1', '#232A1B'],
      light: {
        '--color-header-bg': '#23281B',
        '--color-header-text': '#FFFFFF',
        '--color-brand': '#A8C08A',
        '--color-bg': '#EDEFE1',
        '--color-surface': '#FFFFFF',
        '--color-accent': '#5C7A3E',
        '--color-text-heading': '#262C1C',
        '--color-text-day': '#3E4832',
        '--color-text-muted': '#8B9179',
        '--color-period-bg': '#DFC9A6',
        '--color-period-text': '#6E4A26',
        '--color-predicted-rgb': '166, 84, 58',
        '--color-pain': '#7C6FA8',
        '--color-selecting-outline': '#5C7A3E',
        '--color-nav-inactive': '#A3AC95'
      },
      dark: {
        '--color-header-bg': '#181D12',
        '--color-header-text': '#FFFFFF',
        '--color-brand': '#A8C08A',
        '--color-bg': '#14170F',
        '--color-surface': '#1E2417',
        '--color-accent': '#7C9E5C',
        '--color-text-heading': '#EDEFE1',
        '--color-text-day': '#C7CDBA',
        '--color-text-muted': '#8F977E',
        '--color-period-bg': '#3F311E',
        '--color-period-text': '#E3C9A0',
        '--color-predicted-rgb': '166, 84, 58',
        '--color-pain': '#9689C9',
        '--color-selecting-outline': '#7C9E5C',
        '--color-nav-inactive': '#5D6650'
      }
    },
    {
      id: 'ton',
      name: 'Ton',
      swatch: ['#B4603F', '#F3EAE1', '#5B2A22'],
      light: {
        '--color-header-bg': '#3A1F19',
        '--color-header-text': '#FFFFFF',
        '--color-brand': '#E3A98C',
        '--color-bg': '#F3EAE1',
        '--color-surface': '#FFFFFF',
        '--color-accent': '#B4603F',
        '--color-text-heading': '#3A1F19',
        '--color-text-day': '#5C4038',
        '--color-text-muted': '#9C8378',
        '--color-period-bg': '#EAC2AE',
        '--color-period-text': '#7A3320',
        '--color-predicted-rgb': '180, 96, 63',
        '--color-pain': '#7E6F9E',
        '--color-selecting-outline': '#B4603F',
        '--color-nav-inactive': '#C2A99C'
      },
      dark: {
        '--color-header-bg': '#241310',
        '--color-header-text': '#FFFFFF',
        '--color-brand': '#E3A98C',
        '--color-bg': '#1B1210',
        '--color-surface': '#2A1A16',
        '--color-accent': '#C77A54',
        '--color-text-heading': '#F3E2D8',
        '--color-text-day': '#D9C2B7',
        '--color-text-muted': '#A68F84',
        '--color-period-bg': '#4A2A1F',
        '--color-period-text': '#EAC2AE',
        '--color-predicted-rgb': '180, 96, 63',
        '--color-pain': '#9689BE',
        '--color-selecting-outline': '#C77A54',
        '--color-nav-inactive': '#6B564C'
      }
    },
    {
      id: 'stein',
      name: 'Stein',
      swatch: ['#A69880', '#EDEBE4', '#3A3A3A'],
      light: {
        '--color-header-bg': '#2E2C28',
        '--color-header-text': '#FFFFFF',
        '--color-brand': '#C9BFA9',
        '--color-bg': '#EDEBE4',
        '--color-surface': '#FFFFFF',
        '--color-accent': '#8C7F63',
        '--color-text-heading': '#2E2C28',
        '--color-text-day': '#4E4A42',
        '--color-text-muted': '#948C7C',
        '--color-period-bg': '#DCC9BE',
        '--color-period-text': '#6B4A3E',
        '--color-predicted-rgb': '150, 90, 70',
        '--color-pain': '#7C7398',
        '--color-selecting-outline': '#8C7F63',
        '--color-nav-inactive': '#B3ABA0'
      },
      dark: {
        '--color-header-bg': '#1E1D1A',
        '--color-header-text': '#FFFFFF',
        '--color-brand': '#C9BFA9',
        '--color-bg': '#171614',
        '--color-surface': '#242320',
        '--color-accent': '#A79A7D',
        '--color-text-heading': '#EDEBE4',
        '--color-text-day': '#CBC6BB',
        '--color-text-muted': '#938C7F',
        '--color-period-bg': '#3E322C',
        '--color-period-text': '#DCC9BE',
        '--color-predicted-rgb': '150, 90, 70',
        '--color-pain': '#948BA8',
        '--color-selecting-outline': '#A79A7D',
        '--color-nav-inactive': '#5C574E'
      }
    }
  ],

  // Zentrale Liste aller Stats-/Chart-Elemente, die per langem Druck ausgeblendet
  // werden können (siehe hideItem()/showItem() in 02-state-theme.js). Jede id
  // taucht als data-vis-id im jeweiligen Karten-Markup auf (08-stats-progress.js,
  // 07-chart.js) UND als Zeile in der "Sichtbare Bereiche"-Liste in den
  // Einstellungen (09-settings.js) — eine Quelle für beide Stellen, damit nichts
  // auseinanderlaufen kann.
  VISIBILITY_ITEMS: [
    { id: 'stat-avgCycle', label: 'Ø Zykluslänge (Stats)' },
    { id: 'stat-avgPeriod', label: 'Ø Periodendauer (Stats)' },
    { id: 'stat-regularity', label: 'Regelmäßigkeit (Stats)' },
    { id: 'stat-lastPeriod', label: 'Letzte Periode (Stats)' },
    { id: 'stat-nextPeriod', label: 'Nächste Periode (Stats)' },
    { id: 'stat-fertileWindow', label: 'Fruchtbares Fenster (Stats)' },
    { id: 'stat-ovulation', label: 'Geschätzter Eisprung (Stats)' },
    { id: 'stat-painTotal', label: 'Schmerztage insgesamt (Stats)' },
    { id: 'chart-periodLength', label: 'Periodendauer-Diagramm (Chart)' },
    { id: 'chart-cycleLength', label: 'Zykluslängen-Diagramm (Chart)' },
    { id: 'chart-painPhase', label: 'Schmerztage-nach-Phase-Diagramm (Chart)' }
  ]
};
