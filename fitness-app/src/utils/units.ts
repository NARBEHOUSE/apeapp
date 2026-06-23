import { getDashboardConfig } from './dashboardConfig';

export type WeightUnit = 'lbs' | 'kg';

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
