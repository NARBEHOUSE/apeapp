import { getDB } from '../db';
import { saveFoodToHistory } from '../db/foodHistory';
import { saveRecipe, getRecipes } from '../db/recipes';
import type { WorkoutSession, SetLog, FoodEntry, Measurement, StepEntry } from '../types';

export type ImportSource = 'strong' | 'hevy' | 'fitnotes' | 'myfitnesspal' | 'macrofactor' | 'unknown';
export type ImportType = 'workouts' | 'nutrition' | 'measurements' | 'steps' | 'recipes' | 'foods' | 'skipped';

export interface ImportResult {
  source: ImportSource;
  type: ImportType;
  count: number;
  dateRange: { from: string; to: string } | null;
  skipped: number;
  errors: string[];
  details?: string;
}

// ── CSV Parser ──

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

// ── Detection ──

type MFSheet = 'mf_main' | 'mf_scale_weight' | 'mf_body_metrics' | 'mf_steps' | 'mf_micronutrients'
  | 'mf_custom_foods' | 'mf_favorites' | 'mf_history' | 'mf_recipes' | 'mf_workouts'
  | 'mf_food_log_notes' | 'mf_workout_log_notes' | 'mf_weight_trend' | 'mf_muscle_groups' | 'mf_partial_logging';

function detectMFSheet(firstLine: string): MFSheet | null {
  const h = firstLine.toLowerCase();
  if (h.includes('trend weight')) return 'mf_weight_trend';
  if (h.includes('weight') && h.includes('fat percent')) return 'mf_scale_weight';
  if (h.includes('bust') || (h.includes('left bicep') && h.includes('waist'))) return 'mf_body_metrics';
  if (/^date,steps\s*$/.test(h)) return 'mf_steps';
  if (h.includes('alcohol') && h.includes('b12') || h.includes('cobalamin')) return 'mf_micronutrients';
  if (h.includes('recipe name') && h.includes('ingredients')) return 'mf_recipes';
  if (h.includes('food log notes')) return 'mf_food_log_notes';
  if (h.includes('workout log notes')) return 'mf_workout_log_notes';
  if (h.includes('exercise') && h.includes('set 1 type')) return 'mf_workouts';
  if (h.includes('muscle') || (h.includes('chest (sets)') || h.includes('chest (lbs)'))) return 'mf_muscle_groups';
  if (h.includes('partial')) return 'mf_partial_logging';
  if (h.includes('food name') && h.includes('serving size') && h.includes('serving qty')) return 'mf_custom_foods';
  if (h.match(/^food name\s*$/) || (h.includes('food name') && h.split(',').length <= 2)) return 'mf_history';
  if (h.includes('calories (kcal)')) return 'mf_main';
  return null;
}

export function detectSource(text: string): { source: ImportSource; type: ImportType; mfSheet?: MFSheet } {
  const firstLine = text.split(/\r?\n/)[0];
  const h = firstLine.toLowerCase();

  // Check MF sheets first
  const mfSheet = detectMFSheet(h);
  if (mfSheet) {
    const typeMap: Record<MFSheet, ImportType> = {
      mf_main: 'nutrition', mf_scale_weight: 'measurements', mf_body_metrics: 'measurements',
      mf_steps: 'steps', mf_micronutrients: 'nutrition', mf_custom_foods: 'foods',
      mf_favorites: 'foods', mf_history: 'foods', mf_recipes: 'recipes', mf_workouts: 'workouts',
      mf_food_log_notes: 'skipped', mf_workout_log_notes: 'skipped',
      mf_weight_trend: 'skipped', mf_muscle_groups: 'skipped', mf_partial_logging: 'skipped',
    };
    return { source: 'macrofactor', type: typeMap[mfSheet], mfSheet };
  }

  // Strong uses semicolons
  if (h.includes(';') && h.includes('exercise name') && h.includes('set order')) {
    return { source: 'strong', type: 'workouts' };
  }
  // Hevy
  if (h.includes('exercise_title') && h.includes('set_index')) {
    return { source: 'hevy', type: 'workouts' };
  }
  // FitNotes
  if (h.includes('exercise') && h.includes('category') && h.includes('weight (')) {
    return { source: 'fitnotes', type: 'workouts' };
  }
  // MyFitnessPal
  if (h.includes('meal') && (h.includes('calories') || h.includes('fat'))) {
    return { source: 'myfitnesspal', type: 'nutrition' };
  }
  // Generic nutrition
  if (h.includes('date') && h.includes('calories') && (h.includes('protein') || h.includes('fat')) && !h.includes('exercise') && !h.includes('reps')) {
    return { source: 'macrofactor', type: 'nutrition', mfSheet: 'mf_main' };
  }

  return { source: 'unknown', type: 'workouts' };
}

// ── Strong Import ──

function parseStrongCSV(text: string, profileId: string): { sessions: WorkoutSession[]; errors: string[] } {
  const rows = parseCSV(text, ';');
  if (rows.length < 2) return { sessions: [], errors: ['No data rows found'] };
  const headers = rows[0].map((h) => h.toLowerCase());
  const col = (name: string) => headers.findIndex((h) => h.includes(name));
  const iDate = col('date'), iExercise = col('exercise name'), iWeight = col('weight'), iReps = col('reps'), iDuration = col('duration'), iNotes = col('notes');
  if (iDate < 0 || iExercise < 0) return { sessions: [], errors: ['Could not find Date or Exercise Name columns'] };

  const sessionMap = new Map<string, { exercises: Map<string, SetLog[]>; date: string; duration: string; notes: string }>();
  const errors: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = normalizeDate(r[iDate] || '');
    if (!date) { errors.push(`Row ${i + 1}: invalid date`); continue; }
    const exercise = r[iExercise] || '';
    if (!exercise) continue;
    const key = `${date}_${r[iDuration] || ''}`;
    if (!sessionMap.has(key)) sessionMap.set(key, { exercises: new Map(), date, duration: r[iDuration] || '', notes: '' });
    const session = sessionMap.get(key)!;
    const setLog: SetLog = { weight: parseFloat(r[iWeight] || '0') || 0, reps: parseInt(r[iReps] || '0') || 0, completed: true, timestamp: 0 };
    if (!session.exercises.has(exercise)) session.exercises.set(exercise, []);
    session.exercises.get(exercise)!.push(setLog);
    if (iNotes >= 0 && r[iNotes] && !session.notes) session.notes = r[iNotes];
  }
  return { sessions: buildSessions(sessionMap, profileId), errors };
}

// ── Hevy Import ──

function parseHevyCSV(text: string, profileId: string): { sessions: WorkoutSession[]; errors: string[] } {
  const rows = parseCSV(text, ',');
  if (rows.length < 2) return { sessions: [], errors: ['No data rows found'] };
  const headers = rows[0].map((h) => h.toLowerCase());
  const col = (name: string) => headers.findIndex((h) => h === name);
  const iStart = col('start_time'), iEnd = col('end_time'), iExercise = col('exercise_title'), iWeight = col('weight_lbs'), iReps = col('reps'), iSetType = col('set_type');
  if (iExercise < 0) return { sessions: [], errors: ['Could not find exercise_title column'] };

  const sessionMap = new Map<string, { exercises: Map<string, SetLog[]>; date: string; duration: string; notes: string }>();
  const errors: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = normalizeHevyDate(r[iStart] || '');
    if (!date) { errors.push(`Row ${i + 1}: invalid date`); continue; }
    const exercise = r[iExercise] || '';
    if (!exercise) continue;
    if ((r[iSetType] || 'normal') === 'warmup') continue;
    const key = `${date}_${r[iStart] || ''}`;
    if (!sessionMap.has(key)) sessionMap.set(key, { exercises: new Map(), date, duration: computeDuration(r[iStart] || '', r[iEnd] || ''), notes: '' });
    const session = sessionMap.get(key)!;
    const setLog: SetLog = { weight: parseFloat(r[iWeight] || '0') || 0, reps: parseInt(r[iReps] || '0') || 0, completed: true, timestamp: 0 };
    if (!session.exercises.has(exercise)) session.exercises.set(exercise, []);
    session.exercises.get(exercise)!.push(setLog);
  }
  return { sessions: buildSessions(sessionMap, profileId), errors };
}

// ── FitNotes Import ──

function parseFitNotesCSV(text: string, profileId: string): { sessions: WorkoutSession[]; errors: string[] } {
  const rows = parseCSV(text, ',');
  if (rows.length < 2) return { sessions: [], errors: ['No data rows found'] };
  const headers = rows[0].map((h) => h.toLowerCase());
  const col = (name: string) => headers.findIndex((h) => h.includes(name));
  const iDate = col('date'), iExercise = col('exercise');
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
    if (!sessionMap.has(date)) sessionMap.set(date, { exercises: new Map(), date, duration: '', notes: '' });
    const session = sessionMap.get(date)!;
    let weight = 0;
    if (iWeightLbs >= 0 && r[iWeightLbs]) weight = parseFloat(r[iWeightLbs]) || 0;
    else if (iWeightKg >= 0 && r[iWeightKg]) weight = Math.round((parseFloat(r[iWeightKg]) || 0) * 2.20462 * 10) / 10;
    const setLog: SetLog = { weight, reps: parseInt(r[iReps] || '0') || 0, completed: true, timestamp: 0 };
    if (!session.exercises.has(exercise)) session.exercises.set(exercise, []);
    session.exercises.get(exercise)!.push(setLog);
  }
  return { sessions: buildSessions(sessionMap, profileId), errors };
}

// ── MyFitnessPal Import ──

function parseMFPCSV(text: string, profileId: string): { entries: FoodEntry[]; errors: string[] } {
  const rows = parseCSV(text, ',');
  if (rows.length < 2) return { entries: [], errors: ['No data rows found'] };
  const headers = rows[0].map((h) => h.toLowerCase());
  const col = (name: string) => headers.findIndex((h) => h.includes(name));
  const iDate = col('date'), iMeal = col('meal'), iCalories = col('calories'), iProtein = col('protein');
  const iCarbs = col('carbohydrate') >= 0 ? col('carbohydrate') : col('carbs');
  const iFat = col('fat'), iFiber = col('fiber');
  if (iDate < 0 || iCalories < 0) return { entries: [], errors: ['Could not find Date or Calories columns'] };

  const entries: FoodEntry[] = [];
  const errors: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = normalizeDate(r[iDate] || '');
    if (!date) { errors.push(`Row ${i + 1}: invalid date`); continue; }
    const meal = (r[iMeal] || 'snack').toLowerCase();
    const mealType: FoodEntry['mealType'] = meal.includes('breakfast') ? 'breakfast' : meal.includes('lunch') ? 'lunch' : meal.includes('dinner') ? 'dinner' : 'snack';
    entries.push({
      id: crypto.randomUUID(), date, profileId,
      name: `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} (MFP Import)`,
      servingSize: 1, servingUnit: 'meal', servingsConsumed: 1,
      calories: parseFloat(r[iCalories] || '0') || 0,
      protein: iProtein >= 0 ? parseFloat(r[iProtein] || '0') || 0 : 0,
      carbs: iCarbs >= 0 ? parseFloat(r[iCarbs] || '0') || 0 : 0,
      fat: iFat >= 0 ? parseFloat(r[iFat] || '0') || 0 : 0,
      fiber: iFiber >= 0 ? parseFloat(r[iFiber] || '0') || 0 : 0,
      source: 'manual', loggedAt: new Date().toISOString(), mealType,
    });
  }
  return { entries, errors };
}

// ── MacroFactor: Main (daily macros) ──

function parseMFMain(text: string, profileId: string): { entries: FoodEntry[]; errors: string[] } {
  const rows = parseCSV(text, ',');
  if (rows.length < 2) return { entries: [], errors: ['No data rows found'] };
  const headers = rows[0].map((h) => h.toLowerCase());
  const col = (name: string) => headers.findIndex((h) => h.includes(name));
  const iDate = col('date'), iCalories = col('calories'), iProtein = col('protein'), iCarbs = col('carbs'), iFat = col('fat');
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
      id: crypto.randomUUID(), date, profileId,
      name: 'Daily Total (MacroFactor Import)', servingSize: 1, servingUnit: 'day', servingsConsumed: 1,
      calories,
      protein: iProtein >= 0 ? parseFloat(r[iProtein] || '0') || 0 : 0,
      carbs: iCarbs >= 0 ? parseFloat(r[iCarbs] || '0') || 0 : 0,
      fat: iFat >= 0 ? parseFloat(r[iFat] || '0') || 0 : 0,
      source: 'manual', loggedAt: new Date().toISOString(), mealType: 'snack',
    });
  }
  return { entries, errors };
}

// ── MacroFactor: Scale Weight ──

function parseMFScaleWeight(text: string, profileId: string): { measurements: Measurement[]; errors: string[] } {
  const rows = parseCSV(text, ',');
  if (rows.length < 2) return { measurements: [], errors: ['No data rows found'] };
  const headers = rows[0].map((h) => h.toLowerCase());
  const col = (name: string) => headers.findIndex((h) => h.includes(name));
  const iDate = col('date'), iWeight = col('weight'), iFat = col('fat percent');
  if (iDate < 0 || iWeight < 0) return { measurements: [], errors: ['Could not find Date or Weight columns'] };

  const measurements: Measurement[] = [];
  const errors: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = normalizeDate(r[iDate] || '');
    if (!date) { errors.push(`Row ${i + 1}: invalid date`); continue; }
    const weight = parseFloat(r[iWeight] || '');
    if (isNaN(weight)) continue;
    const fatPct = iFat >= 0 ? parseFloat(r[iFat] || '') : NaN;
    measurements.push({
      id: crypto.randomUUID(), profileId, date, weight, weightUnit: 'lbs',
      bodyFatPercent: isNaN(fatPct) ? undefined : fatPct,
      bodyFatSource: isNaN(fatPct) ? undefined : 'scale',
    });
  }
  return { measurements, errors };
}

// ── MacroFactor: Body Metrics ──

const MF_BODY_MAP: Record<string, keyof NonNullable<Measurement['measurements']>> = {
  'bust': 'bust', 'chest': 'chest', 'hips': 'hips', 'waist': 'waist',
  'left ankle': 'leftAnkle', 'left bicep': 'leftBicep', 'left calf': 'leftCalf',
  'left forearm': 'leftForearm', 'left thigh': 'leftThigh', 'left wrist': 'leftWrist',
  'neck': 'neck', 'right ankle': 'rightAnkle', 'right bicep': 'rightBicep',
  'right calf': 'rightCalf', 'right forearm': 'rightForearm', 'right thigh': 'rightThigh',
  'right wrist': 'rightWrist', 'shoulders': 'shoulders',
};

function parseMFBodyMetrics(text: string, profileId: string): { measurements: Measurement[]; errors: string[] } {
  const rows = parseCSV(text, ',');
  if (rows.length < 2) return { measurements: [], errors: ['No data rows found'] };
  const headers = rows[0].map((h) => h.toLowerCase());
  const iDate = headers.findIndex((h) => h.includes('date'));
  if (iDate < 0) return { measurements: [], errors: ['Could not find Date column'] };

  const colMap: { idx: number; field: keyof NonNullable<Measurement['measurements']> }[] = [];
  let iVisualBF = -1;
  for (let c = 0; c < headers.length; c++) {
    if (c === iDate) continue;
    const h = headers[c];
    if (h.includes('visual body fat')) { iVisualBF = c; continue; }
    for (const [keyword, field] of Object.entries(MF_BODY_MAP)) {
      if (h.includes(keyword)) { colMap.push({ idx: c, field }); break; }
    }
  }

  const measurements: Measurement[] = [];
  const errors: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = normalizeDate(r[iDate] || '');
    if (!date) { errors.push(`Row ${i + 1}: invalid date`); continue; }
    const bodyM: Measurement['measurements'] = {};
    let hasAny = false;
    for (const { idx, field } of colMap) {
      const val = parseFloat(r[idx] || '');
      if (!isNaN(val) && val > 0) { bodyM[field] = val; hasAny = true; }
    }
    const visualBF = iVisualBF >= 0 ? parseFloat(r[iVisualBF] || '') : NaN;
    if (!hasAny && isNaN(visualBF)) continue;
    measurements.push({
      id: crypto.randomUUID(), profileId, date, weightUnit: 'lbs',
      bodyFatPercent: isNaN(visualBF) ? undefined : visualBF,
      bodyFatSource: isNaN(visualBF) ? undefined : 'visual',
      measurements: hasAny ? bodyM : undefined,
    });
  }
  return { measurements, errors };
}

// ── MacroFactor: Steps ──

function parseMFSteps(text: string, profileId: string): { steps: StepEntry[]; errors: string[] } {
  const rows = parseCSV(text, ',');
  if (rows.length < 2) return { steps: [], errors: ['No data rows found'] };
  const headers = rows[0].map((h) => h.toLowerCase());
  const iDate = headers.findIndex((h) => h.includes('date'));
  const iSteps = headers.findIndex((h) => h.includes('steps'));
  if (iDate < 0 || iSteps < 0) return { steps: [], errors: ['Could not find Date or Steps columns'] };

  const steps: StepEntry[] = [];
  const errors: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = normalizeDate(r[iDate] || '');
    if (!date) { errors.push(`Row ${i + 1}: invalid date`); continue; }
    const count = parseInt(r[iSteps] || '0') || 0;
    if (count === 0) continue;
    steps.push({ id: crypto.randomUUID(), profileId, date, steps: count, source: 'macrofactor' });
  }
  return { steps, errors };
}

// ── MacroFactor: Micronutrients ──

function parseMFMicronutrients(text: string, profileId: string): { micros: Map<string, Record<string, number>>; errors: string[] } {
  const rows = parseCSV(text, ',');
  if (rows.length < 2) return { micros: new Map(), errors: ['No data rows found'] };
  const headers = rows[0];
  const headersLower = headers.map((h) => h.toLowerCase());
  const iDate = headersLower.findIndex((h) => h.includes('date'));
  if (iDate < 0) return { micros: new Map(), errors: ['Could not find Date column'] };

  const micros = new Map<string, Record<string, number>>();
  const errors: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const date = normalizeDate(r[iDate] || '');
    if (!date) continue;
    const record: Record<string, number> = {};
    let hasAny = false;
    for (let c = 0; c < headers.length; c++) {
      if (c === iDate) continue;
      const val = parseFloat(r[c] || '');
      if (!isNaN(val) && val > 0) { record[headers[c]] = val; hasAny = true; }
    }
    if (hasAny) micros.set(date, record);
  }
  return { micros, errors };
}

// ── MacroFactor: Custom Foods / Favorites ──

function parseMFFoodLibrary(text: string, profileId: string): { count: number; errors: string[] } {
  const rows = parseCSV(text, ',');
  if (rows.length < 2) return { count: 0, errors: ['No data rows found'] };
  const headers = rows[0].map((h) => h.toLowerCase());
  const col = (name: string) => headers.findIndex((h) => h.includes(name));
  const iName = col('food name'), iServSize = col('serving size'), iServQty = col('serving qty');
  const iCal = col('calories'), iProt = col('protein'), iCarbs = col('carbs'), iFat = col('fat');
  const iServWeight = col('serving weight');
  if (iName < 0) return { count: 0, errors: ['Could not find Food Name column'] };

  let count = 0;
  const errors: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = r[iName]?.trim();
    if (!name) continue;
    const cal = iCal >= 0 ? parseFloat(r[iCal] || '0') || 0 : 0;
    const prot = iProt >= 0 ? parseFloat(r[iProt] || '0') || 0 : 0;
    const carbs = iCarbs >= 0 ? parseFloat(r[iCarbs] || '0') || 0 : 0;
    const fat = iFat >= 0 ? parseFloat(r[iFat] || '0') || 0 : 0;
    const servSize = iServWeight >= 0 ? parseFloat(r[iServWeight] || '0') || 1 : 1;
    const servUnit = iServSize >= 0 && r[iServSize] ? r[iServSize] : 'serving';
    saveFoodToHistory(profileId, {
      name, calories: cal, protein: prot, carbs, fat,
      servingSize: servSize, servingUnit: servUnit, source: 'manual',
    });
    count++;
  }
  return { count, errors };
}

// ── MacroFactor: History (food names only) ──

function parseMFHistory(text: string, profileId: string): { count: number; errors: string[] } {
  const rows = parseCSV(text, ',');
  if (rows.length < 2) return { count: 0, errors: ['No data rows found'] };
  let count = 0;
  for (let i = 1; i < rows.length; i++) {
    const name = rows[i][0]?.trim();
    if (!name) continue;
    saveFoodToHistory(profileId, {
      name, calories: 0, protein: 0, carbs: 0, fat: 0,
      servingSize: 1, servingUnit: 'serving', source: 'manual',
    });
    count++;
  }
  return { count, errors: [] };
}

// ── MacroFactor: Recipes ──

function parseMFRecipes(text: string, profileId: string): { count: number; errors: string[] } {
  const rows = parseCSV(text, ',');
  if (rows.length < 2) return { count: 0, errors: ['No data rows found'] };
  const headers = rows[0].map((h) => h.toLowerCase());
  const col = (name: string) => headers.findIndex((h) => h.includes(name));
  const iName = col('recipe name'), iServQty = col('serving qty'), iIngredients = col('ingredients');
  const iPrepTime = col('preparation time'), iCookTime = col('cooking time'), iDesc = col('description');
  const iCal = col('calories'), iProt = col('protein'), iFat = col('fat'), iCarbs = col('carbs'), iFiber = col('fiber');
  const stepCols = [0,1,2,3,4].map((n) => headers.findIndex((h) => h === `step ${n + 1}`));
  if (iName < 0) return { count: 0, errors: ['Could not find Recipe Name column'] };

  const existing = new Set(getRecipes(profileId).map((r) => r.name.toLowerCase()));
  let count = 0;
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = r[iName]?.trim();
    if (!name || existing.has(name.toLowerCase())) continue;

    const ingredientText = iIngredients >= 0 ? r[iIngredients] || '' : '';
    const ingredients = ingredientText.split('\n').filter((l) => l.trim()).map((line) => {
      const match = line.match(/^(.+?)\s*\((.+)\)$/);
      return {
        name: match ? match[1].trim() : line.trim(),
        amount: 1, unit: match ? match[2].trim() : 'serving',
        calories: 0, protein: 0, carbs: 0, fat: 0,
      };
    });

    const steps = stepCols.map((c) => c >= 0 ? (r[c] || '').trim() : '').filter(Boolean);

    saveRecipe(profileId, {
      name, emoji: '🍽️',
      description: iDesc >= 0 ? (r[iDesc] || '').trim() : '',
      servings: iServQty >= 0 ? parseInt(r[iServQty] || '1') || 1 : 1,
      prepTime: iPrepTime >= 0 ? parseInt(r[iPrepTime] || '0') || undefined : undefined,
      cookTime: iCookTime >= 0 ? parseInt(r[iCookTime] || '0') || undefined : undefined,
      ingredients, steps,
      tags: [],
      totalCalories: iCal >= 0 ? parseFloat(r[iCal] || '0') || 0 : 0,
      totalProtein: iProt >= 0 ? parseFloat(r[iProt] || '0') || 0 : 0,
      totalCarbs: iCarbs >= 0 ? parseFloat(r[iCarbs] || '0') || 0 : 0,
      totalFat: iFat >= 0 ? parseFloat(r[iFat] || '0') || 0 : 0,
      totalFiber: iFiber >= 0 ? parseFloat(r[iFiber] || '0') || 0 : 0,
    });
    existing.add(name.toLowerCase());
    count++;
  }
  return { count, errors };
}

// ── MacroFactor: Workouts ──

function parseMFWorkouts(text: string, profileId: string): { sessions: WorkoutSession[]; errors: string[] } {
  const rows = parseCSV(text, ',');
  if (rows.length < 2) return { sessions: [], errors: ['No data rows found'] };
  const headers = rows[0].map((h) => h.toLowerCase());
  const iExercise = headers.findIndex((h) => h === 'exercise');
  if (iExercise < 0) return { sessions: [], errors: ['Could not find Exercise column'] };

  // Detect set columns: "set N type", "set N weight", "set N reps"
  const setCount = headers.filter((h) => /^set \d+ type$/.test(h)).length;
  if (setCount === 0) return { sessions: [], errors: ['No set columns found'] };

  const sessionMap = new Map<string, { exercises: Map<string, SetLog[]>; date: string; duration: string; notes: string }>();
  const errors: string[] = [];
  let currentDate = '';

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    // First column might be a date for the workout group
    const maybeDate = normalizeDate(r[0] || '');
    if (maybeDate) currentDate = maybeDate;
    if (!currentDate) continue;

    const exercise = r[iExercise]?.trim();
    if (!exercise) continue;

    if (!sessionMap.has(currentDate)) {
      sessionMap.set(currentDate, { exercises: new Map(), date: currentDate, duration: '', notes: '' });
    }
    const session = sessionMap.get(currentDate)!;

    const setLogs: SetLog[] = [];
    for (let s = 1; s <= setCount; s++) {
      const weightIdx = headers.findIndex((h) => h === `set ${s} weight`);
      const repsIdx = headers.findIndex((h) => h === `set ${s} reps`);
      if (weightIdx < 0 && repsIdx < 0) continue;
      const w = weightIdx >= 0 ? parseFloat(r[weightIdx] || '0') || 0 : 0;
      const rp = repsIdx >= 0 ? parseInt(r[repsIdx] || '0') || 0 : 0;
      if (w > 0 || rp > 0) setLogs.push({ weight: w, reps: rp, completed: true, timestamp: s });
    }

    if (setLogs.length > 0) {
      if (!session.exercises.has(exercise)) session.exercises.set(exercise, []);
      session.exercises.get(exercise)!.push(...setLogs);
    }
  }

  return { sessions: buildSessions(sessionMap, profileId), errors };
}

// ── Helpers ──

function normalizeDate(raw: string): string | null {
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
  const months: Record<string, string> = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
  const dmyMatch = raw.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})/);
  if (dmyMatch && months[dmyMatch[2].toLowerCase()]) return `${dmyMatch[3]}-${months[dmyMatch[2].toLowerCase()]}-${dmyMatch[1].padStart(2, '0')}`;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return null;
}

function normalizeHevyDate(raw: string): string | null {
  const months: Record<string, string> = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
  const match = raw.match(/^(\d{1,2})\s+(\w{3})\s+(\d{4})/);
  if (match && months[match[2].toLowerCase()]) return `${match[3]}-${months[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`;
  return normalizeDate(raw);
}

function computeDuration(start: string, end: string): string {
  const s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return '';
  const mins = Math.round((e.getTime() - s.getTime()) / 60000);
  return mins <= 0 ? '' : mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
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
      id: crypto.randomUUID(), profileId, programId: 'imported', dayId: 'imported',
      date: data.date, startTime: new Date(data.date + 'T12:00:00').getTime(),
      endTime: new Date(data.date + 'T13:00:00').getTime(), sets, notes: data.notes || undefined,
    });
  }
  return sessions;
}

function dateRange(dates: string[]): { from: string; to: string } | null {
  if (dates.length === 0) return null;
  const sorted = dates.sort();
  return { from: sorted[0], to: sorted[sorted.length - 1] };
}

// ── Main Import Function ──

export async function importCSV(text: string, profileId: string): Promise<ImportResult> {
  const { source, type, mfSheet } = detectSource(text);

  if (source === 'unknown') {
    return { source, type, count: 0, dateRange: null, skipped: 0, errors: ['Could not detect the CSV format. Supported: Strong, Hevy, FitNotes, MyFitnessPal, MacroFactor.'] };
  }

  // Skipped MF sheets
  if (type === 'skipped') {
    const labels: Record<string, string> = {
      mf_weight_trend: 'Weight Trend (derived data)', mf_muscle_groups: 'Muscle Groups (derived data)',
      mf_partial_logging: 'Partial Logging (metadata)', mf_food_log_notes: 'Food Log Notes',
      mf_workout_log_notes: 'Workout Log Notes',
    };
    return { source, type: 'skipped', count: 0, dateRange: null, skipped: 0, errors: [],
      details: `Skipped: ${labels[mfSheet || ''] || 'derived data'} — not needed for import` };
  }

  const db = await getDB();

  // ── MF: Scale Weight ──
  if (mfSheet === 'mf_scale_weight') {
    const result = parseMFScaleWeight(text, profileId);
    const existing = await db.getAllFromIndex('measurements', 'by-profile', profileId);
    const existingDates = new Set(existing.map((m) => m.date));
    let imported = 0, skipped = 0;
    for (const m of result.measurements) {
      if (existingDates.has(m.date)) {
        // Merge into existing measurement
        const ex = existing.find((e) => e.date === m.date)!;
        const merged = { ...ex, weight: m.weight ?? ex.weight, weightUnit: m.weightUnit };
        if (m.bodyFatPercent != null) { merged.bodyFatPercent = m.bodyFatPercent; merged.bodyFatSource = m.bodyFatSource; }
        await db.put('measurements', merged);
        imported++;
      } else {
        await db.put('measurements', m);
        imported++;
      }
    }
    return { source, type: 'measurements', count: imported, dateRange: dateRange(result.measurements.map((m) => m.date)), skipped, errors: result.errors.slice(0, 5), details: 'Scale weight & body fat %' };
  }

  // ── MF: Body Metrics ──
  if (mfSheet === 'mf_body_metrics') {
    const result = parseMFBodyMetrics(text, profileId);
    const existing = await db.getAllFromIndex('measurements', 'by-profile', profileId);
    const existingByDate = new Map(existing.map((m) => [m.date, m]));
    let imported = 0;
    for (const m of result.measurements) {
      const ex = existingByDate.get(m.date);
      if (ex) {
        const merged = { ...ex, measurements: { ...ex.measurements, ...m.measurements } };
        if (m.bodyFatPercent != null) { merged.bodyFatPercent = m.bodyFatPercent; merged.bodyFatSource = m.bodyFatSource; }
        await db.put('measurements', merged);
      } else {
        await db.put('measurements', m);
      }
      imported++;
    }
    return { source, type: 'measurements', count: imported, dateRange: dateRange(result.measurements.map((m) => m.date)), skipped: 0, errors: result.errors.slice(0, 5), details: 'Body measurements' };
  }

  // ── MF: Steps ──
  if (mfSheet === 'mf_steps') {
    const result = parseMFSteps(text, profileId);
    const existing = await db.getAllFromIndex('steps', 'by-profile', profileId);
    const existingDates = new Set(existing.map((s) => s.date));
    const newSteps = result.steps.filter((s) => !existingDates.has(s.date));
    const skipped = result.steps.length - newSteps.length;
    for (const step of newSteps) await db.put('steps', step);
    return { source, type: 'steps', count: newSteps.length, dateRange: dateRange(newSteps.map((s) => s.date)), skipped, errors: result.errors.slice(0, 5) };
  }

  // ── MF: Micronutrients ──
  if (mfSheet === 'mf_micronutrients') {
    const result = parseMFMicronutrients(text, profileId);
    const allFood: FoodEntry[] = await db.getAllFromIndex('foodEntries', 'by-profile', profileId);
    let merged = 0;
    for (const [date, micros] of result.micros) {
      const entry = allFood.find((e) => e.date === date);
      if (entry) {
        await db.put('foodEntries', { ...entry, micronutrients: micros });
        merged++;
      }
    }
    return { source, type: 'nutrition', count: merged, dateRange: null, skipped: result.micros.size - merged, errors: result.errors.slice(0, 5), details: `Micronutrients merged onto ${merged} food entries` };
  }

  // ── MF: Custom Foods / Favorites / History ──
  if (mfSheet === 'mf_custom_foods' || mfSheet === 'mf_favorites') {
    const result = parseMFFoodLibrary(text, profileId);
    return { source, type: 'foods', count: result.count, dateRange: null, skipped: 0, errors: result.errors.slice(0, 5), details: 'Added to food search library' };
  }
  if (mfSheet === 'mf_history') {
    const result = parseMFHistory(text, profileId);
    return { source, type: 'foods', count: result.count, dateRange: null, skipped: 0, errors: result.errors.slice(0, 5), details: 'Food names added to search library' };
  }

  // ── MF: Recipes ──
  if (mfSheet === 'mf_recipes') {
    const result = parseMFRecipes(text, profileId);
    return { source, type: 'recipes', count: result.count, dateRange: null, skipped: 0, errors: result.errors.slice(0, 5) };
  }

  // ── MF: Workouts ──
  if (mfSheet === 'mf_workouts') {
    const result = parseMFWorkouts(text, profileId);
    const existing = await db.getAllFromIndex('workoutSessions', 'by-profile', profileId);
    const existingDates = new Set(existing.map((s) => s.date));
    const newSessions = result.sessions.filter((s) => !existingDates.has(s.date));
    const skipped = result.sessions.length - newSessions.length;
    for (const session of newSessions) await db.put('workoutSessions', session);
    return { source, type: 'workouts', count: newSessions.length, dateRange: dateRange(newSessions.map((s) => s.date)), skipped, errors: result.errors.slice(0, 5) };
  }

  // ── MF: Main (daily macros) — also handles generic nutrition ──
  if (mfSheet === 'mf_main' || (source === 'macrofactor' && type === 'nutrition')) {
    const result = parseMFMain(text, profileId);
    const existing: FoodEntry[] = await db.getAllFromIndex('foodEntries', 'by-profile', profileId);
    const existingKeys = new Set(existing.map((e) => `${e.date}_${e.mealType}_${e.name}`));
    const newEntries = result.entries.filter((e) => !existingKeys.has(`${e.date}_${e.mealType}_${e.name}`));
    const skipped = result.entries.length - newEntries.length;
    for (const entry of newEntries) await db.put('foodEntries', entry);
    return { source, type: 'nutrition', count: newEntries.length, dateRange: dateRange(newEntries.map((e) => e.date)), skipped, errors: result.errors.slice(0, 5) };
  }

  // ── Non-MF: Workouts ──
  if (type === 'workouts') {
    let result: { sessions: WorkoutSession[]; errors: string[] };
    if (source === 'strong') result = parseStrongCSV(text, profileId);
    else if (source === 'hevy') result = parseHevyCSV(text, profileId);
    else result = parseFitNotesCSV(text, profileId);

    const existing = await db.getAllFromIndex('workoutSessions', 'by-profile', profileId);
    const existingDates = new Set(existing.map((s) => s.date));
    const newSessions = result.sessions.filter((s) => !existingDates.has(s.date));
    const skipped = result.sessions.length - newSessions.length;
    for (const session of newSessions) await db.put('workoutSessions', session);
    return { source, type, count: newSessions.length, dateRange: dateRange(newSessions.map((s) => s.date)), skipped, errors: result.errors.slice(0, 5) };
  }

  // ── Non-MF: Nutrition ──
  if (type === 'nutrition') {
    const result = parseMFPCSV(text, profileId);
    const existing: FoodEntry[] = await db.getAllFromIndex('foodEntries', 'by-profile', profileId);
    const existingKeys = new Set(existing.map((e) => `${e.date}_${e.mealType}_${e.name}`));
    const newEntries = result.entries.filter((e) => !existingKeys.has(`${e.date}_${e.mealType}_${e.name}`));
    const skipped = result.entries.length - newEntries.length;
    for (const entry of newEntries) await db.put('foodEntries', entry);
    return { source, type, count: newEntries.length, dateRange: dateRange(newEntries.map((e) => e.date)), skipped, errors: result.errors.slice(0, 5) };
  }

  return { source, type, count: 0, dateRange: null, skipped: 0, errors: ['Unhandled import type'] };
}

// ── XLSX Multi-Sheet Import ──

export async function importMacroFactorXLSX(buffer: ArrayBuffer, profileId: string): Promise<ImportResult[]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array' });
  const results: ImportResult[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (!csv.trim() || csv.split('\n').length < 2) continue;

    try {
      const result = await importCSV(csv, profileId);
      results.push({ ...result, details: result.details || sheetName });
    } catch {
      results.push({
        source: 'macrofactor', type: 'skipped', count: 0, dateRange: null,
        skipped: 0, errors: [`Failed to parse sheet: ${sheetName}`], details: sheetName,
      });
    }
  }

  return results;
}

const SOURCE_LABELS: Record<ImportSource, string> = {
  strong: 'Strong', hevy: 'Hevy', fitnotes: 'FitNotes',
  myfitnesspal: 'MyFitnessPal', macrofactor: 'MacroFactor', unknown: 'Unknown',
};

export function getSourceLabel(source: ImportSource): string {
  return SOURCE_LABELS[source];
}
