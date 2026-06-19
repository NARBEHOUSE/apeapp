import { useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import type { Exercise, ExerciseProgressionConfig, WeeklyTarget } from '../../types';
import {
  getGoalDefaults,
  isCompoundExercise,
  calculateWeeklyTargets,
  generateBlankTargets,
  formatProgressionLabel,
  type ExerciseProgression,
} from '../../utils/progression';

interface Props {
  exercise: Exercise;
  goalType: string;
  durationWeeks: number;
  onUpdate: (updates: Partial<Exercise>) => void;
}

export function ProgressionEditor({ exercise, goalType, durationWeeks, onUpdate }: Props) {
  const [showWeeks, setShowWeeks] = useState(false);
  const prog = exercise.progression;

  const autoGenerate = () => {
    const compound = exercise.name ? isCompoundExercise(exercise.name) : true;
    const defaults = getGoalDefaults(goalType, compound);
    onUpdate({
      progression: defaults.progression as ExerciseProgressionConfig,
      sets: defaults.sets,
      reps: defaults.reps,
      weeklyTargets: undefined,
    });
  };

  if (!prog) {
    return (
      <button
        onClick={autoGenerate}
        className="w-full py-2 rounded-lg border border-dashed border-text-muted/30 text-text-muted text-xs font-medium hover:border-text-secondary hover:text-text-secondary transition-colors"
      >
        + Add Progression Plan
      </button>
    );
  }

  const isCustom = prog.type === 'custom';

  const calculatedTargets =
    !isCustom && exercise.startingWeight != null
      ? calculateWeeklyTargets(
          prog as ExerciseProgression,
          exercise.startingWeight,
          exercise.sets,
          durationWeeks,
        )
      : [];

  const storedTargets = exercise.weeklyTargets;
  const displayTargets = storedTargets || calculatedTargets;
  const hasTargets = displayTargets.length > 0;
  const isEditable = isCustom || !!storedTargets;

  const handleTypeChange = (type: ExerciseProgressionConfig['type']) => {
    if (type === 'custom') {
      const targets =
        calculatedTargets.length > 0
          ? calculatedTargets
          : generateBlankTargets(
              durationWeeks,
              exercise.sets,
              parseInt(exercise.reps) || 10,
              exercise.startingWeight || 0,
            );
      onUpdate({
        progression: { ...prog, type },
        weeklyTargets: targets,
      });
      setShowWeeks(true);
    } else {
      onUpdate({
        progression: { ...prog, type },
        weeklyTargets: undefined,
      });
    }
  };

  const customizeWeeks = () => {
    onUpdate({ weeklyTargets: [...calculatedTargets] });
    setShowWeeks(true);
  };

  const recalculate = () => {
    if (isCustom) return;
    onUpdate({ weeklyTargets: undefined });
  };

  const updateWeek = (weekIndex: number, field: keyof WeeklyTarget, value: any) => {
    const targets = [...(storedTargets || calculatedTargets)];
    targets[weekIndex] = { ...targets[weekIndex], [field]: value };
    onUpdate({ weeklyTargets: targets });
  };

  const addWeek = () => {
    const targets = [...(storedTargets || calculatedTargets)];
    const last = targets[targets.length - 1];
    targets.push({
      week: targets.length + 1,
      sets: last?.sets || exercise.sets,
      reps: last?.reps || parseInt(exercise.reps) || 10,
      weight: last?.weight || exercise.startingWeight || 0,
      isDeload: false,
    });
    onUpdate({ weeklyTargets: targets });
  };

  const removeWeek = () => {
    const targets = [...(storedTargets || calculatedTargets)];
    if (targets.length <= 1) return;
    targets.pop();
    onUpdate({ weeklyTargets: targets });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="label">Progression</label>
        <button
          onClick={() => onUpdate({ progression: undefined, weeklyTargets: undefined })}
          className="text-[10px] text-text-muted hover:text-danger"
        >
          Remove
        </button>
      </div>

      <div className="bg-surface-raised rounded-lg p-2.5 space-y-2">
        {/* Type selector */}
        <div>
          <label className="text-[9px] text-text-muted mb-0.5 block">Type</label>
          <select
            className="input-field text-xs py-1.5"
            value={prog.type}
            onChange={(e) => handleTypeChange(e.target.value as ExerciseProgressionConfig['type'])}
          >
            <option value="linear">Linear (+weight/wk)</option>
            <option value="double_progression">Double Prog (reps then weight)</option>
            <option value="custom">Custom (manual week-by-week)</option>
          </select>
        </div>

        {/* Config fields — hidden for custom */}
        {!isCustom && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-text-muted mb-0.5 block">+lbs / week</label>
                <input
                  type="number"
                  inputMode="decimal"
                  className="input-field text-xs py-1.5"
                  value={prog.weeklyWeightIncrement}
                  onChange={(e) =>
                    onUpdate({
                      progression: { ...prog, weeklyWeightIncrement: parseFloat(e.target.value) || 0 },
                      weeklyTargets: undefined,
                    })
                  }
                  step={2.5}
                />
              </div>
              {prog.type === 'double_progression' ? (
                <div className="grid grid-cols-2 gap-1">
                  <div>
                    <label className="text-[9px] text-text-muted mb-0.5 block">Rep min</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="input-field text-xs py-1.5"
                      value={prog.repRangeMin}
                      onChange={(e) =>
                        onUpdate({
                          progression: { ...prog, repRangeMin: parseInt(e.target.value) || 1 },
                          weeklyTargets: undefined,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-text-muted mb-0.5 block">Rep max</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      className="input-field text-xs py-1.5"
                      value={prog.repRangeMax}
                      onChange={(e) =>
                        onUpdate({
                          progression: { ...prog, repRangeMax: parseInt(e.target.value) || 1 },
                          weeklyTargets: undefined,
                        })
                      }
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-[9px] text-text-muted mb-0.5 block">Target reps</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="input-field text-xs py-1.5"
                    value={prog.repRangeMin}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 1;
                      onUpdate({
                        progression: { ...prog, repRangeMin: v, repRangeMax: v },
                        weeklyTargets: undefined,
                      });
                    }}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-text-muted mb-0.5 block">Deload every (wks)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input-field text-xs py-1.5"
                  value={prog.deloadFrequency}
                  onChange={(e) =>
                    onUpdate({
                      progression: { ...prog, deloadFrequency: parseInt(e.target.value) || 0 },
                      weeklyTargets: undefined,
                    })
                  }
                  placeholder="0 = never"
                />
              </div>
              <div>
                <label className="text-[9px] text-text-muted mb-0.5 block">Deload reduce %</label>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input-field text-xs py-1.5"
                  value={prog.deloadPercent}
                  onChange={(e) =>
                    onUpdate({
                      progression: { ...prog, deloadPercent: Math.min(100, parseInt(e.target.value) || 0) },
                      weeklyTargets: undefined,
                    })
                  }
                />
              </div>
            </div>
          </>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isCustom && (
            <button onClick={autoGenerate} className="text-[10px] text-text-muted hover:text-text-secondary">
              Reset defaults
            </button>
          )}
          {!isCustom && calculatedTargets.length > 0 && !storedTargets && (
            <button onClick={customizeWeeks} className="text-[10px] text-accent-blue hover:underline">
              Customize weeks
            </button>
          )}
          {storedTargets && !isCustom && (
            <button onClick={recalculate} className="text-[10px] text-accent-blue hover:underline flex items-center gap-0.5">
              <RotateCcw size={9} /> Recalculate
            </button>
          )}
        </div>

        {/* Week editor / preview */}
        {hasTargets && (
          <div>
            <button
              onClick={() => setShowWeeks(!showWeeks)}
              className="text-[10px] text-text-secondary font-medium flex items-center gap-1"
            >
              {showWeeks ? 'Hide' : isEditable ? 'Edit' : 'Show'} weeks ({displayTargets.length})
              {showWeeks ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>

            {showWeeks && (
              <div className="mt-1.5 space-y-1">
                {/* Header */}
                <div className="grid grid-cols-[2rem_1fr_1fr_1fr_2rem] gap-1 px-0.5">
                  <span className="text-[8px] text-text-muted text-center">Wk</span>
                  <span className="text-[8px] text-text-muted">Sets</span>
                  <span className="text-[8px] text-text-muted">Reps</span>
                  <span className="text-[8px] text-text-muted">Weight</span>
                  <span className="text-[8px] text-text-muted text-center">DL</span>
                </div>

                {/* Rows */}
                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {displayTargets.map((t, i) => (
                    <div
                      key={t.week}
                      className={`grid grid-cols-[2rem_1fr_1fr_1fr_2rem] gap-1 items-center px-0.5 rounded ${
                        t.isDeload ? 'bg-[#f5a623]/10' : ''
                      }`}
                    >
                      <span className={`text-[10px] text-center font-mono ${t.isDeload ? 'text-[#f5a623]' : 'text-text-muted'}`}>
                        {t.week}
                      </span>
                      {isEditable ? (
                        <>
                          <input
                            type="number"
                            inputMode="numeric"
                            className="input-field text-[10px] py-1 px-1.5 text-center"
                            value={t.sets}
                            onChange={(e) => updateWeek(i, 'sets', parseInt(e.target.value) || 1)}
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            className="input-field text-[10px] py-1 px-1.5 text-center"
                            value={t.reps}
                            onChange={(e) => updateWeek(i, 'reps', parseInt(e.target.value) || 1)}
                          />
                          <input
                            type="number"
                            inputMode="decimal"
                            className="input-field text-[10px] py-1 px-1.5 text-center"
                            value={t.weight}
                            onChange={(e) => updateWeek(i, 'weight', parseFloat(e.target.value) || 0)}
                            step={2.5}
                          />
                          <div className="flex justify-center">
                            <input
                              type="checkbox"
                              checked={t.isDeload}
                              onChange={(e) => updateWeek(i, 'isDeload', e.target.checked)}
                              className="w-3.5 h-3.5 rounded accent-[#f5a623]"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="text-[10px] text-text-secondary text-center">{t.sets}</span>
                          <span className="text-[10px] text-text-secondary text-center">{t.reps}</span>
                          <span className="text-[10px] text-text-secondary text-center">{t.weight}</span>
                          <span className="text-[10px] text-center">{t.isDeload ? '↓' : ''}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add/remove week for editable */}
                {isEditable && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={addWeek}
                      className="text-[10px] text-text-muted hover:text-text-secondary px-2 py-0.5 rounded bg-surface"
                    >
                      + Week
                    </button>
                    {displayTargets.length > 1 && (
                      <button
                        onClick={removeWeek}
                        className="text-[10px] text-text-muted hover:text-danger px-2 py-0.5 rounded bg-surface"
                      >
                        - Week
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!hasTargets && exercise.startingWeight == null && !isCustom && (
          <p className="text-[9px] text-text-muted italic">
            Set a starting weight above to see the week-by-week preview
          </p>
        )}
      </div>
    </div>
  );
}
