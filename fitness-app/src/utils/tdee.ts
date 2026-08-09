import type { BodyStats, FitnessGoal, MacroTargets, ActivityLevel } from '../types';

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// Mifflin-St Jeor — most validated equation for general population
function calculateBMR(gender: 'male' | 'female', weightKg: number, heightCm: number, age: number): number {
  if (gender === 'male') {
    return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  }
  return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
}

export function calculateTDEE(stats: BodyStats): number {
  const bmr = calculateBMR(stats.gender, stats.weightKg, stats.heightCm, stats.age);
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[stats.activityLevel]);
}

// Goal-based calorie offset
// Lose: -500 (targets ~1 lb/week loss)
// Maintain: 0
// Build: +300 (lean bulk, minimize fat gain)
function getGoalOffset(goal: FitnessGoal): number {
  switch (goal) {
    case 'lose': return -500;
    case 'maintain': return 0;
    case 'build': return 300;
  }
}

export function calculateMacros(stats: BodyStats): MacroTargets {
  const tdee = calculateTDEE(stats);
  const targetCalories = Math.max(1200, tdee + getGoalOffset(stats.fitnessGoal));

  // Cutting requires more protein to preserve muscle in a deficit
  const protein = Math.round(
    stats.fitnessGoal === 'lose' ? stats.heightCm * 1.1 : stats.heightCm
  );

  // Fat: 30% of total calories
  const fatPct = 0.30;
  const fat = Math.round((targetCalories * fatPct) / 9);

  // Carbs: fill remaining calories
  const proteinCals = protein * 4;
  const fatCals = fat * 9;
  const carbs = Math.max(50, Math.round((targetCalories - proteinCals - fatCals) / 4));

  return { calories: targetCalories, protein, carbs, fat };
}

// Rescale carbs/fat to hit a new calorie total while holding protein (grams) fixed and
// preserving the existing carb:fat calorie split. Used any time a calorie goal changes
// (auto-adjustment, AI coach suggestion, etc.) so the macro targets stay internally
// consistent with the calorie target instead of going stale — e.g. dropping calories
// from 2800 to 1900 without touching carbs/fat used to leave macro targets that still
// summed to ~2800, so the day could show "calories hit" while macros still showed room.
export function rescaleMacrosToCalories(macros: MacroTargets, newCalories: number): MacroTargets {
  const proteinCals = macros.protein * 4;
  const remainingOld = macros.calories - proteinCals;
  const remainingNew = Math.max(0, newCalories - proteinCals);

  // No old carb/fat headroom to derive a split from (e.g. protein alone met/exceeded the
  // old calorie total) — just fill whatever's left with carbs rather than divide by ~0.
  if (remainingOld <= 0) {
    return {
      calories: newCalories,
      protein: macros.protein,
      carbs: Math.round(remainingNew / 4),
      fat: 0,
    };
  }

  const carbShare = (macros.carbs * 4) / remainingOld;
  const fatShare = (macros.fat * 9) / remainingOld;

  return {
    calories: newCalories,
    protein: macros.protein,
    carbs: Math.max(0, Math.round((remainingNew * carbShare) / 4)),
    fat: Math.max(0, Math.round((remainingNew * fatShare) / 9)),
  };
}

// Convert height input to cm
export function heightToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * 2.54);
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return { feet, inches };
}

// Convert weight
export function lbsToKg(lbs: number): number {
  return lbs * 0.453592;
}

export function kgToLbs(kg: number): number {
  return kg * 2.20462;
}

// Target weight change rates (lbs per week)
const TARGET_RATES: Record<FitnessGoal, number> = {
  lose: -1.0,
  maintain: 0,
  build: 0.5,
};

// How the user's actual logged intake compared to the goal calories that were prescribed
// over the same window the weight trend was analyzed. Lets the adjustment logic tell "the
// goal is wrong" apart from "the goal wasn't followed".
export interface CalorieAdherence {
  avgTrackedCalories: number;
  // Average of the goal actually prescribed on each logged day — not necessarily today's
  // goal, since the window can span a change (e.g. a temporary correction ending).
  prescribedCalories: number;
  deltaPerDay: number; // avgTrackedCalories - prescribedCalories; positive = eating over goal
  daysLogged: number;
  coverage: number; // daysLogged / days in the analysis window
}

export interface CorrectionSuggestion {
  calories: number;
  days: number;
  reason: string;
}

export interface AutoAdjustResult {
  shouldAdjust: boolean;
  newCalories: number;
  reason: string;
  avgWeeklyChange: number;
  targetWeeklyChange: number;
  daysSinceStart: number;
  // True when the weight trend is better explained by not eating at the prescribed
  // calorie goal than by the goal itself being wrong. When true, `shouldAdjust` is false —
  // the fix is to follow the existing plan, not to move it — and `correctionSuggestion`
  // offers a short-term nudge back toward the average instead.
  adherenceIssue?: boolean;
  adherence?: CalorieAdherence;
  correctionSuggestion?: CorrectionSuggestion;
}

// Minimum average daily gap between tracked and prescribed calories (over the analysis
// window) before we treat it as a real adherence problem rather than noise.
const ADHERENCE_THRESHOLD = 150;
// Need logged food on at least this fraction of days in the window to trust the average —
// otherwise we can't tell adherence from a mostly-untracked stretch.
const MIN_TRACKING_COVERAGE = 0.4;
// How far back "the current trend" looks, anchored on the latest weigh-in — not the whole
// lifetime of weigh-ins on file. Without a cap, a long-time user's entire history feeds the
// regression and the adherence coverage check, so a short, already-resolved deviation (e.g. a
// few days of over-eating that's since corrected) gets diluted into noise by months of
// unrelated, already-settled data instead of being read for what it is.
const TREND_WINDOW_DAYS = 30;
// How far back the *adherence* comparison looks — deliberately shorter than the trend window
// above, and matched to the same 7-day rolling average shown elsewhere on the dashboard (see
// TrendSnapshotCard) so "recent" means the same thing in both places. A multi-day binge that's
// already fully explained by a handful of over-goal days still gets averaged away by
// ADHERENCE_THRESHOLD if it's spread across the full 21-30 day trend window (e.g. 3 days at
// +1500 cal/day over a 30-day window averages to ~150 cal/day — right at the noise floor —
// even with perfect logging coverage). Comparing against the recent week keeps a real,
// short-lived over/under-eating episode from reading as "no issue" just because it didn't
// last long, while also letting it drop out of the check within a week of actually resolving.
const ADHERENCE_LOOKBACK_DAYS = 7;
// Half-life (days) for recency-weighting the trend regression — a reading this many days
// older than the latest one carries half the influence on the slope. Unweighted regression
// treats a 9-day-old data point the same as today's, so a resolved spike-and-recovery episode
// keeps dragging the slope for a long time after the user is actually back to baseline (a
// median-smoothed week-long bump can still read as ~0.3+ lbs/week "gaining" a full week after
// weight and eating have both leveled off). Weighting recent entries more heavily makes the
// trend converge back to "on track" within days of an episode actually resolving, instead of
// waiting for the episode to age out of the whole window.
const TREND_HALF_LIFE_DAYS = 10;
// How many days a calorie target must have been in effect before its own trend is used to
// judge it. A weight trend spans 21+ days, so a target set yesterday had no influence on
// almost any of it — grading a brand-new target against mostly-pre-change data produces
// contradictory advice, most visibly resuming a normal goal after a temporary correction and
// being told to cut again in the same breath, off a trend that goal hasn't touched yet.
const MIN_DAYS_ON_TARGET = 7;

// Replace each reading with the median of itself and its nearest neighbors before trending.
// A single-day water-retention/scale-error spike gets outvoted by the flat readings around
// it; a change that actually persists across multiple entries passes the median through
// unchanged. Applied before the regression so one anomalous weigh-in can't flip the sign of
// an otherwise-clear trend.
function medianSmooth(weights: number[], radius = 2): number[] {
  return weights.map((_, i) => {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(weights.length, i + radius + 1);
    const window = [...weights.slice(lo, hi)].sort((a, b) => a - b);
    const mid = Math.floor(window.length / 2);
    return window.length % 2 === 1 ? window[mid] : (window[mid - 1] + window[mid]) / 2;
  });
}

// Analyze weight trend and recommend calorie adjustment after 21+ days of data
// Uses linear regression on weight entries to find actual rate of change,
// then compares to goal rate and adjusts calories proportionally.
// 1 lb of bodyweight ~= 3500 calories, so a 1 lb/week discrepancy = 500 cal/day adjustment.
//
// `trackedCalories` (optional) is the user's logged food intake — one entry per log, not
// pre-aggregated by day — covering (at least) the same span as `weightEntries`. When
// provided, it's used to check whether an off-track weight trend is actually explained by
// not eating at the prescribed goal, rather than the goal being miscalibrated.
//
// `options.prescribedFor` resolves what the calorie goal actually was on a given date. Without
// it, every logged day is graded against today's goal, which misreads any stretch where the
// goal was different — most sharply right after a temporary correction, where eating at your
// normal goal scores as "over-eating" purely because the correction's lower number is what's
// being compared against. `options.targetChangedOn` is the date the current goal took effect,
// used to hold off on re-judging a goal that hasn't been in place long enough to have moved
// the trend yet.
export function calculateAutoAdjustment(
  weightEntries: { date: string; weight: number; unit: 'lbs' | 'kg' }[],
  currentCalories: number,
  goal: FitnessGoal,
  trackedCalories: { date: string; calories: number }[] = [],
  options: { prescribedFor?: (date: string) => number; targetChangedOn?: string } = {}
): AutoAdjustResult {
  const { prescribedFor, targetChangedOn } = options;
  const noAdjust: AutoAdjustResult = {
    shouldAdjust: false,
    newCalories: currentCalories,
    reason: '',
    avgWeeklyChange: 0,
    targetWeeklyChange: TARGET_RATES[goal],
    daysSinceStart: 0,
  };

  // Need at least 21 days of data
  if (weightEntries.length < 3) {
    return { ...noAdjust, reason: 'Need at least 3 weigh-ins over 21+ days' };
  }

  // Normalize to lbs
  const allEntries = weightEntries
    .map((e) => ({
      date: new Date(e.date + 'T00:00:00').getTime(),
      weight: e.unit === 'kg' ? kgToLbs(e.weight) : e.weight,
    }))
    .sort((a, b) => a.date - b.date);

  // Anchor the analysis window on the latest weigh-in, not "now" — a stale-but-recent last
  // entry shouldn't shrink the window, and this keeps it consistent with how `lastDate` below
  // is used to scope the tracked-calories comparison.
  const windowStart = allEntries[allEntries.length - 1].date - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const entries = allEntries.filter((e) => e.date >= windowStart);

  if (entries.length < 3) {
    return { ...noAdjust, reason: 'Need at least 3 weigh-ins over 21+ days' };
  }

  const firstDate = entries[0].date;
  const lastDate = entries[entries.length - 1].date;
  const daySpan = (lastDate - firstDate) / (1000 * 60 * 60 * 24);

  if (daySpan < 21) {
    return { ...noAdjust, reason: `Only ${Math.round(daySpan)} days of data — need 21+`, daysSinceStart: Math.round(daySpan) };
  }

  // Recency-weighted linear regression to find weekly rate of change. Weighted (not plain
  // OLS) least squares: minimize sum(w_i * (y_i - (a + b*x_i))^2), which gives the normal
  // equations below with every sum weighted by w_i.
  const days = entries.map((e) => (e.date - firstDate) / (1000 * 60 * 60 * 24));
  const weights = medianSmooth(entries.map((e) => e.weight));
  const lastDay = days[days.length - 1];
  const w = days.map((d) => Math.pow(0.5, (lastDay - d) / TREND_HALF_LIFE_DAYS));

  const sumW = w.reduce((a, b) => a + b, 0);
  const sumWX = days.reduce((acc, d, i) => acc + w[i] * d, 0);
  const sumWY = weights.reduce((acc, y, i) => acc + w[i] * y, 0);
  const sumWXY = days.reduce((acc, d, i) => acc + w[i] * d * weights[i], 0);
  const sumWXX = days.reduce((acc, d, i) => acc + w[i] * d * d, 0);

  const slope = (sumW * sumWXY - sumWX * sumWY) / (sumW * sumWXX - sumWX * sumWX); // lbs per day
  const avgWeeklyChange = slope * 7; // lbs per week

  const targetWeekly = TARGET_RATES[goal];
  const diff = avgWeeklyChange - targetWeekly; // positive = gaining too fast or losing too slow

  // Only adjust if off by more than 0.3 lbs/week from target
  if (Math.abs(diff) < 0.3) {
    return {
      shouldAdjust: false,
      newCalories: currentCalories,
      reason: `On track: ${avgWeeklyChange >= 0 ? '+' : ''}${avgWeeklyChange.toFixed(1)} lbs/week (target: ${targetWeekly >= 0 ? '+' : ''}${targetWeekly.toFixed(1)})`,
      avgWeeklyChange,
      targetWeeklyChange: targetWeekly,
      daysSinceStart: Math.round(daySpan),
    };
  }

  // Off track — but if the current goal was only just set, the trend above is almost entirely
  // made up of days spent eating to a *different* goal, so it says nothing about this one.
  // Report the trend but don't act on it until the goal has had time to show an effect.
  if (targetChangedOn) {
    const changedAt = new Date(targetChangedOn + 'T00:00:00').getTime();
    const daysOnTarget = Math.floor((lastDate - changedAt) / (1000 * 60 * 60 * 24));
    if (daysOnTarget < MIN_DAYS_ON_TARGET) {
      const dayWord = daysOnTarget === 1 ? 'day' : 'days';
      return {
        shouldAdjust: false,
        newCalories: currentCalories,
        reason:
          `Your ${currentCalories} cal/day goal has only been in effect ${Math.max(0, daysOnTarget)} ${dayWord}. ` +
          `The current ${avgWeeklyChange >= 0 ? '+' : ''}${avgWeeklyChange.toFixed(1)} lbs/week trend mostly reflects the days before it, ` +
          `so there's nothing to judge it on yet — give it ${MIN_DAYS_ON_TARGET} days.`,
        avgWeeklyChange,
        targetWeeklyChange: targetWeekly,
        daysSinceStart: Math.round(daySpan),
      };
    }
  }

  // Before concluding the *prescribed* goal is wrong, check whether the user actually ate at
  // that goal recently — if they've been consistently over or under it, the weight trend is
  // explained by not following the plan, not by a bad prescription, and the fix is adherence,
  // not moving the goalposts. Compared against a recent lookback window rather than the full
  // trend window so a short-lived deviation isn't averaged into noise.
  const adherenceWindowStart = Math.max(firstDate, lastDate - ADHERENCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const adherenceWindowDays = Math.max(1, Math.round((lastDate - adherenceWindowStart) / (1000 * 60 * 60 * 24)));
  const windowEntries = trackedCalories.filter((e) => {
    const t = new Date(e.date + 'T00:00:00').getTime();
    return t >= adherenceWindowStart && t <= lastDate;
  });

  // Sum per day first, then grade each day against the goal that was actually prescribed that
  // day — a single window can span a goal change (e.g. a temporary correction ending), and
  // comparing those days to today's number would invent a gap that never existed.
  const caloriesByDate = new Map<string, number>();
  for (const e of windowEntries) {
    caloriesByDate.set(e.date, (caloriesByDate.get(e.date) ?? 0) + e.calories);
  }
  const daysLogged = caloriesByDate.size;
  const coverage = daysLogged / adherenceWindowDays;

  let adherence: CalorieAdherence | undefined;
  if (coverage >= MIN_TRACKING_COVERAGE) {
    let totalTracked = 0;
    let totalPrescribed = 0;
    for (const [date, dayCalories] of caloriesByDate) {
      totalTracked += dayCalories;
      totalPrescribed += prescribedFor?.(date) ?? currentCalories;
    }
    const avgTrackedCalories = Math.round(totalTracked / daysLogged);
    const avgPrescribed = Math.round(totalPrescribed / daysLogged);
    adherence = {
      avgTrackedCalories,
      prescribedCalories: avgPrescribed,
      deltaPerDay: avgTrackedCalories - avgPrescribed,
      daysLogged,
      coverage,
    };
  }

  if (adherence) {
    const { deltaPerDay } = adherence;
    // Does the eating gap point the same direction as the weight-trend gap? (over-eating
    // correlates with gaining too fast/losing too slow; under-eating with the reverse.)
    const sameDirection = (deltaPerDay > 0 && diff > 0) || (deltaPerDay < 0 && diff < 0);

    if (sameDirection && Math.abs(deltaPerDay) >= ADHERENCE_THRESHOLD) {
      const overUnder = deltaPerDay > 0 ? 'over' : 'under';
      const trendWord = avgWeeklyChange >= 0 ? 'gaining' : 'losing';
      // Cite the goal the delta was actually measured against. If it changed partway through
      // the window that isn't `currentCalories`, and quoting today's number would print
      // arithmetic that doesn't add up against the tracked average shown right beside it.
      const goalPhrase =
        adherence.prescribedCalories === currentCalories
          ? `your ${currentCalories} cal goal`
          : `the ${adherence.prescribedCalories} cal/day averaged goal in effect over those days`;
      const reason =
        `You're averaging ${adherence.avgTrackedCalories} cal/day tracked — ${Math.abs(deltaPerDay)} cal ${overUnder} ` +
        `${goalPhrase}. That's why you're ${trendWord} ${Math.abs(avgWeeklyChange).toFixed(1)} lbs/week faster ` +
        `than planned, not because the goal itself is off. Follow your current ${currentCalories} cal/day plan.`;

      // Suggest a short correction to bring the recent average back toward goal, then
      // resume the normal target — rather than permanently moving the goal.
      const correctionDays = 7;
      const totalExcess = deltaPerDay * adherence.daysLogged;
      const rawCorrection = Math.round(currentCalories - totalExcess / correctionDays);
      const cappedCorrection = Math.max(currentCalories - 500, Math.min(currentCalories + 500, rawCorrection));
      const correctionCalories = Math.max(1200, cappedCorrection);

      return {
        shouldAdjust: false,
        newCalories: currentCalories,
        reason,
        avgWeeklyChange,
        targetWeeklyChange: targetWeekly,
        daysSinceStart: Math.round(daySpan),
        adherenceIssue: true,
        adherence,
        correctionSuggestion: {
          calories: correctionCalories,
          days: correctionDays,
          reason: `Eat ~${correctionCalories} cal/day for ${correctionDays} days to offset the recent ${overUnder}-eating, then resume your normal ${currentCalories} cal/day goal.`,
        },
      };
    }
  }

  // Adjust: 500 cal per 1 lb/week discrepancy, capped at ±300 per adjustment
  const rawAdjustment = Math.round(-(diff / 1.0) * 500);
  const cappedAdjustment = Math.max(-300, Math.min(300, rawAdjustment));
  const newCalories = Math.max(1200, currentCalories + cappedAdjustment);

  let reason: string;
  if (goal === 'lose') {
    if (diff > 0) {
      reason = `Losing too slowly (${avgWeeklyChange.toFixed(1)} lbs/week vs target ${targetWeekly.toFixed(1)}). Reducing by ${Math.abs(cappedAdjustment)} cal.`;
    } else {
      reason = `Losing too fast (${avgWeeklyChange.toFixed(1)} lbs/week vs target ${targetWeekly.toFixed(1)}). Increasing by ${Math.abs(cappedAdjustment)} cal.`;
    }
  } else if (goal === 'build') {
    if (diff > 0) {
      reason = `Gaining too fast (${avgWeeklyChange.toFixed(1)} lbs/week vs target +${targetWeekly.toFixed(1)}). Reducing by ${Math.abs(cappedAdjustment)} cal.`;
    } else {
      reason = `Not gaining enough (+${avgWeeklyChange.toFixed(1)} lbs/week vs target +${targetWeekly.toFixed(1)}). Increasing by ${Math.abs(cappedAdjustment)} cal.`;
    }
  } else {
    if (avgWeeklyChange > 0) {
      reason = `Gaining weight (+${avgWeeklyChange.toFixed(1)} lbs/week). Reducing by ${Math.abs(cappedAdjustment)} cal.`;
    } else {
      reason = `Losing weight (${avgWeeklyChange.toFixed(1)} lbs/week). Increasing by ${Math.abs(cappedAdjustment)} cal.`;
    }
  }

  return {
    shouldAdjust: true,
    newCalories,
    reason,
    avgWeeklyChange,
    targetWeeklyChange: targetWeekly,
    daysSinceStart: Math.round(daySpan),
    adherence,
  };
}

// The weight (lbs) the plan's target trajectory implies "right now" — i.e. current weight
// with the accumulated drift from an adherence issue backed out. A temporary correction is
// really an attempt to walk that drift back to ~0, not to hit some arbitrary fixed number,
// so this is the number a correction should be checked against to see if it's done its job.
export function computeBaselineWeightLbs(latestWeightLbs: number, result: AutoAdjustResult): number {
  const excessLbs = (result.avgWeeklyChange - result.targetWeeklyChange) * (result.daysSinceStart / 7);
  return latestWeightLbs - excessLbs;
}

// How close weight needs to get back to the baseline before a correction is considered done.
export const BASELINE_RECOVERY_TOLERANCE_LBS = 1;

export interface BaselineRecoveryCheck {
  reached: boolean;
  deltaLbs: number; // currentWeightLbs - baselineWeightLbs; 0 = exactly back on the plan's trajectory
}

// Has weight come back within tolerance of the plan's trajectory while a temporary
// correction is active? If so, the correction has done its job — it shouldn't need to run
// out its fixed day count before the user's offered a way back to their normal goal.
export function checkBaselineRecovery(currentWeightLbs: number, baselineWeightLbs: number): BaselineRecoveryCheck {
  const deltaLbs = currentWeightLbs - baselineWeightLbs;
  return { reached: Math.abs(deltaLbs) <= BASELINE_RECOVERY_TOLERANCE_LBS, deltaLbs };
}

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary (desk job, little exercise)',
  light: 'Lightly Active (1-3 days/week)',
  moderate: 'Moderately Active (3-5 days/week)',
  active: 'Very Active (6-7 days/week)',
  very_active: 'Athlete (2x/day or physical job)',
};

export const GOAL_LABELS: Record<FitnessGoal, string> = {
  lose: 'Lose Fat',
  maintain: 'Maintain Weight',
  build: 'Build Muscle',
};

export const GOAL_DESCRIPTIONS: Record<FitnessGoal, string> = {
  lose: '~1 lb/week loss (-500 cal deficit)',
  maintain: 'Stay at current weight',
  build: 'Lean bulk (~0.5 lb/week gain)',
};
