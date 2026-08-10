import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { Measurement, Profile, ProgressPhoto } from '../../types';
import {
  POSE_LABELS,
  analyzePhotoProgress,
  buildPhotoProgressSnapshot,
  cachePhotoAnalysis,
  getCachedPhotoAnalysis,
  type PhotoAnalysisResult,
} from '../../utils/photoAnalysis';
import { getApiKey } from '../../utils/apiKeyManager';
import { getDashboardConfig } from '../../utils/dashboardConfig';
import { formatDate } from '../../utils/dateHelpers';
import { toast } from '../shared/Toast';

interface Props {
  profile: Profile;
  photos: ProgressPhoto[];
  measurements: Measurement[];
}

// Separate from the AI Coach disclaimer: this one is about progress photos leaving the
// device, which is a materially different thing to agree to.
const CONSENT_KEY = 'fitos-photo-analysis-consent';

export function PhotoAnalysisCard({ profile, photos, measurements }: Props) {
  const enabled = getDashboardConfig().aiPhotoAnalysis;
  const apiKey = getApiKey();

  const [result, setResult] = useState<PhotoAnalysisResult | null>(() => getCachedPhotoAnalysis(profile.id));
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showConsent, setShowConsent] = useState(false);

  // Poses with at least two photos are the only ones that can be compared.
  const posesByDate = useMemo(() => {
    const byPose = new Map<string, ProgressPhoto[]>();
    for (const p of photos) {
      const list = byPose.get(p.pose) ?? [];
      list.push(p);
      byPose.set(p.pose, list);
    }
    for (const list of byPose.values()) list.sort((a, b) => a.date.localeCompare(b.date));
    return byPose;
  }, [photos]);

  const comparablePoses = useMemo(
    () => [...posesByDate.entries()].filter(([, list]) => list.length >= 2).map(([pose]) => pose),
    [posesByDate],
  );

  const [pose, setPose] = useState<string | null>(null);
  const activePose = pose && comparablePoses.includes(pose) ? pose : comparablePoses[0] ?? null;
  const posePhotos = activePose ? posesByDate.get(activePose) ?? [] : [];

  const [baselineId, setBaselineId] = useState<string | null>(null);
  const [latestId, setLatestId] = useState<string | null>(null);
  const baseline = posePhotos.find((p) => p.id === baselineId) ?? posePhotos[0] ?? null;
  const latest = posePhotos.find((p) => p.id === latestId) ?? posePhotos[posePhotos.length - 1] ?? null;

  const samePhoto = baseline != null && latest != null && baseline.id === latest.id;
  const stale =
    result != null &&
    (result.baselinePhotoId !== baseline?.id || result.latestPhotoId !== latest?.id);

  if (!enabled) return null;

  async function runAnalysis() {
    if (!baseline || !latest || samePhoto) return;
    if (!apiKey) {
      toast('Add your AI API key in Settings first', 'error');
      return;
    }
    if (localStorage.getItem(CONSENT_KEY) !== 'true') {
      setShowConsent(true);
      return;
    }

    setLoading(true);
    try {
      // Order the pair oldest-first so "baseline" and "latest" mean what the prompt says.
      const [from, to] =
        baseline.date <= latest.date ? [baseline, latest] : [latest, baseline];
      const snapshot = buildPhotoProgressSnapshot(profile, from, to, photos, measurements);
      const analysis = await analyzePhotoProgress(from, to, snapshot);
      setResult(analysis);
      cachePhotoAnalysis(profile.id, analysis);
      setExpanded(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Analysis failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  function acceptConsent() {
    localStorage.setItem(CONSENT_KEY, 'true');
    setShowConsent(false);
    runAnalysis();
  }

  return (
    <>
      <div className="card p-3 space-y-3">
        <button
          onClick={() => (result ? setExpanded(!expanded) : undefined)}
          className="w-full flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-accent-blue" />
            <div className="text-left">
              <div className="text-xs font-semibold text-text-secondary">AI Progress Review</div>
              <div className="text-[0.625rem] text-text-muted">
                Compares two photos against your goal and tracked numbers
              </div>
            </div>
          </div>
          {loading ? (
            <Loader2 size={16} className="text-text-muted animate-spin shrink-0" />
          ) : result ? (
            expanded ? (
              <ChevronUp size={16} className="text-text-muted shrink-0" />
            ) : (
              <ChevronDown size={16} className="text-text-muted shrink-0" />
            )
          ) : null}
        </button>

        {!apiKey ? (
          <div className="text-[0.625rem] text-text-muted">
            Add an AI API key in Settings to use this. Your photos are only sent when you tap Analyze.
          </div>
        ) : comparablePoses.length === 0 ? (
          <div className="text-[0.625rem] text-text-muted">
            Take at least two photos in the same pose to compare progress.
          </div>
        ) : (
          <div className="space-y-2">
            {/* Pose picker — only poses with two or more photos */}
            {comparablePoses.length > 1 && (
              <div className="flex gap-1.5">
                {comparablePoses.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setPose(p);
                      setBaselineId(null);
                      setLatestId(null);
                    }}
                    className={`flex-1 py-1.5 rounded-lg text-[0.625rem] font-semibold transition-colors ${
                      activePose === p
                        ? 'bg-accent-blue text-white'
                        : 'bg-surface-raised text-text-muted border border-border-light'
                    }`}
                  >
                    {POSE_LABELS[p] ?? p}
                  </button>
                ))}
              </div>
            )}

            {/* Which two photos */}
            <div className="flex items-center gap-2">
              <label className="flex-1 min-w-0">
                <span className="text-[0.5625rem] text-text-muted uppercase tracking-wider">From</span>
                <select
                  className="input-field text-xs py-1.5 px-2 w-full"
                  value={baseline?.id ?? ''}
                  onChange={(e) => setBaselineId(e.target.value)}
                >
                  {posePhotos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatDate(p.date)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex-1 min-w-0">
                <span className="text-[0.5625rem] text-text-muted uppercase tracking-wider">To</span>
                <select
                  className="input-field text-xs py-1.5 px-2 w-full"
                  value={latest?.id ?? ''}
                  onChange={(e) => setLatestId(e.target.value)}
                >
                  {posePhotos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatDate(p.date)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {samePhoto ? (
              <div className="text-[0.625rem] text-warning">Pick two different dates to compare.</div>
            ) : (
              <button
                onClick={runAnalysis}
                disabled={loading}
                className="w-full py-2 rounded-lg bg-accent-blue text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-[0.98] transition-transform"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {loading ? 'Analyzing…' : result ? 'Analyze Again' : 'Analyze Progress'}
              </button>
            )}

            {!samePhoto && (
              <div className="text-[0.625rem] text-text-muted">
                Runs only when you tap — about $0.03 of API usage per review. The last review is kept on this
                device, so reopening it is free.
              </div>
            )}

            {result && stale && !loading && (
              <div className="text-[0.625rem] text-text-muted">
                The review below is for {formatDate(result.baselineDate)} → {formatDate(result.latestDate)}.
              </div>
            )}
          </div>
        )}

        {/* Result */}
        {result && !expanded && (
          <p className="text-[0.6875rem] text-text-muted">{result.headline}</p>
        )}

        {result && expanded && (
          <div className="space-y-3 pt-1">
            <div className="text-[0.625rem] text-text-muted">
              {POSE_LABELS[result.pose] ?? result.pose} · {formatDate(result.baselineDate)} →{' '}
              {formatDate(result.latestDate)}
            </div>

            <p className="text-xs text-text-secondary">{result.headline}</p>

            {result.visualChanges.length > 0 && (
              <div className="rounded-xl bg-surface-raised p-3 space-y-1.5">
                <div className="text-[0.5625rem] font-semibold uppercase tracking-wider text-accent-blue">
                  What changed
                </div>
                <ul className="space-y-1">
                  {result.visualChanges.map((c, i) => (
                    <li key={i} className="text-[0.6875rem] text-text-secondary leading-relaxed">
                      • {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.goalAlignment && (
              <div className="rounded-xl bg-surface-raised p-3 space-y-1.5">
                <div className="text-[0.5625rem] font-semibold uppercase tracking-wider text-accent-orange">
                  Against your goal
                </div>
                <p className="text-[0.6875rem] text-text-secondary leading-relaxed">{result.goalAlignment}</p>
              </div>
            )}

            {result.photoHabit && (
              <div className="rounded-xl bg-surface-raised p-3 space-y-1.5">
                <div className="text-[0.5625rem] font-semibold uppercase tracking-wider text-text-muted">
                  Photo consistency
                </div>
                <p className="text-[0.6875rem] text-text-secondary leading-relaxed">{result.photoHabit}</p>
              </div>
            )}

            {result.suggestions.length > 0 && (
              <div className="rounded-xl bg-surface-raised p-3 space-y-1.5">
                <div className="text-[0.5625rem] font-semibold uppercase tracking-wider text-success">
                  Suggestions
                </div>
                <ul className="space-y-1">
                  {result.suggestions.map((s, i) => (
                    <li key={i} className="text-[0.6875rem] text-text-secondary leading-relaxed">
                      • {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.caveats && (
              <p className="text-[0.625rem] text-text-muted italic leading-relaxed">{result.caveats}</p>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-[0.625rem] text-text-muted">
                Reviewed{' '}
                {new Date(result.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ·
                informational, not medical advice
              </span>
              <button
                onClick={runAnalysis}
                disabled={loading || samePhoto}
                className="text-[0.625rem] text-accent-blue font-semibold flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw size={10} />
                Re-analyze
              </button>
            </div>
          </div>
        )}
      </div>

      {/* One-time consent — progress photos leave the device on this call */}
      {showConsent && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-bg rounded-2xl mx-6 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-warning" />
              <h3 className="font-bold text-base">Send photos for review?</h3>
            </div>
            <div className="text-sm text-text-secondary space-y-3">
              <p>
                To review your progress, APE sends <strong>the two progress photos you selected</strong> — plus
                your goal, weight change, measurement changes, and photo dates — directly from this device to the
                AI provider your API key belongs to.
              </p>
              <ul className="list-disc pl-4 space-y-1 text-xs">
                <li>Nothing is sent until you tap Analyze, and only the pair you picked is sent</li>
                <li>NARBE LLC never receives your photos — the request goes to your provider</li>
                <li>Your provider's terms and data-retention policy apply to those images</li>
                <li>Feedback is AI-generated, informational only, and not medical or professional advice</li>
                <li>Photo lighting, angle, and timing can change how a physique looks — treat any read as rough</li>
              </ul>
              <p className="text-xs text-text-muted">Each review costs roughly $0.03 in API usage.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConsent(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface border border-border-light text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={acceptConsent}
                className="flex-1 py-2.5 rounded-xl bg-accent-blue text-white text-sm font-semibold"
              >
                Send &amp; Analyze
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
