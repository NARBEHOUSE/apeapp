declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: TokenClientConfig) => TokenClient;
          revoke: (token: string, callback: () => void) => void;
        };
      };
    };
  }
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type: string; message: string }) => void;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error?: string;
}

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
}

const GOOGLE_CLIENT_ID = '898508792096-1inh978c606pb6gfgallaabcaoad12rf.apps.googleusercontent.com';
const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file';
const GOOGLE_USER_KEY = 'fitos-google-user';

let tokenClient: TokenClient | null = null;
let currentAccessToken: string | null = null;
let tokenExpiresAt = 0;

let pendingResolve: ((token: string) => void) | null = null;
let pendingReject: ((error: Error) => void) | null = null;

function ensureClient() {
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services not loaded');
  }
  if (tokenClient) return;

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: (response) => {
      if (response.error) {
        pendingReject?.(new Error(response.error));
      } else {
        currentAccessToken = response.access_token;
        tokenExpiresAt = Date.now() + response.expires_in * 1000;
        pendingResolve?.(response.access_token);
      }
      pendingResolve = null;
      pendingReject = null;
    },
    error_callback: (error) => {
      pendingReject?.(new Error(error.message || 'Google auth failed'));
      pendingResolve = null;
      pendingReject = null;
    },
  });
}

export function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

export async function signInWithGoogle(): Promise<string> {
  await loadGoogleScript();
  ensureClient();
  return new Promise((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    tokenClient!.requestAccessToken();
  });
}

export async function silentRefresh(): Promise<string> {
  await loadGoogleScript();
  ensureClient();
  return new Promise((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    tokenClient!.requestAccessToken({ prompt: '' });
  });
}

export function getAccessToken(): string | null {
  if (currentAccessToken && Date.now() < tokenExpiresAt - 60_000) {
    return currentAccessToken;
  }
  return null;
}

export async function fetchGoogleUser(accessToken: string): Promise<GoogleUser> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch user info');
  const data = await res.json();
  return { email: data.email, name: data.name, picture: data.picture };
}

export function getStoredUser(): GoogleUser | null {
  try {
    const stored = localStorage.getItem(GOOGLE_USER_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function storeUser(user: GoogleUser) {
  localStorage.setItem(GOOGLE_USER_KEY, JSON.stringify(user));
}

export function clearStoredUser() {
  if (currentAccessToken) {
    window.google?.accounts?.oauth2?.revoke(currentAccessToken, () => {});
  }
  localStorage.removeItem(GOOGLE_USER_KEY);
  localStorage.removeItem('fitos-last-synced');
  currentAccessToken = null;
  tokenExpiresAt = 0;
  tokenClient = null;
}
