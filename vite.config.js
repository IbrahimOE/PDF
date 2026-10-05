import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2500,
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png', 'icons/*.svg'],
      manifest: {
        id: '/',
        name: 'PDF Atelier',
        short_name: 'PDF Atelier',
        description:
          'PDFs zusammenführen, Seiten auswählen und durchsuchen – Fusionner, sélectionner et rechercher des PDF.',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'any',
        theme_color: '#6D5BFF',
        background_color: '#F6F5FF',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        // Windows/ChromeOS: PDFs per Rechtsklick „Öffnen mit → PDF Atelier“
        file_handlers: [{ action: '/', accept: { 'application/pdf': ['.pdf'] } }],
        launch_handler: { client_mode: 'focus-existing' },
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        globIgnores: ['pdfjs/**', 'ocr/**', '**/inter-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/__\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/pdfjs/'),
            handler: 'CacheFirst',
            options: { cacheName: 'pdfjs-assets', expiration: { maxEntries: 400 } },
          },
          {
            // Texterkennung: Engine und Sprachdaten erst bei Bedarf laden, danach offline verfügbar
            urlPattern: ({ url }) => url.pathname.startsWith('/ocr/'),
            handler: 'CacheFirst',
            options: { cacheName: 'ocr-assets', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
});
