/* ---------------------------------------------------
   Utils (Datum)
   Reine Helferfunktionen, kein State, kein DOM-Rendering.
--------------------------------------------------- */
function pad2(n){ return n < 10 ? '0' + n : String(n); }

/** Date -> 'YYYY-MM-DD' (lokale Zeit, keine UTC-Verschiebung) */
function formatISODate(date){
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

/** 'YYYY-MM-DD' -> Date (lokale Zeit, 00:00 Uhr) */
function parseISODate(iso){
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isSameDay(a, b){
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isToday(date){ return isSameDay(date, new Date()); }

function addDays(date, n){
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Ganzzahlige Differenz in Tagen (b - a), unabhängig von Uhrzeit/Zeitumstellung */
function daysBetween(a, b){
  const msPerDay = 24 * 60 * 60 * 1000;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / msPerDay);
}

function getMonthLabel(year, month0){
  const label = new Date(year, month0, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** year/month0 (0-basiert) um n Monate verschieben -> { year, month } */
function shiftYearMonth(year, month0, n){
  const d = new Date(year, month0 + n, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/* ---------------------------------------------------
   Vorhersage-Engine
   Reine Funktion: bekommt die gespeicherten Perioden + "heute" übergeben,
   liefert ein fertig berechnetes Stats-Objekt zurück. Kein State-Zugriff,
   kein DOM — die Stats-View (08-stats-progress.js) übernimmt nur noch die
   Darstellung. Umfang wie besprochen: Ø Zykluslänge/-dauer über ALLE
   vorhandenen Zyklen, Vorhersage nächste Periode, Eisprung- & Fruchtbares-
   Fenster-Schätzung (rückwärts von der Lutealphase, siehe APP_DATA.CYCLE_
   DEFAULTS.LUTEAL_PHASE_LENGTH — deutlich konstanter als die Follikelphase).
--------------------------------------------------- */
function average(numbers){
  if (!numbers.length) return null;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

/** Median (mittlerer Wert einer sortierten Liste) — robuster gegen einzelne
    Ausreißer als der Durchschnitt. Basis für detectOutlierMask() direkt
    darunter sowie für die Skalierung der Balkendiagramme (barChartSVG() in
    07-chart.js, das diese Funktion mitverwendet). */
function median(numbers){
  if (!numbers.length) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Markiert statistische Ausreißer in `values` über den modifizierten Z-Score
    (Iglewicz & Hoaglin) auf Basis von Median und MAD (Median der absoluten
    Abweichungen vom Median) — robuster als eine normale Standardabweichung,
    weil ein einzelner Riesenwert (z.B. ein 195-Tage-"Zyklus" durch eine
    Erfassungslücke) den MAD selbst kaum verzerrt, im Gegensatz zur normalen
    Standardabweichung. Schwelle 3,5 ist der in der Statistik gängige Wert für
    diesen Test. `absoluteThreshold` ist zusätzlich eine feste Notbremse (z.B.
    90 Tage für Zykluslängen: so lang ist so gut wie sicher eine Erfassungs-
    lücke, unabhängig von der individuellen Streuung). Braucht mindestens 4
    Werte, um zwischen echtem Ausreißer und normaler Schwankung unterscheiden
    zu können — bei weniger Werten wird sicherheitshalber nichts markiert. */
function detectOutlierMask(values, absoluteThreshold){
  if (values.length < 4) return values.map(() => false);
  const med = median(values);
  const deviations = values.map(n => Math.abs(n - med));
  const mad = median(deviations);

  return values.map(n => {
    if (absoluteThreshold != null && n > absoluteThreshold) return true;
    if (mad === 0) return false;
    const modifiedZ = 0.6745 * (n - med) / mad;
    return Math.abs(modifiedZ) > 3.5;
  });
}

/** Wie average(), aber neuere Werte zählen stärker als ältere — Werte werden in
    chronologischer Reihenfolge (älteste zuerst) erwartet. Exponentieller Zerfall:
    der neueste Wert hat Gewicht 1, jeder Schritt zurück wird mit `decay` multipliziert
    (Default 0.85 -> der älteste von z.B. 6 Zyklen zählt nur noch mit ca. 1/3 Gewicht).
    Reagiert dadurch schneller auf eine echte Verschiebung des Zyklus, ohne einzelne
    Ausreißer überzubewerten (die Streuungs-/Kappungslogik für die Vorhersage-Fenster-
    breite bleibt unverändert auf stdDeviation() der Rohwerte). */
function weightedAverage(numbers, decay){
  if (!numbers.length) return null;
  const r = decay ?? 0.85;
  const n = numbers.length;
  let weightedSum = 0;
  let weightSum = 0;
  for (let i = 0; i < n; i++){
    const weight = Math.pow(r, n - 1 - i);
    weightedSum += numbers[i] * weight;
    weightSum += weight;
  }
  return weightedSum / weightSum;
}

/** Standardabweichung (Stichprobe, n-1) — Maß für die Schwankung der Zykluslängen.
    Bestimmt weiter unten, wie weit sich das Vorhersage-Fenster (predictedPeriodDays)
    über die Mindestbreite von 3 Tagen vor/nach hinaus verbreitert: ein unregel-
    mäßiger Zyklus ergibt ein breiteres Fenster (gleiches Prinzip wie bei Drip, wo
    die Bandbreite ebenfalls an der Standardabweichung hängt). */
function stdDeviation(numbers){
  if (numbers.length < 2) return null;
  const avg = average(numbers);
  const variance = numbers.reduce((sum, n) => sum + (n - avg) ** 2, 0) / (numbers.length - 1);
  return Math.sqrt(variance);
}

function computeCycleStats(periods, today){
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  if (!sorted.length){
    return { hasData: false, hasPrediction: false };
  }

  // Zykluslänge = Abstand zwischen zwei aufeinanderfolgenden Periodenstarts.
  // Braucht mind. 2 Perioden -> bei nur 1 gespeicherten Periode ist dieses
  // Array leer, hasPrediction wird dann false.
  const cycleLengths = [];
  for (let i = 0; i < sorted.length - 1; i++){
    cycleLengths.push(daysBetween(parseISODate(sorted[i].start), parseISODate(sorted[i + 1].start)));
  }
  const periodLengths = sorted.map(p => daysBetween(parseISODate(p.start), parseISODate(p.end)) + 1);

  const hasPrediction = cycleLengths.length > 0;

  // Ausreißer (vermutliche Erfassungslücken, z.B. eine monatelange Pause beim
  // Eintragen, die als eine riesige "Zykluslänge" durchgeht) werden aus den
  // Ø-Berechnungen komplett rausgerechnet statt nur gekappt — sie sind ja
  // vermutlich gar kein echter Zyklus, sondern eine Lücke in den Daten.
  // Sicherheitsnetz: sollten (extrem unwahrscheinlich) ALLE Werte als Ausreißer
  // markiert werden, auf die Rohdaten zurückfallen statt mit einer leeren
  // Liste dazustehen.
  const cycleOutlierMask = detectOutlierMask(cycleLengths, 90);
  const nonOutlierCycleLengths = cycleLengths.filter((_, i) => !cycleOutlierMask[i]);
  const cleanedCycleLengths = nonOutlierCycleLengths.length ? nonOutlierCycleLengths : cycleLengths;
  const excludedCycleCount = cycleLengths.length - nonOutlierCycleLengths.length;

  const periodOutlierMask = detectOutlierMask(periodLengths);
  const nonOutlierPeriodLengths = periodLengths.filter((_, i) => !periodOutlierMask[i]);
  const cleanedPeriodLengths = nonOutlierPeriodLengths.length ? nonOutlierPeriodLengths : periodLengths;
  const excludedPeriodCount = periodLengths.length - nonOutlierPeriodLengths.length;

  // Ohne eigene Zyklusdaten auf den App-weiten Erfahrungswert zurückfallen
  // (28/5 Tage, siehe APP_DATA.CYCLE_DEFAULTS), damit Eisprung/Fenster auch
  // nach der allerersten Periode schon eine grobe Schätzung zeigen können.
  // weightedAverage() statt average(): neuere Zyklen fließen stärker in die
  // Vorhersage ein als alte, damit sich eine echte Verschiebung des Zyklus
  // (z.B. durch Alter, Lebensumstände) schneller in der Vorhersage bemerkbar
  // macht, statt von vielen älteren, evtl. nicht mehr repräsentativen Werten
  // ausgebremst zu werden.
  const avgCycleLength = Math.round(weightedAverage(cleanedCycleLengths) ?? APP_DATA.CYCLE_DEFAULTS.AVERAGE_CYCLE_LENGTH);
  const avgPeriodLength = Math.round(weightedAverage(cleanedPeriodLengths) ?? APP_DATA.CYCLE_DEFAULTS.AVERAGE_PERIOD_LENGTH);

  const lastPeriod = sorted[sorted.length - 1];
  const lastPeriodStart = parseISODate(lastPeriod.start);

  const ovulationCycleDay = avgCycleLength - APP_DATA.CYCLE_DEFAULTS.LUTEAL_PHASE_LENGTH;
  const ovulationDate = addDays(lastPeriodStart, ovulationCycleDay - 1);
  // Fenster = Spermien-Überlebenszeit (~5 Tage vor Eisprung) + Eizell-Lebensdauer (~1 Tag danach)
  const fertileStart = addDays(ovulationDate, -5);
  const fertileEnd = addDays(ovulationDate, 1);
  const nextPeriodStart = hasPrediction ? addDays(lastPeriodStart, avgCycleLength) : null;

  const currentCycleDay = daysBetween(lastPeriodStart, today) + 1;
  const todayISO = formatISODate(today);
  const inCurrentPeriod = sorted.some(p => todayISO >= p.start && todayISO <= p.end);
  const inFertileWindow = todayISO >= formatISODate(fertileStart) && todayISO <= formatISODate(fertileEnd);

  let currentPhase;
  if (inCurrentPeriod) currentPhase = 'Menstruation';
  else if (inFertileWindow) currentPhase = 'Fruchtbares Fenster';
  else if (currentCycleDay < ovulationCycleDay) currentPhase = 'Follikelphase';
  else currentPhase = 'Lutealphase';

  // Vorhersage-Fenster für die Kalender-Ringe (04-calendar.js): symmetrisch um den
  // geschätzten Start, mindestens 3 Tage vor UND 3 Tage nach — verbreitert sich
  // mit der Standardabweichung der bisherigen Zykluslängen, wenn diese größer als 3
  // ist (unregelmäßiger Zyklus -> breiteres Fenster, wie bei Drip). Nach oben
  // gedeckelt auf 7 Tage: ein einzelner Ausreißer (z.B. eine monatelange
  // Erfassungslücke, die als eine riesige "Zykluslänge" durchgeht) zieht die
  // Standardabweichung sonst so stark nach oben, dass das Fenster auf Wochen
  // aufbläht statt eine sinnvolle Vorhersage zu bleiben. intensity 1 = wahr-
  // scheinlichster Tag (durchgezogener Ring), sonst gestrichelter Ring. Nur
  // heutige/zukünftige Tage werden aufgenommen.
  const predictedPeriodDays = [];
  if (nextPeriodStart){
    const stdDev = cleanedCycleLengths.length >= 2 ? stdDeviation(cleanedCycleLengths) : 0;
    const halfWidth = Math.min(7, Math.max(3, Math.round(stdDev)));
    for (let offset = -halfWidth; offset <= halfWidth; offset++){
      const iso = formatISODate(addDays(nextPeriodStart, offset));
      if (iso < todayISO) continue;
      predictedPeriodDays.push({ iso, intensity: offset === 0 ? 1 : 1 - Math.abs(offset) / halfWidth });
    }
  }

  // Regelmäßigkeits-Score (0–100): übersetzt die Streuung der (bereinigten)
  // Zykluslängen in eine leicht verständliche Zahl. 100 = jeder Zyklus exakt
  // gleich lang, sinkt mit wachsender Standardabweichung über eine Exponential-
  // kurve (0 Tage Streuung -> 100, 3 Tage -> ~74, 7 Tage -> ~50, 14 Tage -> ~25).
  // Braucht mind. 2 (bereinigte) Zykluslängen, sonst kann keine Streuung
  // berechnet werden -> null (Stats-View zeigt dann nichts an, kein Platzhalter-Ballast).
  let regularityScore = null;
  if (cleanedCycleLengths.length >= 2){
    const sd = stdDeviation(cleanedCycleLengths);
    regularityScore = Math.max(0, Math.min(100, Math.round(100 * Math.exp(-sd / 10))));
  }

  return {
    hasData: true,
    hasPrediction,
    cycleCount: cycleLengths.length,
    excludedCycleCount,
    excludedPeriodCount,
    avgCycleLength,
    avgPeriodLength,
    regularityScore,
    lastPeriodStart,
    nextPeriodStart,
    ovulationDate,
    fertileStart,
    fertileEnd,
    currentCycleDay,
    currentPhase,
    predictedPeriodDays
  };
}

/* ---------------------------------------------------
   Schmerztage-Musteranalyse
   Reine Funktionen für 07-chart.js: ordnen jeden als Schmerztag markierten Tag
   (State.painDays, togglePainDay() in 01-storage.js) rückblickend einer Zyklus-
   phase zu — anders als computeCycleStats() oben, das nur "heute" einordnet.
--------------------------------------------------- */

/** Zyklusphase für ein beliebiges Datum anhand der Perioden-Historie. sortedPeriods
    muss chronologisch aufsteigend sortiert sein. Gibt null zurück, wenn das Datum
    vor der ersten erfassten Periode liegt (keine Zuordnung möglich). */
function classifyPhaseForDate(iso, sortedPeriods, avgCycleLength){
  if (sortedPeriods.some(p => iso >= p.start && iso <= p.end)) return 'Menstruation';

  // Letzte Periode VOR (oder an) diesem Datum als Zyklus-Referenzpunkt suchen.
  let refIdx = -1;
  for (let i = 0; i < sortedPeriods.length; i++){
    if (sortedPeriods[i].start <= iso) refIdx = i; else break;
  }
  if (refIdx === -1) return null;

  const refPeriod = sortedPeriods[refIdx];
  const refStart = parseISODate(refPeriod.start);
  const cycleDay = daysBetween(refStart, parseISODate(iso)) + 1;

  // Falls die nächste Periode bereits bekannt ist, ihre tatsächliche Zykluslänge
  // nutzen (genauer als der Durchschnitt).
  const nextPeriod = sortedPeriods[refIdx + 1] || null;
  const cycleLength = nextPeriod
    ? daysBetween(refStart, parseISODate(nextPeriod.start))
    : avgCycleLength;

  const ovulationCycleDay = cycleLength - APP_DATA.CYCLE_DEFAULTS.LUTEAL_PHASE_LENGTH;
  const ovulationDate = addDays(refStart, ovulationCycleDay - 1);
  const fertileStartISO = formatISODate(addDays(ovulationDate, -5));
  const fertileEndISO = formatISODate(addDays(ovulationDate, 1));

  if (iso >= fertileStartISO && iso <= fertileEndISO) return 'Fruchtbares Fenster';
  if (cycleDay < ovulationCycleDay) return 'Follikelphase';
  return 'Lutealphase';
}

/** Zählt die Schmerztage je Zyklusphase und ermittelt die häufigste. */
function computePainPhaseStats(periods, painDays){
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  const cycleLengths = [];
  for (let i = 0; i < sorted.length - 1; i++){
    cycleLengths.push(daysBetween(parseISODate(sorted[i].start), parseISODate(sorted[i + 1].start)));
  }
  const avgCycleLength = Math.round(average(cycleLengths) ?? APP_DATA.CYCLE_DEFAULTS.AVERAGE_CYCLE_LENGTH);

  const counts = { 'Menstruation': 0, 'Follikelphase': 0, 'Fruchtbares Fenster': 0, 'Lutealphase': 0 };
  let unclassified = 0;

  painDays.forEach(iso => {
    const phase = classifyPhaseForDate(iso, sorted, avgCycleLength);
    if (phase) counts[phase] += 1;
    else unclassified += 1;
  });

  const classifiedTotal = painDays.length - unclassified;
  let dominant = null;
  if (classifiedTotal > 0){
    dominant = Object.keys(counts).reduce((best, phase) => counts[phase] > counts[best] ? phase : best);
    if (counts[dominant] === 0) dominant = null;
  }

  return { counts, unclassified, classifiedTotal, totalPainDays: painDays.length, dominant };
}

/* ---------------------------------------------------
   Chart-Daten
   Reine Funktion für 07-chart.js: liefert je erfasster Periode ihre Dauer
   sowie je Übergang zwischen zwei Perioden die Zykluslänge, jeweils
   chronologisch sortiert mit Startdatum als Label-Basis.
--------------------------------------------------- */
function computeChartData(periods){
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  const periodLengths = sorted.map(p => ({
    start: p.start,
    length: daysBetween(parseISODate(p.start), parseISODate(p.end)) + 1
  }));
  const cycleLengths = [];
  for (let i = 0; i < sorted.length - 1; i++){
    cycleLengths.push({
      start: sorted[i].start,
      length: daysBetween(parseISODate(sorted[i].start), parseISODate(sorted[i + 1].start))
    });
  }
  return { periodLengths, cycleLengths };
}
