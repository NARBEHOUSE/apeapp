import type { WorkoutSession, FoodEntry, Measurement, CheckInEntry, StepEntry, MacroTargets, Profile, Program } from '../types';
import { getWeekDates, today } from './dateHelpers';

export interface CoachSuggestion {
  id: string;
  category: 'nutrition' | 'training' | 'recovery' | 'general';
  title: string;
  explanation: string;
  action?: {
    type: 'adjust_calories' | 'adjust_protein' | 'adjust_carbs' | 'adjust_fat' | 'deload' | 'none';
    value?: number;
    label: string;
  };
}

export interface CoachResponse {
  suggestions: CoachSuggestion[];
  summary: string;
  generatedAt: string;
}

interface CoachDataSnapshot {
  profile: {
    goal: string;
    fitnessGoal?: string;
    units: string;
    macroTargets: MacroTargets;
    currentWeight?: number;
  };
  training: {
    workoutsThisWeek: number;
    workoutsLastWeek: number;
    volumeThisWeek: number;
    volumeLastWeek: number;
    programName?: string;
    stalledExercises: string[];
  };
  nutrition: {
    avgCaloriesThisWeek: number;
    avgCaloriesLastWeek: number;
    proteinDaysHit: number;
    daysLogged: number;
    calorieTarget: number;
    proteinTarget: number;
  };
  weight: {
    latestWeight: number | null;
    weightChange7d: number | null;
    weightChange30d: number | null;
    weightUnit: string;
  };
  recovery: {
    avgMood: number | null;
    avgEnergy: number | null;
    avgSleep: number | null;
    avgSoreness: number | null;
    avgStress: number | null;
    checkInsThisWeek: number;
    trendDirection: 'improving' | 'declining' | 'stable' | 'insufficient_data';
  };
  steps: {
    avgSteps7d: number | null;
    avgStepsPrev7d: number | null;
    daysTracked: number;
  };
  micronutrients: {
    hasMicroData: boolean;
    avgFiber7d: number | null;
    avgSodium7d: number | null;
    avgIron7d: number | null;
    avgCalcium7d: number | null;
    avgVitaminD7d: number | null;
  };
}

function getLastNDays(n: number): Set<string> {
  const dates = new Set<string>();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today() + 'T00:00:00');
    d.setDate(d.getDate() - i);
    dates.add(d.toISOString().split('T')[0]);
  }
  return dates;
}

export function buildDataSnapshot(
  profile: Profile,
  sessions: WorkoutSession[],
  allFoodEntries: FoodEntry[],
  measurements: Measurement[],
  checkIns: CheckInEntry[],
  programs: Program[],
  stepEntries: StepEntry[] = [],
): CoachDataSnapshot {
  const last7 = getLastNDays(7);
  const prev7 = getLastNDays(14);
  const last30 = getLastNDays(30);

  // Training
  const weekSessions = sessions.filter((s) => last7.has(s.date));
  const prevSessions = sessions.filter((s) => prev7.has(s.date) && !last7.has(s.date));

  const calcVolume = (sess: WorkoutSession[]) =>
    sess.reduce((sum, s) =>
      sum + Object.values(s.sets).reduce((vs, sets) =>
        vs + sets.filter((st) => st.completed).reduce((a, st) => a + st.weight * st.reps, 0), 0), 0);

  // Detect stalled exercises (same max weight 3+ sessions)
  const exerciseMaxes: Record<string, number[]> = {};
  const recentSessions = [...sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  const activeProgram = profile.activeProgram ? programs.find((p) => p.id === profile.activeProgram!.programId) : null;
  const exerciseNames: Record<string, string> = {};
  if (activeProgram) {
    for (const day of activeProgram.days) {
      for (const ex of day.exercises) {
        exerciseNames[ex.id] = ex.name;
      }
    }
  }

  for (const s of recentSessions) {
    for (const [exId, sets] of Object.entries(s.sets)) {
      const completed = sets.filter((st) => st.completed && st.weight > 0);
      if (completed.length === 0) continue;
      const maxW = Math.max(...completed.map((st) => st.weight));
      const name = exerciseNames[exId] || exId;
      if (!exerciseMaxes[name]) exerciseMaxes[name] = [];
      exerciseMaxes[name].push(maxW);
    }
  }

  const stalledExercises: string[] = [];
  for (const [name, maxes] of Object.entries(exerciseMaxes)) {
    if (maxes.length >= 3 && maxes.slice(0, 3).every((m) => m === maxes[0])) {
      stalledExercises.push(`${name} (${maxes[0]} ${profile.units === 'metric' ? 'kg' : 'lbs'})`);
    }
  }

  // Nutrition
  const weekFood = allFoodEntries.filter((f) => last7.has(f.date));
  const prevFood = allFoodEntries.filter((f) => prev7.has(f.date) && !last7.has(f.date));

  const caloriesByDay = new Map<string, number>();
  const proteinByDay = new Map<string, number>();
  for (const f of weekFood) {
    caloriesByDay.set(f.date, (caloriesByDay.get(f.date) || 0) + f.calories * f.servingsConsumed);
    proteinByDay.set(f.date, (proteinByDay.get(f.date) || 0) + f.protein * f.servingsConsumed);
  }
  const daysLogged = caloriesByDay.size;
  const avgCals = daysLogged > 0 ? Math.round([...caloriesByDay.values()].reduce((a, b) => a + b, 0) / daysLogged) : 0;

  const prevCalsByDay = new Map<string, number>();
  for (const f of prevFood) prevCalsByDay.set(f.date, (prevCalsByDay.get(f.date) || 0) + f.calories * f.servingsConsumed);
  const prevDays = prevCalsByDay.size;
  const prevAvgCals = prevDays > 0 ? Math.round([...prevCalsByDay.values()].reduce((a, b) => a + b, 0) / prevDays) : 0;

  const proteinDaysHit = [...proteinByDay.values()].filter((p) => p >= profile.macroTargets.protein).length;

  // Weight
  const sortedWeights = measurements.filter((m) => m.weight != null).sort((a, b) => a.date.localeCompare(b.date));
  const latestWeight = sortedWeights.length > 0 ? sortedWeights[sortedWeights.length - 1].weight! : null;
  const week1Weights = sortedWeights.filter((m) => last7.has(m.date));
  const prevWeekWeights = sortedWeights.filter((m) => prev7.has(m.date) && !last7.has(m.date));
  const month1Weights = sortedWeights.filter((m) => last30.has(m.date));

  const weightChange7d = week1Weights.length > 0 && prevWeekWeights.length > 0
    ? week1Weights[week1Weights.length - 1].weight! - prevWeekWeights[prevWeekWeights.length - 1].weight!
    : null;
  const weightChange30d = month1Weights.length >= 2
    ? month1Weights[month1Weights.length - 1].weight! - month1Weights[0].weight!
    : null;

  // Recovery (check-ins)
  const weekCheckIns = checkIns.filter((c) => last7.has(c.date));
  const prevCheckIns = checkIns.filter((c) => prev7.has(c.date) && !last7.has(c.date));

  function avgScore(entries: CheckInEntry[], questionId: string): number | null {
    const vals = entries.flatMap((c) => c.responses.filter((r) => r.questionId === questionId && typeof r.value === 'number').map((r) => r.value as number));
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  const currentAvgAll = weekCheckIns.length > 0
    ? weekCheckIns.reduce((sum, ci) => {
        const nums = ci.responses.filter((r) => typeof r.value === 'number');
        return sum + (nums.length > 0 ? nums.reduce((a, r) => a + (r.value as number), 0) / nums.length : 0);
      }, 0) / weekCheckIns.length
    : null;
  const prevAvgAll = prevCheckIns.length > 0
    ? prevCheckIns.reduce((sum, ci) => {
        const nums = ci.responses.filter((r) => typeof r.value === 'number');
        return sum + (nums.length > 0 ? nums.reduce((a, r) => a + (r.value as number), 0) / nums.length : 0);
      }, 0) / prevCheckIns.length
    : null;

  let trendDirection: CoachDataSnapshot['recovery']['trendDirection'] = 'insufficient_data';
  if (currentAvgAll != null && prevAvgAll != null) {
    if (currentAvgAll > prevAvgAll + 0.3) trendDirection = 'improving';
    else if (currentAvgAll < prevAvgAll - 0.3) trendDirection = 'declining';
    else trendDirection = 'stable';
  }

  return {
    profile: {
      goal: profile.goal,
      fitnessGoal: profile.bodyStats?.fitnessGoal,
      units: profile.units,
      macroTargets: profile.macroTargets,
      currentWeight: latestWeight || profile.bodyStats?.weightKg,
    },
    training: {
      workoutsThisWeek: weekSessions.length,
      workoutsLastWeek: prevSessions.length,
      volumeThisWeek: Math.round(calcVolume(weekSessions)),
      volumeLastWeek: Math.round(calcVolume(prevSessions)),
      programName: activeProgram?.name,
      stalledExercises,
    },
    nutrition: {
      avgCaloriesThisWeek: avgCals,
      avgCaloriesLastWeek: prevAvgCals,
      proteinDaysHit,
      daysLogged,
      calorieTarget: profile.macroTargets.calories,
      proteinTarget: profile.macroTargets.protein,
    },
    weight: {
      latestWeight,
      weightChange7d,
      weightChange30d,
      weightUnit: profile.units === 'metric' ? 'kg' : 'lbs',
    },
    recovery: {
      avgMood: avgScore(weekCheckIns, 'mood'),
      avgEnergy: avgScore(weekCheckIns, 'energy'),
      avgSleep: avgScore(weekCheckIns, 'sleep'),
      avgSoreness: avgScore(weekCheckIns, 'soreness'),
      avgStress: avgScore(weekCheckIns, 'stress'),
      checkInsThisWeek: weekCheckIns.length,
      trendDirection,
    },
    steps: (() => {
      const weekSteps = stepEntries.filter((s) => last7.has(s.date));
      const prevSteps = stepEntries.filter((s) => prev7.has(s.date) && !last7.has(s.date));
      const avgW = weekSteps.length > 0 ? Math.round(weekSteps.reduce((a, s) => a + s.steps, 0) / weekSteps.length) : null;
      const avgP = prevSteps.length > 0 ? Math.round(prevSteps.reduce((a, s) => a + s.steps, 0) / prevSteps.length) : null;
      return { avgSteps7d: avgW, avgStepsPrev7d: avgP, daysTracked: weekSteps.length };
    })(),
    micronutrients: (() => {
      const weekFood = allFoodEntries.filter((f) => last7.has(f.date) && f.micronutrients);
      if (weekFood.length === 0) return { hasMicroData: false, avgFiber7d: null, avgSodium7d: null, avgIron7d: null, avgCalcium7d: null, avgVitaminD7d: null };
      function avgMicro(key: string): number | null {
        const vals = weekFood.map((f) => f.micronutrients?.[key]).filter((v): v is number => v != null && v > 0);
        return vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
      }
      return {
        hasMicroData: true,
        avgFiber7d: avgMicro('Fiber (g)'),
        avgSodium7d: avgMicro('Sodium (mg)'),
        avgIron7d: avgMicro('Iron (mg)'),
        avgCalcium7d: avgMicro('Calcium (mg)'),
        avgVitaminD7d: avgMicro('Vitamin D (mcg)'),
      };
    })(),
  };
}

const SYSTEM_PROMPT = `You are a fitness coaching assistant inside a workout tracking app. You analyze the user's recent training, nutrition, weight, and recovery data to provide actionable suggestions.

Rules:
- Give 2-4 specific, data-driven suggestions based on what you see
- Each suggestion should reference actual numbers from the data
- Be direct and concise — no filler
- NEVER give medical advice, diagnose conditions, or recommend supplements
- NEVER reference injuries, pain, or medical symptoms
- Focus on: calorie/macro adjustments, training volume, deload timing, consistency patterns, step/activity trends
- If micronutrient data is available and shows notable patterns (low iron, low fiber, high sodium, low vitamin D), mention it
- If step data is available, comment on activity level trends
- If data is insufficient, say so rather than guessing
- For macro adjustments, suggest specific numbers (e.g., "increase to 2,400 cal" not "eat more")

Respond ONLY with valid JSON in this exact format:
{
  "suggestions": [
    {
      "id": "unique-id",
      "category": "nutrition|training|recovery|general",
      "title": "Short title (under 10 words)",
      "explanation": "2-3 sentences explaining what you see and why you're suggesting this",
      "action": {
        "type": "adjust_calories|adjust_protein|adjust_carbs|adjust_fat|deload|none",
        "value": 2400,
        "label": "Set calories to 2,400"
      }
    }
  ],
  "summary": "One sentence overall assessment of their week"
}

The action field is optional. Only include it when you have a specific, concrete adjustment to suggest. Use "none" type for observational suggestions.`;

export async function getCoachSuggestions(snapshot: CoachDataSnapshot, apiKey: string): Promise<CoachResponse> {
  const userMessage = `Here is my fitness data for this week. Please analyze and give me suggestions.

${JSON.stringify(snapshot, null, 2)}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`AI Coach error: ${res.status} - ${(err as { error?: { message?: string } }).error?.message || 'Unknown error'}`);
  }

  const data = await res.json();
  let text: string = data.content[0].text;
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  const parsed = JSON.parse(text);

  return {
    suggestions: parsed.suggestions || [],
    summary: parsed.summary || '',
    generatedAt: new Date().toISOString(),
  };
}

const COACH_CACHE_KEY = 'fitos-ai-coach-cache';

export function getCachedCoachResponse(): CoachResponse | null {
  try {
    const raw = localStorage.getItem(COACH_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CoachResponse;
    const age = Date.now() - new Date(cached.generatedAt).getTime();
    if (age > 24 * 60 * 60 * 1000) return null;
    return cached;
  } catch { return null; }
}

export function cacheCoachResponse(response: CoachResponse): void {
  localStorage.setItem(COACH_CACHE_KEY, JSON.stringify(response));
}

export function clearCoachCache(): void {
  localStorage.removeItem(COACH_CACHE_KEY);
}
