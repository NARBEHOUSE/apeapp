import { getDB } from './index';
import type { Program } from '../types';
import upperLower from '../data/programs/upper-lower-5day.json';
import fullBody from '../data/programs/full-body-3day.json';
import broSplit from '../data/programs/bro-split.json';

const BUILT_IN_PROGRAMS: Program[] = [
  upperLower as Program,
  fullBody as Program,
  broSplit as Program,
];

export async function initializePrograms(): Promise<void> {
  const db = await getDB();
  for (const program of BUILT_IN_PROGRAMS) {
    const existing = await db.get('programs', program.id);
    if (!existing) {
      await db.put('programs', program);
    }
  }
}

export async function getAllPrograms(): Promise<Program[]> {
  const db = await getDB();
  return db.getAll('programs');
}

export async function getProgram(id: string): Promise<Program | undefined> {
  const db = await getDB();
  return db.get('programs', id);
}

export async function saveProgram(program: Program): Promise<void> {
  const db = await getDB();
  await db.put('programs', program);
  // Auto-save all exercises to the custom exercise library
  const { bulkSaveFromProgram } = await import('./customExercises');
  const exercises = program.days.flatMap((d) => d.exercises.filter((e) => e.name.trim()).map((e) => ({ name: e.name, muscle: e.muscle || '' })));
  bulkSaveFromProgram(exercises);
}

export async function deleteProgram(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('programs', id);
}

export async function duplicateProgram(id: string, newName: string): Promise<Program> {
  const original = await getProgram(id);
  if (!original) throw new Error('Program not found');

  const now = new Date().toISOString();
  const duplicate: Program = {
    ...original,
    id: crypto.randomUUID(),
    name: newName,
    isBuiltIn: false,
    createdAt: now,
    updatedAt: now,
    days: original.days.map((day) => ({
      ...day,
      id: crypto.randomUUID(),
      exercises: day.exercises.map((ex) => ({ ...ex, id: crypto.randomUUID() })),
    })),
  };

  await saveProgram(duplicate);
  return duplicate;
}
