const WORKER_BASE = 'https://ape-app-apikeys.narbehousellc.workers.dev';

export type AIProvider = 'anthropic' | 'openai' | 'openrouter' | 'gemini' | 'unknown';

// Decrypted key lives only in this variable — never written to any storage.
let _key = '';

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

export async function saveApiKey(apiKey: string, userId: string): Promise<void> {
  const key = apiKey.trim();
  if (!key) {
    return deleteApiKey(userId);
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

  const res = await fetch(`${WORKER_BASE}/keys`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-User-ID': userId },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Worker error ${res.status}`);

  _key = key;
  localStorage.removeItem('ape-user-api-key');
  localStorage.removeItem('fitos-claude-key');
}

export async function loadApiKey(userId: string): Promise<boolean> {
  const res = await fetch(`${WORKER_BASE}/keys`, {
    headers: { 'X-User-ID': userId },
  });

  if (res.status === 404) {
    // One-time migration: if a key exists in the old localStorage format, push it to the Worker.
    const legacy = localStorage.getItem('ape-user-api-key') || localStorage.getItem('fitos-claude-key');
    if (legacy) {
      await saveApiKey(legacy, userId);
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

export async function deleteApiKey(userId: string): Promise<void> {
  await fetch(`${WORKER_BASE}/keys`, {
    method: 'DELETE',
    headers: { 'X-User-ID': userId },
  });
  _key = '';
  localStorage.removeItem('ape-user-api-key');
  localStorage.removeItem('fitos-claude-key');
}

// Call on sign-out to wipe the in-memory key without touching the Worker.
export function clearKeyFromMemory(): void {
  _key = '';
}
