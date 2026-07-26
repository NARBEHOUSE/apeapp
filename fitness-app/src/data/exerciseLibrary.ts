export interface LibraryExercise {
  name: string;
  muscles: string[];
  equipment: string;
  type: 'compound' | 'isolation' | 'cardio';
}

export const MUSCLE_GROUPS = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms',
  'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs', 'Core',
  'Traps', 'Lats', 'Lower Back', 'Full Body',
] as const;

export const EQUIPMENT_TYPES = [
  'Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight',
  'Kettlebell', 'Band', 'Smith Machine', 'EZ Bar', 'Plate', 'Other',
] as const;

export const EXERCISE_LIBRARY: LibraryExercise[] = [
  // Chest
  { name: 'Bench Press', muscles: ['Chest', 'Triceps', 'Shoulders'], equipment: 'Barbell', type: 'compound' },
  { name: 'Incline Bench Press', muscles: ['Chest', 'Shoulders', 'Triceps'], equipment: 'Barbell', type: 'compound' },
  { name: 'Decline Bench Press', muscles: ['Chest', 'Triceps'], equipment: 'Barbell', type: 'compound' },
  { name: 'Dumbbell Bench Press', muscles: ['Chest', 'Triceps'], equipment: 'Dumbbell', type: 'compound' },
  { name: 'Incline Dumbbell Press', muscles: ['Chest', 'Shoulders'], equipment: 'Dumbbell', type: 'compound' },
  { name: 'Dumbbell Fly', muscles: ['Chest'], equipment: 'Dumbbell', type: 'isolation' },
  { name: 'Cable Fly', muscles: ['Chest'], equipment: 'Cable', type: 'isolation' },
  { name: 'Chest Press Machine', muscles: ['Chest', 'Triceps'], equipment: 'Machine', type: 'compound' },
  { name: 'Push Up', muscles: ['Chest', 'Triceps', 'Shoulders'], equipment: 'Bodyweight', type: 'compound' },
  { name: 'Dip', muscles: ['Chest', 'Triceps'], equipment: 'Bodyweight', type: 'compound' },
  { name: 'Pec Deck', muscles: ['Chest'], equipment: 'Machine', type: 'isolation' },

  // Back
  { name: 'Deadlift', muscles: ['Back', 'Hamstrings', 'Glutes', 'Lower Back'], equipment: 'Barbell', type: 'compound' },
  { name: 'Barbell Row', muscles: ['Back', 'Biceps'], equipment: 'Barbell', type: 'compound' },
  { name: 'Pendlay Row', muscles: ['Back', 'Biceps'], equipment: 'Barbell', type: 'compound' },
  { name: 'Dumbbell Row', muscles: ['Back', 'Biceps'], equipment: 'Dumbbell', type: 'compound' },
  { name: 'Pull Up', muscles: ['Lats', 'Biceps', 'Back'], equipment: 'Bodyweight', type: 'compound' },
  { name: 'Chin Up', muscles: ['Lats', 'Biceps'], equipment: 'Bodyweight', type: 'compound' },
  { name: 'Lat Pulldown', muscles: ['Lats', 'Biceps'], equipment: 'Cable', type: 'compound' },
  { name: 'Seated Cable Row', muscles: ['Back', 'Biceps'], equipment: 'Cable', type: 'compound' },
  { name: 'T-Bar Row', muscles: ['Back', 'Biceps'], equipment: 'Barbell', type: 'compound' },
  { name: 'Face Pull', muscles: ['Shoulders', 'Back', 'Traps'], equipment: 'Cable', type: 'isolation' },
  { name: 'Rack Pull', muscles: ['Back', 'Lower Back', 'Traps'], equipment: 'Barbell', type: 'compound' },
  { name: 'Romanian Deadlift', muscles: ['Hamstrings', 'Glutes', 'Lower Back'], equipment: 'Barbell', type: 'compound' },

  // Shoulders
  { name: 'Overhead Press', muscles: ['Shoulders', 'Triceps'], equipment: 'Barbell', type: 'compound' },
  { name: 'Dumbbell Shoulder Press', muscles: ['Shoulders', 'Triceps'], equipment: 'Dumbbell', type: 'compound' },
  { name: 'Arnold Press', muscles: ['Shoulders'], equipment: 'Dumbbell', type: 'compound' },
  { name: 'Lateral Raise', muscles: ['Shoulders'], equipment: 'Dumbbell', type: 'isolation' },
  { name: 'Cable Lateral Raise', muscles: ['Shoulders'], equipment: 'Cable', type: 'isolation' },
  { name: 'Front Raise', muscles: ['Shoulders'], equipment: 'Dumbbell', type: 'isolation' },
  { name: 'Reverse Fly', muscles: ['Shoulders', 'Back'], equipment: 'Dumbbell', type: 'isolation' },
  { name: 'Upright Row', muscles: ['Shoulders', 'Traps'], equipment: 'Barbell', type: 'compound' },
  { name: 'Push Press', muscles: ['Shoulders', 'Triceps'], equipment: 'Barbell', type: 'compound' },

  // Arms
  { name: 'Barbell Curl', muscles: ['Biceps'], equipment: 'Barbell', type: 'isolation' },
  { name: 'Dumbbell Curl', muscles: ['Biceps'], equipment: 'Dumbbell', type: 'isolation' },
  { name: 'Hammer Curl', muscles: ['Biceps', 'Forearms'], equipment: 'Dumbbell', type: 'isolation' },
  { name: 'Preacher Curl', muscles: ['Biceps'], equipment: 'EZ Bar', type: 'isolation' },
  { name: 'Cable Curl', muscles: ['Biceps'], equipment: 'Cable', type: 'isolation' },
  { name: 'Concentration Curl', muscles: ['Biceps'], equipment: 'Dumbbell', type: 'isolation' },
  { name: 'Tricep Pushdown', muscles: ['Triceps'], equipment: 'Cable', type: 'isolation' },
  { name: 'Skull Crusher', muscles: ['Triceps'], equipment: 'EZ Bar', type: 'isolation' },
  { name: 'Overhead Tricep Extension', muscles: ['Triceps'], equipment: 'Dumbbell', type: 'isolation' },
  { name: 'Close Grip Bench Press', muscles: ['Triceps', 'Chest'], equipment: 'Barbell', type: 'compound' },
  { name: 'Tricep Dip', muscles: ['Triceps', 'Chest'], equipment: 'Bodyweight', type: 'compound' },
  { name: 'Wrist Curl', muscles: ['Forearms'], equipment: 'Dumbbell', type: 'isolation' },

  // Legs
  { name: 'Squat', muscles: ['Quads', 'Glutes', 'Core'], equipment: 'Barbell', type: 'compound' },
  { name: 'Front Squat', muscles: ['Quads', 'Core'], equipment: 'Barbell', type: 'compound' },
  { name: 'Hack Squat', muscles: ['Quads', 'Glutes'], equipment: 'Machine', type: 'compound' },
  { name: 'Leg Press', muscles: ['Quads', 'Glutes'], equipment: 'Machine', type: 'compound' },
  { name: 'Bulgarian Split Squat', muscles: ['Quads', 'Glutes'], equipment: 'Dumbbell', type: 'compound' },
  { name: 'Lunge', muscles: ['Quads', 'Glutes'], equipment: 'Dumbbell', type: 'compound' },
  { name: 'Walking Lunge', muscles: ['Quads', 'Glutes'], equipment: 'Dumbbell', type: 'compound' },
  { name: 'Step Up', muscles: ['Quads', 'Glutes'], equipment: 'Dumbbell', type: 'compound' },
  { name: 'Leg Extension', muscles: ['Quads'], equipment: 'Machine', type: 'isolation' },
  { name: 'Leg Curl', muscles: ['Hamstrings'], equipment: 'Machine', type: 'isolation' },
  { name: 'Hip Thrust', muscles: ['Glutes', 'Hamstrings'], equipment: 'Barbell', type: 'compound' },
  { name: 'Good Morning', muscles: ['Hamstrings', 'Lower Back'], equipment: 'Barbell', type: 'compound' },
  { name: 'Calf Raise', muscles: ['Calves'], equipment: 'Machine', type: 'isolation' },
  { name: 'Seated Calf Raise', muscles: ['Calves'], equipment: 'Machine', type: 'isolation' },
  { name: 'Sumo Deadlift', muscles: ['Glutes', 'Hamstrings', 'Quads'], equipment: 'Barbell', type: 'compound' },
  { name: 'Goblet Squat', muscles: ['Quads', 'Glutes'], equipment: 'Dumbbell', type: 'compound' },

  // Core
  { name: 'Plank', muscles: ['Core', 'Abs'], equipment: 'Bodyweight', type: 'isolation' },
  { name: 'Ab Wheel Rollout', muscles: ['Abs', 'Core'], equipment: 'Other', type: 'isolation' },
  { name: 'Hanging Leg Raise', muscles: ['Abs'], equipment: 'Bodyweight', type: 'isolation' },
  { name: 'Cable Crunch', muscles: ['Abs'], equipment: 'Cable', type: 'isolation' },
  { name: 'Russian Twist', muscles: ['Abs', 'Core'], equipment: 'Bodyweight', type: 'isolation' },
  { name: 'Sit Up', muscles: ['Abs'], equipment: 'Bodyweight', type: 'isolation' },
  { name: 'Leg Raise', muscles: ['Abs'], equipment: 'Bodyweight', type: 'isolation' },
  { name: 'Crunch', muscles: ['Abs'], equipment: 'Bodyweight', type: 'isolation' },

  // Full Body / Olympic
  { name: 'Clean and Press', muscles: ['Full Body'], equipment: 'Barbell', type: 'compound' },
  { name: 'Power Clean', muscles: ['Full Body'], equipment: 'Barbell', type: 'compound' },
  { name: 'Snatch', muscles: ['Full Body'], equipment: 'Barbell', type: 'compound' },
  { name: 'Thruster', muscles: ['Quads', 'Shoulders'], equipment: 'Barbell', type: 'compound' },
  { name: 'Kettlebell Swing', muscles: ['Glutes', 'Hamstrings', 'Core'], equipment: 'Kettlebell', type: 'compound' },
  { name: 'Turkish Get Up', muscles: ['Full Body'], equipment: 'Kettlebell', type: 'compound' },
  { name: 'Farmer Walk', muscles: ['Forearms', 'Core', 'Traps'], equipment: 'Dumbbell', type: 'compound' },
  { name: 'Burpee', muscles: ['Full Body'], equipment: 'Bodyweight', type: 'compound' },

  // Traps
  { name: 'Shrug', muscles: ['Traps'], equipment: 'Dumbbell', type: 'isolation' },
  { name: 'Barbell Shrug', muscles: ['Traps'], equipment: 'Barbell', type: 'isolation' },
];

export function searchExerciseLibrary(query: string, muscleFilter?: string, equipmentFilter?: string): LibraryExercise[] {
  let results = EXERCISE_LIBRARY;
  if (muscleFilter) results = results.filter((e) => e.muscles.includes(muscleFilter));
  if (equipmentFilter) results = results.filter((e) => e.equipment === equipmentFilter);
  if (query.trim()) {
    const q = query.toLowerCase();
    results = results.filter((e) => e.name.toLowerCase().includes(q));
  }
  return results;
}

export function getSimilarExercises(exerciseName: string, limit = 5, fallbackMuscles?: string[]): LibraryExercise[] {
  // Try exact name match first
  let sourceMuscles: string[] | null = null;
  const exact = EXERCISE_LIBRARY.find((e) => e.name.toLowerCase() === exerciseName.toLowerCase());
  if (exact) {
    sourceMuscles = exact.muscles;
  } else {
    // Try partial word match (e.g. "BB Bench Press" matches "Bench Press")
    const words = exerciseName.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const partial = EXERCISE_LIBRARY.find((e) =>
      words.some((w) => e.name.toLowerCase().includes(w))
    );
    if (partial) sourceMuscles = partial.muscles;
  }

  // Fall back to the exercise's own muscle fields from the program
  if (!sourceMuscles && fallbackMuscles && fallbackMuscles.length > 0) {
    sourceMuscles = fallbackMuscles;
  }

  if (!sourceMuscles) return [];

  const muscles = sourceMuscles;
  return EXERCISE_LIBRARY
    .filter((e) => e.name.toLowerCase() !== exerciseName.toLowerCase() && e.muscles.some((m) => muscles.includes(m)))
    .sort((a, b) => {
      const aOverlap = a.muscles.filter((m) => muscles.includes(m)).length;
      const bOverlap = b.muscles.filter((m) => muscles.includes(m)).length;
      return bOverlap - aOverlap;
    })
    .slice(0, limit);
}
