import { useState } from 'react';
import { Save } from 'lucide-react';
import { today } from '../../utils/dateHelpers';
import type { Measurement } from '../../types';

interface Props {
  onSave: (m: Omit<Measurement, 'id' | 'profileId'>) => void;
  weightUnit: 'lbs' | 'kg';
  measurementUnit: 'in' | 'cm';
}

const BODY_FIELDS: { key: keyof NonNullable<Measurement['measurements']>; label: string }[] = [
  { key: 'chest', label: 'Chest' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
  { key: 'leftArm', label: 'Left Arm' },
  { key: 'rightArm', label: 'Right Arm' },
  { key: 'leftThigh', label: 'Left Thigh' },
  { key: 'rightThigh', label: 'Right Thigh' },
  { key: 'neck', label: 'Neck' },
  { key: 'shoulders', label: 'Shoulders' },
];

export function MeasurementLog({ onSave, weightUnit, measurementUnit }: Props) {
  const [date, setDate] = useState(today());
  const [weight, setWeight] = useState('');
  const [bodyMeasurements, setBodyMeasurements] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [showBody, setShowBody] = useState(false);

  const updateBody = (key: string, value: string) => {
    setBodyMeasurements((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    const measurements: Measurement['measurements'] = {};
    let hasBodyMeasurement = false;
    for (const field of BODY_FIELDS) {
      const val = parseFloat(bodyMeasurements[field.key] || '');
      if (!isNaN(val) && val > 0) {
        measurements[field.key] = val;
        hasBodyMeasurement = true;
      }
    }

    const weightVal = parseFloat(weight);
    if (isNaN(weightVal) && !hasBodyMeasurement) return;

    onSave({
      date,
      weight: isNaN(weightVal) ? undefined : weightVal,
      weightUnit,
      measurements: hasBodyMeasurement ? measurements : undefined,
      notes: notes.trim() || undefined,
    });

    setWeight('');
    setBodyMeasurements({});
    setNotes('');
    setShowBody(false);
  };

  return (
    <div className="card space-y-4">
      <h3 className="font-bold text-sm uppercase tracking-wider text-text-secondary">
        Log Measurement
      </h3>

      <div>
        <label className="label mb-1.5 block">Date</label>
        <input
          type="date"
          className="input-field"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div>
        <label className="label mb-1.5 block">Weight ({weightUnit})</label>
        <input
          type="number"
          inputMode="decimal"
          className="input-field"
          placeholder={`e.g. ${weightUnit === 'lbs' ? '185' : '84'}`}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowBody(!showBody)}
        className="text-sm font-semibold text-accent-blue hover:text-accent-blue/80 transition-colors"
      >
        {showBody ? 'Hide' : 'Show'} Body Measurements
      </button>

      {showBody && (
        <div className="grid grid-cols-2 gap-3">
          {BODY_FIELDS.map((field) => (
            <div key={field.key}>
              <label className="label mb-1 block text-[10px]">
                {field.label} ({measurementUnit})
              </label>
              <input
                type="number"
                inputMode="decimal"
                className="input-field text-sm py-2.5"
                placeholder="--"
                value={bodyMeasurements[field.key] || ''}
                onChange={(e) => updateBody(field.key, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="label mb-1.5 block">Notes (optional)</label>
        <textarea
          className="input-field resize-none"
          rows={2}
          placeholder="How are you feeling?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <button onClick={handleSave} className="btn-primary w-full flex items-center justify-center gap-2">
        <Save size={18} />
        Save Measurement
      </button>
    </div>
  );
}
