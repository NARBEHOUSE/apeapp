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

// A recalibration of the goal itself, derived from energy balance rather than from a formula.
// Offered when weight is doing what the plan intended but the prescribed number no longer
// matches what the user actually eats to get that result.
export interface CalibrationSuggestion {
  calories: number;
  avgTrackedCalories: number;
  daysLogged: number;
  windowDays: number;
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
  // Present only when the plan is working but the goal number itself has drifted from what
  // the user actually eats to achieve it. Never accompanies `shouldAdjust` — that path means
  // the plan is not working, which is a different question with a different answer.
  calibrationSuggestion?: CalibrationSuggestion;
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
// A fitted weekly rate has to clear this much of a gap from target before it's worth acting on.
const MIN_MEANINGFUL_WEEKLY_DIFF = 0.3;
// ...and it also has to be large compared to how much the readings scatter around the fitted
// line. Bodyweight swings several pounds day to day on water, food volume and timing, and a
// straight line through a month of that can slope either way purely by where the swings land:
// a month of genuinely flat 192-197 lbs readings can fit to "-0.7 lbs/week" while the first
// and last readings are identical. Acting on that produces confident advice pointing the wrong
// way. Requiring the gap to clear ~2 standard errors keeps suggestions to trends the data can
// actually support, and stays quiet when the honest answer is "this is noise".
const TREND_CONFIDENCE_Z = 1.96;
// How far the prescribed goal has to sit from what the user actually eats — while weight does
// what the plan intended — before offering to recalibrate the number. Below this the gap is
// inside ordinary food-logging error and not worth acting on.
const CALIBRATION_THRESHOLD = 150;
// Deriving maintenance from intake needs the intake average to be representative, so require
// food logged on at least this fraction of the window rather than the looser adherence bar.
const MIN_CALIBRATION_COVERAGE = 0.5;
// Cap on a single recalibration, matching the temporary-correction cap. A badly stale goal
// converges over a few weeks rather than jumping in one step.
const MAX_CALIBRATION_STEP = 500;

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

  // How long the current goal has actually been in effect. Nothing that changes the goal —
  // an adjustment or a recalibration — should fire before it has had time to show an effect.
  const daysOnTarget = targetChangedOn
    ? Math.floor((lastDate - new Date(targetChangedOn + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
    : Number.POSITIVE_INFINITY;
  const withinGracePeriod = daysOnTarget < MIN_DAYS_ON_TARGET;

  // Recency-weighted linear regression to find weekly rate of change. Weighted (not plain
  // OLS) least squares: minimize sum(w_i * (y_i - (a + b*x_i))^2), which gives the normal
  // equations below with every sum weighted by w_i.
  const days = entries.map((e) => (e.date - firstDate) / (1000 * 60 * 60 * 24));
  const rawWeights = entries.map((e) => e.weight);
  const weights = medianSmooth(rawWeights);
  const lastDay = days[days.length - 1];
  const w = days.map((d) => Math.pow(0.5, (lastDay - d) / TREND_HALF_LIFE_DAYS));

  const sumW = w.reduce((a, b) => a + b, 0);
  const sumWX = days.reduce((acc, d, i) => acc + w[i] * d, 0);
  const sumWY = weights.reduce((acc, y, i) => acc + w[i] * y, 0);
  const sumWXY = days.reduce((acc, d, i) => acc + w[i] * d * weights[i], 0);
  const sumWXX = days.reduce((acc, d, i) => acc + w[i] * d * d, 0);

  const slope = (sumW * sumWXY - sumWX * sumWY) / (sumW * sumWXX - sumWX * sumWX); // lbs per day
  const avgWeeklyChange = slope * 7; // lbs per week

  // How well that line actually describes the readings. Residuals are measured against the
  // RAW weigh-ins, not the smoothed series the fit runs on: smoothing deliberately removes the
  // day-to-day scatter, so scoring against it would report near-zero uncertainty for exactly
  // the noisy data this check exists to catch. Weights are renormalised to sum to n so this
  // reduces to ordinary least squares when every point is weighted equally.
  const n = entries.length;
  const intercept = (sumWY - slope * sumWX) / sumW;
  const meanDay = sumWX / sumW;
  const weightNorm = n / sumW;
  const residuals = rawWeights.map((y, i) => y - (intercept + slope * days[i]));
  let weightedSquaredError = 0;
  let weightedSpread = 0;
  for (let i = 0; i < n; i++) {
    const wi = w[i] * weightNorm;
    weightedSquaredError += wi * residuals[i] * residuals[i];
    weightedSpread += wi * (days[i] - meanDay) * (days[i] - meanDay);
  }
  // Typical distance of a reading from the trend line, in lbs — the day-to-day swing.
  const readingScatter = n > 2 ? Math.sqrt(weightedSquaredError / (n - 2)) : Infinity;

  // Consecutive weigh-ins are not independent observations: water retention, travel, a heavy
  // weekend all push several days in a row the same way. A ten-day stretch sitting above the
  // line is one event, not ten separate votes for it. The textbook standard error assumes
  // independence and so badly understates the uncertainty on exactly that shape, which is how
  // a flat month reads as a confident "-0.7 lbs/week". Inflate the variance by the usual
  // (1+r)/(1-r) factor for lag-1 autocorrelation r, which discounts runs back to roughly the
  // number of independent swings they represent.
  let lagProduct = 0;
  let lagEnergy = 0;
  for (let i = 1; i < n; i++) {
    lagProduct += residuals[i] * residuals[i - 1];
    lagEnergy += residuals[i - 1] * residuals[i - 1];
  }
  const autocorrelation = lagEnergy > 0 ? Math.min(0.95, Math.max(0, lagProduct / lagEnergy)) : 0;
  const varianceInflation = (1 + autocorrelation) / (1 - autocorrelation);

  // Standard error of the fitted weekly rate.
  const weeklyRateSE = n > 2 && weightedSpread > 0
    ? (readingScatter / Math.sqrt(weightedSpread)) * Math.sqrt(varianceInflation) * 7
    : Infinity;

  const targetWeekly = TARGET_RATES[goal];
  const diff = avgWeeklyChange - targetWeekly; // positive = gaining too fast or losing too slow

  // Energy-balance calibration of the goal itself. Whenever weight does what the plan intended,
  // the average intake that produced it IS the correct number by definition — a far better
  // measure of this person's maintenance than a Mifflin-St Jeor estimate off height, weight and
  // a self-reported activity bucket, which carries hundreds of calories of individual spread and
  // goes stale as bodyweight and habits change. Anchored on what was actually eaten rather than
  // on what was prescribed, so a goal that has quietly drifted still gets corrected while weight
  // sits exactly where the user wants it — the case a weight-trend check can never catch,
  // because there is no trend to find.
  const calibrationWindowDays = Math.max(1, Math.round(daySpan));
  const calorieByDate = new Map<string, number>();
  for (const e of trackedCalories) {
    const t = new Date(e.date + 'T00:00:00').getTime();
    if (t < firstDate || t > lastDate) continue;
    calorieByDate.set(e.date, (calorieByDate.get(e.date) ?? 0) + e.calories);
  }
  let calibrationSuggestion: CalibrationSuggestion | undefined;
  if (!withinGracePeriod && calorieByDate.size / calibrationWindowDays >= MIN_CALIBRATION_COVERAGE) {
    const daysLogged = calorieByDate.size;
    let totalLogged = 0;
    for (const dayCalories of calorieByDate.values()) totalLogged += dayCalories;
    const avgTrackedCalories = Math.round(totalLogged / daysLogged);
    const drift = avgTrackedCalories - currentCalories;
    if (Math.abs(drift) >= CALIBRATION_THRESHOLD) {
      const capped = Math.max(
        currentCalories - MAX_CALIBRATION_STEP,
        Math.min(currentCalories + MAX_CALIBRATION_STEP, avgTrackedCalories)
      );
      const goalPhrase =
        goal === 'maintain' ? 'holding steady' : goal === 'lose' ? 'coming down on plan' : 'gaining on plan';
      calibrationSuggestion = {
        calories: Math.max(1200, capped),
        avgTrackedCalories,
        daysLogged,
        windowDays: calibrationWindowDays,
        reason:
          `Over the last ${calibrationWindowDays} days you've averaged ${avgTrackedCalories} cal/day and your weight has been ` +
          `${goalPhrase} — so ${avgTrackedCalories} is what this actually takes for you. Your goal is set to ${currentCalories}, ` +
          `${Math.abs(drift)} ${drift > 0 ? 'below' : 'above'} that. Update the goal to match what's working?`,
      };
    }
  }

  // Only adjust if off by more than 0.3 lbs/week from target
  if (Math.abs(diff) < MIN_MEANINGFUL_WEEKLY_DIFF) {
    return {
      shouldAdjust: false,
      newCalories: currentCalories,
      reason: `On track: ${avgWeeklyChange >= 0 ? '+' : ''}${avgWeeklyChange.toFixed(1)} lbs/week (target: ${targetWeekly >= 0 ? '+' : ''}${targetWeekly.toFixed(1)})`,
      avgWeeklyChange,
      targetWeeklyChange: targetWeekly,
      daysSinceStart: Math.round(daySpan),
      calibrationSuggestion,
    };
  }

  // The gap clears the size threshold, but not the noise: with readings scattering this much,
  // a line through them could slope this way by chance. Say so rather than dressing up a
  // coin-flip as a rate and moving the goal on the strength of it.
  if (Math.abs(diff) < TREND_CONFIDENCE_Z * weeklyRateSE) {
    const netChange = rawWeights[n - 1] - rawWeights[0];
    return {
      shouldAdjust: false,
      newCalories: currentCalories,
      reason:
        `Weight is swinging about ±${readingScatter.toFixed(1)} lbs between weigh-ins, so the ` +
        `${avgWeeklyChange >= 0 ? '+' : ''}${avgWeeklyChange.toFixed(1)} lbs/week reading isn't separable from normal fluctuation. ` +
        `Net change over ${Math.round(daySpan)} days: ${netChange >= 0 ? '+' : ''}${netChange.toFixed(1)} lbs. Keeping your current goal.`,
      avgWeeklyChange,
      targetWeeklyChange: targetWeekly,
      daysSinceStart: Math.round(daySpan),
      calibrationSuggestion,
    };
  }

  // Off track — but if the current goal was only just set, the trend above is almost entirely
  // made up of days spent eating to a *different* goal, so it says nothing about this one.
  // Report the trend but don't act on it until the goal has had time to show an effect.
  if (withinGracePeriod) {
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
