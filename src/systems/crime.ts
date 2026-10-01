// Crime and punishment: witnesses, bounties per settlement, guards who come
// to arrest you, fines, jail and bribery.

import { G } from '../G';
import { Actor } from '../world/actor';
import { here } from '../world/world';
import { S } from '../state';
import { canSee, walkTo, stopScript } from './ai';
import { notify } from '../ui/notify';
import { rand } from '../engine/util';
import { conversation, say, choose, lastCheck } from './script';
import { addMoney } from './inventory';
import { sleepHours } from './survival';
import { sfx } from '../audio/sfx';
import { emit } from '../engine/events';
import { addXp } from './stats';

export type CrimeKind = 'theft' | 'trespass' | 'assault' | 'murder' | 'poaching' | 'robbery' | 'lockpicking';

const FINE: Record<CrimeKind, (sev: number) => number> = {
  theft: (v) => Math.round(v * 2 + 10), trespass: () => 20, assault: () => 40, murder: () => 400, poaching: () => 35, robbery: () => 50, lockpicking: () => 25,
};
const NAMES: Record<CrimeKind, string> = { theft: 'theft', trespass: 'trespassing', assault: 'assault', murder: 'murder', poaching: 'poaching', robbery: 'robbery', lockpicking: 'breaking and entering' };

export function isOwnedByOther(owner?: string) {
  return !!owner && owner !== 'player' && owner !== 'inn' && !S.flags['owns:' + owner];
}

export function settlementHere(): string {
  const r = G.map.regionAt(G.player.x, G.player.y);
  return r?.settlement || (G.map as unknown as { settlement?: string }).settlement || 'linden';
}

export function witnesses(): Actor[] {
  const p = G.player;
  return here().filter((a) => a !== p && !a.isAnimal && !a.dead && !a.mem.down && !a.hostile && !a.surrendered && a.pose !== 'lie'
    && a.faction !== 'bandit' && a.faction !== 'harrow' && !a.mem.accomplice && Math.hypot(a.x - p.x, a.y - p.y) < 160 && canSee(a, p, 160));
}

/** Registers a crime. Returns true if someone saw it. */
export function commitCrime(kind: CrimeKind, severity: number, victim: Actor | null, _quietReturn = false): boolean {
  const w = witnesses();
  if (victim && !victim.dead && !w.includes(victim) && canSee(victim, G.player, 120)) w.push(victim);
  if (!w.length) {
    if (kind === 'theft' || kind === 'lockpicking') addXp('thievery', 2);
    return false;
  }
  const where = settlementHere();
  const fine = FINE[kind](severity);
  S.bounty[where] = (S.bounty[where] || 0) + fine;
  S.rep[where] = Math.max(-100, (S.rep[where] ?? 30) - Math.min(25, 3 + fine / 10));
  const shouter = w[0];
  shouter.say(rand.pick(kind === 'theft' ? ['Thief! Stop, thief!', 'Hey! That\'s not yours!'] : kind === 'murder' ? ['Murder! Murder! Guards!'] : ['Guards! Guards!', 'Help! Over here!']), 3);
  shouter.emoteShow('!', 2);
  notify(`You were seen. Wanted for <b>${NAMES[kind]}</b> in ${placeName(where)} (${S.bounty[where]} g).`, 'bad', 5000);
  sfx('alarm');
  emit('crime', kind, where);
  // alert nearby guards
  for (const g of here()) if (g.tags.has('guard') && !g.dead) { g.mem.pursue = true; g.mem.alerted = true; }
  return true;
}

export function placeName(s: string) {
  return ({ linden: 'Linden Hill', hollowbrook: 'Hollowbrook', priory: 'St. Aldhelm\'s', silverdale: 'Silverdale', refugees: 'the refugee camp', harrow: 'the war camp' } as Record<string, string>)[s] || s;
}

let confronting = false;

/** Guards who know of a bounty walk up to the player and demand payment. */
export function updateCrime() {
  if (G.mode !== 'play' || confronting) return;
  const where = settlementHere();
  const bounty = S.bounty[where] || 0;
  if (bounty <= 0) return;
  const p = G.player;
  for (const g of here()) {
    if (!g.tags.has('guard') || g.dead || g.hostile || g.mem.down) continue;
    const d = Math.hypot(g.x - p.x, g.y - p.y);
    if (!g.mem.pursue && !(d < 120 && canSee(g, p, 140))) continue;
    g.mem.pursue = true;
    if (d > 26) {
      if (!g.mem.script) walkTo(g, p.x, p.y, { run: true, timeout: 12, near: 20 });
      else { g.mem.script.x = p.x; g.mem.script.y = p.y; }
    } else {
      stopScript(g);
      confront(g, where);
      return;
    }
  }
}

async function confront(g: Actor, where: string) {
  confronting = true;
  const bounty = S.bounty[where] || 0;
  await conversation(async () => {
    await say(g, 'angry', `Halt! You're wanted in ${placeName(where)}. The fine is ${bounty} groschen. Pay it, or come with me.`);
    const need = Math.min(12, 3 + Math.floor(bounty / 40));
    const c = await choose([
      { id: 'pay', text: `Pay the fine. (${bounty} groschen)`, locked: S.money < bounty },
      { id: 'talk', text: 'There\'s been a misunderstanding...', check: { stat: 'speech', need } },
      { id: 'bribe', text: `Perhaps ${Math.ceil(bounty / 2)} groschen would clear it up?`, check: { stat: 'speech', need: Math.max(2, need - 3) }, if: () => S.money >= Math.ceil(bounty / 2) },
      { id: 'jail', text: 'I\'ll come quietly.' },
      { id: 'fight', text: 'You\'ll have to take me.' },
    ]);
    if (c === 'pay') {
      addMoney(-bounty);
      S.bounty[where] = 0;
      await say(g, 'neutral', 'Wise. Now keep your hands where honest folk can see them.');
    } else if (c === 'talk') {
      if (lastCheck) { S.bounty[where] = 0; await say(g, 'worried', 'Hm. Well... I suppose I might have been mistaken. Off with you.'); }
      else { await say(g, 'angry', 'Nice try. Pay up, or it\'s the cells.'); await jailOrPay(g, where); }
    } else if (c === 'bribe') {
      if (lastCheck) { addMoney(-Math.ceil(bounty / 2)); S.bounty[where] = 0; await say(g, 'smirk', 'I didn\'t see anything. Did you see anything? No.'); }
      else { S.bounty[where] += 20; await say(g, 'angry', 'Bribing a guard! That\'s another twenty groschen.'); await jailOrPay(g, where); }
    } else if (c === 'jail') {
      await jail(where);
    } else {
      await say(g, 'angry', 'So be it!');
      for (const x of here()) if (x.tags.has('guard') && !x.dead) { x.hostile = true; x.mem.pursue = false; }
    }
  });
  for (const x of here()) if (x.tags.has('guard')) x.mem.pursue = false;
  confronting = false;
}

async function jailOrPay(g: Actor, where: string) {
  const bounty = S.bounty[where] || 0;
  const c = await choose([
    { id: 'pay', text: `Pay the fine. (${bounty} groschen)`, locked: S.money < bounty },
    { id: 'jail', text: 'Take me, then.' },
  ]);
  if (c === 'pay') { addMoney(-bounty); S.bounty[where] = 0; await say(g, 'neutral', 'Off you go.'); }
  else await jail(where);
}

async function jail(where: string) {
  const bounty = S.bounty[where] || 0;
  const days = Math.min(5, Math.max(1, Math.round(bounty / 80)));
  await say('narrator', 'neutral', `You spend ${days} day${days > 1 ? 's' : ''} in a cell that smells of old straw and older sorrows.`);
  // stolen goods are confiscated
  S.inv = S.inv.filter((s) => !s.stolen);
  S.bounty[where] = 0;
  S.rep[where] = Math.max(-100, (S.rep[where] ?? 30) - 5);
  await sleepHours(days * 24 - 12, { quality: 0.6, noSave: true, reason: 'jail' });
  notify('You are released, lighter in purse and pride.', 'bad');
}
