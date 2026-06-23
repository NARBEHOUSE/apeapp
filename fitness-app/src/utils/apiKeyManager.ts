const KEY = 'ape-user-api-key';
const LEGACY_KEY = 'fitos-claude-key';

export type AIProvider = 'anthropic' | 'openai' | 'openrouter' | 'gemini' | 'unknown';

export function detectProvider(key: string): AIProvider {
  const k = key.trim();
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('sk-or-')) return 'openrouter';
  if (k.startsWith('AIza')) return 'gemini';
  if (k.startsWith('sk-')) return 'openai';
  return 'unknown';
}

export function saveApiKey(key: string): void {
  const k = key.trim();
  if (k) {
    localStorage.setItem(KEY, k);
    localStorage.setItem(LEGACY_KEY, k);
  } else {
    clearApiKey();
  }
}

export function getApiKey(): string {
  return localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY) || '';
}

export function clearApiKey(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem(LEGACY_KEY);
}
