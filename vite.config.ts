import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['apple-touch-icon.png', 'icon.svg', 'pdf.worker.min.mjs'],
        manifest: {
          id: '/',
          name: 'orange PDF — Private Offline PDF Workspace',
          short_name: 'orange PDF',
          description: 'Private, Offline PDF Workspace. Your files never leave this device.',
          theme_color: '#f97316',
          background_color: '#0d111a',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
          // Include the local PDF.js worker (.mjs) in the install-time cache.
          // Without this, PDF tools would fail when the installed PWA starts offline.
          globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff,woff2,webmanifest}'],
          runtimeCaching: [
            {
              // Tesseract.js loads worker/core code and language packs from jsDelivr.
              // Cache assets after first online use so OCR can work offline later.
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/.*$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'orange-pdf-ocr-cdn',
                expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/tessdata\.projectnaptha\.com\/.*$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'orange-pdf-ocr-language-data',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 90 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve('./src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
