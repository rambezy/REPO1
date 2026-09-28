// Minimal publish/subscribe bus. Quests and systems listen for game events
// such as 'enter:<region>', 'talk:<npc>', 'kill:<id>', 'item:<id>'.

type Fn = (...args: any[]) => void;
const subs = new Map<string, Set<Fn>>();

export function on(ev: string, fn: Fn): () => void {
  let s = subs.get(ev);
  if (!s) { s = new Set(); subs.set(ev, s); }
  s.add(fn);
  return () => s!.delete(fn);
}

export function emit(ev: string, ...args: any[]) {
  const s = subs.get(ev);
  if (s) for (const fn of [...s]) {
    try { fn(...args); } catch (e) { console.error('event handler failed', ev, e); }
  }
  const any = subs.get('*');
  if (any) for (const fn of [...any]) fn(ev, ...args);
}
