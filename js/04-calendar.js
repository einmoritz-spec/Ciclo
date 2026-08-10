import { addCustomMood, addCustomSymptom, addPainEntry, addPeriodEntry, deletePeriodEntry, emptyDayEntry, loadPeriods, removePainEntry, setDayNote, toggleMoodEntry, togglePainDayQuick, toggleSymptomEntry, updateMoodTime, updatePainEntry, updatePeriodEntry, updateSymptomTime } from './01-storage.js';
import { State, attachLongPress, moodCatalog, symptomCatalog } from './02-state-theme.js';
import { addDays, computeCycleStats, daysBetween, escapeAttr, fmtTimeShort, formatISODate, getMonthLabel, isToday, parseISODate, shiftYearMonth, timeInputValue } from './03-utils.js';
import { appLogoButtonHTML, bottomNavHTML, goCalendarHome, wireBottomNav } from './05-navigation.js';
import { fmtDateReadable } from './08-stats-progress.js';
import { goSettings } from './09-settings.js';
import { APP_DATA } from './data/app-data.js';

/* ---------------------------------------------------
   KALENDER (Startseite)
   Fortlaufende Monatsliste (wie 04-calendar.js der Trainings-App), aber in
   BEIDE Richtungen per IntersectionObserver nachladbar (dort nur abwärts).
   Start: das gesamte aktuelle Kalenderjahr, danach automatisches Scrollen
   zum aktuellen Monat.

   Klick-Logik zum Eintragen einer Periode:
   1. Klick auf einen Tag OHNE bestehende Periode und AUSSERHALB der Verlängerungs-
      Zone jeder Periode -> setzt Perioden-START für eine neue Auswahl
      (State.calendar.selection.start)
   2. Klick auf Folgetag dieser Auswahl (0–12 Tage nach dem Start) -> füllt den
      Bereich als NEUE Periode und speichert sie (01-storage.js)
   3. Klick auf einen Tag VOR dem Auswahl-Start oder MEHR als 12 Tage danach
      -> verwirft die alte Auswahl, der geklickte Tag wird der neue Start
   4. Klick auf einen Tag OHNE bestehende Periode, aber innerhalb von 12 Tagen
      NACH dem Start einer bereits gespeicherten Periode -> verlängert diese
      bestehende Periode bis zum geklickten Tag (findExtendablePeriod()), statt
      eine neue anzulegen — so lässt sich eine zu kurz erfasste Periode
      nachträglich korrigieren, ohne sie erst löschen zu müssen
   5. Klick auf den LETZTEN Tag einer mehrtägigen Periode -> entfernt nur diesen
      einen Tag (Enddatum einen Tag zurück), statt den ganzen Eintrag zu löschen
   6. Klick auf einen anderen bereits markierten Tag (Start oder ein Tag in der
      Mitte) bzw. auf eine eintägige Periode -> löscht den gesamten Eintrag

   Langer Druck (Pointer-Events, siehe wireCalendarDayClicks()) auf eine Tages-
   zelle öffnet unabhängig davon die Tages-Erfassung (Schmerz/Symptome/
   Stimmung) — rein informativ, beeinflusst keine Perioden-Logik. Verhalten
   hängt vom Detailgrad ab (State.settings.detailLevel, Einstellungen ->
   Schmerzen):
   - "quick" (Standard): schaltet nur einen generischen Schmerztag um/aus
     (togglePainDayQuick() in 01-storage.js) — kein Zugriff auf Symptome/
     Stimmung, die gehören ausschließlich zu "detailed".
   - "detailed": öffnet stattdessen das große Tages-Sheet (openDayDetailSheet()
     unten) für mehrere Schmerz-Einträge (Kategorie + Intensität 1–10 +
     Tageszeit, siehe APP_DATA.PAIN_CATEGORIES/PAIN_TIME_OF_DAY), Symptome und
     Stimmung (APP_DATA.SYMPTOM_CATEGORIES/MOOD_CATEGORIES + eigene Einträge).
--------------------------------------------------- */

// Nur Lade-Guards für den Infinite-Scroll, kein Anwendungs-State (der liegt
// ausschließlich in State.calendar, siehe 02-state-theme.js).
let calendarLoadingPrev = false;
let calendarLoadingNext = false;
let calendarTopObserver = null;
let calendarBottomObserver = null;

// iso -> intensity (0–1) für die Vorhersage-Einfärbung kommender Periodentage
// (siehe predictedPeriodDays in computeCycleStats(), 03-utils.js). Wird beim
// Rendern des Kalenders sowie nach jeder Änderung an State.periods neu befüllt
// (siehe renderCalendarView() / handleDayClick() weiter unten).
let predictedDaysMap = new Map();

function findPeriodForDate(iso){
  return State.periods.find(p => iso >= p.start && iso <= p.end) || null;
}

function computePredictedDaysMap(){
  const map = new Map();
  const stats = computeCycleStats(State.periods, State.today);
  if (stats.hasData && Array.isArray(stats.predictedPeriodDays)){
    stats.predictedPeriodDays.forEach(d => map.set(d.iso, d.intensity));
  }
  return map;
}

/** Klassen + "hat bereits eine Periode"-Flag für eine Tageszelle. Getrennt von
    der eigentlichen HTML-Erzeugung (dayCellHTML() unten), da beide Aufrufer
    (initialer Aufbau UND refreshDayCells()) dieselbe hasPeriod-Information für
    den Vorhersage-Ring brauchen. */
function dayCellMeta(iso, date){
  const hasPeriod = !!findPeriodForDate(iso);
  const classes = ['day-cell'];
  if (isToday(date)) classes.push('is-today');
  if (hasPeriod) classes.push('has-period');
  if (State.calendar.selection.start === iso) classes.push('is-selecting');
  return { hasPeriod, className: classes.join(' ') };
}

/** Vorhersage-Ring als eigenes kleines SVG (statt CSS-Border): so lässt sich
    die Strichlänge des gestrichelten Rings frei einstellen (etwas weiter
    auseinander als ein normaler CSS-"dashed"-Rand) und die Farbe entspricht
    jetzt bewusst derselben wie an echten Periodentagen oben
    (var(--color-period-text), statt einer eigenen Vorhersage-Farbe) — der
    wahrscheinlichste Tag (intensity === 1) bekommt einen durchgezogenen Ring,
    die übrigen Tage im Fenster einen gestrichelten. Nur für Tage OHNE bereits
    eingetragene Periode (has-period hat Vorrang, kein Ring dann nötig). */
function predictedRingHTML(iso, hasPeriod){
  if (hasPeriod) return '';
  const intensity = predictedDaysMap.get(iso);
  if (intensity === undefined) return '';
  const isPeak = intensity === 1;
  const dashAttr = isPeak ? '' : ' stroke-dasharray="5 6"';
  return `<svg class="day-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18"${dashAttr}></circle></svg>`;
}

/** Größe/Deckkraft des Schmerz-Markers richten sich nach der höchsten an
    diesem Tag erfassten Intensität (1–10) — je stärker, desto größer/kräftiger.
    Ohne erfasste Intensität (z.B. "Schnell"-Modus oder migrierte alte
    Schmerztage) wird ein mittelgroßer, gut sichtbarer Standard-Punkt gezeigt,
    statt gar keine Größenangabe treffen zu können. */
function painMarkerStyle(entry){
  const intensities = (entry.pain || []).map(p => p.intensity).filter(v => v != null);
  if (!intensities.length) return 'width:6px;height:6px;opacity:0.8';
  const max = Math.max(...intensities);
  const size = 4 + max * 0.5;
  const opacity = Math.min(1, 0.4 + max * 0.055);
  return `width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;opacity:${opacity.toFixed(2)}`;
}

/** Zeigt für einen Tag mit Einträgen GENAU EINEN Punkt (statt bis zu drei
    nebeneinander) — das hält die Zelle neben dem Vorhersage-Ring ruhig,
    statt Ring + mehrere Punkte optisch übereinanderzustapeln. Priorität
    Schmerz > Symptom > Stimmung (Schmerz transportiert über Größe/Deckkraft
    zusätzlich die Intensität, siehe painMarkerStyle()). Sind an einem Tag
    MEHRERE Kategorien erfasst, bekommt der Punkt zusätzlich einen dünnen Rand
    in der Farbe der zweitwichtigsten Kategorie als dezenten Hinweis "hier ist
    mehr als eine Sache erfasst" — ohne einen zweiten, separaten Punkt zu
    brauchen. */
function dayMarkersHTML(iso){
  const entry = State.dayLogs.get(iso);
  if (!entry) return '';
  const hasPain = !!(entry.pain && entry.pain.length);
  const hasSymptom = !!(entry.symptoms && entry.symptoms.length);
  const hasMood = !!(entry.moods && entry.moods.length);
  if (!hasPain && !hasSymptom && !hasMood) return '';

  let markerClass, baseStyle = '', secondaryVar = null;
  if (hasPain){
    markerClass = 'day-marker--pain';
    baseStyle = painMarkerStyle(entry);
    secondaryVar = hasSymptom ? '--color-accent' : (hasMood ? '--color-text-heading' : null);
  } else if (hasSymptom){
    markerClass = 'day-marker--symptom';
    secondaryVar = hasMood ? '--color-text-heading' : null;
  } else {
    markerClass = 'day-marker--mood';
  }

  const ringStyle = secondaryVar ? `box-shadow:0 0 0 1.5px var(${secondaryVar})` : '';
  const style = [baseStyle, ringStyle].filter(Boolean).join(';');
  return `<span class="day-markers"><span class="day-marker ${markerClass}" style="${style}"></span></span>`;
}

function dayCellHTML(iso, date, day){
  const meta = dayCellMeta(iso, date);
  return `<button type="button" class="${meta.className}" data-date="${iso}">${predictedRingHTML(iso, meta.hasPeriod)}<span class="day-num">${day}</span>${dayMarkersHTML(iso)}</button>`;
}

function monthBlockHTML(year, month0){
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const firstWeekday = (new Date(year, month0, 1).getDay() + 6) % 7; // 0 = Montag

  const weekdayLabelsHTML = APP_DATA.WEEKDAYS_DE.map(l => `<span class="weekday-label">${l}</span>`).join('');
  const blanksHTML = Array.from({ length: firstWeekday }, () => `<span class="day-cell empty"></span>`).join('');
  const dayCellsHTML = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = new Date(year, month0, day);
    const iso = formatISODate(date);
    return dayCellHTML(iso, date, day);
  }).join('');

  return `
    <section class="month-block" data-year="${year}" data-month="${month0}">
      <h2 class="month-title">${getMonthLabel(year, month0)}</h2>
      <div class="weekday-row">${weekdayLabelsHTML}</div>
      <div class="days-grid">${blanksHTML}${dayCellsHTML}</div>
    </section>
  `;
}

/** Aktualisiert Klassen UND Inhalt (Vorhersage-Ring + Marker-Punkte) aller
    bestehenden Tageszellen, ohne die Monate komplett neu aufzubauen — günstig
    genug, um nach jeder Änderung über ALLE geladenen Monate zu laufen. */
function refreshDayCells(){
  document.querySelectorAll('#calendarMonths .day-cell[data-date]').forEach(btn => {
    const iso = btn.dataset.date;
    const date = parseISODate(iso);
    const meta = dayCellMeta(iso, date);
    btn.className = meta.className;
    btn.innerHTML = `${predictedRingHTML(iso, meta.hasPeriod)}<span class="day-num">${date.getDate()}</span>${dayMarkersHTML(iso)}`;
  });
}

/** Findet die bestehende Periode, deren Verlängerungs-Zone (bis zu 12 Tage NACH
    ihrem Start) den geklickten Tag einschließt — Voraussetzung: der Tag gehört
    noch zu keiner Periode (sonst würde stattdessen gelöscht, siehe handleDayClick).
    Bei mehreren Treffern gewinnt die Periode mit dem geringsten Abstand. */
function findExtendablePeriod(iso){
  const clickedDate = parseISODate(iso);
  let best = null;
  let bestDiff = Infinity;
  State.periods.forEach(p => {
    const diff = daysBetween(parseISODate(p.start), clickedDate);
    if (diff > 0 && diff <= APP_DATA.CYCLE_DEFAULTS.MAX_SELECTION_RANGE_DAYS && diff < bestDiff){
      best = p;
      bestDiff = diff;
    }
  });
  return best;
}

function handleDayClick(iso){
  const clickedDate = parseISODate(iso);
  const existingPeriod = findPeriodForDate(iso);
  const selectionStart = State.calendar.selection.start;

  if (!selectionStart){
    if (existingPeriod){
      if (iso === existingPeriod.end && existingPeriod.start !== existingPeriod.end){
        // Letzter Tag einer mehrtägigen Periode -> nur diesen Tag entfernen
        // (Ende einen Tag zurücksetzen), statt den ganzen Eintrag zu löschen.
        const newEnd = formatISODate(addDays(clickedDate, -1));
        State.periods = updatePeriodEntry(existingPeriod.id, { end: newEnd });
      } else {
        State.periods = deletePeriodEntry(existingPeriod.id);
      }
    } else {
      const extendable = findExtendablePeriod(iso);
      if (extendable){
        // Tag liegt innerhalb von 12 Tagen nach dem Start einer bestehenden
        // Periode -> diese verlängern statt eine neue Auswahl zu beginnen.
        State.periods = updatePeriodEntry(extendable.id, { end: iso });
      } else {
        State.calendar.selection.start = iso;
      }
    }
  } else {
    const startDate = parseISODate(selectionStart);
    const diff = daysBetween(startDate, clickedDate);
    if (diff < 0 || diff > APP_DATA.CYCLE_DEFAULTS.MAX_SELECTION_RANGE_DAYS){
      // Vor dem Start oder mehr als 12 Tage danach geklickt -> neuer Start statt Bereich
      State.calendar.selection.start = iso;
    } else {
      addPeriodEntry(selectionStart, iso);
      State.periods = loadPeriods();
      State.calendar.selection.start = null;
    }
  }
  // Perioden können sich geändert haben -> Vorhersage-Fenster neu berechnen, bevor
  // die Zellen aktualisiert werden.
  predictedDaysMap = computePredictedDaysMap();
  refreshDayCells();
}

/** "Schnell": schaltet nur einen generischen Schmerztag um (wie zuvor).
    "Detailliert": öffnet das große Tages-Sheet mit Schmerz-Einträgen
    (Kategorie/Intensität/Tageszeit), Symptomen und Stimmung (siehe
    openDayDetailSheet() unten) — dort ist auch "Kein Schmerztag" nicht mehr
    nötig, da einzelne Schmerz-Einträge dort direkt entfernbar sind. */
function handleDayLongPress(iso){
  if (State.settings.detailLevel === 'detailed'){
    openDayDetailSheet(iso);
  } else {
    State.dayLogs = new Map(togglePainDayQuick(iso).map(e => [e.date, e]));
    refreshDayCells();
  }
}

/** Formatiert einen einzelnen Schmerz-Eintrag für die Liste im Sheet, z.B.
    "Unterleib · 7/10 · Abends · erfasst 14:32" — fehlende Angaben (Intensität/
    Tageszeit noch nicht gesetzt, Kategorie im "Schnell"-Modus generisch)
    werden ausgelassen statt Platzhalter anzuzeigen. Bei Kategorie "Sonstige"
    wird die frei eingegebene Notiz mit angezeigt; die Erfassungszeit
    (loggedAt) wird IMMER automatisch gesetzt (siehe addPainEntry(),
    01-storage.js) und ist damit bei jedem neuen Eintrag vorhanden. */
function painEntryLabel(entry){
  const parts = [];
  const cat = APP_DATA.PAIN_CATEGORIES.find(c => c.id === entry.category);
  parts.push(cat ? cat.label : 'Allgemein');
  if (entry.category === 'sonstige' && entry.note) parts.push(entry.note);
  if (entry.intensity != null) parts.push(`${entry.intensity}/10`);
  const time = APP_DATA.PAIN_TIME_OF_DAY.find(t => t.id === entry.timeOfDay);
  if (time) parts.push(time.label);
  const loggedTime = fmtTimeShort(entry.loggedAt);
  if (loggedTime) parts.push(`erfasst ${loggedTime}`);
  return parts.join(' · ');
}

/** Liste bereits erfasster Schmerz-Einträge des Tages, je Zeile mit ×-Button
    zum Entfernen (removePainEntry() in 01-storage.js). Ein langer Druck auf
    die Zeile selbst öffnet das volle Bearbeiten-Formular (siehe
    painSubformHTML() unten, Aufruf über wireDaySheetBody()). */
function painEntryListHTML(entry){
  if (!entry.pain.length) return '<p class="day-sheet-empty-hint">Noch keine Schmerz-Einträge.</p>';
  return entry.pain.map(p => `
    <div class="pain-entry-row" data-entry-id="${p.id}">
      <span>${painEntryLabel(p)}</span>
      <button type="button" class="pain-entry-remove" data-remove-id="${p.id}" aria-label="Entfernen">×</button>
    </div>
  `).join('');
}

/** Unterformular zum Anlegen EINES neuen Schmerz-Eintrags ODER zum
    vollständigen Bearbeiten eines bereits bestehenden (draft.editId gesetzt,
    siehe wireDaySheetBody()) — beide teilen sich dieselben Felder: Kategorie
    (Einfachauswahl-Chips), Intensität (Schieberegler 1–10), Tageszeit-Kategorie
    (Einfachauswahl-Chips), — nur bei Kategorie "Sonstige" — ein freies
    Textfeld, UND eine manuell wählbare Uhrzeit (draft.time). Die Uhrzeit ist
    bewusst IMMER editierbar (nicht nur beim nachträglichen Bearbeiten): ein
    rückwirkend für einen vergangenen Tag angelegter Eintrag soll nicht
    zwangsläufig die aktuelle Uhrzeit bekommen, sondern die tatsächliche.
    Wird nur gezeigt, wenn draft nicht null ist. */
function painSubformHTML(draft){
  if (!draft) return '';
  const catChips = APP_DATA.PAIN_CATEGORIES.map(c => `
    <button type="button" class="chip${draft.category === c.id ? ' is-selected' : ''}" data-draft-category="${c.id}">${c.label}</button>
  `).join('');
  const timeChips = APP_DATA.PAIN_TIME_OF_DAY.map(t => `
    <button type="button" class="chip${draft.timeOfDay === t.id ? ' is-selected' : ''}" data-draft-time="${t.id}">${t.label}</button>
  `).join('');
  const noteFieldHTML = draft.category === 'sonstige' ? `
    <p class="pain-subform-label">Was genau?</p>
    <input type="text" class="chip-add-input" id="painDraftNote" placeholder="Kurze Beschreibung …" value="${escapeAttr(draft.note || '')}">
  ` : '';
  return `
    <div class="pain-subform" id="painSubform">
      <p class="pain-subform-label">Wo?</p>
      <div class="chip-row">${catChips}</div>
      ${noteFieldHTML}
      <p class="pain-subform-label">Wie stark? <strong>${draft.intensity}/10</strong></p>
      <input type="range" min="1" max="10" step="1" value="${draft.intensity}" class="intensity-slider" id="painDraftIntensity">
      <p class="pain-subform-label">Tageszeit?</p>
      <div class="chip-row">${timeChips}</div>
      <p class="pain-subform-label">Uhrzeit</p>
      <input type="time" class="chip-add-input" id="painDraftTime" value="${draft.time}">
      <div class="pain-subform-actions">
        <button type="button" class="pain-sheet-btn pain-sheet-btn--secondary" id="painDraftCancelBtn">Abbrechen</button>
        <button type="button" class="pain-sheet-btn" id="painDraftAddBtn" ${draft.category ? '' : 'disabled'}>${draft.editId ? 'Speichern' : 'Hinzufügen'}</button>
      </div>
    </div>
  `;
}

function chipRowHTML(catalog, selectedIds, dataAttr){
  return catalog.map(item => `
    <button type="button" class="chip${selectedIds.includes(item.id) ? ' is-selected' : ''}" data-${dataAttr}="${item.id}">${item.label}</button>
  `).join('');
}

/** Kleiner, gedämpfter Hinweistext unter einer Chip-Reihe: listet für die
    AKTUELL ausgewählten Symptome/Stimmungen, wann sie erfasst wurden — damit
    sich (wie bei Schmerz-Einträgen) später nachvollziehen lässt, wann genau
    etwas eingetreten ist. Nur einzelne Uhrzeit pro Item (loggedAt), kein
    Verlauf über mehrfaches An-/Ausschalten hinweg. */
function selectedItemsTimeHTML(catalog, selectedItems){
  if (!selectedItems.length) return '';
  const parts = selectedItems.map(sel => {
    const item = catalog.find(c => c.id === sel.id);
    const label = item ? item.label : sel.id;
    const time = fmtTimeShort(sel.loggedAt);
    return time ? `${label} ${time}` : label;
  });
  return `<p class="day-sheet-time-hint">Erfasst: ${parts.join(', ')}</p>`;
}

// Laufender Entwurf für einen neuen Schmerz-Eintrag im offenen Sheet (null =
// Unterformular ausgeblendet). Reiner UI-Zwischenstand, nichts davon ist
// gespeichert, bevor "Hinzufügen" getippt wird.
let painDraft = null;
let daySheetISO = null;

// Aktueller Text der allgemeinen Tages-Notiz (unabhängig von der Schmerz-
// Notiz). Wird als eigene Variable statt direkt aus State.dayLogs gehalten,
// damit ein Re-Render des Sheets durch eine ANDERE Aktion (z.B. ein Chip-Tap)
// während des Tippens den noch nicht gespeicherten Text nicht verwirft — erst
// beim Verlassen des Feldes (onblur) wird tatsächlich gespeichert.
let dayNoteDraft = '';

// Ziel eines gerade offenen Zeit-Editors für ein Symptom/eine Stimmung
// (langer Druck auf einen bereits ausgewählten Chip, siehe
// attachLongPress()-Wiring in wireDaySheetBody()) — { kind: 'symptom'|'mood',
// id } oder null. Erlaubt, die automatisch erfasste Uhrzeit nachträglich
// manuell zu korrigieren. Schmerz-Einträge haben ein eigenes, volles
// Bearbeiten-Formular (painDraft.editId, siehe painSubformHTML() oben) statt
// dieses reinen Zeit-Editors, da sie mehr Felder als nur die Uhrzeit haben.
let timeEditTarget = null;

/** Inline-Editor zum manuellen Setzen der Uhrzeit eines bereits ausgewählten
    Symptoms/einer Stimmung — erscheint nach langem Druck auf den jeweiligen
    Chip (siehe wireDaySheetBody()). Nutzt dieselbe Optik wie das
    Schmerz-Unterformular (.pain-subform). */
function timeEditorHTML(label, currentTimeValue){
  return `
    <div class="pain-subform" id="timeEditor">
      <p class="pain-subform-label">Uhrzeit für „${label}“</p>
      <input type="time" class="chip-add-input" id="timeEditorInput" value="${currentTimeValue}">
      <div class="pain-subform-actions">
        <button type="button" class="pain-sheet-btn pain-sheet-btn--secondary" id="timeEditorCancelBtn">Abbrechen</button>
        <button type="button" class="pain-sheet-btn" id="timeEditorSaveBtn">Speichern</button>
      </div>
    </div>
  `;
}

/** Baut den kompletten Sheet-Inhalt aus dem AKTUELLEN Tages-Log neu auf (nach
    jeder Änderung neu gerufen, siehe renderDaySheetContent()) — hält die
    Anzeige synchron zu State.dayLogs, ohne das ganze Sheet (inkl. Backdrop)
    neu zu erzeugen. */
function daySheetBodyHTML(iso){
  const entry = State.dayLogs.get(iso) || emptyDayEntry(iso);

  const painBottomHTML = painDraft
    ? painSubformHTML(painDraft)
    : '<button type="button" class="day-sheet-add-btn" id="addPainEntryBtn">+ Schmerz hinzufügen</button>';

  const symptomEditItem = timeEditTarget && timeEditTarget.kind === 'symptom'
    ? entry.symptoms.find(s => s.id === timeEditTarget.id) : null;
  const symptomEditHTML = symptomEditItem
    ? timeEditorHTML((symptomCatalog().find(c => c.id === symptomEditItem.id) || {}).label || symptomEditItem.id, timeInputValue(symptomEditItem.loggedAt))
    : '';

  const moodEditItem = timeEditTarget && timeEditTarget.kind === 'mood'
    ? entry.moods.find(m => m.id === timeEditTarget.id) : null;
  const moodEditHTML = moodEditItem
    ? timeEditorHTML((moodCatalog().find(c => c.id === moodEditItem.id) || {}).label || moodEditItem.id, timeInputValue(moodEditItem.loggedAt))
    : '';

  return `
    <div class="day-sheet-section">
      <p class="day-sheet-section-title">Notiz zum Tag</p>
      <textarea class="day-note-textarea" id="dayNoteTextarea" placeholder="z.B. besonderer Anlass, Krankheit, Medikamente …">${escapeAttr(dayNoteDraft)}</textarea>
    </div>

    <div class="day-sheet-section">
      <p class="day-sheet-section-title">Schmerzen</p>
      <p class="day-sheet-hint">Zum Bearbeiten (Kategorie, Stärke, Uhrzeit, …) einen Eintrag lange gedrückt halten.</p>
      <div class="pain-entry-list" id="painEntryList">${painEntryListHTML(entry)}</div>
      ${painBottomHTML}
    </div>

    <div class="day-sheet-section">
      <p class="day-sheet-section-title">Symptome</p>
      <p class="day-sheet-hint">Zum Bearbeiten der Uhrzeit ein ausgewähltes Symptom lange gedrückt halten.</p>
      <div class="chip-row" id="symptomChipRow">${chipRowHTML(symptomCatalog(), entry.symptoms.map(s => s.id), 'symptom')}</div>
      ${selectedItemsTimeHTML(symptomCatalog(), entry.symptoms)}
      ${symptomEditHTML}
      <div class="chip-add-row">
        <input type="text" class="chip-add-input" id="symptomCustomInput" placeholder="Eigenes Symptom …">
        <button type="button" class="chip-add-btn" id="symptomCustomAddBtn">+</button>
      </div>
    </div>

    <div class="day-sheet-section">
      <p class="day-sheet-section-title">Stimmung</p>
      <p class="day-sheet-hint">Zum Bearbeiten der Uhrzeit eine ausgewählte Stimmung lange gedrückt halten.</p>
      <div class="chip-row" id="moodChipRow">${chipRowHTML(moodCatalog(), entry.moods.map(m => m.id), 'mood')}</div>
      ${selectedItemsTimeHTML(moodCatalog(), entry.moods)}
      ${moodEditHTML}
      <div class="chip-add-row">
        <input type="text" class="chip-add-input" id="moodCustomInput" placeholder="Eigene Stimmung …">
        <button type="button" class="chip-add-btn" id="moodCustomAddBtn">+</button>
      </div>
    </div>
  `;
}

/** Baut nur den Sheet-INHALT neu auf (nicht den Backdrop/die Öffnen-Animation)
    und verdrahtet ihn neu — wird nach jeder Datenänderung aufgerufen, damit
    z.B. die Schmerz-Liste sofort einen neu hinzugefügten Eintrag zeigt. */
function renderDaySheetContent(){
  const body = document.getElementById('daySheetBody');
  if (!body) return;
  body.innerHTML = daySheetBodyHTML(daySheetISO);
  wireDaySheetBody();
  refreshDayCells();
}

function wireDaySheetBody(){
  const dayNoteTextarea = document.getElementById('dayNoteTextarea');
  if (dayNoteTextarea) dayNoteTextarea.oninput = () => { dayNoteDraft = dayNoteTextarea.value; };
  if (dayNoteTextarea) dayNoteTextarea.onblur = () => {
    State.dayLogs = new Map(setDayNote(daySheetISO, dayNoteDraft).map(e => [e.date, e]));
  };

  const addBtn = document.getElementById('addPainEntryBtn');
  if (addBtn) addBtn.onclick = () => {
    painDraft = { editId: null, category: null, intensity: 5, timeOfDay: null, note: '', time: timeInputValue(null) };
    renderDaySheetContent();
  };

  const cancelBtn = document.getElementById('painDraftCancelBtn');
  if (cancelBtn) cancelBtn.onclick = () => { painDraft = null; renderDaySheetContent(); };

  document.querySelectorAll('#painSubform [data-draft-category]').forEach(btn => {
    btn.onclick = () => { painDraft.category = btn.dataset.draftCategory; renderDaySheetContent(); };
  });
  document.querySelectorAll('#painSubform [data-draft-time]').forEach(btn => {
    btn.onclick = () => {
      painDraft.timeOfDay = painDraft.timeOfDay === btn.dataset.draftTime ? null : btn.dataset.draftTime;
      renderDaySheetContent();
    };
  });
  const intensityInput = document.getElementById('painDraftIntensity');
  if (intensityInput) intensityInput.oninput = () => { painDraft.intensity = Number(intensityInput.value); };
  if (intensityInput) intensityInput.onchange = () => { painDraft.intensity = Number(intensityInput.value); renderDaySheetContent(); };

  // Kein Re-Render bei jedem Tastendruck/jeder Uhrzeit-Änderung (anders als
  // bei den Chips/dem Slider) — sonst würde das Feld bei jeder Eingabe den
  // Fokus verlieren. Der Wert wird trotzdem sofort im Entwurf (painDraft)
  // mitgeführt.
  const noteInput = document.getElementById('painDraftNote');
  if (noteInput) noteInput.oninput = () => { painDraft.note = noteInput.value; };
  const timeInput = document.getElementById('painDraftTime');
  if (timeInput) timeInput.oninput = () => { painDraft.time = timeInput.value; };

  const addDraftBtn = document.getElementById('painDraftAddBtn');
  if (addDraftBtn) addDraftBtn.onclick = () => {
    if (!painDraft.category) return;
    const updated = painDraft.editId
      ? updatePainEntry(daySheetISO, painDraft.editId, painDraft)
      : addPainEntry(daySheetISO, painDraft);
    State.dayLogs = new Map(updated.map(e => [e.date, e]));
    painDraft = null;
    renderDaySheetContent();
  };

  document.querySelectorAll('.pain-entry-remove').forEach(btn => {
    btn.onclick = () => {
      State.dayLogs = new Map(removePainEntry(daySheetISO, btn.dataset.removeId).map(e => [e.date, e]));
      renderDaySheetContent();
    };
  });
  // Langer Druck auf einen Schmerz-Eintrag öffnet das volle Bearbeiten-
  // Formular (Kategorie/Intensität/Tageszeit/Notiz/Uhrzeit, vorausgefüllt mit
  // den bisherigen Werten) — ein kurzer Tap tut nichts (nur der ×-Button
  // innerhalb der Zeile reagiert auf normale Taps).
  document.querySelectorAll('.pain-entry-row').forEach(row => {
    attachLongPress(row, () => {
      const entry = State.dayLogs.get(daySheetISO) || emptyDayEntry(daySheetISO);
      const item = entry.pain.find(p => p.id === row.dataset.entryId);
      if (!item) return;
      painDraft = {
        editId: item.id,
        category: item.category,
        intensity: item.intensity ?? 5,
        timeOfDay: item.timeOfDay,
        note: item.note || '',
        time: timeInputValue(item.loggedAt)
      };
      renderDaySheetContent();
    });
  });

  document.querySelectorAll('#symptomChipRow .chip').forEach(chip => {
    chip.onclick = () => {
      State.dayLogs = new Map(toggleSymptomEntry(daySheetISO, chip.dataset.symptom).map(e => [e.date, e]));
      renderDaySheetContent();
    };
    // Langer Druck öffnet den Zeit-Editor NUR für ein bereits ausgewähltes
    // Symptom (sonst gäbe es noch keine Uhrzeit zu bearbeiten) — ein nicht
    // ausgewähltes Symptom reagiert auf langen Druck genauso wie auf einen
    // normalen Tap (schaltet es an).
    attachLongPress(chip, () => {
      const entry = State.dayLogs.get(daySheetISO) || emptyDayEntry(daySheetISO);
      if (!entry.symptoms.some(s => s.id === chip.dataset.symptom)) return;
      timeEditTarget = { kind: 'symptom', id: chip.dataset.symptom };
      renderDaySheetContent();
    });
  });
  document.querySelectorAll('#moodChipRow .chip').forEach(chip => {
    chip.onclick = () => {
      State.dayLogs = new Map(toggleMoodEntry(daySheetISO, chip.dataset.mood).map(e => [e.date, e]));
      renderDaySheetContent();
    };
    attachLongPress(chip, () => {
      const entry = State.dayLogs.get(daySheetISO) || emptyDayEntry(daySheetISO);
      if (!entry.moods.some(m => m.id === chip.dataset.mood)) return;
      timeEditTarget = { kind: 'mood', id: chip.dataset.mood };
      renderDaySheetContent();
    });
  });

  const timeEditorInput = document.getElementById('timeEditorInput');
  const timeEditorCancelBtn = document.getElementById('timeEditorCancelBtn');
  if (timeEditorCancelBtn) timeEditorCancelBtn.onclick = () => { timeEditTarget = null; renderDaySheetContent(); };
  const timeEditorSaveBtn = document.getElementById('timeEditorSaveBtn');
  if (timeEditorSaveBtn) timeEditorSaveBtn.onclick = () => {
    const value = timeEditorInput.value;
    if (!value) return;
    const updated = timeEditTarget.kind === 'symptom'
      ? updateSymptomTime(daySheetISO, timeEditTarget.id, value)
      : updateMoodTime(daySheetISO, timeEditTarget.id, value);
    State.dayLogs = new Map(updated.map(e => [e.date, e]));
    timeEditTarget = null;
    renderDaySheetContent();
  };

  const addSymptomBtn = document.getElementById('symptomCustomAddBtn');
  const symptomInput = document.getElementById('symptomCustomInput');
  if (addSymptomBtn) addSymptomBtn.onclick = () => {
    const label = symptomInput.value.trim();
    if (!label) return;
    const { customItems, item } = addCustomSymptom(label);
    State.customItems = customItems;
    State.dayLogs = new Map(toggleSymptomEntry(daySheetISO, item.id).map(e => [e.date, e]));
    renderDaySheetContent();
  };

  const addMoodBtn = document.getElementById('moodCustomAddBtn');
  const moodInput = document.getElementById('moodCustomInput');
  if (addMoodBtn) addMoodBtn.onclick = () => {
    const label = moodInput.value.trim();
    if (!label) return;
    const { customItems, item } = addCustomMood(label);
    State.customItems = customItems;
    State.dayLogs = new Map(toggleMoodEntry(daySheetISO, item.id).map(e => [e.date, e]));
    renderDaySheetContent();
  };
}

/** Großes Bottom-Sheet für Schmerz-Einträge (Kategorie + Intensität +
    Tageszeit, mehrere pro Tag möglich), Symptome und Stimmung — nur im
    Detailgrad "Detailliert" (Einstellungen -> Schmerzen), siehe
    handleDayLongPress() oben. Liegt außerhalb von #app (wie der Toast in
    02-state-theme.js), damit ein Re-Render der aktuellen View das Sheet nicht
    versehentlich mit wegreißt. Jede Interaktion speichert sofort (kein
    separater "Speichern"-Schritt) — Tap auf den abgedunkelten Hintergrund oder
    "Schließen" beendet die Eingabe. */
function openDayDetailSheet(iso){
  closeDaySheet();
  daySheetISO = iso;
  painDraft = null;
  timeEditTarget = null;
  dayNoteDraft = (State.dayLogs.get(iso) || {}).note || '';
  const date = parseISODate(iso);

  const backdrop = document.createElement('div');
  backdrop.className = 'pain-sheet-backdrop';
  backdrop.id = 'daySheetBackdrop';
  backdrop.innerHTML = `
    <div class="pain-sheet day-sheet" role="dialog" aria-modal="true" aria-label="Tag erfassen">
      <p class="pain-sheet-date">${fmtDateReadable(date)}</p>
      <p class="pain-sheet-title">Was hast du erlebt?</p>
      <div id="daySheetBody">${daySheetBodyHTML(iso)}</div>
      <div class="pain-sheet-actions">
        <button type="button" class="pain-sheet-btn pain-sheet-btn--secondary" id="daySheetCloseBtn">Schließen</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeDaySheet();
  });
  document.getElementById('daySheetCloseBtn').onclick = () => closeDaySheet();

  wireDaySheetBody();
}

function closeDaySheet(){
  const backdrop = document.getElementById('daySheetBackdrop');
  if (backdrop && daySheetISO){
    // Ungespeicherte Notiz-Änderung beim Schließen noch sichern (z.B. Tap
    // direkt auf den abgedunkelten Hintergrund feuert keine Blur-Reihenfolge,
    // die zuverlässig VOR dem Entfernen des Sheets greift).
    State.dayLogs = new Map(setDayNote(daySheetISO, dayNoteDraft).map(e => [e.date, e]));
  }
  if (backdrop) backdrop.remove();
  daySheetISO = null;
  painDraft = null;
  timeEditTarget = null;
  dayNoteDraft = '';
}

// Ein delegierter Klick-Handler auf dem Monats-Container statt Wiring pro Tageszelle:
// Die Liste wächst per Infinite-Scroll unbegrenzt, ein Handler pro Zelle würde bei
// mehreren Jahren unnötig viele Listener anhäufen. Zusätzlich per Pointer-Events
// eine einfache Long-Press-Erkennung für Schmerztage (siehe handleDayLongPress()):
// nach LONG_PRESS_MS ohne nennenswerte Fingerbewegung gilt der Druck als "lang" und
// der anschließende click (der beim Loslassen ohnehin feuert) wird einmalig unterdrückt.
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 10;
let longPressTimer = null;
let longPressTriggered = false;
let longPressStartX = 0;
let longPressStartY = 0;

function clearLongPressTimer(){
  clearTimeout(longPressTimer);
  longPressTimer = null;
}

function wireCalendarDayClicks(){
  const container = document.getElementById('calendarMonths');

  container.onclick = (e) => {
    const btn = e.target.closest('.day-cell[data-date]');
    if (!btn) return;
    if (longPressTriggered){
      longPressTriggered = false;
      return;
    }
    handleDayClick(btn.dataset.date);
  };

  container.onpointerdown = (e) => {
    const btn = e.target.closest('.day-cell[data-date]');
    if (!btn) return;
    longPressStartX = e.clientX;
    longPressStartY = e.clientY;
    clearLongPressTimer();
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      handleDayLongPress(btn.dataset.date);
    }, LONG_PRESS_MS);
  };

  container.onpointermove = (e) => {
    if (!longPressTimer) return;
    const dx = Math.abs(e.clientX - longPressStartX);
    const dy = Math.abs(e.clientY - longPressStartY);
    // Zu viel Bewegung während des Drucks -> vermutlich Scrollen, kein Long-Press
    if (dx > LONG_PRESS_MOVE_TOLERANCE || dy > LONG_PRESS_MOVE_TOLERANCE) clearLongPressTimer();
  };

  container.onpointerup = clearLongPressTimer;
  container.onpointercancel = clearLongPressTimer;
  container.onpointerleave = clearLongPressTimer;
}

function appendMonthsToEnd(monthsAscending){
  const container = document.getElementById('calendarMonths');
  const html = monthsAscending.map(({ year, month }) => monthBlockHTML(year, month)).join('');
  container.insertAdjacentHTML('beforeend', html);
}

function prependMonthsToStart(monthsAscending){
  const container = document.getElementById('calendarMonths');
  const scrollEl = document.getElementById('calendarScroll');
  const prevHeight = scrollEl.scrollHeight;
  const prevTop = scrollEl.scrollTop;

  const html = monthsAscending.map(({ year, month }) => monthBlockHTML(year, month)).join('');
  container.insertAdjacentHTML('afterbegin', html);

  // Scroll-Position kompensieren, damit sich die sichtbaren Monate beim Nachladen
  // nach oben NICHT verschieben (klassisches Infinite-Scroll-nach-oben-Problem).
  const newHeight = scrollEl.scrollHeight;
  scrollEl.scrollTop = prevTop + (newHeight - prevHeight);
}

function loadPreviousMonths(count){
  if (calendarLoadingPrev) return;
  calendarLoadingPrev = true;

  const before = State.calendar.earliestLoaded;
  let cursor = { year: before.year, month: before.month };
  const monthsToAdd = [];
  for (let i = 0; i < count; i++){
    cursor = shiftYearMonth(cursor.year, cursor.month, -1);
    monthsToAdd.unshift(cursor); // ergibt aufsteigende Reihenfolge (älteste zuerst)
  }
  prependMonthsToStart(monthsToAdd);
  State.calendar.earliestLoaded = monthsToAdd[0];

  calendarLoadingPrev = false;
}

function loadNextMonths(count){
  if (calendarLoadingNext) return;
  calendarLoadingNext = true;

  const after = State.calendar.latestLoaded;
  let cursor = { year: after.year, month: after.month };
  const monthsToAdd = [];
  for (let i = 0; i < count; i++){
    cursor = shiftYearMonth(cursor.year, cursor.month, 1);
    monthsToAdd.push(cursor);
  }
  appendMonthsToEnd(monthsToAdd);
  State.calendar.latestLoaded = monthsToAdd[monthsToAdd.length - 1];

  calendarLoadingNext = false;
}

function setupCalendarObservers(){
  const scrollEl = document.getElementById('calendarScroll');
  const topSentinel = document.getElementById('calendarSentinelTop');
  const bottomSentinel = document.getElementById('calendarSentinelBottom');

  if (calendarTopObserver) calendarTopObserver.disconnect();
  if (calendarBottomObserver) calendarBottomObserver.disconnect();

  // rootMargin sorgt dafür, dass schon VOR dem Erreichen des Rands nachgeladen wird,
  // damit das Scrollen ohne sichtbares Ruckeln/Nachladen-Stottern wirkt.
  const options = { root: scrollEl, rootMargin: '600px 0px 600px 0px', threshold: 0 };

  calendarTopObserver = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) loadPreviousMonths(3); });
  }, options);
  calendarBottomObserver = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) loadNextMonths(3); });
  }, options);

  calendarTopObserver.observe(topSentinel);
  calendarBottomObserver.observe(bottomSentinel);
}

export function scrollToCurrentMonth(){
  const y = State.today.getFullYear();
  const m = State.today.getMonth();
  const block = document.querySelector(`.month-block[data-year="${y}"][data-month="${m}"]`);
  if (block) block.scrollIntoView({ block: 'start' });
}

export function renderCalendarView(){
  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="app-header app-header-row">
      ${appLogoButtonHTML('appTitleBtn')}
      <button type="button" class="header-icon-btn" id="settingsBtn" aria-label="Einstellungen">${APP_DATA.ICONS.SETTINGS}</button>
    </header>
    <div class="calendar-scroll" id="calendarScroll">
      <div class="calendar-sentinel-top" id="calendarSentinelTop"></div>
      <div class="calendar-months" id="calendarMonths"></div>
      <div class="calendar-sentinel-bottom" id="calendarSentinelBottom"></div>
    </div>
    ${bottomNavHTML('calendar')}
  `;
  document.getElementById('appTitleBtn').onclick = () => goCalendarHome();
  document.getElementById('settingsBtn').onclick = () => goSettings();

  // Zustand VOR dem HTML-Aufbau zurücksetzen: monthBlockHTML() liest
  // State.calendar.selection.start direkt beim Rendern — ein Reset danach
  // würde eine evtl. noch offene Auswahl aus einem früheren Aufruf (z.B. Tab
  // gewechselt, ohne die Perioden-Auswahl abzuschließen) im frischen HTML
  // fälschlich weiter als "is-selecting" anzeigen.
  State.calendar.selection.start = null;

  // Vorhersage-Fenster einmal pro Render bestimmen (ändert sich nur, wenn sich
  // State.periods ändert, siehe handleDayClick()) — monthBlockHTML() liest es
  // synchron beim Aufbau der Tageszellen.
  predictedDaysMap = computePredictedDaysMap();

  // Initial: das GESAMTE laufende Kalenderjahr, damit von Anfang an in beide
  // Richtungen flüssig gescrollt werden kann, ohne sofort nachladen zu müssen.
  const year = State.today.getFullYear();
  const container = document.getElementById('calendarMonths');
  let html = '';
  for (let m = 0; m <= 11; m++) html += monthBlockHTML(year, m);
  container.innerHTML = html;

  State.calendar.earliestLoaded = { year, month: 0 };
  State.calendar.latestLoaded = { year, month: 11 };

  wireCalendarDayClicks();
  setupCalendarObservers();
  wireBottomNav();
  scrollToCurrentMonth();
}
