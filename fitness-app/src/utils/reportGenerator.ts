import type { WorkoutSession, FoodEntry, Measurement, Program, Profile, ProgressPhoto } from '../types';
import { getSessionsByProfile } from '../db/workouts';
import { getFoodEntriesByProfile } from '../db/nutrition';
import { getMeasurementsByProfile, getPhotosByProfile } from '../db/progress';
import { getAllPrograms } from '../db/programs';
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
  exercises: { name: string; sets: { weight: number; reps: number }[] }[];
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
    totalDaysLogged: number;
    calorieTarget: number;
    daysOnTarget: number;
  };
  workouts: {
    sessions: DailyWorkout[];
    totalSessions: number;
    totalVolume: number;
    avgSessionDuration: number;
    daysPerWeek: number;
  };
  bodyweight: {
    entries: { date: string; weight: number }[];
    startWeight: number | null;
    endWeight: number | null;
    change: number | null;
  };
  measurements: {
    entries: { date: string; measurements: Record<string, number> }[];
  };
  photos: {
    start: ProgressPhoto[];
    end: ProgressPhoto[];
    all: ProgressPhoto[];
  };
}

export async function generateReport(config: ReportConfig): Promise<ReportData> {
  const { profileId, profile, startDate, endDate } = config;

  const [sessions, foodEntries, measurements, programs, photos] = await Promise.all([
    getSessionsByProfile(profileId),
    getFoodEntriesByProfile(profileId),
    getMeasurementsByProfile(profileId),
    getAllPrograms(),
    getPhotosByProfile(profileId),
  ]);

  // Filter photos for start/end of period
  const filteredPhotos = photos.filter((p) => p.date >= startDate && p.date <= endDate);
  const sortedPhotos = filteredPhotos.sort((a, b) => a.date.localeCompare(b.date));
  const startPhotos = sortedPhotos.filter((p) => p.date <= startDate || sortedPhotos.indexOf(p) < 4).slice(0, 4);
  const endPhotos = sortedPhotos.filter((p) => p.date >= endDate || sortedPhotos.indexOf(p) >= sortedPhotos.length - 4).slice(-4);

  // Use first few and last few photos as before/after
  const reportStartPhotos = sortedPhotos.slice(0, 4);
  const reportEndPhotos = sortedPhotos.length > 4 ? sortedPhotos.slice(-4) : [];

  // Filter by date range
  const filteredSessions = sessions.filter((s) => s.date >= startDate && s.date <= endDate);
  const filteredFood = foodEntries.filter((f) => f.date >= startDate && f.date <= endDate);
  const filteredMeasurements = measurements.filter((m) => m.date >= startDate && m.date <= endDate);

  // --- Nutrition ---
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
  const avgCal = daysLogged > 0 ? dailyNutrition.reduce((s, d) => s + d.calories, 0) / daysLogged : 0;
  const avgP = daysLogged > 0 ? dailyNutrition.reduce((s, d) => s + d.protein, 0) / daysLogged : 0;
  const avgC = daysLogged > 0 ? dailyNutrition.reduce((s, d) => s + d.carbs, 0) / daysLogged : 0;
  const avgF = daysLogged > 0 ? dailyNutrition.reduce((s, d) => s + d.fat, 0) / daysLogged : 0;
  const target = profile.macroTargets.calories;
  const daysOnTarget = dailyNutrition.filter((d) => d.calories >= target * 0.9 && d.calories <= target * 1.1).length;

  // --- Workouts ---
  const workoutDays: DailyWorkout[] = filteredSessions.map((session) => {
    const prog = programs.find((p) => p.id === session.programId);
    const day = prog?.days.find((d) => d.id === session.dayId);
    const duration = session.endTime ? Math.round((session.endTime - session.startTime) / 60000) : 0;

    let totalSets = 0;
    let totalVolume = 0;
    const exercises: DailyWorkout['exercises'] = [];

    for (const [exerciseId, sets] of Object.entries(session.sets)) {
      const ex = day?.exercises.find((e) => e.id === exerciseId);
      const completedSets = sets.filter((s) => s.completed);
      totalSets += completedSets.length;
      const exVolume = completedSets.reduce((s, set) => s + set.weight * set.reps, 0);
      totalVolume += exVolume;
      exercises.push({
        name: ex?.name || exerciseId,
        sets: completedSets.map((s) => ({ weight: s.weight, reps: s.reps })),
      });
    }

    return {
      date: session.date,
      programName: prog?.name || 'Unknown',
      dayTitle: day?.title || day?.tag || 'Workout',
      duration,
      totalSets,
      totalVolume,
      exercises,
      notes: session.notes,
    };
  }).sort((a, b) => a.date.localeCompare(b.date));

  const totalSessions = workoutDays.length;
  const totalVolume = workoutDays.reduce((s, w) => s + w.totalVolume, 0);
  const avgDuration = totalSessions > 0 ? workoutDays.reduce((s, w) => s + w.duration, 0) / totalSessions : 0;
  const daySpan = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (7 * 24 * 60 * 60 * 1000)));
  const daysPerWeek = totalSessions / daySpan;

  // --- Bodyweight ---
  const weightEntries = filteredMeasurements
    .filter((m) => m.weight != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ date: m.date, weight: m.weight! }));
  const startWeight = weightEntries.length > 0 ? weightEntries[0].weight : null;
  const endWeight = weightEntries.length > 0 ? weightEntries[weightEntries.length - 1].weight : null;
  const weightChange = startWeight != null && endWeight != null ? endWeight - startWeight : null;

  // --- Measurements ---
  const measurementEntries = filteredMeasurements
    .filter((m) => m.measurements && Object.keys(m.measurements).length > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ date: m.date, measurements: m.measurements as Record<string, number> }));

  return {
    config,
    nutrition: {
      dailyLog: dailyNutrition,
      avgCalories: Math.round(avgCal),
      avgProtein: Math.round(avgP),
      avgCarbs: Math.round(avgC),
      avgFat: Math.round(avgF),
      totalDaysLogged: daysLogged,
      calorieTarget: target,
      daysOnTarget,
    },
    workouts: {
      sessions: workoutDays,
      totalSessions,
      totalVolume,
      avgSessionDuration: Math.round(avgDuration),
      daysPerWeek: Math.round(daysPerWeek * 10) / 10,
    },
    bodyweight: { entries: weightEntries, startWeight, endWeight, change: weightChange },
    measurements: { entries: measurementEntries },
    photos: { start: reportStartPhotos, end: reportEndPhotos, all: sortedPhotos },
  };
}

export function generateCSV(data: ReportData): string {
  const lines: string[] = [];
  const { config, nutrition, workouts, bodyweight } = data;

  lines.push(`APE Client Report`);
  lines.push(`Client,${config.profile.name}`);
  lines.push(`Period,${config.startDate} to ${config.endDate}`);
  lines.push(`Generated,${new Date().toISOString().split('T')[0]}`);
  lines.push('');

  // Summary
  lines.push('=== SUMMARY ===');
  lines.push(`Workouts,${workouts.totalSessions}`);
  lines.push(`Avg Sessions/Week,${workouts.daysPerWeek}`);
  lines.push(`Avg Session Duration (min),${workouts.avgSessionDuration}`);
  lines.push(`Total Volume (lbs),${workouts.totalVolume.toLocaleString()}`);
  lines.push(`Days Nutrition Logged,${nutrition.totalDaysLogged}`);
  lines.push(`Avg Daily Calories,${nutrition.avgCalories}`);
  lines.push(`Avg Protein (g),${nutrition.avgProtein}`);
  lines.push(`Avg Carbs (g),${nutrition.avgCarbs}`);
  lines.push(`Avg Fat (g),${nutrition.avgFat}`);
  lines.push(`Calorie Target,${nutrition.calorieTarget}`);
  lines.push(`Days On Target (±10%),${nutrition.daysOnTarget}`);
  if (bodyweight.change != null) {
    lines.push(`Weight Change,${bodyweight.change > 0 ? '+' : ''}${bodyweight.change.toFixed(1)} lbs`);
  }
  lines.push('');

  // Daily nutrition
  lines.push('=== DAILY NUTRITION ===');
  lines.push('Date,Calories,Protein (g),Carbs (g),Fat (g),Fiber (g),Entries');
  for (const d of nutrition.dailyLog) {
    lines.push(`${d.date},${Math.round(d.calories)},${Math.round(d.protein)},${Math.round(d.carbs)},${Math.round(d.fat)},${Math.round(d.fiber)},${d.entries}`);
  }
  lines.push('');

  // Workouts
  lines.push('=== WORKOUTS ===');
  lines.push('Date,Program,Day,Duration (min),Sets,Volume (lbs)');
  for (const w of workouts.sessions) {
    lines.push(`${w.date},${w.programName},${w.dayTitle},${w.duration},${w.totalSets},${w.totalVolume}`);
  }
  lines.push('');

  // Workout details
  lines.push('=== WORKOUT DETAILS ===');
  for (const w of workouts.sessions) {
    lines.push(`${w.date} - ${w.dayTitle}`);
    for (const ex of w.exercises) {
      const setsStr = ex.sets.map((s) => `${s.weight}x${s.reps}`).join(' | ');
      lines.push(`,${ex.name},${setsStr}`);
    }
    if (w.notes) lines.push(`,Notes:,${w.notes}`);
  }
  lines.push('');

  // Bodyweight
  if (bodyweight.entries.length > 0) {
    lines.push('=== BODYWEIGHT ===');
    lines.push('Date,Weight (lbs)');
    for (const e of bodyweight.entries) {
      lines.push(`${e.date},${e.weight}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Build an SVG multi-series line chart for embedding in HTML reports. */
function svgLineChart(
  series: { name: string; color: string; points: { label: string; value: number }[] }[],
  opts: { width?: number; height?: number; unit?: string } = {}
): string {
  const width = opts.width ?? 760;
  const height = opts.height ?? 240;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const allVals = series.flatMap((s) => s.points.map((p) => p.value));
  if (allVals.length === 0) return '';
  let min = Math.min(...allVals);
  let max = Math.max(...allVals);
  if (min === max) { min -= 1; max += 1; }
  const range = max - min;
  min = min - range * 0.1;
  max = max + range * 0.1;

  const maxLen = Math.max(...series.map((s) => s.points.length));
  const xAt = (i: number) => padL + (maxLen <= 1 ? plotW / 2 : (i / (maxLen - 1)) * plotW);
  const yAt = (v: number) => padT + plotH - ((v - min) / (max - min)) * plotH;

  // Gridlines + y labels (4 steps)
  const grid: string[] = [];
  for (let g = 0; g <= 4; g++) {
    const v = min + ((max - min) * g) / 4;
    const y = yAt(v);
    grid.push(`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="#eee" stroke-width="1" />`);
    grid.push(`<text x="${padL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#aaa">${v.toFixed(0)}</text>`);
  }

  // X-axis labels (first, middle, last to avoid clutter)
  const labelSource = series.reduce((a, b) => (b.points.length > a.points.length ? b : a), series[0]);
  const xLabels: string[] = [];
  const idxs = labelSource.points.length <= 1 ? [0] : [0, Math.floor((labelSource.points.length - 1) / 2), labelSource.points.length - 1];
  for (const i of [...new Set(idxs)]) {
    const p = labelSource.points[i];
    if (!p) continue;
    xLabels.push(`<text x="${xAt(i).toFixed(1)}" y="${height - 12}" text-anchor="middle" font-size="9" fill="#888">${p.label}</text>`);
  }

  const paths = series.map((s) => {
    const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.value).toFixed(1)}`).join(' ');
    const dots = s.points.map((p, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(p.value).toFixed(1)}" r="2.5" fill="${s.color}" />`).join('');
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />${dots}`;
  }).join('');

  const legend = series.length > 1
    ? `<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:8px;">${series
        .map((s) => `<span style="font-size:10px;color:#666;display:inline-flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:${s.color};display:inline-block;"></span>${s.name}</span>`)
        .join('')}</div>`
    : '';

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:${width}px;display:block;margin:0 auto;font-family:inherit;">
    ${grid.join('')}
    ${paths}
    ${xLabels.join('')}
  </svg>${legend}`;
}

export function generateHTMLReport(data: ReportData): string {
  const { config, nutrition, workouts, bodyweight, measurements, photos } = data;

  const formatDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const poseLabel = (p: string) => p.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  // Weight chart
  const weightChartSVG = bodyweight.entries.length > 1
    ? svgLineChart([{ name: 'Weight', color: '#e8572a', points: bodyweight.entries.map((e) => ({ label: formatDate(e.date), value: e.weight })) }])
    : '';

  // Measurement chart (multi-series)
  const measureColors: Record<string, string> = {
    chest: '#e8572a', waist: '#2e9e6b', hips: '#3b82f6', shoulders: '#a855f7',
    leftArm: '#f59e0b', rightArm: '#eab308', leftThigh: '#06b6d4', rightThigh: '#0ea5e9', neck: '#ec4899',
  };
  const measureKeys = measurements.entries.length > 0
    ? Array.from(new Set(measurements.entries.flatMap((e) => Object.keys(e.measurements))))
    : [];
  const measureSeries = measureKeys.map((key) => ({
    name: key.replace(/([A-Z])/g, ' $1').replace(/\b\w/g, (c) => c.toUpperCase()),
    color: measureColors[key] || '#888',
    points: measurements.entries
      .filter((e) => e.measurements[key] != null)
      .map((e) => ({ label: formatDate(e.date), value: e.measurements[key] })),
  })).filter((s) => s.points.length > 1);
  const measureChartSVG = measureSeries.length > 0 ? svgLineChart(measureSeries) : '';

  // Full progress photo gallery — every photo with date + stats
  const photoGallery = (photoList: ProgressPhoto[]) => {
    if (photoList.length === 0) return '';
    return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(160px, 1fr));gap:12px;">
      ${photoList.map((p) => `
      <div style="border:1px solid #eee;border-radius:10px;overflow:hidden;background:#fafafa;">
        <img src="${p.imageData}" style="width:100%;aspect-ratio:3/4;object-fit:cover;display:block;" />
        <div style="padding:8px;">
          <div style="font-size:11px;font-weight:600;color:#111;">${formatDate(p.date)}</div>
          <div style="font-size:10px;color:#888;margin-top:2px;">${poseLabel(p.pose)}${p.weight != null ? ` · ${p.weight} lbs` : ''}</div>
        </div>
      </div>`).join('')}
    </div>`;
  };

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>APE Report — ${config.profile.name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #1a1a1a; padding: 32px; max-width: 850px; margin: 0 auto; line-height: 1.5; }
  .header { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
  .header img { height: 36px; }
  h1 { font-size: 22px; font-weight: 700; }
  h2 { font-size: 14px; color: #e8572a; margin: 32px 0 12px; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 2px solid #f0f0f0; padding-bottom: 6px; }
  .subtitle { color: #666; font-size: 13px; margin-bottom: 24px; }
  .card { background: #fafafa; border: 1px solid #eee; border-radius: 10px; padding: 16px; margin-bottom: 12px; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
  .stat { background: #f5f5f5; border: 1px solid #eee; border-radius: 8px; padding: 12px 8px; text-align: center; }
  .stat-value { font-size: 20px; font-weight: 700; color: #111; }
  .stat-label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { text-align: left; color: #888; font-size: 9px; text-transform: uppercase; padding: 6px 8px; border-bottom: 2px solid #eee; }
  td { padding: 5px 8px; border-bottom: 1px solid #f0f0f0; }
  .tag { display: inline-block; background: #f0f0f0; padding: 2px 8px; border-radius: 4px; font-size: 9px; color: #666; }
  .positive { color: #2e9e6b; }
  .negative { color: #e85757; }
  .workout-detail { margin: 8px 0; padding: 12px; background: #f9f9f9; border: 1px solid #eee; border-radius: 8px; }
  .exercise-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px; }
  .sets-display { color: #666; font-size: 10px; }
  .note { font-style: italic; color: #888; font-size: 10px; margin-top: 6px; }
  .page-break { page-break-before: always; }
  @media print { body { padding: 16px; } .page-break { page-break-before: always; } }
</style>
</head>
<body>
<div class="header">
  <img src="${typeof window !== 'undefined' ? window.location.origin + import.meta.env.BASE_URL : ''}logo-head-black.png" alt="APE" onerror="this.style.display='none'" />
  <h1>APE Client Report</h1>
</div>
<div class="subtitle"><strong>${config.profile.name}</strong> · ${formatDate(config.startDate)} — ${formatDate(config.endDate)}</div>

<h2>Overview</h2>
<div class="stats-grid">
  <div class="stat"><div class="stat-value">${workouts.totalSessions}</div><div class="stat-label">Workouts</div></div>
  <div class="stat"><div class="stat-value">${workouts.daysPerWeek}</div><div class="stat-label">Days/Week</div></div>
  <div class="stat"><div class="stat-value">${workouts.avgSessionDuration}m</div><div class="stat-label">Avg Duration</div></div>
  <div class="stat"><div class="stat-value">${(workouts.totalVolume / 1000).toFixed(0)}k</div><div class="stat-label">Total Volume</div></div>
  <div class="stat"><div class="stat-value">${nutrition.avgCalories}</div><div class="stat-label">Avg Calories</div></div>
  <div class="stat"><div class="stat-value">${nutrition.avgProtein}g</div><div class="stat-label">Avg Protein</div></div>
  <div class="stat"><div class="stat-value">${nutrition.daysOnTarget}/${nutrition.totalDaysLogged}</div><div class="stat-label">Days On Target</div></div>
  ${bodyweight.change != null ? `<div class="stat"><div class="stat-value ${bodyweight.change < 0 ? 'positive' : bodyweight.change > 0 ? 'negative' : ''}">${bodyweight.change > 0 ? '+' : ''}${bodyweight.change.toFixed(1)}</div><div class="stat-label">Weight Δ (lbs)</div></div>` : ''}
</div>

${photos.all.length > 0 ? `
<div class="page-break"></div>
<h2>Progress Photos</h2>
<div class="card">
  ${photoGallery(photos.all)}
</div>` : ''}

<h2>Nutrition</h2>
<div class="card">
  <table>
    <thead><tr><th>Date</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead>
    <tbody>
      ${nutrition.dailyLog.map((d) => `<tr><td>${formatDate(d.date)}</td><td>${Math.round(d.calories)}</td><td>${Math.round(d.protein)}g</td><td>${Math.round(d.carbs)}g</td><td>${Math.round(d.fat)}g</td></tr>`).join('')}
    </tbody>
  </table>
</div>

<h2>Training</h2>
${workouts.sessions.map((w) => `
<div class="workout-detail">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
    <strong>${formatDate(w.date)} — ${w.dayTitle}</strong>
    <span class="tag">${w.duration}min · ${w.totalSets} sets · ${w.totalVolume.toLocaleString()} lbs</span>
  </div>
  ${w.exercises.map((ex) => `<div class="exercise-row"><span>${ex.name}</span><span class="sets-display">${ex.sets.map((s) => `${s.weight}×${s.reps}`).join(', ')}</span></div>`).join('')}
  ${w.notes ? `<div class="note">${w.notes}</div>` : ''}
</div>`).join('')}

${bodyweight.entries.length > 0 ? `
<h2>Body Weight</h2>
<div class="card">
  ${weightChartSVG}
  <table style="margin-top:${weightChartSVG ? '16px' : '0'};">
    <thead><tr><th>Date</th><th>Weight (lbs)</th></tr></thead>
    <tbody>${bodyweight.entries.map((e) => `<tr><td>${formatDate(e.date)}</td><td>${e.weight}</td></tr>`).join('')}</tbody>
  </table>
</div>` : ''}

${measurements.entries.length > 0 ? `
<h2>Measurements</h2>
<div class="card">
  ${measureChartSVG}
  <table style="margin-top:${measureChartSVG ? '16px' : '0'};">
    <thead><tr><th>Date</th>${Object.keys(measurements.entries[0]?.measurements || {}).map((k) => `<th>${k}</th>`).join('')}</tr></thead>
    <tbody>${measurements.entries.map((e) => `<tr><td>${formatDate(e.date)}</td>${Object.values(e.measurements).map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>
</div>` : ''}

<div style="margin-top:40px;text-align:center;color:#999;font-size:9px;">
  Generated by APE (Aesthetic Physique Enthusiast) · ${new Date().toLocaleDateString()} · Print this page to save as PDF
</div>
</body>
</html>`;
}

export async function generatePDFReport(data: ReportData): Promise<void> {
  const { config, nutrition, workouts, bodyweight, measurements, photos } = data;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const orange = '#e8572a';
  const formatDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  type RGB = [number, number, number];
  const hexToRgb = (hex: string): RGB => {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };

  // Draw a multi-series line chart with jsPDF primitives.
  const drawLineChart = (
    x: number,
    y: number,
    w: number,
    h: number,
    series: { name: string; color: string; points: { label: string; value: number }[] }[]
  ) => {
    const padL = 12;
    const padB = 8;
    const plotX = x + padL;
    const plotY = y;
    const plotW = w - padL;
    const plotH = h - padB;

    const allVals = series.flatMap((s) => s.points.map((p) => p.value));
    if (allVals.length === 0) return;
    let min = Math.min(...allVals);
    let max = Math.max(...allVals);
    if (min === max) { min -= 1; max += 1; }
    const r = max - min;
    min -= r * 0.1;
    max += r * 0.1;

    const maxLen = Math.max(...series.map((s) => s.points.length));
    const xAt = (i: number) => plotX + (maxLen <= 1 ? plotW / 2 : (i / (maxLen - 1)) * plotW);
    const yAt = (v: number) => plotY + plotH - ((v - min) / (max - min)) * plotH;

    // Gridlines + y labels
    doc.setFontSize(6);
    doc.setTextColor('#aaaaaa');
    doc.setDrawColor(235, 235, 235);
    doc.setLineWidth(0.2);
    for (let g = 0; g <= 4; g++) {
      const v = min + ((max - min) * g) / 4;
      const gy = yAt(v);
      doc.line(plotX, gy, plotX + plotW, gy);
      doc.text(v.toFixed(0), plotX - 1.5, gy + 1, { align: 'right' });
    }

    // Series lines + dots
    for (const s of series) {
      const [cr, cg, cb] = hexToRgb(s.color);
      doc.setDrawColor(cr, cg, cb);
      doc.setFillColor(cr, cg, cb);
      doc.setLineWidth(0.6);
      for (let i = 1; i < s.points.length; i++) {
        doc.line(xAt(i - 1), yAt(s.points[i - 1].value), xAt(i), yAt(s.points[i].value));
      }
      for (let i = 0; i < s.points.length; i++) {
        doc.circle(xAt(i), yAt(s.points[i].value), 0.7, 'F');
      }
    }

    // X labels (first / mid / last)
    const longest = series.reduce((a, b) => (b.points.length > a.points.length ? b : a), series[0]);
    doc.setTextColor('#888888');
    const idxs = longest.points.length <= 1 ? [0] : [0, Math.floor((longest.points.length - 1) / 2), longest.points.length - 1];
    for (const i of [...new Set(idxs)]) {
      const p = longest.points[i];
      if (!p) continue;
      doc.text(p.label, xAt(i), plotY + plotH + 5, { align: 'center' });
    }

    // Legend
    if (series.length > 1) {
      let lx = plotX;
      const ly = plotY + plotH + 9;
      doc.setFontSize(6);
      for (const s of series) {
        const [cr, cg, cb] = hexToRgb(s.color);
        doc.setFillColor(cr, cg, cb);
        doc.rect(lx, ly - 1.6, 2, 2, 'F');
        doc.setTextColor('#666666');
        doc.text(s.name, lx + 3, ly);
        lx += s.name.length * 1.6 + 8;
      }
    }
  };

  const loadImageSize = (src: string): Promise<{ w: number; h: number; fmt: string }> =>
    new Promise((resolve) => {
      const fmt = src.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 3, h: img.naturalHeight || 4, fmt });
      img.onerror = () => resolve({ w: 3, h: 4, fmt });
      img.src = src;
    });

  const addFooter = () => {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor('#999999');
      doc.text(
        `Generated by APE · ${new Date().toLocaleDateString()} · Page ${i}/${pageCount}`,
        pageWidth / 2,
        290,
        { align: 'center' }
      );
    }
  };

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor('#111111');
  doc.text('APE Client Report', 14, 20);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor('#666666');
  doc.text(`${config.profile.name} — ${formatDate(config.startDate)} to ${formatDate(config.endDate)}`, 14, 27);

  // Overview table
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(orange);
  doc.text('OVERVIEW', 14, 38);

  const overviewRows: string[][] = [
    ['Workouts', String(workouts.totalSessions)],
    ['Days/Week', String(workouts.daysPerWeek)],
    ['Avg Duration (min)', String(workouts.avgSessionDuration)],
    ['Total Volume (lbs)', workouts.totalVolume.toLocaleString()],
    ['Avg Daily Calories', String(nutrition.avgCalories)],
    ['Avg Protein (g)', String(nutrition.avgProtein)],
    ['Avg Carbs (g)', String(nutrition.avgCarbs)],
    ['Avg Fat (g)', String(nutrition.avgFat)],
    ['Days on Target (±10%)', `${nutrition.daysOnTarget} / ${nutrition.totalDaysLogged}`],
  ];
  if (bodyweight.change != null) {
    overviewRows.push(['Weight Change', `${bodyweight.change > 0 ? '+' : ''}${bodyweight.change.toFixed(1)} lbs`]);
  }

  autoTable(doc, {
    startY: 41,
    head: [['Metric', 'Value']],
    body: overviewRows,
    theme: 'grid',
    headStyles: { fillColor: orange, textColor: '#ffffff', fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: '#f5f5f5' },
    margin: { left: 14, right: 14 },
  });

  // Nutrition table
  let curY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 120;
  if (curY > 240) { doc.addPage(); curY = 20; }
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(orange);
  doc.text('DAILY NUTRITION', 14, curY + 10);

  const nutritionRows = nutrition.dailyLog.map((d) => [
    formatDate(d.date),
    String(Math.round(d.calories)),
    String(Math.round(d.protein)),
    String(Math.round(d.carbs)),
    String(Math.round(d.fat)),
  ]);
  nutritionRows.push([
    'Average',
    String(nutrition.avgCalories),
    String(nutrition.avgProtein),
    String(nutrition.avgCarbs),
    String(nutrition.avgFat),
  ]);

  autoTable(doc, {
    startY: curY + 13,
    head: [['Date', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)']],
    body: nutritionRows,
    theme: 'grid',
    headStyles: { fillColor: orange, textColor: '#ffffff', fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    alternateRowStyles: { fillColor: '#f5f5f5' },
    margin: { left: 14, right: 14 },
  });

  // Training log
  curY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;
  if (curY > 240) { doc.addPage(); curY = 20; }
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(orange);
  doc.text('TRAINING LOG', 14, curY + 10);

  const trainingRows = workouts.sessions.map((w) => [
    formatDate(w.date),
    w.dayTitle,
    String(w.duration),
    String(w.totalSets),
    w.totalVolume.toLocaleString(),
  ]);

  autoTable(doc, {
    startY: curY + 13,
    head: [['Date', 'Workout', 'Duration (min)', 'Sets', 'Volume (lbs)']],
    body: trainingRows,
    theme: 'grid',
    headStyles: { fillColor: orange, textColor: '#ffffff', fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    alternateRowStyles: { fillColor: '#f5f5f5' },
    margin: { left: 14, right: 14 },
  });

  // Body weight
  if (bodyweight.entries.length > 0) {
    curY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;
    if (curY > 200) { doc.addPage(); curY = 20; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(orange);
    doc.text('BODY WEIGHT', 14, curY + 10);

    // Line chart
    if (bodyweight.entries.length > 1) {
      drawLineChart(14, curY + 16, pageWidth - 28, 50, [
        { name: 'Weight', color: orange, points: bodyweight.entries.map((e) => ({ label: formatDate(e.date), value: e.weight })) },
      ]);
      curY += 60;
    }

    autoTable(doc, {
      startY: curY + 13,
      head: [['Date', 'Weight (lbs)']],
      body: bodyweight.entries.map((e) => [formatDate(e.date), String(e.weight)]),
      theme: 'grid',
      headStyles: { fillColor: orange, textColor: '#ffffff', fontSize: 8 },
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: { fillColor: '#f5f5f5' },
      margin: { left: 14, right: 14 },
    });
  }

  // Measurements (chart + table)
  if (measurements.entries.length > 0) {
    const measureColors: Record<string, string> = {
      chest: '#e8572a', waist: '#2e9e6b', hips: '#3b82f6', shoulders: '#a855f7',
      leftArm: '#f59e0b', rightArm: '#eab308', leftThigh: '#06b6d4', rightThigh: '#0ea5e9', neck: '#ec4899',
    };
    const measureKeys = Array.from(new Set(measurements.entries.flatMap((e) => Object.keys(e.measurements))));
    const measureSeries = measureKeys.map((key) => ({
      name: key.replace(/([A-Z])/g, ' $1').replace(/\b\w/g, (c) => c.toUpperCase()),
      color: measureColors[key] || '#888888',
      points: measurements.entries
        .filter((e) => e.measurements[key] != null)
        .map((e) => ({ label: formatDate(e.date), value: e.measurements[key] })),
    })).filter((s) => s.points.length > 0);

    curY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;
    if (curY > 190) { doc.addPage(); curY = 20; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(orange);
    doc.text('MEASUREMENTS', 14, curY + 10);

    const chartSeries = measureSeries.filter((s) => s.points.length > 1);
    if (chartSeries.length > 0) {
      drawLineChart(14, curY + 16, pageWidth - 28, 54, chartSeries);
      curY += 66;
    }

    autoTable(doc, {
      startY: curY + 13,
      head: [['Date', ...measureKeys.map((k) => k.replace(/([A-Z])/g, ' $1').replace(/\b\w/g, (c) => c.toUpperCase()))]],
      body: measurements.entries.map((e) => [formatDate(e.date), ...measureKeys.map((k) => (e.measurements[k] != null ? String(e.measurements[k]) : '—'))]),
      theme: 'grid',
      headStyles: { fillColor: orange, textColor: '#ffffff', fontSize: 7 },
      bodyStyles: { fontSize: 7 },
      alternateRowStyles: { fillColor: '#f5f5f5' },
      margin: { left: 14, right: 14 },
    });
  }

  // Progress Photos — embedded with date + stats, dedicated page(s)
  if (photos.all.length > 0) {
    doc.addPage();
    let py = 20;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(orange);
    doc.text('PROGRESS PHOTOS', 14, py);
    py += 8;

    const cols = 2;
    const gap = 8;
    const marginX = 14;
    const cellW = (pageWidth - marginX * 2 - gap * (cols - 1)) / cols;
    const maxImgH = 95;
    const captionH = 10;

    let col = 0;
    let rowTop = py;
    let rowMaxH = 0;

    for (const p of photos.all) {
      const { w: iw, h: ih, fmt } = await loadImageSize(p.imageData);
      let drawW = cellW;
      let drawH = (ih / iw) * drawW;
      if (drawH > maxImgH) {
        drawH = maxImgH;
        drawW = (iw / ih) * drawH;
      }
      const cellH = drawH + captionH;

      // New row?
      if (col === 0) {
        rowMaxH = 0;
        // Page break if row won't fit
        if (rowTop + cellH > pageHeight - 16) {
          doc.addPage();
          rowTop = 20;
        }
      }

      const cellX = marginX + col * (cellW + gap);
      const imgX = cellX + (cellW - drawW) / 2;
      try {
        doc.addImage(p.imageData, fmt, imgX, rowTop, drawW, drawH, undefined, 'FAST');
      } catch {
        // skip unrenderable image
      }

      // Caption
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor('#111111');
      doc.text(formatDate(p.date), cellX, rowTop + drawH + 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor('#888888');
      const poseTxt = p.pose.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      doc.text(`${poseTxt}${p.weight != null ? ` · ${p.weight} lbs` : ''}`, cellX, rowTop + drawH + 8);

      rowMaxH = Math.max(rowMaxH, cellH);
      col++;
      if (col >= cols) {
        col = 0;
        rowTop += rowMaxH + 8;
      }
    }
  }

  addFooter();

  const slug = config.profile.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  doc.save(`ape-report-${slug}-${config.startDate}.pdf`);
}

export function openReportForPrint(html: string): void {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
