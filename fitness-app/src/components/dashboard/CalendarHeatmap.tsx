import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Dumbbell, Utensils, ClipboardCheck, X } from 'lucide-react';
import type { WorkoutSession, FoodEntry, CheckInEntry } from '../../types';
import { formatDate, formatDuration } from '../../utils/dateHelpers';

interface Props {
  sessions: WorkoutSession[];
  foodEntries: FoodEntry[];
  checkIns: CheckInEntry[];
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function CalendarHeatmap({ sessions, foodEntries, checkIns }: Props) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const workoutDates = useMemo(() => new Set(sessions.filter((s) => s.status !== 'skipped').map((s) => s.date)), [sessions]);
  const skippedOnlyDates = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      if (s.status === 'skipped' && !workoutDates.has(s.date)) set.add(s.date);
    });
    return set;
  }, [sessions, workoutDates]);
  const nutritionDates = useMemo(() => new Set(foodEntries.map((f) => f.date)), [foodEntries]);
  const checkInDates = useMemo(() => new Set(checkIns.map((c) => c.date)), [checkIns]);

  const days = useMemo(() => {
    const firstDay = new Date(month.year, month.month, 1);
    const startPad = firstDay.getDay();
    const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();

    const cells: { date: string; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < startPad; i++) cells.push({ date: '', day: 0, inMonth: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${month.year}-${String(month.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ date, day: d, inMonth: true });
    }
    return cells;
  }, [month]);

  const prevMonth = () => {
    setMonth((m) => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 });
    setSelectedDate(null);
  };
  const nextMonth = () => {
    setMonth((m) => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 });
    setSelectedDate(null);
  };

  const monthLabel = new Date(month.year, month.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const todayStr = new Date().toISOString().split('T')[0];

  const selectedSessions = useMemo(
    () => (selectedDate ? sessions.filter((s) => s.date === selectedDate) : []),
    [selectedDate, sessions]
  );
  const selectedFood = useMemo(
    () => (selectedDate ? foodEntries.filter((f) => f.date === selectedDate) : []),
    [selectedDate, foodEntries]
  );
  const selectedCalories = useMemo(
    () => selectedFood.reduce((sum, f) => sum + f.calories * f.servingsConsumed, 0),
    [selectedFood]
  );
  const selectedCheckIn = useMemo(
    () => (selectedDate ? checkIns.find((c) => c.date === selectedDate) : undefined),
    [selectedDate, checkIns]
  );

  return (
    <div className="card">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1"><ChevronLeft size={16} className="text-text-muted" /></button>
        <h2 className="text-sm font-semibold">{monthLabel}</h2>
        <button onClick={nextMonth} className="p-1"><ChevronRight size={16} className="text-text-muted" /></button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DAY_LABELS.map((d, i) => (
          <div key={i} className="text-[0.5625rem] text-text-muted text-center font-semibold">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((cell, i) => {
          if (!cell.inMonth) return <div key={i} />;
          const hasWorkout = workoutDates.has(cell.date);
          const hasSkippedOnly = skippedOnlyDates.has(cell.date);
          const hasNutrition = nutritionDates.has(cell.date);
          const hasCheckIn = checkInDates.has(cell.date);
          const isToday = cell.date === todayStr;
          const isSelected = cell.date === selectedDate;
          const hasAny = hasWorkout || hasSkippedOnly || hasNutrition || hasCheckIn;

          return (
            <button
              type="button"
              key={i}
              onClick={() => setSelectedDate((d) => (d === cell.date ? null : cell.date))}
              className={`aspect-square rounded-md flex flex-col items-center justify-center gap-0.5 text-[0.625rem] transition-colors ${
                isSelected ? 'ring-1 ring-accent-blue' : isToday ? 'ring-1 ring-accent-orange' : ''
              } ${hasAny ? 'bg-surface-raised' : ''}`}
            >
              <span className={`font-medium ${
                hasWorkout ? 'text-accent-orange' : isToday ? 'text-accent-orange' : hasAny ? 'text-text-primary' : 'text-text-muted'
              }`}>
                {cell.day}
              </span>
              {hasAny && (
                <div className="flex gap-0.5">
                  {hasWorkout && <div className="w-1 h-1 rounded-full bg-accent-orange" />}
                  {hasSkippedOnly && <div className="w-1 h-1 rounded-full border border-text-muted" />}
                  {hasNutrition && <div className="w-1 h-1 rounded-full bg-[#f5a623]" />}
                  {hasCheckIn && <div className="w-1 h-1 rounded-full bg-green-500" />}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 mt-3 text-[0.5625rem] text-text-muted flex-wrap">
        <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-accent-orange" /> Workout</div>
        <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full border border-text-muted" /> Skipped</div>
        <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-[#f5a623]" /> Nutrition</div>
        <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-green-500" /> Check-in</div>
      </div>

      {/* Day detail */}
      {selectedDate && (
        <div className="mt-3 pt-3 border-t border-border space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{formatDate(selectedDate)}</h3>
            <button onClick={() => setSelectedDate(null)} className="p-0.5 text-text-muted">
              <X size={14} />
            </button>
          </div>

          {selectedSessions.length === 0 && selectedFood.length === 0 && !selectedCheckIn && (
            <p className="text-[0.6875rem] text-text-muted">No activity logged this day.</p>
          )}

          {selectedSessions.map((s) => {
            const setCount = Object.values(s.sets).reduce(
              (sum, sets) => sum + sets.filter((set) => set.completed).length,
              0
            );
            const duration = s.endTime ? formatDuration(s.endTime - s.startTime) : null;
            return (
              <div key={s.id} className="flex items-center gap-2">
                <Dumbbell size={13} className={s.status === 'skipped' ? 'text-text-muted' : 'text-accent-orange'} />
                <span className="text-[0.6875rem]">
                  <span className="font-medium">{s.label || s.name || 'Workout'}</span>{' '}
                  {s.status === 'skipped' ? (
                    <span className="text-text-muted">— skipped</span>
                  ) : (
                    <span className="text-text-muted">— {setCount} set{setCount === 1 ? '' : 's'}{duration ? `, ${duration}` : ''}</span>
                  )}
                </span>
              </div>
            );
          })}

          {selectedFood.length > 0 && (
            <div className="flex items-center gap-2">
              <Utensils size={13} className="text-[#f5a623]" />
              <span className="text-[0.6875rem]">
                <span className="font-medium">{Math.round(selectedCalories)} cal</span>{' '}
                <span className="text-text-muted">— {selectedFood.length} item{selectedFood.length === 1 ? '' : 's'} logged</span>
              </span>
            </div>
          )}

          {selectedCheckIn && (
            <div className="flex items-center gap-2">
              <ClipboardCheck size={13} className="text-green-500" />
              <span className="text-[0.6875rem] text-text-muted">Check-in completed</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
