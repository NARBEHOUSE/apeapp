import { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';

interface Props {
  duration: number;
  onComplete: () => void;
  onDismiss: () => void;
}

export function RestTimer({ duration, onComplete, onDismiss }: Props) {
  const [remaining, setRemaining] = useState(duration);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return cleanup;
  }, [cleanup]);

  useEffect(() => {
    if (remaining <= 0 && !completedRef.current) {
      completedRef.current = true;
      cleanup();
      navigator.vibrate?.([50, 100, 50, 100, 50]);
      onComplete();
    }
  }, [remaining, cleanup, onComplete]);

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = remaining / duration;
  const strokeDashoffset = circumference * (1 - progress);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6">
        <p className="text-text-secondary text-sm font-semibold uppercase tracking-wider">
          Rest Timer
        </p>

        <div className="relative w-40 h-40 flex items-center justify-center">
          <svg
            className="absolute inset-0 -rotate-90"
            width="160"
            height="160"
            viewBox="0 0 120 120"
          >
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="6"
            />
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="#e8572a"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>
          <span className="text-4xl font-black text-text-primary tabular-nums">
            {timeDisplay}
          </span>
        </div>

        <button
          onClick={onDismiss}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-surface-raised border border-border-light text-text-secondary font-semibold active:scale-95 transition-transform"
        >
          <X size={18} />
          Skip
        </button>
      </div>
    </div>
  );
}
