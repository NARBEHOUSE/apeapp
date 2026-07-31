import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  signInWithGoogle,
  fetchGoogleUser,
  getStoredUser,
  storeUser,
  clearStoredUser,
  getAccessToken,
  requireAccessToken,
  silentAccessToken,
  type GoogleUser,
} from '../utils/googleAuth';
import {
  findSyncFile,
  uploadSyncData,
  downloadSyncData,
  gatherAllData,
  restoreAllData,
  deleteAllAppData,
} from '../utils/googleDrive';
import { loadApiKey, clearKeyFromMemory, revokeSession } from '../utils/apiKeyManager';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface GoogleAuthContextType {
  user: GoogleUser | null;
  isSignedIn: boolean;
  isLoading: boolean;
  keyLoaded: boolean;
  keyLoadError: boolean;
  reconnectApiKey: () => Promise<boolean>;
  signIn: () => Promise<boolean>;
  signOut: () => void;
  deleteCloudDataAndSignOut: () => Promise<void>;
  syncStatus: SyncStatus;
  lastSynced: string | null;
  syncNow: () => Promise<void>;
}

const GoogleAuthContext = createContext<GoogleAuthContextType>({
  user: null,
  isSignedIn: false,
  isLoading: false,
  keyLoaded: false,
  keyLoadError: false,
  reconnectApiKey: async () => false,
  signIn: async () => false,
  signOut: () => {},
  deleteCloudDataAndSignOut: async () => {},
  syncStatus: 'idle',
  lastSynced: null,
  syncNow: async () => {},
});

export function useGoogleAuth() {
  return useContext(GoogleAuthContext);
}

export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<GoogleUser | null>(() => getStoredUser());
  const [isLoading, setIsLoading] = useState(false);
  const [keyLoaded, setKeyLoaded] = useState(false);
  const [keyLoadError, setKeyLoadError] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSynced, setLastSynced] = useState<string | null>(
    () => localStorage.getItem('fitos-last-synced'),
  );
  const syncFileIdRef = useRef<string | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load the user's API key from the Worker whenever the signed-in user changes.
  // On sign-out (user === null) the in-memory key is wiped immediately.
  // loadApiKey only calls the token getter if there's no cached app session yet
  // (see apiKeyManager.ts) — so on a normal reload this never even reaches
  // Google. The getter itself is silent-only: an interactive Google popup
  // triggered from this background effect (not a click) gets blocked by
  // browsers anyway, so on failure we just flag it and let the UI offer a
  // real reconnect button.
  useEffect(() => {
    if (!user) {
      clearKeyFromMemory();
      setKeyLoaded(false);
      setKeyLoadError(false);
      return;
    }
    setKeyLoaded(false);
    setKeyLoadError(false);
    loadApiKey(user.email, silentAccessToken)
      .then(() => setKeyLoaded(true))
      .catch(() => {
        setKeyLoaded(true);
        setKeyLoadError(true);
      });
  }, [user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  // Retries the key load with an interactive Google prompt. Must be called from a
  // real click handler so the resulting popup isn't blocked.
  const reconnectApiKey = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    try {
      await loadApiKey(user.email, signInWithGoogle);
      setKeyLoaded(true);
      setKeyLoadError(false);
      return true;
    } catch (err) {
      console.error('Failed to reconnect for API key reload:', err);
      return false;
    }
  }, [user]);

  const markSynced = useCallback(() => {
    const now = new Date().toISOString();
    setLastSynced(now);
    localStorage.setItem('fitos-last-synced', now);
    setSyncStatus('synced');
  }, []);

  const pushToCloud = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !user) return;

    setSyncStatus('syncing');
    try {
      if (!syncFileIdRef.current) {
        const existing = await findSyncFile(token);
        syncFileIdRef.current = existing?.id || null;
      }

      const data = await gatherAllData(user.email);
      const json = JSON.stringify(data);

      syncFileIdRef.current = await uploadSyncData(
        token,
        json,
        syncFileIdRef.current || undefined,
      );
      markSynced();
    } catch (err) {
      console.error('Sync push failed:', err);
      setSyncStatus('error');
    }
  }, [markSynced, user]);

  const signIn = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const token = await signInWithGoogle();
      const googleUser = await fetchGoogleUser(token);
      storeUser(googleUser);
      setUser(googleUser);

      setSyncStatus('syncing');
      const existing = await findSyncFile(token);

      if (existing) {
        syncFileIdRef.current = existing.id;
        const content = await downloadSyncData(token, existing.id);
        const data = JSON.parse(content);
        if (data._apeSync) {
          await restoreAllData(data, googleUser.email);
          window.location.reload();
          return true;
        }
        markSynced();
      } else {
        // No sync file on Drive — new account, user will create a profile
        setSyncStatus('synced');
      }
      return true;
    } catch (err) {
      console.error('Google sign-in failed:', err);
      setSyncStatus('error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [markSynced]);

  const signOut = useCallback(() => {
    // Best-effort, not awaited — local sign-out shouldn't wait on the network.
    // Kills the stored API-key session server-side immediately (see
    // revokeSession) rather than leaving it valid until it naturally expires.
    if (user) revokeSession(user.email).catch(() => {});
    clearStoredUser();
    setUser(null);
    setSyncStatus('idle');
    setLastSynced(null);
    syncFileIdRef.current = null;
    if (syncTimerRef.current) {
      clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    }
  }, [user]);

  const deleteCloudDataAndSignOut = useCallback(async () => {
    try {
      const token = getAccessToken() || await signInWithGoogle();
      await deleteAllAppData(token);
    } catch (err) {
      console.error('Failed to delete cloud data:', err);
    }
    signOut();
  }, [signOut]);

  const pullFromCloud = useCallback(async (): Promise<boolean> => {
    const token = getAccessToken();
    if (!token || !user) return false;
    if (!syncFileIdRef.current) {
      const existing = await findSyncFile(token);
      syncFileIdRef.current = existing?.id || null;
    }
    if (!syncFileIdRef.current) return false;
    const content = await downloadSyncData(token, syncFileIdRef.current);
    const driveData = JSON.parse(content);
    if (!driveData._apeSync) return false;
    const driveSyncedAt = driveData.syncedAt ? new Date(driveData.syncedAt).getTime() : 0;
    const localLastSynced = localStorage.getItem('fitos-last-synced');
    const localTime = localLastSynced ? new Date(localLastSynced).getTime() : 0;
    if (driveSyncedAt > localTime) {
      await restoreAllData(driveData, user.email);
      markSynced();
      window.location.reload();
      return true;
    }
    return false;
  }, [user, markSynced]);

  const manualSync = useCallback(async () => {
    if (!user) return;
    const token = await requireAccessToken();
    if (!token) return;
    setSyncStatus('syncing');
    try {
      // Pull first — if Drive has newer data, restore and reload
      const pulled = await pullFromCloud();
      if (pulled) return; // reload in progress

      // Local is newer — push to Drive
      const data = await gatherAllData(user.email);
      const json = JSON.stringify(data);
      if (!syncFileIdRef.current) {
        const existing = await findSyncFile(token);
        syncFileIdRef.current = existing?.id || null;
      }
      syncFileIdRef.current = await uploadSyncData(token, json, syncFileIdRef.current || undefined);
      markSynced();
    } catch (err) {
      console.error('Manual sync failed:', err);
      setSyncStatus('error');
    }
  }, [user, markSynced, pullFromCloud]);

  useEffect(() => {
    if (!user) return;
    syncTimerRef.current = setInterval(() => {
      pushToCloud();
    }, 120_000);
    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [user, pushToCloud]);

  useEffect(() => {
    if (!user) return;
    const handle = () => {
      if (document.visibilityState === 'hidden') {
        pushToCloud();
      }
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [user, pushToCloud]);

  return (
    <GoogleAuthContext.Provider
      value={{
        user,
        isSignedIn: !!user,
        isLoading,
        keyLoaded,
        keyLoadError,
        reconnectApiKey,
        signIn,
        signOut,
        deleteCloudDataAndSignOut,
        syncStatus,
        lastSynced,
        syncNow: manualSync,
      }}
    >
      {children}
    </GoogleAuthContext.Provider>
  );
}
