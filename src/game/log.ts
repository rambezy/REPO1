// Message log and a tiny event bus for UI refreshes.

export const LOG: string[] = [];
type Fn = (...args: any[]) => void;
const listeners: Record<string, Fn[]> = {};

export function on(ev: string, fn: Fn) {
  (listeners[ev] ??= []).push(fn);
}

export function emit(ev: string, ...args: any[]) {
  for (const fn of listeners[ev] ?? []) fn(...args);
}

export function msg(text: string) {
  LOG.push(text);
  if (LOG.length > 300) LOG.splice(0, LOG.length - 300);
  emit('log', text);
}

export function clearLog() {
  LOG.length = 0;
  emit('log');
}
