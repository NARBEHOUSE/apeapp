const STORAGE_KEY = 'fitos-custom-exercises';

export interface CustomExercise {
  name: string;
  muscle: string;
  lastUsed: string;
}

function load(): CustomExercise[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function persist(exercises: CustomExercise[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(exercises));
}

export function saveCustomExercise(name: string, muscle: string): void {
  const exercises = load();
  const normalized = name.trim().toLowerCase();
  const idx = exercises.findIndex((e) => e.name.toLowerCase() === normalized);
  if (idx >= 0) {
    exercises[idx].lastUsed = new Date().toISOString();
    if (muscle) exercises[idx].muscle = muscle;
  } else {
    exercises.push({ name: name.trim(), muscle, lastUsed: new Date().toISOString() });
  }
  persist(exercises);
}

export function getCustomExercises(): CustomExercise[] {
  return load().sort((a, b) => b.lastUsed.localeCompare(a.lastUsed));
}

export function searchCustomExercises(query: string): CustomExercise[] {
  const q = query.toLowerCase().trim();
  if (!q) return getCustomExercises();
  return getCustomExercises().filter((e) => e.name.toLowerCase().includes(q));
}
