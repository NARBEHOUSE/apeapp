import { useState, useCallback } from 'react';
import { getAccessToken, requireAccessToken } from '../utils/googleAuth';
import {
  createCoachShareFile,
  readSharedFile,
  writeSharedFile,
  findMyCoachFile,
  deleteFile,
  gatherCoachData,
} from '../utils/googleDrive';
import type { CoachRelationship, PendingCoachChanges } from '../types';

const COACH_KEY = 'fitos-coach-relationships';

function loadRelationships(): CoachRelationship[] {
  try {
    return JSON.parse(localStorage.getItem(COACH_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRelationships(rels: CoachRelationship[]) {
  localStorage.setItem(COACH_KEY, JSON.stringify(rels));
}

export function useCoach() {
  const [relationships, setRelationships] = useState<CoachRelationship[]>(loadRelationships);
  const [loading, setLoading] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<PendingCoachChanges | null>(null);

  const myCoachRel = relationships.find((r) => r.role === 'client');
  const myClients = relationships.filter((r) => r.role === 'coach');

  // --- Client side ---

  const shareWithCoach = useCallback(async (coachEmail: string): Promise<string | null> => {
    const token = await requireAccessToken();
    setLoading(true);
    try {
      const data = await gatherCoachData();
      const content = JSON.stringify(data);
      const fileId = await createCoachShareFile(token, content, coachEmail);

      const rel: CoachRelationship = {
        fileId,
        coachEmail,
        role: 'client',
        createdAt: new Date().toISOString(),
      };
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
        setPendingChanges(data.pendingChanges);
      }
    } catch (err) {
      console.error('Failed to check coach changes:', err);
    }
  }, [myCoachRel]);

  const clearPendingChanges = useCallback(async () => {
    if (!myCoachRel) return;
    const token = await requireAccessToken();
    try {
      const raw = await readSharedFile(token, myCoachRel.fileId);
      const data = JSON.parse(raw);
      data.pendingChanges = null;
      await writeSharedFile(token, myCoachRel.fileId, JSON.stringify(data));
      setPendingChanges(null);
    } catch (err) {
      console.error('Failed to clear pending changes:', err);
    }
  }, [myCoachRel]);

  const revokeCoachAccess = useCallback(async () => {
    if (!myCoachRel) return;
    try {
      const token = await requireAccessToken();
      await deleteFile(token, myCoachRel.fileId);
    } catch { /* token or file issue — still remove locally */ }
    const updated = relationships.filter((r) => r.role !== 'client');
    saveRelationships(updated);
    setRelationships(updated);
    setPendingChanges(null);
  }, [myCoachRel, relationships]);

  // --- Coach side ---

  const addClient = useCallback((fileId: string, clientName?: string, clientEmail?: string) => {
    const rel: CoachRelationship = {
      fileId,
      clientName: clientName || 'Client',
      clientEmail,
      role: 'coach',
      createdAt: new Date().toISOString(),
    };
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
      return true;
    } catch (err) {
      console.error('Failed to push changes:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    relationships,
    myCoachRel,
    myClients,
    loading,
    pendingChanges,
    // Client
    shareWithCoach,
    syncCoachFile,
    checkForCoachChanges,
    clearPendingChanges,
    revokeCoachAccess,
    // Coach
    addClient,
    removeClient,
    getClientData,
    pushChangesToClient,
  };
}
