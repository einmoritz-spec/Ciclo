import { renderCalendarView, scrollToCurrentMonth } from './04-calendar.js';
import { renderImportView } from './06-import.js';
import { renderChartView } from './07-chart.js';
import { renderStatsView } from './08-stats-progress.js';
import { renderSettingsView } from './09-settings.js';
import { APP_DATA } from './data/app-data.js';

/* ---------------------------------------------------
   NAVIGATION (Bottom-Nav + Android-/Browser-Zurück-Taste)
   Gleiches Grundmuster wie in der Trainings-App: history.pushState pro
   Tab-Wechsel, ein globaler popstate-Handler rendert die passende View neu,
   damit die Hardware-/Browser-Zurück-Taste zwischen den Tabs statt aus der
   App heraus navigiert.
--------------------------------------------------- */

export function pushView(view){
  history.pushState({ view }, '', '');
}
export function replaceView(view){
  history.replaceState({ view }, '', '');
}

// Nur Icons, kein Text-Label mehr unter den Icons (siehe Redesign-Vorlage) —
// das Label bleibt trotzdem als aria-label für Screenreader erhalten.
export function bottomNavHTML(active){
  const tab = (id, label, icon) => `
    <button type="button" class="nav-tab${active === id ? ' is-active' : ''}" data-tab="${id}" aria-label="${label}">
      <span class="nav-tab-icon">${icon}</span>
    </button>
  `;
  return `
    <nav class="bottom-nav">
      ${tab('calendar', 'Kalender', APP_DATA.ICONS.NAV_CALENDAR)}
      ${tab('chart', 'Chart', APP_DATA.ICONS.NAV_CHART)}
      ${tab('stats', 'Stats', APP_DATA.ICONS.NAV_STATS)}
    </nav>
  `;
}

export function wireBottomNav(){
  document.querySelectorAll('.bottom-nav .nav-tab').forEach(btn => {
    btn.onclick = () => {
      const tab = btn.dataset.tab;
      if (tab === 'calendar') goCalendar();
      else if (tab === 'chart') goChart();
      else if (tab === 'stats') goStats();
    };
  });
}

/* ---------------------------------------------------
   renderChartView() liegt in 07-chart.js (siehe dort für die SVG-Diagramme).
--------------------------------------------------- */

/** Logo-Button oben links auf den drei Haupt-Tabs (Kalender/Chart/Stats) —
    zeigt das ausgeschnittene Bienen-Logo (icons/logo-bee.png, freigestelltes
    PNG mit transparentem Hintergrund) statt eines Text-Schriftzugs. Bleibt
    ein <button>, damit Klickverhalten/aria-label wie zuvor funktionieren
    (goCalendarHome(), siehe unten). Die zurückliegenden .app-title-Texte in
    den Zurück-Headern (06-import.js/09-settings.js: "Drip-Import"/
    "Einstellungen") sind Seitentitel, kein Marken-Logo, und bleiben Text. */
export function appLogoButtonHTML(id){
  return `<button type="button" class="app-logo-btn" id="${id}" aria-label="${APP_DATA.APP_NAME}"><img class="app-logo-img" src="icons/logo-bee.png" alt="${APP_DATA.APP_NAME}"></button>`;
}

/* Klick auf das Logo oben links: auf dem Kalender selbst nur zum
   aktuellen Monat zurueckscrollen (kein unnoetiger Re-Render/History-Eintrag),
   von Chart/Stats aus normal zum Kalender wechseln (der scrollt beim Rendern
   ohnehin automatisch zum aktuellen Monat, siehe renderCalendarView()). */
export function goCalendarHome(){
  if (document.getElementById('calendarScroll')){
    scrollToCurrentMonth();
  } else {
    goCalendar();
  }
}

export function goCalendar(push){ if (push !== false) pushView('calendar'); renderCalendarView(); }
function goChart(push){ if (push !== false) pushView('chart'); renderChartView(); }
function goStats(push){ if (push !== false) pushView('stats'); renderStatsView(); }

export function renderViewByState(state){
  switch (state.view){
    case 'chart': renderChartView(); break;
    case 'stats': renderStatsView(); break;
    case 'import': renderImportView(); break;
    case 'settings': renderSettingsView(); break;
    case 'calendar':
    default: renderCalendarView();
  }
}

window.addEventListener('popstate', (event) => {
  const state = event.state || { view: 'calendar' };
  renderViewByState(state);
});
