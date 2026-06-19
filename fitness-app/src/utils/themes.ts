export type ThemeId = 'dark' | 'light';

const STORAGE_KEY = 'fitos-theme';

export function getActiveThemeId(): ThemeId {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light') return 'light';
  return 'dark';
}

export function setActiveTheme(themeId: ThemeId): void {
  localStorage.setItem(STORAGE_KEY, themeId);
  applyTheme(themeId);
}

export function applyTheme(themeId?: ThemeId): void {
  const id = themeId || getActiveThemeId();
  document.documentElement.setAttribute('data-theme', id);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', id === 'light' ? '#f5f5f7' : '#111114');
}
