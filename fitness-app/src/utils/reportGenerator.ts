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
    photos: { start: reportStartPhotos, end: reportEndPhotos },
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

export function generateHTMLReport(data: ReportData): string {
  const { config, nutrition, workouts, bodyweight, measurements, photos } = data;

  const formatDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const photoGrid = (photoList: typeof photos.start, label: string) => {
    if (photoList.length === 0) return '';
    return `
    <div style="margin-bottom:16px;">
      <h3 style="font-size:13px;color:#888;margin-bottom:8px;">${label}</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));gap:8px;">
        ${photoList.map((p) => `<div style="text-align:center;"><img src="${p.imageData}" style="width:100%;border-radius:8px;max-height:250px;object-fit:cover;" /><div style="font-size:10px;color:#888;margin-top:4px;">${p.pose} · ${formatDate(p.date)}</div></div>`).join('')}
      </div>
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
  <img src="logo-head-black.png" alt="APE" onerror="this.style.display='none'" />
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

${photos.start.length > 0 || photos.end.length > 0 ? `
<h2>Progress Photos</h2>
<div class="card">
  ${photoGrid(photos.start, 'Start of Period')}
  ${photoGrid(photos.end, 'End of Period')}
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
  <table>
    <thead><tr><th>Date</th><th>Weight (lbs)</th></tr></thead>
    <tbody>${bodyweight.entries.map((e) => `<tr><td>${formatDate(e.date)}</td><td>${e.weight}</td></tr>`).join('')}</tbody>
  </table>
</div>` : ''}

${measurements.entries.length > 0 ? `
<h2>Measurements</h2>
<div class="card">
  <table>
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
  const { config, nutrition, workouts, bodyweight } = data;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const orange = '#e8572a';
  const formatDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

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
    if (curY > 240) { doc.addPage(); curY = 20; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(orange);
    doc.text('BODY WEIGHT', 14, curY + 10);

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
