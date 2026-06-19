import { Dumbbell } from 'lucide-react';
import type { Program } from '../../types';

interface QuickStartProps {
  programs: Program[];
  onStart: (programId: string, dayId: string) => void;
}

export default function QuickStart({ programs, onStart }: QuickStartProps) {
  // Flatten all program days, filtering out rest days (days with no exercises)
  const workoutDays = programs.flatMap((program) =>
    program.days
      .filter((day) => day.exercises.length > 0)
      .map((day) => ({
        programId: program.id,
        programName: program.name,
        day,
      }))
  );

  if (workoutDays.length === 0) {
    return (
      <div className="text-center text-text-muted text-sm py-4">
        No programs available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="flex gap-2.5 overflow-x-auto pb-2 -mx-1 px-1"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {workoutDays.map(({ programId, programName, day }) => (
          <button
            key={`${programId}-${day.id}`}
            onClick={() => onStart(programId, day.id)}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all duration-150 active:scale-95"
            style={{
              borderColor: day.accent || 'var(--color-border)',
              backgroundColor: `${day.accent || 'var(--color-surface-raised)'}10`,
            }}
          >
            <Dumbbell
              size={14}
              style={{ color: day.accent || 'var(--color-text-muted)' }}
            />
            <div className="flex flex-col items-start">
              <span
                className="text-xs font-bold leading-tight"
                style={{ color: day.accent || 'var(--color-text-primary)' }}
              >
                {day.tag}
              </span>
              <span className="text-[10px] text-text-secondary leading-tight truncate max-w-[100px]">
                {programName}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
