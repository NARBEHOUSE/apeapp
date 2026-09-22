import { daysAgo, today } from './dateHelpers';

/**
 * The `size` complete days ending yesterday, oldest first. `offset` steps the window
 * back a whole width at a time, so offset 1 is the stretch immediately before offset 0
 * and the two never overlap — that's what makes "recent 7 vs previous 7" a fair
 * comparison, unlike calendar weeks where a Tuesday pits two days against seven.
 *
 * Today is never included: it's still being logged, and a partial day would drag every
 * number down all morning.
 */
export function rollingWindow(size: number, offset = 0): string[] {
  return Array.from({ length: size }, (_, i) => daysAgo(size * (offset + 1) - i));
}

/**
 * One day's logged calories. A date only appears here if it has at least one food
 * entry — a day with no entries is "not logged", which is different from a logged
 * day that happens to total 0.
 */
export interface DayCalories {
  date: string;
  total: number;
}

/**
 * Today is still being logged, so it normally sits out of a daily average — a
 * half-logged day would drag the number down all morning and creep back up through
 * the evening.
 */
export function isCompleteDay(date: string, todayStr: string = today()): boolean {
  return date !== todayStr;
}

/**
 * Picks the days a weekly average should run over.
 *
 * Complete days only, except at the very start of a week when today is all there is
 * — then today counts, because a real number beats a blank. `todayExcluded` reports
 * which branch was taken so the UI can say so.
 *
 * This is the single definition of the rule. The Weekly Intake card and Week in
 * Review both go through it so their headline averages agree; they used to disagree
 * because only Week in Review dropped today.
 */
export function averageDays<T extends { date: string }>(
  days: T[],
  todayStr: string = today()
): { days: T[]; todayExcluded: boolean } {
  const complete = days.filter((d) => isCompleteDay(d.date, todayStr));
  if (complete.length > 0) return { days: complete, todayExcluded: complete.length < days.length };
  return { days, todayExcluded: false };
}

/**
 * Mean calories across the days that `averageDays` selects. Days present in `days`
 * count even if they total 0, so logging only zero-calorie items still marks the day
 * as tracked. Returns 0 only when nothing at all is logged.
 */
export function averageDailyCalories(days: DayCalories[], todayStr: string = today()): number {
  const counted = averageDays(days, todayStr).days;
  if (counted.length === 0) return 0;
  return Math.round(counted.reduce((sum, d) => sum + d.total, 0) / counted.length);
}
