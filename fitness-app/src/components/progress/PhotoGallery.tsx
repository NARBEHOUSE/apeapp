import { useState, useMemo } from 'react';
import { X, Trash2, ImageIcon, Share2, ArrowLeftRight } from 'lucide-react';
import type { ProgressPhoto, Measurement } from '../../types';
import { formatDate } from '../../utils/dateHelpers';
import { renderProgressCard, shareOrDownload } from '../../utils/shareCards';
import { ConfirmDialog } from '../shared/ConfirmDialog';

interface Props {
  photos: ProgressPhoto[];
  onDelete: (id: string) => void;
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

export function PhotoGallery({ photos, onDelete, measurements = [], weightUnit = 'lbs', measurementUnit = 'in' }: Props) {
  const [filter, setFilter] = useState<PoseFilter>('all');
  const [selectedPhoto, setSelectedPhoto] = useState<ProgressPhoto | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<ProgressPhoto[]>([]);
  const [sharing, setSharing] = useState(false);
  const [compareStat, setCompareStat] = useState<StatOption>('weight');
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

  const getStatForDate = (date: string): string | undefined => {
    if (compareStat === 'none') return undefined;
    const m = findClosestMeasurement(date, measurements);
    if (!m) return undefined;
    if (compareStat === 'weight') return m.weight != null ? `${m.weight} ${weightUnit}` : undefined;
    if (compareStat === 'bodyFat') return m.bodyFatPercent != null ? `${m.bodyFatPercent}% BF` : undefined;
    const bodyVal = m.measurements?.[compareStat as keyof NonNullable<typeof m.measurements>];
    if (bodyVal != null) {
      const label = STAT_OPTIONS.find((o) => o.value === compareStat)?.label || compareStat;
      return `${label}: ${bodyVal} ${measurementUnit}`;
    }
    return undefined;
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
        beforeStat: getStatForDate(before.date),
        afterStat: getStatForDate(after.date),
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
      {/* Filters + Compare toggle */}
      <div className="flex items-center gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
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
        </div>
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
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted font-semibold uppercase whitespace-nowrap">Stat:</span>
            <select
              className="input-field text-xs flex-1 py-1.5"
              value={compareStat}
              onChange={(e) => setCompareStat(e.target.value as StatOption)}
            >
              {STAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
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

      {/* Enlarged View */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="relative w-full h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-black/50">
              <div>
                <p className="text-sm font-semibold text-white">
                  {formatDate(selectedPhoto.date)}
                </p>
                <p className="text-xs text-white/60 uppercase">
                  {POSE_LABELS[selectedPhoto.pose]}
                  {selectedPhoto.weight && ` - ${selectedPhoto.weight} lbs`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const canvas = document.createElement('canvas');
                    const img = new Image();
                    img.onload = () => {
                      canvas.width = img.width;
                      canvas.height = img.height;
                      canvas.getContext('2d')!.drawImage(img, 0, 0);
                      shareOrDownload(canvas, `progress-${selectedPhoto.date}-${selectedPhoto.pose}.png`);
                    };
                    img.src = getImageSrc(selectedPhoto.imageData);
                  }}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                >
                  <Share2 size={20} />
                </button>
                <button
                  onClick={() => {
                    setDeleteId(selectedPhoto.id);
                  }}
                  className="p-2 rounded-lg hover:bg-danger/20 text-white/60 hover:text-danger transition-colors"
                >
                  <Trash2 size={20} />
                </button>
                <button
                  onClick={() => setSelectedPhoto(null)}
                  className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Image */}
            <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
              <img
                src={getImageSrc(selectedPhoto.imageData)}
                alt={`${selectedPhoto.pose} - ${selectedPhoto.date}`}
                className="max-w-full max-h-full object-contain rounded-xl"
              />
            </div>

            {/* Notes */}
            {selectedPhoto.notes && (
              <div className="px-4 pb-4">
                <p className="text-sm text-white/70 text-center">{selectedPhoto.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

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
