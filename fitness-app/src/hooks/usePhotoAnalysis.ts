import { useCallback, useState } from 'react';
import type { Measurement, Profile, ProgressPhoto } from '../types';
import {
  analyzePhotoProgress,
  buildPhotoProgressSnapshot,
  cachePhotoAnalysis,
  getCachedPhotoAnalysis,
  type PhotoAnalysisResult,
} from '../utils/photoAnalysis';
import { getApiKey } from '../utils/apiKeyManager';
import { toast } from '../components/shared/Toast';

// Separate from the AI Coach disclaimer: this one is about progress photos leaving the
// device, which is a materially different thing to agree to.
export const PHOTO_ANALYSIS_CONSENT_KEY = 'fitos-photo-analysis-consent';

export function hasPhotoAnalysisConsent(): boolean {
  return localStorage.getItem(PHOTO_ANALYSIS_CONSENT_KEY) === 'true';
}

/**
 * Shared plumbing for the AI photo review, so the Photos-tab card and the comparison screen
 * run the same request against the same per-profile cache instead of each keeping their own.
 *
 * Nothing here fires on its own: a request only happens when `request` is called from a user
 * action, and only after consent has been given, because the user pays their provider per call.
 */
export function usePhotoAnalysis(
  profile: Profile,
  photos: ProgressPhoto[],
  measurements: Measurement[],
  onAnalyzed?: (result: PhotoAnalysisResult) => void,
) {
  const [result, setResult] = useState<PhotoAnalysisResult | null>(() => getCachedPhotoAnalysis(profile.id));
  const [loading, setLoading] = useState(false);
  const [pendingPair, setPendingPair] = useState<[ProgressPhoto, ProgressPhoto] | null>(null);
  // Off by default: only the pair the user picked is described, with no reference to their
  // other photos. Opting in adds their other photos' dates — never those images.
  const [includePhotoHistory, setIncludePhotoHistory] = useState(false);

  const analyze = useCallback(
    async (a: ProgressPhoto, b: ProgressPhoto) => {
      setLoading(true);
      try {
        // Order oldest-first so "baseline" and "latest" mean what the prompt says.
        const [from, to] = a.date <= b.date ? [a, b] : [b, a];
        const snapshot = buildPhotoProgressSnapshot(profile, from, to, photos, measurements, includePhotoHistory);
        const analysis = await analyzePhotoProgress(from, to, snapshot);
        setResult(analysis);
        cachePhotoAnalysis(profile.id, analysis);
        onAnalyzed?.(analysis);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Analysis failed', 'error');
      } finally {
        setLoading(false);
      }
    },
    [profile, photos, measurements, includePhotoHistory, onAnalyzed],
  );

  const request = useCallback(
    (a: ProgressPhoto, b: ProgressPhoto) => {
      if (!getApiKey()) {
        toast('Add your AI API key in Settings first', 'error');
        return;
      }
      if (!hasPhotoAnalysisConsent()) {
        setPendingPair([a, b]);
        return;
      }
      analyze(a, b);
    },
    [analyze],
  );

  const acceptConsent = useCallback(() => {
    localStorage.setItem(PHOTO_ANALYSIS_CONSENT_KEY, 'true');
    const pair = pendingPair;
    setPendingPair(null);
    if (pair) analyze(pair[0], pair[1]);
  }, [pendingPair, analyze]);

  const declineConsent = useCallback(() => setPendingPair(null), []);

  return {
    result,
    loading,
    consentOpen: pendingPair != null,
    includePhotoHistory,
    setIncludePhotoHistory,
    request,
    acceptConsent,
    declineConsent,
  };
}
