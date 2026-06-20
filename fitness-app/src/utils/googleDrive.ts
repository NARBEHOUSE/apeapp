import { getDB } from '../db';

const SYNC_FILE_NAME = 'ape-sync-data.json';

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

async function driveRequest(token: string, url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options?.headers },
  });
  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Drive API error ${res.status}: ${body}`);
  }
  return res;
}

export async function findSyncFile(token: string): Promise<DriveFile | null> {
  const res = await driveRequest(
    token,
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${SYNC_FILE_NAME}'&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=1`,
  );
  const data = await res.json();
  return data.files?.[0] || null;
}

export async function uploadSyncData(
  token: string,
  content: string,
  existingFileId?: string,
): Promise<string> {
  if (existingFileId) {
    const initRes = await driveRequest(
      token,
      `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=resumable`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'application/json',
          'X-Upload-Content-Length': String(new Blob([content]).size),
        },
        body: '{}',
      },
    );
    const uploadUrl = initRes.headers.get('Location')!;
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: content,
    });
    if (!uploadRes.ok) throw new Error('Upload failed');
    return (await uploadRes.json()).id;
  }

  const initRes = await driveRequest(
    token,
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'application/json',
        'X-Upload-Content-Length': String(new Blob([content]).size),
      },
      body: JSON.stringify({ name: SYNC_FILE_NAME, parents: ['appDataFolder'] }),
    },
  );
  const uploadUrl = initRes.headers.get('Location')!;
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: content,
  });
  if (!uploadRes.ok) throw new Error('Upload failed');
  return (await uploadRes.json()).id;
}

export async function downloadSyncData(token: string, fileId: string): Promise<string> {
  const res = await driveRequest(
    token,
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
  );
  return res.text();
}

export async function gatherAllData(): Promise<object> {
  const db = await getDB();
  const [workoutSessions, foodEntries, measurements, progressPhotos, programs] = await Promise.all([
    db.getAll('workoutSessions'),
    db.getAll('foodEntries'),
    db.getAll('measurements'),
    db.getAll('progressPhotos'),
    db.getAll('programs'),
  ]);

  const profiles = JSON.parse(localStorage.getItem('fitos-profiles') || '[]');

  const settings: Record<string, string | null> = {};
  for (const key of ['fitos-theme', 'fitos-dashboard-cards']) {
    settings[key] = localStorage.getItem(key);
  }

  const profileExtras: Record<string, Record<string, string | null>> = {};
  for (const p of profiles as { id: string }[]) {
    profileExtras[p.id] = {
      foodHistory: localStorage.getItem(`fitos-food-history-${p.id}`),
      savedMeals: localStorage.getItem(`fitos-saved-meals-${p.id}`),
    };
  }

  return {
    _apeSync: true,
    version: 2,
    syncedAt: new Date().toISOString(),
    profiles,
    settings,
    profileExtras,
    workoutSessions,
    foodEntries,
    measurements,
    progressPhotos,
    programs: programs.filter((p) => !p.isBuiltIn),
  };
}

export async function restoreAllData(data: Record<string, unknown>): Promise<void> {
  const db = await getDB();

  if (data.profiles) {
    localStorage.setItem('fitos-profiles', JSON.stringify(data.profiles));
  }

  const SENSITIVE_KEYS = ['fitos-usda-key', 'fitos-claude-key', 'fitos-claude-enabled'];
  if (data.settings && typeof data.settings === 'object') {
    const s = data.settings as Record<string, string | null>;
    for (const [key, val] of Object.entries(s)) {
      if (val != null && !SENSITIVE_KEYS.includes(key)) localStorage.setItem(key, val);
    }
  }

  if (data.profileExtras && typeof data.profileExtras === 'object') {
    for (const [profileId, extras] of Object.entries(data.profileExtras as Record<string, Record<string, string | null>>)) {
      if (extras.foodHistory) localStorage.setItem(`fitos-food-history-${profileId}`, extras.foodHistory);
      if (extras.savedMeals) localStorage.setItem(`fitos-saved-meals-${profileId}`, extras.savedMeals);
    }
  }

  const stores = ['workoutSessions', 'foodEntries', 'measurements', 'progressPhotos'] as const;
  for (const store of stores) {
    const items = data[store];
    if (Array.isArray(items)) {
      for (const item of items) {
        await db.put(store, item);
      }
    }
  }

  if (Array.isArray(data.programs)) {
    for (const prog of data.programs) {
      await db.put('programs', prog);
    }
  }
}
