import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Everything (scripts, styles, fonts, three.js) is inlined into one index.html so
// the game can be opened from disk or hosted as a single page.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  server: { port: 5180 },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // three and its post-processing add-ons in one pre-bundle, so the dev server loads a single copy
  optimizeDeps: {
    include: ['three', ...['EffectComposer', 'RenderPass', 'UnrealBloomPass', 'ShaderPass', 'OutputPass'].map((p) => `three/addons/postprocessing/${p}.js`)],
  },
  // Whitespace and syntax are still minified, but names stay readable: mangled
  // two-letter names can by chance spell out markup the artifact publisher
  // mistakes for one of its own page templates, and then refuses the page.
  // Licence comments (three.js's @license header) stay in the build.
  esbuild: { minifyIdentifiers: false, legalComments: 'inline' },
  build: {
    target: 'es2020',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 8000,
  },
});
