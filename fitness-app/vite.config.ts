import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.GITHUB_PAGES ? '/apeapp/' : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        globIgnores: ['**/logo*.png'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/falling-cloud-a632\.narbehousellc\.workers\.dev\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'usda-api-cache', expiration: { maxEntries: 200, maxAgeSeconds: 86400 } },
          },
        ],
      },
      manifest: {
        name: 'APE - Aesthetic Physique Enthusiast',
        short_name: 'APE',
        description: 'Self-custody fitness tracker — workouts, nutrition, progress, AI coaching',
        theme_color: '#111114',
        background_color: '#111114',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        categories: ['health', 'fitness', 'lifestyle'],
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
