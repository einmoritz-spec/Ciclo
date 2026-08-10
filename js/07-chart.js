/* ---------------------------------------------------
   CHART (zweiter Bottom-Nav-Tab)
   Zeigt Periodendauer und Zykluslänge je erfasstem Eintrag als einfache
   SVG-Balkendiagramme — bewusst ohne externes Chart-Framework, passend zur
   "offlinefest"-Philosophie der App (siehe Inline-SVG-Icons in app-data.js).
   Datengrundlage liefert computeChartData() (reine Funktion, 03-utils.js);
   diese Datei kennt kein Storage-Detail, nur State.periods.
--------------------------------------------------- */

function fmtDateShort(date){
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function fmtDaysAvg(value){
  return value.toFixed(1).replace('.', ',');
}

/** Baut ein horizontal scrollbares SVG-Balkendiagramm mit gestrichelter
    Ø-Linie. entries: [{ label, value }], barColorVar: CSS-Custom-Property
    (z.B. '--color-accent') für die Balkenfarbe.

    Skalierung bewusst NICHT am absoluten Maximum ausgerichtet: ein einzelner
    Ausreißer (z.B. eine monatelange Erfassungslücke, die als eine riesige
    "Zykluslänge" durchgeht) würde sonst alle normalen Balken auf wenige
    Pixel stauchen. Stattdessen richtet sich die Skala am Median aus; Balken,
    die die daraus resultierende Obergrenze überschreiten, werden oben
    gekappt und mit einer kleinen Bruchmarkierung („⁄⁄“) sichtbar als
    abgeschnitten markiert — die echte Zahl bleibt trotzdem als Label stehen. */
function barChartSVG(entries, barColorVar, avgValue){
  const barWidth = 22;
  const gap = 16;
  const chartHeight = 120;
  const paddingTop = 22;
  const paddingBottom = 22;
  const svgHeight = paddingTop + chartHeight + paddingBottom;
  const svgWidth = entries.length * (barWidth + gap) + gap;

  const values = entries.map(e => e.value);
  const typical = Math.max(median(values) || 0, avgValue || 0);
  // Obergrenze der Skala: 1,6x des typischen Werts, mindestens aber das größte
  // nicht-ausreißende Vorkommen knapp über dem größten "normalen" Balken.
  const scaleMax = (typical * 1.6 || Math.max(...values, 1)) * 1.15;

  const bars = entries.map((e, i) => {
    const x = gap + i * (barWidth + gap);
    const rawHeight = (e.value / scaleMax) * chartHeight;
    const clipped = rawHeight > chartHeight;
    const barHeight = Math.min(rawHeight, chartHeight);
    const y = paddingTop + (chartHeight - barHeight);
    const breakMark = clipped
      ? `<line x1="${x - 2}" y1="${y + 6}" x2="${x + barWidth + 2}" y2="${y - 2}" class="chart-clip-mark"></line>
         <line x1="${x - 2}" y1="${y + 12}" x2="${x + barWidth + 2}" y2="${y + 4}" class="chart-clip-mark"></line>`
      : '';
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barHeight, 2)}" rx="6" style="fill:var(${barColorVar})"></rect>
      ${breakMark}
      <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" class="chart-value-label">${e.value}</text>
      <text x="${x + barWidth / 2}" y="${paddingTop + chartHeight + 16}" text-anchor="middle" class="chart-axis-label">${e.label}</text>
    `;
  }).join('');

  const avgY = paddingTop + chartHeight - Math.min(avgValue / scaleMax, 1) * chartHeight;
  const avgLine = `<line x1="0" y1="${avgY}" x2="${svgWidth}" y2="${avgY}" class="chart-avg-line"></line>`;

  return `<svg class="chart-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">${avgLine}${bars}</svg>`;
}

/** Einfaches Balkendiagramm für eine feste, kleine Kategorie-Anzahl (hier: die
    4 Zyklusphasen) — bewusst separat von barChartSVG() oben, da hier keine
    Zeitachse/Ø-Linie/Skalen-Kappung gebraucht wird, dafür mehrzeilige Labels. */
function categoryBarChartSVG(entries, barColorVar){
  const barWidth = 46;
  const gap = 20;
  const chartHeight = 110;
  const paddingTop = 22;
  const paddingBottom = 36;
  const svgHeight = paddingTop + chartHeight + paddingBottom;
  const svgWidth = entries.length * (barWidth + gap) + gap;
  const maxValue = Math.max(...entries.map(e => e.value), 1);

  const bars = entries.map((e, i) => {
    const x = gap + i * (barWidth + gap);
    const barHeight = (e.value / maxValue) * chartHeight;
    const y = paddingTop + (chartHeight - barHeight);
    const labelHTML = e.label.split(' ').map((line, li) => `
      <text x="${x + barWidth / 2}" y="${paddingTop + chartHeight + 16 + li * 12}" text-anchor="middle" class="chart-axis-label">${line}</text>
    `).join('');
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barHeight, 2)}" rx="8" style="fill:var(${barColorVar})"></rect>
      <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" class="chart-value-label">${e.value}</text>
      ${labelHTML}
    `;
  }).join('');

  return `<svg class="chart-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">${bars}</svg>`;
}

/** Liniendiagramm mit sanfter Farbverlauf-Fläche unter der Linie, Punkten je
    Wert und optionaler gestrichelter Trend-Gerade (computeLinearTrend(),
    03-utils.js) — für den "Trend statt nur Durchschnitt"-Blick auf die
    Zykluslänge über die Zeit (im Gegensatz zu barChartSVG() oben, das jeden
    einzelnen Wert exakt zeigt, aber keine Richtung erkennen lässt).
    entries: [{ label, value }], colorVar: CSS-Custom-Property für Linie/
    Fläche, trend: { slope, intercept } | null. */
function lineChartSVG(entries, colorVar, trend){
  const stepX = 52;
  const paddingX = 24;
  const chartHeight = 110;
  const paddingTop = 26;
  const paddingBottom = 26;
  const svgHeight = paddingTop + chartHeight + paddingBottom;
  const svgWidth = Math.max(entries.length - 1, 0) * stepX + paddingX * 2;

  const values = entries.map(e => e.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = (maxValue - minValue) || 1;
  const pad = range * 0.2 || 2;
  const scaleMin = minValue - pad;
  const scaleRange = (maxValue + pad) - scaleMin || 1;

  const xFor = i => paddingX + i * stepX;
  const yFor = v => paddingTop + chartHeight - ((v - scaleMin) / scaleRange) * chartHeight;

  const points = entries.map((e, i) => ({ x: xFor(i), y: yFor(e.value), value: e.value, label: e.label }));
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const baseline = paddingTop + chartHeight;
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`;
  const gradientId = 'lineGradient' + Math.random().toString(36).slice(2, 8);

  const dotsAndLabels = points.map(p => `
    <circle cx="${p.x}" cy="${p.y}" r="4" style="fill:var(${colorVar})"></circle>
    <text x="${p.x}" y="${p.y - 10}" text-anchor="middle" class="chart-value-label">${p.value}</text>
    <text x="${p.x}" y="${baseline + 18}" text-anchor="middle" class="chart-axis-label">${p.label}</text>
  `).join('');

  let trendLineHTML = '';
  if (trend && points.length >= 2){
    const yStart = yFor(trend.intercept);
    const yEnd = yFor(trend.intercept + trend.slope * (points.length - 1));
    trendLineHTML = `<line x1="${points[0].x}" y1="${yStart}" x2="${points[points.length - 1].x}" y2="${yEnd}" class="chart-trend-line"></line>`;
  }

  return `
    <svg class="chart-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color:var(${colorVar});stop-opacity:0.28"></stop>
          <stop offset="100%" style="stop-color:var(${colorVar});stop-opacity:0"></stop>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#${gradientId})" stroke="none"></path>
      ${trendLineHTML}
      <path d="${linePath}" fill="none" style="stroke:var(${colorVar})" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>
      ${dotsAndLabels}
    </svg>
  `;
}

/** Kurzer, menschenlesbarer Satz zur Trend-Richtung (computeLinearTrend(),
    03-utils.js) für die Zykluslängen-Trend-Karte. Unter 0,15 Tage/Zyklus
    Steigung gilt der Zyklus als praktisch stabil — sonst würde jede winzige,
    bedeutungslose Schwankung als "Trend" formuliert. */
function cycleTrendDescription(slope){
  if (Math.abs(slope) < 0.15) return 'Deine Zykluslänge ist über die Zeit stabil geblieben.';
  const direction = slope > 0 ? 'verlängert' : 'verkürzt';
  return `Deine Zykluslänge hat sich im Schnitt um ${fmtDaysAvg(Math.abs(slope))} Tage je Zyklus ${direction}.`;
}

function chartCardHTML(id, title, subtitle, bodyHTML, avgLabel){
  if (isItemHidden(id)) return '';
  return `
    <div class="chart-card" data-vis-id="${id}">
      <div class="chart-card-header">
        <span class="chart-card-title">${title}</span>
        ${avgLabel ? `<span class="chart-card-avg">${avgLabel}</span>` : ''}
      </div>
      <p class="chart-card-subtitle">${subtitle}</p>
      <div class="chart-scroll-x">${bodyHTML}</div>
    </div>
  `;
}

function chartEmptyHTML(){
  return `
    <div class="placeholder-content">
      <p class="placeholder-title">Noch keine Daten</p>
      <p class="placeholder-text">Trage im Kalender deine erste Periode ein — hier erscheint dann der Verlauf von Periodendauer und Zykluslänge.</p>
    </div>
  `;
}

function chartBodyHTML(){
  const { periodLengths, cycleLengths } = computeChartData(State.periods);
  if (!periodLengths.length) return chartEmptyHTML();

  const periodEntries = periodLengths.map(p => ({ label: fmtDateShort(parseISODate(p.start)), value: p.length }));
  const avgPeriod = average(periodLengths.map(p => p.length));
  const periodCard = chartCardHTML(
    'chart-periodLength',
    'Periodendauer',
    'Tage je erfasster Periode, nach Startdatum',
    barChartSVG(periodEntries, '--color-period-text', avgPeriod),
    `Ø ${fmtDaysAvg(avgPeriod)} Tage`
  );

  let cycleCard;
  let cycleTrendCard = '';
  if (cycleLengths.length){
    const cycleEntries = cycleLengths.map(c => ({ label: fmtDateShort(parseISODate(c.start)), value: c.length }));
    const avgCycle = average(cycleLengths.map(c => c.length));
    cycleCard = chartCardHTML(
      'chart-cycleLength',
      'Zykluslänge',
      'Tage zwischen zwei Periodenstarts',
      barChartSVG(cycleEntries, '--color-accent', avgCycle),
      `Ø ${fmtDaysAvg(avgCycle)} Tage`
    );

    if (cycleLengths.length >= 2 && !isItemHidden('chart-cycleTrend')){
      const trend = computeLinearTrend(cycleEntries.map(e => e.value));
      cycleTrendCard = `
        <div class="chart-card" data-vis-id="chart-cycleTrend">
          <div class="chart-card-header">
            <span class="chart-card-title">Zykluslänge – Trend</span>
          </div>
          <p class="chart-card-subtitle">${trend ? cycleTrendDescription(trend.slope) : 'Verlauf über die Zeit'}</p>
          <div class="chart-scroll-x">${lineChartSVG(cycleEntries, '--color-accent', trend)}</div>
        </div>
      `;
    }
  } else if (!isItemHidden('chart-cycleLength')) {
    cycleCard = `
      <div class="chart-card" data-vis-id="chart-cycleLength">
        <div class="chart-card-header"><span class="chart-card-title">Zykluslänge</span></div>
        <p class="chart-card-subtitle">Braucht mindestens zwei erfasste Perioden.</p>
      </div>
    `;
  } else {
    cycleCard = '';
  }

  const dayLogsArray = Array.from(State.dayLogs.values());
  const painStats = computePainStats(State.periods, dayLogsArray);

  let painPhaseCard = '';
  if (painStats.totalCount && !isItemHidden('chart-painPhase')){
    const painPhaseStats = computePhaseOccurrenceStats(State.periods, painStats.entries.map(e => e.iso));
    const painPhaseEntries = Object.entries(painPhaseStats.counts).map(([label, value]) => ({ label, value }));
    painPhaseCard = `
      <div class="chart-card" data-vis-id="chart-painPhase">
        <div class="chart-card-header">
          <span class="chart-card-title">Schmerzen nach Zyklusphase</span>
        </div>
        <p class="chart-card-subtitle">Wie viele Schmerz-Einträge in welche Phase fallen</p>
        ${painPhaseStats.dominant ? `<p class="chart-card-insight">Am häufigsten in: ${painPhaseStats.dominant}</p>` : ''}
        <div class="chart-scroll-x">${categoryBarChartSVG(painPhaseEntries, '--color-pain')}</div>
      </div>
    `;
  }

  let painTimeCard = '';
  const hasTimeData = Object.values(painStats.byTimeOfDay).some(v => v > 0);
  if (hasTimeData && !isItemHidden('chart-painTimeOfDay')){
    const timeEntries = APP_DATA.PAIN_TIME_OF_DAY.map(t => ({ label: t.label, value: painStats.byTimeOfDay[t.id] || 0 }));
    painTimeCard = `
      <div class="chart-card" data-vis-id="chart-painTimeOfDay">
        <div class="chart-card-header">
          <span class="chart-card-title">Schmerzen nach Tageszeit</span>
        </div>
        <p class="chart-card-subtitle">Wann Schmerz-Einträge im Detailgrad "Detailliert" erfasst wurden</p>
        <div class="chart-scroll-x">${categoryBarChartSVG(timeEntries, '--color-pain')}</div>
      </div>
    `;
  }

  let symptomsPhaseCard = '';
  const symptomIsoList = flattenFieldOccurrences(dayLogsArray, 'symptoms');
  if (symptomIsoList.length && !isItemHidden('chart-symptomsByPhase')){
    const symptomPhaseStats = computePhaseOccurrenceStats(State.periods, symptomIsoList);
    const symptomPhaseEntries = Object.entries(symptomPhaseStats.counts).map(([label, value]) => ({ label, value }));
    symptomsPhaseCard = `
      <div class="chart-card" data-vis-id="chart-symptomsByPhase">
        <div class="chart-card-header">
          <span class="chart-card-title">Symptome nach Zyklusphase</span>
        </div>
        <p class="chart-card-subtitle">Wie oft erfasste Symptome in welche Phase fallen</p>
        ${symptomPhaseStats.dominant ? `<p class="chart-card-insight">Am häufigsten in: ${symptomPhaseStats.dominant}</p>` : ''}
        <div class="chart-scroll-x">${categoryBarChartSVG(symptomPhaseEntries, '--color-accent')}</div>
      </div>
    `;
  }

  let moodsPhaseCard = '';
  const moodIsoList = flattenFieldOccurrences(dayLogsArray, 'moods');
  if (moodIsoList.length && !isItemHidden('chart-moodsByPhase')){
    const moodPhaseStats = computePhaseOccurrenceStats(State.periods, moodIsoList);
    const moodPhaseEntries = Object.entries(moodPhaseStats.counts).map(([label, value]) => ({ label, value }));
    moodsPhaseCard = `
      <div class="chart-card" data-vis-id="chart-moodsByPhase">
        <div class="chart-card-header">
          <span class="chart-card-title">Stimmung nach Zyklusphase</span>
        </div>
        <p class="chart-card-subtitle">Wie oft erfasste Stimmungen in welche Phase fallen</p>
        ${moodPhaseStats.dominant ? `<p class="chart-card-insight">Am häufigsten in: ${moodPhaseStats.dominant}</p>` : ''}
        <div class="chart-scroll-x">${categoryBarChartSVG(moodPhaseEntries, '--color-text-heading')}</div>
      </div>
    `;
  }

  return `<div class="chart-view-scroll">${periodCard}${cycleCard}${cycleTrendCard}${painPhaseCard}${painTimeCard}${symptomsPhaseCard}${moodsPhaseCard}</div>`;
}

function renderChartView(){
  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="app-header app-header-row">
      ${appLogoButtonHTML('appTitleBtnChart')}
      <button type="button" class="header-icon-btn" id="settingsBtnChart" aria-label="Einstellungen">${APP_DATA.ICONS.SETTINGS}</button>
    </header>
    ${chartBodyHTML()}
    ${bottomNavHTML('chart')}
  `;
  document.getElementById('appTitleBtnChart').onclick = () => goCalendarHome();
  document.getElementById('settingsBtnChart').onclick = () => goSettings();
  wireBottomNav();
  wireVisibilityLongPress(app, renderChartView);

  // Standardmäßig zu den aktuellsten (rechten) Balken scrollen, statt bei den
  // ältesten Einträgen zu starten — die zuletzt erfassten Zyklen sind i.d.R.
  // relevanter als die von vor Jahren.
  document.querySelectorAll('.chart-scroll-x').forEach(el => { el.scrollLeft = el.scrollWidth; });
}
