/**
 * types.js
 * -----------------------------------------------------------------------
 * Zentrale JSDoc-Typdefinitionen für die Datenmodelle der App. Reine
 * Dokumentation, KEIN Laufzeitcode — dieses Modul exportiert absichtlich
 * nichts Echtes (siehe `export {}` am Ende, nur nötig, damit Editoren/tsc
 * die Datei als ES-Modul behandeln). Andere Dateien referenzieren die Typen
 * per JSDoc-Import-Syntax, z.B.:
 *
 *   /** @param {Period} period *\/
 *   function example(period) { ... }
 *
 * Zweck: Editor-Autovervollständigung + optionale Typprüfung (VS Code nutzt
 * das automatisch; für eine explizite Prüfung reicht `npx tsc --checkJs
 * --allowJs --noEmit js/*.js js/data/*.js`, siehe package.json) — ganz ohne
 * TypeScript-Compiler oder Build-Schritt im eigentlichen App-Betrieb, die
 * App bleibt reines, direkt ausführbares JavaScript.
 * -----------------------------------------------------------------------
 */

/**
 * Ein erfasster Perioden-Eintrag (Start bis Ende, beide inklusive).
 * @typedef {Object} Period
 * @property {string} id
 * @property {string} start - ISO-Datum 'YYYY-MM-DD'
 * @property {string} end - ISO-Datum 'YYYY-MM-DD', >= start
 */

/**
 * Tageszeit-Angabe für einen Schmerz-Eintrag.
 * @typedef {'morning'|'midday'|'evening'|'night'} PainTimeOfDay
 */

/**
 * Ein einzelner Schmerz-Eintrag innerhalb eines Tages-Logs (ein Tag kann
 * mehrere davon haben). `category` ist eine ID aus APP_DATA.PAIN_CATEGORIES
 * oder `null` (generischer Eintrag aus dem "Schnell"-Modus, siehe
 * togglePainDayQuick() in 01-storage.js). `note` ist nur bei Kategorie
 * "sonstige" typischerweise gefüllt. `loggedAt` wird IMMER automatisch beim
 * Anlegen gesetzt (siehe nowStamp()), nur bei sehr alten, migrierten
 * Einträgen kann es `null` sein.
 * @typedef {Object} PainEntry
 * @property {string} id
 * @property {string|null} category
 * @property {number|null} intensity - 1–10
 * @property {PainTimeOfDay|null} timeOfDay
 * @property {string|null} note
 * @property {string|null} loggedAt - ISO-8601-Zeitstempel
 */

/**
 * Eine einzelne Erfassung eines Symptoms/einer Stimmung an einem Tag —
 * MEHRERE Vorkommen desselben Katalog-Eintrags pro Tag sind erlaubt (z.B.
 * Übelkeit dreimal am Tag), deshalb ist `id` eine eigene, pro Vorkommen
 * eindeutige ID und NICHT identisch mit dem Katalog-Eintrag. `catalogId`
 * referenziert einen Eintrag aus APP_DATA.SYMPTOM_CATEGORIES/MOOD_CATEGORIES
 * oder aus State.customItems.symptoms/moods (siehe symptomCatalog()/
 * moodCatalog() in 02-state-theme.js für die Label-Auflösung). Die Anzahl der
 * Vorkommen mit gleicher catalogId an einem Tag ist der kleine Zähler-Badge
 * auf dem jeweiligen Chip im Kalender-Sheet (siehe chipRowHTML(), 04-
 * calendar.js).
 * @typedef {Object} TaggedItem
 * @property {string} id - pro Vorkommen eindeutig
 * @property {string} catalogId - referenziert den Symptom-/Stimmungs-Katalog
 * @property {string|null} loggedAt - ISO-8601-Zeitstempel
 */

/**
 * Der komplette Log für einen Kalendertag (Schmerz + Symptome + Stimmung +
 * freie Notiz). Ein Tag OHNE jegliche Daten existiert nicht als Eintrag
 * (siehe upsertDayEntry() in 01-storage.js, das leere Tage automatisch
 * entfernt statt tote Datensätze zu behalten).
 * @typedef {Object} DayLog
 * @property {string} date - ISO-Datum 'YYYY-MM-DD'
 * @property {string|null} note - freie Tages-Notiz (setDayNote())
 * @property {PainEntry[]} pain
 * @property {TaggedItem[]} symptoms
 * @property {TaggedItem[]} moods
 */

/**
 * Ein nutzerdefinierter, zusätzlicher Symptom-/Stimmungs-Chip (per "+
 * Eigenes" im Tages-Sheet angelegt, siehe addCustomSymptom()/addCustomMood()
 * in 01-storage.js).
 * @typedef {Object} CustomCatalogItem
 * @property {string} id
 * @property {string} label
 */

/**
 * @typedef {Object} CustomItems
 * @property {CustomCatalogItem[]} symptoms
 * @property {CustomCatalogItem[]} moods
 */

/**
 * Kompletter Hell- ODER Dunkel-Variablensatz eines Farbthemas — Keys sind
 * CSS-Custom-Property-Namen (mit "--"-Präfix), Values Hex-/RGB-Strings.
 * Geliefert sowohl von den festen APP_DATA.THEME_PRESETS als auch von
 * generateEarthyTheme() (03-utils.js) für "Eigene Farbe".
 * @typedef {Object.<string, string>} ThemeVarSet
 */

/**
 * @typedef {Object} ThemePreset
 * @property {string} id
 * @property {string} name
 * @property {[string, string, string]} swatch - 3 Vorschau-Farben
 * @property {ThemeVarSet} light
 * @property {ThemeVarSet} dark
 */

/**
 * Persistierte Nutzer-Einstellungen (State.settings, siehe 02-state-theme.js
 * und loadSettings()/saveSettings() in 01-storage.js).
 * @typedef {Object} AppSettings
 * @property {'light'|'dark'|'system'} colorScheme
 * @property {string} themePreset - id aus APP_DATA.THEME_PRESETS ODER 'custom'
 * @property {string} [customThemeColor] - Basisfarbe (hex) für "Eigene Farbe", nur wenn themePreset === 'custom'
 * @property {'quick'|'detailed'} detailLevel
 * @property {string[]} hiddenItems - IDs aus APP_DATA.VISIBILITY_GROUPS[].items, die ausgeblendet sind
 */

/**
 * Rückgabe von computeCycleStats() (03-utils.js) — vollständige
 * Zyklus-Auswertung für die Stats-View und die Kalender-Vorhersage-Ringe.
 * @typedef {Object} CycleStats
 * @property {boolean} hasData
 * @property {boolean} [hasPrediction]
 * @property {number} [cycleCount]
 * @property {number} [excludedCycleCount]
 * @property {number} [excludedPeriodCount]
 * @property {number} [avgCycleLength]
 * @property {number} [avgPeriodLength]
 * @property {number|null} [regularityScore] - 0–100
 * @property {Date} [lastPeriodStart]
 * @property {Date|null} [nextPeriodStart]
 * @property {Date} [ovulationDate]
 * @property {Date} [fertileStart]
 * @property {Date} [fertileEnd]
 * @property {number} [currentCycleDay]
 * @property {string} [currentPhase]
 * @property {{iso: string, intensity: number}[]} [predictedPeriodDays]
 */

export {};
