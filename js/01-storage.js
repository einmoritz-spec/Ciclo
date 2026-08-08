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

/** Lädt die gespeicherten Schmerztage als Array von { date, categories }.
    Migration für das alte Format (Version ohne Kategorien): dort war jeder
    Eintrag ein reiner ISO-Datums-String statt eines Objekts — wird hier
    transparent in { date: <string>, categories: [] } überführt, sodass
    ältere Backups/Installationen ohne Datenverlust weiterlaufen. */
function loadPainDays(){
  try {
    const raw = localStorage.getItem(APP_DATA.STORAGE_KEYS.PAIN_DAYS);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(entry => typeof entry === 'string' ? { date: entry, categories: [] } : entry);
  } catch (err) {
    console.error('[storage] Schmerztage konnten nicht geladen werden:', err);
    return [];
  }
}

function savePainDays(painDays){
  try {
    localStorage.setItem(APP_DATA.STORAGE_KEYS.PAIN_DAYS, JSON.stringify(painDays));
    return true;
  } catch (err) {
    console.error('[storage] Schmerztage konnten nicht gespeichert werden:', err);
    return false;
  }
}

/** Schaltet den Schmerztag-Status für ein Datum um (langer Druck auf eine
    Tageszelle im "Schnell"-Detailgrad, siehe handleDayLongPress() in
    04-calendar.js) — ohne Kategorie, nur pauschal ja/nein. */
function togglePainDay(iso){
  const painDays = loadPainDays();
  const idx = painDays.findIndex(p => p.date === iso);
  if (idx === -1) painDays.push({ date: iso, categories: [] });
  else painDays.splice(idx, 1);
  painDays.sort((a, b) => a.date.localeCompare(b.date));
  savePainDays(painDays);
  return painDays;
}

/** Setzt die Schmerz-Kategorien für ein Datum (Detailgrad "Detailliert", siehe
    openPainCategorySheet() in 04-calendar.js). Ein leeres categories-Array
    entfernt den Eintrag wieder komplett (= kein Schmerztag mehr), sonst wird
    ein bestehender Eintrag ersetzt bzw. ein neuer angelegt. */
function setPainCategories(iso, categories){
  const painDays = loadPainDays();
  const idx = painDays.findIndex(p => p.date === iso);
  if (!categories.length){
    if (idx !== -1) painDays.splice(idx, 1);
  } else if (idx === -1){
    painDays.push({ date: iso, categories });
  } else {
    painDays[idx] = { date: iso, categories };
  }
  painDays.sort((a, b) => a.date.localeCompare(b.date));
  savePainDays(painDays);
  return painDays;
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
    painDays: loadPainDays()
  };
}

function importAllData(data) {
  if (!data || !Array.isArray(data.periods)) {
    throw new Error('Ungültiges Backup-Format.');
  }
  savePeriods(data.periods);
  if (data.theme) saveThemeOverrides(data.theme);
  if (data.settings) saveSettings(data.settings);
  if (Array.isArray(data.painDays)) savePainDays(data.painDays);
  return true;
}
