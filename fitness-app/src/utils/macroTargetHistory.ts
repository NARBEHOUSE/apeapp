import type { FitnessGoal, MacroTargetHistoryEntry, MacroTargets, Profile } from '../types';

function findEntryForDate(profile: Profile, date: string): MacroTargetHistoryEntry | undefined {
  const history = profile.macroTargetHistory;
  if (!history || history.length === 0) return undefined;

  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const applicable = sorted.filter((h) => h.date <= date);
  return applicable.length > 0 ? applicable[applicable.length - 1] : sorted[0];
}

// The macro targets that were actually in effect on `date`, based on the profile's
// tracked history of target changes — falls back to the profile's current targets
// for profiles with no history (e.g. created before this tracking existed) or for
// dates before the first tracked change.
export function getMacroTargetsForDate(profile: Profile, date: string): MacroTargets {
  return findEntryForDate(profile, date)?.macroTargets ?? profile.macroTargets;
}

// The fitness goal (cutting/maintaining/bulking) that was actually in effect on `date`.
export function getFitnessGoalForDate(profile: Profile, date: string): FitnessGoal | undefined {
  return findEntryForDate(profile, date)?.fitnessGoal ?? profile.bodyStats?.fitnessGoal;
}
