export type FitnessGoal = 'lose' | 'maintain' | 'build';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Gender = 'male' | 'female';

export interface BodyStats {
  gender: Gender;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  fitnessGoal: FitnessGoal;
  bodyFatPercent?: number;
}

export interface CalorieAdjustment {
  date: string;
  previousCalories: number;
  newCalories: number;
  reason: string;
  avgWeeklyChange: number;
  // 'goal-change' (default when absent): a permanent change to the prescribed goal.
  // 'temporary-correction': a short-term calorie change to even out an over/under-eating
  // streak, expected to auto-expire back to `resumeCalories`.
  // 'resume': reverting from a temporary correction back to the normal goal.
  kind?: 'goal-change' | 'temporary-correction' | 'resume';
}

// An active short-term calorie correction (e.g. "eat less for a week to offset recent
// over-eating"), distinct from a permanent change to the prescribed goal. The profile's
// macroTargets are set to the corrected values while this is active; once `untilDate`
// passes, the UI prompts the user to resume `resumeMacroTargets`.
export interface TemporaryCalorieOverride {
  days: number;
  startDate: string;
  untilDate: string; // last date (inclusive) the correction applies
  reason: string;
  resumeMacroTargets: MacroTargets;
  // Weight (lbs) the plan's target trajectory implies at the moment the correction
  // started. Once logged weight comes back within tolerance of this, the correction has
  // done its job and the UI offers to resume early instead of running the full day count.
  // Omitted if no weigh-in was available when the correction was started.
  baselineWeightLbs?: number;
}

// Snapshot of the macro targets (and the goal driving them) that took effect on `date`.
// Lets history views show a day against the target that was actually active then,
// instead of whatever the profile's goal happens to be now.
export interface MacroTargetHistoryEntry {
  date: string;
  macroTargets: MacroTargets;
  fitnessGoal?: FitnessGoal;
}

export interface ActiveProgramEnrollment {
  programId: string;
  startDate: string;
  durationWeeks: number;
  plannedEndDate: string;
  lastCompletedDayIndex: number;
}

export interface ProgramCompletion {
  programId: string;
  programName: string;
  startDate: string;
  endDate: string;
  durationWeeks: number;
  totalSessions: number;
  reason: 'completed' | 'ended_early' | 'switched';
}

export interface Profile {
  id: string;
  name: string;
  goal: string;
  startDate: string;
  avatarColor: string;
  units: 'imperial' | 'metric';
  macroTargets: MacroTargets;
  restTimerDuration: number;
  measurementUnit: 'in' | 'cm';
  bodyStats?: BodyStats;
  tdee?: number;
  calorieAdjustments?: CalorieAdjustment[];
  macroTargetHistory?: MacroTargetHistoryEntry[];
  lastAutoAdjustDate?: string;
  temporaryCalorieOverride?: TemporaryCalorieOverride;
  activeProgram?: ActiveProgramEnrollment;
  programHistory?: ProgramCompletion[];
  profilePhoto?: string;
  fiberTarget?: number;
  stepGoal?: number;
  lastKnownWeight?: number;
  googleEmail?: string;
  birthday?: string;
}

export interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type CycleType = 'microcycle' | 'mesocycle' | 'macrocycle';

export interface ProgramGoal {
  type: 'strength' | 'hypertrophy' | 'endurance' | 'recomp' | 'powerbuilding' | 'custom';
  description: string;
  targetMetric?: string;
}

export interface TrainingBlock {
  id: string;
  name: string;
  cycleType: CycleType;
  weeks: number;
  focus: string;
  intensityPercent?: number;
}

export interface Program {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  days: WorkoutDay[];
  createdAt: string;
  updatedAt: string;
  suggestedDurationWeeks?: number;
  goal?: ProgramGoal;
  blocks?: TrainingBlock[];
  daysPerWeek?: number;
  split?: string;
  defaultRestTimer?: number;
  effortMetric?: EffortMetric;
}

export interface WorkoutDay {
  id: string;
  label: string;
  tag: string;
  title: string;
  subtitle: string;
  accent: string;
  note: string;
  exercises: Exercise[];
}

export type SetSchemeType = 'standard' | 'top_set_backoff' | 'pyramid' | 'reverse_pyramid' | 'to_failure' | 'last_set_amrap';

export interface SetScheme {
  type: SetSchemeType;
  topSetReps?: string;
  backoffSets?: number;
  backoffReps?: string;
  backoffPercent?: number;
  pyramidReps?: number[];
  failureSets?: number;
  amrapWorkingSets?: number;
}

export interface ExerciseProgressionConfig {
  type: 'linear' | 'double_progression' | 'custom';
  weeklyWeightIncrement: number;
  repRangeMin: number;
  repRangeMax: number;
  deloadFrequency: number;
  deloadPercent: number;
}

export interface WeeklyTarget {
  week: number;
  sets: number;
  reps: number;
  weight: number;
  isDeload: boolean;
}

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: string;
  muscle: string;
  secondaryMuscles?: string | string[];
  alternatives?: string[];
  note: string;
  flag?: string;
  startingWeight?: number;
  progression?: ExerciseProgressionConfig;
  setScheme?: SetScheme;
  weeklyTargets?: WeeklyTarget[];
  restTimerOverride?: number;
  exerciseType?: 'strength' | 'cardio';
  cardioType?: string;
  targetDuration?: number;
  targetIntensity?: 'low' | 'moderate' | 'high';
  inputType?: 'reps' | 'time';
}

export interface ExerciseLastPerformance {
  sets: SetLog[];
  date: string;
}

export interface ExerciseFeedback {
  sensation: number;
  pump: number;
  soreness: number;
  note?: string;
}

export interface CoachRelationship {
  fileId: string;
  shareFolderId?: string;
  photoFolderId?: string;
  coachEmail?: string;
  clientEmail?: string;
  clientName?: string;
  role: 'client' | 'coach';
  permission: 'full' | 'readonly';
  createdAt: string;
}

export interface CoachPhotoMeta {
  photoId: string;
  driveFileId: string;
  date: string;
  pose: string;
  weight?: number;
  notes?: string;
}

export interface CoachChangeItem {
  id: string;
  type: 'macros' | 'program' | 'note';
  label: string;
  data: unknown;
  coachNote?: string;
}

export interface PendingCoachChanges {
  items: CoachChangeItem[];
  pushedAt: string;
  coachEmail?: string;
  coachPicture?: string;
  coachName?: string;
}

export interface CoachChangeResponse {
  itemId: string;
  action: 'accepted' | 'denied';
  clientNote?: string;
  respondedAt: string;
}

export interface PendingClientResponse {
  responses: CoachChangeResponse[];
  respondedAt: string;
}

export interface CoachLogEntry {
  id: string;
  timestamp: string;
  direction: 'pushed' | 'responded';
  coachEmail?: string;
  fileId?: string;
  items: { type: string; label: string; action?: 'accepted' | 'denied'; clientNote?: string; coachNote?: string }[];
}

export interface CheckInQuestion {
  id: string;
  label: string;
  type: 'scale' | 'text';
  min?: number;
  max?: number;
}

export interface CheckInEntry {
  id: string;
  profileId: string;
  date: string;
  responses: { questionId: string; value: number | string }[];
  notes?: string;
}

export const DEFAULT_CHECKIN_QUESTIONS: CheckInQuestion[] = [
  { id: 'mood', label: 'Overall mood', type: 'scale', min: 1, max: 10 },
  { id: 'sleep', label: 'Sleep quality', type: 'scale', min: 1, max: 10 },
  { id: 'energy', label: 'Energy level', type: 'scale', min: 1, max: 10 },
  { id: 'stress', label: 'How stress-free do you feel?', type: 'scale', min: 1, max: 10 },
  { id: 'soreness', label: 'How recovered do you feel?', type: 'scale', min: 1, max: 10 },
  { id: 'motivation', label: 'Motivation', type: 'scale', min: 1, max: 10 },
  { id: 'hunger', label: 'Appetite control', type: 'scale', min: 1, max: 10 },
  { id: 'digestion', label: 'Digestion quality', type: 'scale', min: 1, max: 10 },
];

export interface CardioEntry {
  type: string;
  durationMin: number;
  intensity?: 'low' | 'moderate' | 'high';
  heartRateAvg?: number;
  distanceKm?: number;
  distanceUnit?: 'km' | 'mi';
  caloriesBurned?: number;
  notes?: string;
}

export type WorkoutSessionStatus = 'completed' | 'skipped';

export interface WorkoutSession {
  id: string;
  profileId: string;
  programId: string;
  dayId: string;
  date: string;
  startTime: number;
  endTime?: number;
  sets: Record<string, SetLog[]>;
  name?: string;
  label?: string;
  accent?: string;
  notes?: string;
  bodyweight?: number;
  exerciseFeedback?: Record<string, ExerciseFeedback>;
  cardio?: CardioEntry[];
  /** Absent/'completed' = a normal logged workout. 'skipped' = deliberately marked as not done, so it's excluded from previous-performance lookups and volume/strength stats. */
  status?: WorkoutSessionStatus;
}

export type SetType = 'standard' | 'warmup' | 'dropset' | 'myoreps' | 'failure';

export interface SetLog {
  weight: number;
  reps: number;
  completed: boolean;
  timestamp: number;
  rir?: number;
  rpe?: number;
  isWarmup?: boolean;
  setType?: SetType;
  duration?: number;
}

export type EffortMetric = 'none' | 'rir' | 'rpe';

export interface MealIngredient {
  name: string;
  brand?: string;
  servingSize: number;   // base serving size (e.g. 100)
  servingUnit: string;   // base unit (e.g. 'g')
  calories: number;      // macros per base serving
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  amount: number;        // how much used (in servingUnit)
}

export interface FoodEntry {
  id: string;
  date: string;
  profileId: string;
  name: string;
  brand?: string;
  servingSize: number;
  servingUnit: string;
  servingsConsumed: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  micronutrients?: Record<string, number>;
  source: 'manual' | 'usda' | 'ai_vision' | 'builtin';
  fdcId?: string;
  loggedAt: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  isFavorite?: boolean;
  ingredients?: MealIngredient[]; // per-entry snapshot; editing here never touches the SavedMeal template or other days
}

export interface Measurement {
  id: string;
  profileId: string;
  date: string;
  weight?: number;
  weightUnit: 'lbs' | 'kg';
  bodyFatPercent?: number;
  bodyFatSource?: 'scale' | 'visual' | 'manual';
  measurements?: {
    chest?: number;
    waist?: number;
    hips?: number;
    leftArm?: number;
    rightArm?: number;
    leftThigh?: number;
    rightThigh?: number;
    neck?: number;
    shoulders?: number;
    bust?: number;
    leftAnkle?: number;
    rightAnkle?: number;
    leftBicep?: number;
    rightBicep?: number;
    leftCalf?: number;
    rightCalf?: number;
    leftForearm?: number;
    rightForearm?: number;
    leftWrist?: number;
    rightWrist?: number;
  };
  notes?: string;
}

export interface StepEntry {
  id: string;
  profileId: string;
  date: string;
  steps: number;
  source?: 'manual' | 'macrofactor';
}

export interface WaterEntry {
  id: string;
  profileId: string;
  date: string;
  amount: number;
  unit: 'oz' | 'ml';
}

export interface ProgressPhoto {
  id: string;
  profileId: string;
  date: string;
  time: string;
  pose: 'front' | 'side_left' | 'side_right' | 'back';
  imageData: string;
  weight?: number;
  notes?: string;
}
