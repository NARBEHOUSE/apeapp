import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Square, ImageIcon } from 'lucide-react';
import type { ProgressPhoto } from '../../types';
import { formatDate } from '../../utils/dateHelpers';

type Pose = 'front' | 'side_left' | 'side_right' | 'back';

interface Props {
  profileId: string;
  getPhotosByPose: (pose: string) => Promise<ProgressPhoto[]>;
}

const POSE_OPTIONS: { value: Pose; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'side_left', label: 'Side (Left)' },
  { value: 'side_right', label: 'Side (Right)' },
  { value: 'back', label: 'Back' },
];

function getImageSrc(imageData: string): string {
  if (imageData.startsWith('data:')) return imageData;
  return `data:image/jpeg;base64,${imageData}`;
}

export function TimeLapse({ profileId, getPhotosByPose }: Props) {
  const [selectedPose, setSelectedPose] = useState<Pose>('front');
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);

  // Load photos when pose changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPlaying(false);
    setCurrentIndex(0);
    imagesRef.current = [];

    getPhotosByPose(selectedPose).then((result) => {
      if (cancelled) return;
      const sorted = [...result].sort((a, b) => a.date.localeCompare(b.date));
      setPhotos(sorted);
      setLoading(false);

      // Preload all images
      sorted.forEach((photo, i) => {
        const img = new Image();
        img.src = getImageSrc(photo.imageData);
        imagesRef.current[i] = img;
      });
    });

    return () => { cancelled = true; };
  }, [selectedPose, getPhotosByPose, profileId]);

  const drawFrame = useCallback((index: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !photos[index]) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imagesRef.current[index];
    if (!img || !img.complete) return;

    // Set canvas size to match image aspect ratio
    const maxW = canvas.parentElement?.clientWidth || 400;
    const maxH = 400;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;

    // Draw image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Date overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    const overlayHeight = 36;
    ctx.fillRect(0, canvas.height - overlayHeight, canvas.width, overlayHeight);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      formatDate(photos[index].date),
      canvas.width / 2,
      canvas.height - 12
    );

    // Counter
    ctx.textAlign = 'right';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText(
      `${index + 1} / ${photos.length}`,
      canvas.width - 10,
      canvas.height - 14
    );
  }, [photos]);

  // Draw current frame whenever index changes
  useEffect(() => {
    if (photos.length > 0) {
      // Small delay to let preloaded image finish if needed
      const timer = setTimeout(() => drawFrame(currentIndex), 50);
      return () => clearTimeout(timer);
    }
  }, [currentIndex, photos, drawFrame]);

  // Playback interval
  useEffect(() => {
    if (playing && photos.length > 1) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          const next = prev + 1;
          if (next >= photos.length) {
            setPlaying(false);
            return prev;
          }
          return next;
        });
      }, 500);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [playing, photos.length]);

  const handlePlay = () => {
    if (currentIndex >= photos.length - 1) {
      setCurrentIndex(0);
    }
    setPlaying(true);
  };

  const handlePause = () => {
    setPlaying(false);
  };

  const handleStop = () => {
    setPlaying(false);
    setCurrentIndex(0);
  };

  return (
    <div className="space-y-4">
      {/* Pose Selector */}
      <div>
        <label className="label mb-1.5 block">Select Pose</label>
        <select
          value={selectedPose}
          onChange={(e) => setSelectedPose(e.target.value as Pose)}
          className="input-field"
        >
          {POSE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && photos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ImageIcon size={48} className="text-text-muted mb-4" />
          <p className="text-text-secondary text-sm">
            No photos for this pose yet
          </p>
          <p className="text-text-muted text-xs mt-1">
            Take progress photos to create a time lapse
          </p>
        </div>
      )}

      {!loading && photos.length > 0 && (
        <>
          {/* Canvas */}
          <div className="card flex items-center justify-center overflow-hidden">
            <canvas
              ref={canvasRef}
              className="rounded-lg max-w-full"
            />
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-blue rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / photos.length) * 100}%` }}
            />
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handleStop}
              disabled={currentIndex === 0 && !playing}
              className="p-3 rounded-xl bg-surface-raised border border-border-light text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors"
            >
              <Square size={20} />
            </button>

            {playing ? (
              <button
                onClick={handlePause}
                className="p-4 rounded-full bg-accent-blue text-white active:scale-95 transition-transform"
              >
                <Pause size={24} />
              </button>
            ) : (
              <button
                onClick={handlePlay}
                disabled={photos.length < 2}
                className="p-4 rounded-full bg-accent-blue text-white active:scale-95 transition-transform disabled:opacity-30"
              >
                <Play size={24} />
              </button>
            )}

            <div className="p-3 text-text-secondary text-sm font-semibold tabular-nums min-w-[60px] text-center">
              {currentIndex + 1}/{photos.length}
            </div>
          </div>

          {/* Photo date info */}
          {photos[currentIndex] && (
            <p className="text-center text-xs text-text-secondary">
              {formatDate(photos[currentIndex].date)}
              {photos[currentIndex].weight && ` - ${photos[currentIndex].weight} lbs`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
