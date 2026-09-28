// A tiny event bus used between simulation, rendering, audio and UI.
type Fn = (...a: any[]) => void;
const handlers = new Map<string, Set<Fn>>();

export function on(ev: string, fn: Fn) {
  let s = handlers.get(ev);
  if (!s) handlers.set(ev, (s = new Set()));
  s.add(fn);
  return () => s!.delete(fn);
}
export function emit(ev: string, ...args: any[]) {
  const s = handlers.get(ev);
  if (s) for (const fn of s) fn(...args);
}
