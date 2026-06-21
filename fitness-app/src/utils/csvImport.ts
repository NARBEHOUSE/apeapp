import { getDB } from '../db';
import type { WorkoutSession, SetLog, FoodEntry } from '../types';

export type ImportSource = 'strong' | 'hevy' | 'fitnotes' | 'myfitnesspal' | 'macrofactor' | 'unknown';
export type ImportType = 'workouts' | 'nutrition';

export interface ImportResult {
  source: ImportSource;
  type: ImportType;
  count: number;
  dateRange: { from: string; to: string } | null;
  skipped: number;
  errors: string[];
}

function parseCSV(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(current.trim());
        current = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(current.trim());
        if (row.some((c) => c.length > 0)) rows.push(row);
        row = [];
        current = '';
        if (ch === '\r') i++;
      } else {
        current += ch;
      }
    }
  }
  row.push(current.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

export function detectSource(text: string): { source: ImportSource; type: ImportType } {
  const firstLine = text.split(/\r?\n/)[0].toLowerCase();

  // Strong uses semicolons
  if (firstLine.includes(';') && firstLine.includes('exercise name') && firstLine.includes('set order')) {
    return { source: 'strong', type: 'workouts' };
  }
  // Hevy
  if (firstLine.includes('exercise_title') && firstLine.includes('set_index')) {
    return { source: 'hevy', type: 'workouts' };
  }
  // FitNotes
  if (firstLine.includes('exercise') && firstLine.includes('category') && firstLine.includes('weight (')) {
    return { source: 'fitnotes', type: 'workouts' };
  }
  // MacroFactor — "Date,Calories (kcal),Fat (g),Carbs (g),Protein (g)"
  if (firstLine.includes('calories (kcal)')) {
    return { source: 'macrofactor', type: 'nutrition' };
  }
  // MyFitnessPal
  if (firstLine.includes('meal') && (firstLine.includes('calories') || firstLine.includes('fat'))) {
    return { source: 'myfitnesspal', type: 'nutrition' };
  }
  // Generic nutrition CSV — has calories + protein/fat/carbs columns, no workout columns
  if (firstLine.includes('date') && firstLine.includes('calories') && (firstLine.includes('protein') || firstLine.includes('fat')) && !firstLine.includes('exercise') && !firstLine.includes('reps') && !firstLine.includes('set')) {
    return { source: 'macrofactor', type: 'nutrition' };
  }

  return { source: 'unknown', type: 'workouts' };
}

// ── Strong Import ──

function parseStrongCSV(text: string, profileId: string): { sessions: WorkoutSession[]; errors: string[] } {
  const rows = parseCSV(text, ';');
  if (rows.length < 2) return { sessions: [], errors: ['No data rows found'] };

  const headers = rows[0].map((h) => h.toLowerCase());
  const col = (name: string) => headers.findIndex((h) => h.includes(name));

  const iDate = col('date');
  const iExercise = col('exercise name');
  const iSetOrder = col('set order');
  const iWeight = col('weight');
  const iReps = col('reps');
  const iDuration = col('duration');
  const iNotes = col('notes');

  if (iDate < 0 || iExercise < 0) return { sessions: [], errors: ['Could not find Date or Exercise Name columns'] };

  const sessionMap = new Map<string, { exercises: Map<string, SetLog[]>; date: string; duration: string; notes: string }>();
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rawDate = r[iDate] || '';
    const date = normalizeDate(rawDate);
    if (!date) { errors.push(`Row ${i + 1}: invalid date "${rawDate}"`); continue; }

    const exercise = r[iExercise] || '';
    if (!exercise) continue;

    const key = `${date}_${r[iDuration] || ''}`;
    if (!sessionMap.has(key)) {
      sessionMap.set(key, { exercises: new Map(), date, duration: r[iDuration] || '', notes: '' });
    }
    const session = sessionMap.get(key)!;

    const weight = parseFloat(r[iWeight] || '0') || 0;
    const reps = parseInt(r[iReps] || '0') || 0;
    const setLog: SetLog = { weight, reps, completed: true, timestamp: 0 };

    if (!session.exercises.has(exercise)) session.exercises.set(exercise, []);
    session.exercises.get(exercise)!.push(setLog);

    if (iNotes >= 0 && r[iNotes] && !session.notes) session.notes = r[iNotes];
  }

  const sessions = buildSessions(sessionMap, profileId);
  return { sessions, errors };
}

// ── Hevy Import ──

function parseHevyCSV(text: string, profileId: string): { sessions: WorkoutSession[]; errors: string[] } {
  const rows = parseCSV(text, ',');
  if (rows.length < 2) return { sessions: [], errors: ['No data rows found'] };

  const headers = rows[0].map((h) => h.toLowerCase());
  const col = (name: string) => headers.findIndex((h) => h === name);

  const iTitle = col('title');
  const iStart = col('start_time');
  const iEnd = col('end_time');
  const iExercise = col('exercise_title');
  const iWeight = col('weight_lbs');
  const iReps = col('reps');
  const iSetType = col('set_type');

  if (iExercise < 0) return { sessions: [], errors: ['Could not find exercise_title column'] };

  const sessionMap = new Map<string, { exercises: Map<string, SetLog[]>; date: string; duration: string; notes: string }>();
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rawStart = r[iStart] || '';
    const date = normalizeHevyDate(rawStart);
    if (!date) { errors.push(`Row ${i + 1}: invalid date "${rawStart}"`); continue; }

    const exercise = r[iExercise] || '';
    if (!exercise) continue;

    const setType = r[iSetType] || 'normal';
    if (setType === 'warmup') continue;

    const key = `${date}_${rawStart}`;
    if (!sessionMap.has(key)) {
      const duration = computeDuration(rawStart, r[iEnd] || '');
      sessionMap.set(key, { exercises: new Map(), date, duration, notes: '' });
    }
    const session = sessionMap.get(key)!;

    const weight = parseFloat(r[iWeight] || '0') || 0;
    const reps = parseInt(r[iReps] || '0') || 0;
    const setLog: SetLog = { weight, reps, completed: true, timestamp: 0 };

    if (!session.exercises.has(exercise)) session.exercises.set(exercise, []);
    session.exercises.get(exercise)!.push(setLog);
  }

  const sessions = buildSessions(sessionMap, profileId);
  return { sessions, errors };
}

// ── FitNotes Import ──

function parseFitNotesCSV(text: string, profileId: string): { sessions: WorkoutSession[]; errors: string[] } {
  const rows = parseCSV(text, ',');
  if (rows.length < 2) return { sessions: [], errors: ['No data rows found'] };

  const headers = rows[0].map((h) => h.toLowerCase());
  const col = (name: string) => headers.findIndex((h) => h.includes(name));

  const iDate = col('date');
  const iExercise = col('exercise');
  const iWeightLbs = headers.findIndex((h) => h.includes('weight') && h.includes('lbs'));
  const iWeightKg = headers.findIndex((h) => h.includes('weight') && h.includes('kg'));
  const iReps = col('reps');

  if (iDate < 0 || iExercise < 0) return { sessions: [], errors: ['Could not find Date or Exercise columns'] };

  const sessionMap = new Map<string, { exercises: Map<string, SetLog[]>; date: string; duration: string; notes: string }>();
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = normalizeDate(r[iDate] || '');
    if (!date) { errors.push(`Row ${i + 1}: invalid date`); continue; }

    const exercise = r[iExercise] || '';
    if (!exercise) continue;

    if (!sessionMap.has(date)) {
      sessionMap.set(date, { exercises: new Map(), date, duration: '', notes: '' });
    }
    const session = sessionMap.get(date)!;

    // Prefer lbs, fall back to kg converted
    let weight = 0;
    if (iWeightLbs >= 0 && r[iWeightLbs]) {
      weight = parseFloat(r[iWeightLbs]) || 0;
    } else if (iWeightKg >= 0 && r[iWeightKg]) {
      weight = Math.round((parseFloat(r[iWeightKg]) || 0) * 2.20462 * 10) / 10;
    }
    const reps = parseInt(r[iReps] || '0') || 0;
    const setLog: SetLog = { weight, reps, completed: true, timestamp: 0 };

    if (!session.exercises.has(exercise)) session.exercises.set(exercise, []);
    session.exercises.get(exercise)!.push(setLog);
  }

  const sessions = buildSessions(sessionMap, profileId);
  return { sessions, errors };
}

// ── MyFitnessPal Import ──

function parseMFPCSV(text: string, profileId: string): { entries: FoodEntry[]; errors: string[] } {
  const rows = parseCSV(text, ',');
  if (rows.length < 2) return { entries: [], errors: ['No data rows found'] };

  const headers = rows[0].map((h) => h.toLowerCase());
  const col = (name: string) => headers.findIndex((h) => h.includes(name));

  const iDate = col('date');
  const iMeal = col('meal');
  const iCalories = col('calories');
  const iProtein = col('protein');
  const iCarbs = col('carbohydrate') >= 0 ? col('carbohydrate') : col('carbs');
  const iFat = col('fat');
  const iFiber = col('fiber');

  if (iDate < 0 || iCalories < 0) return { entries: [], errors: ['Could not find Date or Calories columns'] };

  const entries: FoodEntry[] = [];
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = normalizeDate(r[iDate] || '');
    if (!date) { errors.push(`Row ${i + 1}: invalid date`); continue; }

    const meal = (r[iMeal] || 'snack').toLowerCase();
    const mealType: FoodEntry['mealType'] =
      meal.includes('breakfast') ? 'breakfast' :
      meal.includes('lunch') ? 'lunch' :
      meal.includes('dinner') ? 'dinner' : 'snack';

    entries.push({
      id: crypto.randomUUID(),
      date,
      profileId,
      name: `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} (MFP Import)`,
      servingSize: 1,
      servingUnit: 'meal',
      servingsConsumed: 1,
      calories: parseFloat(r[iCalories] || '0') || 0,
      protein: iProtein >= 0 ? parseFloat(r[iProtein] || '0') || 0 : 0,
      carbs: iCarbs >= 0 ? parseFloat(r[iCarbs] || '0') || 0 : 0,
      fat: iFat >= 0 ? parseFloat(r[iFat] || '0') || 0 : 0,
      fiber: iFiber >= 0 ? parseFloat(r[iFiber] || '0') || 0 : 0,
      source: 'manual',
      loggedAt: new Date().toISOString(),
      mealType,
    });
  }

  return { entries, errors };
}

// ── MacroFactor Import ──

function parseMacroFactorCSV(text: string, profileId: string): { entries: FoodEntry[]; errors: string[] } {
  const rows = parseCSV(text, ',');
  if (rows.length < 2) return { entries: [], errors: ['No data rows found'] };

  const headers = rows[0].map((h) => h.toLowerCase());
  const col = (name: string) => headers.findIndex((h) => h.includes(name));

  const iDate = col('date');
  const iCalories = col('calories');
  const iProtein = col('protein');
  const iCarbs = col('carbs');
  const iFat = col('fat');

  if (iDate < 0 || iCalories < 0) return { entries: [], errors: ['Could not find Date or Calories columns'] };

  const entries: FoodEntry[] = [];
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = normalizeDate(r[iDate] || '');
    if (!date) { errors.push(`Row ${i + 1}: invalid date`); continue; }

    const calories = parseFloat(r[iCalories] || '0') || 0;
    if (calories === 0) continue;

    entries.push({
      id: crypto.randomUUID(),
      date,
      profileId,
      name: 'Daily Total (MacroFactor Import)',
      servingSize: 1,
      servingUnit: 'day',
      servingsConsumed: 1,
      calories,
      protein: iProtein >= 0 ? parseFloat(r[iProtein] || '0') || 0 : 0,
      carbs: iCarbs >= 0 ? parseFloat(r[iCarbs] || '0') || 0 : 0,
      fat: iFat >= 0 ? parseFloat(r[iFat] || '0') || 0 : 0,
      source: 'manual',
      loggedAt: new Date().toISOString(),
      mealType: 'snack',
    });
  }

  return { entries, errors };
}

// ── Helpers ──

function normalizeDate(raw: string): string | null {
  // Handle YYYY-MM-DD
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // Handle MM/DD/YYYY or M/D/YYYY
  const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;

  // Handle DD Mon YYYY
  const months: Record<string, string> = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
  const dmyMatch = raw.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})/);
  if (dmyMatch && months[dmyMatch[2].toLowerCase()]) {
    return `${dmyMatch[3]}-${months[dmyMatch[2].toLowerCase()]}-${dmyMatch[1].padStart(2, '0')}`;
  }

  // Try Date constructor as fallback
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];

  return null;
}

function normalizeHevyDate(raw: string): string | null {
  // "28 Mar 2025, 17:29"
  const months: Record<string, string> = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
  const match = raw.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})/);
  if (match && months[match[2].toLowerCase()]) {
    return `${match[3]}-${months[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`;
  }
  return normalizeDate(raw);
}

function computeDuration(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return '';
  const mins = Math.round((e.getTime() - s.getTime()) / 60000);
  if (mins <= 0) return '';
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

function buildSessions(
  sessionMap: Map<string, { exercises: Map<string, SetLog[]>; date: string; duration: string; notes: string }>,
  profileId: string,
): WorkoutSession[] {
  const sessions: WorkoutSession[] = [];
  for (const [, data] of sessionMap) {
    const sets: Record<string, SetLog[]> = {};
    for (const [exerciseName, setLogs] of data.exercises) {
      const exId = `import-${exerciseName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      sets[exId] = setLogs.map((s, i) => ({ ...s, timestamp: i }));
    }
    sessions.push({
      id: crypto.randomUUID(),
      profileId,
      programId: 'imported',
      dayId: 'imported',
      date: data.date,
      startTime: new Date(data.date + 'T12:00:00').getTime(),
      endTime: new Date(data.date + 'T13:00:00').getTime(),
      sets,
      notes: data.notes || undefined,
    });
  }
  return sessions;
}

// ── Main Import Function ──

export async function importCSV(text: string, profileId: string): Promise<ImportResult> {
  const { source, type } = detectSource(text);

  if (source === 'unknown') {
    return { source, type, count: 0, dateRange: null, skipped: 0, errors: ['Could not detect the CSV format. Supported: Strong, Hevy, FitNotes, MyFitnessPal, MacroFactor.'] };
  }

  const db = await getDB();

  if (type === 'workouts') {
    let result: { sessions: WorkoutSession[]; errors: string[] };
    if (source === 'strong') result = parseStrongCSV(text, profileId);
    else if (source === 'hevy') result = parseHevyCSV(text, profileId);
    else result = parseFitNotesCSV(text, profileId);

    // Check for existing sessions on the same dates to avoid duplicates
    const existingSessions = await db.getAllFromIndex('workoutSessions', 'by-profile', profileId);
    const existingDates = new Set(existingSessions.map((s) => s.date));
    const newSessions = result.sessions.filter((s) => !existingDates.has(s.date));
    const skipped = result.sessions.length - newSessions.length;

    for (const session of newSessions) {
      await db.put('workoutSessions', session);
    }

    const dates = newSessions.map((s) => s.date).sort();
    return {
      source,
      type,
      count: newSessions.length,
      dateRange: dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : null,
      skipped,
      errors: result.errors.slice(0, 5),
    };
  } else {
    let result: { entries: FoodEntry[]; errors: string[] };
    if (source === 'myfitnesspal') result = parseMFPCSV(text, profileId);
    else result = parseMacroFactorCSV(text, profileId);

    // Check for existing entries on the same dates
    const existingEntries: FoodEntry[] = await db.getAllFromIndex('foodEntries', 'by-profile', profileId);
    const existingKeys = new Set(existingEntries.map((e) => `${e.date}_${e.mealType}_${e.name}`));
    const newEntries = result.entries.filter((e) => !existingKeys.has(`${e.date}_${e.mealType}_${e.name}`));
    const skipped = result.entries.length - newEntries.length;

    for (const entry of newEntries) {
      await db.put('foodEntries', entry);
    }

    const dates = newEntries.map((e) => e.date).sort();
    return {
      source,
      type,
      count: newEntries.length,
      dateRange: dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : null,
      skipped,
      errors: result.errors.slice(0, 5),
    };
  }
}

const SOURCE_LABELS: Record<ImportSource, string> = {
  strong: 'Strong',
  hevy: 'Hevy',
  fitnotes: 'FitNotes',
  myfitnesspal: 'MyFitnessPal',
  macrofactor: 'MacroFactor',
  unknown: 'Unknown',
};

export function getSourceLabel(source: ImportSource): string {
  return SOURCE_LABELS[source];
}
