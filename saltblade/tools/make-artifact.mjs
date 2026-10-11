// Turns the single-file build (dist/index.html) into an artifact page: the
// publisher wraps the page in its own doctype, head and body, so this keeps
// only the title, styles, the app markup and the inlined script. Nothing is
// minified or stripped here: the bundled code's licence comments stay.
// Usage: npm run build && node tools/make-artifact.mjs [out]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const out = process.argv[2] ?? 'dist/artifact.html';
const html = readFileSync('dist/index.html', 'utf8');

const pick = (re) => [...html.matchAll(re)].map((m) => m[0]);
const title = html.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? '<title>Saltblade</title>';
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/g);
const scripts = pick(/<script[^>]*>[\s\S]*?<\/script>/g).map((s) => s.replace(/\scrossorigin(="[^"]*")?/, ''));
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? '';
// the app markup without the dev-only entry script
const markup = body.replace(/<script[\s\S]*?<\/script>/g, '').trim();

const page = [title, ...styles, markup, ...scripts].join('\n');
if (/<!doctype|<html|<head|<body/i.test(page.slice(0, 4000))) throw new Error('page still has document tags');
if (!/@license/.test(page)) throw new Error('the build lost its licence comments (see esbuild.legalComments in vite.config.ts)');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`wrote ${out}: ${(page.length / 1024).toFixed(0)} KB (${scripts.length} script, ${styles.length} style)`);
