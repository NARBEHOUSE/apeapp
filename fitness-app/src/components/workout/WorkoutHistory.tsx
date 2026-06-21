import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Calendar, TrendingUp, BarChart3, Share2 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import type { WorkoutSession, Program } from '../../types';
import { buildWorkoutCardData, renderWorkoutCard, shareOrDownload } from '../../utils/shareCards';

interface Props {
  sessions: WorkoutSession[];
  programs: Program[];
}

function SessionCard({
  session,
  program,
}: {
  session: WorkoutSession;
  program: Program | undefined;
}) {
  const [expanded, setExpanded] = useState(false);

  const day = program?.days.find((d) => d.id === session.dayId);
  const totalSets = Object.values(session.sets).reduce(
    (sum, sets) => sum + sets.filter((s) => s.completed).length,
    0
  );
  const totalVolume = Object.values(session.sets).reduce(
    (sum, sets) =>
      sum +
      sets
        .filter((s) => s.completed)
        .reduce((acc, s) => acc + s.weight * s.reps, 0),
    0
  );
  const durationMs = (session.endTime || Date.now()) - session.startTime;
  const durationMin = Math.round(durationMs / 60000);

  const dateStr = new Date(session.date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 text-left"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
          style={{ backgroundColor: day?.accent || '#e8572a' }}
        >
          {day?.label?.slice(0, 2) || 'W'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">
            {day?.title || program?.name || 'Workout'}
          </div>
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <span>{dateStr}</span>
            <span className="text-text-muted">|</span>
            <span>{durationMin} min</span>
            <span className="text-text-muted">|</span>
            <span>{totalSets} sets</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-bold text-accent-orange">
            {totalVolume > 0
              ? `${totalVolume.toLocaleString()} lbs`
              : `${totalSets} sets`}
          </div>
          {expanded ? (
            <ChevronUp size={16} className="text-text-muted ml-auto mt-0.5" />
          ) : (
            <ChevronDown size={16} className="text-text-muted ml-auto mt-0.5" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          {Object.entries(session.sets).map(([exerciseId, sets]) => {
            const exercise = day?.exercises.find((e) => e.id === exerciseId);
            const completedSets = sets.filter((s) => s.completed);
            if (completedSets.length === 0) return null;

            return (
              <div key={exerciseId}>
                <p className="text-xs font-semibold text-text-secondary mb-1">
                  {exercise?.name || exerciseId}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {completedSets.map((set, i) => (
                    <span
                      key={i}
                      className="text-xs bg-surface-raised border border-border-light rounded-md px-2 py-1 tabular-nums"
                    >
                      {set.weight > 0 ? `${set.weight}x${set.reps}` : `${set.reps} reps`}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}

          {session.notes && (
            <p className="text-xs text-text-secondary italic">{session.notes}</p>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              const exercises = day?.exercises || [];
              const cardData = buildWorkoutCardData(session, exercises, {}, {});
              const canvas = renderWorkoutCard(cardData);
              shareOrDownload(canvas, `workout-${session.date}.png`);
            }}
            className="w-full mt-2 py-2 rounded-lg bg-surface-raised border border-border-light text-xs font-medium text-text-secondary flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
          >
            <Share2 size={12} />
            Share Workout
          </button>
        </div>
      )}
    </div>
  );
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-raised border border-border-light rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-text-secondary">{label}</p>
      <p className="font-bold text-accent-orange">{payload[0].value} sets</p>
    </div>
  );
};

const StrengthTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-raised border border-border-light rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-text-secondary">{label}</p>
      <p className="font-bold text-accent-blue">{payload[0].value.toLocaleString()} lbs</p>
    </div>
  );
};

export function WorkoutHistory({ sessions, programs }: Props) {
  const [activeTab, setActiveTab] = useState<'history' | 'volume' | 'strength'>(
    'history'
  );

  // Weekly volume data (total sets per week)
  const weeklyVolume = useMemo(() => {
    const weeks: Record<string, number> = {};
    for (const session of sessions) {
      const date = new Date(session.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const key = weekStart.toISOString().split('T')[0];
      const sets = Object.values(session.sets).reduce(
        (sum, s) => sum + s.filter((x) => x.completed).length,
        0
      );
      weeks[key] = (weeks[key] || 0) + sets;
    }

    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([week, sets]) => ({
        week: new Date(week).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        sets,
      }));
  }, [sessions]);

  // Strength trend (total volume per session over time)
  const strengthTrend = useMemo(() => {
    return sessions
      .slice()
      .reverse()
      .slice(-20)
      .map((session) => {
        const volume = Object.values(session.sets).reduce(
          (sum, sets) =>
            sum +
            sets
              .filter((s) => s.completed)
              .reduce((acc, s) => acc + s.weight * s.reps, 0),
          0
        );
        return {
          date: new Date(session.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
          volume,
        };
      });
  }, [sessions]);

  const programMap = useMemo(() => {
    const map: Record<string, Program> = {};
    for (const p of programs) map[p.id] = p;
    return map;
  }, [programs]);

  if (sessions.length === 0) {
    return (
      <div className="text-center py-10">
        <Calendar size={36} className="mx-auto mb-3 text-text-muted" />
        <p className="text-text-secondary text-sm">
          No workout history yet. Start your first workout!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <div className="flex gap-1 bg-surface rounded-xl p-1 border border-border">
        {([
          { key: 'history', label: 'History', icon: Calendar },
          { key: 'volume', label: 'Volume', icon: BarChart3 },
          { key: 'strength', label: 'Strength', icon: TrendingUp },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === key
                ? 'bg-surface-raised text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* History list */}
      {activeTab === 'history' && (
        <div className="space-y-2">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              program={programMap[session.programId]}
            />
          ))}
        </div>
      )}

      {/* Volume chart */}
      {activeTab === 'volume' && (
        <div className="card">
          <h4 className="label mb-4">Weekly Sets</h4>
          {weeklyVolume.length > 0 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyVolume}>
                  <XAxis
                    dataKey="week"
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: 'rgba(232, 87, 42, 0.1)' }}
                  />
                  <Bar
                    dataKey="sets"
                    fill="#e8572a"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-text-secondary text-sm text-center py-8">
              Not enough data yet
            </p>
          )}
        </div>
      )}

      {/* Strength trend chart */}
      {activeTab === 'strength' && (
        <div className="card">
          <h4 className="label mb-4">Session Volume (lbs)</h4>
          {strengthTrend.length > 1 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={strengthTrend}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={45}
                  />
                  <Tooltip content={<StrengthTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="volume"
                    stroke="#5b6ef5"
                    strokeWidth={2}
                    dot={{ fill: '#5b6ef5', r: 3 }}
                    activeDot={{ fill: '#5b6ef5', r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-text-secondary text-sm text-center py-8">
              Complete more workouts to see trends
            </p>
          )}
        </div>
      )}
    </div>
  );
}
