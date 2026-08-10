import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { Measurement, Profile, ProgressPhoto } from '../../types';
import { POSE_LABELS } from '../../utils/photoAnalysis';
import { getApiKey } from '../../utils/apiKeyManager';
import { getDashboardConfig } from '../../utils/dashboardConfig';
import { formatDate } from '../../utils/dateHelpers';
import { usePhotoAnalysis } from '../../hooks/usePhotoAnalysis';
import { PhotoAnalysisConsentModal, PhotoAnalysisResultView, PhotoHistoryOptIn } from './PhotoAnalysisResult';

interface Props {
  profile: Profile;
  photos: ProgressPhoto[];
  measurements: Measurement[];
}

export function PhotoAnalysisCard({ profile, photos, measurements }: Props) {
  const enabled = getDashboardConfig().aiPhotoAnalysis;
  const apiKey = getApiKey();

  const [expanded, setExpanded] = useState(false);
  const onAnalyzed = useCallback(() => setExpanded(true), []);
  const {
    result,
    loading,
    consentOpen,
    includePhotoHistory,
    setIncludePhotoHistory,
    request,
    acceptConsent,
    declineConsent,
  } = usePhotoAnalysis(profile, photos, measurements, onAnalyzed);

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
    result != null && (result.baselinePhotoId !== baseline?.id || result.latestPhotoId !== latest?.id);

  if (!enabled) return null;

  function analyze() {
    if (!baseline || !latest || samePhoto) return;
    request(baseline, latest);
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
              <>
                <PhotoHistoryOptIn checked={includePhotoHistory} onChange={setIncludePhotoHistory} />
                <button
                  onClick={analyze}
                  disabled={loading}
                  className="w-full py-2 rounded-lg bg-accent-blue text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-[0.98] transition-transform"
                >
                  {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {loading ? 'Analyzing…' : result ? 'Analyze Again' : 'Analyze Progress'}
                </button>
              </>
            )}

            {!samePhoto && (
              <div className="text-[0.625rem] text-text-muted">
                Reviews only the two photos above. Runs when you tap — about $0.03 of API usage per review. The
                last review is kept on this device, so reopening it is free.
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
        {result && !expanded && <p className="text-[0.6875rem] text-text-muted">{result.headline}</p>}

        {result && expanded && (
          <div className="pt-1 space-y-3">
            <PhotoAnalysisResultView result={result} />
            <div className="flex items-center justify-between">
              <span className="text-[0.625rem] text-text-muted">
                Reviewed{' '}
                {new Date(result.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ·
                informational, not medical advice
              </span>
              <button
                onClick={analyze}
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

      {consentOpen && <PhotoAnalysisConsentModal onAccept={acceptConsent} onCancel={declineConsent} />}
    </>
  );
}
