import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // relative paths: the built site works from any folder or subdomain
  base: './',
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 1200 },   // MapLibre alone is ~800 kB (~220 kB gzipped)
});
