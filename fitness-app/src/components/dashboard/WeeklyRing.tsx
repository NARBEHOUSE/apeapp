import { useEffect, useState } from 'react';

interface WeeklyRingProps {
  completed: number;
  target: number;
}

export default function WeeklyRing({ completed, target }: WeeklyRingProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);

  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = target > 0 ? Math.min(completed / target, 1) : 0;

  useEffect(() => {
    // Animate from 0 to target progress on mount
    const timeout = setTimeout(() => {
      setAnimatedProgress(progress);
    }, 100);
    return () => clearTimeout(timeout);
  }, [progress]);

  const strokeDashoffset = circumference * (1 - animatedProgress);

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
          {/* Progress ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#e8572a"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{
              transition: 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-text-primary">
            {completed}
            <span className="text-text-muted">/{target}</span>
          </span>
          <span className="text-[10px] uppercase tracking-wider text-text-secondary mt-0.5">
            workouts
          </span>
        </div>
      </div>
    </div>
  );
}
