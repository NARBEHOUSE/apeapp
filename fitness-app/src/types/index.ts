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
  note: string;
  flag?: string;
  startingWeight?: number;
  progression?: ExerciseProgressionConfig;
  weeklyTargets?: WeeklyTarget[];
  restTimerOverride?: number;
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
}

export interface SetLog {
  weight: number;
  reps: number;
  completed: boolean;
  timestamp: number;
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
  };
  notes?: string;
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
