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

export async function deleteSyncFile(token: string, fileId: string): Promise<void> {
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function deleteAllAppData(token: string): Promise<void> {
  // Delete appDataFolder files (sync data)
  const res = await driveRequest(
    token,
    'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id)&pageSize=100',
  );
  const data = await res.json();
  for (const file of data.files || []) {
    await deleteSyncFile(token, file.id);
  }

  // Delete the APE App root folder
  try {
    const folderRes = await driveRequest(
      token,
      `https://www.googleapis.com/drive/v3/files?q=name='${APE_ROOT_FOLDER}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false&fields=files(id)&pageSize=5`,
    );
    const folderData = await folderRes.json();
    for (const folder of folderData.files || []) {
      await driveRequest(token, `https://www.googleapis.com/drive/v3/files/${folder.id}`, { method: 'DELETE' });
    }
  } catch { /* folder may not exist */ }

  // Delete the isolated coach share folder
  try {
    const shareRes = await driveRequest(
      token,
      `https://www.googleapis.com/drive/v3/files?q=name='${COACH_SHARE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false&fields=files(id)&pageSize=5`,
    );
    const shareData = await shareRes.json();
    for (const folder of shareData.files || []) {
      await driveRequest(token, `https://www.googleapis.com/drive/v3/files/${folder.id}`, { method: 'DELETE' });
    }
  } catch { /* folder may not exist */ }

  cachedRootFolderId = null;
  cachedShareFolderId = null;
  cachedPhotoFolderId = null;
}

export async function downloadSyncData(token: string, fileId: string): Promise<string> {
  const res = await driveRequest(
    token,
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
  );
  return res.text();
}

// --- APE App root folder in Drive ---

const APE_ROOT_FOLDER = 'APE App';
const COACH_FILE_NAME = 'ape-coach-share.json';
const COACH_PHOTO_SUBFOLDER = 'Progress Photos';

let cachedRootFolderId: string | null = null;

export async function getOrCreateRootFolder(token: string): Promise<string> {
  if (cachedRootFolderId) return cachedRootFolderId;

  // Check if it exists
  const res = await driveRequest(
    token,
    `https://www.googleapis.com/drive/v3/files?q=name='${APE_ROOT_FOLDER}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false&fields=files(id)&pageSize=1`,
  );
  const data = await res.json();
  if (data.files?.[0]) {
    cachedRootFolderId = data.files[0].id;
    return cachedRootFolderId!;
  }

  // Create it
  const createRes = await driveRequest(token, 'https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: APE_ROOT_FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const folder = await createRes.json();
  cachedRootFolderId = folder.id;
  return folder.id;
}

// --- Coach sharing (isolated folder approach) ---

const COACH_SHARE_FOLDER = 'APE Coach Share';
let cachedShareFolderId: string | null = null;

export async function getOrCreateCoachShareFolder(token: string): Promise<string> {
  if (cachedShareFolderId) return cachedShareFolderId;

  const res = await driveRequest(
    token,
    `https://www.googleapis.com/drive/v3/files?q=name='${COACH_SHARE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false&fields=files(id)&pageSize=1`,
  );
  const data = await res.json();
  if (data.files?.[0]) {
    cachedShareFolderId = data.files[0].id;
    return cachedShareFolderId!;
  }

  const createRes = await driveRequest(token, 'https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: COACH_SHARE_FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const folder = await createRes.json();
  cachedShareFolderId = folder.id;
  return folder.id;
}

export async function createCoachShareFile(
  token: string,
  content: string,
  coachEmail: string,
): Promise<{ fileId: string; folderId: string }> {
  const folderId = await getOrCreateCoachShareFolder(token);

  // Check for existing files — never create duplicates
  const existingRes = await driveRequest(token,
    `https://www.googleapis.com/drive/v3/files?q=name='${COACH_FILE_NAME}' and '${folderId}' in parents and trashed=false&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&pageSize=10`
  );
  const existingData = await existingRes.json();
  const existingFiles: { id: string; modifiedTime: string }[] = existingData.files || [];

  let fileId: string;
  if (existingFiles.length > 0) {
    // Reuse the most recently modified file
    fileId = existingFiles[0].id;
    await writeSharedFile(token, fileId, content);
    // Delete any stale duplicates
    for (const f of existingFiles.slice(1)) {
      try { await deleteFile(token, f.id); } catch { /* best-effort */ }
    }
  } else {
    // No existing file — create one
    const metadata = { name: COACH_FILE_NAME, mimeType: 'application/json', parents: [folderId] };
    const boundary = 'ape_coach_boundary';
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
    const res = await driveRequest(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    const file = await res.json();
    fileId = file.id;
  }

  // Share the FOLDER with the coach — triggers Google email notification
  // If already shared, the permissions API returns an error we can safely ignore
  try {
    const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}/permissions?sendNotificationEmail=${existingFiles.length === 0}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: coachEmail }),
    });
    if (!permRes.ok) {
      const errBody = await permRes.text().catch(() => '');
      // "already shared" errors (400/409) are not fatal — the coach still has access
      const alreadyShared = permRes.status === 400 && (errBody.includes('sharee') || errBody.includes('already')) || permRes.status === 409;
      if (!alreadyShared) {
        console.error('Permission grant failed:', permRes.status, errBody);
        throw new Error(`Failed to share with ${coachEmail}: ${permRes.status}. Make sure the email is a valid Google account.`);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Failed to share')) throw err;
    console.error('Permission grant error:', err);
    throw new Error(`Failed to share with ${coachEmail}. Check the email address.`);
  }

  return { fileId, folderId };
}

export async function readSharedFile(token: string, fileId: string): Promise<string> {
  const res = await driveRequest(token, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  return res.text();
}

export async function writeSharedFile(token: string, fileId: string, content: string): Promise<void> {
  await driveRequest(token, `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: content,
  });
}



export async function deleteFile(token: string, fileId: string): Promise<void> {
  await driveRequest(token, `https://www.googleapis.com/drive/v3/files/${fileId}`, { method: 'DELETE' });
}

// Immediately revokes a specific user's share permission on a file/folder.
// Must be called before deleteFile — trashing a file does NOT revoke active share permissions.
export async function revokeSharePermission(token: string, fileId: string, email: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=permissions(id,emailAddress)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return;
  const data = await res.json();
  const perm = (data.permissions as { id: string; emailAddress?: string }[] || [])
    .find((p) => p.emailAddress?.toLowerCase() === email.toLowerCase());
  if (!perm) return;
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions/${perm.id}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );
}

// --- Coach photo folder (inside isolated Coach Share folder) ---

let cachedPhotoFolderId: string | null = null;

export async function createPhotoFolder(token: string, parentFolderId?: string): Promise<string> {
  if (cachedPhotoFolderId) return cachedPhotoFolderId;

  const parentId = parentFolderId || await getOrCreateCoachShareFolder(token);

  const searchRes = await driveRequest(
    token,
    `https://www.googleapis.com/drive/v3/files?q=name='${COACH_PHOTO_SUBFOLDER}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)&pageSize=1`,
  );
  const searchData = await searchRes.json();
  if (searchData.files?.[0]) {
    cachedPhotoFolderId = searchData.files[0].id;
    return cachedPhotoFolderId!;
  }

  const res = await driveRequest(token, 'https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: COACH_PHOTO_SUBFOLDER, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const folder = await res.json();
  cachedPhotoFolderId = folder.id;
  return folder.id;
}

export async function findSharedClientFolders(token: string): Promise<{ folderId: string; ownerEmail: string; ownerName: string }[]> {
  try {
    const res = await driveRequest(token,
      `https://www.googleapis.com/drive/v3/files?q=name='${COACH_SHARE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and sharedWithMe=true and trashed=false&fields=files(id,owners)&pageSize=50`
    );
    const data = await res.json();
    return (data.files || []).map((f: any) => ({
      folderId: f.id,
      ownerEmail: f.owners?.[0]?.emailAddress || '',
      ownerName: f.owners?.[0]?.displayName || '',
    }));
  } catch {
    return [];
  }
}

export async function findDataFileInFolder(token: string, folderId: string): Promise<string | null> {
  try {
    // Sort by modifiedTime desc so we always read the most recently updated file
    // (guards against stale duplicates the client hasn't cleaned up yet)
    const res = await driveRequest(token,
      `https://www.googleapis.com/drive/v3/files?q=name='${COACH_FILE_NAME}' and '${folderId}' in parents and trashed=false&fields=files(id)&orderBy=modifiedTime desc&pageSize=1`
    );
    const data = await res.json();
    return data.files?.[0]?.id || null;
  } catch {
    return null;
  }
}

export async function fetchDriveImage(token: string, fileId: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Photo fetch failed: ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function uploadPhotoToFolder(
  token: string,
  folderId: string,
  _photoId: string,
  imageData: string,
  fileName: string,
): Promise<string> {
  const compressed = await compressBase64Image(imageData, 600, 0.7);

  // Convert data URL to binary
  const b64 = compressed.split(',')[1] || '';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'image/jpeg' });

  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const boundary = 'ape_photo_upload';

  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    metadata,
    `\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);

  const res = await driveRequest(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webContentLink', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const file = await res.json();
  return file.id;
}

function compressBase64Image(dataUrl: string, maxWidth: number, quality: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl.startsWith('data:') ? dataUrl : `data:image/jpeg;base64,${dataUrl}`;
  });
}

async function compressPhotosForSync(
  photos: { imageData: string; [key: string]: unknown }[],
): Promise<unknown[]> {
  return Promise.all(
    photos.map(async (photo) => {
      try {
        const compressed = await compressBase64Image(photo.imageData, 400, 0.6);
        return { ...photo, imageData: compressed };
      } catch {
        return photo;
      }
    }),
  );
}

export async function gatherCoachData(profileId?: string): Promise<object> {
  const db = await getDB();
  const [allWorkouts, allFood, allMeasurements, allPhotos, allPrograms, allCheckIns] = await Promise.all([
    db.getAll('workoutSessions'),
    db.getAll('foodEntries'),
    db.getAll('measurements'),
    db.getAll('progressPhotos'),
    db.getAll('programs'),
    db.getAll('checkIns'),
  ]);

  const profiles = JSON.parse(localStorage.getItem('fitos-profiles') || '[]');
  const profile = profileId ? profiles.find((p: { id: string }) => p.id === profileId) : profiles[0];
  const pid = profile?.id;

  return {
    _apeCoachShare: true,
    version: 3,
    updatedAt: new Date().toISOString(),
    profile: profile || {},
    workoutSessions: pid ? allWorkouts.filter((w: { profileId: string }) => w.profileId === pid) : allWorkouts,
    foodEntries: pid ? allFood.filter((f: { profileId: string }) => f.profileId === pid) : allFood,
    measurements: pid ? allMeasurements.filter((m: { profileId: string }) => m.profileId === pid) : allMeasurements,
    checkIns: pid ? allCheckIns.filter((c: { profileId: string }) => c.profileId === pid) : allCheckIns,
    progressPhotos: await compressPhotosForSync(
      (pid ? allPhotos.filter((p: { profileId: string }) => p.profileId === pid) : []) as unknown as { imageData: string; [key: string]: unknown }[]
    ),
    programs: allPrograms,
    pendingChanges: null,
    clientResponse: null,
  };
}

// --- Sync (appDataFolder) ---

export async function gatherAllData(googleEmail?: string): Promise<object> {
  const db = await getDB();

  const allProfiles = JSON.parse(localStorage.getItem('fitos-profiles') || '[]') as { id: string; googleEmail?: string }[];
  const profiles = googleEmail
    ? allProfiles.filter((p) => p.googleEmail === googleEmail)
    : allProfiles;
  const profileIds = new Set(profiles.map((p) => p.id));

  const [allWorkouts, allFood, allMeasurements, allPhotos, allPrograms, allCheckIns, allSteps, allWater] = await Promise.all([
    db.getAll('workoutSessions'),
    db.getAll('foodEntries'),
    db.getAll('measurements'),
    db.getAll('progressPhotos'),
    db.getAll('programs'),
    db.getAll('checkIns'),
    db.getAll('steps'),
    db.getAll('water'),
  ]);

  const workoutSessions = allWorkouts.filter((w: { profileId: string }) => profileIds.has(w.profileId));
  const foodEntries = allFood.filter((f: { profileId: string }) => profileIds.has(f.profileId));
  const measurements = allMeasurements.filter((m: { profileId: string }) => profileIds.has(m.profileId));
  const progressPhotos = allPhotos.filter((p: { profileId: string }) => profileIds.has(p.profileId));
  const checkIns = allCheckIns.filter((c: { profileId: string }) => profileIds.has(c.profileId));
  const steps = allSteps.filter((s: { profileId: string }) => profileIds.has(s.profileId));
  const waterEntries = allWater.filter((w: { profileId: string }) => profileIds.has(w.profileId));

  // Sync all fitos-* localStorage keys except sensitive/device-specific ones
  const SKIP_SYNC = new Set([
    'fitos-profiles',          // synced separately
    'fitos-active-profile',    // device-specific
    'fitos-google-user',       // device-specific auth cache
    'fitos-last-synced',       // device-specific
    'fitos-usda-key',          // sensitive API key
    'fitos-claude-key',        // sensitive API key
    'fitos-claude-enabled',    // tied to sensitive key
  ]);
  const settings: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('fitos-') && !SKIP_SYNC.has(key) && !key.startsWith('fitos-food-history-') && !key.startsWith('fitos-saved-meals-') && !key.startsWith('fitos-recipes-') && !key.startsWith('fitos-food-notes-') && !key.startsWith('fitos-meal-plans-')) {
      settings[key] = localStorage.getItem(key);
    }
  }

  const profileExtras: Record<string, Record<string, string | null>> = {};
  for (const p of profiles) {
    profileExtras[p.id] = {
      foodHistory: localStorage.getItem(`fitos-food-history-${p.id}`),
      savedMeals: localStorage.getItem(`fitos-saved-meals-${p.id}`),
      recipes: localStorage.getItem(`fitos-recipes-${p.id}`),
      foodNotes: localStorage.getItem(`fitos-food-notes-${p.id}`),
      mealPlans: localStorage.getItem(`fitos-meal-plans-${p.id}`),
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
    checkIns,
    steps,
    water: waterEntries,
    programs: allPrograms.filter((p) => !p.isBuiltIn),
  };
}

export async function restoreAllData(data: Record<string, unknown>, googleEmail?: string): Promise<void> {
  const db = await getDB();

  if (data.profiles && Array.isArray(data.profiles)) {
    const existingProfiles = JSON.parse(localStorage.getItem('fitos-profiles') || '[]') as { id: string; googleEmail?: string }[];
    // Keep local-only profiles, replace Google profiles for this account
    const localProfiles = existingProfiles.filter((p) => !p.googleEmail || (googleEmail && p.googleEmail !== googleEmail));
    const merged = [...localProfiles, ...(data.profiles as unknown[])];
    localStorage.setItem('fitos-profiles', JSON.stringify(merged));
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
      if (extras.recipes) localStorage.setItem(`fitos-recipes-${profileId}`, extras.recipes);
      if (extras.foodNotes) localStorage.setItem(`fitos-food-notes-${profileId}`, extras.foodNotes);
      if (extras.mealPlans) localStorage.setItem(`fitos-meal-plans-${profileId}`, extras.mealPlans);
    }
  }

  const stores = ['workoutSessions', 'foodEntries', 'measurements', 'progressPhotos', 'checkIns', 'steps', 'water'] as const;
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
