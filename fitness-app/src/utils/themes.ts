export type ThemeId = 'dark' | 'light' | 'auto';

const STORAGE_KEY = 'fitos-theme';

function getSystemTheme(): 'dark' | 'light' {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function getActiveThemeId(): ThemeId {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'auto') return saved;
  return 'dark';
}

export function getResolvedTheme(): 'dark' | 'light' {
  const id = getActiveThemeId();
  return id === 'auto' ? getSystemTheme() : id;
}

export function setActiveTheme(themeId: ThemeId): void {
  localStorage.setItem(STORAGE_KEY, themeId);
  applyTheme(themeId);
}

export function applyTheme(themeId?: ThemeId): void {
  const raw = themeId || getActiveThemeId();
  const id = raw === 'auto' ? getSystemTheme() : raw;
  document.documentElement.setAttribute('data-theme', id);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', id === 'light' ? '#f5f5f7' : '#111114');
}

export function listenForSystemThemeChange(callback: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const handler = () => {
    if (getActiveThemeId() === 'auto') {
      applyTheme('auto');
      callback();
    }
  };
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
