import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import type { WorkoutSession, Program } from '../../types';
import { getWeekDates, today } from '../../utils/dateHelpers';

interface Props {
  sessions: WorkoutSession[];
  programs: Program[];
}

interface MuscleVolume {
  muscle: string;
  sets: number;
  volume: number;
  prevSets: number;
  prevVolume: number;
  topWeight: number;
}

export function MuscleVolumeCard({ sessions, programs }: Props) {
  const [expanded, setExpanded] = useState(false);
  const weekDates = useMemo(() => new Set(getWeekDates(today())), []);
  const prevWeekDates = useMemo(() => {
    const d = new Date(today() + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    return new Set(getWeekDates(d.toISOString().split('T')[0]));
  }, []);

  // Build exercise -> muscle group map from all programs
  const exerciseMuscleMap = useMemo(() => {
    const map: Record<string, { primaries: string[]; secondary: string[] }> = {};
    for (const prog of programs) {
      for (const day of prog.days) {
        for (const ex of day.exercises) {
          if (ex.muscle) {
            const primaries = ex.muscle.split(',').map((m) => m.trim()).filter(Boolean);
            map[ex.id] = { primaries, secondary: ex.secondaryMuscles || [] };
          }
        }
      }
    }
    return map;
  }, [programs]);

  const muscleData = useMemo(() => {
    const weekSessions = sessions.filter((s) => weekDates.has(s.date));
    const prevSessions = sessions.filter((s) => prevWeekDates.has(s.date) && !weekDates.has(s.date));

    function calcMuscleVolume(sess: WorkoutSession[]) {
      const muscles: Record<string, { sets: number; volume: number; topWeight: number }> = {};
      for (const s of sess) {
        for (const [exId, sets] of Object.entries(s.sets)) {
          const workingSets = sets.filter((st) => st.completed && !st.isWarmup);
          if (workingSets.length === 0) continue;
          const info = exerciseMuscleMap[exId];
          const primaries = info?.primaries || [];
          const secondary = info?.secondary || [];
          if (primaries.length === 0) continue;

          const vol = workingSets.reduce((a, st) => a + st.weight * st.reps, 0);
          const top = Math.max(...workingSets.map((st) => st.weight));

          // All primary muscles: full credit each
          for (const primary of primaries) {
            if (!primary) continue;
            if (!muscles[primary]) muscles[primary] = { sets: 0, volume: 0, topWeight: 0 };
            muscles[primary].sets += workingSets.length;
            muscles[primary].volume += vol;
            muscles[primary].topWeight = Math.max(muscles[primary].topWeight, top);
          }

          // Secondary: half credit
          for (const sec of secondary) {
            if (!sec) continue;
            if (!muscles[sec]) muscles[sec] = { sets: 0, volume: 0, topWeight: 0 };
            muscles[sec].sets += Math.round(workingSets.length * 0.5);
            muscles[sec].volume += Math.round(vol * 0.5);
            muscles[sec].topWeight = Math.max(muscles[sec].topWeight, top);
          }
        }
      }
      return muscles;
    }

    const current = calcMuscleVolume(weekSessions);
    const prev = calcMuscleVolume(prevSessions);

    const allMuscles = new Set([...Object.keys(current), ...Object.keys(prev)]);
    const result: MuscleVolume[] = [];
    for (const muscle of allMuscles) {
      result.push({
        muscle,
        sets: current[muscle]?.sets || 0,
        volume: current[muscle]?.volume || 0,
        prevSets: prev[muscle]?.sets || 0,
        prevVolume: prev[muscle]?.volume || 0,
        topWeight: current[muscle]?.topWeight || 0,
      });
    }
    return result.sort((a, b) => b.volume - a.volume);
  }, [sessions, weekDates, prevWeekDates, exerciseMuscleMap]);

  if (muscleData.length === 0) return null;

  const topMuscles = expanded ? muscleData : muscleData.slice(0, 4);

  return (
    <div className="card">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-accent" />
          <h2 className="label">Muscle Volume</h2>
        </div>
        {expanded ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
      </button>

      <div className="mt-3 space-y-2">
        {topMuscles.map((m) => {
          const maxVol = Math.max(...muscleData.map((d) => d.volume), 1);
          const pct = (m.volume / maxVol) * 100;
          const trend = m.prevVolume > 0 ? Math.round(((m.volume - m.prevVolume) / m.prevVolume) * 100) : null;

          return (
            <div key={m.muscle}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="font-medium capitalize">{m.muscle}</span>
                <span className="text-text-muted tabular-nums">
                  {m.sets} sets · {Math.round(m.volume).toLocaleString()} lbs
                  {trend != null && (
                    <span className={`ml-1 ${trend > 0 ? 'text-green-500' : trend < 0 ? 'text-danger' : 'text-text-muted'}`}>
                      {trend > 0 ? '+' : ''}{trend}%
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-raised overflow-hidden">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {!expanded && muscleData.length > 4 && (
        <button onClick={() => setExpanded(true)} className="text-[10px] text-accent-blue font-medium mt-2 w-full text-center">
          Show all {muscleData.length} muscle groups
        </button>
      )}
    </div>
  );
}
