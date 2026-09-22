import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Dumbbell, Utensils, Scale, Brain, Target } from 'lucide-react';
import type { WorkoutSession, FoodEntry, Measurement, CheckInEntry, MacroTargets, FitnessGoal } from '../../types';
import { formatShortDate } from '../../utils/dateHelpers';
import { macroStatusColor } from '../../utils/macroColors';
import { rollingWindow } from '../../utils/calorieAverage';
import { GOAL_LABELS } from '../../utils/tdee';
import { totalSetCounts, hasRatedSets, formatSets } from '../../utils/muscleVolume';
import { toDisplayWeight, type WeightUnit } from '../../utils/units';

interface Props {
  sessions: WorkoutSession[];
  allFoodEntries: FoodEntry[];
  measurements: Measurement[];
  checkIns: CheckInEntry[];
  macroTargets: MacroTargets;
  // Looks up the targets/goal that were actually in effect on a given date, so a past
  // window is judged against the goal active then rather than today's goal.
  getTargetsForDate?: (date: string) => MacroTargets;
  getGoalForDate?: (date: string) => FitnessGoal | undefined;
  units: 'imperial' | 'metric';
}

// Seven complete days, compared against the seven before them.
const WINDOW = 7;

interface InsightMetric {
  label: string;
  value: string;
  subtext?: string;
  trend?: 'up' | 'down' | 'flat';
  trendGood?: boolean;
  icon: typeof Dumbbell;
  color: string;
}

export function WeeklyInsights({ sessions, allFoodEntries, measurements, checkIns, macroTargets, getTargetsForDate, getGoalForDate, units }: Props) {
  const [expanded, setExpanded] = useState(false);
  // 0 is the most recent window; each step back is a whole window width, so the
  // comparison is always 7 complete days against the 7 before them.
  const [windowOffset, setWindowOffset] = useState(0);

  const windowDays = useMemo(() => rollingWindow(WINDOW, windowOffset), [windowOffset]);
  const prevWindowDays = useMemo(() => rollingWindow(WINDOW, windowOffset + 1), [windowOffset]);

  const windowDates = useMemo(() => new Set(windowDays), [windowDays]);
  const prevWindowDates = useMemo(() => new Set(prevWindowDays), [prevWindowDays]);

  const windowLabel = useMemo(
    () => `${formatShortDate(windowDays[0])} – ${formatShortDate(windowDays[WINDOW - 1])}`,
    [windowDays]
  );

  // Targets as they stood at the end of the window, not necessarily today's targets
  const windowTargets = useMemo(
    () => getTargetsForDate ? getTargetsForDate(windowDays[WINDOW - 1]) : macroTargets,
    [getTargetsForDate, windowDays, macroTargets]
  );

  // Which phase (cut/maintain/build) was active across the window — and whether it
  // changed partway through, so a switched stretch isn't mislabeled.
  const windowGoalLabel = useMemo(() => {
    if (!getGoalForDate) return null;
    const goalStart = getGoalForDate(windowDays[0]);
    const goalEnd = getGoalForDate(windowDays[WINDOW - 1]);
    if (!goalStart && !goalEnd) return null;
    if (goalStart && goalEnd && goalStart !== goalEnd) {
      return `${GOAL_LABELS[goalStart]} → ${GOAL_LABELS[goalEnd]}`;
    }
    const goal = goalEnd || goalStart;
    return goal ? GOAL_LABELS[goal] : null;
  }, [getGoalForDate, windowDays]);

  const insights = useMemo(() => {
    // --- Training ---
    const windowSessions = sessions.filter((s) => windowDates.has(s.date));
    const prevSessions = sessions.filter((s) => prevWindowDates.has(s.date));

    // Hard sets — sets taken close to failure — drive hypertrophy far better than
    // tonnage does, so they are the headline training number.
    const windowCounts = totalSetCounts(windowSessions);
    const prevCounts = totalSetCounts(prevSessions);
    const hasEffortData = hasRatedSets([windowCounts, prevCounts]);
    const windowVolume = hasEffortData ? windowCounts.hard : windowCounts.sets;
    const prevVolume = hasEffortData ? prevCounts.hard : prevCounts.sets;
    const windowSets = windowCounts.sets;

    // --- Nutrition ---
    const windowFood = allFoodEntries.filter((f) => windowDates.has(f.date));
    const prevFood = allFoodEntries.filter((f) => prevWindowDates.has(f.date));

    const caloriesByDay = new Map<string, number>();
    const proteinByDay = new Map<string, number>();
    const carbsByDay = new Map<string, number>();
    const fatByDay = new Map<string, number>();
    for (const f of windowFood) {
      const cals = f.calories * f.servingsConsumed;
      const prot = f.protein * f.servingsConsumed;
      const carbs = f.carbs * f.servingsConsumed;
      const fat = f.fat * f.servingsConsumed;
      caloriesByDay.set(f.date, (caloriesByDay.get(f.date) || 0) + cals);
      proteinByDay.set(f.date, (proteinByDay.get(f.date) || 0) + prot);
      carbsByDay.set(f.date, (carbsByDay.get(f.date) || 0) + carbs);
      fatByDay.set(f.date, (fatByDay.get(f.date) || 0) + fat);
    }

    // Days inside the window that were actually logged. The window holds no partial
    // day, so every one of them counts.
    const avgDates = [...caloriesByDay.keys()].sort((a, b) => a.localeCompare(b));
    const daysLogged = avgDates.length;
    // The span the average actually covers, which is narrower than the window whenever
    // days went unlogged. A label wider than the data is what made this number look
    // like it belonged to some other stretch of days.
    const avgSpan = daysLogged === 0
      ? null
      : daysLogged === 1
        ? formatShortDate(avgDates[0])
        : `${formatShortDate(avgDates[0])} – ${formatShortDate(avgDates[daysLogged - 1])}`;
    const avgOf = (byDay: Map<string, number>) => daysLogged > 0
      ? Math.round(avgDates.reduce((sum, date) => sum + (byDay.get(date) || 0), 0) / daysLogged)
      : 0;

    const avgCalories = avgOf(caloriesByDay);
    const avgProtein = avgOf(proteinByDay);
    const avgCarbs = avgOf(carbsByDay);
    const avgFat = avgOf(fatByDay);

    const prevCalsByDay = new Map<string, number>();
    for (const f of prevFood) {
      prevCalsByDay.set(f.date, (prevCalsByDay.get(f.date) || 0) + f.calories * f.servingsConsumed);
    }
    const prevDaysLogged = prevCalsByDay.size;
    const prevAvgCalories = prevDaysLogged > 0
      ? Math.round([...prevCalsByDay.values()].reduce((a, b) => a + b, 0) / prevDaysLogged)
      : 0;

    const proteinDaysHit = avgDates.filter((date) => (proteinByDay.get(date) || 0) >= windowTargets.protein).length;

    // --- Weight ---
    const windowWeights = measurements
      .filter((m) => m.weight != null && windowDates.has(m.date))
      .sort((a, b) => a.date.localeCompare(b.date));
    const prevWeights = measurements
      .filter((m) => m.weight != null && prevWindowDates.has(m.date))
      .sort((a, b) => a.date.localeCompare(b.date));

    const avgWeight = windowWeights.length > 0
      ? windowWeights.reduce((sum, m) => sum + m.weight!, 0) / windowWeights.length
      : null;
    const prevAvgWeight = prevWeights.length > 0
      ? prevWeights.reduce((sum, m) => sum + m.weight!, 0) / prevWeights.length
      : null;
    const weightChange = avgWeight != null && prevAvgWeight != null ? avgWeight - prevAvgWeight : null;
    const weightUnit: WeightUnit = units === 'metric' ? 'kg' : 'lbs';
    const weighIns = windowWeights.length;

    // --- Check-ins ---
    const windowCheckIns = checkIns.filter((c) => windowDates.has(c.date));
    const prevCheckIns = checkIns.filter((c) => prevWindowDates.has(c.date));

    const avgCheckInScore = windowCheckIns.length > 0
      ? windowCheckIns.reduce((sum, ci) => {
          const numericResponses = ci.responses.filter((r) => typeof r.value === 'number');
          if (numericResponses.length === 0) return sum;
          const avg = numericResponses.reduce((a, r) => a + (r.value as number), 0) / numericResponses.length;
          return sum + avg;
        }, 0) / windowCheckIns.length
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
      workouts: windowSessions.length,
      prevWorkouts: prevSessions.length,
      totalSets: windowSets,
      volume: windowVolume,
      prevVolume,
      hasEffortData,
      tonnage: windowCounts.volume,
      prevTonnage: prevCounts.volume,
      avgCalories,
      avgProtein,
      avgCarbs,
      avgFat,
      prevAvgCalories,
      calorieTarget: windowTargets.calories,
      daysLogged,
      avgSpan,
      proteinDaysHit,
      avgWeight,
      weighIns,
      weightChange,
      weightUnit,
      avgCheckInScore,
      prevAvgCheckIn,
      checkInCount: windowCheckIns.length,
    };
  }, [sessions, allFoodEntries, measurements, checkIns, windowTargets, windowDates, prevWindowDates, units]);

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
      subtext: insights.hasEffortData
        ? `${formatSets(insights.volume)} hard of ${insights.totalSets} sets`
        : `${insights.totalSets} working sets`,
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
        subtext: `${insights.avgSpan} · ${calDiff >= 0 ? '+' : ''}${calDiff} from target · Protein ${insights.proteinDaysHit}/${insights.daysLogged} days`,
        trend: calTrend,
        icon: Utensils,
        color: '#f5a623',
      });
    }

    // Weight (7-day rolling average vs. previous 7-day average, to avoid single-day noise)
    if (insights.avgWeight != null) {
      const wTrend = insights.weightChange != null
        ? compareTrend(insights.weightChange, 0, 0.1)
        : undefined;
      m.push({
        label: 'Weight',
        value: `${insights.avgWeight.toFixed(1)} ${insights.weightUnit}`,
        subtext: insights.weightChange != null
          ? `${insights.weightChange > 0 ? '+' : ''}${insights.weightChange.toFixed(1)} ${insights.weightUnit} vs previous ${WINDOW} days`
          : `${WINDOW}-day avg · ${insights.weighIns} weigh-in${insights.weighIns !== 1 ? 's' : ''}`,
        trend: wTrend,
        icon: Scale,
        color: '#5b6ef5',
      });
    }

    // Check-ins
    if (insights.checkInCount > 0 && insights.avgCheckInScore != null) {
      const ciTrend = insights.prevAvgCheckIn != null
        ? compareTrend(insights.avgCheckInScore, insights.prevAvgCheckIn, 0.3)
        : undefined;
      m.push({
        label: 'Wellbeing',
        value: `${insights.avgCheckInScore.toFixed(1)} / 10`,
        subtext: `${insights.checkInCount} check-in${insights.checkInCount !== 1 ? 's' : ''}`,
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-accent" />
          <h2 className="label">Last {WINDOW} Days</h2>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 -mr-1"
        >
          {expanded
            ? <ChevronUp size={16} className="text-text-muted" />
            : <ChevronDown size={16} className="text-text-muted" />
          }
        </button>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <button
          type="button"
          onClick={() => setWindowOffset((o) => o + 1)}
          className="p-1 rounded-lg hover:bg-surface-raised"
        >
          <ChevronLeft size={14} className="text-text-muted" />
        </button>
        <span className="text-[0.625rem] text-text-muted tabular-nums">
          {windowLabel}
        </span>
        <button
          type="button"
          onClick={() => setWindowOffset((o) => Math.max(0, o - 1))}
          disabled={windowOffset <= 0}
          className="p-1 rounded-lg hover:bg-surface-raised disabled:opacity-30"
        >
          <ChevronRight size={14} className="text-text-muted" />
        </button>
      </div>
      {windowGoalLabel && (
        <div className="flex justify-center mt-1">
          <span className="text-[0.5625rem] px-2 py-0.5 rounded-full bg-surface-raised text-text-muted">
            Goal: {windowGoalLabel}
          </span>
        </div>
      )}

      {/* Always visible: top 2 metrics as compact row */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        {topMetrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="bg-surface-raised rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={12} style={{ color: m.color }} />
                <span className="text-[0.625rem] text-text-muted font-semibold uppercase">{m.label}</span>
                <TrendIcon trend={m.trend} good={m.trendGood} />
              </div>
              <div className="text-sm font-bold">{m.value}</div>
              {m.subtext && (
                <div className="text-[0.625rem] text-text-muted mt-0.5 leading-tight">{m.subtext}</div>
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
                  <span className="text-[0.625rem] text-text-muted font-semibold uppercase">{m.label}</span>
                  <TrendIcon trend={m.trend} good={m.trendGood} />
                </div>
                <div className="text-sm font-bold">{m.value}</div>
                {m.subtext && (
                  <div className="text-[0.625rem] text-text-muted mt-0.5 leading-tight">{m.subtext}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded: this window against the one before it */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[0.625rem] text-text-muted font-semibold uppercase mb-2">vs. Previous {WINDOW} Days</div>
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
                label={insights.hasEffortData ? 'Hard sets' : 'Working sets'}
                current={Math.round(insights.volume)}
                previous={Math.round(insights.prevVolume)}
              />
            ) : null}
            {insights.tonnage > 0 || insights.prevTonnage > 0 ? (
              <ComparisonRow
                label="Tonnage"
                current={Math.round(toDisplayWeight(insights.tonnage, insights.weightUnit))}
                previous={Math.round(toDisplayWeight(insights.prevTonnage, insights.weightUnit))}
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

      {/* Expanded: avg macro breakdown */}
      {expanded && insights.daysLogged > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[0.625rem] text-text-muted font-semibold uppercase mb-2">
            Avg Daily Intake <span className="font-normal normal-case">({insights.avgSpan} · {insights.daysLogged}d)</span>
          </div>
          <div className="space-y-2">
            {[
              { label: 'Calories', value: insights.avgCalories, target: windowTargets.calories, unit: 'cal', color: '#e8572a' },
              { label: 'Protein',  value: insights.avgProtein,  target: windowTargets.protein,  unit: 'g',   color: '#5b6ef5' },
              { label: 'Carbs',    value: insights.avgCarbs,    target: windowTargets.carbs,    unit: 'g',   color: '#2e9e6b' },
              { label: 'Fat',      value: insights.avgFat,      target: windowTargets.fat,      unit: 'g',   color: '#f5a623' },
            ].map(({ label, value, target, unit }) => {
              const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
              const isOver = target > 0 && value > target;
              const statusColor = macroStatusColor(value, target);
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[0.625rem] text-text-muted">{label}</span>
                    <span className="text-[0.625rem] tabular-nums">
                      <span className="font-medium" style={{ color: statusColor }}>
                        {value.toLocaleString()}
                      </span>
                      <span className="text-text-muted"> / {target.toLocaleString()} {unit}</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${isOver ? 100 : pct}%`, backgroundColor: statusColor }} />
                  </div>
                </div>
              );
            })}
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
          <span className={`text-[0.625rem] font-medium ${isUp ? 'text-green-500' : 'text-danger'}`}>
            {isUp ? '+' : ''}{pct}%
          </span>
        )}
      </div>
    </div>
  );
}
