import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

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
  plugins: [svelte(), siteUrl(process.env.SITE_URL || loadEnv(mode, process.cwd(), '').SITE_URL)],
  // Relative asset paths: the built site works from any folder or subdomain
  base: './',
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 1500 }, // MapLibre alone is ~1.1 MB (~300 kB gzipped)
}));
