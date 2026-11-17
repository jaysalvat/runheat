import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Installable app (PWA): manifest + a service worker that keeps the app itself available offline.
// The map tiles still need the network; the imported runs live in IndexedDB anyway.
const pwa = VitePWA({
  registerType: 'autoUpdate', // a new version is picked up silently, on the next visit
  injectRegister: 'script',
  includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
  manifest: {
    name: 'RunHeat',
    short_name: 'RunHeat',
    description: "Every run you've ever done on one map: routes, heatmaps, new paths and stats.",
    lang: 'en',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#0b0d10',
    theme_color: '#0b0d10',
    categories: ['sports', 'health', 'fitness'],
    icons: [
      { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    // the app shell and the demo; the place names (5 MB) are cached the first time an import needs them
    globPatterns: ['**/*.{js,mjs,css,html,svg,png,json}'],
    globIgnores: ['og-image.png'],
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
    runtimeCaching: [{ urlPattern: /places\.tsv$/, handler: 'CacheFirst', options: { cacheName: 'places' } }],
  },
});

// Link previews need absolute URLs, but the deployed address is not hard-coded in the repo:
// set SITE_URL in .env (git-ignored) or in the build environment, e.g. SITE_URL=https://example.com/
// Without it, og:url is omitted and the preview image stays relative (enough for iMessage or Slack,
// not for Facebook).
function siteUrl(url) {
  return {
    name: 'site-url',
    transformIndexHtml(html) {
      if (!url) return html;
      const abs = (path) => new URL(path, url.endsWith('/') ? url : url + '/').href;
      return html
        .replaceAll('content="og-image.png"', `content="${abs('og-image.png')}"`)
        .replace(
          '<meta property="og:type"',
          `<meta property="og:url" content="${abs('')}">\n<meta property="og:type"`,
        );
    },
  };
}

export default defineConfig(({ mode }) => ({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) }, // shown in the settings
  plugins: [svelte(), siteUrl(process.env.SITE_URL || loadEnv(mode, process.cwd(), '').SITE_URL), pwa],
  // Relative asset paths: the built site works from any folder or subdomain
  base: './',
  worker: { format: 'es' },
  // Reachable from a phone on the same network (http://<computer>.local:5173 or its IP)
  server: { host: true, allowedHosts: ['.local'] },
  build: { chunkSizeWarningLimit: 1500 }, // MapLibre alone is ~1.1 MB (~300 kB gzipped)
}));
