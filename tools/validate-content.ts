// Static checks over the story and content: every speaker in a dialogue
// script, every item and every quest referenced by the story must exist.
// Usage: npx tsx tools/validate-content.ts

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');
const storyDir = 'src/content/story';
const storyFiles = readdirSync(path.join(root, storyDir)).filter((f) => f.endsWith('.ts')).map((f) => `${storyDir}/${f}`);
const extra = ['src/systems/benches.ts', 'src/systems/interact.ts', 'src/content/merchants.ts', 'src/content/loot.ts', 'src/content/recipes.ts', 'src/content/world/interiors_village.ts', 'src/content/world/interiors_town.ts', 'src/content/notices.ts'];

// known ids
const chars = new Set([...read('src/content/characters.ts').matchAll(/c\(\{ id: '([a-z_0-9]+)'/g)].map((m) => m[1]));
const items = new Set([...read('src/content/items.ts').matchAll(/(?:id: '|\b(?:H|BK|K|Q|POT)\(')([a-z_0-9]+)'/g)].map((m) => m[1]));
items.add('coins');
const quests = new Set<string>();
for (const f of storyFiles) for (const m of read(f).matchAll(/id: '((?:main|side)_[a-z_0-9]+)'/g)) quests.add(m[1]);
const exprs = new Set(['neutral', 'happy', 'laugh', 'sad', 'cry', 'angry', 'surprised', 'worried', 'smirk', 'pain', 'tender', 'sleep']);

const problems: string[] = [];
const report = (file: string, line: number, msg: string) => problems.push(`${file}:${line}  ${msg}`);
const lineOf = (src: string, idx: number) => src.slice(0, idx).split('\n').length;

for (const f of storyFiles) {
  const src = read(f);
  // speakers inside talk(` ... `) templates
  for (const m of src.matchAll(/talk\(`([\s\S]*?)`\)/g)) {
    const base = m.index ?? 0;
    const body = m[1];
    let off = 0;
    for (const row of body.split('\n')) {
      const t = row.trim();
      const r = /^([a-z_0-9]+)(?:\s+([a-z]+))?\s*:\s*(.+)$/i.exec(t);
      if (t && !t.startsWith('>') && r) {
        const [, who, expr] = r;
        if (who !== 'player' && who !== 'narrator' && !chars.has(who)) report(f, lineOf(src, base + off), `unknown speaker "${who}"`);
        if (expr && !exprs.has(expr) && /^[a-z]+$/.test(expr) && !chars.has(who)) report(f, lineOf(src, base + off), `unknown expression "${expr}"`);
      } else if (t && !t.startsWith('>')) {
        report(f, lineOf(src, base + off), `dialogue row without a speaker: "${t.slice(0, 50)}"`);
      }
      off += row.length + 1;
    }
  }
  // say('id', ...) with string speakers
  for (const m of src.matchAll(/\bsay\('([a-z_0-9]+)'/g)) if (m[1] !== 'player' && m[1] !== 'narrator' && !chars.has(m[1])) report(f, lineOf(src, m.index ?? 0), `unknown say() speaker "${m[1]}"`);
  // item references
  for (const m of src.matchAll(/(?<![.\w])(?:addItem|removeItem|has|count|equip)\('([a-z_0-9]+)'/g)) {
    if (!items.has(m[1])) report(f, lineOf(src, m.index ?? 0), `unknown item "${m[1]}"`);
  }
  // quest references
  for (const m of src.matchAll(/\b(?:qAt|qActive|qDone|qFailed|qStage|qVar|startQuest|setStage|completeQuest|failQuest)\('([a-z_0-9]+)'/g)) {
    if (!quests.has(m[1])) report(f, lineOf(src, m.index ?? 0), `unknown quest "${m[1]}"`);
  }
  // topics for characters that do not exist
  for (const m of src.matchAll(/\b(?:topic|greet|farewell)\('([a-z_0-9]+)'(?!\s*\+)/g)) if (!chars.has(m[1])) report(f, lineOf(src, m.index ?? 0), `topic for unknown character "${m[1]}"`);
  for (const m of src.matchAll(/\bnpc\('([a-z_0-9]+)'/g)) if (!chars.has(m[1])) report(f, lineOf(src, m.index ?? 0), `npc() for unknown character "${m[1]}"`);
}
// items referenced by merchants, loot tables and recipes
for (const f of extra) {
  const src = read(f);
  for (const m of src.matchAll(/\['([a-z_0-9]+)',\s*\d+/g)) if (!items.has(m[1])) report(f, lineOf(src, m.index ?? 0), `unknown item "${m[1]}"`);
  for (const m of src.matchAll(/herb: '([a-z_0-9]+)'/g)) if (!items.has(m[1])) report(f, lineOf(src, m.index ?? 0), `unknown herb "${m[1]}"`);
  for (const m of src.matchAll(/quest: '([a-z_0-9]+)'/g)) if (!quests.has(m[1])) report(f, lineOf(src, m.index ?? 0), `unknown quest "${m[1]}"`);
}

console.log(`characters ${chars.size}, items ${items.size}, quests ${quests.size}, story files ${storyFiles.length}`);
if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`${problems.length} problem(s)`);
  process.exit(1);
}
console.log('content OK');
