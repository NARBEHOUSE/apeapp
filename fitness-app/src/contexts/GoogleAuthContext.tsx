import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  signInWithGoogle,
  fetchGoogleUser,
  getStoredUser,
  storeUser,
  clearStoredUser,
  getAccessToken,
  type GoogleUser,
} from '../utils/googleAuth';
import {
  findSyncFile,
  uploadSyncData,
  downloadSyncData,
  gatherAllData,
  restoreAllData,
} from '../utils/googleDrive';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface GoogleAuthContextType {
  user: GoogleUser | null;
  isSignedIn: boolean;
  isLoading: boolean;
  signIn: () => Promise<boolean>;
  signOut: () => void;
  syncStatus: SyncStatus;
  lastSynced: string | null;
  syncNow: () => Promise<void>;
}

const GoogleAuthContext = createContext<GoogleAuthContextType>({
  user: null,
  isSignedIn: false,
  isLoading: false,
  signIn: async () => false,
  signOut: () => {},
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSynced, setLastSynced] = useState<string | null>(
    () => localStorage.getItem('fitos-last-synced'),
  );
  const syncFileIdRef = useRef<string | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const markSynced = useCallback(() => {
    const now = new Date().toISOString();
    setLastSynced(now);
    localStorage.setItem('fitos-last-synced', now);
    setSyncStatus('synced');
  }, []);

  const pushToCloud = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;

    setSyncStatus('syncing');
    try {
      const data = await gatherAllData();
      const json = JSON.stringify(data);

      if (!syncFileIdRef.current) {
        const existing = await findSyncFile(token);
        syncFileIdRef.current = existing?.id || null;
      }

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
  }, [markSynced]);

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
          await restoreAllData(data);
        }
        markSynced();
      } else {
        await pushToCloud();
      }
      return true;
    } catch (err) {
      console.error('Google sign-in failed:', err);
      setSyncStatus('error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [pushToCloud, markSynced]);

  const signOut = useCallback(() => {
    clearStoredUser();
    setUser(null);
    setSyncStatus('idle');
    setLastSynced(null);
    syncFileIdRef.current = null;
    if (syncTimerRef.current) {
      clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    }
  }, []);

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
      if (document.visibilityState === 'hidden') pushToCloud();
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
        signIn,
        signOut,
        syncStatus,
        lastSynced,
        syncNow: pushToCloud,
      }}
    >
      {children}
    </GoogleAuthContext.Provider>
  );
}
