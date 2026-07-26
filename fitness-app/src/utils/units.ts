import { getDashboardConfig } from './dashboardConfig';

export type WeightUnit = 'lbs' | 'kg';

// ── Serving / food units ──────────────────────────────────────────────────────

export type ServingUnit = 'g' | 'oz' | 'cup' | 'serving';
export const SERVING_UNITS: { value: ServingUnit; label: string }[] = [
  { value: 'g', label: 'g' },
  { value: 'oz', label: 'oz' },
  { value: 'cup', label: 'cup' },
  { value: 'serving', label: 'srv' },
];

const OZ_TO_G = 28.3495;

/** Convert a serving amount to grams (only g↔oz is exact; cup/serving pass through). */
export function servingToGrams(value: number, unit: ServingUnit): number {
  if (unit === 'oz') return value * OZ_TO_G;
  return value;
}

/** Convert grams to a target serving unit (only g↔oz is exact; others pass through). */
export function gramsToServing(grams: number, unit: ServingUnit): number {
  if (unit === 'oz') return grams / OZ_TO_G;
  return grams;
}

/** Normalise an arbitrary unit string to a known ServingUnit, falling back to 'g'. */
export function normaliseServingUnit(unit: string | undefined): ServingUnit {
  const u = (unit || '').toLowerCase();
  if (u === 'oz') return 'oz';
  if (u === 'cup') return 'cup';
  if (u === 'serving' || u === 'srv') return 'serving';
  return 'g';
}

/**
 * Convert a serving size number from one unit to another (g↔oz only).
 * For cup/serving the number is returned unchanged.
 */
export function convertServingUnit(value: number, from: ServingUnit, to: ServingUnit): number {
  if (from === to) return value;
  if ((from === 'g' || from === 'oz') && (to === 'g' || to === 'oz')) {
    const grams = servingToGrams(value, from);
    const converted = gramsToServing(grams, to);
    return to === 'oz'
      ? Math.round(converted * 100) / 100
      : Math.round(converted * 10) / 10;
  }
  return value;
}

export function getWeightUnit(): WeightUnit {
  return getDashboardConfig().weightUnit ?? 'lbs';
}

/** Convert a stored lbs value to the display unit */
export function toDisplayWeight(lbs: number, unit: WeightUnit): number {
  if (unit === 'kg') return Math.round(lbs * 0.453592 * 4) / 4; // round to nearest 0.25
  return lbs;
}

/** Convert a user-entered value in display unit to lbs for storage */
export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  if (unit === 'kg') return Math.round(value * 2.20462 * 10) / 10;
  return value;
}

/** Format a stored lbs value with unit label */
export function fmtWeight(lbs: number, unit: WeightUnit): string {
  return `${toDisplayWeight(lbs, unit)} ${unit}`;
}
