import { Loader2, Sparkles } from 'lucide-react';
import type { Measurement, Profile, ProgressPhoto } from '../../types';
import { getApiKey } from '../../utils/apiKeyManager';
import { formatShortDate } from '../../utils/dateHelpers';
import { usePhotoAnalysis } from '../../hooks/usePhotoAnalysis';
import { PhotoAnalysisConsentModal, PhotoAnalysisResultView, PhotoHistoryOptIn } from './PhotoAnalysisResult';

interface Props {
  /** The two photos the user selected, in any order. */
  pair: [ProgressPhoto, ProgressPhoto];
  profile: Profile;
  photos: ProgressPhoto[];
  measurements: Measurement[];
  /** Rendered over the fullscreen black comparison view rather than on a surface card. */
  dark?: boolean;
}

/**
 * The AI review of one selected pair. Deliberately has no photo picker of its own — it acts on
 * whichever two photos the surrounding screen already has selected, so there is one way to
 * choose photos and one place the review appears.
 */
export function PhotoAnalysisPanel({ pair, profile, photos, measurements, dark = false }: Props) {
  const [from, to] = pair[0].date <= pair[1].date ? pair : [pair[1], pair[0]];
  const {
    result,
    loading,
    consentOpen,
    includePhotoHistory,
    setIncludePhotoHistory,
    request,
    acceptConsent,
    declineConsent,
  } = usePhotoAnalysis(profile, photos, measurements);

  const apiKey = getApiKey();
  const samePose = from.pose === to.pose;
  // A cached review may belong to an older pair — only show it against the pair it describes.
  const resultMatchesPair =
    result != null && result.baselinePhotoId === from.id && result.latestPhotoId === to.id;

  const muted = dark ? 'text-white/50' : 'text-text-muted';
  const heading = dark ? 'text-white' : 'text-text-secondary';

  return (
    <>
      <div
        className={`rounded-xl p-3 space-y-2 ${
          dark ? 'bg-white/5 border border-white/10' : 'bg-surface-raised border border-border-light'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} className="text-accent-blue" />
          <span className={`text-[0.6875rem] font-semibold ${heading}`}>AI Progress Review</span>
        </div>

        {!apiKey ? (
          <p className={`text-[0.625rem] ${muted}`}>
            Add an AI API key in Settings to review this comparison.
          </p>
        ) : !samePose ? (
          <p className="text-[0.625rem] text-warning">
            Select two photos of the same pose to analyze — comparing different poses can't show a change.
          </p>
        ) : (
          <>
            <p className={`text-[0.625rem] ${muted}`}>
              Reviews these two photos only — {formatShortDate(from.date)} and {formatShortDate(to.date)}.
            </p>
            <PhotoHistoryOptIn
              checked={includePhotoHistory}
              onChange={setIncludePhotoHistory}
              dark={dark}
            />
            <button
              onClick={() => request(from, to)}
              disabled={loading}
              className="w-full py-2 rounded-lg bg-accent-blue text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {loading ? 'Analyzing…' : resultMatchesPair ? 'Analyze again' : 'Analyze with AI'}
            </button>
            <p className={`text-[0.625rem] ${dark ? 'text-white/40' : 'text-text-muted'}`}>
              Runs only when you tap — about $0.03 of API usage. Informational, not medical advice.
            </p>
          </>
        )}

        {resultMatchesPair && result && (
          <div className="pt-1">
            <PhotoAnalysisResultView result={result} showHeader={false} />
          </div>
        )}
      </div>

      {consentOpen && <PhotoAnalysisConsentModal onAccept={acceptConsent} onCancel={declineConsent} />}
    </>
  );
}
