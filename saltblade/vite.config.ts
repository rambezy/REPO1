import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Everything (scripts, styles, three.js) is inlined into one index.html so the
// game can be opened from disk or hosted as a single page.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  server: { port: 5180 },
  build: {
    target: 'es2020',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 8000,
  },
});
