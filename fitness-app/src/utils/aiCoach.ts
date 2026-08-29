import { callAI } from './aiAdapter';
import type { WorkoutSession, FoodEntry, Measurement, CheckInEntry, StepEntry, MacroTargets, Profile, Program } from '../types';
import { today, localDateStr } from './dateHelpers';
import {
  splitLibrary,
  muscleFocus,
  exerciseCount,
  lastPerformedDate,
  daysSince,
} from './workoutLibrary';
import {
  buildExerciseMuscleMap,
  muscleSetsForSessions,
  totalSetCounts,
  hasRatedSets,
  avgRir,
} from './muscleVolume';

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
    /**
     * How this person actually trains. Not everyone follows a program, and the coach must
     * not treat "casual" as a problem to be corrected — it changes which metrics matter
     * (consistency and muscle coverage) rather than making the data unusable.
     */
    style: {
      /** 'program' = enrolled and sticking to it. 'mixed' = enrolled but also training
       *  off-plan. 'casual' = not enrolled in anything; trains from saved workouts or
       *  freestyle. */
      mode: 'program' | 'mixed' | 'casual';
      programName?: string;
      programWeek?: number;
      programDurationWeeks?: number;
      /** Sessions in the last 28 days that were the enrolled program's prescribed days. */
      onProgramSessions28d?: number;
      /** Sessions in the last 28 days that weren't — saved workouts or freestyle. */
      offProgramSessions28d: number;
      /** The user's own library of standalone workouts: what they can pick from today. */
      savedWorkouts: {
        name: string;
        exercises: number;
        muscles: string[];
        lastDoneDaysAgo: number | null;
        /** Set when this workout was pulled out of a program the user follows loosely. */
        fromProgram?: string;
      }[];
      /** What they actually did recently, most recent first. */
      recentSessions: {
        date: string;
        name: string;
        source: 'program' | 'saved_workout' | 'freestyle';
        skipped?: boolean;
      }[];
    };
    /**
     * Consistency, which for someone without a schedule is the headline number — a
     * week-over-week volume swing means far less when the training days are chosen ad hoc.
     */
    consistency: {
      sessionsLast7d: number;
      sessionsLast28d: number;
      avgSessionsPerWeek28d: number;
      daysSinceLastWorkout: number | null;
      longestGapDays28: number | null;
    };
    workoutsThisWeek: number;
    workoutsLastWeek: number;
    hardSetsThisWeek: number;
    hardSetsLastWeek: number;
    workingSetsThisWeek: number;
    /** False when the user logs no RIR/RPE, which makes the hard-set counts meaningless. */
    effortTracked: boolean;
    /** Weekly sets per muscle. Raw counts only — the app does not know anyone's MEV. */
    setsPerMuscleThisWeek: Record<string, number>;
    /** Average reps in reserve this week — how close to failure the sets actually got. */
    avgRirThisWeek: number | null;
    avgRirLastWeek: number | null;
    /** Weight × reps, in lbs. Context only — never the basis for a volume judgement. */
    tonnageThisWeek: number;
    tonnageLastWeek: number;
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
    // Local, not toISOString() — session dates are local, and formatting back through
    // UTC shifts the whole window by a day for anyone east of Greenwich.
    dates.add(localDateStr(d));
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
  // Skipped days are logged but were not trained — counting them would inflate every
  // session count the coach reasons about.
  const doneSessions = sessions.filter((s) => s.status !== 'skipped');
  const weekSessions = doneSessions.filter((s) => last7.has(s.date));
  const prevSessions = doneSessions.filter((s) => prev7.has(s.date) && !last7.has(s.date));

  // Hard sets per muscle per week is what drives hypertrophy, so the coach reasons
  // about set counts against the volume landmarks rather than about tonnage.
  const weekCounts = totalSetCounts(weekSessions);
  const prevCounts = totalSetCounts(prevSessions);
  const effortTracked = hasRatedSets([weekCounts, prevCounts]);

  const roundOrNull = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

  // Sessions feed the map too, so lifts done outside any library entry still get credited.
  const weekMuscleSets = muscleSetsForSessions(weekSessions, buildExerciseMuscleMap(programs, sessions));
  const setsPerMuscleThisWeek: Record<string, number> = {};
  for (const [muscle, counts] of Object.entries(weekMuscleSets)) {
    setsPerMuscleThisWeek[muscle] = Math.round((effortTracked ? counts.hard : counts.sets) * 10) / 10;
  }

  // Detect stalled exercises (same max weight 3+ sessions)
  const exerciseMaxes: Record<string, number[]> = {};
  const recentSessions = [...sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  const activeProgram = profile.activeProgram ? programs.find((p) => p.id === profile.activeProgram!.programId) : null;
  // Names come from every library entry and every session's own manifest, not just the
  // enrolled program — otherwise anyone training casually gets raw ids in their stall list.
  const exerciseNames: Record<string, string> = {};
  for (const session of sessions) {
    for (const ex of session.exercises || []) exerciseNames[ex.id] = ex.name;
  }
  for (const entry of programs) {
    for (const day of entry.days) {
      for (const ex of day.exercises) {
        if (ex.name.trim()) exerciseNames[ex.id] = ex.name;
      }
    }
  }

  for (const s of recentSessions) {
    for (const [exId, sets] of Object.entries(s.sets)) {
      const completed = sets.filter((st) => st.completed && st.weight > 0);
      if (completed.length === 0) continue;
      const maxW = Math.max(...completed.map((st) => st.weight));
      const name = exerciseNames[exId];
      // An unresolvable id would read to the model as an exercise called "a3f2-…".
      if (!name) continue;
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

  // ── Training style & consistency ──────────────────────────────────────────────────
  // Everything here answers "how does this person actually train?" rather than "are they
  // following the plan?", because for a casual lifter there may be no plan to follow.
  const last28 = getLastNDays(28);
  const sessions28 = doneSessions.filter((s) => last28.has(s.date));
  const entryById = new Map(programs.map((p) => [p.id, p]));

  const onProgramSessions28d = activeProgram
    ? sessions28.filter((s) => s.programId === activeProgram.id).length
    : undefined;
  const offProgramSessions28d = activeProgram
    ? sessions28.length - (onProgramSessions28d || 0)
    : sessions28.length;

  // 'mixed' should mean off-plan training is a real part of how they train, not that one
  // session in a month happened to be something else.
  const mode: CoachDataSnapshot['training']['style']['mode'] = !activeProgram
    ? 'casual'
    : sessions28.length > 0 && offProgramSessions28d / sessions28.length >= 0.25
      ? 'mixed'
      : 'program';

  const { workouts: libraryWorkouts } = splitLibrary(programs);
  const savedWorkouts = libraryWorkouts.map((w) => ({
    name: w.name,
    exercises: exerciseCount(w),
    muscles: muscleFocus(w),
    lastDoneDaysAgo: daysSince(lastPerformedDate(w.id, sessions)),
    ...(w.sourceProgramName ? { fromProgram: w.sourceProgramName } : {}),
  }));

  const recentSessionSummaries = [...sessions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10)
    .map((s) => {
      const entry = entryById.get(s.programId);
      const day = entry?.days.find((d) => d.id === s.dayId);
      const source: 'program' | 'saved_workout' | 'freestyle' = !entry
        ? 'freestyle'
        : entry.kind === 'workout'
          ? 'saved_workout'
          : 'program';
      const name = s.name
        || (source === 'program' ? `${day?.tag || day?.title || 'Day'} — ${entry!.name}` : entry?.name)
        || 'Freestyle session';
      return { date: s.date, name, source, ...(s.status === 'skipped' ? { skipped: true } : {}) };
    });

  const trainingDates = [...new Set(sessions28.map((s) => s.date))].sort();
  const daysSinceLastWorkout = daysSince(
    doneSessions.length > 0
      ? [...doneSessions].sort((a, b) => b.date.localeCompare(a.date))[0].date
      : null,
  );
  // Gaps measured across the 28-day window, with today closing the final gap so an
  // ongoing layoff shows up rather than hiding behind the last recorded pair.
  const longestGapDays28 = (() => {
    if (trainingDates.length === 0) return null;
    const marks = [...trainingDates, today()];
    let longest = 0;
    for (let i = 1; i < marks.length; i++) {
      const gap = Math.round(
        (new Date(marks[i] + 'T00:00:00').getTime() - new Date(marks[i - 1] + 'T00:00:00').getTime()) / 86400000,
      );
      if (gap > longest) longest = gap;
    }
    return longest;
  })();

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
      style: {
        mode,
        programName: activeProgram?.name,
        programWeek: profile.activeProgram
          ? Math.max(1, Math.ceil((Date.now() - new Date(profile.activeProgram.startDate).getTime()) / (7 * 86400000)))
          : undefined,
        programDurationWeeks: profile.activeProgram?.durationWeeks,
        onProgramSessions28d,
        offProgramSessions28d,
        savedWorkouts,
        recentSessions: recentSessionSummaries,
      },
      consistency: {
        sessionsLast7d: weekSessions.length,
        sessionsLast28d: sessions28.length,
        avgSessionsPerWeek28d: Math.round((sessions28.length / 4) * 10) / 10,
        daysSinceLastWorkout,
        longestGapDays28,
      },
      workoutsThisWeek: weekSessions.length,
      workoutsLastWeek: prevSessions.length,
      hardSetsThisWeek: weekCounts.hard,
      hardSetsLastWeek: prevCounts.hard,
      workingSetsThisWeek: weekCounts.sets,
      effortTracked,
      setsPerMuscleThisWeek,
      avgRirThisWeek: roundOrNull(avgRir(weekCounts)),
      avgRirLastWeek: roundOrNull(avgRir(prevCounts)),
      tonnageThisWeek: Math.round(weekCounts.volume),
      tonnageLastWeek: Math.round(prevCounts.volume),
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
- Training volume means HARD SETS per muscle per week — sets taken within 3 reps of failure (RIR 0-3 / RPE 7-10). Judge training by set counts, never by tonnage

HOW THEY TRAIN (training.style) — read this before judging their training:
- training.style.mode tells you whether they are on a program or not:
  - 'program': enrolled and following the prescribed rotation
  - 'mixed': enrolled, but also training off-plan. This is normal and fine. Off-plan sessions are real training — count them. Never scold them for it or tell them to "get back on the program"
  - 'casual': not on a program at all. This is a deliberate, valid way to train, NOT a problem to fix. Do not open with "you should start a program". Only raise programming at all if their own data shows something they cannot get from how they currently train, or they ask
- For a casual or mixed lifter, judge them on training.consistency and on per-muscle coverage first. Week-over-week volume deltas are weak evidence when the training days are chosen ad hoc — a lighter week is a choice, not a red flag
- Rest days are not failures. Only mention a gap when consistency.daysSinceLastWorkout is long relative to their OWN consistency.avgSessionsPerWeek28d, not against some ideal number of days per week
- training.style.savedWorkouts is the user's own library of standalone workouts. When you suggest what to train next, name one of THESE by name — favour one that is stale (high lastDoneDaysAgo) and covers muscles that look light in setsPerMuscleThisWeek. Never invent a workout they don't have, and never prescribe a weekly split they didn't ask for
- A savedWorkout with a fromProgram value means they are loosely following that program's days without being enrolled. Treat that as intentional. You can reference the program's structure, but do not tell them they are "behind" on it — there is no schedule to be behind on
- training.style.recentSessions is what they actually did. Use the names when giving feedback ("your Upper day", not "your last workout") — it makes the advice concrete
- If they have no savedWorkouts and train freestyle, you may mention once that saving a session to their library makes it repeatable and easier to track progress on. Only if it genuinely helps; never as filler
- setsPerMuscleThisWeek is raw counts. The app does NOT know the user's minimum effective volume — that is individual, varies by muscle, and is not derivable from logged sets. Never tell the user a muscle is "below MEV" or "above MRV" as though it were measured. If a muscle looks genuinely neglected relative to their own goals, say so as an observation and let them judge
- avgRirThisWeek is how close to failure their sets actually got. Hypertrophy improves continuously as RIR drops toward 0, so an average above 3 means they are leaving growth on the table and should push sets closer to failure before adding volume. An average under about 0.5 means they train at failure constantly, which is a fatigue and recovery risk rather than a win
- tonnageThisWeek/tonnageLastWeek are context only — a tonnage swing on its own is not a reason to change anything, since heavier low-rep work inflates it
- If effortTracked is false the user logs no RIR/RPE, so hard-set counts read as 0. Fall back to workingSetsThisWeek and suggest turning on effort tracking rather than claiming they trained too easy
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

export async function getCoachSuggestions(snapshot: CoachDataSnapshot, _apiKey: string): Promise<CoachResponse> {
  const userMessage = `Here is my fitness data for this week. Please analyze and give me suggestions.

${JSON.stringify(snapshot, null, 2)}`;

  const { text: rawText } = await callAI({ systemPrompt: SYSTEM_PROMPT, userPrompt: userMessage });
  const text = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
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
