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

  // Protein: 1g/lb for build, 1.1g/lb for lose (preserve muscle in deficit), 0.9g/lb for maintain
  const weightLbs = stats.weightKg * 2.20462;
  let proteinMultiplier: number;
  switch (stats.fitnessGoal) {
    case 'lose': proteinMultiplier = 1.1; break;
    case 'build': proteinMultiplier = 1.0; break;
    case 'maintain': proteinMultiplier = 0.9; break;
  }
  const protein = Math.round(weightLbs * proteinMultiplier);

  // Fat: 25-30% of calories (25% for lose, 30% for build, 27% for maintain)
  let fatPct: number;
  switch (stats.fitnessGoal) {
    case 'lose': fatPct = 0.25; break;
    case 'build': fatPct = 0.30; break;
    case 'maintain': fatPct = 0.27; break;
  }
  const fat = Math.round((targetCalories * fatPct) / 9);

  // Carbs: fill remaining calories
  const proteinCals = protein * 4;
  const fatCals = fat * 9;
  const carbs = Math.max(50, Math.round((targetCalories - proteinCals - fatCals) / 4));

  return { calories: targetCalories, protein, carbs, fat };
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

export interface AutoAdjustResult {
  shouldAdjust: boolean;
  newCalories: number;
  reason: string;
  avgWeeklyChange: number;
  targetWeeklyChange: number;
  daysSinceStart: number;
}

// Analyze weight trend and recommend calorie adjustment after 21+ days of data
// Uses linear regression on weight entries to find actual rate of change,
// then compares to goal rate and adjusts calories proportionally.
// 1 lb of bodyweight ~= 3500 calories, so a 1 lb/week discrepancy = 500 cal/day adjustment.
export function calculateAutoAdjustment(
  weightEntries: { date: string; weight: number; unit: 'lbs' | 'kg' }[],
  currentCalories: number,
  goal: FitnessGoal
): AutoAdjustResult {
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
  const entries = weightEntries
    .map((e) => ({
      date: new Date(e.date + 'T00:00:00').getTime(),
      weight: e.unit === 'kg' ? kgToLbs(e.weight) : e.weight,
    }))
    .sort((a, b) => a.date - b.date);

  const firstDate = entries[0].date;
  const lastDate = entries[entries.length - 1].date;
  const daySpan = (lastDate - firstDate) / (1000 * 60 * 60 * 24);

  if (daySpan < 21) {
    return { ...noAdjust, reason: `Only ${Math.round(daySpan)} days of data — need 21+`, daysSinceStart: Math.round(daySpan) };
  }

  // Linear regression to find weekly rate of change
  const n = entries.length;
  const days = entries.map((e) => (e.date - firstDate) / (1000 * 60 * 60 * 24));
  const weights = entries.map((e) => e.weight);

  const sumX = days.reduce((a, b) => a + b, 0);
  const sumY = weights.reduce((a, b) => a + b, 0);
  const sumXY = days.reduce((acc, d, i) => acc + d * weights[i], 0);
  const sumXX = days.reduce((acc, d) => acc + d * d, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX); // lbs per day
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
  };
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
