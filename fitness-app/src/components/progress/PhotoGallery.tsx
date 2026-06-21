import { useState, useMemo } from 'react';
import { X, Trash2, ImageIcon, Share2, ArrowLeftRight } from 'lucide-react';
import type { ProgressPhoto } from '../../types';
import { formatDate } from '../../utils/dateHelpers';
import { renderProgressCard, shareOrDownload } from '../../utils/shareCards';
import { ConfirmDialog } from '../shared/ConfirmDialog';

interface Props {
  photos: ProgressPhoto[];
  onDelete: (id: string) => void;
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

export function PhotoGallery({ photos, onDelete }: Props) {
  const [filter, setFilter] = useState<PoseFilter>('all');
  const [selectedPhoto, setSelectedPhoto] = useState<ProgressPhoto | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<ProgressPhoto[]>([]);
  const [sharing, setSharing] = useState(false);

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
        beforeWeight: before.weight ? `${before.weight} lbs` : undefined,
        afterWeight: after.weight ? `${after.weight} lbs` : undefined,
        pose: POSE_LABELS[before.pose] || before.pose,
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
              {compareMode && isSelected && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-accent text-white text-xs font-bold flex items-center justify-center">
                  {selIndex + 1}
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
        <button
          onClick={handleShareComparison}
          disabled={sharing}
          className="w-full bg-accent text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          <Share2 size={16} />
          {sharing ? 'Generating...' : 'Share Before & After'}
        </button>
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
