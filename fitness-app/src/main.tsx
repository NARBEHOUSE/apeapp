import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { applyTheme, listenForSystemThemeChange } from './utils/themes';

// crypto.randomUUID() requires a secure context (HTTPS/localhost).
// Polyfill it for local network testing over plain HTTP.
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
  (crypto as unknown as { randomUUID: () => string }).randomUUID = function (): string {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => {
      const n = parseInt(c);
      return (n ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (n / 4)))).toString(16);
    });
  };
}

applyTheme();
listenForSystemThemeChange(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
