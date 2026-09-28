// Talk dispatch: named characters get authored conversations; everyone else
// gets context-aware small talk, rumours, directions and trade.

import { Actor } from '../world/actor';
import { conversation, say, choose, talk } from './script';
import { emit } from '../engine/events';
import { S, isNight, hourF, flag } from '../state';
import { rand, hashStr } from '../engine/util';
import { openTrade } from '../ui/trade';
import { G } from '../G';
import { rumorFor } from '../content/rumors';

type Handler = (a: Actor) => Promise<void>;
const handlers = new Map<string, Handler>();

export function registerTalk(charId: string, fn: Handler) { handlers.set(charId, fn); }
export function hasTalk(charId: string) { return handlers.has(charId); }

export async function talkTo(a: Actor) {
  const id = a.charId || a.id;
  emit('talk', id, a);
  emit('talk:' + id, a);
  if (a.mem.sleeping || a.pose === 'sleep') {
    await conversation(async () => {
      await say(a, 'angry', rand.pick(['Mmh... what? Go away, it\'s the middle of the night!', 'Who\'s there?! Let a body sleep!', 'Zzz... no, mother, not the goose...']));
    });
    return;
  }
  const h = a.charId ? handlers.get(a.charId) : undefined;
  if (h) { await conversation(() => h(a)); return; }
  await conversation(() => genericTalk(a));
}

// ---------- generic villagers ----------

const GREET: Record<string, string[]> = {
  day: ['God be with you.', 'Good day to you.', 'Mind the mud, stranger.', 'Fine weather for once.', 'Hm? What do you want?'],
  night: ['It\'s late to be wandering.', 'Go home, lad, it\'s dark.', 'You gave me a fright, creeping about like that.'],
  dirty: ['Saints, you stink. Stand downwind, would you?', 'Have you been rolling in a midden?'],
  bloody: ['Is that... blood? Keep away from me.', 'Mother of God, what happened to you?'],
  friendly: ['Ah, it\'s you! Good to see you.', 'Here\'s our hero. God keep you.', 'Anything you need, just ask.'],
  hostileRep: ['I\'ve heard about you. Keep walking.', 'We don\'t want your kind here.'],
};

async function genericTalk(a: Actor) {
  const settlement = G.map.regionAt(a.x, a.y)?.settlement || a.mem.settlement || 'linden';
  const rep = S.rep[settlement] ?? 30;
  let pool = isNight() ? GREET.night : GREET.day;
  if (S.dirt > 70) pool = GREET.dirty;
  if (G.player.combat.bleeding > 0) pool = GREET.bloody;
  if (rep > 75) pool = GREET.friendly;
  if (rep < 10) pool = GREET.hostileRep;
  await say(a, rep < 10 ? 'angry' : rep > 75 ? 'happy' : 'neutral', rand.pick(pool));
  let asked = false;
  for (;;) {
    const c = await choose([
      { id: 'news', text: 'Heard any news?', used: asked },
      { id: 'trade', text: 'Let\'s trade.', if: () => !!a.mem.merchant },
      { id: 'where', text: 'Who are you?' },
      { id: 'bye', text: 'Farewell.' },
    ]);
    if (c === 'bye') { await say(a, 'neutral', rand.pick(['God keep you.', 'Mind how you go.', 'Aye.'])); return; }
    if (c === 'trade') { openTrade(a.mem.merchant, a); return; }
    if (c === 'news') {
      asked = true;
      await say(a, 'neutral', rumorFor(a, settlement));
    }
    if (c === 'where') {
      const job = a.mem.job || rand.pick(['I work the fields for the lord, same as my father did.', 'I keep a few pigs and a very bad temper.', 'I\'m nobody, friend. Just trying to see the winter out.']);
      await say(a, 'neutral', job);
    }
  }
}

/** A short ambient line an NPC says when the player passes by. */
export function barkFor(a: Actor): string | null {
  if (a.mem.barks && a.mem.barks.length) return rand.pick(a.mem.barks as string[]);
  const h = hourF();
  const seed = hashStr(a.id) % 7;
  if (flag('war_news') && Math.random() < 0.3) return rand.pick(['They say the Company burned Hollowbrook to the ground.', 'Lock your doors tonight.', 'God help the villages on the pass road.']);
  if (h < 9) return ['Up with the sun again...', 'My back, my poor back.', 'Morning.'][seed % 3];
  if (h > 20) return ['Home to bed.', 'Goodnight.', 'Ale, then sleep.'][seed % 3];
  return ['Good day.', 'Hm.', 'God be with you.', 'Fine day.', 'Mind yourself.', 'Busy, busy.', 'Hmph.'][seed];
}

export { talk };
