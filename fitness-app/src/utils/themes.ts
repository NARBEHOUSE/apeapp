export const THEMES = [
  { id: 'dark',     name: 'Dark',     swatch: '#1a1a20', metaColor: '#111114' },
  { id: 'dim',      name: 'Dim',      swatch: '#242432', metaColor: '#1a1a24' },
  { id: 'midnight', name: 'Midnight', swatch: '#161b22', metaColor: '#0d1117' },
  { id: 'forest',   name: 'Forest',   swatch: '#142218', metaColor: '#0d1a12' },
  { id: 'sunset',   name: 'Sunset',   swatch: '#241a0e', metaColor: '#1a1208' },
  { id: 'sepia',    name: 'Sepia',    swatch: '#ebe4d9', metaColor: '#f4efe6' },
  { id: 'light',    name: 'Light',    swatch: '#ffffff', metaColor: '#f5f5f7' },
  { id: 'amoled',   name: 'AMOLED',   swatch: '#000000', metaColor: '#000000' },
] as const;

export type ThemeId = typeof THEMES[number]['id'];

const VALID_IDS = new Set(THEMES.map(t => t.id));
const STORAGE_KEY = 'fitos-theme';

export function getActiveThemeId(): ThemeId {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && VALID_IDS.has(saved as ThemeId)) return saved as ThemeId;
  return 'dark';
}

export function setActiveTheme(themeId: ThemeId): void {
  localStorage.setItem(STORAGE_KEY, themeId);
  applyTheme(themeId);
}

export function applyTheme(themeId?: ThemeId): void {
  const id = themeId ?? getActiveThemeId();
  document.documentElement.setAttribute('data-theme', id);

  const theme = THEMES.find(t => t.id === id);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && theme) meta.setAttribute('content', theme.metaColor);
}

export function getResolvedTheme(): 'dark' | 'light' {
  const id = getActiveThemeId();
  return id === 'light' || id === 'sepia' ? 'light' : 'dark';
}

export function listenForSystemThemeChange(_callback: () => void): () => void {
  return () => {};
}
