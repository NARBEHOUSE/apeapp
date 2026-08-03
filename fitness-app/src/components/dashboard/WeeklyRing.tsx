import { useEffect, useState } from 'react';

interface WeeklyRingProps {
  completed: number;
  skipped?: number;
  target: number;
}

export default function WeeklyRing({ completed, skipped = 0, target }: WeeklyRingProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);

  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const completedFrac = target > 0 ? Math.min(completed / target, 1) : 0;
  const skippedFrac = target > 0 ? Math.min(skipped / target, 1 - completedFrac) : 0;

  useEffect(() => {
    // Animate from 0 to target progress on mount
    const timeout = setTimeout(() => {
      setAnimatedProgress(1);
    }, 100);
    return () => clearTimeout(timeout);
  }, [completedFrac, skippedFrac]);

  const completedLen = circumference * completedFrac * animatedProgress;
  const skippedLen = circumference * skippedFrac * animatedProgress;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform -rotate-90"
        >
          {/* Background ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Skipped segment — sits right after the completed arc */}
          {skippedLen > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="var(--color-text-muted)"
              strokeWidth={strokeWidth}
              strokeDasharray={`${skippedLen} ${circumference - skippedLen}`}
              strokeDashoffset={-completedLen}
              style={{
                transition: 'stroke-dasharray 1s cubic-bezier(0.4, 0, 0.2, 1), stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
          )}
          {/* Completed segment */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e8572a"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${completedLen} ${circumference - completedLen}`}
            style={{
              transition: 'stroke-dasharray 1s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-text-primary">
            {completed}
            <span className="text-text-muted">/{target}</span>
          </span>
          <span className="text-[0.625rem] uppercase tracking-wider text-text-secondary mt-0.5">
            workouts
          </span>
          {skipped > 0 && (
            <span className="text-[0.625rem] text-text-muted mt-0.5">{skipped} skipped</span>
          )}
        </div>
      </div>
    </div>
  );
}
