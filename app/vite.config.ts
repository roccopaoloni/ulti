import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // `.env` lives at the repository root (docs/setup.md, step 7).
  envDir: '..',
  plugins: [
    react(),
    VitePWA({
      // A new version activates as soon as it's downloaded, and the open app reloads into it.
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ULTI',
        short_name: 'ULTI',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0E0B1F',
        theme_color: '#0E0B1F',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The whole app shell, fonts included, is precached so it opens with no signal.
        globPatterns: ['**/*.{html,js,css,woff2,svg,png}'],
        // Every route opens the single-page app, online or offline.
        navigateFallback: 'index.html',
      },
    }),
  ],
});
