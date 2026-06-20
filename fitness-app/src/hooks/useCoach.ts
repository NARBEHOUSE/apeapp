import { useState, useCallback } from 'react';
import { getAccessToken, requireAccessToken } from '../utils/googleAuth';
import {
  createCoachShareFile,
  readSharedFile,
  writeSharedFile,
  deleteFile,
  gatherCoachData,
} from '../utils/googleDrive';
import type {
  CoachRelationship,
  CoachChangeItem,
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

function loadRelationships(): CoachRelationship[] {
  try { return JSON.parse(localStorage.getItem(COACH_KEY) || '[]'); } catch { return []; }
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
    items.push({
      id: crypto.randomUUID(),
      type: 'macros',
      label: `Macros: ${m.protein}p / ${m.carbs}c / ${m.fat}f`,
      data: m,
      coachNote: raw.note as string | undefined,
    });
  }
  if (raw.program) {
    const p = raw.program as Program;
    items.push({
      id: crypto.randomUUID(),
      type: 'program',
      label: `Program: ${p.name}`,
      data: p,
    });
  }
  return { items, pushedAt: (raw.pushedAt as string) || new Date().toISOString() };
}

export function useCoach() {
  const [relationships, setRelationships] = useState<CoachRelationship[]>(loadRelationships);
  const [loading, setLoading] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<PendingCoachChanges | null>(null);
  const [clientResponse, setClientResponse] = useState<PendingClientResponse | null>(null);

  const myCoachRel = relationships.find((r) => r.role === 'client');
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

  const shareWithCoach = useCallback(async (coachEmail: string): Promise<string | null> => {
    const token = await requireAccessToken();
    setLoading(true);
    try {
      const data = await gatherCoachData();
      const content = JSON.stringify(data);
      const fileId = await createCoachShareFile(token, content, coachEmail);
      const rel: CoachRelationship = { fileId, coachEmail, role: 'client', createdAt: new Date().toISOString() };
      const updated = [...relationships.filter((r) => r.role !== 'client'), rel];
      saveRelationships(updated);
      setRelationships(updated);
      return fileId;
    } catch (err) {
      console.error('Failed to share with coach:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [relationships]);

  const syncCoachFile = useCallback(async () => {
    if (!myCoachRel) return;
    const token = await requireAccessToken();
    setLoading(true);
    try {
      const data = await gatherCoachData();
      await writeSharedFile(token, myCoachRel.fileId, JSON.stringify(data));
    } catch (err) {
      console.error('Failed to sync coach file:', err);
    } finally {
      setLoading(false);
    }
  }, [myCoachRel]);

  const checkForCoachChanges = useCallback(async () => {
    if (!myCoachRel) return;
    const token = getAccessToken();
    if (!token) return;
    try {
      const raw = await readSharedFile(token, myCoachRel.fileId);
      const data = JSON.parse(raw);
      if (data.pendingChanges) {
        setPendingChanges(migrateFlatChanges(data.pendingChanges));
      }
    } catch (err) {
      console.error('Failed to check coach changes:', err);
    }
  }, [myCoachRel]);

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
    }
  }, []);

  const finalizeResponses = useCallback(async (
    responses: CoachChangeResponse[],
    changes: PendingCoachChanges,
    profile: Profile,
    onUpdateProfile: (id: string, updates: Partial<Profile>) => void,
  ) => {
    // Apply accepted items
    for (const resp of responses) {
      if (resp.action === 'accepted') {
        const item = changes.items.find((i) => i.id === resp.itemId);
        if (item) await applyChangeItem(item, profile, onUpdateProfile);
      }
    }

    // Write client response to shared file and clear pendingChanges
    if (myCoachRel) {
      try {
        const token = await requireAccessToken();
        const raw = await readSharedFile(token, myCoachRel.fileId);
        const data = JSON.parse(raw);
        data.pendingChanges = null;
        data.clientResponse = { responses, respondedAt: new Date().toISOString() } as PendingClientResponse;
        await writeSharedFile(token, myCoachRel.fileId, JSON.stringify(data));
      } catch (err) {
        console.error('Failed to write client response:', err);
      }
    }

    // Log it
    addLogEntry({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      direction: 'responded',
      coachEmail: myCoachRel?.coachEmail,
      items: changes.items.map((item) => {
        const resp = responses.find((r) => r.itemId === item.id);
        return {
          type: item.type,
          label: item.label,
          coachNote: item.coachNote,
          action: resp?.action,
          clientNote: resp?.clientNote,
        };
      }),
    });

    setPendingChanges(null);
  }, [myCoachRel, applyChangeItem, addLogEntry]);

  const revokeCoachAccess = useCallback(async () => {
    if (!myCoachRel) return;
    try {
      const token = await requireAccessToken();
      await deleteFile(token, myCoachRel.fileId);
    } catch { /* still remove locally */ }
    const updated = relationships.filter((r) => r.role !== 'client');
    saveRelationships(updated);
    setRelationships(updated);
    setPendingChanges(null);
  }, [myCoachRel, relationships]);

  // --- Coach side ---

  const addClient = useCallback((fileId: string, clientName?: string, clientEmail?: string) => {
    const rel: CoachRelationship = { fileId, clientName: clientName || 'Client', clientEmail, role: 'coach', createdAt: new Date().toISOString() };
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
    const token = await requireAccessToken();
    try {
      const raw = await readSharedFile(token, fileId);
      return JSON.parse(raw);
    } catch (err) {
      console.error('Failed to read client data:', err);
      return null;
    }
  }, []);

  const pushChangesToClient = useCallback(async (fileId: string, changes: PendingCoachChanges) => {
    const token = await requireAccessToken();
    setLoading(true);
    try {
      const raw = await readSharedFile(token, fileId);
      const data = JSON.parse(raw);
      data.pendingChanges = changes;
      await writeSharedFile(token, fileId, JSON.stringify(data));

      addLogEntry({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        direction: 'pushed',
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
    const token = await requireAccessToken();
    try {
      const raw = await readSharedFile(token, fileId);
      const data = JSON.parse(raw);
      return data.clientResponse || null;
    } catch {
      return null;
    }
  }, []);

  const acknowledgeClientResponse = useCallback(async (fileId: string) => {
    const token = await requireAccessToken();
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

  return {
    relationships, myCoachRel, myClients, loading,
    pendingChanges, clientResponse,
    // Client
    shareWithCoach, syncCoachFile, checkForCoachChanges, finalizeResponses, revokeCoachAccess,
    // Coach
    addClient, removeClient, getClientData, pushChangesToClient,
    checkForClientResponse, acknowledgeClientResponse,
    // Log
    addLogEntry, getLog,
  };
}
