import { useState, useMemo, useRef } from 'react';
import { X, Trash2, ImageIcon, Share2, ArrowLeftRight, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import type { ProgressPhoto, Measurement } from '../../types';
import { formatDate } from '../../utils/dateHelpers';
import { renderProgressCard, shareOrDownload } from '../../utils/shareCards';
import { ConfirmDialog } from '../shared/ConfirmDialog';

interface Props {
  photos: ProgressPhoto[];
  onDelete: (id: string) => void;
  onUpdate?: (photo: ProgressPhoto) => void;
  measurements?: Measurement[];
  weightUnit?: 'lbs' | 'kg';
  measurementUnit?: 'in' | 'cm';
}

type PoseFilter = 'all' | 'front' | 'side_left' | 'side_right' | 'back';

const FILTER_OPTIONS: { value: PoseFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'front', label: 'Front' },
  { value: 'side_left', label: 'Side L' },
  { value: 'side_right', label: 'Side R' },
  { value: 'back', label: 'Back' },
];

const POSE_LABELS: Record<string, string> = {
  front: 'Front',
  side_left: 'Side L',
  side_right: 'Side R',
  back: 'Back',
};

function getImageSrc(imageData: string): string {
  if (imageData.startsWith('data:')) return imageData;
  return `data:image/jpeg;base64,${imageData}`;
}

type StatOption = 'none' | 'weight' | 'bodyFat' | 'waist' | 'chest' | 'hips' | 'shoulders' | 'leftArm' | 'rightArm' | 'leftBicep' | 'rightBicep' | 'leftThigh' | 'rightThigh' | 'neck';

const STAT_OPTIONS: { value: StatOption; label: string }[] = [
  { value: 'none', label: 'No stat' },
  { value: 'weight', label: 'Weight' },
  { value: 'bodyFat', label: 'Body Fat %' },
  { value: 'waist', label: 'Waist' },
  { value: 'chest', label: 'Chest' },
  { value: 'hips', label: 'Hips' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'neck', label: 'Neck' },
  { value: 'leftArm', label: 'Left Arm' },
  { value: 'rightArm', label: 'Right Arm' },
  { value: 'leftBicep', label: 'Left Bicep' },
  { value: 'rightBicep', label: 'Right Bicep' },
  { value: 'leftThigh', label: 'Left Thigh' },
  { value: 'rightThigh', label: 'Right Thigh' },
];

function findClosestMeasurement(date: string, measurements: Measurement[]): Measurement | null {
  if (measurements.length === 0) return null;
  const target = new Date(date + 'T00:00:00').getTime();
  let closest = measurements[0];
  let closestDiff = Math.abs(new Date(closest.date + 'T00:00:00').getTime() - target);
  for (const m of measurements) {
    const diff = Math.abs(new Date(m.date + 'T00:00:00').getTime() - target);
    if (diff < closestDiff) { closest = m; closestDiff = diff; }
  }
  if (closestDiff > 14 * 86400000) return null;
  return closest;
}

export function PhotoGallery({ photos, onDelete, onUpdate, measurements = [], weightUnit = 'lbs', measurementUnit = 'in' }: Props) {
  const [filter, setFilter] = useState<PoseFilter>('all');
  const [selectedPhoto, setSelectedPhoto] = useState<ProgressPhoto | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<ProgressPhoto[]>([]);
  const [sharing, setSharing] = useState(false);
  const [compareStats, setCompareStats] = useState<StatOption[]>(['weight']);
  const [shareFormat, setShareFormat] = useState<'post' | 'story'>('post');

  const filtered = useMemo(() => {
    const sorted = [...photos].sort((a, b) => b.date.localeCompare(a.date));
    if (filter === 'all') return sorted;
    return sorted.filter((p) => p.pose === filter);
  }, [photos, filter]);

  const handleCompareSelect = (photo: ProgressPhoto) => {
    if (compareSelection.some((p) => p.id === photo.id)) {
      setCompareSelection(compareSelection.filter((p) => p.id !== photo.id));
    } else if (compareSelection.length < 2) {
      setCompareSelection([...compareSelection, photo]);
    }
  };

  const getStatsForPhoto = (photo: ProgressPhoto): string | undefined => {
    if (compareStats.length === 0 || (compareStats.length === 1 && compareStats[0] === 'none')) return undefined;

    const m = findClosestMeasurement(photo.date, measurements);
    const parts: string[] = [];

    for (const stat of compareStats) {
      if (stat === 'none') continue;
      if (stat === 'weight') {
        if (photo.weight != null) parts.push(`${photo.weight} ${weightUnit}`);
        else if (m?.weight != null) parts.push(`${m.weight} ${weightUnit}`);
      } else if (stat === 'bodyFat') {
        if (m?.bodyFatPercent != null) parts.push(`${m.bodyFatPercent}% BF`);
      } else {
        const bodyVal = m?.measurements?.[stat as keyof NonNullable<typeof m.measurements>];
        if (bodyVal != null) {
          const label = STAT_OPTIONS.find((o) => o.value === stat)?.label || stat;
          parts.push(`${label}: ${bodyVal}${measurementUnit}`);
        }
      }
    }

    return parts.length > 0 ? parts.join(' · ') : undefined;
  };

  const handleShareComparison = async () => {
    if (compareSelection.length !== 2) return;
    setSharing(true);
    try {
      const [before, after] = compareSelection.sort((a, b) => a.date.localeCompare(b.date));
      const canvas = await renderProgressCard({
        beforeImage: getImageSrc(before.imageData),
        afterImage: getImageSrc(after.imageData),
        beforeDate: before.date,
        afterDate: after.date,
        beforeStat: getStatsForPhoto(before),
        afterStat: getStatsForPhoto(after),
        pose: POSE_LABELS[before.pose] || before.pose,
        format: shareFormat,
      });
      shareOrDownload(canvas, `progress-${before.date}-to-${after.date}.png`);
    } finally {
      setSharing(false);
    }
  };

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ImageIcon size={48} className="text-text-muted mb-4" />
        <p className="text-text-secondary text-sm">No progress photos yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
              filter === opt.value
                ? 'bg-accent-blue text-white'
                : 'bg-surface-raised text-text-secondary border border-border-light'
            }`}
          >
            {opt.label}
          </button>
        ))}
        <button
          onClick={() => { setCompareMode(!compareMode); setCompareSelection([]); }}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            compareMode
              ? 'bg-accent text-white'
              : 'bg-surface-raised text-text-secondary border border-border-light'
          }`}
        >
          <ArrowLeftRight size={12} />
          Compare
        </button>
      </div>

      {/* Compare mode hint */}
      {compareMode && (
        <div className="bg-accent/10 border border-accent/30 rounded-xl px-3 py-2 text-xs text-center text-accent font-medium">
          Select 2 photos to compare{compareSelection.length > 0 ? ` (${compareSelection.length}/2 selected)` : ''}
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-3 gap-2">
        {filtered.map((photo) => {
          const isSelected = compareSelection.some((p) => p.id === photo.id);
          const selIndex = compareSelection.findIndex((p) => p.id === photo.id);
          return (
            <button
              key={photo.id}
              onClick={() => compareMode ? handleCompareSelect(photo) : setSelectedPhoto(photo)}
              className={`relative aspect-[3/4] rounded-xl overflow-hidden border-2 transition-colors ${
                isSelected ? 'border-accent' : 'border-border-light hover:border-accent-blue/50'
              }`}
            >
              <img
                src={getImageSrc(photo.imageData)}
                alt={`${photo.pose} - ${photo.date}`}
                className="w-full h-full object-cover"
              />
              {compareMode && (
                <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                  isSelected ? 'bg-accent text-white' : 'bg-black/40 border-2 border-white/60'
                }`}>
                  {isSelected ? (
                    <span className="text-xs font-bold">{selIndex + 1}</span>
                  ) : null}
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                <p className="text-[9px] font-semibold text-white/90">
                  {formatDate(photo.date)}
                </p>
                <p className="text-[8px] text-white/60 uppercase">
                  {POSE_LABELS[photo.pose] || photo.pose}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Compare share bar */}
      {compareMode && compareSelection.length === 2 && (
        <div className="space-y-2">
          {/* Stats multi-select */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-text-muted font-semibold uppercase">Stats to show (up to 5):</span>
              <div className="flex rounded-lg overflow-hidden border border-border-light">
                <button
                  onClick={() => setShareFormat('post')}
                  className={`px-2 py-1 text-[9px] font-semibold ${shareFormat === 'post' ? 'bg-accent-blue text-white' : 'bg-surface-raised text-text-muted'}`}
                >4:5</button>
                <button
                  onClick={() => setShareFormat('story')}
                  className={`px-2 py-1 text-[9px] font-semibold ${shareFormat === 'story' ? 'bg-accent-blue text-white' : 'bg-surface-raised text-text-muted'}`}
                >9:16</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {STAT_OPTIONS.filter((o) => o.value !== 'none').map((opt) => {
                const selected = compareStats.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      if (selected) {
                        setCompareStats(compareStats.filter((s) => s !== opt.value));
                      } else if (compareStats.filter((s) => s !== 'none').length < 5) {
                        setCompareStats([...compareStats.filter((s) => s !== 'none'), opt.value]);
                      }
                    }}
                    className={`px-2 py-1 rounded-md text-[9px] font-semibold transition-colors ${
                      selected ? 'bg-accent-blue text-white' : 'bg-surface-raised text-text-muted border border-border-light'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            onClick={handleShareComparison}
            disabled={sharing}
            className="w-full bg-accent text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <Share2 size={16} />
            {sharing ? 'Generating...' : 'Share Before & After'}
          </button>
        </div>
      )}

      {/* Enlarged View with swipe */}
      {selectedPhoto && <EnlargedPhotoView
        photo={selectedPhoto}
        photos={filtered}
        onClose={() => setSelectedPhoto(null)}
        onNavigate={setSelectedPhoto}
        onDelete={(id) => setDeleteId(id)}
        onUpdate={onUpdate}
      />}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) {
            onDelete(deleteId);
            if (selectedPhoto?.id === deleteId) setSelectedPhoto(null);
          }
          setDeleteId(null);
        }}
        title="Delete Photo"
        message="This will permanently delete this progress photo. This cannot be undone."
        confirmText="Delete"
        danger
      />
    </div>
  );
}

const POSE_OPTIONS: { value: ProgressPhoto['pose']; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'side_left', label: 'Side (L)' },
  { value: 'side_right', label: 'Side (R)' },
  { value: 'back', label: 'Back' },
];

function EnlargedPhotoView({ photo, photos, onClose, onNavigate, onDelete, onUpdate }: {
  photo: ProgressPhoto;
  photos: ProgressPhoto[];
  onClose: () => void;
  onNavigate: (photo: ProgressPhoto) => void;
  onDelete: (id: string) => void;
  onUpdate?: (photo: ProgressPhoto) => void;
}) {
  const [rotation, setRotation] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState(photo.date);
  const [editPose, setEditPose] = useState(photo.pose);
  const [editWeight, setEditWeight] = useState(photo.weight ? String(photo.weight) : '');
  const [editNotes, setEditNotes] = useState(photo.notes || '');
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const currentIdx = photos.findIndex((p) => p.id === photo.id);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < photos.length - 1;

  const goNext = () => { if (hasNext) { setRotation(0); onNavigate(photos[currentIdx + 1]); } };
  const goPrev = () => { if (hasPrev) { setRotation(0); onNavigate(photos[currentIdx - 1]); } };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goNext();
      else goPrev();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="relative w-full h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/50 z-10">
          <div>
            <p className="text-sm font-semibold text-white">
              {formatDate(photo.date)}
            </p>
            <p className="text-xs text-white/60 uppercase">
              {POSE_LABELS[photo.pose]}
              {photo.weight && ` · ${photo.weight} lbs`}
              {photos.length > 1 && ` · ${currentIdx + 1}/${photos.length}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setRotation((r) => (r - 90) % 360)} className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors" title="Rotate left">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 2v6h6"/><path d="M2.5 8C5 3.5 10 1.5 15 3s8.5 7 7 12.5S15 24 10 22.5"/></svg>
            </button>
            <button onClick={() => setRotation((r) => (r + 90) % 360)} className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors" title="Rotate right">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.5 8C19 3.5 14 1.5 9 3S.5 10 2 15.5 9 24 14 22.5"/></svg>
            </button>
            <button
              onClick={() => {
                const canvas = document.createElement('canvas');
                const img = new Image();
                img.onload = () => {
                  canvas.width = img.width;
                  canvas.height = img.height;
                  canvas.getContext('2d')!.drawImage(img, 0, 0);
                  shareOrDownload(canvas, `progress-${photo.date}-${photo.pose}.png`);
                };
                img.src = getImageSrc(photo.imageData);
              }}
              className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <Share2 size={18} />
            </button>
            {onUpdate && (
              <button onClick={() => {
                setEditing(!editing);
                setEditDate(photo.date); setEditPose(photo.pose);
                setEditWeight(photo.weight ? String(photo.weight) : '');
                setEditNotes(photo.notes || '');
              }} className={`p-2 rounded-lg transition-colors ${editing ? 'bg-accent-blue/20 text-accent-blue' : 'hover:bg-white/10 text-white/60 hover:text-white'}`}>
                <Pencil size={18} />
              </button>
            )}
            <button onClick={() => onDelete(photo.id)} className="p-2 rounded-lg hover:bg-danger/20 text-white/60 hover:text-danger transition-colors">
              <Trash2 size={18} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Image with swipe */}
        <div
          className="flex-1 flex items-center justify-center p-4 overflow-hidden relative"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Prev/Next arrows */}
          {hasPrev && (
            <button onClick={goPrev} className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white/70 hover:text-white">
              <ChevronLeft size={24} />
            </button>
          )}
          {hasNext && (
            <button onClick={goNext} className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white/70 hover:text-white">
              <ChevronRight size={24} />
            </button>
          )}

          <img
            src={getImageSrc(photo.imageData)}
            alt={`${photo.pose} - ${photo.date}`}
            className="max-w-full max-h-full object-contain rounded-xl transition-transform duration-200"
            style={{ transform: `rotate(${rotation}deg)` }}
          />
        </div>

        {/* Notes */}
        {photo.notes && !editing && (
          <div className="px-4 pb-4">
            <p className="text-sm text-white/70 text-center">{photo.notes}</p>
          </div>
        )}

        {/* Edit panel */}
        {editing && onUpdate && (
          <div className="px-4 pb-4 space-y-3 bg-black/60">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-white/50 uppercase font-semibold">Date</label>
                <input type="date" className="w-full bg-white/10 text-white text-sm rounded-lg px-2.5 py-2 border border-white/20" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
              <div>
                <label className="text-[9px] text-white/50 uppercase font-semibold">Pose</label>
                <select className="w-full bg-white/10 text-white text-sm rounded-lg px-2.5 py-2 border border-white/20" value={editPose} onChange={(e) => setEditPose(e.target.value as ProgressPhoto['pose'])}>
                  {POSE_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-white/50 uppercase font-semibold">Weight</label>
                <input type="number" inputMode="decimal" className="w-full bg-white/10 text-white text-sm rounded-lg px-2.5 py-2 border border-white/20" placeholder="Optional" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} />
              </div>
              <div>
                <label className="text-[9px] text-white/50 uppercase font-semibold">Notes</label>
                <input type="text" className="w-full bg-white/10 text-white text-sm rounded-lg px-2.5 py-2 border border-white/20" placeholder="Optional" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-lg bg-white/10 text-white/70 text-xs font-medium">Cancel</button>
              <button onClick={() => {
                const weightVal = parseFloat(editWeight);
                onUpdate({
                  ...photo,
                  date: editDate || photo.date,
                  pose: editPose,
                  weight: isNaN(weightVal) ? undefined : weightVal,
                  notes: editNotes.trim() || undefined,
                });
                setEditing(false);
                onNavigate({ ...photo, date: editDate || photo.date, pose: editPose, weight: isNaN(weightVal) ? undefined : weightVal, notes: editNotes.trim() || undefined });
              }} className="flex-1 py-2 rounded-lg bg-accent-blue text-white text-xs font-semibold">Save Changes</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
