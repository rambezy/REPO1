// Conversations: a tiny node graph with conditions and effects. Which tree an
// NPC offers depends on who they are, who you are, and what you have done.
import { Char } from './char';
import { S } from './ctx';
import { FACTION } from '../content/factions';
import { RACE } from '../content/races';
import { SETTLEMENT } from '../content/layout';
import { totalBounty } from './crime';
import { aggro, pickUp } from './ai';
import { emit } from '../core/events';
import { greeting, rumour, aboutMe, aboutPlace, LINES } from '../content/lines';
import { knockOut, dropCarried } from './health';
import { ITEM } from '../content/items';
import { freeFromCage } from './orders';
import { strengthOf } from './combat';
import { bountiesFor, claimValue, claimBounty } from './bounties';
import { taxFor } from './raids';
import { UNIQUE_BY_KEY, uniqueReady } from './uniques';
import { PIT_TIERS, startBout, boutRunning, tierOpen } from './arena';

export interface DCtx { p: Char; n: Char; vars: Record<string, any>; }
export interface DChoice { t: string | ((c: DCtx) => string); next?: string; if?: (c: DCtx) => boolean; fx?: (c: DCtx) => void | string; end?: boolean; }
export interface DNode { t: string | ((c: DCtx) => string); ch?: DChoice[]; fx?: (c: DCtx) => void; }
export type Tree = Record<string, DNode>;

const str = (v: string | ((c: DCtx) => string), c: DCtx) => (typeof v === 'function' ? v(c) : v);
export const say = str;

export function recruit(c: DCtx) {
  const n = c.n;
  const sq = S.W.squadOf(c.p);
  if (!sq) return;
  n.faction = 'player';
  n.role = 'player';
  n.title = '';
  n.recruitable = false;
  n.shackled = false;
  n.dirty = true;
  n.brain = {};
  n.order = null;
  S.W.moveToSquad(n, sq);
  S.W.say(`${n.name} joined ${S.W.factionName}.`, 'good', S.clock.t);
  S.fx.notice(`${n.name} has joined you.`, 'good');
  emit('squad');
}

/** What has happened to a town lately: a sacking, a dead leader. */
function troubles(c: DCtx): string {
  const site = S.T.sites.find((s) => s.id === c.n.site);
  if (!site) return '';
  const W = S.W;
  const sacked = W.flags.sacked?.[site.id];
  const days = (t: number) => Math.max(1, Math.round((S.clock.t - t) / 86400));
  if (sacked && S.clock.t - sacked < 86400 * 10) {
    const d = days(sacked);
    return S.rng.pick([`Raiders came through ${d === 1 ? 'yesterday' : d + ' days ago'}. We're still counting who's missing. `, `We were sacked ${d === 1 ? 'yesterday' : d + ' days ago'}. The shops are bare and the Watch is half what it was. `, `You've come at a bad time. ${d === 1 ? 'Yesterday' : d + ' days ago'} the raiders took everything they could carry. `]);
  }
  const fallen = W.flags.leaderless?.[site.id];
  if (fallen && S.clock.t - fallen < 86400 * 12) return S.rng.pick(['Our leader is dead, and everyone with a sword thinks they should be next. ', 'Nobody rules here right now. Keep your head down. ']);
  return '';
}

/** Tunde's sister Ama, in the east paddy: she asks after her brother. */
function sisterLine(c: DCtx): string {
  const withYou = S.W.playerChars().some((m) => m.unique === c.n.mem.sister && m.alive);
  return withYou
    ? 'That man with you. That\'s Tunde. That\'s my brother. Don\'t let the overseer see me looking.'
    : 'Keep your voice down. If you ever pass Brokenchain, in the reeds, ask for a runaway called Tunde. Tell him his sister is still in the east paddy. Tell him Ama is still counting.';
}

/** Common farewell and utility choices. */
const BYE: DChoice = { t: 'Goodbye.', end: true };

function wanted(c: DCtx) { return (c.p.bounty[c.n.faction] ?? 0) > 0; }
function guardish(n: Char) { return n.role === 'guard' || n.role === 'patrol'; }

// ---------------------------------------------------------------- trees
const TREES: Record<string, Tree> = {
  generic: {
    start: {
      t: (c) => greeting(c.n, c.p),
      ch: [
        { t: 'Who are you?', next: 'who' },
        { t: 'What is this place?', next: 'place' },
        { t: 'Heard any news?', next: 'news' },
        { t: 'Can we trade?', if: (c) => !!c.n.shop, fx: (c) => { emit('ui:trade', c.p.id, c.n.id); return 'end'; } },
        BYE,
      ],
    },
    who: { t: (c) => aboutMe(c.n), ch: [{ t: 'What is this place?', next: 'place' }, { t: 'Heard any news?', next: 'news' }, BYE] },
    place: { t: (c) => troubles(c) + aboutPlace(c.n), ch: [{ t: 'Who are you?', next: 'who' }, { t: 'Heard any news?', next: 'news' }, BYE] },
    news: { t: (c) => rumour(c.n), ch: [{ t: 'Anything else?', next: 'news2' }, BYE] },
    news2: { t: (c) => rumour(c.n), ch: [{ t: 'Who are you?', next: 'who' }, BYE] },
  },
  shopkeeper: {
    start: {
      t: (c) => greeting(c.n, c.p),
      ch: [
        { t: 'Show me what you have.', fx: (c) => { emit('ui:trade', c.p.id, c.n.id); return 'end'; } },
        { t: 'What is this place?', next: 'place' },
        { t: 'Heard any news?', next: 'news' },
        BYE,
      ],
    },
    place: { t: (c) => troubles(c) + aboutPlace(c.n), ch: [{ t: 'Show me what you have.', fx: (c) => { emit('ui:trade', c.p.id, c.n.id); return 'end'; } }, BYE] },
    news: { t: (c) => rumour(c.n), ch: [{ t: 'Show me what you have.', fx: (c) => { emit('ui:trade', c.p.id, c.n.id); return 'end'; } }, BYE] },
  },
  recruit: {
    start: {
      t: (c) => greeting(c.n, c.p),
      ch: [
        { t: 'Tell me about yourself.', next: 'story' },
        { t: 'I could use someone like you. Join me?', next: 'ask' },
        { t: 'Heard any news?', next: 'news' },
        BYE,
      ],
    },
    story: { t: (c) => c.n.mem.backstory ?? aboutMe(c.n), ch: [{ t: 'Join me?', next: 'ask' }, BYE] },
    news: { t: (c) => rumour(c.n), ch: [{ t: 'Join me?', next: 'ask' }, BYE] },
    ask: {
      t: (c) => c.n.price > 0 ? S.rng.pick([`${c.n.price} chits and I'm yours. Well, my sword is.`, `It'll cost you. ${c.n.price} chits, up front.`, `I don't work for free. ${c.n.price} chits.`]) : S.rng.pick(['You mean it? I have nothing left here anyway. Yes.', 'Anything is better than this. I\'ll come.', 'Food and a place in your camp? Done.']),
      ch: [
        { t: (c) => c.n.price > 0 ? `Here's ${c.n.price} chits. Welcome aboard.` : 'Then welcome aboard.', if: (c) => S.W.money >= c.n.price, fx: (c) => { S.W.money -= c.n.price; recruit(c); }, next: 'joined' },
        { t: 'I can\'t afford that right now.', if: (c) => S.W.money < c.n.price, next: 'broke' },
        { t: 'Maybe later.', end: true },
      ],
    },
    joined: { t: () => S.rng.pick(['Lead the way, boss.', 'I won\'t let you down.', 'Right. Where are we going?', 'Let\'s go before I change my mind.']), ch: [{ t: 'Let\'s go.', end: true }] },
    broke: { t: 'Then come back when you can.', ch: [BYE] },
  },
  prisoner: {
    start: {
      t: (c) => S.rng.pick(['Get me out of here. Please. I\'ll follow you anywhere.', 'You there! Open this cage and I\'m yours, I swear it.', 'They\'re going to sell me. Or worse. Help me.', 'Water... or a key. Either.']),
      ch: [
        { t: 'Why are you in there?', next: 'why' },
        { t: 'I\'ll get you out. (Pick the lock)', fx: (c) => { emit('order', c.p, { k: 'lockpick', obj: c.n.cage }); return 'end'; } },
        { t: 'You\'re free now. Come with me.', if: (c) => !c.n.cage, fx: (c) => recruit(c), next: 'joined' },
        { t: 'Not my problem.', end: true },
      ],
    },
    why: { t: (c) => c.n.mem.backstory ?? 'Does it matter? They caught me.', ch: [{ t: 'I\'ll get you out.', fx: (c) => { emit('order', c.p, { k: 'lockpick', obj: c.n.cage }); return 'end'; } }, BYE] },
    joined: { t: 'Thank you. I won\'t forget this.', ch: [{ t: 'Let\'s go.', end: true }] },
  },
  slave: {
    start: {
      t: (c) => c.n.mem.sister ? sisterLine(c) : S.rng.pick(['Don\'t talk to me. The overseer is watching.', 'Please... if you have a lockpick...', 'Keep walking, stranger. There\'s nothing here but the lash.', 'The Chainhouse took my whole village. Every one of us.']),
      ch: [
        { t: 'I could get those shackles off you.', fx: (c) => { emit('order', c.p, { k: 'free', id: c.n.id }); return 'end'; } },
        { t: 'You\'re free. Come with me.', if: (c) => !c.n.shackled, fx: (c) => { recruit(c); }, next: 'joined' },
        { t: 'Sorry.', end: true },
      ],
    },
    joined: { t: 'Free... I\'m free. Let\'s go before they notice.', ch: [{ t: 'Run.', end: true }] },
  },
  guard: {
    start: {
      t: (c) => wanted(c) ? `You! You're wanted by the ${FACTION[c.n.faction].short} — ${c.p.bounty[c.n.faction]} chits on your head. Pay it now or come quietly.` : greeting(c.n, c.p),
      ch: [
        { t: (c) => `Pay the ${c.p.bounty[c.n.faction]} chits.`, if: (c) => wanted(c) && S.W.money >= (c.p.bounty[c.n.faction] ?? 0), fx: (c) => { S.W.money -= c.p.bounty[c.n.faction]; c.p.bounty[c.n.faction] = 0; S.W.rel.add('player', c.n.faction, 3); }, next: 'paid' },
        { t: 'I surrender.', if: wanted, fx: (c) => { knockOut(c.p, 'surrendered'); c.p.body.koT = -30; c.n.brain.task = { k: 'arrest', id: c.p.id, t: 0 }; return 'end'; } },
        { t: (c) => `I've brought in ${S.W.char(c.p.carrying)?.name}. (Collect ${claimValue(c.p, c.n.faction)} chits)`, if: (c) => !wanted(c) && claimValue(c.p, c.n.faction) > 0, fx: (c) => { c.vars.paid = claimBounty(c.p, c.n.faction); }, next: 'claimed' },
        { t: 'You\'ll have to take me. (Fight)', if: wanted, fx: (c) => { fightNow(c); return 'end'; } },
        { t: 'Anything I should know about this place?', if: (c) => !wanted(c), next: 'place' },
        { t: 'Heard any news?', if: (c) => !wanted(c), next: 'news' },
        { t: 'Any bounties worth collecting?', if: (c) => !wanted(c), next: 'bounties' },
        { t: 'Goodbye.', if: (c) => !wanted(c), end: true },
      ],
    },
    paid: { t: 'Hm. Behave yourself, or next time it\'s the cage.', ch: [BYE] },
    place: { t: (c) => troubles(c) + aboutPlace(c.n), ch: [{ t: 'Any bounties?', next: 'bounties' }, BYE] },
    news: { t: (c) => rumour(c.n), ch: [BYE] },
    bounties: { t: (c) => bountyTalk(c), ch: [BYE] },
    claimed: { t: (c) => `${c.vars.paid} chits. ${S.rng.pick(['Good work. The road is a little safer.', 'Didn\'t think you had it in you.', 'We\'ll take it from here.', 'Count it if you like. It\'s all there.'])}`, ch: [{ t: 'Any other bounties?', next: 'bounties' }, BYE] },
  },
  demand_tribute: {
    start: {
      t: (c) => S.rng.pick(LINES.tribute),
      ch: [
        { t: (c) => `Fine. Take ${tribute(c)} chits.`, if: (c) => S.W.money >= tribute(c), fx: (c) => { S.W.money -= tribute(c); settle(c); }, next: 'paid' },
        { t: 'Walk away while you still can.', if: (c) => strongerThan(c), fx: (c) => { if (S.rng.chance(0.65)) { settle(c); c.vars.backed = true; } else fightNow(c); }, next: 'intim' },
        { t: 'Over my dead body. (Fight)', fx: (c) => { fightNow(c); return 'end'; } },
      ],
    },
    paid: { t: () => S.rng.pick(['Smart. Move along.', 'Pleasure doing business.', 'See? Nobody had to bleed.']), ch: [BYE] },
    intim: { t: (c) => c.vars.backed ? S.rng.pick(['...Not worth it. Go on, then.', 'Tch. Another day.']) : 'Big words! Get them!', ch: [BYE] },
  },
  demand_tax: {
    start: {
      t: (c) => `By order of the Lords of the Gilded Concord, every holding on Concord land owes its tithe. Yours comes to ${taxFor()} chits.`,
      ch: [
        { t: (c) => `Pay the ${taxFor()} chits.`, if: () => S.W.money >= taxFor(), fx: (c) => { S.W.money -= taxFor(); settle(c); S.W.rel.add('player', 'concord', 4); S.W.say(`${S.W.factionName} paid ${taxFor()} chits in Concord tax.`, 'trade', S.clock.t); }, next: 'paid' },
        { t: 'We have nothing to give.', if: () => S.W.money < taxFor(), next: 'broke' },
        { t: 'The Concord gets nothing from us. (Fight)', fx: (c) => { S.W.rel.add('player', 'concord', -20); fightNow(c); return 'end'; } },
      ],
    },
    paid: { t: () => S.rng.pick(['Your contribution is noted. The Lords are generous to those who pay.', 'Good. We will see you again next season.', 'A pleasure doing the Lords\' business.']), ch: [BYE] },
    broke: { t: 'Then the Lords will take it in kind. Stand aside while we inventory your stores.', ch: [{ t: 'Fine. Take what you need.', fx: (c) => { settle(c); const sq = S.W.squadOf(c.n); if (sq) sq.flags.takeInKind = true; }, next: 'paid' }, { t: 'Touch our things and you die. (Fight)', fx: (c) => { S.W.rel.add('player', 'concord', -20); fightNow(c); return 'end'; } }] },
  },
  demand_food: {
    start: {
      t: () => S.rng.pick(LINES.hungry),
      ch: [
        { t: 'Here. Take some food.', if: (c) => hasFood(c.p), fx: (c) => { giveFood(c); settle(c); S.W.rel.add('player', c.n.faction, 5); }, next: 'fed' },
        { t: 'I have nothing for you. (Fight)', fx: (c) => { fightNow(c); return 'end'; } },
      ],
    },
    fed: { t: () => S.rng.pick(['Thank you... thank you.', 'Bless you. We won\'t forget.', 'Food! Oh, food!']), ch: [BYE] },
  },
  inquisitor: {
    start: {
      t: () => S.rng.pick(LINES.inquisitor),
      ch: [
        { t: 'We are leaving.', fx: (c) => { settle(c); c.n.mem.warned = S.clock.t; }, next: 'go' },
        { t: 'Your Ember can burn itself. (Fight)', fx: (c) => { fightNow(c); return 'end'; } },
      ],
    },
    go: { t: 'Go, then. And pray the Ember is merciful when next we meet.', ch: [BYE] },
  },
  slaver: {
    start: {
      t: () => S.rng.pick(LINES.slaver),
      ch: [
        { t: 'We\'re not for sale.', fx: (c) => { if (strongerThan(c)) settle(c); else fightNow(c); }, next: 'res' },
        { t: '(Fight)', fx: (c) => { fightNow(c); return 'end'; } },
      ],
    },
    res: { t: (c) => S.rng.pick(['Pity. Another time.', 'We\'ll see about that.']), ch: [BYE] },
  },
  sell_captive: {
    start: {
      t: (c) => `A fine specimen. I'll give you ${captivePrice(c)} chits for them.`,
      ch: [
        { t: (c) => `Sold. (${captivePrice(c)} chits)`, fx: (c) => sellCaptive(c), next: 'done' },
        { t: 'Not today.', end: true },
      ],
    },
    done: { t: 'Pleasure. The Chainhouse thanks you.', ch: [BYE] },
  },
};

function tribute(c: DCtx) { return Math.max(50, Math.round(Math.min(S.W.money * 0.25, 2000) / 10) * 10); }
function strongerThan(c: DCtx) {
  const mine = strengthOf(S.W.playerChars().filter((m) => Math.hypot(m.x - c.p.x, m.z - c.p.z) < 40));
  const sq = S.W.squadOf(c.n);
  const theirs = strengthOf((sq?.members ?? []).map((id) => S.W.char(id)!).filter(Boolean));
  return mine > theirs * 1.3;
}
function settle(c: DCtx) {
  const sq = S.W.squadOf(c.n);
  if (sq) { sq.flags.settled = S.clock.t; sq.spoke = true; }
}
function fightNow(c: DCtx) {
  const sq = S.W.squadOf(c.n);
  const group = (sq?.members ?? [c.n.id]).map((id) => S.W.char(id)!).filter(Boolean);
  for (const pc of S.W.playerChars()) if (Math.hypot(pc.x - c.n.x, pc.z - c.n.z) < 50) aggro(group, pc);
  if (sq) sq.spoke = true;
}
function hasFood(p: Char) { return S.W.playerChars().some((m) => m.inv.first((d) => d.cat === 'food') || m.eq.back?.inv?.first((d) => d.cat === 'food')); }
function giveFood(c: DCtx) {
  let need = 3;
  for (const m of S.W.playerChars()) for (const g of [m.inv, m.eq.back?.inv]) {
    if (!g || need <= 0) continue;
    for (const it of g.items.slice()) {
      if (need <= 0) break;
      if (ITEM[it.id].cat !== 'food') continue;
      const k = Math.min(need, it.n);
      it.n -= k; need -= k;
      if (it.n <= 0) g.remove(it);
    }
  }
  const sq = S.W.squadOf(c.n);
  for (const id of sq?.members ?? []) { const m = S.W.char(id); if (m) m.hunger = 250; }
}
function captivePrice(c: DCtx) {
  const t = S.W.char(c.p.carrying);
  if (!t) return 0;
  const lvl = Array.from(t.sk).reduce((a, b) => a + b, 0) / t.sk.length;
  return Math.round((300 + lvl * 40) * (RACE[t.look.race]?.race === 'karuk' ? 1.4 : 1) / 10) * 10;
}
function sellCaptive(c: DCtx) {
  const t = S.W.char(c.p.carrying);
  if (!t) return;
  S.W.money += captivePrice(c);
  dropCarried(c.p);
  t.shackled = true;
  t.role = 'slave';
  t.faction = c.n.faction;
  t.mem.enslavedBy = c.n.faction;
  t.dirty = true;
  const sq = S.W.squadOf(c.n);
  if (sq) S.W.moveToSquad(t, sq);
  S.fx.notice(`Sold ${t.name} to the ${FACTION[c.n.faction].short}.`, 'info');
}
function bountyTalk(c: DCtx) {
  const list = bountiesFor(c.n.faction).sort((a, b) => b.reward - a.reward).slice(0, 3);
  if (!list.length) return S.rng.pick(['Nothing posted. Try the other towns.', 'Bounties? Ask the Watch captain. Or don\'t.', 'Not right now.']);
  const parts = list.map((b) => {
    const site = S.T.sites.find((x) => x.id === b.site);
    if (site) S.W.seenSites.add(site.id); // now you have heard of it
    return `${b.name}, ${b.title}: ${b.reward} chits, holed up at ${site?.name ?? 'somewhere in the waste'}`;
  });
  return `On the board: ${parts.join('; ')}. Alive pays best. Dead pays less, and you carry the smell.`;
}

/** Which conversation an NPC offers the player. */
export function treeFor(n: Char, p: Char): [Tree, string] {
  if (n.dialogue && UNIQUE_TREES[n.dialogue]) return [UNIQUE_TREES[n.dialogue], 'start'];
  const f = FACTION[n.faction];
  const sq = S.W.squadOf(n);
  if (n.cage) return [TREES.prisoner, 'start'];
  if (n.role === 'slave') return [TREES.slave, 'start'];
  if (p.carrying && (n.faction === 'chainhouse' || (n.role === 'shopkeeper' && S.W.shops.get(+n.shop)?.kind === 'slaves'))) return [TREES.sell_captive, 'start'];
  if (sq && !sq.flags.settled && f?.demands === 'tribute' && (f.attitude === 'bandit' || n.faction === 'scorched') && n.role !== 'shopkeeper' && n.role !== 'barkeep' && !S.W.populated.has(-1)) {
    if (n.faction === 'reavers' || (n.faction === 'scorched' && sq.kind !== 'town')) return [TREES.demand_tribute, 'start'];
  }
  if (sq?.flags.demand === 'tax' && !sq.flags.settled) return [TREES.demand_tax, 'start'];
  if (n.faction === 'starvelings') return [TREES.demand_food, 'start'];
  if (n.faction === 'ember' && guardish(n) && RACE[p.look.race]?.race !== 'human') return [TREES.inquisitor, 'start'];
  if (n.recruitable) return [TREES.recruit, 'start'];
  if (guardish(n)) return [TREES.guard, 'start'];
  if (n.shop) return [TREES.shopkeeper, 'start'];
  return [TREES.generic, 'start'];
}

// ---------------------------------------------------------------- named people
const U = (c: DCtx) => UNIQUE_BY_KEY[c.n.unique];
const uniqueJoinable = (c: DCtx) => !!U(c) && c.n.faction !== 'player' && uniqueReady(U(c), c.p, c.n) && S.W.money >= (U(c).price ?? 0);
export const UNIQUE_TREES: Record<string, Tree> = {
  unique: {
    start: {
      t: (c) => (c.n.faction === 'player' ? S.rng.pick(['What now?', 'I\'m listening.', 'Say it.']) : U(c)?.lines.greet ?? greeting(c.n, c.p)),
      ch: [
        { t: 'Who are you?', next: 'about' },
        { t: 'Heard anything worth knowing?', next: 'rumour' },
        { t: 'Would you come with us?', if: (c) => c.n.faction !== 'player', next: 'ask' },
        BYE,
      ],
    },
    about: { t: (c) => U(c)?.lines.about ?? aboutMe(c.n), ch: [{ t: 'Anything else?', next: 'start' }, BYE] },
    rumour: { t: (c) => U(c)?.lines.rumour ?? rumour(c.n), ch: [{ t: 'Something else.', next: 'start' }, BYE] },
    ask: {
      t: (c) => U(c)?.lines.ask ?? 'Maybe.',
      ch: [
        { t: (c) => (U(c).price ? `Here are your ${U(c).price.toLocaleString()} chits.` : 'Then come with us.'), if: uniqueJoinable, fx: (c) => {
          const u = U(c);
          S.W.money -= u.price;
          recruit(c);
          c.n.title = u.title;
          c.n.dialogue = 'unique';
          S.W.say(`${c.n.name}, ${u.title}, joined ${S.W.factionName}.`, 'good', S.clock.t);
        }, next: 'joined' },
        { t: 'What would it take?', if: (c) => !uniqueJoinable(c), next: 'refused' },
        { t: 'Another time.', next: 'start' },
      ],
    },
    joined: { t: (c) => U(c)?.lines.join ?? 'Let\'s go.', ch: [BYE] },
    refused: { t: (c) => U(c)?.lines.refuse ?? 'Not yet.', ch: [{ t: 'We\'ll see.', next: 'start' }, BYE] },
  },
  arena: {
    start: {
      t: () => boutRunning() ? 'Watch, or wait your turn. The sand is taken.' : S.rng.pick(['Blood on the sand! You want to fight, small one?', 'The Pit is open. Coin in, and then your teeth.', 'The crowd is bored. Are you going to fix that?']),
      ch: [
        { t: 'How does the Pit work?', next: 'rules' },
        ...PIT_TIERS.map((tier, i) => ({
          t: `${tier.name}: ${tier.fee} chits to enter, a purse of ${tier.purse}.`,
          if: () => !boutRunning() && tierOpen(i),
          fx: (c: DCtx) => { const err = startBout(c.p, i); c.vars.err = err; return err ? undefined : 'end'; },
          next: 'no',
        } as DChoice)),
        BYE,
      ],
    },
    rules: { t: 'You pay the entry. You fight until one of you drops. Nobody dies in my Pit if I can help it: we are Karuk, not Mawkin. Win and the purse is yours. Beat my veteran and you may try the Champion. Run and the crowd will remember your back.', ch: [{ t: 'I understand.', next: 'start' }, BYE] },
    no: { t: (c) => c.vars.err ?? 'Get in the ring!', ch: [{ t: 'Fine.', next: 'start' }, BYE] },
  },
};

/** Runs a choice's effect; returns the next node key or null to end. */
export function choose(tree: Tree, ch: DChoice, c: DCtx): string | null {
  let r: void | string = undefined;
  if (ch.fx) r = ch.fx(c);
  if (r === 'end' || ch.end) return null;
  return ch.next ?? null;
}

export { str as text, recruit as joinSquad, freeFromCage, pickUp, SETTLEMENT, totalBounty };
