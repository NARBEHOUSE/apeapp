import { useState, useEffect, useCallback } from 'react';
import { X, Dumbbell, Utensils, TrendingUp, Brain, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const TOUR_SEEN_KEY = 'fitos-tour-seen';

export function tourHasBeenSeen(): boolean {
  return !!localStorage.getItem(TOUR_SEEN_KEY);
}

export function markTourSeen(): void {
  localStorage.setItem(TOUR_SEEN_KEY, '1');
}

export function resetTour(): void {
  localStorage.removeItem(TOUR_SEEN_KEY);
}

interface Slide {
  Icon?: LucideIcon;
  isWelcome?: true;
  title: string;
  subtitle?: string;
  body: string;
  color: string;
}

const SLIDES: Slide[] = [
  {
    isWelcome: true,
    title: 'Welcome to APE',
    subtitle: 'Aesthetic Physique Enthusiast',
    body: 'Everything you need to train, eat, and track your body — in one place. No subscription. Your data lives on your device.',
    color: '#e8572a',
  },
  {
    Icon: Dumbbell,
    title: 'Training',
    body: 'Build programs with custom exercises, sets, and progressions. Track weight, reps, and RIR/RPE. Per-muscle volume shows you exactly what you\'re training.',
    color: '#e8572a',
  },
  {
    Icon: Utensils,
    title: 'Nutrition',
    body: 'Log meals by search, barcode scan, or AI. Snap a photo of your food or say it out loud — Claude parses the macros automatically.',
    color: '#f5a623',
  },
  {
    Icon: TrendingUp,
    title: 'Progress',
    body: 'Track weight, body measurements, and progress photos by pose. Compare side-by-side or watch a time-lapse of your transformation.',
    color: '#5b6ef5',
  },
  {
    Icon: Brain,
    title: 'AI Coach',
    body: 'The AI coach reads your week — training volume, nutrition, recovery — and gives personalized suggestions. Add your Claude API key in Settings to enable it.',
    color: '#2e9e6b',
  },
  {
    Icon: Users,
    title: 'Sync & Coaching',
    body: 'Sign in with Google to sync across devices. Share your data with a real coach via Google Drive — you own the folder, you control who sees it.',
    color: '#5b6ef5',
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function FeatureTour({ open, onClose }: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const dismiss = useCallback(() => {
    markTourSeen();
    onClose();
  }, [onClose]);

  if (!open) return null;

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-bg">
      {/* Top bar: dots + skip */}
      <div className="flex items-center justify-between px-5 pt-6 pb-2">
        <div className="flex gap-1.5 items-center">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === index ? 'w-6 bg-text-primary' : 'w-1.5 bg-border'
              }`}
            />
          ))}
        </div>
        <button
          onClick={dismiss}
          className="flex items-center gap-1 text-xs text-text-muted px-2 py-1 rounded-lg"
        >
          Skip <X size={12} />
        </button>
      </div>

      {/* Slide body */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        {slide.isWelcome ? (
          <div className="mb-8">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="APE"
              className="h-16 mx-auto invert brightness-200"
            />
          </div>
        ) : slide.Icon ? (
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center mb-8"
            style={{ backgroundColor: `${slide.color}18` }}
          >
            <slide.Icon size={36} style={{ color: slide.color }} />
          </div>
        ) : null}

        <h2 className="text-2xl font-bold mb-2">{slide.title}</h2>
        {slide.subtitle && (
          <p className="text-[11px] text-text-muted uppercase tracking-widest mb-4">
            {slide.subtitle}
          </p>
        )}
        <p className="text-text-secondary text-sm leading-relaxed max-w-xs">{slide.body}</p>
      </div>

      {/* Footer nav */}
      <div className="px-5 pb-10 space-y-3">
        <button
          onClick={isLast ? dismiss : () => setIndex(index + 1)}
          className="btn-primary w-full"
        >
          {isLast ? 'Get Started' : 'Next'}
        </button>
        {index > 0 && (
          <button
            onClick={() => setIndex(index - 1)}
            className="w-full text-xs text-text-muted py-2"
          >
            Back
          </button>
        )}
      </div>
    </div>
  );
}
