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

  // Drag state
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const hasMoved = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    hasMoved.current = false;
    dragStart.current = { px: e.clientX, py: e.clientY, ox: dragOffset.x, oy: dragOffset.y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.px;
    const dy = e.clientY - dragStart.current.py;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasMoved.current = true;
    setDragOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
  };

  const onPointerUp = () => { dragStart.current = null; };

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const progress = remaining / duration;
  const strokeDashoffset = circumference * (1 - progress);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div
      className="fixed bottom-28 right-3 z-[150] select-none"
      style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
    >
      <div
        className="bg-surface border border-border rounded-2xl shadow-2xl p-4 flex flex-col items-center gap-3 w-[136px] cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <p className="text-[12px] font-bold uppercase tracking-widest text-text-muted">Rest</p>

        <div className="relative w-24 h-24 flex items-center justify-center">
          <svg
            className="absolute inset-0 -rotate-90"
            width="96"
            height="96"
            viewBox="0 0 96 96"
          >
            <circle cx="48" cy="48" r={radius} fill="none" stroke="var(--color-border)" strokeWidth="7" />
            <circle
              cx="48"
              cy="48"
              r={radius}
              fill="none"
              stroke="#e8572a"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>
          <span className="text-2xl font-black text-text-primary tabular-nums">
            {timeDisplay}
          </span>
        </div>

        <button
          onClick={() => { cleanup(); onDismiss(); }}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-raised border border-border-light text-text-muted text-xs font-semibold active:scale-95 transition-transform"
        >
          <X size={11} />
          Skip
        </button>
      </div>
    </div>
  );
}
