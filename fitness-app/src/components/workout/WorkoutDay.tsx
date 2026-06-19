import { Coffee } from 'lucide-react';
import type { WorkoutDay as WorkoutDayType } from '../../types';

interface Props {
  day: WorkoutDayType;
}

export function WorkoutDay({ day }: Props) {
  const isRest = day.tag.toLowerCase() === 'rest';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span
          className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider text-white flex-shrink-0"
          style={{ backgroundColor: day.accent || '#e8572a' }}
        >
          {day.tag}
        </span>
        <div className="min-w-0">
          <h3 className="font-bold text-lg leading-tight">{day.title}</h3>
          {day.subtitle && (
            <p className="text-sm text-text-secondary mt-0.5">{day.subtitle}</p>
          )}
        </div>
      </div>

      {/* Note */}
      {day.note && (
        <p className="text-sm text-text-secondary italic px-1">{day.note}</p>
      )}

      {/* Exercises */}
      {!isRest && day.exercises.length > 0 && (
        <div className="space-y-2">
          {day.exercises.map((exercise, index) => (
            <div
              key={exercise.id}
              className="card-raised flex items-center gap-3"
            >
              <span className="w-6 h-6 rounded-full bg-surface flex items-center justify-center text-xs font-bold text-text-muted flex-shrink-0">
                {index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">
                    {exercise.name}
                  </span>
                  {exercise.flag && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-bold uppercase">
                      {exercise.flag}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-text-secondary">
                    {exercise.sets} x {exercise.reps}
                  </span>
                  {exercise.muscle && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-accent-blue/10 text-accent-blue font-medium">
                      {exercise.muscle}
                    </span>
                  )}
                </div>
                {exercise.note && (
                  <p className="text-[11px] text-text-muted mt-0.5 truncate">
                    {exercise.note}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rest day content */}
      {isRest && (
        <div className="flex flex-col items-center py-8 text-center">
          <Coffee size={40} className="text-text-muted mb-3" />
          <p className="text-text-secondary">Rest day - recover and grow!</p>
        </div>
      )}

    </div>
  );
}
