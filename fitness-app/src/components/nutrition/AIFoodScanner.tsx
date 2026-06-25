import { useState, useRef, useCallback } from 'react';
import { Camera, Loader2, Check, AlertTriangle, Edit3, StickyNote } from 'lucide-react';
import { analyzeFood } from '../../utils/claudeVision';
import { getApiKey } from '../../utils/apiKeyManager';
import type { FoodEntry } from '../../types';

type MealType = FoodEntry['mealType'];

interface DetectedFood {
  name: string;
  estimatedAmount: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

interface AIFoodScannerProps {
  onAdd: (entry: Omit<FoodEntry, 'id' | 'profileId' | 'loggedAt'>) => void;
  onClose: () => void;
}

function compressImage(file: File, maxWidth: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
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
          reject(new Error('Could not get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        // Strip the data:image/jpeg;base64, prefix
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function AIFoodScanner({ onAdd, onClose }: AIFoodScannerProps) {
  const apiKey = getApiKey();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [foods, setFoods] = useState<DetectedFood[]>([]);
  const [error, setError] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [disclaimer, setDisclaimer] = useState('');
  const [userNotes, setUserNotes] = useState('');

  const mealTypes: { value: MealType; label: string }[] = [
    { value: 'breakfast', label: 'Breakfast' },
    { value: 'lunch', label: 'Lunch' },
    { value: 'dinner', label: 'Dinner' },
    { value: 'snack', label: 'Snack' },
  ];

  const confidenceColor = (c: string) => {
    switch (c) {
      case 'high': return '#2e9e6b';
      case 'medium': return '#f5a623';
      case 'low': return '#e85757';
      default: return '#888';
    }
  };

  if (!apiKey) {
    return (
      <div className="text-center py-8 space-y-3">
        <Camera size={40} className="mx-auto text-text-muted" />
        <h4 className="text-lg font-bold">AI Food Scanner</h4>
        <p className="text-text-secondary text-sm max-w-xs mx-auto">
          Add your AI API key in Settings to enable AI-powered food scanning.
        </p>
        <button type="button" onClick={onClose} className="btn-secondary mt-4">
          Close
        </button>
      </div>
    );
  }

  const handleCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    setFoods([]);
    setError('');
    setAnalyzing(true);

    try {
      const base64 = await compressImage(file, 800);
      const result = await analyzeFood(base64, apiKey, userNotes);
      setFoods(result.foods);
      setDisclaimer(result.disclaimer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }, [apiKey, userNotes]);

  function updateFood(idx: number, field: keyof DetectedFood, value: string | number) {
    setFoods((prev) =>
      prev.map((f, i) =>
        i === idx ? { ...f, [field]: typeof f[field] === 'number' ? Number(value) : value } : f
      )
    );
  }

  function addFood(food: DetectedFood) {
    const today = new Date().toISOString().split('T')[0];
    onAdd({
      date: today,
      name: food.name,
      servingSize: 1,
      servingUnit: 'serving',
      servingsConsumed: 1,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      source: 'ai_vision',
      mealType,
    });
  }

  function addAll() {
    foods.forEach((food) => addFood(food));
    onClose();
  }

  // Pre-capture view
  if (!preview) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8 space-y-4">
          <Camera size={48} className="mx-auto text-nutrition" />
          <h4 className="text-lg font-bold">Snap Your Food</h4>
          <p className="text-text-secondary text-sm max-w-xs mx-auto">
            Take a photo of your meal and AI will estimate the nutrition content.
          </p>
          <div className="w-full max-w-xs mx-auto text-left">
            <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary mb-1.5">
              <StickyNote size={12} />
              Notes for AI
              <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <textarea
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              placeholder="e.g. beef is 90/10, dressing on the side, extra cheese..."
              rows={2}
              className="input-field text-sm w-full resize-none"
            />
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary px-6 py-3"
          >
            <Camera size={18} className="inline mr-2" />
            Take Photo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleCapture}
            className="hidden"
          />
          <p className="text-xs text-text-muted">~$0.003 per photo</p>
        </div>
      </div>
    );
  }

  // Analysis / results view
  return (
    <div className="space-y-4">
      {/* Image preview */}
      <div className="relative rounded-xl overflow-hidden">
        <img
          src={preview}
          alt="Food"
          className="w-full max-h-48 object-cover"
        />
        {analyzing && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-center space-y-2">
              <Loader2 size={32} className="animate-spin mx-auto text-nutrition" />
              <p className="text-sm text-text-primary">Analyzing food...</p>
            </div>
          </div>
        )}
      </div>

      {/* Retake button */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setPreview(null);
            setFoods([]);
            setError('');
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
          className="text-sm text-accent-blue"
        >
          Retake photo
        </button>
      </div>

      {/* User notes */}
      {userNotes && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-surface-raised border border-border">
          <StickyNote size={13} className="text-text-muted flex-shrink-0 mt-0.5" />
          <p className="text-xs text-text-secondary italic">{userNotes}</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="hidden"
      />

      {error && (
        <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Meal type */}
      {foods.length > 0 && (
        <div>
          <label className="label">Meal</label>
          <div className="grid grid-cols-4 gap-2">
            {mealTypes.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMealType(m.value)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  mealType === m.value
                    ? 'bg-accent-orange/20 text-accent-orange border border-accent-orange/40'
                    : 'bg-surface-raised text-text-secondary border border-border hover:border-border-light'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Detected foods */}
      {foods.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-text-secondary">Detected Foods</h4>
          {foods.map((food, idx) => (
            <div key={idx} className="card-raised p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-text-primary">{food.name}</div>
                  <div className="text-xs text-text-secondary">{food.estimatedAmount}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      color: confidenceColor(food.confidence),
                      backgroundColor: confidenceColor(food.confidence) + '20',
                    }}
                  >
                    {food.confidence}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}
                    className="p-1 rounded hover:bg-surface text-text-secondary"
                  >
                    <Edit3 size={14} />
                  </button>
                </div>
              </div>

              {/* Editable macros */}
              {editingIdx === idx ? (
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="text-xs text-text-muted">Cal</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="input-field text-xs py-1"
                      value={food.calories}
                      onChange={(e) => updateFood(idx, 'calories', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted">Protein</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="input-field text-xs py-1"
                      value={food.protein}
                      onChange={(e) => updateFood(idx, 'protein', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted">Carbs</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="input-field text-xs py-1"
                      value={food.carbs}
                      onChange={(e) => updateFood(idx, 'carbs', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted">Fat</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      className="input-field text-xs py-1"
                      value={food.fat}
                      onChange={(e) => updateFood(idx, 'fat', e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 text-xs text-text-secondary">
                  <span>{food.calories} kcal</span>
                  <span>P {food.protein}g</span>
                  <span>C {food.carbs}g</span>
                  <span>F {food.fat}g</span>
                </div>
              )}

              {food.notes && (
                <p className="text-xs text-text-muted italic">{food.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      {disclaimer && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-nutrition/10 border border-nutrition/20">
          <AlertTriangle size={14} className="text-nutrition flex-shrink-0 mt-0.5" />
          <p className="text-xs text-text-secondary">{disclaimer}</p>
        </div>
      )}

      {/* Actions */}
      {foods.length > 0 && (
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button type="button" onClick={addAll} className="btn-primary flex-1">
            <Check size={16} className="inline mr-1" />
            Add All ({foods.length})
          </button>
        </div>
      )}
    </div>
  );
}
