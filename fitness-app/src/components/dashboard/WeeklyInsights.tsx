import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, Dumbbell, Utensils, Scale, Brain, Target } from 'lucide-react';
import type { WorkoutSession, FoodEntry, Measurement, CheckInEntry, MacroTargets } from '../../types';
import { getWeekDates, today } from '../../utils/dateHelpers';

interface Props {
  sessions: WorkoutSession[];
  allFoodEntries: FoodEntry[];
  measurements: Measurement[];
  checkIns: CheckInEntry[];
  macroTargets: MacroTargets;
  units: 'imperial' | 'metric';
}

interface InsightMetric {
  label: string;
  value: string;
  subtext?: string;
  trend?: 'up' | 'down' | 'flat';
  trendGood?: boolean;
  icon: typeof Dumbbell;
  color: string;
}

function getLastNDays(n: number): string[] {
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today() + 'T00:00:00');
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export function WeeklyInsights({ sessions, allFoodEntries, measurements, checkIns, macroTargets, units }: Props) {
  const [expanded, setExpanded] = useState(false);
  const weekDates = useMemo(() => new Set(getWeekDates(today())), []);
  const last7 = useMemo(() => new Set(getLastNDays(7)), []);
  const prev7 = useMemo(() => new Set(getLastNDays(14).filter((d) => !last7.has(d))), [last7]);

  const insights = useMemo(() => {
    // --- Training ---
    const weekSessions = sessions.filter((s) => weekDates.has(s.date));
    const prevWeekSessions = sessions.filter((s) => prev7.has(s.date));

    const weekVolume = weekSessions.reduce((sum, s) =>
      sum + Object.values(s.sets).reduce((vs, sets) =>
        vs + sets.filter((st) => st.completed && !st.isWarmup).reduce((a, st) => a + st.weight * st.reps, 0), 0), 0);
    const prevVolume = prevWeekSessions.reduce((sum, s) =>
      sum + Object.values(s.sets).reduce((vs, sets) =>
        vs + sets.filter((st) => st.completed && !st.isWarmup).reduce((a, st) => a + st.weight * st.reps, 0), 0), 0);

    const weekSets = weekSessions.reduce((sum, s) =>
      sum + Object.values(s.sets).reduce((vs, sets) =>
        vs + sets.filter((st) => st.completed).length, 0), 0);

    // --- Nutrition ---
    const weekFood = allFoodEntries.filter((f) => last7.has(f.date));
    const prevFood = allFoodEntries.filter((f) => prev7.has(f.date));

    const caloriesByDay = new Map<string, number>();
    const proteinByDay = new Map<string, number>();
    for (const f of weekFood) {
      const cals = f.calories * f.servingsConsumed;
      const prot = f.protein * f.servingsConsumed;
      caloriesByDay.set(f.date, (caloriesByDay.get(f.date) || 0) + cals);
      proteinByDay.set(f.date, (proteinByDay.get(f.date) || 0) + prot);
    }

    const daysLogged = caloriesByDay.size;
    const avgCalories = daysLogged > 0
      ? Math.round([...caloriesByDay.values()].reduce((a, b) => a + b, 0) / daysLogged)
      : 0;

    const prevCalsByDay = new Map<string, number>();
    for (const f of prevFood) {
      prevCalsByDay.set(f.date, (prevCalsByDay.get(f.date) || 0) + f.calories * f.servingsConsumed);
    }
    const prevDaysLogged = prevCalsByDay.size;
    const prevAvgCalories = prevDaysLogged > 0
      ? Math.round([...prevCalsByDay.values()].reduce((a, b) => a + b, 0) / prevDaysLogged)
      : 0;

    const proteinDaysHit = [...proteinByDay.values()].filter((p) => p >= macroTargets.protein).length;

    // --- Weight ---
    const weekWeights = measurements
      .filter((m) => m.weight != null && last7.has(m.date))
      .sort((a, b) => a.date.localeCompare(b.date));
    const prevWeights = measurements
      .filter((m) => m.weight != null && prev7.has(m.date))
      .sort((a, b) => a.date.localeCompare(b.date));

    const latestWeight = weekWeights.length > 0 ? weekWeights[weekWeights.length - 1].weight! : null;
    const prevLatestWeight = prevWeights.length > 0 ? prevWeights[prevWeights.length - 1].weight! : null;
    const weightChange = latestWeight && prevLatestWeight ? latestWeight - prevLatestWeight : null;
    const weightUnit = units === 'metric' ? 'kg' : 'lbs';

    // --- Check-ins ---
    const weekCheckIns = checkIns.filter((c) => last7.has(c.date));
    const prevCheckIns = checkIns.filter((c) => prev7.has(c.date));

    const avgCheckInScore = weekCheckIns.length > 0
      ? weekCheckIns.reduce((sum, ci) => {
          const numericResponses = ci.responses.filter((r) => typeof r.value === 'number');
          if (numericResponses.length === 0) return sum;
          const avg = numericResponses.reduce((a, r) => a + (r.value as number), 0) / numericResponses.length;
          return sum + avg;
        }, 0) / weekCheckIns.length
      : null;

    const prevAvgCheckIn = prevCheckIns.length > 0
      ? prevCheckIns.reduce((sum, ci) => {
          const numericResponses = ci.responses.filter((r) => typeof r.value === 'number');
          if (numericResponses.length === 0) return sum;
          const avg = numericResponses.reduce((a, r) => a + (r.value as number), 0) / numericResponses.length;
          return sum + avg;
        }, 0) / prevCheckIns.length
      : null;

    return {
      workouts: weekSessions.length,
      prevWorkouts: prevWeekSessions.length,
      totalSets: weekSets,
      volume: weekVolume,
      prevVolume,
      avgCalories,
      prevAvgCalories,
      calorieTarget: macroTargets.calories,
      daysLogged,
      proteinDaysHit,
      latestWeight,
      weightChange,
      weightUnit,
      avgCheckInScore,
      prevAvgCheckIn,
      weekCheckIns: weekCheckIns.length,
    };
  }, [sessions, allFoodEntries, measurements, checkIns, macroTargets, weekDates, last7, prev7, units]);

  const metrics: InsightMetric[] = useMemo(() => {
    const m: InsightMetric[] = [];

    function compareTrend(current: number, previous: number, threshold = 0): 'up' | 'down' | 'flat' | undefined {
      if (previous <= 0) return undefined;
      if (current > previous + threshold) return 'up';
      if (current < previous - threshold) return 'down';
      return 'flat';
    }

    // Training
    const volTrend = compareTrend(insights.volume, insights.prevVolume);
    m.push({
      label: 'Training',
      value: `${insights.workouts} workouts`,
      subtext: `${insights.totalSets} sets · ${Math.round(insights.volume).toLocaleString()} ${insights.weightUnit}`,
      trend: volTrend,
      trendGood: volTrend === 'up',
      icon: Dumbbell,
      color: '#e8572a',
    });

    // Nutrition
    if (insights.daysLogged > 0) {
      const calDiff = insights.avgCalories - insights.calorieTarget;
      const calTrend = compareTrend(insights.avgCalories, insights.prevAvgCalories);
      m.push({
        label: 'Nutrition',
        value: `${insights.avgCalories.toLocaleString()} cal avg`,
        subtext: `${calDiff >= 0 ? '+' : ''}${calDiff} from target · Protein ${insights.proteinDaysHit}/${insights.daysLogged} days`,
        trend: calTrend,
        icon: Utensils,
        color: '#f5a623',
      });
    }

    // Weight
    if (insights.latestWeight) {
      const wTrend = insights.weightChange != null
        ? compareTrend(insights.weightChange, 0, 0.1)
        : undefined;
      m.push({
        label: 'Weight',
        value: `${insights.latestWeight} ${insights.weightUnit}`,
        subtext: insights.weightChange != null
          ? `${insights.weightChange > 0 ? '+' : ''}${insights.weightChange.toFixed(1)} ${insights.weightUnit} from last week`
          : 'No previous week data',
        trend: wTrend,
        icon: Scale,
        color: '#5b6ef5',
      });
    }

    // Check-ins
    if (insights.weekCheckIns > 0 && insights.avgCheckInScore != null) {
      const ciTrend = insights.prevAvgCheckIn != null
        ? compareTrend(insights.avgCheckInScore, insights.prevAvgCheckIn, 0.3)
        : undefined;
      m.push({
        label: 'Wellbeing',
        value: `${insights.avgCheckInScore.toFixed(1)} / 10`,
        subtext: `${insights.weekCheckIns} check-in${insights.weekCheckIns !== 1 ? 's' : ''} this week`,
        trend: ciTrend,
        trendGood: ciTrend === 'up',
        icon: Brain,
        color: '#2e9e6b',
      });
    }

    return m;
  }, [insights]);

  if (metrics.length === 0) return null;

  const TrendIcon = ({ trend, good }: { trend?: 'up' | 'down' | 'flat'; good?: boolean }) => {
    if (!trend) return null;
    if (trend === 'flat') return <Minus size={12} className="text-text-muted" />;
    if (trend === 'up') return <TrendingUp size={12} className={good === false ? 'text-danger' : 'text-green-500'} />;
    return <TrendingDown size={12} className={good === false ? 'text-green-500' : 'text-danger'} />;
  };

  const topMetrics = metrics.slice(0, 2);
  const restMetrics = metrics.slice(2);

  return (
    <div className="card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Target size={14} className="text-accent" />
          <h2 className="label">Week in Review</h2>
        </div>
        {expanded
          ? <ChevronUp size={16} className="text-text-muted" />
          : <ChevronDown size={16} className="text-text-muted" />
        }
      </button>

      {/* Always visible: top 2 metrics as compact row */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        {topMetrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="bg-surface-raised rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={12} style={{ color: m.color }} />
                <span className="text-[10px] text-text-muted font-semibold uppercase">{m.label}</span>
                <TrendIcon trend={m.trend} good={m.trendGood} />
              </div>
              <div className="text-sm font-bold">{m.value}</div>
              {m.subtext && (
                <div className="text-[10px] text-text-muted mt-0.5 leading-tight">{m.subtext}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Expanded: rest of the metrics */}
      {expanded && restMetrics.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          {restMetrics.map((m) => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="bg-surface-raised rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon size={12} style={{ color: m.color }} />
                  <span className="text-[10px] text-text-muted font-semibold uppercase">{m.label}</span>
                  <TrendIcon trend={m.trend} good={m.trendGood} />
                </div>
                <div className="text-sm font-bold">{m.value}</div>
                {m.subtext && (
                  <div className="text-[10px] text-text-muted mt-0.5 leading-tight">{m.subtext}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded: week-over-week comparison */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[10px] text-text-muted font-semibold uppercase mb-2">vs. Previous Week</div>
          <div className="space-y-1.5">
            {insights.prevWorkouts > 0 || insights.workouts > 0 ? (
              <ComparisonRow
                label="Workouts"
                current={insights.workouts}
                previous={insights.prevWorkouts}
              />
            ) : null}
            {insights.volume > 0 || insights.prevVolume > 0 ? (
              <ComparisonRow
                label="Volume"
                current={Math.round(insights.volume)}
                previous={Math.round(insights.prevVolume)}
                suffix={insights.weightUnit}
              />
            ) : null}
            {insights.avgCalories > 0 || insights.prevAvgCalories > 0 ? (
              <ComparisonRow
                label="Avg Calories"
                current={insights.avgCalories}
                previous={insights.prevAvgCalories}
                suffix="cal"
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function ComparisonRow({ label, current, previous, suffix }: {
  label: string;
  current: number;
  previous: number;
  suffix?: string;
}) {
  const diff = current - previous;
  const pct = previous > 0 ? Math.round((diff / previous) * 100) : 0;
  const isUp = diff > 0;
  const isFlat = diff === 0;

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-text-muted">
          {previous.toLocaleString()}{suffix ? ` ${suffix}` : ''}
        </span>
        <span className="text-text-muted">→</span>
        <span className="font-semibold">
          {current.toLocaleString()}{suffix ? ` ${suffix}` : ''}
        </span>
        {!isFlat && previous > 0 && (
          <span className={`text-[10px] font-medium ${isUp ? 'text-green-500' : 'text-danger'}`}>
            {isUp ? '+' : ''}{pct}%
          </span>
        )}
      </div>
    </div>
  );
}
