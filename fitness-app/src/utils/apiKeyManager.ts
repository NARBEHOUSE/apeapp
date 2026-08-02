const WORKER_BASE = 'https://ape-app-apikeys.narbehousellc.workers.dev';

export type AIProvider = 'anthropic' | 'openai' | 'openrouter' | 'gemini' | 'unknown';

// Decrypted key lives only in this variable — never written to any storage.
let _key = '';

// --- Worker session tokens ---------------------------------------------------
// A 7-day, app-scoped credential the client trades a live Google access
// token for once, so reloading the page doesn't require a fresh Google
// handshake just to read the encrypted key. Safe to cache in localStorage:
// it grants no access outside this key store and is narrower in scope than
// the Google OAuth token it's exchanged for. Signing out calls
// revokeSession() below, which kills it server-side immediately (via the
// Worker's per-user epoch check) rather than leaving it valid until the TTL
// naturally expires — see cloudflare (donotupload to github)/apikeys-worker/worker.js.
//
// It's a *sliding* window, not a hard 7-day wall: every time it's used with
// less than SESSION_RENEW_MARGIN_MS left, resolveAuth silently renews it for
// another 7 days (see maybeRenewSession). So as long as the app gets opened
// at least once within any 7-day span, this never expires in practice — the
// wall is only ever hit after 7 straight days of not using the app at all.

const SESSION_KEY = 'ape-worker-session';

interface StoredSession {
  token: string;
  email: string;
  expiresAt: number;
}

function loadStoredSession(userId: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed.email !== userId || !parsed.token || Date.now() >= parsed.expiresAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function storeSession(session: StoredSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage unavailable — session just won't survive reload
  }
}

function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY);
}

// Call on sign-out. Tells the Worker to invalidate every session token it has
// ever minted for this user (bumping its epoch — see worker.js), so a token
// that already leaked stops working immediately instead of staying valid for
// the rest of its TTL. Best-effort: local state is cleared either way.
export async function revokeSession(userId: string): Promise<void> {
  const cached = loadStoredSession(userId);
  clearStoredSession();
  if (!cached) return;
  try {
    await fetch(`${WORKER_BASE}/session`, {
      method: 'DELETE',
      headers: { 'X-User-ID': userId, Authorization: `Bearer ${cached.token}` },
    });
  } catch {
    // Worker unreachable — local session is already gone regardless
  }
}

// Set whenever mintSession fails, so a failure that's otherwise silently
// swallowed (see resolveAuth's fallback) is still visible somewhere.
let _lastSessionError: string | null = null;

export function getLastSessionError(): string | null {
  return _lastSessionError;
}

// Mints a session token from a live Google access token. Returns null (rather
// than throwing) if the Worker doesn't support /session yet, so callers can
// fall back to using the Google token directly.
async function mintSession(userId: string, googleAccessToken: string): Promise<StoredSession | null> {
  let res: Response;
  try {
    res = await fetch(`${WORKER_BASE}/session`, {
      method: 'POST',
      headers: { 'X-User-ID': userId, Authorization: `Bearer ${googleAccessToken}` },
    });
  } catch (err) {
    _lastSessionError = `Network error minting session: ${err instanceof Error ? err.message : String(err)}`;
    return null;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    _lastSessionError = `Session mint failed: HTTP ${res.status} ${body}`.trim();
    return null;
  }
  _lastSessionError = null;
  const { sessionToken, expiresAt } = (await res.json()) as { sessionToken: string; expiresAt: number };
  const session: StoredSession = { token: sessionToken, email: userId, expiresAt };
  storeSession(session);
  return session;
}

// Renew once less than this much time remains on the cached session — keeps
// the window sliding forward on active use instead of hard-expiring on a
// fixed schedule.
const SESSION_RENEW_MARGIN_MS = 6 * 24 * 60 * 60 * 1000;

// Best-effort, fire-and-forget: extends the session using the session token
// itself (no Google contact needed). Silent no-op on failure — the still-
// valid cached token keeps working until its original expiry regardless.
function maybeRenewSession(userId: string, session: StoredSession) {
  if (session.expiresAt - Date.now() > SESSION_RENEW_MARGIN_MS) return;
  fetch(`${WORKER_BASE}/session`, {
    method: 'POST',
    headers: { 'X-User-ID': userId, Authorization: `Bearer ${session.token}` },
  })
    .then((res) => (res.ok ? (res.json() as Promise<{ sessionToken: string; expiresAt: number }>) : null))
    .then((data) => {
      if (data) storeSession({ token: data.sessionToken, email: userId, expiresAt: data.expiresAt });
    })
    .catch(() => {
      // Worker unreachable or rejected the renewal — old token is untouched and still valid until it expires
    });
}

// Bearer token for a /keys call: prefer a cached app session (no Google
// contact needed at all) and only fetch a Google token — lazily, via the
// caller-supplied getter — when there's no valid session cached yet.
async function resolveAuth(userId: string, getGoogleToken: () => Promise<string>): Promise<string> {
  const cached = loadStoredSession(userId);
  if (cached) {
    maybeRenewSession(userId, cached);
    return cached.token;
  }

  const googleToken = await getGoogleToken();
  const session = await mintSession(userId, googleToken);
  return session ? session.token : googleToken;
}

async function workerFetch(
  path: string,
  userId: string,
  getGoogleToken: () => Promise<string>,
  init: RequestInit,
): Promise<Response> {
  const withAuth = (bearer: string): RequestInit => ({
    ...init,
    headers: { ...init.headers, 'X-User-ID': userId, Authorization: `Bearer ${bearer}` },
  });

  let bearer = await resolveAuth(userId, getGoogleToken);
  let res = await fetch(`${WORKER_BASE}${path}`, withAuth(bearer));

  if (res.status === 401 || res.status === 403) {
    // Cached session was rejected (expired/revoked) — drop it, re-auth with
    // Google once, and retry.
    clearStoredSession();
    const googleToken = await getGoogleToken();
    const session = await mintSession(userId, googleToken);
    bearer = session ? session.token : googleToken;
    res = await fetch(`${WORKER_BASE}${path}`, withAuth(bearer));
  }

  return res;
}

export function getApiKey(): string {
  return _key;
}

export function detectProvider(key: string): AIProvider {
  const k = key.trim();
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('sk-or-')) return 'openrouter';
  if (k.startsWith('AIza')) return 'gemini';
  if (k.startsWith('sk-')) return 'openai';
  return 'unknown';
}

// --- Crypto helpers ---------------------------------------------------------

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function deriveAesKey(userId: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(userId),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// --- Worker API -------------------------------------------------------------

interface EncryptedPayload {
  provider: AIProvider;
  encrypted: string;
  salt: string;
  iv: string;
}

// getGoogleToken is called lazily — only when there's no cached app session
// (see resolveAuth above) — so a normal save/load never has to touch Google
// at all once a session has been minted once.
export async function saveApiKey(
  apiKey: string,
  userId: string,
  getGoogleToken: () => Promise<string>,
): Promise<void> {
  const key = apiKey.trim();
  if (!key) {
    return deleteApiKey(userId, getGoogleToken);
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveAesKey(userId, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(key),
  );

  const payload: EncryptedPayload = {
    provider: detectProvider(key),
    encrypted: toB64(ciphertext),
    salt: toB64(salt),
    iv: toB64(iv),
  };

  const res = await workerFetch('/keys', userId, getGoogleToken, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Worker error ${res.status}`);

  _key = key;
  localStorage.removeItem('ape-user-api-key');
  localStorage.removeItem('fitos-claude-key');
}

export async function loadApiKey(userId: string, getGoogleToken: () => Promise<string>): Promise<boolean> {
  const res = await workerFetch('/keys', userId, getGoogleToken, { method: 'GET' });

  if (res.status === 404) {
    // One-time migration: if a key exists in the old localStorage format, push it to the Worker.
    const legacy = localStorage.getItem('ape-user-api-key') || localStorage.getItem('fitos-claude-key');
    if (legacy) {
      await saveApiKey(legacy, userId, getGoogleToken);
      return true;
    }
    _key = '';
    return false;
  }

  if (!res.ok) throw new Error(`Worker error ${res.status}`);

  const { encrypted, salt, iv } = (await res.json()) as EncryptedPayload;
  const aesKey = await deriveAesKey(userId, fromB64(salt));
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(iv) },
    aesKey,
    fromB64(encrypted),
  );
  _key = new TextDecoder().decode(plainBuf);
  return true;
}

export async function deleteApiKey(userId: string, getGoogleToken: () => Promise<string>): Promise<void> {
  await workerFetch('/keys', userId, getGoogleToken, { method: 'DELETE' });
  _key = '';
  localStorage.removeItem('ape-user-api-key');
  localStorage.removeItem('fitos-claude-key');
}

// Call on sign-out to wipe the in-memory key and the cached app session
// without touching the Worker's stored (encrypted) copy.
export function clearKeyFromMemory(): void {
  clearStoredSession();
  _key = '';
}
