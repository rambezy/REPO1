// Farkle, the tavern dice game. Throw six dice, set aside scoring ones,
// press your luck or bank. First to the target score takes the pot.

import { openScreen, el, button } from '../ui';
import { S } from '../../state';
import { count, addMoney } from '../../systems/inventory';
import { addXp } from '../../systems/stats';
import { sfx } from '../../audio/sfx';
import { notify, esc } from '../notify';
import { emit } from '../../engine/events';
import './minigames.css';

// ---------- scoring ----------

const memo = new Map<string, number>();

/** Best score using ALL the given dice, or 0 if any die doesn't score. */
export function scoreAll(vals: number[]): number {
  if (!vals.length) return 0;
  const key = [...vals].sort().join('');
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const v of vals) c[v]++;
  let best = -Infinity;
  const without = (rm: number[]) => {
    const rest = [...vals];
    for (const r of rm) { const i = rest.indexOf(r); if (i < 0) return null; rest.splice(i, 1); }
    return rest;
  };
  const tryCombo = (rm: number[], pts: number) => {
    const rest = without(rm);
    if (!rest) return;
    const r = rest.length ? scoreAll(rest) : 0;
    if (rest.length && r <= 0) return;
    best = Math.max(best, pts + r);
  };
  if ([1, 2, 3, 4, 5, 6].every((f) => c[f] >= 1)) tryCombo([1, 2, 3, 4, 5, 6], 1500);
  if ([1, 2, 3, 4, 5].every((f) => c[f] >= 1)) tryCombo([1, 2, 3, 4, 5], 500);
  if ([2, 3, 4, 5, 6].every((f) => c[f] >= 1)) tryCombo([2, 3, 4, 5, 6], 750);
  for (let f = 1; f <= 6; f++) for (let n = 3; n <= c[f]; n++) {
    const base = f === 1 ? 1000 : f * 100;
    tryCombo(Array(n).fill(f), base * [0, 0, 0, 1, 2, 4, 8][n]);
  }
  if (c[1]) tryCombo([1], 100);
  if (c[5]) tryCombo([5], 50);
  const res = best === -Infinity ? 0 : best;
  memo.set(key, res);
  return res;
}

/** Best selection from a throw: [score, indices]. */
export function bestPick(vals: number[]): [number, number[]] {
  let best: [number, number[]] = [0, []];
  const n = vals.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) idx.push(i);
    const s = scoreAll(idx.map((i) => vals[i]));
    if (s <= 0) continue;
    // prefer higher score per die kept back
    const value = s + (n - idx.length) * 35;
    const bestValue = best[0] + (n - best[1].length) * 35;
    if (value > bestValue) best = [s, idx];
  }
  return best;
}

type DieKind = 'plain' | 'lucky' | 'weighted';
function rollDie(kind: DieKind): number {
  if (kind === 'lucky') { const r = Math.random(); return r < 0.28 ? 1 : 2 + Math.floor(Math.random() * 5); }
  if (kind === 'weighted') { const r = Math.random(); return r < 0.3 ? 5 : [1, 2, 3, 4, 6][Math.floor(Math.random() * 5)]; }
  return 1 + Math.floor(Math.random() * 6);
}

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export interface DiceOpponent { name: string; risk: number; lucky?: boolean; minBet?: number }

/** Plays a game; resolves with net winnings (negative if lost), or 0 if abandoned. */
export function playDice(opp: DiceOpponent): Promise<number> {
  return new Promise((resolve) => {
    let bet = Math.max(opp.minBet || 5, 5);
    let target = 2000;
    const myKinds: DieKind[] = Array(6).fill('plain');
    if (count('lucky_die')) myKinds[0] = 'lucky';
    if (count('weighted_die')) myKinds[1] = 'weighted';
    const oppKinds: DieKind[] = Array(6).fill('plain');
    if (opp.lucky) oppKinds[0] = 'lucky';
    let scores = [0, 0];
    let turn = 0; // 0 = player
    let turnScore = 0;
    let dice: number[] = [];
    let setAside: number[] = []; // values set aside this turn (display)
    let available = 6;
    let selected = new Set<number>();
    let phase: 'bet' | 'throw' | 'select' | 'opp' | 'over' = 'bet';
    let log = '';
    let resolved = false;
    let throws = 0, shownThrow = 0; // to tumble each fresh throw once
    const finish = (net: number, close: () => void) => {
      if (resolved) return;
      resolved = true;
      close();
      resolve(net);
    };
    openScreen('dice', (close) => {
      const m = el('div', { cls: 'vellum mg mg-dice' });
      const header = el('h2', { html: `Dice with ${esc(opp.name)}` });
      const help = el('p', { cls: 'help', html: 'Throw, then click the scoring dice you want to keep. Keep throwing to build your score, or bank it. Throw nothing that scores, and you lose the turn. Ones are 100, fives 50; three of a kind is the face ×100 (three ones: 1000); each extra die doubles it; 1-5 = 500, 2-6 = 750, 1-6 = 1500.' });
      const board = el('div', { cls: 'score-table' });
      const logEl = el('div', { cls: 'dice-log' });
      const row = el('div', { cls: 'dice-row dice-felt' });
      const aside = el('div', { cls: 'dice-row dice-kept' });
      const tray = el('div', { cls: 'dice-tray' });
      tray.append(aside, row);
      const actions = el('div', { cls: 'actions' });
      actions.style.justifyContent = 'center';
      m.append(header, help, board, tray, logEl, actions);
      const dieEl = (v: number, extra = '') => {
        const d = el('div', { cls: 'die ' + extra });
        for (let i = 0; i < 9; i++) d.append(el('i', { cls: (PIPS[v] || []).includes(i) ? 'on' : '' }));
        return d;
      };
      const render = () => {
        const playing = phase !== 'bet' && phase !== 'over';
        const now = (who: number) => (playing && turn === who ? ' class="now"' : '');
        board.innerHTML = `<span${now(0)}>You</span><span>${scores[0]}</span><span></span><span${now(1)}>${esc(opp.name)}</span><span>${scores[1]}</span><span></span><span>This turn</span><span>${turnScore}</span><span>target ${target} · pot ${bet * 2} g</span>`;
        logEl.innerHTML = log;
        aside.innerHTML = '';
        for (const v of setAside) aside.append(dieEl(v, 'set'));
        row.innerHTML = '';
        const fresh = throws !== shownThrow;
        shownThrow = throws;
        const kinds = turn === 0 ? myKinds : oppKinds;
        tray.classList.toggle('pick', phase === 'select' && turn === 0);
        dice.forEach((v, i) => {
          const kind = kinds[i] && kinds[i] !== 'plain' ? ' ' + kinds[i] : '';
          const d = dieEl(v, (selected.has(i) ? 'held' : '') + (phase === 'throw' || fresh ? ' roll' : '') + kind);
          d.addEventListener('click', () => {
            if (phase !== 'select' || turn !== 0) return;
            if (selected.has(i)) selected.delete(i); else selected.add(i);
            sfx('ui', undefined, undefined, 0.4);
            render();
          });
          row.append(d);
        });
        actions.innerHTML = '';
        if (phase === 'bet') {
          for (const b of [5, 10, 25, 50]) actions.append(button(`Bet ${b} g`, () => { bet = b; render(); }, bet === b ? 'btn sel' : 'btn'));
          actions.append(button(`To ${target === 2000 ? 3000 : 2000}`, () => { target = target === 2000 ? 3000 : 2000; render(); }));
          actions.append(button('Play', () => {
            if (S.money < bet) { notify('You cannot cover that bet.', 'bad'); return; }
            phase = 'throw'; turn = 0; startTurn();
          }, 'btn primary'));
          actions.append(button('Leave', () => finish(0, close)));
          log = `${esc(opp.name)} shakes the cup. "Well? Are we playing?"`;
          logEl.innerHTML = log;
          return;
        }
        if (phase === 'select' && turn === 0) {
          const vals = [...selected].map((i) => dice[i]);
          const sc = scoreAll(vals);
          const ok = selected.size > 0 && sc > 0;
          const left = available - selected.size;
          actions.append(button(ok ? `Keep ${sc} and throw ${left === 0 ? 6 : left}` : 'Select scoring dice', () => { if (ok) keep(true); }, ok ? 'btn primary' : 'btn'));
          actions.append(button(ok ? `Keep and bank ${turnScore + sc}` : 'Bank', () => { if (ok) keep(false); }, ok ? 'btn' : 'btn'));
        }
        if (phase === 'over') actions.append(button('Done', () => finish(scores[0] >= target ? bet : -bet, close), 'btn primary'));
      };
      const throwDice = (kinds: DieKind[]) => {
        dice = [];
        for (let i = 0; i < available; i++) dice.push(rollDie(kinds[i] || 'plain'));
        selected.clear();
        throws++;
        sfx('dice');
      };
      const startTurn = () => {
        turnScore = 0;
        setAside = [];
        available = 6;
        if (turn === 0) playerThrow(); else oppTurn();
      };
      const bust = () => {
        log = turn === 0 ? 'Nothing scores. <b>You lose this turn\'s points.</b>' : `${esc(opp.name)} throws nothing. "Bah!"`;
        turnScore = 0;
        render();
        setTimeout(() => { turn = 1 - turn; startTurn(); }, 1200);
      };
      const playerThrow = () => {
        phase = 'throw';
        throwDice(myKinds);
        render();
        setTimeout(() => {
          if (bestPick(dice)[0] <= 0) { phase = 'opp'; bust(); return; }
          phase = 'select';
          log = 'Choose the dice to keep.';
          render();
        }, 380);
      };
      const keep = (again: boolean) => {
        const idx = [...selected];
        const vals = idx.map((i) => dice[i]);
        turnScore += scoreAll(vals);
        setAside.push(...vals);
        available -= idx.length;
        if (available === 0) { available = 6; setAside = []; log = '<b>Hot dice!</b> All six are yours to throw again.'; }
        dice = dice.filter((_, i) => !selected.has(i));
        selected.clear();
        if (again) { playerThrow(); return; }
        scores[0] += turnScore;
        addXp('speech', 0.5);
        if (scores[0] >= target) return endGame();
        turn = 1;
        render();
        setTimeout(startTurn, 700);
      };
      const oppTurn = () => {
        phase = 'opp';
        const step = () => {
          throwDice(oppKinds);
          render();
          setTimeout(() => {
            const [sc, idx] = bestPick(dice);
            if (sc <= 0) { bust(); return; }
            const vals = idx.map((i) => dice[i]);
            turnScore += sc;
            selected = new Set(idx);
            render();
            setTimeout(() => {
              setAside.push(...vals);
              available -= idx.length;
              if (available === 0) { available = 6; setAside = []; }
              dice = dice.filter((_, i) => !idx.includes(i));
              selected.clear();
              const need = target - scores[1];
              const behind = scores[0] - scores[1];
              let thresh = 300 + opp.risk * 250 + (behind > 800 ? 300 : 0);
              if (available >= 5) thresh += 200;
              if (available <= 2) thresh -= 150;
              const goOn = turnScore < need && (turnScore < thresh || available === 6);
              log = goOn ? `${esc(opp.name)} keeps ${sc} and throws again.` : `${esc(opp.name)} banks ${turnScore}.`;
              render();
              if (goOn) setTimeout(step, 900);
              else {
                scores[1] += turnScore;
                if (scores[1] >= target) { setTimeout(endGame, 700); return; }
                setTimeout(() => { turn = 0; startTurn(); }, 1000);
              }
            }, 800);
          }, 500);
        };
        step();
      };
      const endGame = () => {
        phase = 'over';
        const won = scores[0] >= target;
        if (won) { addMoney(bet); addXp('speech', 4); sfx('quest_done'); log = `<b>You win ${bet * 2} groschen!</b> ${esc(opp.name)} ${Math.random() < 0.5 ? 'swears colourfully.' : 'pushes the coins across with a sour face.'}`; }
        else { addMoney(-bet); sfx('fail'); log = `<b>${esc(opp.name)} wins.</b> "Better luck next time, friend."`; }
        emit('dice:result', opp.name, won);
        render();
      };
      render();
      return m;
    });
  });
}
