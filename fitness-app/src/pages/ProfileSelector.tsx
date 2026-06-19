import { useState, useRef } from 'react';
import { Plus, Trash2, ChevronRight, ChevronLeft, Upload } from 'lucide-react';
import type { Profile, BodyStats, FitnessGoal, ActivityLevel, Gender, MacroTargets } from '../types';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { importBackupProfiles } from '../utils/exportImport';
import { toast } from '../components/shared/Toast';
import {
  calculateMacros,
  calculateTDEE,
  heightToCm,
  lbsToKg,
  ACTIVITY_LABELS,
  GOAL_LABELS,
  GOAL_DESCRIPTIONS,
} from '../utils/tdee';

interface Props {
  profiles: Profile[];
  onSelect: (id: string) => void;
  onCreate: (name: string, goal: string, bodyStats?: BodyStats, customMacros?: MacroTargets) => Profile | null;
  onDelete: (id: string) => void;
  onRefresh?: () => void;
}

type Step = 'list' | 'name' | 'method' | 'body' | 'goal' | 'review' | 'custom_macros';

export function ProfileSelector({ profiles, onSelect, onCreate, onDelete, onRefresh }: Props) {
  const [step, setStep] = useState<Step>('list');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const imported = await importBackupProfiles(reader.result as string);
        onRefresh?.();
        if (imported.length === 1) {
          toast(`Imported profile: ${imported[0].name}`, 'success');
          onSelect(imported[0].id);
        } else {
          toast(`Imported ${imported.length} profiles`, 'success');
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Import failed', 'error');
      }
    };
    reader.readAsText(file);
    if (importRef.current) importRef.current.value = '';
  };

  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [age, setAge] = useState('');
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [weight, setWeight] = useState('');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoal>('lose');

  // Custom macro inputs
  const [customCal, setCustomCal] = useState('2000');
  const [customProtein, setCustomProtein] = useState('180');
  const [customCarbs, setCustomCarbs] = useState('200');
  const [customFat, setCustomFat] = useState('65');

  const resetForm = () => {
    setName('');
    setGender('male');
    setAge('');
    setFeet('');
    setInches('');
    setWeight('');
    setActivityLevel('moderate');
    setFitnessGoal('lose');
    setCustomCal('2000');
    setCustomProtein('180');
    setCustomCarbs('200');
    setCustomFat('65');
    setStep('list');
  };

  const bodyStats: BodyStats | null =
    age && feet && weight
      ? {
          gender,
          age: parseInt(age),
          heightCm: heightToCm(parseInt(feet) || 0, parseInt(inches) || 0),
          weightKg: lbsToKg(parseFloat(weight) || 0),
          activityLevel,
          fitnessGoal,
        }
      : null;

  const macros = bodyStats ? calculateMacros(bodyStats) : null;
  const tdee = bodyStats ? calculateTDEE(bodyStats) : null;

  const handleCreate = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const goalLabel = GOAL_LABELS[fitnessGoal] || fitnessGoal;
    const stats = (age && feet && weight) ? bodyStats : undefined;
    onCreate(trimmedName, goalLabel, stats || undefined);
  };

  const handleCreateCustom = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const custom: MacroTargets = {
      calories: parseInt(customCal) || 2000,
      protein: parseInt(customProtein) || 150,
      carbs: parseInt(customCarbs) || 200,
      fat: parseInt(customFat) || 65,
    };
    onCreate(trimmedName, 'Custom', undefined, custom);
  };

  const canProceedBody = name.trim().length > 0;
  const canProceedGoal = !!age && !!feet && !!weight && parseInt(age) > 0 && parseFloat(weight) > 0;

  const customCalCalc = (parseFloat(customProtein) || 0) * 4 + (parseFloat(customCarbs) || 0) * 4 + (parseFloat(customFat) || 0) * 9;

  // Profile list
  if (step === 'list') {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6">
        <div className="mb-12 text-center">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="APE" className="h-20 mx-auto mb-4 invert brightness-200" />
          <p className="text-text-muted text-xs tracking-[0.2em] uppercase">Aesthetic Physique Enthusiast</p>
        </div>

        <div className="w-full max-w-sm space-y-2">
          {profiles.map((profile) => (
            <div key={profile.id} className="flex items-center gap-2">
              <button
                onClick={() => onSelect(profile.id)}
                className="flex-1 flex items-center gap-4 bg-surface rounded-2xl p-4 text-left active:scale-[0.98] transition-transform"
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium text-sm"
                  style={{ backgroundColor: profile.avatarColor }}
                >
                  {profile.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{profile.name}</div>
                  <div className="text-[11px] text-text-muted truncate">
                    {profile.macroTargets.calories} cal · {profile.goal || 'No goal'}
                  </div>
                </div>
                <ChevronRight size={16} className="text-text-muted" />
              </button>
              <button
                onClick={() => setDeleteId(profile.id)}
                className="p-2.5 rounded-xl text-text-muted hover:text-danger transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {profiles.length < 5 && (
            <div className="flex gap-2">
              <button
                onClick={() => setStep('name')}
                className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl text-text-muted text-sm font-medium hover:text-text-secondary transition-colors"
              >
                <Plus size={16} />
                New Profile
              </button>
              <label className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl text-text-muted text-sm font-medium hover:text-text-secondary transition-colors cursor-pointer">
                <Upload size={16} />
                Import Backup
                <input
                  ref={importRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

        <ConfirmDialog
          open={!!deleteId}
          onClose={() => setDeleteId(null)}
          onConfirm={() => { if (deleteId) onDelete(deleteId); setDeleteId(null); }}
          title="Delete Profile"
          message="This will permanently delete this profile and all its data."
          confirmText="Delete"
          danger
        />
      </div>
    );
  }

  // Onboarding steps
  const allSteps = step === 'custom_macros'
    ? ['Name', 'Setup', 'Macros']
    : ['Name', 'Setup', 'Stats', 'Goal', 'Plan'];
  const stepIndex = step === 'name' ? 0
    : step === 'method' ? 1
    : step === 'custom_macros' ? 2
    : step === 'body' ? 2
    : step === 'goal' ? 3
    : 4;

  const goBack = () => {
    if (step === 'name') resetForm();
    else if (step === 'method') setStep('name');
    else if (step === 'body') setStep('method');
    else if (step === 'custom_macros') setStep('method');
    else if (step === 'goal') setStep('body');
    else setStep('goal');
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col px-6 pt-6 pb-6">
      {/* Nav */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={goBack} className="p-2 -ml-2 rounded-xl">
          <ChevronLeft size={18} className="text-text-muted" />
        </button>
        <div className="flex-1" />
        <span className="text-[11px] text-text-muted">{Math.min(stepIndex + 1, allSteps.length)}/{allSteps.length}</span>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1 mb-6">
        {allSteps.map((_, i) => (
          <div
            key={i}
            className={`h-0.5 flex-1 rounded-full transition-colors ${
              i <= stepIndex ? 'bg-text-primary' : 'bg-surface'
            }`}
          />
        ))}
      </div>

      {/* Name — button positioned above keyboard */}
      {step === 'name' && (
        <div className="flex-1 flex flex-col">
          <h3 className="text-xl font-semibold mb-1">What's your name?</h3>
          <p className="text-text-muted text-sm mb-6">We'll personalize your experience.</p>
          <input
            className="input-field text-lg py-4"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className="mt-6">
            <button
              onClick={() => setStep('method')}
              disabled={!canProceedBody}
              className="btn-primary w-full disabled:opacity-30"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Method choice — calculate or custom */}
      {step === 'method' && (
        <div className="flex-1 flex flex-col">
          <h3 className="text-xl font-semibold mb-1">How do you want to set your targets?</h3>
          <p className="text-text-muted text-sm mb-8">You can always change this later in settings.</p>

          <div className="space-y-3">
            <button
              onClick={() => setStep('body')}
              className="w-full text-left bg-surface rounded-2xl p-5 active:scale-[0.98] transition-transform"
            >
              <div className="font-medium mb-1">Calculate for me</div>
              <div className="text-xs text-text-muted">Enter your stats and we'll calculate your calories and macros using the Mifflin-St Jeor equation.</div>
            </button>

            <button
              onClick={() => setStep('custom_macros')}
              className="w-full text-left bg-surface rounded-2xl p-5 active:scale-[0.98] transition-transform"
            >
              <div className="font-medium mb-1">I'll set my own</div>
              <div className="text-xs text-text-muted">Already know your targets? Enter your calories and macros directly.</div>
            </button>
          </div>
        </div>
      )}

      {/* Custom macros */}
      {step === 'custom_macros' && (
        <div className="flex-1 flex flex-col">
          <h3 className="text-xl font-semibold mb-1">Your targets</h3>
          <p className="text-text-muted text-sm mb-6">Set your daily macro goals.</p>

          <div className="space-y-4">
            <div>
              <label className="label mb-1 block">Daily Calories</label>
              <input
                type="number"
                inputMode="numeric"
                className="input-field text-lg py-3"
                placeholder="2000"
                value={customCal}
                onChange={(e) => setCustomCal(e.target.value)}
              />
              <div className="text-[10px] text-text-muted mt-1">
                From macros: {Math.round(customCalCalc)} cal (P×4 + C×4 + F×9)
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label mb-1 block">Protein (g)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input-field text-center"
                  placeholder="180"
                  value={customProtein}
                  onChange={(e) => setCustomProtein(e.target.value)}
                />
                <div className="text-[8px] text-text-muted text-center mt-0.5">4 cal/g</div>
              </div>
              <div>
                <label className="label mb-1 block">Carbs (g)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input-field text-center"
                  placeholder="200"
                  value={customCarbs}
                  onChange={(e) => setCustomCarbs(e.target.value)}
                />
                <div className="text-[8px] text-text-muted text-center mt-0.5">4 cal/g</div>
              </div>
              <div>
                <label className="label mb-1 block">Fat (g)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  className="input-field text-center"
                  placeholder="65"
                  value={customFat}
                  onChange={(e) => setCustomFat(e.target.value)}
                />
                <div className="text-[8px] text-text-muted text-center mt-0.5">9 cal/g</div>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <button onClick={handleCreateCustom} className="btn-primary w-full">
              Let's Go
            </button>
          </div>
        </div>
      )}

      {/* Body Stats */}
      {step === 'body' && (
        <div className="flex-1 flex flex-col overflow-y-auto">
          <h3 className="text-xl font-semibold mb-1">Your stats</h3>
          <p className="text-text-muted text-sm mb-6">Used to calculate your calorie targets.</p>

          <div className="space-y-4">
            <div className="flex gap-2">
              {(['male', 'female'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGender(g)}
                  className={`flex-1 py-3 text-sm font-medium rounded-xl transition-colors ${
                    gender === g ? 'bg-text-primary text-bg' : 'bg-surface text-text-muted'
                  }`}
                >
                  {g === 'male' ? 'Male' : 'Female'}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label mb-1 block">Age</label>
                <input type="number" inputMode="numeric" className="input-field" placeholder="25" value={age} onChange={(e) => setAge(e.target.value)} />
              </div>
              <div>
                <label className="label mb-1 block">Weight (lbs)</label>
                <input type="number" inputMode="decimal" className="input-field" placeholder="180" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label mb-1 block">Height (ft)</label>
                <input type="number" inputMode="numeric" className="input-field" placeholder="5" value={feet} onChange={(e) => setFeet(e.target.value)} />
              </div>
              <div>
                <label className="label mb-1 block">Height (in)</label>
                <input type="number" inputMode="numeric" className="input-field" placeholder="10" value={inches} onChange={(e) => setInches(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label mb-2 block">Activity Level</label>
              <div className="space-y-1.5">
                {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((level) => (
                  <button
                    key={level}
                    onClick={() => setActivityLevel(level)}
                    className={`w-full text-left px-4 py-2.5 rounded-xl text-sm transition-colors ${
                      activityLevel === level ? 'bg-text-primary text-bg' : 'bg-surface text-text-muted'
                    }`}
                  >
                    {ACTIVITY_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 pb-2">
            <button onClick={() => setStep('goal')} disabled={!canProceedGoal} className="btn-primary w-full disabled:opacity-30">
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Goal */}
      {step === 'goal' && (
        <div className="flex-1 flex flex-col">
          <h3 className="text-xl font-semibold mb-1">Your goal</h3>
          <p className="text-text-muted text-sm mb-6">This sets your calorie target. Change anytime.</p>

          <div className="space-y-2">
            {(['lose', 'maintain', 'build'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setFitnessGoal(g)}
                className={`w-full text-left px-5 py-4 rounded-2xl transition-colors ${
                  fitnessGoal === g ? 'bg-text-primary text-bg' : 'bg-surface text-text-secondary'
                }`}
              >
                <div className="font-medium mb-0.5">{GOAL_LABELS[g]}</div>
                <div className={`text-xs ${fitnessGoal === g ? 'text-bg/60' : 'text-text-muted'}`}>
                  {GOAL_DESCRIPTIONS[g]}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-auto pt-6">
            <button onClick={() => setStep('review')} className="btn-primary w-full">
              See My Plan
            </button>
          </div>
        </div>
      )}

      {/* Review */}
      {step === 'review' && macros && tdee && (
        <div className="flex-1 flex flex-col">
          <h3 className="text-xl font-semibold mb-6">Your plan</h3>

          <div className="text-center mb-8">
            <div className="text-5xl font-semibold tracking-tight">{macros.calories.toLocaleString()}</div>
            <div className="text-text-muted text-xs mt-1 uppercase tracking-widest">calories / day</div>
            <div className="text-text-muted text-[11px] mt-2">
              TDEE: {tdee.toLocaleString()} · Goal: {GOAL_LABELS[fitnessGoal]}
            </div>
          </div>

          <div className="bg-surface rounded-2xl p-5 mb-4">
            <div className="space-y-4">
              {[
                { label: 'Protein', value: macros.protein, unit: 'g', sub: `${Math.round(macros.protein * 4 / macros.calories * 100)}%` },
                { label: 'Carbs', value: macros.carbs, unit: 'g', sub: `${Math.round(macros.carbs * 4 / macros.calories * 100)}%` },
                { label: 'Fat', value: macros.fat, unit: 'g', sub: `${Math.round(macros.fat * 9 / macros.calories * 100)}%` },
              ].map((m) => (
                <div key={m.label} className="flex items-center justify-between">
                  <span className="text-sm text-text-muted">{m.label}</span>
                  <div className="text-right">
                    <span className="text-sm font-medium">{m.value}{m.unit}</span>
                    <span className="text-[10px] text-text-muted ml-2">{m.sub}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-text-muted leading-relaxed px-1">
            After 21 days of tracking your weight, APE will automatically adjust your calories based on your actual rate of change.
          </p>

          <div className="mt-auto pt-6">
            <button onClick={handleCreate} className="btn-primary w-full">
              Let's Go
            </button>
            <button onClick={() => setStep('goal')} className="w-full text-center text-xs text-text-muted mt-3 py-2">
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
