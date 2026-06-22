import type { WorkoutSession, FoodEntry, Measurement, Program, Profile, ProgressPhoto, CheckInEntry } from '../types';
import { DEFAULT_CHECKIN_QUESTIONS } from '../types';
import { getSessionsByProfile } from '../db/workouts';
import { getFoodEntriesByProfile } from '../db/nutrition';
import { getMeasurementsByProfile, getPhotosByProfile } from '../db/progress';
import { getAllPrograms } from '../db/programs';
import { getStepsByProfile } from '../db/steps';
import { getDB } from '../db';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type ReportPeriod = 'week' | 'month' | 'custom';

export interface ReportConfig {
  profileId: string;
  profile: Profile;
  startDate: string;
  endDate: string;
  period: ReportPeriod;
}

export interface DailyNutrition {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  entries: number;
}

export interface DailyWorkout {
  date: string;
  programName: string;
  dayTitle: string;
  duration: number;
  totalSets: number;
  totalVolume: number;
  bodyweight?: number;
  exercises: { name: string; sets: { weight: number; reps: number; rpe?: number; rir?: number }[] }[];
  cardio?: { type: string; durationMin: number; intensity?: string }[];
  notes?: string;
}

export interface ReportData {
  config: ReportConfig;
  nutrition: {
    dailyLog: DailyNutrition[];
    avgCalories: number;
    avgProtein: number;
    avgCarbs: number;
    avgFat: number;
    avgFiber: number;
    totalDaysLogged: number;
    calorieTarget: number;
    proteinTarget: number;
    daysOnTarget: number;
    daysOnProteinTarget: number;
  };
  workouts: {
    sessions: DailyWorkout[];
    totalSessions: number;
    totalVolume: number;
    avgSessionDuration: number;
    daysPerWeek: number;
  };
  bodyweight: {
    entries: { date: string; weight: number; bodyFat?: number }[];
    startWeight: number | null;
    endWeight: number | null;
    change: number | null;
    startBodyFat?: number;
    endBodyFat?: number;
  };
  measurements: {
    entries: { date: string; measurements: Record<string, number> }[];
  };
  steps: {
    entries: { date: string; steps: number }[];
    avgDailySteps: number;
    totalSteps: number;
  };
  checkIns: {
    entries: { date: string; responses: { questionId: string; value: number | string }[]; notes?: string }[];
    avgScores: Record<string, number>;
  };
  photos: {
    start: ProgressPhoto[];
    end: ProgressPhoto[];
    all: ProgressPhoto[];
  };
}

// ── Generate Report Data ──

export async function generateReport(config: ReportConfig): Promise<ReportData> {
  const { profileId, profile, startDate, endDate } = config;
  const db = await getDB();

  const [sessions, foodEntries, measurements, programs, photos, steps, checkInsRaw] = await Promise.all([
    getSessionsByProfile(profileId),
    getFoodEntriesByProfile(profileId),
    getMeasurementsByProfile(profileId),
    getAllPrograms(),
    getPhotosByProfile(profileId),
    getStepsByProfile(profileId),
    db.getAllFromIndex('checkIns', 'by-profile', profileId) as Promise<CheckInEntry[]>,
  ]);

  const filteredSessions = sessions.filter((s) => s.date >= startDate && s.date <= endDate);
  const filteredFood = foodEntries.filter((f) => f.date >= startDate && f.date <= endDate);
  const filteredMeasurements = measurements.filter((m) => m.date >= startDate && m.date <= endDate);
  const filteredPhotos = photos.filter((p) => p.date >= startDate && p.date <= endDate).sort((a, b) => a.date.localeCompare(b.date));
  const filteredSteps = steps.filter((s) => s.date >= startDate && s.date <= endDate).sort((a, b) => a.date.localeCompare(b.date));
  const filteredCheckIns = checkInsRaw.filter((c) => c.date >= startDate && c.date <= endDate).sort((a, b) => a.date.localeCompare(b.date));

  // Nutrition
  const nutritionByDate: Record<string, DailyNutrition> = {};
  for (const entry of filteredFood) {
    if (!nutritionByDate[entry.date]) {
      nutritionByDate[entry.date] = { date: entry.date, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, entries: 0 };
    }
    const d = nutritionByDate[entry.date];
    d.calories += entry.calories * entry.servingsConsumed;
    d.protein += entry.protein * entry.servingsConsumed;
    d.carbs += entry.carbs * entry.servingsConsumed;
    d.fat += entry.fat * entry.servingsConsumed;
    d.fiber += (entry.fiber || 0) * entry.servingsConsumed;
    d.entries++;
  }
  const dailyNutrition = Object.values(nutritionByDate).sort((a, b) => a.date.localeCompare(b.date));
  const daysLogged = dailyNutrition.length;
  const avg = (fn: (d: DailyNutrition) => number) => daysLogged > 0 ? dailyNutrition.reduce((s, d) => s + fn(d), 0) / daysLogged : 0;
  const calTarget = profile.macroTargets?.calories || 2000;
  const protTarget = profile.macroTargets?.protein || 150;

  // Workouts
  const workoutDays: DailyWorkout[] = filteredSessions.map((session) => {
    const prog = programs.find((p) => p.id === session.programId);
    const day = prog?.days.find((d) => d.id === session.dayId);
    const duration = session.endTime ? Math.round((session.endTime - session.startTime) / 60000) : 0;
    let totalSets = 0, totalVolume = 0;
    const exercises: DailyWorkout['exercises'] = [];
    for (const [exerciseId, sets] of Object.entries(session.sets)) {
      const ex = day?.exercises.find((e) => e.id === exerciseId);
      const rawName = ex?.name || exerciseId.replace(/^import-/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const completedSets = sets.filter((s) => s.completed && !s.isWarmup);
      totalSets += completedSets.length;
      totalVolume += completedSets.reduce((s, set) => s + set.weight * set.reps, 0);
      if (completedSets.length > 0) {
        exercises.push({ name: rawName, sets: completedSets.map((s) => ({ weight: s.weight, reps: s.reps, rpe: s.rpe, rir: s.rir })) });
      }
    }
    return {
      date: session.date, programName: prog?.name || 'Imported', dayTitle: day?.title || day?.tag || 'Workout',
      duration, totalSets, totalVolume, bodyweight: session.bodyweight,
      exercises, cardio: session.cardio, notes: session.notes,
    };
  }).sort((a, b) => a.date.localeCompare(b.date));

  // Bodyweight + body fat
  const weightEntries = filteredMeasurements
    .filter((m) => m.weight != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ date: m.date, weight: m.weight!, bodyFat: m.bodyFatPercent }));
  const bfEntries = weightEntries.filter((e) => e.bodyFat != null);

  // Measurements
  const measurementEntries = filteredMeasurements
    .filter((m) => m.measurements && Object.keys(m.measurements).length > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ date: m.date, measurements: m.measurements as Record<string, number> }));

  // Check-in averages
  const avgScores: Record<string, number> = {};
  for (const q of DEFAULT_CHECKIN_QUESTIONS) {
    const scores = filteredCheckIns
      .flatMap((c) => c.responses)
      .filter((r) => r.questionId === q.id && typeof r.value === 'number')
      .map((r) => r.value as number);
    if (scores.length > 0) avgScores[q.id] = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length * 10) / 10;
  }

  // Steps
  const totalSteps = filteredSteps.reduce((s, e) => s + e.steps, 0);

  const totalSessions = workoutDays.length;
  const totalVolume = workoutDays.reduce((s, w) => s + w.totalVolume, 0);
  const avgDuration = totalSessions > 0 ? workoutDays.reduce((s, w) => s + w.duration, 0) / totalSessions : 0;
  const daySpan = Math.max(1, Math.ceil((new Date(endDate + 'T00:00:00').getTime() - new Date(startDate + 'T00:00:00').getTime()) / (7 * 24 * 60 * 60 * 1000)));

  return {
    config,
    nutrition: {
      dailyLog: dailyNutrition,
      avgCalories: Math.round(avg((d) => d.calories)),
      avgProtein: Math.round(avg((d) => d.protein)),
      avgCarbs: Math.round(avg((d) => d.carbs)),
      avgFat: Math.round(avg((d) => d.fat)),
      avgFiber: Math.round(avg((d) => d.fiber)),
      totalDaysLogged: daysLogged,
      calorieTarget: calTarget,
      proteinTarget: protTarget,
      daysOnTarget: dailyNutrition.filter((d) => d.calories >= calTarget * 0.9 && d.calories <= calTarget * 1.1).length,
      daysOnProteinTarget: dailyNutrition.filter((d) => d.protein >= protTarget * 0.9).length,
    },
    workouts: {
      sessions: workoutDays, totalSessions, totalVolume,
      avgSessionDuration: Math.round(avgDuration),
      daysPerWeek: Math.round(totalSessions / daySpan * 10) / 10,
    },
    bodyweight: {
      entries: weightEntries,
      startWeight: weightEntries.length > 0 ? weightEntries[0].weight : null,
      endWeight: weightEntries.length > 0 ? weightEntries[weightEntries.length - 1].weight : null,
      change: weightEntries.length > 1 ? weightEntries[weightEntries.length - 1].weight - weightEntries[0].weight : null,
      startBodyFat: bfEntries.length > 0 ? bfEntries[0].bodyFat : undefined,
      endBodyFat: bfEntries.length > 0 ? bfEntries[bfEntries.length - 1].bodyFat : undefined,
    },
    measurements: { entries: measurementEntries },
    steps: {
      entries: filteredSteps.map((s) => ({ date: s.date, steps: s.steps })),
      avgDailySteps: filteredSteps.length > 0 ? Math.round(totalSteps / filteredSteps.length) : 0,
      totalSteps,
    },
    checkIns: {
      entries: filteredCheckIns.map((c) => ({ date: c.date, responses: c.responses, notes: c.notes })),
      avgScores,
    },
    photos: { start: filteredPhotos.slice(0, 4), end: filteredPhotos.length > 4 ? filteredPhotos.slice(-4) : [], all: filteredPhotos },
  };
}

// ── CSV Export ──

export function generateCSV(data: ReportData): string {
  const lines: string[] = [];
  const { config, nutrition, workouts, bodyweight, steps, checkIns } = data;

  lines.push(`APE Client Report`);
  lines.push(`Client,${config.profile.name}`);
  lines.push(`Period,${config.startDate} to ${config.endDate}`);
  lines.push(`Generated,${new Date().toISOString().split('T')[0]}`);
  lines.push('');
  lines.push('=== SUMMARY ===');
  lines.push(`Workouts,${workouts.totalSessions}`);
  lines.push(`Days/Week,${workouts.daysPerWeek}`);
  lines.push(`Avg Session Duration (min),${workouts.avgSessionDuration}`);
  lines.push(`Total Volume (lbs),${workouts.totalVolume.toLocaleString()}`);
  lines.push(`Days Nutrition Logged,${nutrition.totalDaysLogged}`);
  lines.push(`Avg Daily Calories,${nutrition.avgCalories}`);
  lines.push(`Calorie Target,${nutrition.calorieTarget}`);
  lines.push(`Days On Target (±10%),${nutrition.daysOnTarget}`);
  lines.push(`Avg Protein (g),${nutrition.avgProtein}`);
  lines.push(`Protein Target (g),${nutrition.proteinTarget}`);
  lines.push(`Days On Protein Target,${nutrition.daysOnProteinTarget}`);
  lines.push(`Avg Carbs (g),${nutrition.avgCarbs}`);
  lines.push(`Avg Fat (g),${nutrition.avgFat}`);
  lines.push(`Avg Fiber (g),${nutrition.avgFiber}`);
  if (bodyweight.change != null) lines.push(`Weight Change,${bodyweight.change > 0 ? '+' : ''}${bodyweight.change.toFixed(1)} lbs`);
  if (steps.avgDailySteps > 0) lines.push(`Avg Daily Steps,${steps.avgDailySteps.toLocaleString()}`);
  lines.push('');

  lines.push('=== DAILY NUTRITION ===');
  lines.push('Date,Calories,Protein (g),Carbs (g),Fat (g),Fiber (g),Entries');
  for (const d of nutrition.dailyLog) {
    lines.push(`${d.date},${Math.round(d.calories)},${Math.round(d.protein)},${Math.round(d.carbs)},${Math.round(d.fat)},${Math.round(d.fiber)},${d.entries}`);
  }
  lines.push('');

  lines.push('=== WORKOUTS ===');
  lines.push('Date,Program,Day,Duration (min),Sets,Volume (lbs)');
  for (const w of workouts.sessions) {
    lines.push(`${w.date},${w.programName},${w.dayTitle},${w.duration},${w.totalSets},${w.totalVolume}`);
  }
  lines.push('');

  lines.push('=== WORKOUT DETAILS ===');
  for (const w of workouts.sessions) {
    lines.push(`${w.date} - ${w.dayTitle}`);
    for (const ex of w.exercises) {
      const setsStr = ex.sets.map((s) => `${s.weight}×${s.reps}${s.rpe != null ? `@RPE${s.rpe}` : ''}`).join(' | ');
      lines.push(`,${ex.name},${setsStr}`);
    }
    if (w.cardio) for (const c of w.cardio) lines.push(`,Cardio,${c.type} ${c.durationMin}min${c.intensity ? ` (${c.intensity})` : ''}`);
    if (w.notes) lines.push(`,Notes,${w.notes}`);
  }
  lines.push('');

  if (bodyweight.entries.length > 0) {
    lines.push('=== BODYWEIGHT ===');
    lines.push('Date,Weight (lbs),Body Fat %');
    for (const e of bodyweight.entries) lines.push(`${e.date},${e.weight},${e.bodyFat != null ? e.bodyFat + '%' : ''}`);
    lines.push('');
  }

  if (steps.entries.length > 0) {
    lines.push('=== STEPS ===');
    lines.push('Date,Steps');
    for (const e of steps.entries) lines.push(`${e.date},${e.steps}`);
    lines.push('');
  }

  if (checkIns.entries.length > 0) {
    lines.push('=== CHECK-INS ===');
    const qLabels = DEFAULT_CHECKIN_QUESTIONS.map((q) => q.label);
    lines.push(`Date,${qLabels.join(',')},Notes`);
    for (const c of checkIns.entries) {
      const vals = DEFAULT_CHECKIN_QUESTIONS.map((q) => {
        const r = c.responses.find((r) => r.questionId === q.id);
        return r ? String(r.value) : '';
      });
      lines.push(`${c.date},${vals.join(',')},${c.notes || ''}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── SVG Chart Helper ──

function svgLineChart(
  series: { name: string; color: string; points: { label: string; value: number }[]; dashed?: boolean }[],
  opts: { width?: number; height?: number; unit?: string; targetLine?: number } = {}
): string {
  const width = opts.width ?? 760;
  const height = opts.height ?? 240;
  const padL = 44, padR = 16, padT = 16, padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const allVals = series.flatMap((s) => s.points.map((p) => p.value));
  if (opts.targetLine != null) allVals.push(opts.targetLine);
  if (allVals.length === 0) return '';
  let min = Math.min(...allVals), max = Math.max(...allVals);
  if (min === max) { min -= 1; max += 1; }
  const range = max - min;
  min = min - range * 0.1; max = max + range * 0.1;

  const maxLen = Math.max(...series.map((s) => s.points.length));
  const xAt = (i: number) => padL + (maxLen <= 1 ? plotW / 2 : (i / (maxLen - 1)) * plotW);
  const yAt = (v: number) => padT + plotH - ((v - min) / (max - min)) * plotH;

  const grid: string[] = [];
  for (let g = 0; g <= 4; g++) {
    const v = min + ((max - min) * g) / 4;
    const y = yAt(v);
    grid.push(`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="#eee" stroke-width="1"/>`);
    grid.push(`<text x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#aaa">${v.toFixed(0)}</text>`);
  }

  const labelSource = series.reduce((a, b) => (b.points.length > a.points.length ? b : a), series[0]);
  const idxs = labelSource.points.length <= 1 ? [0] : [0, Math.floor((labelSource.points.length - 1) / 2), labelSource.points.length - 1];
  const xLabels = [...new Set(idxs)].map((i) => {
    const p = labelSource.points[i];
    return p ? `<text x="${xAt(i).toFixed(1)}" y="${height - 12}" text-anchor="middle" font-size="9" fill="#888">${p.label}</text>` : '';
  });

  // Target line
  const targetSVG = opts.targetLine != null
    ? `<line x1="${padL}" y1="${yAt(opts.targetLine).toFixed(1)}" x2="${width - padR}" y2="${yAt(opts.targetLine).toFixed(1)}" stroke="#bbb" stroke-width="1.5" stroke-dasharray="5,4"/>
       <text x="${width - padR - 2}" y="${(yAt(opts.targetLine) - 3).toFixed(1)}" text-anchor="end" font-size="8" fill="#999">target</text>`
    : '';

  const paths = series.map((s) => {
    const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.value).toFixed(1)}`).join(' ');
    const dash = s.dashed ? 'stroke-dasharray="5,4"' : '';
    const dots = s.points.map((p, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(p.value).toFixed(1)}" r="2.5" fill="${s.color}"/>`).join('');
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${dash}/>${dots}`;
  }).join('');

  const legend = series.length > 1
    ? `<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:8px;">${series
        .map((s) => `<span style="font-size:10px;color:#666;display:inline-flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:${s.color};display:inline-block;"></span>${s.name}</span>`)
        .join('')}</div>` : '';

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:${width}px;display:block;margin:0 auto;font-family:inherit;">${grid.join('')}${targetSVG}${paths}${xLabels.join('')}</svg>${legend}`;
}

// ── HTML Report ──

export function generateHTMLReport(data: ReportData): string {
  const { config, nutrition, workouts, bodyweight, measurements, steps, checkIns, photos } = data;
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtShort = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const poseLabel = (p: string) => p.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const bs = config.profile.bodyStats;
  const heightIn = bs?.heightCm ? Math.round(bs.heightCm / 2.54) : null;
  const heightStr = heightIn ? `${Math.floor(heightIn / 12)}'${heightIn % 12}"` : null;

  const weightChartSVG = bodyweight.entries.length > 1
    ? svgLineChart([{ name: 'Weight', color: '#e8572a', points: bodyweight.entries.map((e) => ({ label: fmtShort(e.date), value: e.weight })) }])
    : '';

  const calChartSVG = nutrition.dailyLog.length > 1
    ? svgLineChart(
        [{ name: 'Calories', color: '#e8572a', points: nutrition.dailyLog.map((d) => ({ label: fmtShort(d.date), value: Math.round(d.calories) })) }],
        { targetLine: nutrition.calorieTarget }
      )
    : '';

  const measureColors: Record<string, string> = {
    chest: '#e8572a', waist: '#2e9e6b', hips: '#3b82f6', shoulders: '#a855f7',
    leftBicep: '#f59e0b', rightBicep: '#eab308', leftThigh: '#06b6d4', rightThigh: '#0ea5e9', neck: '#ec4899',
  };
  const measureKeys = measurements.entries.length > 0 ? Array.from(new Set(measurements.entries.flatMap((e) => Object.keys(e.measurements)))) : [];
  const measureChartSVG = measureKeys.length > 0 && measurements.entries.length > 1
    ? svgLineChart(measureKeys.map((key) => ({
        name: key.replace(/([A-Z])/g, ' $1').replace(/\b\w/g, (c) => c.toUpperCase()),
        color: measureColors[key] || '#888',
        points: measurements.entries.filter((e) => e.measurements[key] != null).map((e) => ({ label: fmtShort(e.date), value: e.measurements[key] })),
      })).filter((s) => s.points.length > 1))
    : '';

  // Weekly averages
  const weeklyMap: Record<string, DailyNutrition[]> = {};
  for (const d of nutrition.dailyLog) {
    const date = new Date(d.date + 'T00:00:00');
    const day = date.getDay();
    const monday = new Date(date); monday.setDate(date.getDate() - ((day + 6) % 7));
    const wk = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    if (!weeklyMap[wk]) weeklyMap[wk] = [];
    weeklyMap[wk].push(d);
  }
  const weeklyRows = Object.entries(weeklyMap).sort(([a], [b]) => a.localeCompare(b)).map(([wk, days]) => {
    const n = days.length;
    const a = (fn: (d: DailyNutrition) => number) => Math.round(days.reduce((s, d) => s + fn(d), 0) / n);
    return { week: fmtShort(wk), cal: a((d) => d.calories), prot: a((d) => d.protein), carbs: a((d) => d.carbs), fat: a((d) => d.fat), days: n };
  });

  const photoGallery = (photoList: ProgressPhoto[]) => photoList.length === 0 ? '' : `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;">
      ${photoList.map((p) => `<div style="border:1px solid #eee;border-radius:10px;overflow:hidden;background:#fafafa;">
        <img src="${p.imageData}" style="width:100%;aspect-ratio:3/4;object-fit:cover;display:block;" />
        <div style="padding:8px;"><div style="font-size:11px;font-weight:600;">${fmt(p.date)}</div>
        <div style="font-size:10px;color:#888;margin-top:2px;">${poseLabel(p.pose)}${p.weight != null ? ` · ${p.weight} lbs` : ''}</div></div></div>`).join('')}
    </div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>APE Report — ${config.profile.name}</title>
<style>
  * { margin:0;padding:0;box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#1a1a1a;padding:32px;max-width:900px;margin:0 auto;line-height:1.5; }
  h1 { font-size:22px;font-weight:700; } h2 { font-size:13px;color:#e8572a;margin:32px 0 12px;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #f0f0f0;padding-bottom:6px; }
  .subtitle { color:#666;font-size:13px;margin-bottom:16px; }
  .profile-box { background:#fafafa;border:1px solid #eee;border-radius:10px;padding:16px;margin-bottom:24px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px; }
  .profile-box strong { color:#111; } .profile-row { color:#555; }
  .card { background:#fafafa;border:1px solid #eee;border-radius:10px;padding:16px;margin-bottom:12px; }
  .stats-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px; }
  .stat { background:#f5f5f5;border:1px solid #eee;border-radius:8px;padding:12px 8px;text-align:center; }
  .stat-value { font-size:20px;font-weight:700;color:#111; } .stat-label { font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-top:3px; }
  table { width:100%;border-collapse:collapse;font-size:11px; }
  th { text-align:left;color:#888;font-size:9px;text-transform:uppercase;padding:6px 8px;border-bottom:2px solid #eee; }
  td { padding:5px 8px;border-bottom:1px solid #f0f0f0; }
  tr:last-child td { border-bottom:none; }
  .tag { display:inline-block;background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:9px;color:#666; }
  .positive { color:#2e9e6b; } .negative { color:#e85757; }
  .workout-detail { margin:8px 0;padding:12px;background:#f9f9f9;border:1px solid #eee;border-radius:8px; }
  .exercise-row { display:flex;justify-content:space-between;padding:3px 0;font-size:11px; }
  .sets-display { color:#666;font-size:10px; }
  .note { font-style:italic;color:#888;font-size:10px;margin-top:6px; }
  .checkin-score { display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:50%;font-size:11px;font-weight:700; }
  .score-hi { background:#dcfce7;color:#166534; } .score-mid { background:#fef9c3;color:#713f12; } .score-lo { background:#fee2e2;color:#991b1b; }
  .page-break { page-break-before:always; }
  @media print { body { padding:16px; } .page-break { page-break-before:always; } }
</style></head><body>
<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
  <img src="./logo-head-black.png" alt="APE" style="height:36px;" onerror="this.style.display='none'" />
  <h1>APE Client Report</h1>
</div>
<div class="subtitle"><strong>${config.profile.name}</strong> · ${fmt(config.startDate)} — ${fmt(config.endDate)}</div>

<div class="profile-box">
  ${bs ? `
  <div class="profile-row"><strong>Age:</strong> ${bs.age} yrs</div>
  <div class="profile-row"><strong>Height:</strong> ${heightStr || bs.heightCm + ' cm'}</div>
  <div class="profile-row"><strong>Starting Weight:</strong> ${bodyweight.startWeight != null ? bodyweight.startWeight + ' lbs' : '—'}</div>
  <div class="profile-row"><strong>Goal:</strong> ${bs.fitnessGoal === 'lose' ? 'Fat Loss' : bs.fitnessGoal === 'build' ? 'Muscle Gain' : 'Maintenance'}</div>
  ` : ''}
  <div class="profile-row"><strong>Calorie Target:</strong> ${config.profile.macroTargets?.calories || '—'} kcal</div>
  <div class="profile-row"><strong>Protein Target:</strong> ${config.profile.macroTargets?.protein || '—'} g</div>
  <div class="profile-row"><strong>Carb Target:</strong> ${config.profile.macroTargets?.carbs || '—'} g</div>
  <div class="profile-row"><strong>Fat Target:</strong> ${config.profile.macroTargets?.fat || '—'} g</div>
  ${config.profile.tdee ? `<div class="profile-row"><strong>Est. TDEE:</strong> ${config.profile.tdee} kcal</div>` : ''}
  ${config.profile.activeProgram ? `<div class="profile-row"><strong>Active Program:</strong> ${config.profile.activeProgram.programId}</div>` : ''}
</div>

<h2>Overview</h2>
<div class="stats-grid">
  <div class="stat"><div class="stat-value">${workouts.totalSessions}</div><div class="stat-label">Workouts</div></div>
  <div class="stat"><div class="stat-value">${workouts.daysPerWeek}</div><div class="stat-label">Days/Week</div></div>
  <div class="stat"><div class="stat-value">${workouts.avgSessionDuration}m</div><div class="stat-label">Avg Duration</div></div>
  <div class="stat"><div class="stat-value">${(workouts.totalVolume / 1000).toFixed(0)}k</div><div class="stat-label">Total Volume</div></div>
  <div class="stat"><div class="stat-value">${nutrition.avgCalories}</div><div class="stat-label">Avg Calories</div></div>
  <div class="stat"><div class="stat-value">${nutrition.avgProtein}g</div><div class="stat-label">Avg Protein</div></div>
  <div class="stat"><div class="stat-value">${nutrition.daysOnTarget}/${nutrition.totalDaysLogged}</div><div class="stat-label">Cal On Target</div></div>
  <div class="stat"><div class="stat-value">${nutrition.daysOnProteinTarget}/${nutrition.totalDaysLogged}</div><div class="stat-label">Prot On Target</div></div>
  ${bodyweight.change != null ? `<div class="stat"><div class="stat-value ${bodyweight.change < 0 ? 'positive' : bodyweight.change > 0 ? 'negative' : ''}">${bodyweight.change > 0 ? '+' : ''}${bodyweight.change.toFixed(1)}</div><div class="stat-label">Weight Δ (lbs)</div></div>` : ''}
  ${bodyweight.startBodyFat != null && bodyweight.endBodyFat != null ? `<div class="stat"><div class="stat-value">${bodyweight.startBodyFat}% → ${bodyweight.endBodyFat}%</div><div class="stat-label">Body Fat</div></div>` : ''}
  ${steps.avgDailySteps > 0 ? `<div class="stat"><div class="stat-value">${(steps.avgDailySteps / 1000).toFixed(1)}k</div><div class="stat-label">Avg Steps/Day</div></div>` : ''}
</div>

${photos.all.length > 0 ? `<div class="page-break"></div><h2>Progress Photos</h2><div class="card">${photoGallery(photos.all)}</div>` : ''}

<h2>Nutrition</h2>
${calChartSVG ? `<div class="card">${calChartSVG}</div>` : ''}
<div class="card">
  <table>
    <thead><tr><th>Date</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Fiber</th></tr></thead>
    <tbody>
      ${nutrition.dailyLog.map((d) => `<tr><td>${fmtShort(d.date)}</td><td>${Math.round(d.calories)}</td><td>${Math.round(d.protein)}g</td><td>${Math.round(d.carbs)}g</td><td>${Math.round(d.fat)}g</td><td>${Math.round(d.fiber)}g</td></tr>`).join('')}
      <tr style="font-weight:700;background:#f5f5f5;"><td>Average</td><td>${nutrition.avgCalories}</td><td>${nutrition.avgProtein}g</td><td>${nutrition.avgCarbs}g</td><td>${nutrition.avgFat}g</td><td>${nutrition.avgFiber}g</td></tr>
      <tr style="color:#888;font-size:10px;"><td>Target</td><td>${nutrition.calorieTarget}</td><td>${nutrition.proteinTarget}g</td><td>${config.profile.macroTargets?.carbs || '—'}g</td><td>${config.profile.macroTargets?.fat || '—'}g</td><td></td></tr>
    </tbody>
  </table>
</div>
${weeklyRows.length > 1 ? `<div class="card"><div style="font-size:10px;font-weight:600;color:#888;text-transform:uppercase;margin-bottom:8px;">Weekly Averages</div>
<table><thead><tr><th>Week of</th><th>Avg Cal</th><th>Avg Protein</th><th>Avg Carbs</th><th>Avg Fat</th><th>Days Logged</th></tr></thead>
<tbody>${weeklyRows.map((w) => `<tr><td>${w.week}</td><td>${w.cal}</td><td>${w.prot}g</td><td>${w.carbs}g</td><td>${w.fat}g</td><td>${w.days}</td></tr>`).join('')}</tbody>
</table></div>` : ''}

<h2>Training</h2>
${workouts.sessions.map((w) => `
<div class="workout-detail">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
    <strong>${fmtShort(w.date)} — ${w.dayTitle}</strong>
    <span class="tag">${w.duration}min · ${w.totalSets} sets · ${w.totalVolume.toLocaleString()} lbs${w.bodyweight ? ` · BW ${w.bodyweight}lbs` : ''}</span>
  </div>
  ${w.exercises.map((ex) => `<div class="exercise-row"><span>${ex.name}</span><span class="sets-display">${ex.sets.map((s) => `${s.weight}×${s.reps}${s.rpe != null ? ` @RPE${s.rpe}` : s.rir != null ? ` RIR${s.rir}` : ''}`).join(', ')}</span></div>`).join('')}
  ${w.cardio ? w.cardio.map((c) => `<div class="exercise-row"><span>🏃 ${c.type}</span><span class="sets-display">${c.durationMin}min${c.intensity ? ` · ${c.intensity}` : ''}</span></div>`).join('') : ''}
  ${w.notes ? `<div class="note">${w.notes}</div>` : ''}
</div>`).join('')}

${bodyweight.entries.length > 0 ? `
<h2>Body Composition</h2>
<div class="card">
  ${weightChartSVG}
  <table style="margin-top:${weightChartSVG ? '16px' : '0'};">
    <thead><tr><th>Date</th><th>Weight (lbs)</th><th>Body Fat %</th></tr></thead>
    <tbody>${bodyweight.entries.map((e) => `<tr><td>${fmtShort(e.date)}</td><td>${e.weight}</td><td>${e.bodyFat != null ? e.bodyFat + '%' : '—'}</td></tr>`).join('')}</tbody>
  </table>
</div>` : ''}

${measurements.entries.length > 0 ? `
<h2>Measurements</h2>
<div class="card">
  ${measureChartSVG}
  <table style="margin-top:${measureChartSVG ? '16px' : '0'};">
    <thead><tr><th>Date</th>${measureKeys.map((k) => `<th>${k.replace(/([A-Z])/g, ' $1').replace(/\b\w/g, (c) => c.toUpperCase())}</th>`).join('')}</tr></thead>
    <tbody>${measurements.entries.map((e) => `<tr><td>${fmtShort(e.date)}</td>${measureKeys.map((k) => `<td>${e.measurements[k] != null ? e.measurements[k] + '"' : '—'}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>
</div>` : ''}

${steps.entries.length > 0 ? `
<h2>Steps</h2>
<div class="card">
  <table>
    <thead><tr><th>Date</th><th>Steps</th></tr></thead>
    <tbody>${steps.entries.map((e) => `<tr><td>${fmtShort(e.date)}</td><td>${e.steps.toLocaleString()}</td></tr>`).join('')}</tbody>
    <tfoot><tr style="font-weight:700;background:#f5f5f5;"><td>Average</td><td>${steps.avgDailySteps.toLocaleString()}</td></tr></tfoot>
  </table>
</div>` : ''}

${checkIns.entries.length > 0 ? `
<h2>Check-ins</h2>
<div class="card">
  <table>
    <thead><tr><th>Question</th><th>Avg Score</th></tr></thead>
    <tbody>${DEFAULT_CHECKIN_QUESTIONS.filter((q) => checkIns.avgScores[q.id] != null).map((q) => {
      const score = checkIns.avgScores[q.id];
      const cls = score >= 7 ? 'score-hi' : score >= 4 ? 'score-mid' : 'score-lo';
      return `<tr><td>${q.label}</td><td><span class="checkin-score ${cls}">${score}</span></td></tr>`;
    }).join('')}</tbody>
  </table>
</div>
<div class="card">
  <table>
    <thead><tr><th>Date</th>${DEFAULT_CHECKIN_QUESTIONS.map((q) => `<th style="font-size:8px;">${q.label.split(' ').slice(0, 2).join(' ')}</th>`).join('')}</tr></thead>
    <tbody>${checkIns.entries.map((c) => `<tr><td>${fmtShort(c.date)}</td>${DEFAULT_CHECKIN_QUESTIONS.map((q) => {
      const r = c.responses.find((r) => r.questionId === q.id);
      return r ? `<td>${r.value}</td>` : '<td>—</td>';
    }).join('')}</tr>`).join('')}</tbody>
  </table>
</div>` : ''}

<div style="margin-top:40px;text-align:center;color:#999;font-size:9px;">Generated by APE (Aesthetic Physique Enthusiast) · ${new Date().toLocaleDateString()} · Print this page to save as PDF</div>
</body></html>`;
}

// ── PDF Report ──

export async function generatePDFReport(data: ReportData): Promise<void> {
  const { config, nutrition, workouts, bodyweight, measurements, steps, checkIns, photos } = data;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const orange = '#e8572a';
  const blue = '#5b6ef5';
  const green = '#2e9e6b';

  const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fmtDateFull = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  type RGB = [number, number, number];
  const hex = (h: string): RGB => { const s = h.replace('#', ''); return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; };

  const sectionHead = (label: string, y: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...hex(orange));
    doc.text(label, 14, y);
    doc.setDrawColor(...hex('#f0f0f0'));
    doc.setLineWidth(0.5);
    doc.line(14, y + 1, pw - 14, y + 1);
    doc.setTextColor('#111111');
  };

  const ensureY = (y: number, needed = 30): number => {
    if (y + needed > ph - 14) { doc.addPage(); return 20; }
    return y;
  };

  const addFooter = () => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor('#999999');
      doc.text(`APE Report · ${config.profile.name} · Generated ${new Date().toLocaleDateString()} · Page ${i}/${n}`, pw / 2, ph - 6, { align: 'center' });
    }
  };

  // ── Line chart drawn with jsPDF primitives ──
  const drawLineChart = (
    x: number, y: number, w: number, h: number,
    series: { name: string; color: string; points: { label: string; value: number }[]; dashed?: boolean }[],
    targetLine?: number
  ) => {
    const padL = 14, padB = 10, plotX = x + padL, plotW = w - padL, plotH = h - padB;
    const allVals = series.flatMap((s) => s.points.map((p) => p.value));
    if (targetLine != null) allVals.push(targetLine);
    if (allVals.length === 0) return;
    let min = Math.min(...allVals), max = Math.max(...allVals);
    if (min === max) { min -= 1; max += 1; }
    const r = max - min; min -= r * 0.1; max += r * 0.1;
    const maxLen = Math.max(...series.map((s) => s.points.length));
    const xAt = (i: number) => plotX + (maxLen <= 1 ? plotW / 2 : (i / (maxLen - 1)) * plotW);
    const yAt = (v: number) => y + plotH - ((v - min) / (max - min)) * plotH;

    doc.setDrawColor(235, 235, 235); doc.setLineWidth(0.2);
    doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor('#aaaaaa');
    for (let g = 0; g <= 4; g++) {
      const v = min + ((max - min) * g) / 4;
      const gy = yAt(v);
      doc.line(plotX, gy, plotX + plotW, gy);
      doc.text(v.toFixed(0), plotX - 1.5, gy + 1, { align: 'right' });
    }

    // Target dashed line
    if (targetLine != null) {
      const ty = yAt(targetLine);
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.4);
      (doc as any).setLineDashPattern([1.5, 1.5], 0);
      doc.line(plotX, ty, plotX + plotW, ty);
      (doc as any).setLineDashPattern([], 0);
      doc.setFontSize(5); doc.setTextColor('#999999');
      doc.text('target', plotX + plotW - 1, ty - 1, { align: 'right' });
    }

    for (const s of series) {
      const [cr, cg, cb] = hex(s.color);
      doc.setDrawColor(cr, cg, cb); doc.setFillColor(cr, cg, cb); doc.setLineWidth(0.6);
      if (s.dashed) (doc as any).setLineDashPattern([1.5, 1.5], 0);
      for (let i = 1; i < s.points.length; i++) {
        doc.line(xAt(i - 1), yAt(s.points[i - 1].value), xAt(i), yAt(s.points[i].value));
      }
      if (s.dashed) (doc as any).setLineDashPattern([], 0);
      for (let i = 0; i < s.points.length; i++) doc.circle(xAt(i), yAt(s.points[i].value), 0.6, 'F');
    }

    // X labels
    const longest = series.reduce((a, b) => (b.points.length > a.points.length ? b : a), series[0]);
    doc.setFontSize(5.5); doc.setTextColor('#888888'); doc.setFont('helvetica', 'normal');
    const idxs = longest.points.length <= 1 ? [0] : [0, Math.floor((longest.points.length - 1) / 2), longest.points.length - 1];
    for (const i of [...new Set(idxs)]) {
      const p = longest.points[i]; if (!p) continue;
      doc.text(p.label, xAt(i), y + plotH + 5.5, { align: 'center' });
    }

    // Legend (if multiple series)
    if (series.length > 1) {
      let lx = plotX; const ly = y + plotH + 9;
      doc.setFontSize(5.5);
      for (const s of series) {
        const [cr, cg, cb] = hex(s.color);
        doc.setFillColor(cr, cg, cb); doc.rect(lx, ly - 1.5, 2, 2, 'F');
        doc.setTextColor('#666666'); doc.text(s.name, lx + 3, ly);
        lx += s.name.length * 1.5 + 7;
      }
    }
  };

  const loadImgSize = (src: string): Promise<{ w: number; h: number; fmt: string }> =>
    new Promise((res) => {
      const fmt = src.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth || 3, h: img.naturalHeight || 4, fmt });
      img.onerror = () => res({ w: 3, h: 4, fmt });
      img.src = src;
    });

  let cy = 14;

  // ── PAGE 1: HEADER + CLIENT PROFILE + OVERVIEW ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor('#111111');
  doc.text('APE Client Report', 14, cy + 7); cy += 10;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor('#666666');
  doc.text(`${config.profile.name}  ·  ${fmtDateFull(config.startDate)} — ${fmtDateFull(config.endDate)}`, 14, cy + 4); cy += 9;

  // Client profile box
  const bs = config.profile.bodyStats;
  const mt = config.profile.macroTargets;
  const profileLines: [string, string][] = [];
  if (bs) {
    const hIn = Math.round(bs.heightCm / 2.54);
    profileLines.push(['Height', `${Math.floor(hIn / 12)}'${hIn % 12}" (${bs.heightCm} cm)`]);
    profileLines.push(['Age', `${bs.age} yrs`]);
    profileLines.push(['Goal', bs.fitnessGoal === 'lose' ? 'Fat Loss' : bs.fitnessGoal === 'build' ? 'Muscle Gain' : 'Maintenance']);
    profileLines.push(['Activity', bs.activityLevel.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())]);
  }
  if (config.profile.tdee) profileLines.push(['Est. TDEE', `${config.profile.tdee} kcal`]);
  if (mt) {
    profileLines.push(['Cal Target', `${mt.calories} kcal`]);
    profileLines.push(['Protein Target', `${mt.protein} g`]);
    profileLines.push(['Carb / Fat Target', `${mt.carbs}g / ${mt.fat}g`]);
  }
  if (bodyweight.startWeight != null) profileLines.push(['Starting Weight', `${bodyweight.startWeight} lbs`]);
  if (bodyweight.endWeight != null) profileLines.push(['Ending Weight', `${bodyweight.endWeight} lbs`]);

  if (profileLines.length > 0) {
    const boxH = Math.ceil(profileLines.length / 2) * 5 + 10;
    doc.setFillColor(250, 250, 250); doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3);
    doc.roundedRect(14, cy, pw - 28, boxH, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    const colW = (pw - 28) / 2;
    let col = 0, row = 0;
    for (const [label, value] of profileLines) {
      const bx = 14 + col * colW + 5;
      const by = cy + 6 + row * 5;
      doc.setTextColor('#888888'); doc.text(label + ':', bx, by);
      doc.setTextColor('#111111'); doc.text(value, bx + 32, by);
      col++; if (col >= 2) { col = 0; row++; }
    }
    cy += boxH + 6;
  }

  // Overview stats
  sectionHead('OVERVIEW', cy); cy += 6;
  const overviewRows: string[][] = [
    ['Workouts', String(workouts.totalSessions), 'Days/Week', String(workouts.daysPerWeek)],
    ['Avg Duration', `${workouts.avgSessionDuration} min`, 'Total Volume', `${workouts.totalVolume.toLocaleString()} lbs`],
    ['Avg Calories', String(nutrition.avgCalories), 'Calorie Target', String(nutrition.calorieTarget)],
    ['Days On Cal Target', `${nutrition.daysOnTarget} / ${nutrition.totalDaysLogged}`, 'Days On Protein Target', `${nutrition.daysOnProteinTarget} / ${nutrition.totalDaysLogged}`],
    ['Avg Protein', `${nutrition.avgProtein} g`, 'Protein Target', `${nutrition.proteinTarget} g`],
    ['Avg Carbs', `${nutrition.avgCarbs} g`, 'Avg Fat', `${nutrition.avgFat} g`],
    ['Avg Fiber', `${nutrition.avgFiber} g`, 'Nutrition Days Logged', String(nutrition.totalDaysLogged)],
  ];
  if (bodyweight.change != null) overviewRows.push(['Weight Change', `${bodyweight.change > 0 ? '+' : ''}${bodyweight.change.toFixed(1)} lbs`, 'Start → End', `${bodyweight.startWeight} → ${bodyweight.endWeight} lbs`]);
  if (bodyweight.startBodyFat != null && bodyweight.endBodyFat != null) overviewRows.push(['Body Fat Start', `${bodyweight.startBodyFat}%`, 'Body Fat End', `${bodyweight.endBodyFat}%`]);
  if (steps.avgDailySteps > 0) overviewRows.push(['Avg Daily Steps', steps.avgDailySteps.toLocaleString(), 'Total Steps', steps.totalSteps.toLocaleString()]);

  autoTable(doc, {
    startY: cy,
    head: [['Metric', 'Value', 'Metric', 'Value']],
    body: overviewRows,
    theme: 'grid',
    headStyles: { fillColor: hex(orange), textColor: '#ffffff', fontSize: 7 },
    bodyStyles: { fontSize: 7.5 },
    alternateRowStyles: { fillColor: '#f7f7f7' },
    columnStyles: { 0: { fontStyle: 'normal', textColor: '#666666' }, 2: { fontStyle: 'normal', textColor: '#666666' } },
    margin: { left: 14, right: 14 },
  });
  cy = ((doc as any).lastAutoTable?.finalY ?? cy) + 6;

  // ── NUTRITION ──
  cy = ensureY(cy, 40);
  sectionHead('NUTRITION', cy); cy += 8;

  // Calorie vs target chart
  if (nutrition.dailyLog.length > 1) {
    cy = ensureY(cy, 46);
    drawLineChart(14, cy, pw - 28, 38, [
      { name: 'Calories', color: orange, points: nutrition.dailyLog.map((d) => ({ label: fmtDate(d.date), value: Math.round(d.calories) })) },
    ], nutrition.calorieTarget);
    cy += 44;
  }

  // Macro targets vs actual comparison
  cy = ensureY(cy, 20);
  const macroCompRows = [
    ['Calories', String(nutrition.calorieTarget), String(nutrition.avgCalories), `${Math.round((nutrition.avgCalories / nutrition.calorieTarget) * 100)}%`],
    ['Protein (g)', String(nutrition.proteinTarget), String(nutrition.avgProtein), `${Math.round((nutrition.avgProtein / nutrition.proteinTarget) * 100)}%`],
    ...(mt ? [
      ['Carbs (g)', String(mt.carbs), String(nutrition.avgCarbs), `${Math.round((nutrition.avgCarbs / mt.carbs) * 100)}%`],
      ['Fat (g)', String(mt.fat), String(nutrition.avgFat), `${Math.round((nutrition.avgFat / mt.fat) * 100)}%`],
    ] : []),
    ['Fiber (g)', config.profile.fiberTarget ? String(config.profile.fiberTarget) : '—', String(nutrition.avgFiber), ''],
  ];
  autoTable(doc, {
    startY: cy,
    head: [['Macro', 'Target', 'Avg Actual', '% of Target']],
    body: macroCompRows,
    theme: 'grid',
    headStyles: { fillColor: hex(orange), textColor: '#ffffff', fontSize: 7 },
    bodyStyles: { fontSize: 7.5 },
    alternateRowStyles: { fillColor: '#f7f7f7' },
    margin: { left: 14, right: 14 },
  });
  cy = ((doc as any).lastAutoTable?.finalY ?? cy) + 6;

  // Weekly averages
  const weeklyMap: Record<string, DailyNutrition[]> = {};
  for (const d of nutrition.dailyLog) {
    const date = new Date(d.date + 'T00:00:00');
    const dow = date.getDay();
    const mon = new Date(date); mon.setDate(date.getDate() - ((dow + 6) % 7));
    const wk = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
    if (!weeklyMap[wk]) weeklyMap[wk] = [];
    weeklyMap[wk].push(d);
  }
  const weeklyRows = Object.entries(weeklyMap).sort(([a], [b]) => a.localeCompare(b));
  if (weeklyRows.length > 1) {
    cy = ensureY(cy, 20);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor('#666666');
    doc.text('Weekly Averages', 14, cy); cy += 4;
    autoTable(doc, {
      startY: cy,
      head: [['Week of', 'Avg Cal', 'Avg Prot', 'Avg Carbs', 'Avg Fat', 'Days']],
      body: weeklyRows.map(([wk, days]) => {
        const n = days.length;
        const a = (fn: (d: DailyNutrition) => number) => Math.round(days.reduce((s, d) => s + fn(d), 0) / n);
        return [fmtDate(wk), String(a((d) => d.calories)), `${a((d) => d.protein)}g`, `${a((d) => d.carbs)}g`, `${a((d) => d.fat)}g`, String(n)];
      }),
      theme: 'grid',
      headStyles: { fillColor: hex('#888888'), textColor: '#ffffff', fontSize: 6.5 },
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: { fillColor: '#f7f7f7' },
      margin: { left: 14, right: 14 },
    });
    cy = ((doc as any).lastAutoTable?.finalY ?? cy) + 6;
  }

  // Daily nutrition table
  cy = ensureY(cy, 20);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor('#666666');
  doc.text('Daily Log', 14, cy); cy += 4;
  autoTable(doc, {
    startY: cy,
    head: [['Date', 'Cal', 'Protein', 'Carbs', 'Fat', 'Fiber']],
    body: [
      ...nutrition.dailyLog.map((d) => [fmtDate(d.date), String(Math.round(d.calories)), `${Math.round(d.protein)}g`, `${Math.round(d.carbs)}g`, `${Math.round(d.fat)}g`, `${Math.round(d.fiber)}g`]),
      ['Average', String(nutrition.avgCalories), `${nutrition.avgProtein}g`, `${nutrition.avgCarbs}g`, `${nutrition.avgFat}g`, `${nutrition.avgFiber}g`],
    ],
    theme: 'grid',
    headStyles: { fillColor: hex(orange), textColor: '#ffffff', fontSize: 7 },
    bodyStyles: { fontSize: 7 },
    alternateRowStyles: { fillColor: '#f7f7f7' },
    didParseCell: (hook) => {
      if (hook.row.index === nutrition.dailyLog.length) {
        hook.cell.styles.fontStyle = 'bold';
        hook.cell.styles.fillColor = '#fff3ee';
      }
    },
    margin: { left: 14, right: 14 },
  });
  cy = ((doc as any).lastAutoTable?.finalY ?? cy) + 6;

  // ── TRAINING ──
  doc.addPage(); cy = 14;
  sectionHead('TRAINING LOG', cy); cy += 8;

  autoTable(doc, {
    startY: cy,
    head: [['Date', 'Workout', 'Duration', 'Sets', 'Volume', 'BW']],
    body: workouts.sessions.map((w) => [fmtDate(w.date), w.dayTitle, `${w.duration}m`, String(w.totalSets), `${w.totalVolume.toLocaleString()}`, w.bodyweight ? `${w.bodyweight}` : '—']),
    theme: 'grid',
    headStyles: { fillColor: hex(orange), textColor: '#ffffff', fontSize: 7 },
    bodyStyles: { fontSize: 7 },
    alternateRowStyles: { fillColor: '#f7f7f7' },
    margin: { left: 14, right: 14 },
  });
  cy = ((doc as any).lastAutoTable?.finalY ?? cy) + 8;

  // Workout details (exercise breakdown per session)
  sectionHead('WORKOUT DETAILS', cy); cy += 8;
  for (const w of workouts.sessions) {
    const rowCount = w.exercises.length + (w.cardio?.length || 0) + (w.notes ? 1 : 0);
    cy = ensureY(cy, rowCount * 5 + 14);

    // Session header
    doc.setFillColor(245, 245, 245); doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.2);
    doc.roundedRect(14, cy - 3, pw - 28, 7, 1, 1, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor('#111111');
    doc.text(`${fmtDate(w.date)}  ·  ${w.dayTitle}`, 17, cy + 1.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor('#888888');
    doc.text(`${w.duration}min  ·  ${w.totalSets} sets  ·  ${w.totalVolume.toLocaleString()} lbs`, pw - 16, cy + 1.5, { align: 'right' });
    cy += 7;

    // Exercises
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor('#111111');
    for (const ex of w.exercises) {
      cy = ensureY(cy, 5);
      const setsStr = ex.sets.map((s) => `${s.weight}×${s.reps}${s.rpe != null ? `@${s.rpe}` : s.rir != null ? ` RIR${s.rir}` : ''}`).join('  ');
      doc.setFont('helvetica', 'bold'); doc.text(ex.name, 18, cy);
      doc.setFont('helvetica', 'normal'); doc.setTextColor('#444444');
      const clipped = doc.splitTextToSize(setsStr, pw - 80);
      doc.text(clipped[0] || '', pw - 16, cy, { align: 'right' });
      doc.setTextColor('#111111');
      cy += 4.5;
    }

    // Cardio
    if (w.cardio) {
      for (const c of w.cardio) {
        cy = ensureY(cy, 5);
        doc.setFont('helvetica', 'italic'); doc.setTextColor('#666666');
        doc.text(`Cardio: ${c.type}  ·  ${c.durationMin}min${c.intensity ? `  ·  ${c.intensity}` : ''}`, 18, cy);
        doc.setFont('helvetica', 'normal'); doc.setTextColor('#111111');
        cy += 4.5;
      }
    }

    // Notes
    if (w.notes) {
      cy = ensureY(cy, 5);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5); doc.setTextColor('#888888');
      const wrapped = doc.splitTextToSize(`Note: ${w.notes}`, pw - 36);
      doc.text(wrapped, 18, cy);
      cy += wrapped.length * 4 + 2;
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor('#111111');
    }

    cy += 3;
  }

  // ── BODY COMPOSITION ──
  if (bodyweight.entries.length > 0 || measurements.entries.length > 0) {
    doc.addPage(); cy = 14;
    sectionHead('BODY COMPOSITION', cy); cy += 8;

    if (bodyweight.entries.length > 1) {
      cy = ensureY(cy, 46);
      const bwSeries = [{ name: 'Weight (lbs)', color: orange, points: bodyweight.entries.map((e) => ({ label: fmtDate(e.date), value: e.weight })) }];
      const bfSeries = bodyweight.entries.filter((e) => e.bodyFat != null);
      if (bfSeries.length > 1) {
        drawLineChart(14, cy, (pw - 30) / 2, 36, bwSeries);
        drawLineChart(14 + (pw - 28) / 2 + 2, cy, (pw - 30) / 2, 36, [{ name: 'Body Fat %', color: blue, points: bfSeries.map((e) => ({ label: fmtDate(e.date), value: e.bodyFat! })) }]);
      } else {
        drawLineChart(14, cy, pw - 28, 36, bwSeries);
      }
      cy += 42;
    }

    // Weight + BF table
    autoTable(doc, {
      startY: cy,
      head: [['Date', 'Weight (lbs)', 'Body Fat %']],
      body: bodyweight.entries.map((e) => [fmtDate(e.date), String(e.weight), e.bodyFat != null ? `${e.bodyFat}%` : '—']),
      theme: 'grid',
      headStyles: { fillColor: hex(orange), textColor: '#ffffff', fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: { fillColor: '#f7f7f7' },
      margin: { left: 14, right: pw / 2 + 2 },
    });

    // Measurements start vs end comparison
    if (measurements.entries.length >= 2) {
      const first = measurements.entries[0];
      const last = measurements.entries[measurements.entries.length - 1];
      const allKeys = Array.from(new Set([...Object.keys(first.measurements), ...Object.keys(last.measurements)]));
      const fmtKey = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/\b\w/g, (c) => c.toUpperCase());
      cy = ((doc as any).lastAutoTable?.finalY ?? cy) + 8;
      cy = ensureY(cy, 20);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor('#666666');
      doc.text(`Measurements: ${fmtDate(first.date)} → ${fmtDate(last.date)}`, 14, cy); cy += 4;
      autoTable(doc, {
        startY: cy,
        head: [['Measurement', `${fmtDate(first.date)} (start)`, `${fmtDate(last.date)} (end)`, 'Change']],
        body: allKeys.map((k) => {
          const s = first.measurements[k]; const e = last.measurements[k];
          const diff = s != null && e != null ? (e - s) : null;
          const diffStr = diff != null ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}"` : '—';
          return [fmtKey(k), s != null ? `${s}"` : '—', e != null ? `${e}"` : '—', diffStr];
        }),
        theme: 'grid',
        headStyles: { fillColor: hex(orange), textColor: '#ffffff', fontSize: 7 },
        bodyStyles: { fontSize: 7 },
        alternateRowStyles: { fillColor: '#f7f7f7' },
        didParseCell: (hook) => {
          if (hook.column.index === 3 && hook.section === 'body') {
            const val = String(hook.cell.raw);
            if (val.startsWith('-')) hook.cell.styles.textColor = hex(green);
            else if (val.startsWith('+')) hook.cell.styles.textColor = hex('#e85757');
          }
        },
        margin: { left: 14, right: 14 },
      });
      cy = ((doc as any).lastAutoTable?.finalY ?? cy) + 6;
    }

    // Full measurements history
    if (measurements.entries.length > 0) {
      const measureKeys = Array.from(new Set(measurements.entries.flatMap((e) => Object.keys(e.measurements))));
      cy = ensureY(cy, 20);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor('#666666');
      doc.text('Full Measurement History', 14, cy); cy += 4;
      const measureColors: Record<string, string> = {
        chest: orange, waist: green, hips: blue, shoulders: '#a855f7',
        leftBicep: '#f59e0b', rightBicep: '#eab308', leftThigh: '#06b6d4', rightThigh: '#0ea5e9', neck: '#ec4899',
      };
      if (measurements.entries.length > 2) {
        const chartSeries = measureKeys.map((k) => ({
          name: k.replace(/([A-Z])/g, ' $1').replace(/\b\w/g, (c) => c.toUpperCase()),
          color: measureColors[k] || '#888888',
          points: measurements.entries.filter((e) => e.measurements[k] != null).map((e) => ({ label: fmtDate(e.date), value: e.measurements[k] })),
        })).filter((s) => s.points.length > 1);
        if (chartSeries.length > 0) {
          cy = ensureY(cy, 46);
          drawLineChart(14, cy, pw - 28, 36, chartSeries);
          cy += 42;
        }
      }
      autoTable(doc, {
        startY: cy,
        head: [['Date', ...measureKeys.map((k) => k.replace(/([A-Z])/g, ' $1').replace(/\b\w/g, (c) => c.toUpperCase()))]],
        body: measurements.entries.map((e) => [fmtDate(e.date), ...measureKeys.map((k) => e.measurements[k] != null ? `${e.measurements[k]}"` : '—')]),
        theme: 'grid',
        headStyles: { fillColor: hex(orange), textColor: '#ffffff', fontSize: 6.5 },
        bodyStyles: { fontSize: 7 },
        alternateRowStyles: { fillColor: '#f7f7f7' },
        margin: { left: 14, right: 14 },
      });
      cy = ((doc as any).lastAutoTable?.finalY ?? cy) + 6;
    }
  }

  // ── STEPS ──
  if (steps.entries.length > 0) {
    cy = ensureY(cy, 40);
    if (cy < 20) cy = 20;
    sectionHead('STEPS', cy); cy += 8;

    if (steps.entries.length > 2) {
      cy = ensureY(cy, 46);
      drawLineChart(14, cy, pw - 28, 36, [{ name: 'Steps', color: '#06b6d4', points: steps.entries.map((e) => ({ label: fmtDate(e.date), value: e.steps })) }]);
      cy += 42;
    }

    autoTable(doc, {
      startY: cy,
      head: [['Date', 'Steps']],
      body: [
        ...steps.entries.map((e) => [fmtDate(e.date), e.steps.toLocaleString()]),
        ['Average', steps.avgDailySteps.toLocaleString()],
      ],
      theme: 'grid',
      headStyles: { fillColor: hex('#06b6d4'), textColor: '#ffffff', fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: { fillColor: '#f7f7f7' },
      margin: { left: 14, right: pw / 2 + 2 },
    });
    cy = ((doc as any).lastAutoTable?.finalY ?? cy) + 6;
  }

  // ── CHECK-INS ──
  if (checkIns.entries.length > 0) {
    cy = ensureY(cy, 50);
    if (cy < 20) { doc.addPage(); cy = 14; }
    sectionHead('CHECK-INS', cy); cy += 8;

    // Averages
    const questionsWithData = DEFAULT_CHECKIN_QUESTIONS.filter((q) => checkIns.avgScores[q.id] != null);
    autoTable(doc, {
      startY: cy,
      head: [['Question', 'Avg Score', 'Rating']],
      body: questionsWithData.map((q) => {
        const score = checkIns.avgScores[q.id];
        const rating = score >= 7.5 ? 'Excellent' : score >= 6 ? 'Good' : score >= 4 ? 'Moderate' : 'Needs Attention';
        return [q.label, String(score), rating];
      }),
      theme: 'grid',
      headStyles: { fillColor: hex('#5b6ef5'), textColor: '#ffffff', fontSize: 7 },
      bodyStyles: { fontSize: 7.5 },
      alternateRowStyles: { fillColor: '#f7f7f7' },
      didParseCell: (hook) => {
        if (hook.column.index === 2 && hook.section === 'body') {
          const val = String(hook.cell.raw);
          if (val === 'Excellent') hook.cell.styles.textColor = hex(green);
          else if (val === 'Needs Attention') hook.cell.styles.textColor = hex('#e85757');
        }
      },
      margin: { left: 14, right: 14 },
    });
    cy = ((doc as any).lastAutoTable?.finalY ?? cy) + 6;

    // Trend chart for key metrics
    if (checkIns.entries.length > 2) {
      const keyMetrics = ['mood', 'sleep', 'energy', 'soreness'];
      const trendColors: Record<string, string> = { mood: orange, sleep: blue, energy: '#2e9e6b', soreness: '#a855f7' };
      const trendSeries = keyMetrics
        .filter((id) => checkIns.avgScores[id] != null)
        .map((id) => ({
          name: DEFAULT_CHECKIN_QUESTIONS.find((q) => q.id === id)?.label || id,
          color: trendColors[id] || '#888',
          points: checkIns.entries
            .map((c) => {
              const r = c.responses.find((r) => r.questionId === id);
              return r && typeof r.value === 'number' ? { label: fmtDate(c.date), value: r.value } : null;
            })
            .filter(Boolean) as { label: string; value: number }[],
        })).filter((s) => s.points.length > 1);

      if (trendSeries.length > 0) {
        cy = ensureY(cy, 50);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor('#666666');
        doc.text('Trend: Mood / Sleep / Energy / Soreness (1–10)', 14, cy); cy += 4;
        drawLineChart(14, cy, pw - 28, 36, trendSeries);
        cy += 42;
      }
    }

    // Full check-in history
    cy = ensureY(cy, 20);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor('#666666');
    doc.text('Check-in History', 14, cy); cy += 4;
    autoTable(doc, {
      startY: cy,
      head: [['Date', ...questionsWithData.map((q) => q.label.split(' ')[0])]],
      body: checkIns.entries.map((c) => [
        fmtDate(c.date),
        ...questionsWithData.map((q) => {
          const r = c.responses.find((r) => r.questionId === q.id);
          return r ? String(r.value) : '—';
        }),
      ]),
      theme: 'grid',
      headStyles: { fillColor: hex('#5b6ef5'), textColor: '#ffffff', fontSize: 6.5 },
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: { fillColor: '#f7f7f7' },
      margin: { left: 14, right: 14 },
    });
    cy = ((doc as any).lastAutoTable?.finalY ?? cy) + 6;
  }

  // ── PROGRESS PHOTOS ──
  if (photos.all.length > 0) {
    doc.addPage();
    cy = 14;
    sectionHead('PROGRESS PHOTOS', cy); cy += 8;

    const cols = 2, gap = 6, marginX = 14;
    const cellW = (pw - marginX * 2 - gap * (cols - 1)) / cols;
    const maxImgH = 90, captionH = 10;
    let col = 0, rowTop = cy, rowMaxH = 0;

    for (const p of photos.all) {
      const { w: iw, h: ih, fmt } = await loadImgSize(p.imageData);
      let drawW = cellW, drawH = (ih / iw) * drawW;
      if (drawH > maxImgH) { drawH = maxImgH; drawW = (iw / ih) * drawH; }
      const cellH = drawH + captionH;
      if (col === 0) {
        rowMaxH = 0;
        if (rowTop + cellH > ph - 14) { doc.addPage(); rowTop = 14; }
      }
      const cellX = marginX + col * (cellW + gap);
      const imgX = cellX + (cellW - drawW) / 2;
      try { doc.addImage(p.imageData, fmt, imgX, rowTop, drawW, drawH, undefined, 'FAST'); } catch { /* skip */ }
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor('#111111');
      doc.text(fmtDateFull(p.date), cellX, rowTop + drawH + 4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor('#888888');
      const poseStr = p.pose.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      doc.text(`${poseStr}${p.weight != null ? ` · ${p.weight} lbs` : ''}`, cellX, rowTop + drawH + 8);
      rowMaxH = Math.max(rowMaxH, cellH);
      col++;
      if (col >= cols) { col = 0; rowTop += rowMaxH + 8; }
    }
  }

  addFooter();

  const slug = config.profile.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const filename = `ape-report-${slug}-${config.startDate}.pdf`;

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({ suggestedName: filename, types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }] });
      const w = await handle.createWritable();
      await w.write(doc.output('blob'));
      await w.close();
      return;
    } catch (e: any) { if (e?.name === 'AbortError') return; }
  }
  doc.save(filename);
}

export function openReportForPrint(html: string): void {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

const MIME_EXTENSIONS: Record<string, string> = {
  'text/csv': '.csv', 'text/html': '.html', 'application/json': '.json', 'application/pdf': '.pdf',
};

export async function downloadFile(content: string, filename: string, mimeType: string): Promise<void> {
  const blob = new Blob([content], { type: mimeType });
  if ('showSaveFilePicker' in window) {
    try {
      const ext = MIME_EXTENSIONS[mimeType] || '';
      const handle = await (window as any).showSaveFilePicker({ suggestedName: filename, types: ext ? [{ description: filename, accept: { [mimeType]: [ext] } }] : undefined });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return;
    } catch (e: any) { if (e?.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
