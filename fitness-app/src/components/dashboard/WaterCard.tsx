import { useState, useMemo } from 'react';
import { Droplets, Plus, Minus } from 'lucide-react';
import type { WaterEntry } from '../../types';
import { today } from '../../utils/dateHelpers';
import { saveWaterEntry, deleteWaterEntry } from '../../db/water';

interface Props {
  water: WaterEntry[];
  profileId: string;
  units: 'imperial' | 'metric';
  onUpdate?: () => void;
}

const QUICK_ADD_OZ = [8, 16, 24];
const QUICK_ADD_ML = [250, 500, 750];
const GOAL_OZ = 128;
const GOAL_ML = 3785;

export function WaterCard({ water, profileId, units, onUpdate }: Props) {
  const [showCustom, setShowCustom] = useState(false);
  const [customAmount, setCustomAmount] = useState('');

  const isMetric = units === 'metric';
  const unitLabel = isMetric ? 'ml' : 'oz';
  const goal = isMetric ? GOAL_ML : GOAL_OZ;
  const quickAdds = isMetric ? QUICK_ADD_ML : QUICK_ADD_OZ;

  const todayEntries = useMemo(() => water.filter((w) => w.date === today()), [water]);
  const todayTotal = todayEntries.reduce((s, w) => {
    if (w.unit === unitLabel) return s + w.amount;
    if (w.unit === 'oz' && isMetric) return s + w.amount * 29.5735;
    if (w.unit === 'ml' && !isMetric) return s + w.amount / 29.5735;
    return s + w.amount;
  }, 0);

  const pct = Math.min((todayTotal / goal) * 100, 100);

  const addWater = async (amount: number) => {
    await saveWaterEntry({
      id: crypto.randomUUID(),
      profileId,
      date: today(),
      amount,
      unit: unitLabel as 'oz' | 'ml',
    });
    onUpdate?.();
  };

  const removeLast = async () => {
    const last = todayEntries[todayEntries.length - 1];
    if (last) {
      await deleteWaterEntry(last.id);
      onUpdate?.();
    }
  };

  const handleCustomAdd = () => {
    const val = parseFloat(customAmount);
    if (val > 0) {
      addWater(val);
      setCustomAmount('');
      setShowCustom(false);
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Droplets size={14} className="text-accent-blue" />
          <h2 className="label">Water</h2>
        </div>
        <span className="text-[10px] text-text-muted">Goal: {goal} {unitLabel}</span>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-3 rounded-full bg-surface-raised overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#2e9e6b' : '#5b6ef5' }}
          />
        </div>
        <span className="text-sm font-bold tabular-nums w-20 text-right">
          {Math.round(todayTotal)} <span className="text-text-muted text-xs font-normal">{unitLabel}</span>
        </span>
      </div>

      {/* Quick add buttons */}
      <div className="flex gap-2">
        {quickAdds.map((amount) => (
          <button
            key={amount}
            onClick={() => addWater(amount)}
            className="flex-1 bg-surface-raised rounded-lg py-2 text-xs font-semibold text-accent-blue flex items-center justify-center gap-1 active:scale-[0.95] transition-transform"
          >
            <Plus size={10} />{amount}{unitLabel}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(!showCustom)}
          className="bg-surface-raised rounded-lg py-2 px-3 text-xs font-semibold text-text-muted active:scale-[0.95] transition-transform"
        >
          ...
        </button>
        {todayEntries.length > 0 && (
          <button
            onClick={removeLast}
            className="bg-surface-raised rounded-lg py-2 px-2 text-xs text-text-muted active:scale-[0.95] transition-transform"
          >
            <Minus size={12} />
          </button>
        )}
      </div>

      {/* Custom amount */}
      {showCustom && (
        <div className="flex gap-2 mt-2">
          <input
            type="number"
            inputMode="numeric"
            className="input-field text-sm flex-1"
            placeholder={`Custom ${unitLabel}`}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleCustomAdd(); }}
          />
          <button onClick={handleCustomAdd} className="bg-accent-blue text-white px-4 rounded-lg text-xs font-semibold">Add</button>
        </div>
      )}
    </div>
  );
}
