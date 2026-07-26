const STORAGE_KEY = 'fitos-custom-exercises';

export interface CustomExercise {
  name: string;
  muscle: string;
  videoUrl?: string;
  lastUsed: string;
}

function load(): CustomExercise[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function persist(exercises: CustomExercise[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(exercises));
}

export function saveCustomExercise(name: string, muscle: string, videoUrl?: string): void {
  const exercises = load();
  const normalized = name.trim().toLowerCase();
  const idx = exercises.findIndex((e) => e.name.toLowerCase() === normalized);
  if (idx >= 0) {
    exercises[idx].lastUsed = new Date().toISOString();
    if (muscle) exercises[idx].muscle = muscle;
    if (videoUrl) exercises[idx].videoUrl = videoUrl;
  } else {
    exercises.push({ name: name.trim(), muscle, videoUrl, lastUsed: new Date().toISOString() });
  }
  persist(exercises);
}

export function updateExerciseVideo(name: string, videoUrl: string): void {
  const exercises = load();
  const idx = exercises.findIndex((e) => e.name.toLowerCase() === name.trim().toLowerCase());
  if (idx >= 0) {
    exercises[idx].videoUrl = videoUrl;
    persist(exercises);
  }
}

export function getExerciseVideo(name: string): string | undefined {
  const exercises = load();
  return exercises.find((e) => e.name.toLowerCase() === name.trim().toLowerCase())?.videoUrl;
}

export function bulkSaveFromProgram(programExercises: { name: string; muscle: string }[]): void {
  const exercises = load();
  const existingNames = new Set(exercises.map((e) => e.name.toLowerCase()));
  let added = 0;
  for (const ex of programExercises) {
    if (!ex.name.trim() || existingNames.has(ex.name.trim().toLowerCase())) continue;
    exercises.push({ name: ex.name.trim(), muscle: ex.muscle || '', lastUsed: new Date().toISOString() });
    existingNames.add(ex.name.trim().toLowerCase());
    added++;
  }
  if (added > 0) persist(exercises);
}

export function getCustomExercises(): CustomExercise[] {
  return load().sort((a, b) => b.lastUsed.localeCompare(a.lastUsed));
}

export function searchCustomExercises(query: string): CustomExercise[] {
  const q = query.toLowerCase().trim();
  if (!q) return getCustomExercises();
  return getCustomExercises().filter((e) => e.name.toLowerCase().includes(q));
}
