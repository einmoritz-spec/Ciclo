import { APP_DATA } from './data/app-data.js';

/**
 * @typedef {import('./types.js').Period} Period
 * @typedef {import('./types.js').DayLog} DayLog
 * @typedef {import('./types.js').CycleStats} CycleStats
 */

/* ---------------------------------------------------
   Utils (Datum)
   Reine Helferfunktionen, kein State, kein DOM-Rendering.
--------------------------------------------------- */
function pad2(n){ return n < 10 ? '0' + n : String(n); }

/** Date -> 'YYYY-MM-DD' (lokale Zeit, keine UTC-Verschiebung)
    @param {Date} date
    @returns {string} */
export function formatISODate(date){
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

/** 'YYYY-MM-DD' -> Date (lokale Zeit, 00:00 Uhr)
    @param {string} iso
    @returns {Date} */
export function parseISODate(iso){
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isSameDay(a, b){
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** @param {Date} date @returns {boolean} */
export function isToday(date){ return isSameDay(date, new Date()); }

/** @param {Date} date @param {number} n @returns {Date} */
export function addDays(date, n){
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Ganzzahlige Differenz in Tagen (b - a), unabhängig von Uhrzeit/Zeitumstellung
    @param {Date} a @param {Date} b @returns {number} */
export function daysBetween(a, b){
  const msPerDay = 24 * 60 * 60 * 1000;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / msPerDay);
}

/* ---------------------------------------------------
   Farb-Generator für "Eigene Farbe" (5. Theme-Option, siehe customPaletteHTML()
   in 09-settings.js). Aus einer einzigen, aus einer kuratierten Palette
   gewählten Basisfarbe (APP_DATA.EARTHY_PALETTE) wird per HSL-Rechnung ein
   komplettes Hell/Dunkel-Variablenpaar abgeleitet — dieselbe Struktur wie bei
   den vier festen APP_DATA.THEME_PRESETS, nur automatisch statt von Hand
   abgestimmt.
--------------------------------------------------- */
function clampNum(v, min, max){ return Math.min(max, Math.max(min, v)); }

export function hexToRgb(hex){
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const bigint = parseInt(full, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

export function rgbToHex(r, g, b){
  const toHex = n => clampNum(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function rgbToHsl(r, g, b){
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min){
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max){
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l){
  h = ((h % 360) + 360) % 360;
  s = clampNum(s, 0, 100) / 100;
  l = clampNum(l, 0, 100) / 100;
  if (s === 0){
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (pp, qq, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return pp + (qq - pp) * 6 * t;
    if (t < 1 / 2) return qq;
    if (t < 2 / 3) return pp + (qq - pp) * (2 / 3 - t) * 6;
    return pp;
  };
  const hk = h / 360;
  return {
    r: Math.round(hue2rgb(p, q, hk + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hk) * 255),
    b: Math.round(hue2rgb(p, q, hk - 1 / 3) * 255)
  };
}

export function hexToHsl(hex){
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

export function hslToHex(h, s, l){
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

/** Leitet aus einer Basisfarbe (hex) ein komplettes Hell/Dunkel-Variablenpaar
    ab — dieselben 13 CSS-Custom-Properties wie jedes feste Farbthema in
    APP_DATA.THEME_PRESETS. Grundidee: Farbton (h) der Basisfarbe bleibt
    überall erhalten, nur Sättigung/Helligkeit werden je Rolle angepasst
    (dunkler/entsättigter Header, sehr helle/entsättigte Fläche, kräftigerer
    Akzent, ...). Perioden-Ton (period-bg/-text) nutzt einen um +25° gedrehten,
    wärmeren Farbton (wirkt wie ein eigenständiger, aber verwandter Sand-/
    Terracotta-Ton), Schmerz-Ton (pain) einen um +150° gedrehten, deutlich
    abgesetzten Kontrastton — beides analog zur Systematik der festen Themen. */
export function generateEarthyTheme(baseHex){
  const { h, s } = hexToHsl(baseHex);
  const warmHue = (h + 25) % 360;
  const painHue = (h + 150) % 360;

  const light = {
    '--color-header-bg': hslToHex(h, clampNum(s * 0.55, 12, 30), 15),
    '--color-header-text': '#FFFFFF',
    '--color-brand': hslToHex(h, clampNum(s * 0.6, 20, 45), 74),
    '--color-bg': hslToHex(h, clampNum(s * 0.35, 8, 22), 93),
    '--color-surface': '#FFFFFF',
    '--color-accent': hslToHex(h, clampNum(s + 8, 30, 62), 46),
    '--color-text-heading': hslToHex(h, clampNum(s * 0.45, 10, 25), 17),
    '--color-text-day': hslToHex(h, clampNum(s * 0.3, 8, 20), 32),
    '--color-text-muted': hslToHex(h, clampNum(s * 0.22, 6, 16), 58),
    '--color-period-bg': hslToHex(warmHue, 40, 79),
    '--color-period-text': hslToHex(warmHue, 45, 33),
    '--color-pain': hslToHex(painHue, 30, 52),
    '--color-selecting-outline': hslToHex(h, clampNum(s + 8, 30, 62), 46),
    '--color-nav-inactive': hslToHex(h, clampNum(s * 0.2, 6, 16), 68)
  };

  const dark = {
    '--color-header-bg': hslToHex(h, clampNum(s * 0.5, 10, 26), 9),
    '--color-header-text': '#FFFFFF',
    '--color-brand': hslToHex(h, clampNum(s * 0.55, 20, 42), 74),
    '--color-bg': hslToHex(h, clampNum(s * 0.35, 8, 20), 8),
    '--color-surface': hslToHex(h, clampNum(s * 0.3, 8, 18), 14),
    '--color-accent': hslToHex(h, clampNum(s + 12, 35, 68), 60),
    '--color-text-heading': hslToHex(h, clampNum(s * 0.22, 4, 14), 92),
    '--color-text-day': hslToHex(h, clampNum(s * 0.18, 4, 12), 80),
    '--color-text-muted': hslToHex(h, clampNum(s * 0.18, 4, 12), 60),
    '--color-period-bg': hslToHex(warmHue, 34, 25),
    '--color-period-text': hslToHex(warmHue, 42, 80),
    '--color-pain': hslToHex(painHue, 35, 68),
    '--color-selecting-outline': hslToHex(h, clampNum(s + 12, 35, 68), 60),
    '--color-nav-inactive': hslToHex(h, clampNum(s * 0.2, 6, 16), 42)
  };

  return { light, dark };
}

export function getMonthLabel(year, month0){
  const label = new Date(year, month0, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** 'HH:MM' aus einem ISO-Zeitstempel für den value eines <input type="time">
    im manuellen Zeit-Editor (openTimeEditor()-Flow, 04-calendar.js). Ohne
    Zeitstempel (sollte praktisch nicht vorkommen, da loggedAt immer beim
    Anlegen gesetzt wird) fällt es auf die aktuelle Uhrzeit zurück, statt ein
    leeres Feld zu zeigen. */
export function timeInputValue(iso){
  const d = iso ? new Date(iso) : new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

/** 'HH:MM' aus einem ISO-Zeitstempel (loggedAt, siehe nowStamp() in
    01-storage.js) in lokaler Zeit — für die automatisch erfasste Uhrzeit eines
    Schmerz-/Symptom-/Stimmungs-Eintrags (04-calendar.js). null bei fehlendem
    Zeitstempel (ältere, migrierte Einträge ohne Erfassungszeit). */
export function fmtTimeShort(iso){
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/** Escaped einen String für die sichere Verwendung als HTML-Attributwert
    (z.B. der Notiz-Text eines "Sonstige"-Schmerz-Eintrags, der beim Neu-
    Rendern des Sheets als value="..." wieder eingesetzt wird). */
export function escapeAttr(str){
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** year/month0 (0-basiert) um n Monate verschieben -> { year, month } */
export function shiftYearMonth(year, month0, n){
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
/** @param {number[]} numbers @returns {number|null} */
export function average(numbers){
  if (!numbers.length) return null;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

/** Median (mittlerer Wert einer sortierten Liste) — robuster gegen einzelne
    Ausreißer als der Durchschnitt. Basis für detectOutlierMask() direkt
    darunter sowie für die Skalierung der Balkendiagramme (barChartSVG() in
    07-chart.js, das diese Funktion mitverwendet).
    @param {number[]} numbers @returns {number|null} */
export function median(numbers){
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
export function detectOutlierMask(values, absoluteThreshold){
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
export function weightedAverage(numbers, decay){
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
export function stdDeviation(numbers){
  if (numbers.length < 2) return null;
  const avg = average(numbers);
  const variance = numbers.reduce((sum, n) => sum + (n - avg) ** 2, 0) / (numbers.length - 1);
  return Math.sqrt(variance);
}

/** @param {Period[]} periods @param {Date} today @returns {CycleStats} */
export function computeCycleStats(periods, today){
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
   (State.dayLogs, togglePainDayQuick()/addPainEntry() in 01-storage.js) rückblickend einer Zyklus-
   phase zu — anders als computeCycleStats() oben, das nur "heute" einordnet.
--------------------------------------------------- */

/** Zyklusphase für ein beliebiges Datum anhand der Perioden-Historie. sortedPeriods
    muss chronologisch aufsteigend sortiert sein. Gibt null zurück, wenn das Datum
    vor der ersten erfassten Periode liegt (keine Zuordnung möglich). */
export function classifyPhaseForDate(iso, sortedPeriods, avgCycleLength){
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

/** Zählt Vorkommen (isoList darf Duplikate enthalten -> ein Datum mit mehreren
    Einträgen zählt entsprechend mehrfach) je Zyklusphase und ermittelt die
    häufigste Phase. Generische Basis für "Schmerzen/Symptome/Stimmung nach
    Zyklusphase" (07-chart.js). */
/** Einfache lineare Regression (kleinste Quadrate) über eine Werteliste,
    Index (0, 1, 2, …) als x-Achse — für die Trend-Linie im Zykluslängen-
    Trend-Diagramm (07-chart.js). Gibt slope (Änderung je Schritt) und
    intercept zurück; bei weniger als 2 Werten null (keine Gerade bestimmbar). */
export function computeLinearTrend(values){
  const n = values.length;
  if (n < 2) return null;
  const xs = values.map((_, i) => i);
  const xMean = average(xs);
  const yMean = average(values);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++){
    num += (xs[i] - xMean) * (values[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

/** Erkennt ein einfaches, oft nützliches Muster: wie viele Tage VOR dem
    jeweils nächsten Periodenbeginn ein Beschwerden-Eintrag im Schnitt liegt
    (z.B. "Schmerzen treten bei dir im Schnitt 3 Tage vor der Periode auf").
    isoList darf Duplikate enthalten (Gewichtung). Nur Abstände von 0–14 Tagen
    fließen ein (alles andere ist vermutlich kein Vorbote der nächsten Periode,
    sondern reiner Zufall/ein anderer Zyklusabschnitt). Braucht mindestens 3
    verwertbare Vorkommen, sonst null (zu wenig Daten für eine verlässliche
    Aussage). */
export function computeLeadTimeInsight(periods, isoList){
  const sortedPeriods = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  if (!sortedPeriods.length) return null;

  const offsets = [];
  isoList.forEach(iso => {
    const next = sortedPeriods.find(p => p.start >= iso);
    if (!next) return;
    const offset = daysBetween(parseISODate(iso), parseISODate(next.start));
    if (offset >= 0 && offset <= 14) offsets.push(offset);
  });

  if (offsets.length < 3) return null;
  return { avgDaysBefore: average(offsets), count: offsets.length };
}

/** Zählt Vorkommen (isoList darf Duplikate enthalten -> ein Datum mit mehreren
    Einträgen zählt entsprechend mehrfach) je Zyklusphase und ermittelt die
    häufigste Phase. Generische Basis für "Schmerzen/Symptome/Stimmung nach
    Zyklusphase" (07-chart.js). */
export function computePhaseOccurrenceStats(periods, isoList){
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  const cycleLengths = [];
  for (let i = 0; i < sorted.length - 1; i++){
    cycleLengths.push(daysBetween(parseISODate(sorted[i].start), parseISODate(sorted[i + 1].start)));
  }
  const avgCycleLength = Math.round(average(cycleLengths) ?? APP_DATA.CYCLE_DEFAULTS.AVERAGE_CYCLE_LENGTH);

  const counts = { 'Menstruation': 0, 'Follikelphase': 0, 'Fruchtbares Fenster': 0, 'Lutealphase': 0 };
  let unclassified = 0;

  isoList.forEach(iso => {
    const phase = classifyPhaseForDate(iso, sorted, avgCycleLength);
    if (phase) counts[phase] += 1;
    else unclassified += 1;
  });

  const classifiedTotal = isoList.length - unclassified;
  let dominant = null;
  if (classifiedTotal > 0){
    dominant = Object.keys(counts).reduce((best, phase) => counts[phase] > counts[best] ? phase : best);
    if (counts[dominant] === 0) dominant = null;
  }

  return { counts, unclassified, classifiedTotal, totalCount: isoList.length, dominant };
}

/** Alle Schmerz-Einträge (aus State.dayLogs, siehe 02-state-theme.js) als
    flache Liste mit angehängter Zyklusphase — Basis für Ø-Intensität und die
    Tageszeit-Verteilung (07-chart.js/08-stats-progress.js). Einträge ohne
    erfasste Intensität (z.B. aus dem "Schnell"-Modus oder migrierte alte
    Schmerztage) tragen intensity: null und fließen NICHT in den
    Intensitäts-Durchschnitt ein, zählen aber weiterhin als Schmerz-Eintrag
    (avgIntensityCount vs. totalCount unterscheiden das).
    dayLogsArray: Array wie von loadDayLogs()/State.dayLogs.values() geliefert. */
export function computePainStats(periods, dayLogsArray){
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  const cycleLengths = [];
  for (let i = 0; i < sorted.length - 1; i++){
    cycleLengths.push(daysBetween(parseISODate(sorted[i].start), parseISODate(sorted[i + 1].start)));
  }
  const avgCycleLength = Math.round(average(cycleLengths) ?? APP_DATA.CYCLE_DEFAULTS.AVERAGE_CYCLE_LENGTH);

  const entries = [];
  dayLogsArray.forEach(day => {
    (day.pain || []).forEach(p => {
      entries.push({
        iso: day.date,
        category: p.category,
        intensity: p.intensity,
        timeOfDay: p.timeOfDay,
        phase: classifyPhaseForDate(day.date, sorted, avgCycleLength)
      });
    });
  });

  const withIntensity = entries.filter(e => e.intensity != null);
  const avgIntensity = withIntensity.length ? average(withIntensity.map(e => e.intensity)) : null;

  const byTimeOfDay = {};
  APP_DATA.PAIN_TIME_OF_DAY.forEach(t => { byTimeOfDay[t.id] = 0; });
  entries.forEach(e => { if (e.timeOfDay && byTimeOfDay[e.timeOfDay] !== undefined) byTimeOfDay[e.timeOfDay] += 1; });

  return { entries, totalCount: entries.length, avgIntensity, byTimeOfDay };
}

/** Zählt, wie oft jede Symptom-/Stimmungs-catalogId über alle Tages-Logs
    hinweg vorkommt (catalogId -> Anzahl Vorkommen). Da mehrere Vorkommen pro
    Tag erlaubt sind (siehe addSymptomOccurrence()/addMoodOccurrence() in
    01-storage.js), zählt dies die GESAMTE Häufigkeit, nicht nur "an wie
    vielen Tagen". field: 'symptoms' | 'moods'. */
export function computeItemFrequency(dayLogsArray, field){
  const counts = {};
  dayLogsArray.forEach(day => {
    (day[field] || []).forEach(item => { counts[item.catalogId] = (counts[item.catalogId] || 0) + 1; });
  });
  return counts;
}

/** Wandelt ein id->Anzahl-Objekt (computeItemFrequency()) in absteigend
    sortierte { id, label, count }-Zeilen um, Labels aus dem übergebenen
    Katalog (symptomCatalog()/moodCatalog(), 02-state-theme.js) aufgelöst. */
export function topItemsFromCounts(counts, catalog, limit){
  return Object.keys(counts)
    .map(id => {
      const item = catalog.find(c => c.id === id);
      return { id, label: item ? item.label : id, count: counts[id] };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit ?? catalog.length);
}

/** Flache Liste aller (ggf. wiederholten) Daten, an denen mindestens ein
    Eintrag im Feld `field` ('symptoms' | 'moods') vorhanden war — ein Datum
    mit z.B. 3 Symptomen erscheint 3x (Gewichtung für computePhaseOccurrenceStats()). */
export function flattenFieldOccurrences(dayLogsArray, field){
  const list = [];
  dayLogsArray.forEach(day => {
    (day[field] || []).forEach(() => list.push(day.date));
  });
  return list;
}

/* ---------------------------------------------------
   Chart-Daten
   Reine Funktion für 07-chart.js: liefert je erfasster Periode ihre Dauer
   sowie je Übergang zwischen zwei Perioden die Zykluslänge, jeweils
   chronologisch sortiert mit Startdatum als Label-Basis.
--------------------------------------------------- */
export function computeChartData(periods){
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
