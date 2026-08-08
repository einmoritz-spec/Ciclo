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

  let painCard = '';
  if (State.painDays.size && !isItemHidden('chart-painPhase')){
    const painStats = computePainPhaseStats(State.periods, Array.from(State.painDays.keys()));
    const painEntries = Object.entries(painStats.counts).map(([label, value]) => ({ label, value }));
    painCard = `
      <div class="chart-card" data-vis-id="chart-painPhase">
        <div class="chart-card-header">
          <span class="chart-card-title">Schmerztage nach Zyklusphase</span>
        </div>
        <p class="chart-card-subtitle">Wie oft ein per langem Druck markierter Schmerztag in welche Phase fällt</p>
        <div class="chart-scroll-x">${categoryBarChartSVG(painEntries, '--color-pain')}</div>
      </div>
    `;
  }

  return `<div class="chart-view-scroll">${periodCard}${cycleCard}${painCard}</div>`;
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
