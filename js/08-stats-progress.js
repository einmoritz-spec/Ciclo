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
    (Letzte/Nächste Periode, Fruchtbares Fenster, ...) statt der 2-Spalten-Karten.
    `wrap`: true für Inhalte, die NICHT in eine Zeile passen sollen/müssen (z.B.
    die Balkenliste der häufigsten Symptome oder ein mehrzeiliger Muster-Text
    mit <br>) — sonst würde das sonst übliche white-space:nowrap den Inhalt
    seitlich abschneiden statt umzubrechen. */
function statsSectionHTML(id, title, valueHTML, wrap){
  if (isItemHidden(id)) return '';
  return `
    <div class="stats-section" data-vis-id="${id}">
      <div class="stats-section-title">${title}</div>
      <div class="stats-section-value${wrap ? ' stats-section-value--wrap' : ''}">${valueHTML}</div>
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

/** Visuelle Top-Liste (statt reinem Text): jede Zeile mit Label, Anzahl und
    einem proportional zum Maximalwert breiten Balken — deutlich schneller
    erfassbar als eine kommagetrennte Aufzählung, siehe topItemsFromCounts()
    in 03-utils.js für die zugrunde liegenden Daten. */
function statBarListHTML(items, colorVar){
  if (!items.length) return '–';
  const max = Math.max(...items.map(i => i.count));
  return `
    <div class="stat-bar-list">
      ${items.map(i => `
        <div class="stat-bar-row">
          <div class="stat-bar-row-header">
            <span>${i.label}</span>
            <span>${i.count}x</span>
          </div>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${Math.max(6, Math.round(i.count / max * 100))}%; background:var(${colorVar})"></div></div>
        </div>
      `).join('')}
    </div>
  `;
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
  const symptomCounts = topItemsFromCounts(computeItemFrequency(dayLogsArray, 'symptoms'), symptomCatalog(), 5);
  const moodCounts = topItemsFromCounts(computeItemFrequency(dayLogsArray, 'moods'), moodCatalog(), 5);

  if (!painStats.totalCount && !symptomCounts.length && !moodCounts.length) return '';

  const painTotalHTML = painStats.totalCount
    ? statsSectionHTML('stat-painTotal', 'Schmerz-Einträge insgesamt', `${painStats.totalCount} Eintrag${painStats.totalCount === 1 ? '' : 'e'}`)
    : '';
  const painIntensityHTML = painStats.avgIntensity !== null
    ? statsSectionHTML('stat-painIntensity', 'Ø Schmerzintensität', `${fmtDaysAvg(painStats.avgIntensity)}/10`)
    : '';
  const topSymptomsHTML = symptomCounts.length
    ? statsSectionHTML('stat-topSymptoms', 'Häufigste Symptome', statBarListHTML(symptomCounts, '--color-accent'), true)
    : '';
  const topMoodsHTML = moodCounts.length
    ? statsSectionHTML('stat-topMoods', 'Häufigste Stimmungen', statBarListHTML(moodCounts, '--color-text-heading'), true)
    : '';

  // "Muster erkannt": erkennt, ob Beschwerden im Schnitt eine bestimmte Anzahl
  // Tage VOR der nächsten Periode auftreten (computeLeadTimeInsight(),
  // 03-utils.js) — getrennt für Schmerzen und für Symptome/Stimmung
  // zusammen, da beides unterschiedliche Vorboten sein können. Erscheint erst
  // ab genug Datenpunkten (siehe dortige Mindestanzahl), sonst wäre die
  // Aussage nicht verlässlich.
  const painLead = computeLeadTimeInsight(State.periods, painStats.entries.map(e => e.iso));
  const symptomMoodIsoList = [...flattenFieldOccurrences(dayLogsArray, 'symptoms'), ...flattenFieldOccurrences(dayLogsArray, 'moods')];
  const symptomLead = computeLeadTimeInsight(State.periods, symptomMoodIsoList);
  const insightLines = [];
  if (painLead) insightLines.push(`Schmerzen treten bei dir im Schnitt ${fmtDaysAvg(painLead.avgDaysBefore)} Tage vor Periodenbeginn auf (${painLead.count} Einträge ausgewertet).`);
  if (symptomLead) insightLines.push(`Symptome/Stimmung treten bei dir im Schnitt ${fmtDaysAvg(symptomLead.avgDaysBefore)} Tage vor Periodenbeginn auf (${symptomLead.count} Einträge ausgewertet).`);
  const patternInsightHTML = insightLines.length
    ? statsSectionHTML('stat-patternInsight', 'Erkanntes Muster', insightLines.join('<br>'), true)
    : '';

  const anyVisible = painTotalHTML || painIntensityHTML || topSymptomsHTML || topMoodsHTML || patternInsightHTML;
  if (!anyVisible) return '';

  return `
    <p class="stats-group-title">Beschwerden</p>
    ${painTotalHTML}
    ${painIntensityHTML}
    ${patternInsightHTML}
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
