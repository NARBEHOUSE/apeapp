import { useState } from 'react';
import { Check, X, ChevronDown, ChevronUp, MessageSquare, Dumbbell, Target } from 'lucide-react';
import type { PendingCoachChanges, CoachChangeItem, CoachChangeResponse, Profile, MacroTargets, Program } from '../../types';
import { toast } from '../shared/Toast';

interface Props {
  pendingChanges: PendingCoachChanges;
  profile: Profile;
  onUpdateProfile: (id: string, updates: Partial<Profile>) => void;
  onFinalize: (
    responses: CoachChangeResponse[],
    changes: PendingCoachChanges,
    profile: Profile,
    onUpdateProfile: (id: string, updates: Partial<Profile>) => void,
  ) => Promise<void>;
}

function ItemPreview({ item, profile }: { item: CoachChangeItem; profile: Profile }) {
  if (item.type === 'macros') {
    const proposed = item.data as MacroTargets;
    const current = profile.macroTargets;
    return (
      <div className="space-y-1">
        <div className="grid grid-cols-3 gap-2 text-xs">
          {(['protein', 'carbs', 'fat'] as const).map((key) => {
            const cur = current[key];
            const prop = proposed[key];
            const diff = prop - cur;
            return (
              <div key={key} className="text-center">
                <div className="text-[9px] text-text-muted uppercase">{key}</div>
                <div className="font-medium">{cur}g <span className="text-text-muted">→</span> {prop}g</div>
                {diff !== 0 && (
                  <div className={`text-[10px] font-medium ${diff > 0 ? 'text-success' : 'text-danger'}`}>
                    {diff > 0 ? '+' : ''}{diff}g
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="text-center text-[10px] text-text-muted">
          {current.calories} cal → {proposed.protein * 4 + proposed.carbs * 4 + proposed.fat * 9} cal
        </div>
      </div>
    );
  }
  if (item.type === 'program') {
    const prog = item.data as Program;
    return (
      <div className="text-xs text-text-secondary">
        <span className="font-medium">{prog.name}</span> — {prog.days.length} days, {prog.days.reduce((a, d) => a + d.exercises.length, 0)} exercises
      </div>
    );
  }
  if (item.type === 'note') {
    try {
      const parsed = JSON.parse(String(item.data));
      if (parsed.action === 'set_questions' && Array.isArray(parsed.questions)) {
        return (
          <div className="space-y-1">
            <div className="text-[10px] text-text-muted">{parsed.questions.length} questions:</div>
            {parsed.questions.map((q: { id: string; label: string }) => (
              <div key={q.id} className="text-xs text-text-secondary pl-2 border-l-2 border-border">{q.label}</div>
            ))}
          </div>
        );
      }
    } catch { /* not structured */ }
    return <p className="text-xs text-text-secondary italic">{String(item.data)}</p>;
  }
  return null;
}

export function CoachReviewCard({ pendingChanges, profile, onUpdateProfile, onFinalize }: Props) {
  const [decisions, setDecisions] = useState<Record<string, { action: 'accepted' | 'denied'; clientNote?: string }>>({});
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyNote, setDenyNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const allResolved = pendingChanges.items.every((item) => decisions[item.id]);

  function handleAccept(itemId: string) {
    setDecisions((prev) => ({ ...prev, [itemId]: { action: 'accepted' } }));
    setDenyingId(null);
  }

  function handleDeny(itemId: string) {
    if (denyingId === itemId && denyNote.trim()) {
      setDecisions((prev) => ({ ...prev, [itemId]: { action: 'denied', clientNote: denyNote.trim() } }));
      setDenyingId(null);
      setDenyNote('');
    } else {
      setDenyingId(itemId);
      setDenyNote('');
    }
  }

  function handleDenyWithoutNote(itemId: string) {
    setDecisions((prev) => ({ ...prev, [itemId]: { action: 'denied' } }));
    setDenyingId(null);
    setDenyNote('');
  }

  async function handleConfirm() {
    setSubmitting(true);
    const responses: CoachChangeResponse[] = pendingChanges.items.map((item) => ({
      itemId: item.id,
      action: decisions[item.id]?.action || 'denied',
      clientNote: decisions[item.id]?.clientNote,
      respondedAt: new Date().toISOString(),
    }));
    await onFinalize(responses, pendingChanges, profile, onUpdateProfile);
    const accepted = responses.filter((r) => r.action === 'accepted').length;
    const denied = responses.filter((r) => r.action === 'denied').length;
    toast(`${accepted} accepted, ${denied} denied`, 'success');
    setSubmitting(false);
  }

  const typeIcon = (type: string) => {
    if (type === 'macros') return <Target size={14} className="text-accent-orange" />;
    if (type === 'program') return <Dumbbell size={14} className="text-accent-blue" />;
    return <MessageSquare size={14} className="text-text-muted" />;
  };

  return (
    <div className="bg-accent-orange/10 border border-accent-orange/30 rounded-2xl overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <div className="text-sm font-semibold text-accent-orange">Coach Changes</div>
        <div className="text-[10px] text-text-muted">
          {new Date(pendingChanges.pushedAt).toLocaleDateString()} · {pendingChanges.items.length} item{pendingChanges.items.length > 1 ? 's' : ''}
        </div>
      </div>

      <div className="px-4 pb-3 space-y-2">
        {pendingChanges.items.map((item) => {
          const decision = decisions[item.id];
          const isDenying = denyingId === item.id;

          return (
            <div key={item.id} className={`rounded-xl p-3 border transition-colors ${
              decision?.action === 'accepted' ? 'bg-success/10 border-success/30' :
              decision?.action === 'denied' ? 'bg-danger/10 border-danger/30' :
              'bg-surface border-border'
            }`}>
              <div className="flex items-start gap-2">
                {typeIcon(item.type)}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">{item.label}</div>
                  {item.coachNote && (
                    <div className="text-[10px] text-text-muted mt-0.5">Coach: "{item.coachNote}"</div>
                  )}
                </div>
                {decision ? (
                  <div className="flex items-center gap-1">
                    <span className={`text-[10px] font-medium ${decision.action === 'accepted' ? 'text-success' : 'text-danger'}`}>
                      {decision.action === 'accepted' ? 'Accepted' : 'Denied'}
                    </span>
                    <button onClick={() => { setDecisions((prev) => { const next = { ...prev }; delete next[item.id]; return next; }); }} className="text-[9px] text-text-muted underline ml-1">
                      Undo
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => handleAccept(item.id)} className="p-1.5 rounded-lg bg-success/10 text-success hover:bg-success/20">
                      <Check size={14} />
                    </button>
                    <button onClick={() => handleDeny(item.id)} className="p-1.5 rounded-lg bg-danger/10 text-danger hover:bg-danger/20">
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              {!decision && (
                <div className="mt-2">
                  <ItemPreview item={item} profile={profile} />
                </div>
              )}

              {isDenying && (
                <div className="mt-2 space-y-1.5">
                  <input
                    className="input-field text-xs"
                    placeholder="Feedback to coach (optional)"
                    value={denyNote}
                    onChange={(e) => setDenyNote(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-1.5">
                    <button onClick={() => handleDenyWithoutNote(item.id)} className="text-[10px] text-text-muted">
                      Deny without note
                    </button>
                    {denyNote.trim() && (
                      <button onClick={() => handleDeny(item.id)} className="text-[10px] text-danger font-medium">
                        Deny with note
                      </button>
                    )}
                  </div>
                </div>
              )}

              {decision?.clientNote && (
                <div className="mt-1 text-[10px] text-text-muted italic">Your note: "{decision.clientNote}"</div>
              )}
            </div>
          );
        })}
      </div>

      {allResolved && (
        <div className="px-4 pb-4">
          <button onClick={handleConfirm} disabled={submitting} className="btn-primary w-full text-sm disabled:opacity-50">
            {submitting ? 'Applying...' : 'Confirm All'}
          </button>
        </div>
      )}
    </div>
  );
}
