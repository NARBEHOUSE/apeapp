import { useState, useRef, useCallback } from 'react';
import { Camera, RotateCcw, Check, X } from 'lucide-react';

type Pose = 'front' | 'side_left' | 'side_right' | 'back';

interface PhotoData {
  date: string;
  time: string;
  pose: Pose;
  imageData: string;
  weight?: number;
  notes?: string;
}

interface Props {
  onSave: (photo: PhotoData) => void;
  onClose: () => void;
}

const POSES: { value: Pose; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'side_left', label: 'Side (L)' },
  { value: 'side_right', label: 'Side (R)' },
  { value: 'back', label: 'Back' },
];

const POSE_INSTRUCTIONS: Record<Pose, string[]> = {
  front: [
    'Stand 6 feet from phone',
    'Feet shoulder width apart',
    'Arms slightly away from body',
    'Face camera directly',
  ],
  side_left: [
    'Stand 6 feet from phone',
    'Turn left side toward camera',
    'Arms relaxed at sides',
    'Stand naturally upright',
  ],
  side_right: [
    'Stand 6 feet from phone',
    'Turn right side toward camera',
    'Arms relaxed at sides',
    'Stand naturally upright',
  ],
  back: [
    'Stand 6 feet from phone',
    'Face away from camera',
    'Feet shoulder width apart',
    'Arms slightly away from body',
  ],
};

async function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxWidth = 800;
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context failed'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', 0.8);
      // Strip the data:image/jpeg;base64, prefix to store raw base64
      const base64 = compressed.split(',')[1];
      resolve(base64);
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
}

export function PhotoCapture({ onSave, onClose }: Props) {
  const [pose, setPose] = useState<Pose>('front');
  const [preview, setPreview] = useState<string | null>(null);
  const [compressedBase64, setCompressedBase64] = useState<string | null>(null);
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessing(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setPreview(dataUrl);
      try {
        const base64 = await compressImage(dataUrl);
        setCompressedBase64(base64);
      } catch {
        // Fallback: use original data URL minus prefix
        const fallback = dataUrl.split(',')[1];
        setCompressedBase64(fallback);
      }
      setProcessing(false);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleRetake = () => {
    setPreview(null);
    setCompressedBase64(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleAccept = () => {
    if (!compressedBase64) return;
    const now = new Date();
    const weightVal = parseFloat(weight);

    onSave({
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      pose,
      imageData: compressedBase64,
      weight: isNaN(weightVal) ? undefined : weightVal,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="space-y-5">
      {/* Pose Selector */}
      <div>
        <label className="label mb-2 block">Pose</label>
        <div className="grid grid-cols-4 gap-2">
          {POSES.map((p) => (
            <button
              key={p.value}
              onClick={() => setPose(p.value)}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors ${
                pose === p.value
                  ? 'bg-accent-blue text-white'
                  : 'bg-surface-raised text-text-secondary border border-border-light'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Instructions */}
      {!preview && (
        <div className="card-raised">
          <p className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">
            Guide - {POSES.find((p) => p.value === pose)?.label}
          </p>
          <ul className="space-y-1">
            {POSE_INSTRUCTIONS[pose].map((instruction, i) => (
              <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                <span className="text-accent-orange mt-0.5">&#8226;</span>
                {instruction}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Camera Input */}
      {!preview && (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCapture}
            className="hidden"
            id="photo-capture"
          />
          <label
            htmlFor="photo-capture"
            className="btn-primary w-full flex items-center justify-center gap-2 cursor-pointer"
          >
            <Camera size={18} />
            {processing ? 'Processing...' : 'Take Photo'}
          </label>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="space-y-4">
          <div className="relative rounded-xl overflow-hidden border border-border-light">
            <img
              src={preview}
              alt={`${pose} pose preview`}
              className="w-full object-contain max-h-80"
            />
            <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-lg font-semibold uppercase">
              {POSES.find((p) => p.value === pose)?.label}
            </div>
          </div>

          {/* Accept / Retake */}
          <div className="flex gap-3">
            <button
              onClick={handleRetake}
              className="btn-secondary flex-1 flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} />
              Retake
            </button>
            <button
              onClick={() => {}}
              className="btn-primary flex-1 flex items-center justify-center gap-2 opacity-0 pointer-events-none"
              aria-hidden
            >
              placeholder
            </button>
          </div>

          {/* Optional Fields */}
          <div>
            <label className="label mb-1.5 block">Weight (optional)</label>
            <input
              type="number"
              inputMode="decimal"
              className="input-field"
              placeholder="Current weight"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>

          <div>
            <label className="label mb-1.5 block">Notes (optional)</label>
            <textarea
              className="input-field resize-none"
              rows={2}
              placeholder="Any notes about this photo"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Final Save */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="btn-secondary flex-1 flex items-center justify-center gap-2"
            >
              <X size={16} />
              Cancel
            </button>
            <button
              onClick={handleAccept}
              disabled={!compressedBase64}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Check size={16} />
              Save Photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
