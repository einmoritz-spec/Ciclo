import { addPeriodEntry, loadPeriods } from './01-storage.js';
import { State } from './02-state-theme.js';
import { addDays, daysBetween, formatISODate, parseISODate } from './03-utils.js';
import { goCalendar, pushView } from './05-navigation.js';
import { fmtDateReadable } from './08-stats-progress.js';

/* ---------------------------------------------------
   DRIP-CSV-IMPORT
   Eigenständiger Sub-Flow (kein Bottom-Nav-Tab, eigener Zurück-Header wie
   in der Trainings-App üblich). Rein client-seitig per FileReader, kein
   externer CSV-Dienst — Offlinefähigkeit bleibt erhalten (siehe App-Regeln).

   Aus der echten Drip-Export-CSV werden AUSSCHLIESSLICH die Spalten "date"
   und "bleeding.value" gelesen (per Namens-Mapping über die Header-Zeile,
   nicht per Spaltenindex — überlebt andere Spaltenreihenfolgen). Alle
   anderen ~45 Spalten (Temperatur, Stimmung, Sex, Notizen ...) werden
   bewusst ignoriert, da für die Berechnungen nur Periodenbeginn/-ende
   gebraucht werden (siehe Absprache im Chat).

   Erkennungslogik: jede zusammenhängende Folge aufeinanderfolgender
   Kalendertage mit bleeding.value > 0 wird als EINE Periode gewertet.
   Tage mit bleeding.value = 0 (explizit "keine Blutung" geloggt) sowie
   Lücken in der CSV (kein Log-Eintrag) beenden eine solche Folge.
   Da echte Drip-Exporte durchaus lückenhaft/unsauber sein können (einzelne
   Tage, Schmierblutungen), wird NICHTS automatisch verworfen — stattdessen
   zeigt eine Vorschau alle erkannten Perioden zur Kontrolle an, auffällig
   kurze (1 Tag) werden nur markiert, nicht automatisch abgewählt.
--------------------------------------------------- */

let importCandidates = [];

/** Minimaler, aber robuster CSV-Parser (Anführungszeichen, "" als Escape,
    eingebettete Kommas/Zeilenumbrüche in Feldern, CRLF) — Freitext-Spalten
    wie note.value/mood.other können in echten Exporten Kommas enthalten. */
function parseCSV(text){
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++){
    const char = text[i];
    if (inQuotes){
      if (char === '"'){
        if (text[i + 1] === '"'){ field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += char;
      }
    } else if (char === '"'){
      inQuotes = true;
    } else if (char === ','){
      row.push(field); field = '';
    } else if (char === '\r'){
      // ignorieren, \n schließt die Zeile ab
    } else if (char === '\n'){
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += char;
    }
  }
  if (field.length || row.length){ row.push(field); rows.push(row); }
  return rows;
}

/** CSV-Text -> aufsteigend sortierte ISO-Daten aller Tage mit bleeding.value > 0 */
function parseDripBleedingDays(text){
  const rows = parseCSV(text).filter(r => r.length > 1);
  if (!rows.length) throw new Error('Die Datei enthält keine lesbaren Zeilen.');

  const header = rows[0].map(h => h.trim());
  const dateIdx = header.indexOf('date');
  const bleedingIdx = header.indexOf('bleeding.value');
  if (dateIdx === -1 || bleedingIdx === -1){
    throw new Error('Erwartete Spalten "date" und "bleeding.value" wurden nicht gefunden.');
  }

  const days = [];
  for (let i = 1; i < rows.length; i++){
    const r = rows[i];
    if (!r || r.length <= Math.max(dateIdx, bleedingIdx)) continue;
    const date = (r[dateIdx] || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const bleedingRaw = (r[bleedingIdx] || '').trim();
    if (bleedingRaw === '') continue;
    const bleeding = Number(bleedingRaw);
    if (Number.isNaN(bleeding) || bleeding <= 0) continue;
    days.push(date);
  }
  days.sort();
  return days;
}

/** Aufeinanderfolgende Blutungstage zu Perioden gruppieren */
function groupBleedingDaysIntoPeriods(bleedingDaysISO){
  const periods = [];
  let current = null;
  for (const iso of bleedingDaysISO){
    if (!current){
      current = { start: iso, end: iso };
    } else if (iso === current.end){
      continue; // doppelte Zeile für denselben Tag in der CSV
    } else if (iso === formatISODate(addDays(parseISODate(current.end), 1))){
      current.end = iso;
    } else {
      periods.push(current);
      current = { start: iso, end: iso };
    }
  }
  if (current) periods.push(current);
  return periods;
}

/** Erkannte Perioden mit Metadaten für die Vorschau anreichern (Länge,
    Duplikat-/Überschneidungs-Check gegen bereits gespeicherte Perioden) */
function buildImportCandidates(periods){
  return periods.map(p => {
    const length = daysBetween(parseISODate(p.start), parseISODate(p.end)) + 1;
    const alreadyExists = State.periods.some(ex => ex.start === p.start && ex.end === p.end);
    const overlapsExisting = !alreadyExists && State.periods.some(ex => !(p.end < ex.start || p.start > ex.end));
    return {
      start: p.start,
      end: p.end,
      length,
      alreadyExists,
      overlapsExisting,
      selected: !alreadyExists && !overlapsExisting
    };
  });
}

function importPickerHTML(){
  return `
    <div class="placeholder-content">
      <p class="placeholder-title">CSV-Datei wählen</p>
      <p class="placeholder-text">Export aus Drip (Einstellungen → Daten exportieren) hier auswählen. Es werden ausschließlich Datum und Blutungsstärke gelesen, um Periodenbeginn/-ende zu erkennen — alle anderen Spalten werden ignoriert.</p>
      <label class="file-picker-btn">
        Datei auswählen
        <input type="file" accept=".csv,text/csv" id="importFileInput" hidden>
      </label>
      <p class="import-error" id="importError"></p>
    </div>
  `;
}

function importRowHTML(c, idx){
  const disabled = c.alreadyExists || c.overlapsExisting;
  const note = c.alreadyExists
    ? 'bereits vorhanden'
    : c.overlapsExisting
      ? 'überschneidet sich mit vorhandenem Eintrag'
      : (c.length === 1 ? 'nur 1 Tag — evtl. Schmierblutung, bitte prüfen' : '');
  return `
    <label class="import-row${disabled ? ' is-disabled' : ''}">
      <input type="checkbox" class="import-row-checkbox" data-idx="${idx}" ${c.selected ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      <span class="import-row-dates">${fmtDateReadable(parseISODate(c.start))} – ${fmtDateReadable(parseISODate(c.end))}</span>
      <span class="import-row-length">${c.length} Tag${c.length === 1 ? '' : 'e'}</span>
      ${note ? `<span class="import-row-note">${note}</span>` : ''}
    </label>
  `;
}

function importPreviewHTML(){
  const rows = importCandidates.map((c, idx) => importRowHTML(c, idx)).join('');
  return `
    <p class="import-summary" id="importSummary"></p>
    <div class="import-list">${rows}</div>
    <button type="button" class="file-picker-btn" id="importChangeFileBtn">Andere Datei wählen</button>
    <button type="button" class="import-confirm-btn" id="importConfirmBtn">Ausgewählte importieren</button>
  `;
}

function updateImportSummary(){
  const summaryEl = document.getElementById('importSummary');
  if (!summaryEl) return;
  const selectedCount = importCandidates.filter(c => c.selected).length;
  const skippedCount = importCandidates.filter(c => c.alreadyExists || c.overlapsExisting).length;
  summaryEl.textContent = `${importCandidates.length} Perioden erkannt · ${selectedCount} ausgewählt`
    + (skippedCount ? ` · ${skippedCount} übersprungen (bereits vorhanden)` : '');
}

function handleImportFileSelected(event){
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const errorEl = document.getElementById('importError');
  if (errorEl) errorEl.textContent = '';

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const bleedingDays = parseDripBleedingDays(String(reader.result));
      const periods = groupBleedingDaysIntoPeriods(bleedingDays);
      if (!periods.length){
        if (errorEl) errorEl.textContent = 'In dieser Datei wurden keine Blutungstage gefunden.';
        return;
      }
      importCandidates = buildImportCandidates(periods);
      renderImportView();
    } catch (err){
      if (errorEl) errorEl.textContent = err.message || 'Datei konnte nicht gelesen werden.';
    }
  };
  reader.onerror = () => {
    if (errorEl) errorEl.textContent = 'Datei konnte nicht gelesen werden.';
  };
  reader.readAsText(file, 'UTF-8');
}

function handleImportConfirm(){
  const toImport = importCandidates.filter(c => c.selected);
  toImport.forEach(c => addPeriodEntry(c.start, c.end));
  State.periods = loadPeriods();
  importCandidates = [];
  goCalendar();
}

function wireImportView(){
  const fileInput = document.getElementById('importFileInput');
  if (fileInput) fileInput.onchange = handleImportFileSelected;

  const changeFileBtn = document.getElementById('importChangeFileBtn');
  if (changeFileBtn) changeFileBtn.onclick = () => { importCandidates = []; renderImportView(); };

  document.querySelectorAll('.import-row-checkbox').forEach(cb => {
    cb.onchange = () => {
      importCandidates[Number(cb.dataset.idx)].selected = cb.checked;
      updateImportSummary();
    };
  });

  const confirmBtn = document.getElementById('importConfirmBtn');
  if (confirmBtn) confirmBtn.onclick = handleImportConfirm;

  updateImportSummary();
}

export function renderImportView(){
  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="app-header back-header">
      <button type="button" class="back-btn" id="importBackBtn" aria-label="Zurück">←</button>
      <span class="app-title">Drip-Import</span>
      <span class="header-spacer"></span>
    </header>
    <div class="import-scroll">
      ${importCandidates.length ? importPreviewHTML() : importPickerHTML()}
    </div>
  `;
  document.getElementById('importBackBtn').onclick = () => history.back();
  wireImportView();
}

export function goImport(push){ if (push !== false) pushView('import'); renderImportView(); }
