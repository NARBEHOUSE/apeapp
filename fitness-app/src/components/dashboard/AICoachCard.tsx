import { useState, useEffect, useCallback } from 'react';
import { Brain, Loader2, RefreshCw, Check, X, ChevronDown, ChevronUp, Sparkles, AlertTriangle } from 'lucide-react';
import type { Profile, WorkoutSession, FoodEntry, Measurement, CheckInEntry, StepEntry, Program } from '../../types';
import {
  buildDataSnapshot,
  getCoachSuggestions,
  getCachedCoachResponse,
  cacheCoachResponse,
  clearCoachCache,
  type CoachResponse,
  type CoachSuggestion,
} from '../../utils/aiCoach';
import { toast } from '../shared/Toast';

interface Props {
  profile: Profile;
  sessions: WorkoutSession[];
  allFoodEntries: FoodEntry[];
  measurements: Measurement[];
  checkIns: CheckInEntry[];
  steps: StepEntry[];
  programs: Program[];
  onUpdateProfile: (id: string, updates: Partial<Profile>) => void;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  nutrition: { bg: 'bg-[#f5a623]/10', text: 'text-[#f5a623]', icon: '#f5a623' },
  training: { bg: 'bg-accent/10', text: 'text-accent', icon: '#e8572a' },
  recovery: { bg: 'bg-green-500/10', text: 'text-green-500', icon: '#2e9e6b' },
  general: { bg: 'bg-accent-blue/10', text: 'text-accent-blue', icon: '#5b6ef5' },
};

const DISCLAIMER_KEY = 'fitos-ai-coach-disclaimer-accepted';
const DISMISSED_KEY = 'fitos-ai-coach-dismissed';

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(ids)));
}

export function AICoachCard({ profile, sessions, allFoodEntries, measurements, checkIns, steps, programs, onUpdateProfile }: Props) {
  const [response, setResponse] = useState<CoachResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const apiKey = localStorage.getItem('fitos-claude-key') || '';
  const disclaimerAccepted = localStorage.getItem(DISCLAIMER_KEY) === 'true';

  const dismissSuggestion = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      saveDismissed(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const cached = getCachedCoachResponse();
    if (cached) setResponse(cached);
  }, []);

  const fetchSuggestions = useCallback(async () => {
    if (!apiKey) { toast('Add your Claude API key in Settings first', 'error'); return; }

    if (!disclaimerAccepted) { setShowDisclaimer(true); return; }

    setLoading(true);
    try {
      const snapshot = buildDataSnapshot(profile, sessions, allFoodEntries, measurements, checkIns, programs, steps);
      const result = await getCoachSuggestions(snapshot, apiKey);
      setResponse(result);
      cacheCoachResponse(result);
      const empty = new Set<string>();
      setDismissed(empty);
      saveDismissed(empty);
      setApplied(new Set());
      setExpanded(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to get suggestions', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiKey, profile, sessions, allFoodEntries, measurements, checkIns, programs, disclaimerAccepted]);

  const acceptDisclaimer = useCallback(() => {
    localStorage.setItem(DISCLAIMER_KEY, 'true');
    setShowDisclaimer(false);
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleApply = useCallback((suggestion: CoachSuggestion) => {
    if (!suggestion.action || suggestion.action.type === 'none') return;
    const action = suggestion.action;
    const targets = { ...profile.macroTargets };

    if (action.type === 'adjust_calories' && action.value) {
      targets.calories = action.value;
    } else if (action.type === 'adjust_protein' && action.value) {
      targets.protein = action.value;
    } else if (action.type === 'adjust_carbs' && action.value) {
      targets.carbs = action.value;
    } else if (action.type === 'adjust_fat' && action.value) {
      targets.fat = action.value;
    }

    if (action.type.startsWith('adjust_')) {
      onUpdateProfile(profile.id, { macroTargets: targets });
      toast(`Applied: ${action.label}`, 'success');
    } else if (action.type === 'deload') {
      toast('Deload suggestion noted — adjust your next session accordingly', 'success');
    }

    setApplied((prev) => new Set(prev).add(suggestion.id));
  }, [profile, onUpdateProfile]);

  const activeSuggestions = response?.suggestions.filter((s) => !dismissed.has(s.id)) || [];
  const pendingCount = activeSuggestions.filter((s) => !applied.has(s.id)).length;

  // Cache age display
  const cacheAge = response ? Math.floor((Date.now() - new Date(response.generatedAt).getTime()) / 3600000) : 0;

  return (
    <>
      <div className="card">
        <button
          onClick={() => response ? setExpanded(!expanded) : fetchSuggestions()}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-accent-blue" />
            <h2 className="label">AI Coach</h2>
            {pendingCount > 0 && !expanded && (
              <span className="text-[10px] bg-accent-blue/15 text-accent-blue font-semibold px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </div>
          {loading ? (
            <Loader2 size={16} className="text-text-muted animate-spin" />
          ) : response ? (
            expanded ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />
          ) : (
            <span className="text-[10px] text-accent-blue font-semibold">Get Suggestions</span>
          )}
        </button>

        {/* Summary line when collapsed */}
        {response && !expanded && activeSuggestions.length > 0 && (
          <p className="text-[11px] text-text-muted mt-2">{response.summary}</p>
        )}

        {/* Expanded suggestions */}
        {expanded && response && (
          <div className="mt-3 space-y-3">
            {/* Summary */}
            <p className="text-xs text-text-secondary">{response.summary}</p>

            {/* Suggestions */}
            {activeSuggestions.map((s) => {
              const colors = CATEGORY_COLORS[s.category] || CATEGORY_COLORS.general;
              const isApplied = applied.has(s.id);

              return (
                <div key={s.id} className={`rounded-xl p-3 space-y-2 ${isApplied ? 'bg-success/5 border border-success/20' : 'bg-surface-raised'}`}>
                  <div className="flex items-start gap-2">
                    <div className={`w-6 h-6 rounded-lg ${colors.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                      <Brain size={12} style={{ color: colors.icon }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-semibold uppercase ${colors.text}`}>{s.category}</span>
                        {isApplied && <Check size={10} className="text-success" />}
                      </div>
                      <div className="text-sm font-medium mt-0.5">{s.title}</div>
                      <p className="text-[11px] text-text-muted mt-1 leading-relaxed">{s.explanation}</p>
                    </div>
                    <button
                      onClick={() => dismissSuggestion(s.id)}
                      className="p-1 rounded-lg hover:bg-surface text-text-muted/40 hover:text-text-muted transition-colors shrink-0"
                      title="Dismiss"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  {!isApplied && (
                    <div className="flex gap-2 pt-1">
                      {s.action && s.action.type !== 'none' && (
                        <button
                          onClick={() => handleApply(s)}
                          className="flex-1 py-1.5 rounded-lg bg-accent-blue text-white text-xs font-semibold flex items-center justify-center gap-1 active:scale-[0.98] transition-transform"
                        >
                          <Check size={12} />
                          {s.action.label}
                        </button>
                      )}
                      <button
                        onClick={() => dismissSuggestion(s.id)}
                        className="py-1.5 px-3 rounded-lg bg-surface border border-border-light text-xs text-text-muted flex items-center justify-center gap-1 active:scale-[0.98] transition-transform"
                      >
                        <X size={12} />
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {activeSuggestions.length === 0 && (
              <p className="text-xs text-text-muted text-center py-2">All suggestions dismissed. Refresh for new ones.</p>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-text-muted">
                {cacheAge < 1 ? 'Just now' : `${cacheAge}h ago`} · ~$0.02
              </span>
              <button
                onClick={fetchSuggestions}
                disabled={loading}
                className="text-[10px] text-accent-blue font-semibold flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw size={10} />
                Refresh
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Disclaimer modal */}
      {showDisclaimer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-bg rounded-2xl mx-6 max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-warning" />
              <h3 className="font-bold text-base">AI Coach Disclaimer</h3>
            </div>
            <div className="text-sm text-text-secondary space-y-3">
              <p>
                AI Coach analyzes your tracked data and provides <strong>informational suggestions</strong> based on patterns it observes. These are data-driven observations, not medical or professional advice.
              </p>
              <p>
                By using this feature you acknowledge:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-xs">
                <li>Suggestions are generated by AI and may not be appropriate for your specific situation</li>
                <li>This is not a substitute for professional medical, dietary, or fitness advice</li>
                <li>You are responsible for evaluating and applying any suggestions</li>
                <li>Consult a healthcare professional before making significant changes to your diet or exercise routine</li>
              </ul>
              <p className="text-xs text-text-muted">
                Uses your Claude API key. Each request costs approximately $0.02.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDisclaimer(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface border border-border-light text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={acceptDisclaimer}
                className="flex-1 py-2.5 rounded-xl bg-accent-blue text-white text-sm font-semibold"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
