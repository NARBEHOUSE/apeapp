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
  lastAutoAdjustDate?: string;
  activeProgram?: ActiveProgramEnrollment;
  programHistory?: ProgramCompletion[];
  profilePhoto?: string;
  fiberTarget?: number;
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

export type SetSchemeType = 'standard' | 'top_set_backoff' | 'pyramid' | 'reverse_pyramid' | 'to_failure';

export interface SetScheme {
  type: SetSchemeType;
  topSetReps?: string;
  backoffSets?: number;
  backoffReps?: string;
  backoffPercent?: number;
  pyramidReps?: number[];
  failureSets?: number;
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
  secondaryMuscles?: string[];
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

export interface WorkoutSession {
  id: string;
  profileId: string;
  programId: string;
  dayId: string;
  date: string;
  startTime: number;
  endTime?: number;
  sets: Record<string, SetLog[]>;
  notes?: string;
  bodyweight?: number;
  exerciseFeedback?: Record<string, ExerciseFeedback>;
  cardio?: CardioEntry[];
}

export interface SetLog {
  weight: number;
  reps: number;
  completed: boolean;
  timestamp: number;
  rir?: number;
  rpe?: number;
  isWarmup?: boolean;
}

export type EffortMetric = 'none' | 'rir' | 'rpe';

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
