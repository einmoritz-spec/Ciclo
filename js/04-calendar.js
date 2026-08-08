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
   zelle schaltet unabhängig davon einen Schmerztag um (State.painDays,
   togglePainDay() in 01-storage.js) — rein informativ, beeinflusst keine
   Perioden-Logik.
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

/** Vorhersage-Kalender-Klasse für einen Tag: 'is-predicted-peak' (durchgezogener
    Ring) für den wahrscheinlichsten Tag (intensity === 1), 'is-predicted-range'
    (gestrichelter Ring) für die übrigen Tage im Fenster — nach Drip-Vorbild.
    Nur für Tage OHNE bereits eingetragene Periode (has-period hat Vorrang). */
function predictedDayClass(iso, hasPeriod){
  if (hasPeriod) return '';
  const intensity = predictedDaysMap.get(iso);
  if (intensity === undefined) return '';
  return intensity === 1 ? 'is-predicted-peak' : 'is-predicted-range';
}

function dayCellClasses(iso, date){
  const classes = ['day-cell'];
  if (isToday(date)) classes.push('is-today');
  const hasPeriod = !!findPeriodForDate(iso);
  if (hasPeriod) classes.push('has-period');
  const predictedClass = predictedDayClass(iso, hasPeriod);
  if (predictedClass) classes.push(predictedClass);
  if (State.painDays.has(iso)) classes.push('is-pain');
  if (State.calendar.selection.start === iso) classes.push('is-selecting');
  return classes.join(' ');
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
    return `<button type="button" class="${dayCellClasses(iso, date)}" data-date="${iso}">${day}</button>`;
  }).join('');

  return `
    <section class="month-block" data-year="${year}" data-month="${month0}">
      <h2 class="month-title">${getMonthLabel(year, month0)}</h2>
      <div class="weekday-row">${weekdayLabelsHTML}</div>
      <div class="days-grid">${blanksHTML}${dayCellsHTML}</div>
    </section>
  `;
}

/** Aktualisiert nur die Zustands-Klassen bestehender Tageszellen (kein Neuaufbau
    des HTML) — günstig genug, um nach jedem Klick über ALLE geladenen Monate zu
    laufen. */
function refreshDayCellClasses(){
  document.querySelectorAll('#calendarMonths .day-cell[data-date]').forEach(btn => {
    const iso = btn.dataset.date;
    const date = parseISODate(iso);
    btn.className = dayCellClasses(iso, date);
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
  refreshDayCellClasses();
}

function handleDayLongPress(iso){
  State.painDays = new Set(togglePainDay(iso));
  refreshDayCellClasses();
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

function scrollToCurrentMonth(){
  const y = State.today.getFullYear();
  const m = State.today.getMonth();
  const block = document.querySelector(`.month-block[data-year="${y}"][data-month="${m}"]`);
  if (block) block.scrollIntoView({ block: 'start' });
}

function renderCalendarView(){
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
