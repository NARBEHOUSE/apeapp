import JSZip from 'jszip';
import { getDB } from '../db';
import type { Program, FoodEntry, Profile } from '../types';

export async function exportProgram(programId: string): Promise<string> {
  const db = await getDB();
  const program = await db.get('programs', programId);
  if (!program) throw new Error('Program not found');

  const data = {
    type: 'ape-program',
    version: 1,
    exportedAt: new Date().toISOString(),
    program: { ...program, isBuiltIn: false },
  };
  return JSON.stringify(data, null, 2);
}

export async function importProgram(jsonStr: string): Promise<Program> {
  const data = JSON.parse(jsonStr);
  if (data.type !== 'ape-program' || !data.program) {
    throw new Error('Invalid program file. Expected an APE program export.');
  }

  const db = await getDB();
  const program: Program = {
    ...data.program,
    id: crypto.randomUUID(),
    isBuiltIn: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.put('programs', program);
  return program;
}

export async function exportAllPrograms(): Promise<string> {
  const db = await getDB();
  const programs = await db.getAll('programs');
  const userPrograms = programs.filter((p) => !p.isBuiltIn);

  const data = {
    type: 'ape-programs-bundle',
    version: 1,
    exportedAt: new Date().toISOString(),
    programs: userPrograms,
  };
  return JSON.stringify(data, null, 2);
}

export async function importProgramsBundle(jsonStr: string): Promise<number> {
  const data = JSON.parse(jsonStr);
  if (data.type === 'ape-program') {
    await importProgram(jsonStr);
    return 1;
  }
  if (data.type !== 'ape-programs-bundle' || !data.programs) {
    throw new Error('Invalid program file format.');
  }

  const db = await getDB();
  let count = 0;
  for (const prog of data.programs) {
    const program: Program = {
      ...prog,
      id: crypto.randomUUID(),
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.put('programs', program);
    count++;
  }
  return count;
}

export async function exportCustomFoods(profileId: string): Promise<string> {
  const db = await getDB();
  const allEntries: FoodEntry[] = await db.getAllFromIndex('foodEntries', 'by-profile', profileId);

  // Deduplicate by name+brand, keeping the most recent entry's macros
  const uniqueFoods = new Map<string, FoodEntry>();
  for (const entry of allEntries) {
    if (entry.source === 'manual' || entry.source === 'ai_vision') {
      const key = `${entry.name}|${entry.brand || ''}`;
      const existing = uniqueFoods.get(key);
      if (!existing || entry.loggedAt > existing.loggedAt) {
        uniqueFoods.set(key, entry);
      }
    }
  }

  const foods = Array.from(uniqueFoods.values()).map((e) => ({
    name: e.name,
    brand: e.brand,
    calories: e.calories,
    protein: e.protein,
    carbs: e.carbs,
    fat: e.fat,
    fiber: e.fiber,
    servingSize: e.servingSize,
    servingUnit: e.servingUnit,
  }));

  const data = {
    type: 'ape-custom-foods',
    version: 1,
    exportedAt: new Date().toISOString(),
    profileId,
    foods,
  };
  return JSON.stringify(data, null, 2);
}

export async function exportAllData(): Promise<string> {
  const db = await getDB();
  const [workoutSessions, foodEntries, measurements, programs] = await Promise.all([
    db.getAll('workoutSessions'),
    db.getAll('foodEntries'),
    db.getAll('measurements'),
    db.getAll('programs'),
  ]);

  const profiles = JSON.parse(localStorage.getItem('fitos-profiles') || '[]');
  const settings = localStorage.getItem('fitos-settings');

  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    profiles,
    settings: settings ? JSON.parse(settings) : null,
    workoutSessions,
    foodEntries,
    measurements,
    programs: programs.filter((p) => !p.isBuiltIn),
  };

  return JSON.stringify(data, null, 2);
}

export async function downloadJSON(data: string, filename: string): Promise<void> {
  const blob = new Blob([data], { type: 'application/json' });

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          { description: 'JSON File', accept: { 'application/json': ['.json'] } },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importData(jsonStr: string, mode: 'merge' | 'replace'): Promise<void> {
  const data = JSON.parse(jsonStr);
  if (!data.version) throw new Error('Invalid backup file');

  const db = await getDB();

  if (mode === 'replace') {
    await db.clear('workoutSessions');
    await db.clear('foodEntries');
    await db.clear('measurements');
    const allPrograms = await db.getAll('programs');
    for (const p of allPrograms) {
      if (!p.isBuiltIn) await db.delete('programs', p.id);
    }
    localStorage.setItem('fitos-profiles', JSON.stringify(data.profiles || []));
    if (data.settings) localStorage.setItem('fitos-settings', JSON.stringify(data.settings));
  }

  const tx = db.transaction(
    ['workoutSessions', 'foodEntries', 'measurements', 'programs'],
    'readwrite'
  );

  for (const session of data.workoutSessions || []) {
    await tx.objectStore('workoutSessions').put(session);
  }
  for (const entry of data.foodEntries || []) {
    await tx.objectStore('foodEntries').put(entry);
  }
  for (const m of data.measurements || []) {
    await tx.objectStore('measurements').put(m);
  }
  for (const p of data.programs || []) {
    await tx.objectStore('programs').put(p);
  }

  await tx.done;

  if (mode === 'merge' && data.profiles) {
    const existing = JSON.parse(localStorage.getItem('fitos-profiles') || '[]');
    const existingIds = new Set(existing.map((p: { id: string }) => p.id));
    for (const profile of data.profiles) {
      if (!existingIds.has(profile.id)) {
        existing.push(profile);
      }
    }
    localStorage.setItem('fitos-profiles', JSON.stringify(existing));
  }
}

export async function importBackupProfiles(jsonStr: string): Promise<Profile[]> {
  const data = JSON.parse(jsonStr);
  if (!data.version || !data.profiles?.length) {
    throw new Error('Invalid backup file or no profiles found');
  }

  const db = await getDB();

  const tx = db.transaction(
    ['workoutSessions', 'foodEntries', 'measurements', 'programs'],
    'readwrite',
  );

  for (const session of data.workoutSessions || []) {
    await tx.objectStore('workoutSessions').put(session);
  }
  for (const entry of data.foodEntries || []) {
    await tx.objectStore('foodEntries').put(entry);
  }
  for (const m of data.measurements || []) {
    await tx.objectStore('measurements').put(m);
  }
  for (const p of data.programs || []) {
    await tx.objectStore('programs').put(p);
  }

  await tx.done;

  const existing: Profile[] = JSON.parse(localStorage.getItem('fitos-profiles') || '[]');
  const existingIds = new Set(existing.map((p) => p.id));
  const imported: Profile[] = [];

  for (const profile of data.profiles as Profile[]) {
    if (!existingIds.has(profile.id)) {
      existing.push(profile);
      imported.push(profile);
    } else {
      const idx = existing.findIndex((p) => p.id === profile.id);
      if (idx >= 0) existing[idx] = profile;
      imported.push(profile);
    }
  }

  localStorage.setItem('fitos-profiles', JSON.stringify(existing));

  return imported;
}

export async function clearProfileData(profileId: string): Promise<void> {
  const db = await getDB();
  const stores = ['workoutSessions', 'foodEntries', 'measurements', 'progressPhotos'] as const;

  for (const storeName of stores) {
    const all = await db.getAllFromIndex(storeName, 'by-profile', profileId);
    const tx = db.transaction(storeName, 'readwrite');
    for (const item of all) {
      await tx.store.delete((item as { id: string }).id);
    }
    await tx.done;
  }
}

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  await Promise.all([
    db.clear('workoutSessions'),
    db.clear('foodEntries'),
    db.clear('measurements'),
    db.clear('progressPhotos'),
    db.clear('programs'),
  ]);
  localStorage.removeItem('fitos-profiles');
  localStorage.removeItem('fitos-active-profile');
  localStorage.removeItem('fitos-settings');
}

export async function exportCoachUpdate(
  profile: Profile,
  coachName: string,
  notes: string
): Promise<string> {
  let program: Program | null = null;
  if (profile.activeProgram?.programId) {
    const db = await getDB();
    const found = await db.get('programs', profile.activeProgram.programId);
    if (found) program = found;
  }

  const data = {
    type: 'ape-coach-update',
    version: 1,
    exportedAt: new Date().toISOString(),
    coachName,
    clientName: profile.name,
    notes,
    macroTargets: profile.macroTargets,
    activeProgram: profile.activeProgram || null,
    program,
  };
  return JSON.stringify(data, null, 2);
}

export async function importCoachUpdate(
  jsonStr: string,
  onUpdateProfile: (id: string, updates: Partial<Profile>) => void,
  currentProfile: Profile
): Promise<{ coachName: string; clientName: string; notes: string }> {
  const data = JSON.parse(jsonStr);
  if (data.type !== 'ape-coach-update') {
    throw new Error('Invalid coach update file');
  }

  if (data.program) {
    const db = await getDB();
    await db.put('programs', { ...data.program, isBuiltIn: false });
  }

  onUpdateProfile(currentProfile.id, {
    macroTargets: data.macroTargets,
    activeProgram: data.activeProgram ?? currentProfile.activeProgram,
  });

  return {
    coachName: data.coachName,
    clientName: data.clientName,
    notes: data.notes,
  };
}

export async function exportCoachPackage(
  profile: Profile,
  coachName: string,
  notes: string
): Promise<void> {
  const zip = new JSZip();
  const db = await getDB();

  const [sessions, foodEntries, measurements, photos] = await Promise.all([
    db.getAllFromIndex('workoutSessions', 'by-profile', profile.id),
    db.getAllFromIndex('foodEntries', 'by-profile', profile.id),
    db.getAllFromIndex('measurements', 'by-profile', profile.id),
    db.getAllFromIndex('progressPhotos', 'by-profile', profile.id),
  ]);

  let program: Program | null = null;
  if (profile.activeProgram?.programId) {
    const found = await db.get('programs', profile.activeProgram.programId);
    if (found) program = found;
  }

  // Build lookups for exercise names and day titles across all programs
  const allPrograms = await db.getAll('programs');
  const exerciseNames = new Map<string, string>();
  const dayTitles = new Map<string, string>();
  for (const prog of allPrograms) {
    for (const day of prog.days) {
      dayTitles.set(day.id, day.title || day.label);
      for (const ex of day.exercises) {
        exerciseNames.set(ex.id, ex.name);
      }
    }
  }

  const date = new Date().toISOString().split('T')[0];

  const readme = [
    `APE Coach Package — ${profile.name}`,
    `Generated: ${date}`,
    `Coach: ${coachName}`,
    notes ? `\nNotes:\n${notes}` : '',
    `
PHOTOS
------
Progress photos are in the photos/ folder, named by date and pose.

SHARING WITH YOUR COACH
-----------------------
Upload this folder to a shared cloud drive and send your coach the link:

  • Google Drive   https://drive.google.com
  • iCloud Drive   https://www.icloud.com/iclouddrive
  • OneDrive       https://onedrive.live.com
  • Dropbox        https://dropbox.com

DATA FILE
---------
data.json contains your profile, macro targets, workout history, and measurements.
`,
  ]
    .filter(Boolean)
    .join('\n');

  zip.file('README.txt', readme);

  // Last 7-day nutrition average
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentFood = foodEntries.filter(
    (f) => f.date >= sevenDaysAgo.toISOString().split('T')[0]
  );
  let nutritionAvg: Record<string, number> | null = null;
  if (recentFood.length > 0) {
    const byDate = new Map<string, FoodEntry[]>();
    for (const f of recentFood) {
      if (!byDate.has(f.date)) byDate.set(f.date, []);
      byDate.get(f.date)!.push(f);
    }
    const days = Array.from(byDate.values());
    const avg = (key: keyof FoodEntry) =>
      Math.round(
        days.reduce((sum, d) => sum + d.reduce((s, f) => s + (Number(f[key]) || 0), 0), 0) /
          days.length
      );
    nutritionAvg = {
      daysTracked: days.length,
      avgCalories: avg('calories'),
      avgProtein: avg('protein'),
      avgCarbs: avg('carbs'),
      avgFat: avg('fat'),
    };
  }

  const data = {
    type: 'ape-coach-package',
    version: 1,
    exportedAt: new Date().toISOString(),
    coachName,
    clientName: profile.name,
    notes,
    macroTargets: profile.macroTargets,
    bodyStats: profile.bodyStats,
    goal: profile.goal,
    activeProgram: profile.activeProgram || null,
    program,
    recentMeasurements: measurements
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30),
    recentWorkouts: sessions
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20)
      .map((s) => {
        const durationMin = s.endTime
          ? Math.round((s.endTime - s.startTime) / 60000)
          : null;
        return {
          date: s.date,
          dayTitle: dayTitles.get(s.dayId) || 'Workout',
          durationMin,
          notes: s.notes,
          exercises: Object.entries(s.sets).map(([exerciseId, sets]) => ({
            name: exerciseNames.get(exerciseId) || exerciseId,
            sets: sets
              .filter((set) => set.completed)
              .map((set) => ({ weight: set.weight, reps: set.reps })),
          })),
        };
      }),
    nutritionAvgLast7Days: nutritionAvg,
    photoCount: photos.length,
  };

  zip.file('data.json', JSON.stringify(data, null, 2));

  // Progress photos
  if (photos.length > 0) {
    const photoFolder = zip.folder('photos')!;
    for (const photo of photos) {
      let base64 = photo.imageData;
      let ext = 'jpg';
      if (base64.startsWith('data:')) {
        const match = base64.match(/^data:image\/(\w+);base64,(.+)$/s);
        if (match) {
          ext = match[1] === 'jpeg' ? 'jpg' : match[1];
          base64 = match[2];
        }
      }
      const filename = `${photo.date}_${photo.pose}${photo.weight ? `_${photo.weight}lbs` : ''}.${ext}`;
      photoFolder.file(filename, base64, { base64: true });
    }
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const zipFilename = `ape-coach-${profile.name.toLowerCase().replace(/\s+/g, '-')}-${date}.zip`;

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: zipFilename,
        types: [
          { description: 'ZIP Archive', accept: { 'application/zip': ['.zip'] } },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFilename;
  a.click();
  URL.revokeObjectURL(url);
}
