import { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';

const REST_TIMER_KEY = 'fitos-rest-timer';

function playCompletionSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const start = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.3, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.25);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  } catch {}
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendRestCompleteNotification() {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('Rest Complete', { body: 'Time for your next set!', icon: '/icons/icon-192.png', tag: 'rest-timer', requireInteraction: false });
    } catch {}
  }
}

interface Props {
  duration: number;
  onComplete: () => void;
  onDismiss: () => void;
}

export function RestTimer({ duration, onComplete, onDismiss }: Props) {
  const completedRef = useRef(false);

  // Persist start time so timer survives minimize/tab switch
  const [startTime] = useState(() => {
    const persisted = localStorage.getItem(REST_TIMER_KEY);
    if (persisted) {
      const data = JSON.parse(persisted);
      if (data.duration === duration) return data.startTime;
    }
    const now = Date.now();
    localStorage.setItem(REST_TIMER_KEY, JSON.stringify({ startTime: now, duration }));
    requestNotificationPermission();
    return now;
  });

  const [remaining, setRemaining] = useState(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    return Math.max(0, duration - elapsed);
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    localStorage.removeItem(REST_TIMER_KEY);
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const r = Math.max(0, duration - elapsed);
      setRemaining(r);
    }, 250);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [startTime, duration]);

  useEffect(() => {
    if (remaining <= 0 && !completedRef.current) {
      completedRef.current = true;
      cleanup();
      playCompletionSound();
      navigator.vibrate?.([50, 100, 50, 100, 50]);
      sendRestCompleteNotification();
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

  const smallRadius = 28;
  const smallCircumference = 2 * Math.PI * smallRadius;
  const smallDashoffset = smallCircumference * (1 - progress);

  return (
    <div className="fixed bottom-20 right-3 z-[150] select-none">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl p-3 flex flex-col items-center gap-2 w-[90px]">
        <p className="text-[9px] font-bold uppercase tracking-widest text-text-muted">Rest</p>

        <div className="relative w-16 h-16 flex items-center justify-center">
          <svg
            className="absolute inset-0 -rotate-90"
            width="64"
            height="64"
            viewBox="0 0 72 72"
          >
            <circle
              cx="36"
              cy="36"
              r={smallRadius}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="5"
            />
            <circle
              cx="36"
              cy="36"
              r={smallRadius}
              fill="none"
              stroke="#e8572a"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={smallCircumference}
              strokeDashoffset={smallDashoffset}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>
          <span className="text-base font-black text-text-primary tabular-nums">
            {timeDisplay}
          </span>
        </div>

        <button
          onClick={() => { cleanup(); onDismiss(); }}
          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-surface-raised border border-border-light text-text-muted text-[10px] font-semibold active:scale-95 transition-transform"
        >
          <X size={10} />
          Skip
        </button>
      </div>
    </div>
  );
}
