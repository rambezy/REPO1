// Fails the build if a stylesheet's braces don't balance: a stray or missing
// brace silently swallows every rule after it (it once hid the desktop
// styles inside a phone-only media query).
import { readFileSync } from 'node:fs';
let bad = 0;
for (const file of ['src/ui/styles.css']) {
  const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (m) => ' '.repeat(m.length));
  let depth = 0, line = 1, open = [];
  for (const ch of src) {
    if (ch === '\n') line++;
    else if (ch === '{') { depth++; open.push(line); }
    else if (ch === '}') { depth--; open.pop(); if (depth < 0) { console.error(`${file}:${line}: a closing brace with nothing to close`); bad++; depth = 0; } }
  }
  if (depth > 0) { console.error(`${file}: ${depth} unclosed brace(s), opened at line ${open.join(', ')}`); bad++; }
}
if (bad) process.exit(1);
