import { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Target,
  Dumbbell,
  Flame,
  RefreshCw,
  Zap,
  Wrench,
  AlertTriangle,
  Check,
  Calendar,
  Layers,
  ClipboardList,
  Eye,
} from 'lucide-react';
import type {
  Program,
  ProgramGoal,
  TrainingBlock,
  WorkoutDay,
  Exercise,
  CycleType,
} from '../../types';

interface Props {
  onSave: (program: Program) => void;
  onClose: () => void;
}

const ACCENT_COLORS = [
  '#e8572a',
  '#2e9e6b',
  '#5b6ef5',
  '#1a7a52',
  '#c44fc4',
  '#f5a623',
];

const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Core',
  'Full Body',
];

const GOAL_OPTIONS: { type: ProgramGoal['type']; label: string; icon: typeof Target }[] = [
  { type: 'strength', label: 'Strength', icon: Dumbbell },
  { type: 'hypertrophy', label: 'Hypertrophy', icon: Flame },
  { type: 'endurance', label: 'Endurance', icon: RefreshCw },
  { type: 'recomp', label: 'Recomp', icon: Zap },
  { type: 'powerbuilding', label: 'Powerbuilding', icon: Target },
  { type: 'custom', label: 'Custom', icon: Wrench },
];

const DURATION_PRESETS = [4, 8, 12, 16];
const DAYS_PER_WEEK_OPTIONS = [3, 4, 5, 6];

const SPLIT_SUGGESTIONS: Record<number, string[]> = {
  3: ['Full Body', 'Push Pull Legs', 'Custom'],
  4: ['Upper Lower', 'Push Pull', 'Custom'],
  5: ['Upper Lower + Full', 'Bro Split', 'Custom'],
  6: ['PPL 2x', 'Arnold Split', 'Custom'],
};

function getSplitDayLabels(
  split: string,
  daysPerWeek: number
): { label: string; tag: string; title: string; subtitle: string }[] {
  switch (split) {
    case 'Full Body':
      return Array.from({ length: daysPerWeek }, (_, i) => ({
        label: `D${i + 1}`,
        tag: 'FULL',
        title: `Full Body ${String.fromCharCode(65 + i)}`,
        subtitle: 'Full Body',
      }));
    case 'Push Pull Legs':
      return [
        { label: 'D1', tag: 'PUSH', title: 'Push', subtitle: 'Chest, Shoulders, Triceps' },
        { label: 'D2', tag: 'PULL', title: 'Pull', subtitle: 'Back, Biceps' },
        { label: 'D3', tag: 'LEGS', title: 'Legs', subtitle: 'Quads, Hamstrings, Glutes' },
      ];
    case 'Upper Lower':
      return [
        { label: 'D1', tag: 'UPPER', title: 'Upper A', subtitle: 'Chest, Back, Shoulders, Arms' },
        { label: 'D2', tag: 'LOWER', title: 'Lower A', subtitle: 'Quads, Hamstrings, Glutes, Calves' },
        { label: 'D3', tag: 'UPPER', title: 'Upper B', subtitle: 'Chest, Back, Shoulders, Arms' },
        { label: 'D4', tag: 'LOWER', title: 'Lower B', subtitle: 'Quads, Hamstrings, Glutes, Calves' },
      ];
    case 'Push Pull':
      return [
        { label: 'D1', tag: 'PUSH', title: 'Push A', subtitle: 'Chest, Shoulders, Triceps' },
        { label: 'D2', tag: 'PULL', title: 'Pull A', subtitle: 'Back, Biceps, Rear Delts' },
        { label: 'D3', tag: 'PUSH', title: 'Push B', subtitle: 'Chest, Shoulders, Triceps' },
        { label: 'D4', tag: 'PULL', title: 'Pull B', subtitle: 'Back, Biceps, Rear Delts' },
      ];
    case 'Upper Lower + Full':
      return [
        { label: 'D1', tag: 'UPPER', title: 'Upper', subtitle: 'Chest, Back, Shoulders, Arms' },
        { label: 'D2', tag: 'LOWER', title: 'Lower', subtitle: 'Quads, Hamstrings, Glutes, Calves' },
        { label: 'D3', tag: 'UPPER', title: 'Upper B', subtitle: 'Chest, Back, Shoulders, Arms' },
        { label: 'D4', tag: 'LOWER', title: 'Lower B', subtitle: 'Quads, Hamstrings, Glutes, Calves' },
        { label: 'D5', tag: 'FULL', title: 'Full Body', subtitle: 'Full Body' },
      ];
    case 'Bro Split':
      return [
        { label: 'D1', tag: 'CHEST', title: 'Chest', subtitle: 'Chest' },
        { label: 'D2', tag: 'BACK', title: 'Back', subtitle: 'Back, Rear Delts' },
        { label: 'D3', tag: 'SHLD', title: 'Shoulders', subtitle: 'Shoulders, Traps' },
        { label: 'D4', tag: 'LEGS', title: 'Legs', subtitle: 'Quads, Hamstrings, Glutes, Calves' },
        { label: 'D5', tag: 'ARMS', title: 'Arms', subtitle: 'Biceps, Triceps, Forearms' },
      ];
    case 'PPL 2x':
      return [
        { label: 'D1', tag: 'PUSH', title: 'Push A', subtitle: 'Chest, Shoulders, Triceps' },
        { label: 'D2', tag: 'PULL', title: 'Pull A', subtitle: 'Back, Biceps' },
        { label: 'D3', tag: 'LEGS', title: 'Legs A', subtitle: 'Quads, Hamstrings, Glutes' },
        { label: 'D4', tag: 'PUSH', title: 'Push B', subtitle: 'Chest, Shoulders, Triceps' },
        { label: 'D5', tag: 'PULL', title: 'Pull B', subtitle: 'Back, Biceps' },
        { label: 'D6', tag: 'LEGS', title: 'Legs B', subtitle: 'Quads, Hamstrings, Glutes' },
      ];
    case 'Arnold Split':
      return [
        { label: 'D1', tag: 'CH/BK', title: 'Chest & Back', subtitle: 'Chest, Back' },
        { label: 'D2', tag: 'SH/AR', title: 'Shoulders & Arms', subtitle: 'Shoulders, Biceps, Triceps' },
        { label: 'D3', tag: 'LEGS', title: 'Legs', subtitle: 'Quads, Hamstrings, Glutes, Calves' },
        { label: 'D4', tag: 'CH/BK', title: 'Chest & Back B', subtitle: 'Chest, Back' },
        { label: 'D5', tag: 'SH/AR', title: 'Shoulders & Arms B', subtitle: 'Shoulders, Biceps, Triceps' },
        { label: 'D6', tag: 'LEGS', title: 'Legs B', subtitle: 'Quads, Hamstrings, Glutes, Calves' },
      ];
    default:
      return Array.from({ length: daysPerWeek }, (_, i) => ({
        label: `D${i + 1}`,
        tag: 'CUSTOM',
        title: `Day ${i + 1}`,
        subtitle: '',
      }));
  }
}

function getBlockPresets(
  goalType: ProgramGoal['type']
): { label: string; blocks: Omit<TrainingBlock, 'id'>[] }[] {
  switch (goalType) {
    case 'hypertrophy':
      return [
        {
          label: 'Accumulation / Intensification / Deload',
          blocks: [
            { name: 'Accumulation', cycleType: 'mesocycle', weeks: 4, focus: 'High volume, moderate intensity', intensityPercent: 65 },
            { name: 'Intensification', cycleType: 'mesocycle', weeks: 4, focus: 'Lower volume, heavier loads', intensityPercent: 80 },
            { name: 'Deload', cycleType: 'microcycle', weeks: 1, focus: 'Recovery, reduced volume & intensity', intensityPercent: 50 },
          ],
        },
        { label: 'No periodization', blocks: [] },
      ];
    case 'strength':
      return [
        {
          label: 'Volume / Intensity / Peak / Deload',
          blocks: [
            { name: 'Volume', cycleType: 'mesocycle', weeks: 3, focus: 'Build work capacity with moderate loads', intensityPercent: 70 },
            { name: 'Intensity', cycleType: 'mesocycle', weeks: 3, focus: 'Increase loads, reduce volume', intensityPercent: 85 },
            { name: 'Peak', cycleType: 'mesocycle', weeks: 2, focus: 'Near-max loads, minimal volume', intensityPercent: 95 },
            { name: 'Deload', cycleType: 'microcycle', weeks: 1, focus: 'Active recovery', intensityPercent: 50 },
          ],
        },
        { label: 'No periodization', blocks: [] },
      ];
    case 'powerbuilding':
      return [
        {
          label: 'Hypertrophy / Strength / Peak / Deload',
          blocks: [
            { name: 'Hypertrophy Phase', cycleType: 'mesocycle', weeks: 4, focus: 'Higher volume accessories, moderate compounds', intensityPercent: 70 },
            { name: 'Strength Phase', cycleType: 'mesocycle', weeks: 3, focus: 'Heavier compounds, moderate accessories', intensityPercent: 85 },
            { name: 'Peak', cycleType: 'mesocycle', weeks: 2, focus: 'Max effort compounds', intensityPercent: 95 },
            { name: 'Deload', cycleType: 'microcycle', weeks: 1, focus: 'Recovery', intensityPercent: 50 },
          ],
        },
        { label: 'No periodization', blocks: [] },
      ];
    case 'recomp':
      return [
        {
          label: 'Build / Cut / Maintain',
          blocks: [
            { name: 'Build Phase', cycleType: 'mesocycle', weeks: 4, focus: 'Progressive overload, caloric surplus', intensityPercent: 75 },
            { name: 'Cut Phase', cycleType: 'mesocycle', weeks: 4, focus: 'Maintain strength, caloric deficit', intensityPercent: 70 },
            { name: 'Maintain', cycleType: 'mesocycle', weeks: 2, focus: 'Maintenance calories, moderate training', intensityPercent: 65 },
          ],
        },
        { label: 'No periodization', blocks: [] },
      ];
    default:
      return [{ label: 'No periodization', blocks: [] }];
  }
}

const STEP_LABELS = ['Overview', 'Structure', 'Blocks', 'Build Days', 'Review'];
const STEP_ICONS = [ClipboardList, Calendar, Layers, Dumbbell, Eye];

export function ProgramCreator({ onSave, onClose }: Props) {
  const [step, setStep] = useState(0);

  // Step 1: Overview
  const [programName, setProgramName] = useState('');
  const [goalType, setGoalType] = useState<ProgramGoal['type']>('hypertrophy');
  const [goalDescription, setGoalDescription] = useState('');
  const [targetMetric, setTargetMetric] = useState('');

  // Step 2: Structure
  const [durationWeeks, setDurationWeeks] = useState(8);
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [split, setSplit] = useState('');

  // Step 3: Blocks
  const [blocks, setBlocks] = useState<TrainingBlock[]>([]);

  // Step 4: Days
  const [days, setDays] = useState<WorkoutDay[]>([]);
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  // Derived
  const totalBlockWeeks = blocks.reduce((sum, b) => sum + b.weeks, 0);
  const blockWeeksMismatch = blocks.length > 0 && totalBlockWeeks !== durationWeeks;

  const availableSplits = SPLIT_SUGGESTIONS[daysPerWeek] || ['Custom'];

  // When split changes, regenerate days
  const applyStructure = (newSplit: string, newDaysPerWeek: number) => {
    setSplit(newSplit);
    const dayDefs = getSplitDayLabels(newSplit, newDaysPerWeek);
    setDays(
      dayDefs.map((d, i) => ({
        id: crypto.randomUUID(),
        label: d.label,
        tag: d.tag,
        title: d.title,
        subtitle: d.subtitle,
        accent: ACCENT_COLORS[i % ACCENT_COLORS.length],
        note: '',
        exercises: [],
      }))
    );
    setActiveDayIndex(0);
  };

  const applyBlockPreset = (presetBlocks: Omit<TrainingBlock, 'id'>[]) => {
    setBlocks(
      presetBlocks.map((b) => ({
        ...b,
        id: crypto.randomUUID(),
      }))
    );
  };

  // Day editing
  const updateDay = (dayId: string, updates: Partial<WorkoutDay>) => {
    setDays((prev) =>
      prev.map((d) => (d.id === dayId ? { ...d, ...updates } : d))
    );
  };

  const addExercise = (dayId: string) => {
    const newExercise: Exercise = {
      id: crypto.randomUUID(),
      name: '',
      sets: 3,
      reps: '8-12',
      muscle: '',
      note: '',
    };
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? { ...d, exercises: [...d.exercises, newExercise] }
          : d
      )
    );
  };

  const updateExercise = (
    dayId: string,
    exerciseId: string,
    updates: Partial<Exercise>
  ) => {
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? {
              ...d,
              exercises: d.exercises.map((e) =>
                e.id === exerciseId ? { ...e, ...updates } : e
              ),
            }
          : d
      )
    );
  };

  const removeExercise = (dayId: string, exerciseId: string) => {
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? { ...d, exercises: d.exercises.filter((e) => e.id !== exerciseId) }
          : d
      )
    );
  };

  // Block editing
  const addBlock = () => {
    setBlocks((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: `Block ${prev.length + 1}`,
        cycleType: 'mesocycle' as CycleType,
        weeks: 4,
        focus: '',
        intensityPercent: 70,
      },
    ]);
  };

  const updateBlock = (blockId: string, updates: Partial<TrainingBlock>) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, ...updates } : b))
    );
  };

  const removeBlock = (blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  };

  // Navigation
  const canContinue = useMemo(() => {
    switch (step) {
      case 0:
        return programName.trim().length > 0;
      case 1:
        return durationWeeks > 0 && daysPerWeek > 0 && split.length > 0;
      case 2:
        return true; // blocks are optional
      case 3:
        return days.length > 0;
      case 4:
        return true;
      default:
        return false;
    }
  }, [step, programName, durationWeeks, daysPerWeek, split, days]);

  const handleNext = () => {
    if (step === 1 && days.length === 0) {
      // Auto-generate days when leaving structure step
      applyStructure(split, daysPerWeek);
    }
    if (step < 4) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleCreate = () => {
    const now = new Date().toISOString();
    const program: Program = {
      id: crypto.randomUUID(),
      name: programName.trim(),
      description: goalDescription.trim() || `${goalType} program`,
      isBuiltIn: false,
      days,
      createdAt: now,
      updatedAt: now,
      suggestedDurationWeeks: durationWeeks,
      goal: {
        type: goalType,
        description: goalDescription.trim(),
        targetMetric: targetMetric.trim() || undefined,
      },
      blocks: blocks.length > 0 ? blocks : undefined,
      daysPerWeek,
      split,
    };
    onSave(program);
  };

  const progressPercent = ((step + 1) / STEP_LABELS.length) * 100;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-bg/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-lg hover:bg-surface-raised text-text-secondary"
          >
            <X size={20} />
          </button>
          <h2 className="font-bold text-sm">Create Program</h2>
          <div className="w-9" />
        </div>

        {/* Progress bar */}
        <div className="h-[2px] bg-surface mx-4 rounded-full overflow-hidden mb-1">
          <div
            className="h-full bg-text-primary rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-between px-4 pb-3">
          {STEP_LABELS.map((label, i) => {
            const Icon = STEP_ICONS[i];
            const isActive = i === step;
            const isDone = i < step;
            return (
              <button
                key={label}
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={`flex flex-col items-center gap-1 transition-colors ${
                  isActive
                    ? 'text-text-primary'
                    : isDone
                      ? 'text-text-secondary cursor-pointer'
                      : 'text-text-muted cursor-default'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                    isActive
                      ? 'bg-text-primary text-bg'
                      : isDone
                        ? 'bg-surface-raised text-text-secondary'
                        : 'bg-surface text-text-muted'
                  }`}
                >
                  {isDone ? <Check size={14} /> : <Icon size={14} />}
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-32">
        {/* Step 1: Overview */}
        {step === 0 && (
          <div className="space-y-5 pt-2">
            <div>
              <label className="label mb-1.5 block">Program Name</label>
              <input
                className="input-field"
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                placeholder="e.g. Hypertrophy Block A"
              />
            </div>

            <div>
              <label className="label mb-2 block">Goal</label>
              <div className="grid grid-cols-3 gap-2">
                {GOAL_OPTIONS.map((g) => {
                  const Icon = g.icon;
                  const selected = goalType === g.type;
                  return (
                    <button
                      key={g.type}
                      onClick={() => setGoalType(g.type)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all ${
                        selected
                          ? 'bg-text-primary text-bg'
                          : 'bg-surface text-text-secondary hover:bg-surface-raised'
                      }`}
                    >
                      <Icon size={20} />
                      <span className="text-xs font-medium">{g.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="label mb-1.5 block">Goal Description</label>
              <textarea
                className="input-field resize-none min-h-[80px]"
                value={goalDescription}
                onChange={(e) => setGoalDescription(e.target.value)}
                placeholder="e.g. Add 50lbs to squat in 12 weeks"
              />
            </div>

            <div>
              <label className="label mb-1.5 block">
                Target Metric{' '}
                <span className="text-text-muted font-normal normal-case tracking-normal">(optional)</span>
              </label>
              <input
                className="input-field"
                value={targetMetric}
                onChange={(e) => setTargetMetric(e.target.value)}
                placeholder="e.g. 315 squat, 10% bodyfat"
              />
            </div>
          </div>
        )}

        {/* Step 2: Structure */}
        {step === 1 && (
          <div className="space-y-5 pt-2">
            <div>
              <label className="label mb-2 block">Duration (weeks)</label>
              <div className="flex gap-2 mb-2">
                {DURATION_PRESETS.map((w) => (
                  <button
                    key={w}
                    onClick={() => setDurationWeeks(w)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                      durationWeeks === w
                        ? 'bg-text-primary text-bg'
                        : 'bg-surface text-text-secondary hover:bg-surface-raised'
                    }`}
                  >
                    {w}w
                  </button>
                ))}
              </div>
              <input
                type="number"
                inputMode="numeric"
                className="input-field text-sm"
                value={durationWeeks}
                onChange={(e) =>
                  setDurationWeeks(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
                min={1}
                max={52}
                placeholder="Custom weeks"
              />
            </div>

            <div>
              <label className="label mb-2 block">Days per Week</label>
              <div className="flex gap-2">
                {DAYS_PER_WEEK_OPTIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => {
                      setDaysPerWeek(d);
                      // Reset split when days change
                      setSplit('');
                      setDays([]);
                    }}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
                      daysPerWeek === d
                        ? 'bg-text-primary text-bg'
                        : 'bg-surface text-text-secondary hover:bg-surface-raised'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label mb-2 block">Split Type</label>
              <div className="space-y-2">
                {availableSplits.map((s) => (
                  <button
                    key={s}
                    onClick={() => applyStructure(s, daysPerWeek)}
                    className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between ${
                      split === s
                        ? 'bg-text-primary text-bg'
                        : 'bg-surface text-text-secondary hover:bg-surface-raised'
                    }`}
                  >
                    <span className="text-sm font-medium">{s}</span>
                    {split === s && <Check size={16} />}
                  </button>
                ))}
              </div>
            </div>

            {split && days.length > 0 && (
              <div>
                <label className="label mb-2 block">Generated Days</label>
                <div className="space-y-1.5">
                  {days.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-3 bg-surface rounded-xl px-3 py-2.5"
                    >
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                        style={{ backgroundColor: d.accent }}
                      >
                        {d.label.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate block">
                          {d.title}
                        </span>
                        <span className="text-xs text-text-secondary">{d.subtitle}</span>
                      </div>
                      <span className="text-xs text-text-muted font-mono">{d.tag}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Training Blocks */}
        {step === 2 && (
          <div className="space-y-5 pt-2">
            <div className="bg-surface rounded-xl p-3">
              <p className="text-sm text-text-secondary leading-relaxed">
                Break your program into phases (blocks). Each block has a focus and
                intensity. This helps structure progressive overload across your{' '}
                {durationWeeks}-week program.
              </p>
            </div>

            {/* Presets */}
            {getBlockPresets(goalType).length > 0 && (
              <div>
                <label className="label mb-2 block">Presets</label>
                <div className="space-y-2">
                  {getBlockPresets(goalType).map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => applyBlockPreset(preset.blocks)}
                      className="w-full text-left p-3 rounded-xl bg-surface hover:bg-surface-raised transition-all"
                    >
                      <span className="text-sm font-medium text-text-primary">
                        {preset.label}
                      </span>
                      {preset.blocks.length > 0 && (
                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                          {preset.blocks.map((b, i) => (
                            <span
                              key={i}
                              className="text-[10px] bg-surface-raised px-2 py-0.5 rounded-md text-text-secondary"
                            >
                              {b.name} ({b.weeks}w)
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Blocks list */}
            {blocks.length > 0 && (
              <div>
                <label className="label mb-2 block">
                  Blocks ({blocks.length})
                </label>
                <div className="space-y-3">
                  {blocks.map((block, idx) => (
                    <div key={block.id} className="card space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-text-muted">
                          BLOCK {idx + 1}
                        </span>
                        <button
                          onClick={() => removeBlock(block.id)}
                          className="p-1 text-text-muted hover:text-danger transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <input
                        className="input-field text-sm"
                        value={block.name}
                        onChange={(e) =>
                          updateBlock(block.id, { name: e.target.value })
                        }
                        placeholder="Block name"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label mb-1 block">Weeks</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            className="input-field text-sm"
                            value={block.weeks}
                            onChange={(e) =>
                              updateBlock(block.id, {
                                weeks: Math.max(1, parseInt(e.target.value, 10) || 1),
                              })
                            }
                            min={1}
                          />
                        </div>
                        <div>
                          <label className="label mb-1 block">Intensity %</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            className="input-field text-sm"
                            value={block.intensityPercent ?? ''}
                            onChange={(e) =>
                              updateBlock(block.id, {
                                intensityPercent: e.target.value
                                  ? Math.min(100, Math.max(0, parseInt(e.target.value, 10)))
                                  : undefined,
                              })
                            }
                            placeholder="Optional"
                            min={0}
                            max={100}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="label mb-1 block">Focus</label>
                        <input
                          className="input-field text-sm"
                          value={block.focus}
                          onChange={(e) =>
                            updateBlock(block.id, { focus: e.target.value })
                          }
                          placeholder="e.g. High volume, moderate intensity"
                        />
                      </div>
                      <div>
                        <label className="label mb-1 block">Cycle Type</label>
                        <select
                          className="input-field text-sm"
                          value={block.cycleType}
                          onChange={(e) =>
                            updateBlock(block.id, {
                              cycleType: e.target.value as CycleType,
                            })
                          }
                        >
                          <option value="microcycle">Microcycle</option>
                          <option value="mesocycle">Mesocycle</option>
                          <option value="macrocycle">Macrocycle</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Week mismatch warning */}
            {blockWeeksMismatch && (
              <div className="flex items-start gap-2 bg-[#f5a623]/10 rounded-xl p-3">
                <AlertTriangle size={16} className="text-[#f5a623] flex-shrink-0 mt-0.5" />
                <p className="text-xs text-[#f5a623] leading-relaxed">
                  Block weeks total <span className="font-bold">{totalBlockWeeks}w</span> but
                  program duration is{' '}
                  <span className="font-bold">{durationWeeks}w</span>. Consider
                  adjusting your blocks.
                </p>
              </div>
            )}

            <button
              onClick={addBlock}
              className="w-full py-3 rounded-xl border border-dashed border-text-muted/30 text-text-secondary text-sm font-medium hover:border-text-secondary hover:text-text-primary transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={16} />
              Add Block
            </button>
          </div>
        )}

        {/* Step 4: Build Days */}
        {step === 3 && (
          <div className="space-y-4 pt-2">
            {/* Day tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
              {days.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => setActiveDayIndex(i)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    activeDayIndex === i
                      ? 'bg-text-primary text-bg'
                      : 'bg-surface text-text-secondary hover:bg-surface-raised'
                  }`}
                >
                  <div
                    className="w-4 h-4 rounded-sm flex-shrink-0"
                    style={{
                      backgroundColor:
                        activeDayIndex === i ? 'currentColor' : d.accent,
                      opacity: activeDayIndex === i ? 0.3 : 1,
                    }}
                  />
                  {d.tag}
                </button>
              ))}
            </div>

            {/* Active day editor */}
            {days[activeDayIndex] && (() => {
              const day = days[activeDayIndex];
              return (
                <div className="space-y-4">
                  {/* Day header */}
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: day.accent }}
                    >
                      {day.label.slice(0, 2)}
                    </div>
                    <div>
                      <h3 className="font-semibold">{day.title}</h3>
                      <p className="text-xs text-text-secondary">{day.subtitle}</p>
                    </div>
                  </div>

                  {/* Day settings */}
                  <div className="card space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label mb-1 block">Label</label>
                        <input
                          className="input-field text-sm"
                          value={day.label}
                          onChange={(e) =>
                            updateDay(day.id, { label: e.target.value })
                          }
                          placeholder="D1"
                        />
                      </div>
                      <div>
                        <label className="label mb-1 block">Tag</label>
                        <input
                          className="input-field text-sm"
                          value={day.tag}
                          onChange={(e) =>
                            updateDay(day.id, { tag: e.target.value })
                          }
                          placeholder="PUSH"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="label mb-1 block">Title</label>
                      <input
                        className="input-field text-sm"
                        value={day.title}
                        onChange={(e) =>
                          updateDay(day.id, { title: e.target.value })
                        }
                        placeholder="Day title"
                      />
                    </div>
                    <div>
                      <label className="label mb-1 block">Subtitle</label>
                      <input
                        className="input-field text-sm"
                        value={day.subtitle}
                        onChange={(e) =>
                          updateDay(day.id, { subtitle: e.target.value })
                        }
                        placeholder="e.g. Chest, Shoulders, Triceps"
                      />
                    </div>

                    {/* Accent color */}
                    <div>
                      <label className="label mb-2 block">Accent Color</label>
                      <div className="flex gap-2">
                        {ACCENT_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => updateDay(day.id, { accent: color })}
                            className={`w-8 h-8 rounded-full border-2 transition-all ${
                              day.accent === color
                                ? 'border-white scale-110'
                                : 'border-transparent hover:scale-105'
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Coach note */}
                    <div>
                      <label className="label mb-1 block">
                        Coach Note{' '}
                        <span className="text-text-muted font-normal normal-case tracking-normal">
                          (optional)
                        </span>
                      </label>
                      <input
                        className="input-field text-sm"
                        value={day.note}
                        onChange={(e) =>
                          updateDay(day.id, { note: e.target.value })
                        }
                        placeholder="e.g. Focus on mind-muscle connection"
                      />
                    </div>
                  </div>

                  {/* Exercises */}
                  <div>
                    <label className="label mb-2 block">
                      Exercises ({day.exercises.length})
                    </label>
                    <div className="space-y-2">
                      {day.exercises.map((exercise) => (
                        <ExerciseEditor
                          key={exercise.id}
                          exercise={exercise}
                          dayId={day.id}
                          onUpdate={updateExercise}
                          onRemove={removeExercise}
                        />
                      ))}
                    </div>

                    <button
                      onClick={() => addExercise(day.id)}
                      className="w-full mt-2 py-3 rounded-xl border border-dashed border-text-muted/30 text-text-secondary text-sm font-medium hover:border-text-secondary hover:text-text-primary transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus size={16} />
                      Add Exercise
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Step 5: Review */}
        {step === 4 && (
          <div className="space-y-5 pt-2">
            {/* Program overview */}
            <div className="card space-y-2">
              <h3 className="font-bold text-lg">{programName}</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs bg-surface-raised px-2 py-1 rounded-lg text-text-secondary font-medium capitalize">
                  {goalType}
                </span>
                <span className="text-xs bg-surface-raised px-2 py-1 rounded-lg text-text-secondary font-medium">
                  {durationWeeks} weeks
                </span>
                <span className="text-xs bg-surface-raised px-2 py-1 rounded-lg text-text-secondary font-medium">
                  {daysPerWeek} days/week
                </span>
                <span className="text-xs bg-surface-raised px-2 py-1 rounded-lg text-text-secondary font-medium">
                  {split}
                </span>
              </div>
              {goalDescription && (
                <p className="text-sm text-text-secondary">{goalDescription}</p>
              )}
              {targetMetric && (
                <p className="text-xs text-text-muted">
                  Target: {targetMetric}
                </p>
              )}
            </div>

            {/* Blocks summary */}
            {blocks.length > 0 && (
              <div>
                <label className="label mb-2 block">Training Blocks</label>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {blocks.map((block, i) => (
                    <div
                      key={block.id}
                      className="flex-shrink-0 bg-surface rounded-xl p-3 min-w-[140px]"
                    >
                      <span className="text-[10px] font-bold text-text-muted block mb-1">
                        BLOCK {i + 1}
                      </span>
                      <span className="text-sm font-medium block">{block.name}</span>
                      <span className="text-xs text-text-secondary">
                        {block.weeks}w
                        {block.intensityPercent != null &&
                          ` / ${block.intensityPercent}%`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Days summary */}
            <div>
              <label className="label mb-2 block">Days</label>
              <div className="space-y-2">
                {days.map((day) => (
                  <div key={day.id} className="card">
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                        style={{ backgroundColor: day.accent }}
                      >
                        {day.label.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-sm truncate block">
                          {day.title}
                        </span>
                        <span className="text-xs text-text-secondary">
                          {day.tag} — {day.exercises.length} exercise
                          {day.exercises.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    {day.exercises.length > 0 && (
                      <div className="space-y-1 ml-11">
                        {day.exercises.map((ex) => (
                          <div
                            key={ex.id}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="text-text-secondary truncate">
                              {ex.name || 'Unnamed'}
                            </span>
                            <span className="text-text-muted flex-shrink-0 ml-2">
                              {ex.sets}x{ex.reps}
                              {ex.muscle && ` (${ex.muscle})`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {day.note && (
                      <p className="text-xs text-text-muted mt-2 ml-11 italic">
                        {day.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-bg/95 backdrop-blur-sm border-t border-surface px-4 py-3 flex items-center gap-3">
        {step > 0 ? (
          <button
            onClick={handleBack}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <ChevronLeft size={16} />
            Back
          </button>
        ) : (
          <div />
        )}
        <div className="flex-1" />
        {step < 4 ? (
          <button
            onClick={handleNext}
            disabled={!canContinue}
            className={`flex items-center gap-1.5 font-medium rounded-xl px-6 py-3 text-sm transition-all active:scale-[0.98] ${
              canContinue
                ? 'bg-text-primary text-bg'
                : 'bg-surface text-text-muted cursor-not-allowed'
            }`}
          >
            Continue
            <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Check size={16} />
            Create Program
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Exercise Editor Sub-component ---------- */

function ExerciseEditor({
  exercise,
  dayId,
  onUpdate,
  onRemove,
}: {
  exercise: Exercise;
  dayId: string;
  onUpdate: (dayId: string, exerciseId: string, updates: Partial<Exercise>) => void;
  onRemove: (dayId: string, exerciseId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-surface rounded-xl">
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 text-left min-w-0"
        >
          <span className="text-sm font-medium truncate block">
            {exercise.name || 'New Exercise'}
          </span>
          {!expanded && (
            <span className="text-xs text-text-secondary">
              {exercise.sets}x{exercise.reps}
              {exercise.muscle && ` — ${exercise.muscle}`}
            </span>
          )}
        </button>
        <button
          onClick={() => onRemove(dayId, exercise.id)}
          className="p-1.5 text-text-muted hover:text-danger transition-colors rounded-lg hover:bg-danger/10"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          <div>
            <label className="label mb-1 block">Name</label>
            <input
              className="input-field text-sm"
              value={exercise.name}
              onChange={(e) =>
                onUpdate(dayId, exercise.id, { name: e.target.value })
              }
              placeholder="e.g. Bench Press"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label mb-1 block">Sets</label>
              <input
                type="number"
                inputMode="numeric"
                className="input-field text-sm"
                value={exercise.sets}
                onChange={(e) =>
                  onUpdate(dayId, exercise.id, {
                    sets: Math.max(1, parseInt(e.target.value, 10) || 1),
                  })
                }
                min={1}
              />
            </div>
            <div>
              <label className="label mb-1 block">Reps</label>
              <input
                className="input-field text-sm"
                value={exercise.reps}
                onChange={(e) =>
                  onUpdate(dayId, exercise.id, { reps: e.target.value })
                }
                placeholder="e.g. 8-12"
              />
            </div>
          </div>
          <div>
            <label className="label mb-1 block">Muscle Group</label>
            <select
              className="input-field text-sm"
              value={exercise.muscle}
              onChange={(e) =>
                onUpdate(dayId, exercise.id, { muscle: e.target.value })
              }
            >
              <option value="">Select muscle group</option>
              {MUSCLE_GROUPS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label mb-1 block">
              Note{' '}
              <span className="text-text-muted font-normal normal-case tracking-normal">
                (optional)
              </span>
            </label>
            <input
              className="input-field text-sm"
              value={exercise.note}
              onChange={(e) =>
                onUpdate(dayId, exercise.id, { note: e.target.value })
              }
              placeholder="e.g. Pause at bottom, slow eccentric"
            />
          </div>
        </div>
      )}
    </div>
  );
}
