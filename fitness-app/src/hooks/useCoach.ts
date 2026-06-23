import { useState, useCallback } from 'react';
import { getAccessToken, requireAccessToken, ensureCoachToken, hasCoachScope } from '../utils/googleAuth';
import { sendCoachInvite, getPendingInvites, removeInvite, type CoachInvite } from '../utils/coachInvites';
import {
  createCoachShareFile,
  readSharedFile,
  writeSharedFile,
  deleteFile,
  revokeSharePermission,
  gatherCoachData,
  createPhotoFolder,
  uploadPhotoToFolder,
  getOrCreateRootFolder,
  getOrCreateCoachShareFolder,
  findSharedClientFolders,
  findDataFileInFolder,
  getFileParentFolder,
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
const BLOCK_KEY = 'fitos-coach-blocklist';
export const PENDING_COACH_CHANGES_FLAG = 'fitos-pending-coach-changes';

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
function loadBlockList(): string[] {
  try { return JSON.parse(localStorage.getItem(BLOCK_KEY) || '[]'); } catch { return []; }
}
function saveBlockList(list: string[]) {
  localStorage.setItem(BLOCK_KEY, JSON.stringify(list));
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
  const [pendingInvites, setPendingInvites] = useState<CoachInvite[]>([]);
  const [blockList, setBlockList] = useState<string[]>(loadBlockList);

  const myCoachRels = relationships.filter((r) => r.role === 'client');
  const myClients = relationships.filter((r) => r.role === 'coach');

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
    const allMeasurements = await db.getAll('measurements') as { profileId: string; date: string; weight?: number }[];
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
      // Prefer logged measurement weight over photo-specific weight
      const effectiveWeight = (() => {
        const ms = allMeasurements.filter((m) => m.profileId === photo.profileId && m.weight != null);
        if (ms.length === 0) return photo.weight;
        const target = new Date(photo.date + 'T00:00:00').getTime();
        let best = ms[0];
        let bestDiff = Math.abs(new Date(best.date + 'T00:00:00').getTime() - target);
        for (const m of ms) {
          const diff = Math.abs(new Date(m.date + 'T00:00:00').getTime() - target);
          if (diff < bestDiff) { best = m; bestDiff = diff; }
        }
        return bestDiff <= 7 * 86400000 ? best.weight : photo.weight;
      })();
      photoMeta.push({ photoId: photo.id, driveFileId, date: photo.date, pose: photo.pose, weight: effectiveWeight, notes: photo.notes });
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
      const data = await gatherCoachData() as Record<string, unknown>;

      // Create isolated folder + data file + share folder with coach (sends email notification)
      const { fileId, folderId: shareFolderId } = await createCoachShareFile(token, JSON.stringify(data), coachEmail);

      // Create photo subfolder inside the isolated share folder
      const photoFolderId = await createPhotoFolder(token, shareFolderId);
      const photoMeta = await uploadAllPhotos(token, photoFolderId);

      // Update the file with photo metadata
      data.progressPhotos = [];
      data.photoMeta = photoMeta;
      data.photoFolderId = photoFolderId;
      data.coachPermission = permission;
      await writeSharedFile(token, fileId, JSON.stringify(data));

      const rel: CoachRelationship = {
        fileId, shareFolderId, photoFolderId, coachEmail,
        permission, role: 'client', createdAt: new Date().toISOString(),
      };
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

    // Deduplicate relationships — if shareWithCoach was called more than once for
    // the same coach, keep only the most recently created entry and delete the old file
    const seen = new Map<string, CoachRelationship>();
    for (const rel of myCoachRels) {
      const key = (rel.coachEmail || rel.fileId).toLowerCase();
      const prev = seen.get(key);
      if (!prev || new Date(rel.createdAt) > new Date(prev.createdAt)) {
        seen.set(key, rel);
      }
    }
    const staleRels = myCoachRels.filter((r) => !seen.has((r.coachEmail || r.fileId).toLowerCase()) || seen.get((r.coachEmail || r.fileId).toLowerCase()) !== r);
    if (staleRels.length > 0) {
      for (const old of staleRels) {
        try { await deleteFile(token, old.fileId); } catch { /* best-effort */ }
      }
      const cleaned = relationships.filter((r) => !staleRels.includes(r));
      saveRelationships(cleaned);
      setRelationships(cleaned);
    }
    const dedupedRels = [...seen.values()];

    for (const rel of dedupedRels) {
      try {
        let existing: Record<string, unknown> = {};
        try {
          const raw = await readSharedFile(token, rel.fileId);
          existing = JSON.parse(raw);
        } catch { /* file might not exist */ }

        // Ensure photo folder exists inside the isolated share folder
        let photoFolderId = rel.photoFolderId;
        if (!photoFolderId) {
          const shareFolderId = rel.shareFolderId || await getOrCreateCoachShareFolder(token);
          photoFolderId = await createPhotoFolder(token, shareFolderId);
          const updatedRel = { ...rel, photoFolderId, shareFolderId };
          const updatedRels = relationships.map((r) => r.fileId === rel.fileId ? updatedRel : r);
          saveRelationships(updatedRels);
          setRelationships(updatedRels);
        }

        const photoMeta = await uploadAllPhotos(token, photoFolderId);
        const fileData = { ...freshData };
        fileData.pendingChanges = existing.pendingChanges || null;
        fileData.clientResponse = existing.clientResponse || null;
        fileData.progressPhotos = [];
        fileData.photoMeta = photoMeta;
        fileData.photoFolderId = photoFolderId;
        fileData.coachPermission = rel.permission;
        await writeSharedFile(token, rel.fileId, JSON.stringify(fileData));
      } catch (err) {
        console.error('Failed to sync coach file for', rel.coachEmail, err);
      }
    }
  }, [myCoachRels, relationships, uploadAllPhotos]);

  const checkForCoachChanges = useCallback(async () => {
    const fullAccessRels = myCoachRels.filter((r) => r.permission === 'full');
    if (fullAccessRels.length === 0) return;
    const token = getAccessToken() || await requireAccessToken();
    const lastAccepted = localStorage.getItem('fitos-last-accepted-push');

    for (const rel of fullAccessRels) {
      try {
        const raw = await readSharedFile(token, rel.fileId);
        const data = JSON.parse(raw);
        if (data.clientResponse && !data.pendingChanges) continue;
        if (data.pendingChanges) {
          const migrated = migrateFlatChanges(data.pendingChanges);
          // Skip if we already accepted this exact push
          if (lastAccepted && migrated.pushedAt === lastAccepted) continue;
          if (migrated.items && migrated.items.length > 0) {
            setPendingChanges(migrated);
            setPendingCoachFileId(rel.fileId);
            localStorage.setItem(PENDING_COACH_CHANGES_FLAG, '1');
            return;
          }
        }
      } catch (err) {
        console.error('Failed to check coach changes for', rel.coachEmail, err);
      }
    }
    setPendingChanges(null);
    setPendingCoachFileId(null);
    localStorage.removeItem(PENDING_COACH_CHANGES_FLAG);
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
    localStorage.removeItem(PENDING_COACH_CHANGES_FLAG);
    // Record the pushedAt timestamp we just handled so we never re-show it
    localStorage.setItem('fitos-last-accepted-push', changes.pushedAt);
  }, [myCoachRels, pendingCoachFileId, applyChangeItem, addLogEntry]);

  const revokeCoachAccess = useCallback(async (fileId: string) => {
    const rel = relationships.find((r) => r.fileId === fileId);
    try {
      const token = await requireAccessToken();
      const targetId = rel?.shareFolderId || fileId;
      // Revoke the permission FIRST — deleting/trashing a file does not revoke active share grants
      if (rel?.coachEmail) {
        await revokeSharePermission(token, targetId, rel.coachEmail);
      }
      await deleteFile(token, targetId);
    } catch { /* still remove locally */ }
    const updated = relationships.filter((r) => r.fileId !== fileId);
    saveRelationships(updated);
    setRelationships(updated);
  }, [relationships]);

  // --- Coach side ---

  const discoverClients = useCallback(async (): Promise<{ fileId: string; folderId: string; email: string; name: string }[]> => {
    const token = getAccessToken() || await requireAccessToken();
    try {
      const folders = await findSharedClientFolders(token);
      const existingFolderIds = new Set(myClients.map((c) => c.shareFolderId).filter(Boolean));
      const existingFileIds = new Set(myClients.map((c) => c.fileId));
      const results: { fileId: string; folderId: string; email: string; name: string }[] = [];

      for (const folder of folders) {
        if (existingFolderIds.has(folder.folderId)) continue;
        const dataFileId = await findDataFileInFolder(token, folder.folderId);
        if (dataFileId && !existingFileIds.has(dataFileId)) {
          results.push({ fileId: dataFileId, folderId: folder.folderId, email: folder.ownerEmail, name: folder.ownerName });
        }
      }
      return results;
    } catch (err) {
      console.error('Failed to discover clients:', err);
      return [];
    }
  }, [myClients]);

  const addClient = useCallback((fileId: string, clientName?: string, clientEmail?: string, shareFolderId?: string) => {
    const rel: CoachRelationship = { fileId, shareFolderId, clientName: clientName || 'Client', clientEmail, role: 'coach', permission: 'full', createdAt: new Date().toISOString() };
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
    let token: string;
    try {
      token = hasCoachScope() ? await ensureCoachToken() : (getAccessToken() || await requireAccessToken());
    } catch {
      return { error: 'Not signed in to Google. Sign in first.' };
    }

    // Always do a fresh folder search so we read the most recently modified file.
    // This auto-heals stale cached fileIds (duplicates, re-shares, etc.).
    let actualFileId = fileId;
    const rel = relationships.find((r) => r.role === 'coach' && r.fileId === fileId);
    try {
      // Get folder ID — stored in relationship, or fetch from Drive as fallback
      let folderId = rel?.shareFolderId;
      if (!folderId) {
        folderId = await getFileParentFolder(token, fileId) ?? undefined;
        if (folderId && rel) {
          const updatedRels = relationships.map((r) =>
            r.role === 'coach' && r.fileId === fileId ? { ...r, shareFolderId: folderId } : r
          );
          saveRelationships(updatedRels);
          setRelationships(updatedRels);
        }
      }
      if (folderId) {
        const freshId = await findDataFileInFolder(token, folderId);
        if (freshId && freshId !== fileId) {
          actualFileId = freshId;
          const updatedRels = relationships.map((r) =>
            r.role === 'coach' && r.fileId === fileId ? { ...r, fileId: freshId, shareFolderId: folderId } : r
          );
          saveRelationships(updatedRels);
          setRelationships(updatedRels);
        }
      }
    } catch { /* non-fatal — fall back to cached fileId */ }

    try {
      const raw = await readSharedFile(token, actualFileId);
      return JSON.parse(raw);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('TOKEN_EXPIRED')) {
        try {
          token = hasCoachScope() ? await ensureCoachToken() : await requireAccessToken();
          const raw = await readSharedFile(token, actualFileId);
          return JSON.parse(raw);
        } catch (retryErr) {
          console.error('Retry failed:', retryErr);
          return { error: 'Token expired and refresh failed. Try signing out and back in.' };
        }
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed to read client data:', msg);
      if (msg.includes('404')) return { error: 'Client file not found. They may not have synced yet.' };
      if (msg.includes('403')) return { error: 'Permission denied. The client needs to share their data with you.' };
      return { error: `Failed to load: ${msg}` };
    }
  }, [relationships]);

  const pushChangesToClient = useCallback(async (fileId: string, changes: PendingCoachChanges): Promise<{ ok: boolean; error?: string }> => {
    const token = await ensureCoachToken();
    setLoading(true);
    try {
      const raw = await readSharedFile(token, fileId);
      const data = JSON.parse(raw);
      data.pendingChanges = changes;
      await writeSharedFile(token, fileId, JSON.stringify(data));
      addLogEntry({
        id: crypto.randomUUID(), timestamp: new Date().toISOString(), direction: 'pushed',
        fileId,
        items: changes.items.map((item) => ({ type: item.type, label: item.label, coachNote: item.coachNote })),
      });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed to push changes:', msg);
      if (msg.includes('403')) return { ok: false, error: 'Permission denied — make sure coach Drive access is granted (re-add the client).' };
      if (msg.includes('404')) return { ok: false, error: 'Client file not found. Ask client to sync their data.' };
      return { ok: false, error: `Push failed: ${msg}` };
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

  // --- Invite / block system ---

  const checkPendingInvites = useCallback(async (myEmail: string) => {
    try {
      const blocked = loadBlockList();
      const invites = await getPendingInvites(myEmail);
      setPendingInvites(invites.filter((i) => !blocked.includes(i.coachEmail.toLowerCase())));
    } catch { /* non-fatal */ }
  }, []);

  const inviteClient = useCallback(async (clientEmail: string, coachEmail: string, coachName: string) => {
    await sendCoachInvite(coachEmail, coachName, clientEmail);
  }, []);

  const acceptInvite = useCallback(async (invite: CoachInvite, permission: 'full' | 'readonly') => {
    await shareWithCoach(invite.coachEmail, permission);
    await removeInvite(invite.id, invite.clientEmail).catch(() => {});
    setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }, [shareWithCoach]);

  const declineInvite = useCallback(async (invite: CoachInvite) => {
    await removeInvite(invite.id, invite.clientEmail).catch(() => {});
    setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }, []);

  const blockAndDeclineInvite = useCallback(async (invite: CoachInvite) => {
    const list = loadBlockList();
    const email = invite.coachEmail.toLowerCase();
    if (!list.includes(email)) {
      const updated = [...list, email];
      saveBlockList(updated);
      setBlockList(updated);
    }
    await removeInvite(invite.id, invite.clientEmail).catch(() => {});
    setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }, []);

  const unblockCoach = useCallback((email: string) => {
    const updated = loadBlockList().filter((e) => e !== email.toLowerCase());
    saveBlockList(updated);
    setBlockList(updated);
  }, []);

  return {
    relationships, myCoachRels, myClients, loading,
    pendingChanges, clientResponse,
    // Client
    shareWithCoach, syncCoachFiles, checkForCoachChanges, finalizeResponses, revokeCoachAccess,
    // Coach
    addClient, removeClient, discoverClients, getClientData, pushChangesToClient,
    checkForClientResponse, acknowledgeClientResponse, backupClientData,
    // Invite / block
    pendingInvites, blockList,
    checkPendingInvites, inviteClient, acceptInvite, declineInvite, blockAndDeclineInvite, unblockCoach,
    // Log
    addLogEntry, getLog,
  };
}
