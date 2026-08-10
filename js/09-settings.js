/* ---------------------------------------------------
   EINSTELLUNGEN
   Eigener Sub-Flow wie 06-import.js (kein Bottom-Nav-Tab, eigener Zurück-
   Header), erreichbar über das Drei-Punkte-Icon oben rechts auf allen drei
   Haupt-Tabs (Kalender/Chart/Stats). Drei Bereiche:
   1. Design: Hell/Dunkel/System-Farbschema (applyColorScheme(), 02-state-
      theme.js) sowie ein Farbthema aus APP_DATA.THEME_PRESETS (Sand/Wald/Ton/
      Stein — jeweils ein kompletter Hell- UND Dunkel-Variablensatz, angewendet
      über applyThemePreset()/reapplyThemePresetVars(), 02-state-theme.js).
   2. Export & Import: JSON-Vollbackup (exportAllData()/importAllData() aus
      01-storage.js) sowie Zugriff auf den bestehenden Drip-CSV-Import
      (06-import.js) — der hatte zuvor ein eigenes Icon im Kalender-Header,
      das jetzt hier gebündelt ist.
   3. Bericht: druckfertige PDF-Zusammenfassung (Diagramme + Kennzahlen) für
      einen wählbaren Zeitraum. Bewusst OHNE PDF-Bibliothek umgesetzt — die
      App bleibt eine einzelne, offlinefähige HTML-Datei ohne CDN-Abhängigkeit.
      Stattdessen wird ein druckfertiger Report ins DOM gerendert und über den
      nativen Druckdialog (window.print(), siehe @media print in css/styles.css)
      als PDF speicherbar gemacht — funktioniert auf Android/Desktop/iOS gleich.
--------------------------------------------------- */

// Welcher eigene Symptom-/Stimmungs-Chip gerade im "Eigene Kategorien"-
// Abschnitt umbenannt wird (null = keiner) — { field: 'symptoms'|'moods', id }.
// Siehe customItemRowHTML() weiter unten.
let editingCustomItem = null;

// Ob die Palette für "Eigene Farbe" gerade aufgeklappt ist (siehe
// customThemeRowHTML()/customPaletteHTML() weiter unten).
let showCustomPalette = false;

function colorSchemeOptionHTML(value, label, current){
  return `<button type="button" class="settings-pill${value === current ? ' is-active' : ''}" data-scheme="${value}">${label}</button>`;
}

function detailLevelOptionHTML(value, label, current){
  return `<button type="button" class="settings-pill${value === current ? ' is-active' : ''}" data-detail-level="${value}">${label}</button>`;
}

/** Eine Zeile in der Farbthema-Liste: 3-Streifen-Vorschau (aus preset.swatch),
    Themenname und ein Häkchen, das nur beim aktiven Thema sichtbar ist (siehe
    .theme-preset-row.is-active in css/styles.css). */
function themePresetRowHTML(preset, currentId){
  const isActive = preset.id === currentId;
  const stripesHTML = preset.swatch.map(color => `<span style="background:${color}"></span>`).join('');
  return `
    <button type="button" class="theme-preset-row${isActive ? ' is-active' : ''}" data-theme-preset="${preset.id}">
      <span class="theme-preset-swatch">${stripesHTML}</span>
      <span class="theme-preset-name">${preset.name}</span>
      <span class="theme-preset-check">${APP_DATA.ICONS.CHECK}</span>
    </button>
  `;
}

/** 5. Zeile in der Farbthema-Liste: "Eigene Farbe" — statt eines fest
    hinterlegten Variablensatzes wird hier bei Auswahl eines Palette-Farbtons
    live ein komplettes Hell/Dunkel-Set abgeleitet (generateEarthyTheme(),
    03-utils.js). Die 3-Streifen-Vorschau zeigt, sofern schon eine Farbe
    gewählt wurde, Akzent/Fläche/Header-Ton des ABGELEITETEN Themas (damit die
    Vorschau genauso funktioniert wie bei den festen Themen) — ohne gewählte
    Farbe stattdessen drei Beispieltöne aus der Palette als Hinweis "hier
    warten mehr Farben". Ein Tap öffnet/schließt die Palette darunter
    (showCustomPalette, siehe unten) statt sofort ein Thema zu setzen — erst
    ein Tap auf einen konkreten Farbton wählt & aktiviert. */
function customThemeRowHTML(currentId){
  const isActive = currentId === 'custom';
  const chosenColor = State.settings.customThemeColor;
  const previewColors = chosenColor
    ? (() => {
        const t = generateEarthyTheme(chosenColor).light;
        return [t['--color-accent'], t['--color-bg'], t['--color-header-bg']];
      })()
    : [APP_DATA.EARTHY_PALETTE[1], APP_DATA.EARTHY_PALETTE[5], APP_DATA.EARTHY_PALETTE[10]];
  const stripesHTML = previewColors.map(color => `<span style="background:${color}"></span>`).join('');

  return `
    <button type="button" class="theme-preset-row${isActive ? ' is-active' : ''}" id="customThemeToggleBtn">
      <span class="theme-preset-swatch">${stripesHTML}</span>
      <span class="theme-preset-name">Eigene Farbe</span>
      <span class="theme-preset-check">${APP_DATA.ICONS.CHECK}</span>
    </button>
    ${showCustomPalette ? customPaletteHTML() : ''}
  `;
}

/** Raster mit der kompletten erdig-pastelligen Farbpalette (APP_DATA.
    EARTHY_PALETTE) — jeder Tap wählt die Farbe direkt aus und aktiviert
    "Eigene Farbe" sofort (kein separater Bestätigungs-Schritt), siehe
    wireSettingsView(). Die aktuell gewählte Farbe ist per Rahmen markiert. */
function customPaletteHTML(){
  const chosenColor = State.settings.customThemeColor;
  return `
    <div class="custom-palette">
      <p class="settings-text">Wähle einen Farbton — Akzent-, Hell- und Dunkel-Variante werden automatisch dazu erzeugt.</p>
      <div class="custom-palette-grid">
        ${APP_DATA.EARTHY_PALETTE.map(hex => `
          <button type="button" class="custom-palette-swatch${chosenColor === hex ? ' is-selected' : ''}" data-color="${hex}" style="background:${hex}" aria-label="Farbe ${hex}"></button>
        `).join('')}
      </div>
    </div>
  `;
}

/** Sinnvoller Vorschlags-Zeitraum für den Bericht: die letzten ~6 Monate, oder
    ab der ersten erfassten Periode, falls die App noch kürzer genutzt wird. */
function defaultReportRange(){
  const toISO = formatISODate(State.today);
  const sixMonthsAgoISO = formatISODate(addDays(State.today, -182));
  const sortedPeriods = [...State.periods].sort((a, b) => a.start.localeCompare(b.start));
  const earliestStart = sortedPeriods.length ? sortedPeriods[0].start : null;
  const fromISO = earliestStart && earliestStart > sixMonthsAgoISO ? earliestStart : sixMonthsAgoISO;
  return { fromISO, toISO };
}

/** Eine Zeile in der "Sichtbare Bereiche"-Liste (Einstellungen -> Sichtbare
    Bereiche). Checkbox-Zustand kommt direkt aus isItemHidden() (02-state-
    theme.js) — dieselbe Quelle, die auch beim Rendern von Stats/Chart
    entscheidet, ob eine Karte gezeigt wird. */
function visibilityRowHTML(item){
  const visible = !isItemHidden(item.id);
  return `
    <label class="visibility-row">
      <input type="checkbox" class="visibility-row-checkbox" data-vis-id="${item.id}" ${visible ? 'checked' : ''}>
      <span class="visibility-row-label">${item.label}</span>
    </label>
  `;
}

/** Die komplette "Sichtbare Bereiche"-Liste, gruppiert nach Themenbereich
    (APP_DATA.VISIBILITY_GROUPS) statt einer einzigen langen, unsortierten
    Liste — mit knapp 20 Elementen inzwischen sonst schwer zu überblicken. */
function visibilityGroupsHTML(){
  return APP_DATA.VISIBILITY_GROUPS.map(group => `
    <p class="settings-subheading">${group.label}</p>
    <div class="visibility-list">
      ${group.items.map(visibilityRowHTML).join('')}
    </div>
  `).join('');
}

/** Eine Zeile in "Eigene Kategorien" (Einstellungen -> Beschwerden): zeigt
    entweder das Label mit Umbenennen-/Löschen-Buttons ODER, wenn gerade
    bearbeitet (editingCustomItem, siehe unten), ein Eingabefeld mit Speichern/
    Abbrechen. field: 'symptoms' | 'moods'. */
function customItemRowHTML(field, item){
  const isEditing = editingCustomItem && editingCustomItem.field === field && editingCustomItem.id === item.id;
  if (isEditing){
    return `
      <div class="custom-item-row custom-item-row--editing" data-field="${field}" data-id="${item.id}">
        <input type="text" class="chip-add-input" id="customItemEditInput" value="${escapeAttr(item.label)}">
        <button type="button" class="chip-add-btn custom-item-save-btn" data-field="${field}" data-id="${item.id}" aria-label="Speichern">${APP_DATA.ICONS.CHECK}</button>
        <button type="button" class="custom-item-cancel-btn" id="customItemCancelBtn" aria-label="Abbrechen">×</button>
      </div>
    `;
  }
  return `
    <div class="custom-item-row" data-field="${field}" data-id="${item.id}">
      <span class="custom-item-label">${item.label}</span>
      <button type="button" class="custom-item-rename-btn" data-field="${field}" data-id="${item.id}" aria-label="Umbenennen">✎</button>
      <button type="button" class="custom-item-delete-btn" data-field="${field}" data-id="${item.id}" aria-label="Löschen">×</button>
    </div>
  `;
}

/** "Eigene Kategorien": eigene, per "+ Eigenes" im Tages-Sheet angelegte
    Symptom-/Stimmungs-Chips (State.customItems, siehe 02-state-theme.js) lassen
    sich hier umbenennen oder löschen — die feste Grundliste (APP_DATA.
    SYMPTOM_CATEGORIES/MOOD_CATEGORIES) ist bewusst nicht bearbeitbar. Kommt
    leer zurück, solange noch keine eigenen Chips angelegt wurden. */
function customCategoriesSectionHTML(){
  const hasCustom = State.customItems.symptoms.length || State.customItems.moods.length;
  if (!hasCustom) return '';
  return `
    <section class="settings-section">
      <h2 class="settings-heading">Eigene Kategorien</h2>
      <p class="settings-text">Per "+ Eigenes" im Tages-Sheet angelegte Symptome/Stimmungen — hier umbenennen oder entfernen.</p>
      ${State.customItems.symptoms.length ? `
        <p class="settings-subheading">Symptome</p>
        <div class="custom-item-list">${State.customItems.symptoms.map(i => customItemRowHTML('symptoms', i)).join('')}</div>
      ` : ''}
      ${State.customItems.moods.length ? `
        <p class="settings-subheading">Stimmung</p>
        <div class="custom-item-list">${State.customItems.moods.map(i => customItemRowHTML('moods', i)).join('')}</div>
      ` : ''}
    </section>
  `;
}

function settingsContentHTML(){
  const settings = loadSettings();
  const currentScheme = settings.colorScheme || 'system';
  const currentPreset = settings.themePreset || APP_DATA.DEFAULT_THEME_PRESET_ID;
  const currentDetailLevel = settings.detailLevel || 'quick';
  const { fromISO, toISO } = defaultReportRange();

  return `
    <section class="settings-section">
      <h2 class="settings-heading">Design</h2>
      <p class="settings-label">Farbschema</p>
      <div class="settings-pill-row" id="schemeRow">
        ${colorSchemeOptionHTML('light', 'Hell', currentScheme)}
        ${colorSchemeOptionHTML('dark', 'Dunkel', currentScheme)}
        ${colorSchemeOptionHTML('system', 'System', currentScheme)}
      </div>
      <p class="settings-label">Farbthema</p>
      <div class="theme-preset-list" id="themePresetList">
        ${APP_DATA.THEME_PRESETS.map(p => themePresetRowHTML(p, currentPreset)).join('')}
        ${customThemeRowHTML(currentPreset)}
      </div>
    </section>

    <section class="settings-section">
      <h2 class="settings-heading">Schmerzen</h2>
      <p class="settings-label">Detailgrad</p>
      <div class="settings-pill-row" id="detailLevelRow">
        ${detailLevelOptionHTML('quick', 'Schnell', currentDetailLevel)}
        ${detailLevelOptionHTML('detailed', 'Detailliert', currentDetailLevel)}
      </div>
      <p class="settings-text">${currentDetailLevel === 'detailed'
        ? 'Ein langer Druck auf einen Kalendertag öffnet ein Sheet für Schmerzen (Art, Intensität 1–10, Tageszeit — mehrere pro Tag möglich), Symptome (z.B. Licht-/Geruchsempfindlichkeit) und Stimmung (z.B. gereizt, gestresst) — inkl. eigener, ergänzbarer Einträge.'
        : 'Ein langer Druck auf einen Kalendertag markiert ihn pauschal als Schmerztag. Im Detailliert-Modus lassen sich zusätzlich Schmerzart/-stärke/-zeitpunkt, Symptome und Stimmung erfassen.'}</p>
    </section>

    <section class="settings-section">
      <h2 class="settings-heading">Sichtbare Bereiche</h2>
      <p class="settings-text">Per langem Drücken auf eine Karte in Stats oder Chart lässt sie sich ausblenden. Hier wieder einblendbar, nach Bereich sortiert.</p>
      ${visibilityGroupsHTML()}
    </section>

    ${customCategoriesSectionHTML()}

    <section class="settings-section">
      <h2 class="settings-heading">Export &amp; Import</h2>
      <p class="settings-text">Sichert alle Perioden-Einträge und Design-Einstellungen als Backup-Datei bzw. spielt eine zuvor exportierte Datei wieder ein.</p>
      <button type="button" class="settings-action-btn" id="exportBtn">Daten exportieren</button>
      <label class="settings-action-btn settings-action-btn--secondary">
        Backup importieren
        <input type="file" accept="application/json" id="importBackupInput" hidden>
      </label>
      <p class="import-error" id="settingsError"></p>
      <button type="button" class="settings-action-btn settings-action-btn--secondary" id="dripImportBtn">Aus Drip importieren</button>
    </section>

    <section class="settings-section">
      <h2 class="settings-heading">Bericht</h2>
      <p class="settings-text">Erstellt eine druckfertige Zusammenfassung mit Diagrammen und Kennzahlen für einen Zeitraum deiner Wahl — im Drucken-Dialog als PDF speicherbar.</p>
      <div class="settings-date-row">
        <label class="settings-date-field">
          <span class="settings-label">Von</span>
          <input type="date" id="reportFromInput" value="${fromISO}">
        </label>
        <label class="settings-date-field">
          <span class="settings-label">Bis</span>
          <input type="date" id="reportToInput" value="${toISO}">
        </label>
      </div>
      <button type="button" class="settings-action-btn" id="reportGenerateBtn">Als PDF erstellen</button>
      <p class="import-error" id="reportError"></p>
    </section>
  `;
}

function downloadJSON(data, filename){
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function handleExportClick(){
  downloadJSON(exportAllData(), `ciclo-backup-${formatISODate(State.today)}.json`);
}

function handleBackupFileSelected(event){
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const errorEl = document.getElementById('settingsError');
  if (errorEl) errorEl.textContent = '';

  const reader = new FileReader();
  reader.onload = () => {
    try {
      importAllData(JSON.parse(String(reader.result)));
      State.periods = loadPeriods();
      State.dayLogs = new Map(loadDayLogs().map(e => [e.date, e]));
      State.customItems = loadCustomItems();
      State.settings = { ...State.settings, ...loadSettings() };
      if (!Array.isArray(State.settings.hiddenItems)) State.settings.hiddenItems = [];
      if (!State.settings.themePreset) State.settings.themePreset = APP_DATA.DEFAULT_THEME_PRESET_ID;
      if (!State.settings.detailLevel) State.settings.detailLevel = 'quick';
      applyColorScheme(State.settings.colorScheme || 'system');
      renderSettingsView();
    } catch (err){
      if (errorEl) errorEl.textContent = err.message || 'Backup-Datei konnte nicht gelesen werden.';
    }
  };
  reader.onerror = () => {
    if (errorEl) errorEl.textContent = 'Backup-Datei konnte nicht gelesen werden.';
  };
  reader.readAsText(file, 'UTF-8');
}

function handleSchemeSelect(scheme){
  applyColorScheme(scheme);
  saveSettings({ ...loadSettings(), colorScheme: scheme });
  renderSettingsView();
}

function handleThemePresetSelect(presetId){
  applyThemePreset(presetId);
  renderSettingsView();
}

function handleDetailLevelSelect(level){
  State.settings.detailLevel = level;
  saveSettings(State.settings);
  renderSettingsView();
}

/** Baut den druckfertigen Berichts-Inhalt für den gewählten Zeitraum. Zyklus-
    längen werden aus dem VOLLSTÄNDIGEN Datensatz berechnet (computeChartData
    über alle Perioden) und erst danach auf den Zeitraum gefiltert, damit ein
    Zyklus am Rand des Zeitraums nicht durch fehlende Nachbar-Perioden verfälscht
    wird — nur die Anzeige ist eingegrenzt, die Werte bleiben korrekt. */
function buildReportHTML(fromISO, toISO){
  const { periodLengths, cycleLengths } = computeChartData(State.periods);
  const inRange = e => e.start >= fromISO && e.start <= toISO;
  const rangePeriodLengths = periodLengths.filter(inRange);
  const rangeCycleLengths = cycleLengths.filter(inRange);
  const rangeDayLogs = Array.from(State.dayLogs.values()).filter(e => e.date >= fromISO && e.date <= toISO);
  const rangePeriods = [...State.periods]
    .filter(p => p.start >= fromISO && p.start <= toISO)
    .sort((a, b) => a.start.localeCompare(b.start));

  const avgPeriod = rangePeriodLengths.length ? average(rangePeriodLengths.map(p => p.length)) : null;
  const avgCycle = rangeCycleLengths.length ? average(rangeCycleLengths.map(c => c.length)) : null;

  const periodChart = rangePeriodLengths.length
    ? barChartSVG(rangePeriodLengths.map(p => ({ label: fmtDateShort(parseISODate(p.start)), value: p.length })), '--color-period-text', avgPeriod)
    : '<p>Keine Perioden im gewählten Zeitraum.</p>';

  const cycleChart = rangeCycleLengths.length
    ? barChartSVG(rangeCycleLengths.map(c => ({ label: fmtDateShort(parseISODate(c.start)), value: c.length })), '--color-accent', avgCycle)
    : '<p>Braucht mindestens zwei Periodenstarts im Zeitraum.</p>';

  const rangePainStats = computePainStats(State.periods, rangeDayLogs);
  let painSection = '';
  if (rangePainStats.totalCount){
    const painPhaseStats = computePhaseOccurrenceStats(State.periods, rangePainStats.entries.map(e => e.iso));
    const painPhaseEntries = Object.entries(painPhaseStats.counts).map(([label, value]) => ({ label, value }));
    const timeEntries = APP_DATA.PAIN_TIME_OF_DAY.map(t => ({ label: t.label, value: rangePainStats.byTimeOfDay[t.id] || 0 }));
    painSection = `
      <h2>Schmerzen</h2>
      <ul class="report-summary-list">
        <li>${rangePainStats.totalCount} Schmerz-Eintrag${rangePainStats.totalCount === 1 ? '' : 'e'} im Zeitraum</li>
        ${rangePainStats.avgIntensity !== null ? `<li>Ø Intensität: ${fmtDaysAvg(rangePainStats.avgIntensity)}/10</li>` : ''}
      </ul>
      <h2>Schmerzen nach Zyklusphase</h2>
      ${categoryBarChartSVG(painPhaseEntries, '--color-pain')}
      <h2>Schmerzen nach Tageszeit</h2>
      ${categoryBarChartSVG(timeEntries, '--color-pain')}
    `;
  }

  let symptomMoodSection = '';
  const symptomCounts = topItemsFromCounts(computeItemFrequency(rangeDayLogs, 'symptoms'), symptomCatalog(), 8);
  const moodCounts = topItemsFromCounts(computeItemFrequency(rangeDayLogs, 'moods'), moodCatalog(), 8);
  if (symptomCounts.length || moodCounts.length){
    symptomMoodSection = `
      <h2>Symptome &amp; Stimmung</h2>
      <ul class="report-summary-list">
        ${symptomCounts.map(s => `<li>${s.label}: ${s.count}x</li>`).join('')}
        ${moodCounts.map(m => `<li>${m.label}: ${m.count}x</li>`).join('')}
      </ul>
    `;
  }

  const tableRows = rangePeriods.map(p => `
    <tr>
      <td>${fmtDateReadable(parseISODate(p.start))}</td>
      <td>${fmtDateReadable(parseISODate(p.end))}</td>
      <td>${daysBetween(parseISODate(p.start), parseISODate(p.end)) + 1} Tage</td>
    </tr>
  `).join('');

  return `
    <h1>Perioden-Bericht</h1>
    <p class="report-meta">Zeitraum: ${fmtDateReadable(parseISODate(fromISO))} – ${fmtDateReadable(parseISODate(toISO))} · erstellt am ${fmtDateReadable(State.today)}</p>

    <h2>Zusammenfassung</h2>
    <ul class="report-summary-list">
      <li>${rangePeriods.length} erfasste Periode${rangePeriods.length === 1 ? '' : 'n'} im Zeitraum</li>
      <li>Ø Periodendauer: ${avgPeriod !== null ? fmtDaysAvg(avgPeriod) + ' Tage' : 'keine Daten'}</li>
      <li>Ø Zykluslänge: ${avgCycle !== null ? fmtDaysAvg(avgCycle) + ' Tage' : 'keine Daten'}</li>
      ${rangePainStats.totalCount ? `<li>Schmerz-Einträge im Zeitraum: ${rangePainStats.totalCount}</li>` : ''}
    </ul>

    <h2>Periodendauer</h2>
    ${periodChart}

    <h2>Zykluslänge</h2>
    ${cycleChart}

    ${painSection}

    ${symptomMoodSection}

    <h2>Erfasste Perioden im Zeitraum</h2>
    ${rangePeriods.length ? `
      <table class="report-table">
        <thead><tr><th>Start</th><th>Ende</th><th>Dauer</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    ` : '<p>Keine Perioden in diesem Zeitraum erfasst.</p>'}
  `;
}

function handleGenerateReport(){
  const fromInput = document.getElementById('reportFromInput');
  const toInput = document.getElementById('reportToInput');
  const errorEl = document.getElementById('reportError');
  if (errorEl) errorEl.textContent = '';

  const fromISO = fromInput.value;
  const toISO = toInput.value;
  if (!fromISO || !toISO){
    if (errorEl) errorEl.textContent = 'Bitte Start- und Enddatum wählen.';
    return;
  }
  if (fromISO > toISO){
    if (errorEl) errorEl.textContent = '"Von" muss vor "Bis" liegen.';
    return;
  }

  let printRoot = document.getElementById('printReportRoot');
  if (!printRoot){
    printRoot = document.createElement('div');
    printRoot.id = 'printReportRoot';
    document.body.appendChild(printRoot);
  }
  printRoot.innerHTML = buildReportHTML(fromISO, toISO);

  // document.title steuert den Dateinamens-Vorschlag im "Als PDF speichern"-Dialog
  // der Browser — so landet der gewählte Zeitraum direkt im Dateinamen, nicht nur
  // im Dokument selbst. Nach dem Dialog (ob gespeichert oder abgebrochen) wird der
  // ursprüngliche Titel wiederhergestellt.
  const originalTitle = document.title;
  document.title = `Perioden-Bericht_${fromISO}_bis_${toISO}`;

  window.print();

  window.addEventListener('afterprint', function restoreTitle(){
    document.title = originalTitle;
    window.removeEventListener('afterprint', restoreTitle);
  });
}

function wireSettingsView(){
  document.querySelectorAll('#schemeRow .settings-pill').forEach(btn => {
    btn.onclick = () => handleSchemeSelect(btn.dataset.scheme);
  });
  document.querySelectorAll('#themePresetList .theme-preset-row[data-theme-preset]').forEach(btn => {
    btn.onclick = () => handleThemePresetSelect(btn.dataset.themePreset);
  });
  const customThemeToggleBtn = document.getElementById('customThemeToggleBtn');
  if (customThemeToggleBtn) customThemeToggleBtn.onclick = () => { showCustomPalette = !showCustomPalette; renderSettingsView(); };
  document.querySelectorAll('.custom-palette-swatch').forEach(btn => {
    btn.onclick = () => {
      State.settings.customThemeColor = btn.dataset.color;
      showCustomPalette = false;
      handleThemePresetSelect('custom');
    };
  });
  document.querySelectorAll('#detailLevelRow .settings-pill').forEach(btn => {
    btn.onclick = () => handleDetailLevelSelect(btn.dataset.detailLevel);
  });
  document.getElementById('exportBtn').onclick = handleExportClick;
  document.getElementById('importBackupInput').onchange = handleBackupFileSelected;
  document.getElementById('dripImportBtn').onclick = () => goImport();
  document.getElementById('reportGenerateBtn').onclick = handleGenerateReport;
  document.querySelectorAll('.visibility-row-checkbox').forEach(cb => {
    cb.onchange = () => {
      if (cb.checked) showItem(cb.dataset.visId); else hideItem(cb.dataset.visId);
    };
  });

  // "Eigene Kategorien": Umbenennen öffnet die Inline-Bearbeitung (kein
  // Storage-Zugriff nötig, nur ein Re-Render mit editingCustomItem gesetzt),
  // Speichern/Abbrechen/Löschen greifen auf die Storage-Funktionen aus
  // 01-storage.js zu und aktualisieren State.customItems danach direkt aus
  // deren Rückgabewert (kein erneutes loadCustomItems() nötig).
  document.querySelectorAll('.custom-item-rename-btn').forEach(btn => {
    btn.onclick = () => {
      editingCustomItem = { field: btn.dataset.field, id: btn.dataset.id };
      renderSettingsView();
    };
  });
  const cancelEditBtn = document.getElementById('customItemCancelBtn');
  if (cancelEditBtn) cancelEditBtn.onclick = () => { editingCustomItem = null; renderSettingsView(); };
  document.querySelectorAll('.custom-item-save-btn').forEach(btn => {
    btn.onclick = () => {
      const input = document.getElementById('customItemEditInput');
      const newLabel = input.value.trim();
      if (!newLabel) return;
      State.customItems = renameCustomItem(btn.dataset.field, btn.dataset.id, newLabel);
      editingCustomItem = null;
      renderSettingsView();
    };
  });
  document.querySelectorAll('.custom-item-delete-btn').forEach(btn => {
    btn.onclick = () => {
      const field = btn.dataset.field;
      const id = btn.dataset.id;
      const item = State.customItems[field].find(i => i.id === id);
      const label = item ? item.label : 'diese Kategorie';
      if (!confirm(`"${label}" wirklich löschen? Sie wird auch aus bereits erfassten Tagen entfernt.`)) return;
      const result = deleteCustomItem(field, id);
      State.customItems = result.customItems;
      State.dayLogs = new Map(result.dayLogs.map(e => [e.date, e]));
      renderSettingsView();
    };
  });
}

function renderSettingsView(){
  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="app-header back-header">
      <button type="button" class="back-btn" id="settingsBackBtn" aria-label="Zurück">←</button>
      <span class="app-title">Einstellungen</span>
      <span class="header-spacer"></span>
    </header>
    <div class="settings-scroll">
      ${settingsContentHTML()}
    </div>
  `;
  document.getElementById('settingsBackBtn').onclick = () => history.back();
  wireSettingsView();
}

function goSettings(push){ if (push !== false) pushView('settings'); renderSettingsView(); }
