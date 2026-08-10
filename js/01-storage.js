/**
 * 01-storage.js
 * -----------------------------------------------------------------------
 * Ausschließlich Persistenz. Kein State, keine DOM-Zugriffe.
 * Nutzt localStorage (IndexedDB ist für den Datenumfang von Zyklusdaten
 * nicht nötig). Alle Keys kommen aus APP_DATA.STORAGE_KEYS (app-data.js).
 * -----------------------------------------------------------------------
 */

function generatePeriodId() {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function loadPeriods() {
  try {
    const raw = localStorage.getItem(APP_DATA.STORAGE_KEYS.PERIODS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[storage] Perioden konnten nicht geladen werden:', err);
    return [];
  }
}

function savePeriods(periods) {
  try {
    localStorage.setItem(APP_DATA.STORAGE_KEYS.PERIODS, JSON.stringify(periods));
    return true;
  } catch (err) {
    console.error('[storage] Perioden konnten nicht gespeichert werden:', err);
    return false;
  }
}

function addPeriodEntry(startISO, endISO) {
  const periods = loadPeriods();
  const entry = { id: generatePeriodId(), start: startISO, end: endISO };
  periods.push(entry);
  periods.sort((a, b) => a.start.localeCompare(b.start));
  savePeriods(periods);
  return entry;
}

function deletePeriodEntry(periodId) {
  const periods = loadPeriods().filter(p => p.id !== periodId);
  savePeriods(periods);
  return periods;
}

/** Aktualisiert eine bestehende Periode (z.B. neues Enddatum beim nachträglichen
    Verlängern per Klick, siehe findExtendablePeriod()/handleDayClick() in
    04-calendar.js) statt sie zu löschen und neu anzulegen. */
function updatePeriodEntry(periodId, updates) {
  const periods = loadPeriods();
  const idx = periods.findIndex(p => p.id === periodId);
  if (idx === -1) return periods;
  periods[idx] = { ...periods[idx], ...updates };
  periods.sort((a, b) => a.start.localeCompare(b.start));
  savePeriods(periods);
  return periods;
}

function generateEntryId(prefix){
  return (prefix || 'e') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/** Aktueller Zeitstempel (ISO 8601, echte Uhrzeit inkl. Sekunden) für die
    automatische Erfassungszeit jedes Schmerz-/Symptom-/Stimmungs-Eintrags —
    bewusst der echte "jetzt"-Zeitpunkt (new Date()), nicht State.today (das
    trägt nur das Datum für die Zyklus-Berechnung, keine Uhrzeit). */
function nowStamp(){
  return new Date().toISOString();
}

/** Bringt eine geladene/migrierte Tages-Log-Liste in die aktuelle, vollständige
    Form: jeder Schmerz-Eintrag bekommt garantiert `note`/`loggedAt` (fehlen bei
    älteren, bereits migrierten Installationen), jeder Symptom-/Stimmungs-
    Eintrag wird von einer reinen ID (Vorversion ohne Zeiterfassung) zu einem
    { id, loggedAt }-Objekt normalisiert. Macht loadDayLogs() unabhängig davon,
    aus welcher App-Version die gespeicherten Daten stammen. */
function normalizeDayLogs(dayLogs){
  const normalizeTagged = (list) => (list || []).map(item =>
    typeof item === 'string' ? { id: item, loggedAt: null } : { id: item.id, loggedAt: item.loggedAt ?? null }
  );
  return dayLogs.map(entry => ({
    date: entry.date,
    pain: (entry.pain || []).map(p => ({
      id: p.id || generateEntryId('p'),
      category: p.category ?? null,
      intensity: p.intensity ?? null,
      timeOfDay: p.timeOfDay ?? null,
      note: p.note ?? null,
      loggedAt: p.loggedAt ?? null
    })),
    symptoms: normalizeTagged(entry.symptoms),
    moods: normalizeTagged(entry.moods)
  }));
}

/** Liest NUR den alten Schmerztage-Key (Version vor den Tages-Logs). Wird
    ausschließlich einmalig von loadDayLogs() für die Migration verwendet —
    kein anderer Code darf mehr direkt darauf zugreifen. Deckt beide früheren
    Formate ab: reine ISO-Strings (sehr alte Version) und { date, categories }. */
function _loadLegacyPainDays(){
  try {
    const raw = localStorage.getItem(APP_DATA.STORAGE_KEYS.PAIN_DAYS);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(entry => typeof entry === 'string' ? { date: entry, categories: [] } : entry);
  } catch (err) {
    console.error('[storage] Alte Schmerztage konnten nicht gelesen werden:', err);
    return [];
  }
}

/** Leerer Tages-Log als Ausgangspunkt für getDayEntry()/upsertDayEntry(). */
function emptyDayEntry(iso){
  return { date: iso, pain: [], symptoms: [], moods: [] };
}

/** Lädt alle Tages-Logs (Schmerz-Einträge + Symptome + Stimmungen je Datum,
    aufsteigend nach Datum sortiert), immer in der aktuellen Datenform
    (normalizeDayLogs()). Beim allerersten Aufruf nach einem Update wird
    transparent aus dem alten reinen Schmerztage-Format migriert: ein Eintrag
    ohne Kategorien wird zu einem generischen Schmerz-Eintrag (wie ihn der
    "Schnell"-Modus weiterhin anlegt), jede vorhandene Kategorie wird ein
    eigener Schmerz-Eintrag ohne Intensität/Tageszeit/Notiz/Erfassungszeit (die
    es im alten Format nicht gab). Das Ergebnis wird sofort im neuen Format
    gespeichert, sodass die Migration nur einmal läuft. */
function loadDayLogs(){
  try {
    const raw = localStorage.getItem(APP_DATA.STORAGE_KEYS.DAY_LOGS);
    if (raw){
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? normalizeDayLogs(parsed) : [];
    }
  } catch (err) {
    console.error('[storage] Tages-Logs konnten nicht geladen werden:', err);
    return [];
  }

  // Kein neuer Key vorhanden -> aus dem alten Schmerztage-Format migrieren.
  const legacy = _loadLegacyPainDays();
  if (!legacy.length) return [];

  const migrated = legacy.map(old => {
    const categories = Array.isArray(old.categories) ? old.categories : [];
    const pain = categories.length
      ? categories.map(cat => ({ id: generateEntryId('p'), category: cat, intensity: null, timeOfDay: null, note: null, loggedAt: null }))
      : [{ id: generateEntryId('p'), category: null, intensity: null, timeOfDay: null, note: null, loggedAt: null }];
    return { date: old.date, pain, symptoms: [], moods: [] };
  });
  migrated.sort((a, b) => a.date.localeCompare(b.date));
  saveDayLogs(migrated);
  return migrated;
}

function saveDayLogs(dayLogs){
  try {
    localStorage.setItem(APP_DATA.STORAGE_KEYS.DAY_LOGS, JSON.stringify(dayLogs));
    return true;
  } catch (err) {
    console.error('[storage] Tages-Logs konnten nicht gespeichert werden:', err);
    return false;
  }
}

/** Liest oder erstellt (nur im Rückgabewert, noch nicht gespeichert) den
    Tages-Log für ein Datum aus einer bereits geladenen Liste. */
function findDayEntry(dayLogs, iso){
  return dayLogs.find(e => e.date === iso) || null;
}

/** Wendet `mutate` auf den (ggf. neu angelegten) Tages-Log für `iso` an,
    entfernt den Eintrag wieder komplett, falls er danach in allen drei
    Bereichen leer ist (kein toter Datensatz für einen Tag ohne Daten), und
    persistiert das Ergebnis. Zentrale Schreib-Funktion für alle Änderungen an
    Schmerz/Symptomen/Stimmungen. */
function upsertDayEntry(iso, mutate){
  const dayLogs = loadDayLogs();
  let entry = findDayEntry(dayLogs, iso);
  const isNew = !entry;
  if (!entry) entry = emptyDayEntry(iso);
  mutate(entry);

  const isEmpty = !entry.pain.length && !entry.symptoms.length && !entry.moods.length;
  const idx = dayLogs.findIndex(e => e.date === iso);
  if (isEmpty){
    if (idx !== -1) dayLogs.splice(idx, 1);
  } else if (idx !== -1){
    dayLogs[idx] = entry;
  } else if (isNew){
    dayLogs.push(entry);
  }
  dayLogs.sort((a, b) => a.date.localeCompare(b.date));
  saveDayLogs(dayLogs);
  return dayLogs;
}

/** "Schnell"-Modus: schaltet EINEN generischen Schmerz-Eintrag (ohne Kategorie/
    Intensität/Tageszeit) für das Datum um — unabhängig von evtl. bereits im
    Detailgrad "Detailliert" erfassten Symptomen/Stimmungen an diesem Tag, die
    bleiben unangetastet. Sind bereits (egal welche) Schmerz-Einträge vorhanden,
    werden beim Umschalten ALLE entfernt; sonst wird der eine generische Eintrag
    mit der aktuellen Uhrzeit (loggedAt) angelegt. */
function togglePainDayQuick(iso){
  return upsertDayEntry(iso, entry => {
    if (entry.pain.length) entry.pain = [];
    else entry.pain = [{ id: generateEntryId('p'), category: null, intensity: null, timeOfDay: null, note: null, loggedAt: nowStamp() }];
  });
}

/** Fügt einen einzelnen Schmerz-Eintrag hinzu (Detailgrad "Detailliert", siehe
    openDayDetailSheet() in 04-calendar.js) — ein Tag kann mehrere davon haben.
    `note` ist ein freier Text, nur bei category "sonstige" relevant/gefüllt
    (siehe painSubformHTML() in 04-calendar.js). `loggedAt` wird IMMER
    automatisch auf den aktuellen Zeitpunkt gesetzt — nicht manuell wählbar —
    damit sich später nachvollziehen lässt, wann genau ein Eintrag erfasst
    wurde (unabhängig von der frei gewählten Tageszeit-Angabe timeOfDay). */
function addPainEntry(iso, { category, intensity, timeOfDay, note }){
  return upsertDayEntry(iso, entry => {
    entry.pain.push({
      id: generateEntryId('p'),
      category: category || null,
      intensity: intensity ?? null,
      timeOfDay: timeOfDay || null,
      note: note ? note.trim() : null,
      loggedAt: nowStamp()
    });
  });
}

function removePainEntry(iso, entryId){
  return upsertDayEntry(iso, entry => {
    entry.pain = entry.pain.filter(p => p.id !== entryId);
  });
}

/** Schaltet ein einzelnes Symptom für einen Tag an/aus (Mehrfachauswahl-
    Chips). Beim Anschalten wird die aktuelle Uhrzeit als loggedAt vermerkt;
    beim Ausschalten geht sie mit dem Eintrag verloren (bei erneutem Anschalten
    wird ein neuer Zeitpunkt gesetzt) — entspricht dem Tap-Verhalten der Chips. */
function toggleSymptomEntry(iso, symptomId){
  return upsertDayEntry(iso, entry => {
    const idx = entry.symptoms.findIndex(s => s.id === symptomId);
    if (idx !== -1) entry.symptoms.splice(idx, 1);
    else entry.symptoms.push({ id: symptomId, loggedAt: nowStamp() });
  });
}

/** Wie toggleSymptomEntry(), nur für Stimmungs-Chips. */
function toggleMoodEntry(iso, moodId){
  return upsertDayEntry(iso, entry => {
    const idx = entry.moods.findIndex(m => m.id === moodId);
    if (idx !== -1) entry.moods.splice(idx, 1);
    else entry.moods.push({ id: moodId, loggedAt: nowStamp() });
  });
}

/** Nutzerdefinierte, zusätzliche Symptom-/Stimmungs-Chips (Detailgrad
    "Detailliert" -> "+ Eigenes"), ergänzen die feste Liste aus
    APP_DATA.SYMPTOM_CATEGORIES / APP_DATA.MOOD_CATEGORIES dauerhaft. */
function loadCustomItems(){
  try {
    const raw = localStorage.getItem(APP_DATA.STORAGE_KEYS.CUSTOM_ITEMS);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      symptoms: Array.isArray(parsed.symptoms) ? parsed.symptoms : [],
      moods: Array.isArray(parsed.moods) ? parsed.moods : []
    };
  } catch (err) {
    console.error('[storage] Eigene Einträge konnten nicht geladen werden:', err);
    return { symptoms: [], moods: [] };
  }
}

function saveCustomItems(customItems){
  try {
    localStorage.setItem(APP_DATA.STORAGE_KEYS.CUSTOM_ITEMS, JSON.stringify(customItems));
    return true;
  } catch (err) {
    console.error('[storage] Eigene Einträge konnten nicht gespeichert werden:', err);
    return false;
  }
}

function addCustomSymptom(label){
  const customItems = loadCustomItems();
  const item = { id: generateEntryId('cs'), label: label.trim() };
  customItems.symptoms.push(item);
  saveCustomItems(customItems);
  return { customItems, item };
}

function addCustomMood(label){
  const customItems = loadCustomItems();
  const item = { id: generateEntryId('cm'), label: label.trim() };
  customItems.moods.push(item);
  saveCustomItems(customItems);
  return { customItems, item };
}

function loadThemeOverrides() {
  try {
    const raw = localStorage.getItem(APP_DATA.STORAGE_KEYS.THEME);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('[storage] Theme-Overrides konnten nicht geladen werden:', err);
    return null;
  }
}

function saveThemeOverrides(overrides) {
  try {
    localStorage.setItem(APP_DATA.STORAGE_KEYS.THEME, JSON.stringify(overrides));
    return true;
  } catch (err) {
    console.error('[storage] Theme-Overrides konnten nicht gespeichert werden:', err);
    return false;
  }
}

function loadSettings(){
  try {
    const raw = localStorage.getItem(APP_DATA.STORAGE_KEYS.SETTINGS);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('[storage] Einstellungen konnten nicht geladen werden:', err);
    return {};
  }
}

function saveSettings(settings){
  try {
    localStorage.setItem(APP_DATA.STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    return true;
  } catch (err) {
    console.error('[storage] Einstellungen konnten nicht gespeichert werden:', err);
    return false;
  }
}

/**
 * Backup-Export als JSON-Objekt (Basis für 11-export-report.js, sobald es existiert).
 * Wichtig, da es kein Backend gibt und ein Cache-Reset sonst Datenverlust bedeutet.
 */
function exportAllData() {
  return {
    exportedAt: new Date().toISOString(),
    version: APP_DATA.APP_VERSION,
    periods: loadPeriods(),
    theme: loadThemeOverrides(),
    settings: loadSettings(),
    dayLogs: loadDayLogs(),
    customItems: loadCustomItems()
  };
}

/** Importiert ein Backup. Unterstützt sowohl das aktuelle Format (dayLogs)
    als auch ältere Backups (painDays) — letztere werden über dieselbe
    Migrations-Logik wie loadDayLogs() in das aktuelle Format überführt. */
function importAllData(data) {
  if (!data || !Array.isArray(data.periods)) {
    throw new Error('Ungültiges Backup-Format.');
  }
  savePeriods(data.periods);
  if (data.theme) saveThemeOverrides(data.theme);
  if (data.settings) saveSettings(data.settings);
  if (Array.isArray(data.dayLogs)){
    saveDayLogs(data.dayLogs);
  } else if (Array.isArray(data.painDays)){
    const migrated = data.painDays.map(old => {
      const categories = Array.isArray(old.categories) ? old.categories : [];
      const pain = categories.length
        ? categories.map(cat => ({ id: generateEntryId('p'), category: cat, intensity: null, timeOfDay: null }))
        : [{ id: generateEntryId('p'), category: null, intensity: null, timeOfDay: null }];
      return { date: old.date, pain, symptoms: [], moods: [] };
    });
    saveDayLogs(migrated);
  }
  if (data.customItems) saveCustomItems({
    symptoms: Array.isArray(data.customItems.symptoms) ? data.customItems.symptoms : [],
    moods: Array.isArray(data.customItems.moods) ? data.customItems.moods : []
  });
  return true;
}
