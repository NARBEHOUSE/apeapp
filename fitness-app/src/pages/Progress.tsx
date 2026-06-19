import { useState } from 'react';
import { Ruler, Camera, Film, Trash2 } from 'lucide-react';
import type { Profile, Measurement } from '../types';
import { useProgress } from '../hooks/useProgress';
import { formatDate } from '../utils/dateHelpers';
import { MeasurementLog } from '../components/progress/MeasurementLog';
import { ProgressCharts } from '../components/progress/ProgressCharts';
import { PhotoCapture } from '../components/progress/PhotoCapture';
import { PhotoGallery } from '../components/progress/PhotoGallery';
import { TimeLapse } from '../components/progress/TimeLapse';
import { Modal } from '../components/shared/Modal';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';

interface Props {
  profile: Profile;
}

type Tab = 'measurements' | 'photos' | 'timelapse';

const TABS: { value: Tab; label: string; icon: typeof Ruler }[] = [
  { value: 'measurements', label: 'Measurements', icon: Ruler },
  { value: 'photos', label: 'Photos', icon: Camera },
  { value: 'timelapse', label: 'Time Lapse', icon: Film },
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

export function Progress({ profile }: Props) {
  const [tab, setTab] = useState<Tab>('measurements');
  const [showCapture, setShowCapture] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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

  const handleSaveMeasurement = async (m: Omit<Measurement, 'id' | 'profileId'>) => {
    await addMeasurement(m);
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
    </div>
  );
}
