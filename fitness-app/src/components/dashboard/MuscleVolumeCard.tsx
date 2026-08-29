import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import type { WorkoutSession, Program } from '../../types';
import { getWeekDates, today } from '../../utils/dateHelpers';
import { getWeightUnit, toDisplayWeight } from '../../utils/units';
import {
  buildExerciseMuscleMap,
  muscleSetsForSessions,
  totalSetCounts,
  hasRatedSets,
  avgRir,
  effortBand,
  formatSets,
} from '../../utils/muscleVolume';

interface Props {
  sessions: WorkoutSession[];
  programs: Program[];
}

interface MuscleRow {
  muscle: string;
  /** Hard sets, or plain working sets when nothing is rated. */
  value: number;
  sets: number;
  /** Average proximity to failure across the week's rated sets. */
  rir: number | null;
}

export function MuscleVolumeCard({ sessions, programs }: Props) {
  const [expanded, setExpanded] = useState(false);
  const weightUnit = getWeightUnit();
  const weekDates = useMemo(() => new Set(getWeekDates(today())), []);

  // Exercise -> muscle group, from the library plus each session's own manifest, so
  // freestyle and off-program lifts get muscle credit too.
  const exerciseMuscleMap = useMemo(() => buildExerciseMuscleMap(programs, sessions), [programs, sessions]);

  const { muscleData, hasEffortData, tonnage } = useMemo(() => {
    const weekSessions = sessions.filter((s) => weekDates.has(s.date));
    const current = muscleSetsForSessions(weekSessions, exerciseMuscleMap);

    // Effort logging is opt-in, so fall back to plain working sets when nothing is rated.
    const rated = hasRatedSets(Object.values(current));
    const metric = rated ? 'hard' : 'sets';

    const rows: MuscleRow[] = Object.entries(current).map(([muscle, counts]) => ({
      muscle,
      value: counts[metric],
      sets: counts.sets,
      rir: avgRir(counts),
    }));
    rows.sort((a, b) => b.value - a.value || b.sets - a.sets);
    // Tonnage across the week, counted once per set rather than per muscle credited.
    const tonnage = totalSetCounts(weekSessions).volume;
    return { muscleData: rows, hasEffortData: rated, tonnage };
  }, [sessions, weekDates, exerciseMuscleMap]);

  if (muscleData.length === 0) return null;

  const topMuscles = expanded ? muscleData : muscleData.slice(0, 4);
  // Scaled relative to the biggest mover, not to a target the app has no basis to set.
  const scaleMax = Math.max(1, ...muscleData.map((d) => (hasEffortData ? d.sets : d.value)));

  return (
    <div className="card">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-accent" />
          <h2 className="label">Weekly {hasEffortData ? 'Hard Sets' : 'Working Sets'}</h2>
        </div>
        {expanded ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
      </button>

      <div className="mt-3 space-y-2">
        {topMuscles.map((m) => {
          const pct = Math.min(100, (m.value / scaleMax) * 100);
          // Faded tail = sets logged but left too far from failure to count.
          const tailPct = hasEffortData ? Math.min(100, (m.sets / scaleMax) * 100) - pct : 0;
          const band = m.rir != null ? effortBand(m.rir) : null;

          return (
            <div key={m.muscle}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="font-medium capitalize">{m.muscle}</span>
                <span className="text-text-muted tabular-nums">
                  {formatSets(m.value)}
                  {hasEffortData && m.sets > m.value ? `/${formatSets(m.sets)}` : ''} sets
                  {m.rir != null && (
                    <span className={`ml-1.5 ${band === 'productive' ? 'text-green-500' : band === 'failure' ? 'text-[#f5a623]' : 'text-text-muted'}`}>
                      {m.rir.toFixed(1)} RIR
                    </span>
                  )}
                </span>
              </div>
              <div className="flex h-2 rounded-full bg-surface-raised overflow-hidden">
                <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                {tailPct > 0 && <div className="h-full bg-accent opacity-40 transition-all" style={{ width: `${tailPct}%` }} />}
              </div>
            </div>
          );
        })}
      </div>

      {tonnage > 0 && (
        <p className="text-[0.625rem] text-text-muted mt-2 tabular-nums">
          {toDisplayWeight(tonnage, weightUnit).toLocaleString()} {weightUnit} moved this week
        </p>
      )}

      {!hasEffortData && (
        <p className="text-[0.625rem] text-text-muted mt-1">
          Turn on RIR or RPE tracking in your program to separate hard sets from easy ones.
        </p>
      )}

      {!expanded && muscleData.length > 4 && (
        <button onClick={() => setExpanded(true)} className="text-[0.625rem] text-accent-blue font-medium mt-2 w-full text-center">
          Show all {muscleData.length} muscle groups
        </button>
      )}
    </div>
  );
}
