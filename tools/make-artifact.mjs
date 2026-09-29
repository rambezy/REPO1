// Turns the single-file build (dist/index.html) into page content for
// publishing as a hosted artifact: the host supplies doctype/html/head/body,
// so this keeps the title, font links, styles, body markup and the script.
// Usage: npm run build && node tools/make-artifact.mjs [out]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = readFileSync(path.join(root, 'dist/index.html'), 'utf8');
const out = process.argv[2] || path.join(root, 'dist/artifact.html');

const title = /<title>[\s\S]*?<\/title>/.exec(src)?.[0] ?? '<title>Dustfall</title>';
const links = [...src.matchAll(/<link [^>]*>/g)].map((m) => m[0]).filter((l) => l.includes('fonts.g'));
const styles = [...src.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]);
const scripts = [...src.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
const body = /<body[^>]*>([\s\S]*?)<\/body>/.exec(src)?.[1] ?? '';
const bodyMarkup = body.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').trim();

if (!scripts.length) throw new Error('no script found in dist/index.html');
const page = [
  title,
  '<meta name="description" content="Dustfall: an original turn-based, isometric post-atomic role-playing game.">',
  ...links,
  ...styles,
  bodyMarkup,
  ...scripts,
].join('\n');
writeFileSync(out, page);
const kb = (Buffer.byteLength(page) / 1024).toFixed(0);
console.log(`wrote ${path.relative(root, out)} (${kb} KB)`);
