// Fails the build if a stylesheet's braces don't balance: a stray or missing
// brace silently swallows every rule after it (it once hid the desktop
// styles inside a phone-only media query).
import { readFileSync, readdirSync } from 'node:fs';
const root = new URL('../', import.meta.url);
// Every stylesheet under src/, so a new one is checked without being listed here.
const sheets = (dir) => readdirSync(new URL(dir, root), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? sheets(`${dir}${e.name}/`) : e.name.endsWith('.css') ? [`${dir}${e.name}`] : []));
let bad = 0;
for (const file of sheets('src/')) {
  const src = readFileSync(new URL(file, root), 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (m) => ' '.repeat(m.length));
  let depth = 0, line = 1, open = [];
  for (const ch of src) {
    if (ch === '\n') line++;
    else if (ch === '{') { depth++; open.push(line); }
    else if (ch === '}') { depth--; open.pop(); if (depth < 0) { console.error(`${file}:${line}: a closing brace with nothing to close`); bad++; depth = 0; } }
  }
  if (depth > 0) { console.error(`${file}: ${depth} unclosed brace(s), opened at line ${open.join(', ')}`); bad++; }
}
if (bad) process.exit(1);
