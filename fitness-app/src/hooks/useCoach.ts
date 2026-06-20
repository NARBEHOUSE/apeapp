import { useState, useCallback, useRef } from 'react';
import { getAccessToken, requireAccessToken } from '../utils/googleAuth';
import {
  createCoachShareFile,
  readSharedFile,
  writeSharedFile,
  deleteFile,
  gatherCoachData,
  createPhotoFolder,
  sharePhotoFolderWithCoach,
  uploadPhotoToFolder,
  getOrCreateRootFolder,
} from '../utils/googleDrive';
import { getDB } from '../db';
import type {
  CoachRelationship,
  CoachChangeItem,
  CoachPhotoMeta,
  PendingCoachChanges,
  CoachChangeResponse,
  PendingClientResponse,
  CoachLogEntry,
  Profile,
  MacroTargets,
  Program,
} from '../types';

const COACH_KEY = 'fitos-coach-relationships';
const LOG_KEY = 'fitos-coach-log';
const UPLOADED_PHOTOS_KEY = 'fitos-coach-uploaded-photos';

function loadRelationships(): CoachRelationship[] {
  try {
    return (JSON.parse(localStorage.getItem(COACH_KEY) || '[]') as CoachRelationship[]).map((r) => ({
      ...r,
      permission: r.permission || 'full',
    }));
  } catch { return []; }
}
function saveRelationships(rels: CoachRelationship[]) {
  localStorage.setItem(COACH_KEY, JSON.stringify(rels));
}
function loadLog(): CoachLogEntry[] {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; }
}
function saveLog(log: CoachLogEntry[]) {
  localStorage.setItem(LOG_KEY, JSON.stringify(log));
}

function migrateFlatChanges(raw: Record<string, unknown>): PendingCoachChanges {
  if (raw.items && Array.isArray(raw.items)) return raw as unknown as PendingCoachChanges;
  const items: CoachChangeItem[] = [];
  if (raw.macroTargets) {
    const m = raw.macroTargets as MacroTargets;
    items.push({ id: crypto.randomUUID(), type: 'macros', label: `Macros: ${m.protein}p / ${m.carbs}c / ${m.fat}f`, data: m, coachNote: raw.note as string | undefined });
  }
  if (raw.program) {
    const p = raw.program as Program;
    items.push({ id: crypto.randomUUID(), type: 'program', label: `Program: ${p.name}`, data: p });
  }
  return { items, pushedAt: (raw.pushedAt as string) || new Date().toISOString() };
}

export function useCoach() {
  const [relationships, setRelationships] = useState<CoachRelationship[]>(loadRelationships);
  const [loading, setLoading] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<PendingCoachChanges | null>(null);
  const [pendingCoachFileId, setPendingCoachFileId] = useState<string | null>(null);
  const [clientResponse, setClientResponse] = useState<PendingClientResponse | null>(null);

  const myCoachRels = relationships.filter((r) => r.role === 'client');
  const myClients = relationships.filter((r) => r.role === 'coach');
  const justFinalizedRef = useRef(false);

  // --- Change log ---
  const addLogEntry = useCallback((entry: CoachLogEntry) => {
    const log = loadLog();
    log.unshift(entry);
    if (log.length > 100) log.length = 100;
    saveLog(log);
  }, []);
  const getLog = useCallback(() => loadLog(), []);

  // --- Client side ---

  const uploadAllPhotos = useCallback(async (token: string, folderId: string): Promise<CoachPhotoMeta[]> => {
    const uploadedMap: Record<string, string> = JSON.parse(localStorage.getItem(UPLOADED_PHOTOS_KEY) || '{}');
    const db = await getDB();
    const allPhotos = await db.getAll('progressPhotos');
    const profiles = JSON.parse(localStorage.getItem('fitos-profiles') || '[]') as { id: string }[];
    const profileIds = new Set(profiles.map((p) => p.id));
    const myPhotos = (allPhotos as { id: string; profileId: string; imageData: string; date: string; pose: string; weight?: number; notes?: string }[])
      .filter((p) => profileIds.has(p.profileId));
    const photoMeta: CoachPhotoMeta[] = [];

    for (const photo of myPhotos) {
      let driveFileId = uploadedMap[photo.id];
      if (!driveFileId) {
        try {
          driveFileId = await uploadPhotoToFolder(token, folderId, photo.id, photo.imageData, `${photo.date}_${photo.pose}.jpg`);
          uploadedMap[photo.id] = driveFileId;
        } catch (err) {
          console.error('Photo upload failed:', photo.id, err);
          continue;
        }
      }
      photoMeta.push({ photoId: photo.id, driveFileId, date: photo.date, pose: photo.pose, weight: photo.weight, notes: photo.notes });
    }

    const currentIds = new Set(myPhotos.map((p) => p.id));
    for (const pid of Object.keys(uploadedMap)) {
      if (!currentIds.has(pid)) {
        try { await deleteFile(token, uploadedMap[pid]); } catch { /* gone */ }
        delete uploadedMap[pid];
      }
    }
    localStorage.setItem(UPLOADED_PHOTOS_KEY, JSON.stringify(uploadedMap));
    return photoMeta;
  }, []);

  const shareWithCoach = useCallback(async (coachEmail: string, permission: 'full' | 'readonly'): Promise<string | null> => {
    const token = await requireAccessToken();
    setLoading(true);
    try {
      const folderId = await createPhotoFolder(token);
      await sharePhotoFolderWithCoach(token, folderId, coachEmail);
      const photoMeta = await uploadAllPhotos(token, folderId);

      const data = await gatherCoachData() as Record<string, unknown>;
      data.progressPhotos = [];
      data.photoMeta = photoMeta;
      data.photoFolderId = folderId;
      data.coachPermission = permission;

      const content = JSON.stringify(data);
      const fileId = await createCoachShareFile(token, content, coachEmail);
      const rel: CoachRelationship = { fileId, coachEmail, photoFolderId: folderId, permission, role: 'client', createdAt: new Date().toISOString() };
      const updated = [...relationships, rel];
      saveRelationships(updated);
      setRelationships(updated);
      return fileId;
    } catch (err) {
      console.error('Failed to share with coach:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [relationships, uploadAllPhotos]);

  const syncCoachFiles = useCallback(async () => {
    if (myCoachRels.length === 0) return;
    const token = getAccessToken() || await requireAccessToken();
    const freshData = await gatherCoachData() as Record<string, unknown>;

    for (const rel of myCoachRels) {
      try {
        let existing: Record<string, unknown> = {};
        try {
          const raw = await readSharedFile(token, rel.fileId);
          existing = JSON.parse(raw);
        } catch { /* file might not exist */ }

        let folderId = rel.photoFolderId;
        if (!folderId) {
          folderId = await createPhotoFolder(token);
          if (rel.coachEmail) await sharePhotoFolderWithCoach(token, folderId, rel.coachEmail);
          const updatedRel = { ...rel, photoFolderId: folderId };
          const updatedRels = relationships.map((r) => r.fileId === rel.fileId ? updatedRel : r);
          saveRelationships(updatedRels);
          setRelationships(updatedRels);
        }

        const photoMeta = await uploadAllPhotos(token, folderId);
        const fileData = { ...freshData };
        // If client already responded, clear pendingChanges so they don't reappear
        fileData.pendingChanges = existing.pendingChanges || null;
        fileData.clientResponse = existing.clientResponse || null;
        fileData.progressPhotos = [];
        fileData.photoMeta = photoMeta;
        fileData.photoFolderId = folderId;
        fileData.coachPermission = rel.permission;
        await writeSharedFile(token, rel.fileId, JSON.stringify(fileData));
      } catch (err) {
        console.error('Failed to sync coach file for', rel.coachEmail, err);
      }
    }
  }, [myCoachRels, relationships, uploadAllPhotos]);

  const checkForCoachChanges = useCallback(async () => {
    if (justFinalizedRef.current) return;
    const fullAccessRels = myCoachRels.filter((r) => r.permission === 'full');
    if (fullAccessRels.length === 0) return;
    const token = getAccessToken() || await requireAccessToken();

    for (const rel of fullAccessRels) {
      try {
        const raw = await readSharedFile(token, rel.fileId);
        const data = JSON.parse(raw);
        // Skip if we already responded AND there are no new pending changes
        if (data.clientResponse && !data.pendingChanges) continue;
        if (data.pendingChanges) {
          const migrated = migrateFlatChanges(data.pendingChanges);
          console.log('Coach changes found:', migrated.items?.length, 'items', migrated.items?.map((i: CoachChangeItem) => i.type));
          if (migrated.items && migrated.items.length > 0) {
            setPendingChanges(migrated);
            setPendingCoachFileId(rel.fileId);
            return;
          }
        }
      } catch (err) {
        console.error('Failed to check coach changes for', rel.coachEmail, err);
      }
    }
    // No pending changes found across any coach
    setPendingChanges(null);
    setPendingCoachFileId(null);
  }, [myCoachRels]);

  const applyChangeItem = useCallback(async (
    item: CoachChangeItem,
    profile: Profile,
    onUpdateProfile: (id: string, updates: Partial<Profile>) => void,
  ) => {
    if (item.type === 'macros') {
      const m = item.data as MacroTargets;
      const cals = m.protein * 4 + m.carbs * 4 + m.fat * 9;
      onUpdateProfile(profile.id, { macroTargets: { ...m, calories: cals } });
    } else if (item.type === 'program') {
      const prog = item.data as Program;
      const { getDB } = await import('../db');
      const db = await getDB();
      await db.put('programs', { ...prog, isBuiltIn: false });
    } else if (item.type === 'note' && typeof item.data === 'string') {
      try {
        const parsed = JSON.parse(item.data);
        if (parsed.action === 'set_questions' && Array.isArray(parsed.questions)) {
          localStorage.setItem('fitos-checkin-questions', JSON.stringify(parsed.questions));
        }
      } catch { /* not a structured note */ }
    }
  }, []);

  const finalizeResponses = useCallback(async (
    responses: CoachChangeResponse[],
    changes: PendingCoachChanges,
    profile: Profile,
    onUpdateProfile: (id: string, updates: Partial<Profile>) => void,
  ) => {
    for (const resp of responses) {
      if (resp.action === 'accepted') {
        const item = changes.items.find((i) => i.id === resp.itemId);
        if (item) await applyChangeItem(item, profile, onUpdateProfile);
      }
    }

    const targetFileId = pendingCoachFileId || myCoachRels[0]?.fileId;
    if (targetFileId) {
      try {
        const token = await requireAccessToken();
        const freshData = await gatherCoachData() as Record<string, unknown>;
        freshData.pendingChanges = null;
        freshData.clientResponse = { responses, respondedAt: new Date().toISOString() } as PendingClientResponse;
        await writeSharedFile(token, targetFileId, JSON.stringify(freshData));
      } catch (err) {
        console.error('Failed to write client response:', err);
      }
    }

    const coachRel = pendingCoachFileId ? myCoachRels.find((r) => r.fileId === pendingCoachFileId) : myCoachRels[0];
    addLogEntry({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      direction: 'responded',
      coachEmail: coachRel?.coachEmail,
      items: changes.items.map((item) => {
        const resp = responses.find((r) => r.itemId === item.id);
        return { type: item.type, label: item.label, coachNote: item.coachNote, action: resp?.action, clientNote: resp?.clientNote };
      }),
    });

    setPendingChanges(null);
    setPendingCoachFileId(null);
    justFinalizedRef.current = true;
    // Reset after a delay so future checks work on next app open
    setTimeout(() => { justFinalizedRef.current = false; }, 10_000);
  }, [myCoachRels, pendingCoachFileId, applyChangeItem, addLogEntry]);

  const revokeCoachAccess = useCallback(async (fileId: string) => {
    try {
      const token = await requireAccessToken();
      await deleteFile(token, fileId);
    } catch { /* still remove locally */ }
    const updated = relationships.filter((r) => r.fileId !== fileId);
    saveRelationships(updated);
    setRelationships(updated);
  }, [relationships]);

  // --- Coach side ---

  const addClient = useCallback((fileId: string, clientName?: string, clientEmail?: string) => {
    const rel: CoachRelationship = { fileId, clientName: clientName || 'Client', clientEmail, role: 'coach', permission: 'full', createdAt: new Date().toISOString() };
    const updated = [...relationships.filter((r) => !(r.role === 'coach' && r.fileId === fileId)), rel];
    saveRelationships(updated);
    setRelationships(updated);
  }, [relationships]);

  const removeClient = useCallback((fileId: string) => {
    const updated = relationships.filter((r) => !(r.role === 'coach' && r.fileId === fileId));
    saveRelationships(updated);
    setRelationships(updated);
  }, [relationships]);

  const getClientData = useCallback(async (fileId: string) => {
    let token = getAccessToken();
    if (!token) token = await requireAccessToken();
    try {
      const raw = await readSharedFile(token, fileId);
      return JSON.parse(raw);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('TOKEN_EXPIRED')) {
        token = await requireAccessToken();
        try {
          const raw = await readSharedFile(token, fileId);
          return JSON.parse(raw);
        } catch { return null; }
      }
      console.error('Failed to read client data:', err);
      return null;
    }
  }, []);

  const pushChangesToClient = useCallback(async (fileId: string, changes: PendingCoachChanges) => {
    const token = getAccessToken() || await requireAccessToken();
    setLoading(true);
    try {
      const raw = await readSharedFile(token, fileId);
      const data = JSON.parse(raw);
      data.pendingChanges = changes;
      await writeSharedFile(token, fileId, JSON.stringify(data));
      addLogEntry({
        id: crypto.randomUUID(), timestamp: new Date().toISOString(), direction: 'pushed',
        items: changes.items.map((item) => ({ type: item.type, label: item.label, coachNote: item.coachNote })),
      });
      return true;
    } catch (err) {
      console.error('Failed to push changes:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [addLogEntry]);

  const checkForClientResponse = useCallback(async (fileId: string): Promise<PendingClientResponse | null> => {
    const token = getAccessToken() || await requireAccessToken();
    try {
      const raw = await readSharedFile(token, fileId);
      const data = JSON.parse(raw);
      return data.clientResponse || null;
    } catch { return null; }
  }, []);

  const acknowledgeClientResponse = useCallback(async (fileId: string) => {
    const token = getAccessToken() || await requireAccessToken();
    try {
      const raw = await readSharedFile(token, fileId);
      const data = JSON.parse(raw);
      data.clientResponse = null;
      await writeSharedFile(token, fileId, JSON.stringify(data));
      setClientResponse(null);
    } catch (err) {
      console.error('Failed to acknowledge response:', err);
    }
  }, []);

  const backupClientData = useCallback(async (fileId: string, clientName: string): Promise<boolean> => {
    const token = getAccessToken() || await requireAccessToken();
    try {
      const raw = await readSharedFile(token, fileId);
      const rootId = await getOrCreateRootFolder(token);

      // Create or find Client Backups folder
      const folderSearchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='Client Backups' and '${rootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id)&pageSize=1`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const folderData = await folderSearchRes.json();
      let backupFolderId = folderData.files?.[0]?.id;
      if (!backupFolderId) {
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Client Backups', mimeType: 'application/vnd.google-apps.folder', parents: [rootId] }),
        });
        backupFolderId = (await createRes.json()).id;
      }

      // Save backup with timestamp
      const date = new Date().toISOString().split('T')[0];
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(/:/g, '-');
      const fileName = `${clientName}_${date}_${time}.json`;
      const metadata = JSON.stringify({ name: fileName, parents: [backupFolderId] });
      const boundary = 'ape_backup_boundary';
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${raw}\r\n--${boundary}--`;
      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      });
      return true;
    } catch (err) {
      console.error('Backup failed:', err);
      return false;
    }
  }, []);

  return {
    relationships, myCoachRels, myClients, loading,
    pendingChanges, clientResponse,
    // Client
    shareWithCoach, syncCoachFiles, checkForCoachChanges, finalizeResponses, revokeCoachAccess,
    // Coach
    addClient, removeClient, getClientData, pushChangesToClient,
    checkForClientResponse, acknowledgeClientResponse, backupClientData,
    // Log
    addLogEntry, getLog,
  };
}
