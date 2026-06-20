import { useState, useEffect, useCallback } from 'react';
import { Ruler, Camera, Film, Trash2, ClipboardCheck } from 'lucide-react';
import type { Profile, Measurement, CheckInEntry, CheckInQuestion, DEFAULT_CHECKIN_QUESTIONS } from '../types';
import { DEFAULT_CHECKIN_QUESTIONS as DEFAULT_QUESTIONS } from '../types';
import { getDB } from '../db';
import { useProgress } from '../hooks/useProgress';
import { formatDate } from '../utils/dateHelpers';
import { MeasurementLog } from '../components/progress/MeasurementLog';
import { ProgressCharts } from '../components/progress/ProgressCharts';
import { PhotoCapture } from '../components/progress/PhotoCapture';
import { PhotoGallery } from '../components/progress/PhotoGallery';
import { TimeLapse } from '../components/progress/TimeLapse';
import { Modal } from '../components/shared/Modal';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { calculateMacros } from '../utils/tdee';
import { toast } from '../components/shared/Toast';

interface Props {
  profile: Profile;
  onUpdateProfile?: (id: string, updates: Partial<Profile>) => void;
}

type Tab = 'measurements' | 'photos' | 'timelapse' | 'checkin';

const TABS: { value: Tab; label: string; icon: typeof Ruler }[] = [
  { value: 'measurements', label: 'Measurements', icon: Ruler },
  { value: 'photos', label: 'Photos', icon: Camera },
  { value: 'timelapse', label: 'Time Lapse', icon: Film },
  { value: 'checkin', label: 'Check-In', icon: ClipboardCheck },
];

const BODY_LABELS: Record<string, string> = {
  chest: 'Chest',
  waist: 'Waist',
  hips: 'Hips',
  leftArm: 'L Arm',
  rightArm: 'R Arm',
  leftThigh: 'L Thigh',
  rightThigh: 'R Thigh',
  neck: 'Neck',
  shoulders: 'Shoulders',
};

export function Progress({ profile, onUpdateProfile }: Props) {
  const [tab, setTab] = useState<Tab>('measurements');
  const [showCapture, setShowCapture] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showRecalcPrompt, setShowRecalcPrompt] = useState(false);
  const [weightChangeInfo, setWeightChangeInfo] = useState<{ oldWeight: number; newWeight: number } | null>(null);

  const {
    measurements,
    photos,
    loading,
    addMeasurement,
    deleteMeasurement,
    addPhoto,
    deletePhoto,
    getPhotosByPoseType,
  } = useProgress(profile.id);

  // Check-in state
  const [checkIns, setCheckIns] = useState<CheckInEntry[]>([]);
  const [checkInResponses, setCheckInResponses] = useState<Record<string, number | string>>({});
  const [checkInNotes, setCheckInNotes] = useState('');
  const questions: CheckInQuestion[] = JSON.parse(localStorage.getItem('fitos-checkin-questions') || 'null') || DEFAULT_QUESTIONS;

  const today = new Date().toISOString().split('T')[0];
  const todayCheckIn = checkIns.find((c) => c.date === today);

  const loadCheckIns = useCallback(async () => {
    const db = await getDB();
    const all = await db.getAllFromIndex('checkIns', 'by-profile', profile.id);
    setCheckIns(all.sort((a, b) => b.date.localeCompare(a.date)));
  }, [profile.id]);

  useEffect(() => { loadCheckIns(); }, [loadCheckIns]);

  const handleSubmitCheckIn = async () => {
    const responses = Object.entries(checkInResponses).map(([questionId, value]) => ({ questionId, value }));
    if (responses.length === 0) return;
    const entry: CheckInEntry = {
      id: crypto.randomUUID(),
      profileId: profile.id,
      date: today,
      responses,
      notes: checkInNotes.trim() || undefined,
    };
    const db = await getDB();
    await db.put('checkIns', entry);
    setCheckInResponses({});
    setCheckInNotes('');
    await loadCheckIns();
    toast('Check-in saved', 'success');
  };

  const handleSaveMeasurement = async (m: Omit<Measurement, 'id' | 'profileId'>) => {
    await addMeasurement(m);

    if (m.weight != null && onUpdateProfile) {
      const baseWeight = profile.lastKnownWeight || (profile.bodyStats ? profile.bodyStats.weightKg * 2.20462 : null);
      const newWeight = m.weightUnit === 'kg' ? m.weight * 2.20462 : m.weight;

      if (baseWeight && Math.abs(newWeight - baseWeight) / baseWeight >= 0.05) {
        setWeightChangeInfo({ oldWeight: Math.round(baseWeight), newWeight: Math.round(newWeight) });
        setShowRecalcPrompt(true);
      }

      onUpdateProfile(profile.id, { lastKnownWeight: newWeight });
    }
  };

  const handleSavePhoto = async (photoData: {
    date: string;
    time: string;
    pose: 'front' | 'side_left' | 'side_right' | 'back';
    imageData: string;
    weight?: number;
    notes?: string;
  }) => {
    await addPhoto(photoData);
    setShowCapture(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-progress border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Tab Switcher */}
      <div className="flex bg-surface rounded-xl border border-border p-1 gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === t.value
                  ? 'bg-accent-blue text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Measurements Tab */}
      {tab === 'measurements' && (
        <div className="space-y-4">
          <MeasurementLog
            onSave={handleSaveMeasurement}
            weightUnit={profile.units === 'imperial' ? 'lbs' : 'kg'}
            measurementUnit={profile.measurementUnit}
          />

          <ProgressCharts measurements={measurements} />

          {/* Measurement History */}
          {measurements.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-text-secondary px-1">
                History
              </h3>
              {measurements.map((m) => (
                <div key={m.id} className="card flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold">
                        {formatDate(m.date)}
                      </span>
                      {m.weight != null && (
                        <span className="text-xs font-semibold text-accent-orange">
                          {m.weight} {m.weightUnit}
                        </span>
                      )}
                    </div>
                    {m.measurements && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {Object.entries(m.measurements).map(([key, val]) =>
                          val != null && val > 0 ? (
                            <span key={key} className="text-[11px] text-text-secondary">
                              {BODY_LABELS[key] || key}: {val}{profile.measurementUnit}
                            </span>
                          ) : null
                        )}
                      </div>
                    )}
                    {m.notes && (
                      <p className="text-xs text-text-muted mt-1">{m.notes}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setDeleteId(m.id)}
                    className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <ConfirmDialog
            open={!!deleteId}
            onClose={() => setDeleteId(null)}
            onConfirm={() => {
              if (deleteId) deleteMeasurement(deleteId);
              setDeleteId(null);
            }}
            title="Delete Measurement"
            message="This will permanently delete this measurement entry."
            confirmText="Delete"
            danger
          />
        </div>
      )}

      {/* Photos Tab */}
      {tab === 'photos' && (
        <div className="space-y-4">
          <button
            onClick={() => setShowCapture(true)}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            <Camera size={18} />
            Take Progress Photo
          </button>

          <PhotoGallery photos={photos} onDelete={deletePhoto} />

          <Modal
            open={showCapture}
            onClose={() => setShowCapture(false)}
            title="Progress Photo"
          >
            <PhotoCapture
              onSave={handleSavePhoto}
              onClose={() => setShowCapture(false)}
            />
          </Modal>
        </div>
      )}

      {/* Time Lapse Tab */}
      {tab === 'timelapse' && (
        <TimeLapse
          profileId={profile.id}
          getPhotosByPose={getPhotosByPoseType}
        />
      )}

      {tab === 'checkin' && (
        <div className="space-y-4">
          {todayCheckIn ? (
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Today's Check-In</div>
                <span className="text-[10px] text-success font-medium px-2 py-0.5 rounded-full bg-success/10">Complete</span>
              </div>
              <div className="space-y-2">
                {todayCheckIn.responses.map((r) => {
                  const q = questions.find((qq) => qq.id === r.questionId);
                  return (
                    <div key={r.questionId} className="flex items-center justify-between">
                      <span className="text-xs text-text-secondary">{q?.label || r.questionId}</span>
                      {typeof r.value === 'number' ? (
                        <div className="flex items-center gap-1">
                          <div className="w-20 h-1.5 rounded-full bg-surface-raised overflow-hidden">
                            <div className="h-full rounded-full bg-accent-blue" style={{ width: `${(r.value / 10) * 100}%` }} />
                          </div>
                          <span className="text-xs font-medium w-5 text-right">{r.value}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-text-muted">{r.value}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {todayCheckIn.notes && <p className="text-xs text-text-muted italic">{todayCheckIn.notes}</p>}
            </div>
          ) : (
            <div className="card p-4 space-y-4">
              <div className="text-sm font-semibold">Daily Check-In</div>
              <div className="space-y-4">
                {questions.map((q) => (
                  <div key={q.id}>
                    <div className="text-xs font-medium text-text-secondary mb-2">{q.label}</div>
                    {q.type === 'scale' ? (
                      <div className="flex gap-1">
                        {Array.from({ length: (q.max || 10) - (q.min || 1) + 1 }, (_, i) => i + (q.min || 1)).map((v) => (
                          <button
                            key={v}
                            onClick={() => setCheckInResponses((prev) => ({ ...prev, [q.id]: v }))}
                            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                              checkInResponses[q.id] === v
                                ? 'bg-accent-blue text-white'
                                : 'bg-surface-raised text-text-muted'
                            }`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input
                        className="input-field text-sm"
                        value={(checkInResponses[q.id] as string) || ''}
                        onChange={(e) => setCheckInResponses((prev) => ({ ...prev, [q.id]: e.target.value }))}
                        placeholder="Your answer..."
                      />
                    )}
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs font-medium text-text-secondary mb-1">Notes (optional)</div>
                <textarea
                  className="input-field text-sm w-full resize-none"
                  rows={2}
                  value={checkInNotes}
                  onChange={(e) => setCheckInNotes(e.target.value)}
                  placeholder="How's your day going? Anything to note..."
                />
              </div>
              <button
                onClick={handleSubmitCheckIn}
                disabled={Object.keys(checkInResponses).length === 0}
                className="btn-primary w-full disabled:opacity-30"
              >
                Submit Check-In
              </button>
            </div>
          )}

          {/* History */}
          {checkIns.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider">History</div>
              {checkIns.slice(0, 14).map((ci) => (
                <div key={ci.id} className="card p-3 space-y-1.5">
                  <div className="text-xs font-medium">{ci.date}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {ci.responses.map((r) => {
                      const q = questions.find((qq) => qq.id === r.questionId);
                      return (
                        <span key={r.questionId} className="text-[10px] text-text-muted">
                          {q?.label?.split(' ').slice(0, 2).join(' ') || r.questionId}: <span className="font-medium text-text-secondary">{r.value}</span>
                        </span>
                      );
                    })}
                  </div>
                  {ci.notes && <p className="text-[10px] text-text-muted italic">{ci.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Weight change recalculate prompt */}
      {showRecalcPrompt && weightChangeInfo && onUpdateProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="card mx-6 max-w-sm w-full">
            <h3 className="font-bold text-lg mb-2">Weight Changed Significantly</h3>
            <p className="text-text-secondary text-sm mb-4">
              Your weight went from {weightChangeInfo.oldWeight} lbs to {weightChangeInfo.newWeight} lbs
              ({Math.abs(Math.round(((weightChangeInfo.newWeight - weightChangeInfo.oldWeight) / weightChangeInfo.oldWeight) * 100))}% change).
              Would you like to recalculate your calories and macros?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowRecalcPrompt(false); setWeightChangeInfo(null); }}
                className="btn-secondary flex-1"
              >
                Keep Current
              </button>
              <button
                onClick={() => {
                  if (profile.bodyStats) {
                    const updatedStats = {
                      ...profile.bodyStats,
                      weightKg: weightChangeInfo.newWeight / 2.20462,
                    };
                    const macros = calculateMacros(updatedStats);
                    onUpdateProfile(profile.id, {
                      bodyStats: updatedStats,
                      macroTargets: macros,
                    });
                    toast(`Macros recalculated for ${weightChangeInfo.newWeight} lbs`, 'success');
                  }
                  setShowRecalcPrompt(false);
                  setWeightChangeInfo(null);
                }}
                className="btn-primary flex-1"
              >
                Recalculate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
