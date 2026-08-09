/* ---------------------------------------------------
   STATS (dritter Bottom-Nav-Tab)
   Reine Darstellung — die eigentliche Berechnung übernimmt komplett
   computeCycleStats() aus 03-utils.js (Ø über ALLE vorhandenen Zyklen,
   siehe Absprache im Chat). Diese Datei kennt kein Storage-Detail, nur
   State.periods + das fertige Stats-Objekt.
--------------------------------------------------- */

function fmtDateReadable(date){
  return date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function statCardHTML(id, label, value){
  if (isItemHidden(id)) return '';
  return `
    <div class="stat-card" data-vis-id="${id}">
      <div class="stat-card-value">${value}</div>
      <div class="stat-card-label">${label}</div>
    </div>
  `;
}

/** Wie statCardHTML(), nur für die einzeiligen "Label links, Wert rechts"-Zeilen
    (Letzte/Nächste Periode, Fruchtbares Fenster, ...) statt der 2-Spalten-Karten. */
function statsSectionHTML(id, title, valueHTML){
  if (isItemHidden(id)) return '';
  return `
    <div class="stats-section" data-vis-id="${id}">
      <div class="stats-section-title">${title}</div>
      <div class="stats-section-value">${valueHTML}</div>
    </div>
  `;
}

function statsEmptyHTML(){
  return `
    <div class="placeholder-content">
      <p class="placeholder-title">Noch keine Daten</p>
      <p class="placeholder-text">Trage im Kalender den Start deiner Periode ein — hier erscheinen dann Zykluslänge, Vorhersage und fruchtbares Fenster.</p>
    </div>
  `;
}

/** Textliche Einordnung des Regelmäßigkeits-Scores (0–100) aus computeCycleStats(). */
function regularityDescriptor(score){
  if (score >= 85) return 'Sehr regelmäßig';
  if (score >= 65) return 'Regelmäßig';
  if (score >= 40) return 'Leicht unregelmäßig';
  return 'Unregelmäßig';
}

/** Formatiert eine Top-Liste (topItemsFromCounts(), 03-utils.js) als kurze,
    kommagetrennte "Label (n)"-Aufzählung für statsSectionHTML() — bewusst
    kompakt statt einer eigenen Liste je Eintrag, da es sich um eine
    einzeilige Stats-Section handelt (wie Letzte/Nächste Periode). */
function topItemsInlineHTML(items){
  if (!items.length) return '–';
  return items.map(i => `${i.label} (${i.count})`).join(', ');
}

function cycleSectionHTML(stats){
  const cycleDayLabel = 'Zyklustag ' + stats.currentCycleDay;
  const cycleWord = stats.cycleCount === 1 ? 'Zyklus' : 'Zyklen';
  const excludedNote = stats.excludedCycleCount
    ? ` ${stats.excludedCycleCount} davon vermutlich Erfassungslücke${stats.excludedCycleCount === 1 ? '' : 'n'} und aus dem Durchschnitt ausgeschlossen.`
    : '';
  const predictionNote = !stats.hasPrediction
    ? `Noch keine zweite Periode erfasst — Schätzung basiert auf einem Standardwert von ${stats.avgCycleLength} Tagen.`
    : `Basierend auf ${stats.cycleCount} erfasste${stats.cycleCount === 1 ? 'm' : 'n'} ${cycleWord}.${excludedNote}`;

  // Beide Ø-Karten einzeln prüfen: sind BEIDE ausgeblendet, wird auch der
  // umschließende .stats-grid-Container weggelassen statt als leere Hülle stehenzubleiben.
  const avgCycleCardHTML = statCardHTML('stat-avgCycle', 'Ø Zykluslänge', stats.avgCycleLength + ' Tage');
  const avgPeriodCardHTML = statCardHTML('stat-avgPeriod', 'Ø Periodendauer', stats.avgPeriodLength + ' Tage');
  const statsGridHTML = (avgCycleCardHTML || avgPeriodCardHTML)
    ? `<div class="stats-grid">${avgCycleCardHTML}${avgPeriodCardHTML}</div>`
    : '';

  const regularityHTML = stats.regularityScore !== null
    ? statsSectionHTML('stat-regularity', 'Regelmäßigkeit', `${stats.regularityScore}/100 · ${regularityDescriptor(stats.regularityScore)}`)
    : '';

  return `
    <div class="stats-hero">
      <div class="stats-hero-phase">${stats.currentPhase}</div>
      <div class="stats-hero-day">${cycleDayLabel}</div>
    </div>

    ${statsGridHTML}

    ${regularityHTML}

    ${statsSectionHTML('stat-lastPeriod', 'Letzte Periode', fmtDateReadable(stats.lastPeriodStart))}

    ${statsSectionHTML('stat-nextPeriod', 'Nächste Periode', stats.nextPeriodStart ? fmtDateReadable(stats.nextPeriodStart) : 'noch keine Vorhersage')}

    ${statsSectionHTML('stat-fertileWindow', 'Fruchtbares Fenster', `${fmtDateReadable(stats.fertileStart)} – ${fmtDateReadable(stats.fertileEnd)}`)}

    ${statsSectionHTML('stat-ovulation', 'Geschätzter Eisprung', fmtDateReadable(stats.ovulationDate))}

    <p class="stats-note">${predictionNote}</p>
  `;
}

/** Zweiter Abschnitt: alles rund um im Detailgrad "Detailliert" erfasste
    Schmerz-Einträge, Symptome und Stimmung (State.dayLogs, siehe
    02-state-theme.js/01-storage.js). Kommt komplett leer zurück (leerer
    String), solange noch keinerlei solcher Daten vorliegen — dann macht ein
    eigener Abschnitts-Titel ohne Inhalt keinen Sinn. */
function symptomsSectionHTML(){
  const dayLogsArray = Array.from(State.dayLogs.values());
  const painStats = computePainStats(State.periods, dayLogsArray);
  const symptomCounts = topItemsFromCounts(computeItemFrequency(dayLogsArray, 'symptoms'), symptomCatalog(), 3);
  const moodCounts = topItemsFromCounts(computeItemFrequency(dayLogsArray, 'moods'), moodCatalog(), 3);

  if (!painStats.totalCount && !symptomCounts.length && !moodCounts.length) return '';

  const painTotalHTML = painStats.totalCount
    ? statsSectionHTML('stat-painTotal', 'Schmerz-Einträge insgesamt', `${painStats.totalCount} Eintrag${painStats.totalCount === 1 ? '' : 'e'}`)
    : '';
  const painIntensityHTML = painStats.avgIntensity !== null
    ? statsSectionHTML('stat-painIntensity', 'Ø Schmerzintensität', `${fmtDaysAvg(painStats.avgIntensity)}/10`)
    : '';
  const topSymptomsHTML = symptomCounts.length
    ? statsSectionHTML('stat-topSymptoms', 'Häufigste Symptome', topItemsInlineHTML(symptomCounts))
    : '';
  const topMoodsHTML = moodCounts.length
    ? statsSectionHTML('stat-topMoods', 'Häufigste Stimmungen', topItemsInlineHTML(moodCounts))
    : '';

  const anyVisible = painTotalHTML || painIntensityHTML || topSymptomsHTML || topMoodsHTML;
  if (!anyVisible) return '';

  return `
    <p class="stats-group-title">Beschwerden</p>
    ${painTotalHTML}
    ${painIntensityHTML}
    ${topSymptomsHTML}
    ${topMoodsHTML}
  `;
}

function renderStatsView(){
  const app = document.getElementById('app');
  const stats = computeCycleStats(State.periods, State.today);

  app.innerHTML = `
    <header class="app-header app-header-row">
      ${appLogoButtonHTML('appTitleBtnStats')}
      <button type="button" class="header-icon-btn" id="settingsBtnStats" aria-label="Einstellungen">${APP_DATA.ICONS.SETTINGS}</button>
    </header>
    <div class="stats-scroll">
      ${stats.hasData ? cycleSectionHTML(stats) + symptomsSectionHTML() : statsEmptyHTML()}
    </div>
    ${bottomNavHTML('stats')}
  `;
  document.getElementById('appTitleBtnStats').onclick = () => goCalendarHome();
  document.getElementById('settingsBtnStats').onclick = () => goSettings();
  wireBottomNav();
  wireVisibilityLongPress(app, renderStatsView);
}
