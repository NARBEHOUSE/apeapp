import { AlertTriangle } from 'lucide-react';
import { POSE_LABELS, type PhotoAnalysisResult } from '../../utils/photoAnalysis';
import { formatDate } from '../../utils/dateHelpers';

/** Shared rendering for an AI photo review, used by the Photos-tab card and the compare screen. */
export function PhotoAnalysisResultView({
  result,
  showHeader = true,
}: {
  result: PhotoAnalysisResult;
  showHeader?: boolean;
}) {
  return (
    <div className="space-y-3">
      {showHeader && (
        <div className="text-[0.625rem] text-text-muted">
          {POSE_LABELS[result.pose] ?? result.pose} · {formatDate(result.baselineDate)} →{' '}
          {formatDate(result.latestDate)}
        </div>
      )}

      <p className="text-xs text-text-secondary">{result.headline}</p>

      {result.visualChanges.length > 0 && (
        <Section title="What changed" tone="text-accent-blue">
          <ul className="space-y-1">
            {result.visualChanges.map((c, i) => (
              <li key={i} className="text-[0.6875rem] text-text-secondary leading-relaxed">
                • {c}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {result.goalAlignment && (
        <Section title="Against your goal" tone="text-accent-orange">
          <p className="text-[0.6875rem] text-text-secondary leading-relaxed">{result.goalAlignment}</p>
        </Section>
      )}

      {result.photoHabit && (
        <Section title="Photo consistency" tone="text-text-muted">
          <p className="text-[0.6875rem] text-text-secondary leading-relaxed">{result.photoHabit}</p>
        </Section>
      )}

      {result.suggestions.length > 0 && (
        <Section title="Suggestions" tone="text-success">
          <ul className="space-y-1">
            {result.suggestions.map((s, i) => (
              <li key={i} className="text-[0.6875rem] text-text-secondary leading-relaxed">
                • {s}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {result.caveats && (
        <p className="text-[0.625rem] text-text-muted italic leading-relaxed">{result.caveats}</p>
      )}
    </div>
  );
}

/**
 * Opt-in for cadence context. Phrased to make the boundary explicit: the two selected photos
 * are the only images that ever leave the device, and this adds dates, not pictures.
 */
export function PhotoHistoryOptIn({
  checked,
  onChange,
  dark = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  dark?: boolean;
}) {
  return (
    <label className={`flex items-start gap-2 cursor-pointer ${dark ? 'text-white/50' : 'text-text-muted'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 shrink-0"
        style={{ accentColor: '#5b6ef5' }}
      />
      <span className="text-[0.625rem] leading-relaxed">
        Also send when my other photos were taken, so it can comment on consistency.{' '}
        <span className={dark ? 'text-white/35' : 'text-text-muted/70'}>
          Dates only — no other photo is ever uploaded.
        </span>
      </span>
    </label>
  );
}

function Section({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-raised p-3 space-y-1.5">
      <div className={`text-[0.5625rem] font-semibold uppercase tracking-wider ${tone}`}>{title}</div>
      {children}
    </div>
  );
}

/** One-time consent: the selected progress photos leave the device on this call. */
export function PhotoAnalysisConsentModal({
  onAccept,
  onCancel,
}: {
  onAccept: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-bg rounded-2xl mx-6 max-w-sm w-full p-5 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-warning" />
          <h3 className="font-bold text-base">Send photos for review?</h3>
        </div>
        <div className="text-sm text-text-secondary space-y-3">
          <p>
            To review your progress, APE sends <strong>the two progress photos you selected</strong> — plus your
            goal, weight change, measurement changes, and photo dates — directly from this device to the AI
            provider your API key belongs to.
          </p>
          <ul className="list-disc pl-4 space-y-1 text-xs">
            <li>Nothing is sent until you tap Analyze, and those two photos are the only images sent</li>
            <li>Your other progress photos are never uploaded</li>
            <li>NARBE LLC never receives your photos — the request goes to your provider</li>
            <li>Your provider's terms and data-retention policy apply to those images</li>
            <li>Feedback is AI-generated, informational only, and not medical or professional advice</li>
            <li>Photo lighting, angle, and timing can change how a physique looks — treat any read as rough</li>
          </ul>
          <p className="text-xs text-text-muted">Each review costs roughly $0.03 in API usage.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-surface border border-border-light text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-2.5 rounded-xl bg-accent-blue text-white text-sm font-semibold"
          >
            Send &amp; Analyze
          </button>
        </div>
      </div>
    </div>
  );
}
