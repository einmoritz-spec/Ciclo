// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPeriods, addPeriodEntry, deletePeriodEntry, updatePeriodEntry,
  loadDayLogs, togglePainDayQuick, addPainEntry, removePainEntry,
  addSymptomOccurrence, removeSymptomOccurrence, updateSymptomOccurrenceTime,
  addMoodOccurrence, removeMoodOccurrence, updateMoodOccurrenceTime,
  setDayNote, updatePainEntry,
  loadCustomItems, addCustomSymptom, addCustomMood, renameCustomItem, deleteCustomItem,
  loadSettings, saveSettings, exportAllData, importAllData,
  setHardUpdatePending, consumeHardUpdatePending
} from '../js/01-storage.js';

beforeEach(() => {
  localStorage.clear();
});

describe('Perioden', () => {
  it('addPeriodEntry speichert und loadPeriods liest sortiert zurück', () => {
    addPeriodEntry('2026-01-10', '2026-01-14');
    addPeriodEntry('2026-01-01', '2026-01-05');
    const periods = loadPeriods();
    expect(periods.map(p => p.start)).toEqual(['2026-01-01', '2026-01-10']);
  });

  it('deletePeriodEntry entfernt genau die angegebene Periode', () => {
    const a = addPeriodEntry('2026-01-01', '2026-01-05');
    addPeriodEntry('2026-02-01', '2026-02-05');
    const remaining = deletePeriodEntry(a.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].start).toBe('2026-02-01');
  });

  it('updatePeriodEntry ändert nur die angegebenen Felder', () => {
    const a = addPeriodEntry('2026-01-01', '2026-01-05');
    updatePeriodEntry(a.id, { end: '2026-01-07' });
    const [updated] = loadPeriods();
    expect(updated.start).toBe('2026-01-01');
    expect(updated.end).toBe('2026-01-07');
  });

  it('updatePeriodEntry auf eine unbekannte id ändert nichts', () => {
    addPeriodEntry('2026-01-01', '2026-01-05');
    const result = updatePeriodEntry('unbekannt', { end: '2099-01-01' });
    expect(result[0].end).toBe('2026-01-05');
  });
});

describe('Schmerz — "Schnell"-Modus', () => {
  it('togglePainDayQuick legt einen generischen Eintrag mit Uhrzeit an', () => {
    const logs = togglePainDayQuick('2026-01-05');
    expect(logs).toHaveLength(1);
    expect(logs[0].pain).toHaveLength(1);
    expect(logs[0].pain[0].category).toBeNull();
    expect(logs[0].pain[0].loggedAt).toBeTruthy();
  });

  it('togglePainDayQuick beim zweiten Aufruf entfernt den Tag wieder komplett', () => {
    togglePainDayQuick('2026-01-05');
    const logs = togglePainDayQuick('2026-01-05');
    expect(logs).toHaveLength(0);
  });
});

describe('Schmerz — "Detailliert"-Modus', () => {
  it('addPainEntry erlaubt mehrere Einträge am selben Tag', () => {
    addPainEntry('2026-01-05', { category: 'kopf', intensity: 6, timeOfDay: 'morning' });
    const logs = addPainEntry('2026-01-05', { category: 'ruecken', intensity: 4, timeOfDay: 'evening' });
    expect(logs[0].pain).toHaveLength(2);
  });

  it('addPainEntry mit Kategorie "sonstige" speichert die Notiz getrimmt', () => {
    const logs = addPainEntry('2026-01-05', { category: 'sonstige', intensity: 5, timeOfDay: null, note: '  Zahnschmerzen  ' });
    expect(logs[0].pain[0].note).toBe('Zahnschmerzen');
  });

  it('removePainEntry entfernt genau einen Eintrag und leert den Tag bei Bedarf', () => {
    addPainEntry('2026-01-05', { category: 'kopf', intensity: 6, timeOfDay: null });
    const entryId = loadDayLogs()[0].pain[0].id;
    const logs = removePainEntry('2026-01-05', entryId);
    expect(logs).toHaveLength(0); // Tag war danach komplett leer -> entfernt
  });

  it('updatePainEntry überschreibt loggedAt anhand einer manuell gewählten Uhrzeit', () => {
    addPainEntry('2026-01-05', { category: 'kopf', intensity: 6, timeOfDay: null });
    const entryId = loadDayLogs()[0].pain[0].id;
    const logs = updatePainEntry('2026-01-05', entryId, { category: 'kopf', intensity: 6, timeOfDay: null, time: '14:30' });
    const loggedDate = new Date(logs[0].pain[0].loggedAt);
    expect(loggedDate.getHours()).toBe(14);
    expect(loggedDate.getMinutes()).toBe(30);
  });

  it('updatePainEntry ändert Kategorie, Intensität und Tageszeit eines bestehenden Eintrags', () => {
    addPainEntry('2026-01-05', { category: 'kopf', intensity: 6, timeOfDay: 'morning' });
    const entryId = loadDayLogs()[0].pain[0].id;
    const logs = updatePainEntry('2026-01-05', entryId, { category: 'ruecken', intensity: 3, timeOfDay: 'evening' });
    expect(logs[0].pain[0]).toMatchObject({ category: 'ruecken', intensity: 3, timeOfDay: 'evening' });
  });

  it('updatePainEntry ohne time lässt die bisherige Uhrzeit unangetastet', () => {
    addPainEntry('2026-01-05', { category: 'kopf', intensity: 6, timeOfDay: null });
    const before = loadDayLogs()[0].pain[0].loggedAt;
    const entryId = loadDayLogs()[0].pain[0].id;
    const logs = updatePainEntry('2026-01-05', entryId, { category: 'kopf', intensity: 8, timeOfDay: null });
    expect(logs[0].pain[0].loggedAt).toBe(before);
  });

  it('addPainEntry mit explizitem time-Feld erlaubt rückwirkende Einträge (nicht "jetzt")', () => {
    const logs = addPainEntry('2020-01-01', { category: 'kopf', intensity: 5, timeOfDay: null, time: '08:00' });
    const loggedDate = new Date(logs[0].pain[0].loggedAt);
    expect(loggedDate.getFullYear()).toBe(2020);
    expect(loggedDate.getHours()).toBe(8);
  });
});

describe('Symptome & Stimmung — Mehrfach-Tracking', () => {
  it('addSymptomOccurrence fügt ein neues Vorkommen mit Uhrzeit hinzu', () => {
    const logs = addSymptomOccurrence('2026-01-05', 'muedigkeit');
    expect(logs[0].symptoms).toHaveLength(1);
    expect(logs[0].symptoms[0].catalogId).toBe('muedigkeit');
    expect(logs[0].symptoms[0].loggedAt).toBeTruthy();
  });

  it('mehrfaches addSymptomOccurrence am selben Tag zählt hoch statt zu toggeln', () => {
    addSymptomOccurrence('2026-01-05', 'uebelkeit');
    addSymptomOccurrence('2026-01-05', 'uebelkeit');
    const logs = addSymptomOccurrence('2026-01-05', 'uebelkeit');
    expect(logs[0].symptoms).toHaveLength(3);
    expect(logs[0].symptoms.every(s => s.catalogId === 'uebelkeit')).toBe(true);
    // jedes Vorkommen hat eine eigene, eindeutige id
    const ids = new Set(logs[0].symptoms.map(s => s.id));
    expect(ids.size).toBe(3);
  });

  it('removeSymptomOccurrence entfernt genau EIN Vorkommen, nicht alle gleichnamigen', () => {
    addSymptomOccurrence('2026-01-05', 'uebelkeit');
    addSymptomOccurrence('2026-01-05', 'uebelkeit');
    const targetId = loadDayLogs()[0].symptoms[0].id;
    const logs = removeSymptomOccurrence('2026-01-05', targetId);
    expect(logs[0].symptoms).toHaveLength(1);
  });

  it('addMoodOccurrence ist unabhängig von addSymptomOccurrence am selben Tag', () => {
    addSymptomOccurrence('2026-01-05', 'muedigkeit');
    const logs = addMoodOccurrence('2026-01-05', 'reizbar');
    expect(logs[0].symptoms).toHaveLength(1);
    expect(logs[0].moods).toHaveLength(1);
  });

  it('removeMoodOccurrence entfernt genau ein Vorkommen', () => {
    addMoodOccurrence('2026-01-05', 'reizbar');
    addMoodOccurrence('2026-01-05', 'reizbar');
    const targetId = loadDayLogs()[0].moods[0].id;
    const logs = removeMoodOccurrence('2026-01-05', targetId);
    expect(logs[0].moods).toHaveLength(1);
  });

  it('updateSymptomOccurrenceTime setzt eine manuelle Uhrzeit für ein bestimmtes Vorkommen', () => {
    addSymptomOccurrence('2026-01-05', 'muedigkeit');
    const entryId = loadDayLogs()[0].symptoms[0].id;
    const logs = updateSymptomOccurrenceTime('2026-01-05', entryId, '09:15');
    const loggedDate = new Date(logs[0].symptoms[0].loggedAt);
    expect(loggedDate.getHours()).toBe(9);
    expect(loggedDate.getMinutes()).toBe(15);
  });

  it('updateMoodOccurrenceTime setzt eine manuelle Uhrzeit für ein bestimmtes Vorkommen', () => {
    addMoodOccurrence('2026-01-05', 'reizbar');
    const entryId = loadDayLogs()[0].moods[0].id;
    const logs = updateMoodOccurrenceTime('2026-01-05', entryId, '21:00');
    const loggedDate = new Date(logs[0].moods[0].loggedAt);
    expect(loggedDate.getHours()).toBe(21);
  });

  it('Entfernen des letzten Vorkommens leert den Tag komplett', () => {
    addSymptomOccurrence('2026-01-05', 'muedigkeit');
    const entryId = loadDayLogs()[0].symptoms[0].id;
    const logs = removeSymptomOccurrence('2026-01-05', entryId);
    expect(logs).toHaveLength(0);
  });
});

describe('Tages-Notiz', () => {
  it('setDayNote legt einen Eintrag nur mit Notiz an', () => {
    const logs = setDayNote('2026-01-05', 'Geburtstag gefeiert');
    expect(logs).toHaveLength(1);
    expect(logs[0].note).toBe('Geburtstag gefeiert');
  });

  it('setDayNote mit leerem Text entfernt eine ansonsten leere Notiz wieder', () => {
    setDayNote('2026-01-05', 'temp');
    const logs = setDayNote('2026-01-05', '   ');
    expect(logs).toHaveLength(0);
  });

  it('setDayNote lässt Schmerz-Einträge desselben Tages unangetastet', () => {
    addPainEntry('2026-01-05', { category: 'kopf', intensity: 5, timeOfDay: null });
    const logs = setDayNote('2026-01-05', 'Notiz');
    expect(logs[0].pain).toHaveLength(1);
    expect(logs[0].note).toBe('Notiz');
  });
});

describe('Eigene Kategorien', () => {
  it('addCustomSymptom fügt einen neuen Katalog-Eintrag hinzu', () => {
    const { customItems, item } = addCustomSymptom('Herzrasen');
    expect(customItems.symptoms).toHaveLength(1);
    expect(item.label).toBe('Herzrasen');
  });

  it('renameCustomItem ändert nur das Label, nicht die id', () => {
    const { item } = addCustomMood('Nervös');
    const updated = renameCustomItem('moods', item.id, 'Aufgeregt');
    expect(updated.moods[0].id).toBe(item.id);
    expect(updated.moods[0].label).toBe('Aufgeregt');
  });

  it('deleteCustomItem entfernt den Katalog-Eintrag UND bereinigt bestehende Tages-Logs', () => {
    const { item } = addCustomSymptom('Herzrasen');
    addSymptomOccurrence('2026-01-05', item.id);
    expect(loadDayLogs()[0].symptoms).toHaveLength(1);

    const result = deleteCustomItem('symptoms', item.id);
    expect(result.customItems.symptoms).toHaveLength(0);
    // Der Tag hatte NUR dieses eine Symptom -> nach der Bereinigung leer -> Log-Eintrag ganz weg
    expect(result.dayLogs).toHaveLength(0);
  });

  it('deleteCustomItem entfernt ALLE Vorkommen eines mehrfach getrackten eigenen Symptoms', () => {
    const { item } = addCustomSymptom('Herzrasen');
    addSymptomOccurrence('2026-01-05', item.id);
    addSymptomOccurrence('2026-01-05', item.id);
    addSymptomOccurrence('2026-01-05', item.id);
    expect(loadDayLogs()[0].symptoms).toHaveLength(3);

    const result = deleteCustomItem('symptoms', item.id);
    expect(result.dayLogs).toHaveLength(0);
  });

  it('deleteCustomItem lässt andere Einträge desselben Tages unangetastet', () => {
    const { item } = addCustomSymptom('Herzrasen');
    addSymptomOccurrence('2026-01-05', item.id);
    addPainEntry('2026-01-05', { category: 'kopf', intensity: 4, timeOfDay: null });

    const result = deleteCustomItem('symptoms', item.id);
    expect(result.dayLogs).toHaveLength(1);
    expect(result.dayLogs[0].symptoms).toHaveLength(0);
    expect(result.dayLogs[0].pain).toHaveLength(1);
  });

  it('loadCustomItems liefert leere Listen ohne vorherige Speicherung', () => {
    expect(loadCustomItems()).toEqual({ symptoms: [], moods: [] });
  });
});

describe('Einstellungen', () => {
  it('loadSettings liefert ein leeres Objekt ohne vorherige Speicherung', () => {
    expect(loadSettings()).toEqual({});
  });

  it('saveSettings/loadSettings sind ein Roundtrip', () => {
    saveSettings({ colorScheme: 'dark', themePreset: 'ton', detailLevel: 'detailed', hiddenItems: ['stat-painTotal'] });
    expect(loadSettings()).toEqual({ colorScheme: 'dark', themePreset: 'ton', detailLevel: 'detailed', hiddenItems: ['stat-painTotal'] });
  });
});

describe('Backup Export/Import', () => {
  it('exportAllData/importAllData sind ein vollständiger Roundtrip', () => {
    addPeriodEntry('2026-01-01', '2026-01-05');
    addPainEntry('2026-01-02', { category: 'kopf', intensity: 6, timeOfDay: 'morning' });
    addMoodOccurrence('2026-01-02', 'reizbar');
    saveSettings({ colorScheme: 'dark', themePreset: 'wald', detailLevel: 'detailed', hiddenItems: [] });

    const backup = exportAllData();
    localStorage.clear();
    importAllData(backup);

    expect(loadPeriods()).toHaveLength(1);
    expect(loadDayLogs()).toHaveLength(1);
    expect(loadDayLogs()[0].pain).toHaveLength(1);
    expect(loadDayLogs()[0].moods).toHaveLength(1);
    expect(loadSettings().colorScheme).toBe('dark');
  });

  it('importAllData lehnt ein Backup ohne periods-Array ab', () => {
    expect(() => importAllData({ foo: 'bar' })).toThrow();
  });

  it('importAllData migriert ein sehr altes Backup-Format (painDays) transparent', () => {
    importAllData({
      periods: [],
      painDays: [{ date: '2026-01-02', categories: ['kopf', 'ruecken'] }]
    });
    const logs = loadDayLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].pain.map(p => p.category).sort()).toEqual(['kopf', 'ruecken']);
  });
});

describe('Hard-Update-Marker (Basis für den "Aktualisiert"-Banner)', () => {
  it('consumeHardUpdatePending ist false ohne vorherigen setHardUpdatePending-Aufruf', () => {
    expect(consumeHardUpdatePending()).toBe(false);
  });

  it('consumeHardUpdatePending ist genau einmal true nach setHardUpdatePending', () => {
    setHardUpdatePending();
    expect(consumeHardUpdatePending()).toBe(true);
    expect(consumeHardUpdatePending()).toBe(false);
  });
});
