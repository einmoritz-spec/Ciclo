import { describe, it, expect } from 'vitest';
import {
  formatISODate, parseISODate, isToday, addDays, daysBetween, shiftYearMonth,
  average, median, stdDeviation, detectOutlierMask, weightedAverage,
  computeCycleStats, classifyPhaseForDate, computeLinearTrend,
  computeLeadTimeInsight, computePhaseOccurrenceStats, computePainStats,
  computeItemFrequency, topItemsFromCounts, flattenFieldOccurrences,
  computeChartData, hexToHsl, hslToHex, hexToRgb, rgbToHex, generateEarthyTheme,
  escapeAttr, fmtTimeShort
} from '../js/03-utils.js';

/** Baut eine Periode für Tests, ohne id-Rauschen in den Assertions zu haben. */
function period(start, end){
  return { id: 'p_' + start, start, end };
}

describe('Datum-Helfer', () => {
  it('formatISODate/parseISODate sind zueinander invers', () => {
    const date = new Date(2026, 2, 5); // 5. März 2026 (Monat 0-indexiert)
    const iso = formatISODate(date);
    expect(iso).toBe('2026-03-05');
    const back = parseISODate(iso);
    expect(back.getFullYear()).toBe(2026);
    expect(back.getMonth()).toBe(2);
    expect(back.getDate()).toBe(5);
  });

  it('daysBetween zählt vorwärts positiv, rückwärts negativ', () => {
    expect(daysBetween(parseISODate('2026-01-01'), parseISODate('2026-01-11'))).toBe(10);
    expect(daysBetween(parseISODate('2026-01-11'), parseISODate('2026-01-01'))).toBe(-10);
    expect(daysBetween(parseISODate('2026-01-01'), parseISODate('2026-01-01'))).toBe(0);
  });

  it('daysBetween bleibt bei einer Zeitumstellung korrekt (UTC-Basis)', () => {
    // z.B. Umstellung auf Sommerzeit Ende März — lokale Stunden dürfen die
    // Tagesdifferenz nicht verfälschen.
    expect(daysBetween(parseISODate('2026-03-28'), parseISODate('2026-03-30'))).toBe(2);
  });

  it('addDays wechselt korrekt über Monats-/Jahresgrenzen', () => {
    expect(formatISODate(addDays(parseISODate('2026-01-30'), 3))).toBe('2026-02-02');
    expect(formatISODate(addDays(parseISODate('2026-12-30'), 3))).toBe('2027-01-02');
  });

  it('shiftYearMonth wechselt das Jahr an der Dezember/Januar-Grenze', () => {
    expect(shiftYearMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftYearMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe('Statistik-Grundfunktionen', () => {
  it('average/median liefern null für leere Listen', () => {
    expect(average([])).toBeNull();
    expect(median([])).toBeNull();
  });

  it('average berechnet den arithmetischen Mittelwert', () => {
    expect(average([2, 4, 6])).toBe(4);
  });

  it('median unterscheidet gerade/ungerade Listenlänge korrekt', () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('stdDeviation ist null bei weniger als 2 Werten, sonst > 0 bei Streuung', () => {
    expect(stdDeviation([5])).toBeNull();
    expect(stdDeviation([5, 5, 5])).toBe(0);
    expect(stdDeviation([1, 10])).toBeGreaterThan(0);
  });

  it('weightedAverage gewichtet neuere Werte stärker als ältere', () => {
    // aufsteigend chronologisch: alter Wert 20, neuer Wert 30 — der
    // gewichtete Schnitt muss näher an 30 liegen als der einfache Mittelwert (25).
    const weighted = weightedAverage([20, 30], 0.5);
    expect(weighted).toBeGreaterThan(25);
  });

  it('detectOutlierMask markiert nichts bei weniger als 4 Werten', () => {
    expect(detectOutlierMask([1, 2, 300])).toEqual([false, false, false]);
  });

  it('detectOutlierMask erkennt einen deutlichen Ausreißer (z.B. Erfassungslücke)', () => {
    // 4 normale Zykluslängen um 28 Tage, ein "Zyklus" von 190 Tagen durch eine Lücke.
    const mask = detectOutlierMask([27, 28, 29, 28, 190], 90);
    expect(mask[4]).toBe(true);
    expect(mask.slice(0, 4)).toEqual([false, false, false, false]);
  });

  it('detectOutlierMask fällt bei fehlender Streuung (MAD=0) nicht fälschlich auf alles rein', () => {
    const mask = detectOutlierMask([28, 28, 28, 28], undefined);
    expect(mask).toEqual([false, false, false, false]);
  });
});

describe('computeLinearTrend', () => {
  it('liefert null bei weniger als 2 Werten', () => {
    expect(computeLinearTrend([5])).toBeNull();
  });

  it('erkennt einen klaren Aufwärtstrend', () => {
    const trend = computeLinearTrend([26, 27, 28, 29, 30]);
    expect(trend.slope).toBeCloseTo(1, 5);
  });

  it('erkennt einen klaren Abwärtstrend', () => {
    const trend = computeLinearTrend([30, 29, 28, 27, 26]);
    expect(trend.slope).toBeCloseTo(-1, 5);
  });

  it('liefert ~0 Steigung bei konstanten Werten', () => {
    const trend = computeLinearTrend([28, 28, 28, 28]);
    expect(trend.slope).toBeCloseTo(0, 5);
  });
});

describe('classifyPhaseForDate', () => {
  const periods = [period('2026-01-01', '2026-01-05'), period('2026-01-29', '2026-02-02')];

  it('erkennt Menstruation innerhalb einer erfassten Periode', () => {
    expect(classifyPhaseForDate('2026-01-03', periods, 28)).toBe('Menstruation');
  });

  it('erkennt die Follikelphase kurz nach Periodenbeginn', () => {
    expect(classifyPhaseForDate('2026-01-08', periods, 28)).toBe('Follikelphase');
  });

  it('erkennt die Lutealphase nach dem Eisprung', () => {
    expect(classifyPhaseForDate('2026-01-25', periods, 28)).toBe('Lutealphase');
  });

  it('liefert null für ein Datum vor der ersten erfassten Periode', () => {
    expect(classifyPhaseForDate('2025-12-01', periods, 28)).toBeNull();
  });
});

describe('computeCycleStats', () => {
  it('hasData=false ohne jegliche Periode', () => {
    const stats = computeCycleStats([], new Date(2026, 0, 15));
    expect(stats.hasData).toBe(false);
  });

  it('hasPrediction=false bei nur einer erfassten Periode, nutzt aber Standardwerte', () => {
    const stats = computeCycleStats([period('2026-01-01', '2026-01-05')], new Date(2026, 0, 10));
    expect(stats.hasData).toBe(true);
    expect(stats.hasPrediction).toBe(false);
    expect(stats.avgCycleLength).toBe(28); // Standardwert aus APP_DATA.CYCLE_DEFAULTS
  });

  it('berechnet die Zykluslänge korrekt aus zwei aufeinanderfolgenden Perioden', () => {
    const periods = [period('2026-01-01', '2026-01-05'), period('2026-01-29', '2026-02-02')];
    const stats = computeCycleStats(periods, new Date(2026, 1, 5));
    expect(stats.hasPrediction).toBe(true);
    expect(stats.avgCycleLength).toBe(28);
    expect(stats.cycleCount).toBe(1);
  });

  it('erkennt "heute in der Periode" korrekt als Menstruation', () => {
    const periods = [period('2026-01-01', '2026-01-05')];
    const stats = computeCycleStats(periods, new Date(2026, 0, 3));
    expect(stats.currentPhase).toBe('Menstruation');
    expect(stats.currentCycleDay).toBe(3);
  });

  it('schließt eine erkannte Erfassungslücke aus dem Zykluslängen-Schnitt aus', () => {
    const periods = [
      period('2025-08-04', '2025-08-08'),
      period('2025-09-01', '2025-09-05'),
      period('2025-10-01', '2025-10-05'),
      period('2025-10-29', '2025-11-02'),
      // riesige Lücke: fast 200 Tage bis zur nächsten Periode
      period('2026-05-15', '2026-05-19'),
      period('2026-06-12', '2026-06-16')
    ];
    const stats = computeCycleStats(periods, new Date(2026, 5, 20));
    expect(stats.excludedCycleCount).toBe(1);
    // Ohne Ausreißer-Bereinigung läge der Schnitt bei weit über 100 Tagen.
    expect(stats.avgCycleLength).toBeLessThan(40);
  });
});

describe('computePhaseOccurrenceStats', () => {
  it('ermittelt die häufigste Phase korrekt', () => {
    const periods = [period('2026-01-01', '2026-01-05'), period('2026-01-29', '2026-02-02')];
    // 3x während der Menstruation, 1x in der Lutealphase
    const isoList = ['2026-01-02', '2026-01-03', '2026-01-04', '2026-01-25'];
    const result = computePhaseOccurrenceStats(periods, isoList);
    expect(result.dominant).toBe('Menstruation');
    expect(result.counts['Menstruation']).toBe(3);
  });

  it('liefert dominant=null ohne jegliche klassifizierbare Vorkommen', () => {
    const result = computePhaseOccurrenceStats([], []);
    expect(result.dominant).toBeNull();
  });
});

describe('computeLeadTimeInsight', () => {
  it('liefert null unter der Mindestanzahl auswertbarer Vorkommen', () => {
    const periods = [period('2026-01-10', '2026-01-14')];
    expect(computeLeadTimeInsight(periods, ['2026-01-08'])).toBeNull();
  });

  it('berechnet den mittleren Vorlauf in Tagen vor Periodenbeginn korrekt', () => {
    const periods = [period('2026-01-10', '2026-01-14'), period('2026-02-07', '2026-02-11')];
    // jeweils 3 Tage vor dem jeweils nächsten Periodenbeginn
    const isoList = ['2026-01-07', '2026-02-04', '2026-01-07'];
    const result = computeLeadTimeInsight(periods, isoList);
    expect(result.avgDaysBefore).toBe(3);
    expect(result.count).toBe(3);
  });
});

describe('Beschwerden-Auswertung (Schmerz/Symptome/Stimmung)', () => {
  const periods = [period('2026-01-01', '2026-01-05')];
  const dayLogs = [
    { date: '2026-01-02', note: null, pain: [{ id: 'p1', category: 'kopf', intensity: 7, timeOfDay: 'morning', note: null, loggedAt: null }], symptoms: [{ id: 's1', catalogId: 'muedigkeit', loggedAt: null }], moods: [] },
    { date: '2026-01-10', note: null, pain: [{ id: 'p2', category: 'kopf', intensity: 3, timeOfDay: 'evening', note: null, loggedAt: null }], symptoms: [], moods: [{ id: 'm1', catalogId: 'reizbar', loggedAt: null }] }
  ];

  it('computePainStats berechnet die Ø-Intensität nur über Einträge mit Intensität', () => {
    const stats = computePainStats(periods, dayLogs);
    expect(stats.totalCount).toBe(2);
    expect(stats.avgIntensity).toBe(5);
    expect(stats.byTimeOfDay.morning).toBe(1);
    expect(stats.byTimeOfDay.evening).toBe(1);
  });

  it('computeItemFrequency zählt Symptom-/Stimmungs-catalogIds über alle Tage', () => {
    expect(computeItemFrequency(dayLogs, 'symptoms')).toEqual({ muedigkeit: 1 });
    expect(computeItemFrequency(dayLogs, 'moods')).toEqual({ reizbar: 1 });
  });

  it('computeItemFrequency zählt mehrere Vorkommen desselben Symptoms am selben Tag korrekt hoch', () => {
    const multiDayLogs = [
      { date: '2026-01-02', note: null, pain: [], symptoms: [
        { id: 's1', catalogId: 'uebelkeit', loggedAt: null },
        { id: 's2', catalogId: 'uebelkeit', loggedAt: null },
        { id: 's3', catalogId: 'uebelkeit', loggedAt: null }
      ], moods: [] }
    ];
    expect(computeItemFrequency(multiDayLogs, 'symptoms')).toEqual({ uebelkeit: 3 });
  });

  it('topItemsFromCounts sortiert absteigend und löst Labels aus dem Katalog auf', () => {
    const counts = { a: 1, b: 5, c: 3 };
    const catalog = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }];
    const top = topItemsFromCounts(counts, catalog, 2);
    expect(top).toEqual([{ id: 'b', label: 'B', count: 5 }, { id: 'c', label: 'C', count: 3 }]);
  });

  it('flattenFieldOccurrences liefert das Datum einmal je Vorkommen (Gewichtung)', () => {
    const withTwoSymptoms = [{ date: '2026-01-02', symptoms: [{ id: 's1', catalogId: 'a' }, { id: 's2', catalogId: 'b' }], moods: [] }];
    expect(flattenFieldOccurrences(withTwoSymptoms, 'symptoms')).toEqual(['2026-01-02', '2026-01-02']);
  });
});

describe('computeChartData', () => {
  it('berechnet Periodendauer und Zykluslänge korrekt', () => {
    const periods = [period('2026-01-01', '2026-01-05'), period('2026-01-29', '2026-02-02')];
    const { periodLengths, cycleLengths } = computeChartData(periods);
    expect(periodLengths[0].length).toBe(5);
    expect(cycleLengths[0].length).toBe(28);
  });
});

describe('Farb-Generator ("Eigene Farbe")', () => {
  it('hexToRgb/rgbToHex sind zueinander invers', () => {
    expect(rgbToHex(216, 195, 165)).toBe('#d8c3a5');
    const { r, g, b } = hexToRgb('#D8C3A5');
    expect([r, g, b]).toEqual([216, 195, 165]);
  });

  it('hexToHsl/hslToHex bilden näherungsweise dieselbe Farbe zurück', () => {
    const { h, s, l } = hexToHsl('#D98E73');
    const roundtrip = hslToHex(h, s, l);
    expect(roundtrip.toLowerCase()).toBe('#d98e73');
  });

  it('generateEarthyTheme liefert ein vollständiges Hell/Dunkel-Variablenpaar', () => {
    const theme = generateEarthyTheme('#A8B79B');
    const requiredKeys = [
      '--color-header-bg', '--color-header-text', '--color-brand', '--color-bg',
      '--color-surface', '--color-accent', '--color-text-heading', '--color-text-day',
      '--color-text-muted', '--color-period-bg', '--color-period-text', '--color-pain',
      '--color-selecting-outline', '--color-nav-inactive'
    ];
    for (const key of requiredKeys){
      expect(theme.light[key]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(theme.dark[key]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('generateEarthyTheme erzeugt einen dunkleren Header als Hintergrund im Hell-Modus', () => {
    const theme = generateEarthyTheme('#D9A855');
    const headerLightness = hexToHsl(theme.light['--color-header-bg']).l;
    const bgLightness = hexToHsl(theme.light['--color-bg']).l;
    expect(headerLightness).toBeLessThan(bgLightness);
  });
});

describe('Kleinere Formatierungs-Helfer', () => {
  it('escapeAttr escaped die relevanten HTML-Sonderzeichen', () => {
    expect(escapeAttr('<script>alert("x")</script> & more')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more'
    );
  });

  it('fmtTimeShort liefert null ohne Zeitstempel', () => {
    expect(fmtTimeShort(null)).toBeNull();
    expect(fmtTimeShort(undefined)).toBeNull();
  });
});
