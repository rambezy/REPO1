// Weather: each region has its own spells of dust, rain, fog, acid and gas that
// build, linger and pass. Some of it only hides things; some of it burns.
import { REGIONS, WeatherKind } from '../world/regions';
import { S } from './ctx';
import { HOUR, RATE } from './clock';
import { Char } from './char';
import { isKOCondition, isDeadCondition, knockOut, kill } from './health';
import { buildingAt } from './structures';
import { clamp } from '../core/math';

export interface Spell { kind: WeatherKind; i: number; target: number; until: number; }

export const WEATHER_NAME: Record<WeatherKind, string> = {
  clear: 'Clear', overcast: 'Overcast', dust: 'Dust storm', rain: 'Rain', fog: 'Fog', acid: 'Acid rain', gas: 'Poison gas', ash: 'Ashfall', spores: 'Spore drift', heat: 'Scorching heat',
};

/** How much each kind of weather shortens sight at full strength. */
const BLIND: Partial<Record<WeatherKind, number>> = { dust: 0.6, fog: 0.55, rain: 0.2, acid: 0.3, gas: 0.45, ash: 0.35, spores: 0.3 };

export class Weather {
  spells: Spell[] = REGIONS.map(() => ({ kind: 'clear' as WeatherKind, i: 0, target: 0, until: 0 }));
  private hazT = 0;
  private warned = new Set<string>();

  /** Weather at a point. */
  at(x: number, z: number): Spell { return this.spells[S.T.regionIdAt(x, z)] ?? this.spells[0]; }

  /** Multiplier on sight range at a point. */
  sight(x: number, z: number) {
    const s = this.at(x, z);
    return 1 - (BLIND[s.kind] ?? 0) * s.i;
  }

  /** Starts every region somewhere sensible (a new world). */
  seed() {
    for (let r = 0; r < this.spells.length; r++) this.next(r, true);
  }

  private next(r: number, first = false) {
    const s = this.spells[r];
    const table = REGIONS[r].weather;
    const kind = S.rng.weighted(table.map(([k, w]) => [k, w] as [WeatherKind, number]));
    s.kind = kind;
    s.target = kind === 'clear' ? 0 : S.rng.range(0.45, 1);
    s.i = first ? s.target * S.rng.range(0.3, 1) : 0;
    s.until = S.clock.t + S.rng.range(2, 8) * HOUR * (kind === 'clear' ? 1.4 : 1);
  }

  tick(dt: number) {
    const gdt = dt * RATE;
    const rate = gdt / (0.6 * HOUR); // about 35 game minutes to build or clear
    for (let r = 0; r < this.spells.length; r++) {
      const s = this.spells[r];
      if (S.clock.t >= s.until) {
        if (s.kind !== 'clear' && s.i > 0.02) s.target = 0; // let it pass first
        else this.next(r);
      }
      s.i = clamp(s.i + clamp(s.target - s.i, -rate, rate), 0, 1);
    }
    this.hazT -= dt;
    if (this.hazT <= 0) {
      this.hazT = 1;
      for (const c of S.W.active) this.hazards(c, 1);
    }
  }

  private hazards(c: Char, dt: number) {
    if (!c.alive || c.carriedBy || c.animal) return;
    // townsfolk at home know when to get indoors; travellers and your people take their chances
    if (c.faction !== 'player' && c.site) {
      const home = S.T.sites.find((s) => s.id === c.site);
      if (home && home.kind === 'town' && Math.hypot(home.x - c.x, home.z - c.z) < home.r + 100) return;
    }
    const s = this.at(c.x, c.z);
    if (s.i < 0.15 || (s.kind !== 'acid' && s.kind !== 'gas')) return;
    const b = buildingAt(c.x, c.z, 0);
    if (b && b.data?.roof !== 'none') return; // under a roof
    let dmg = 0;
    const limbs: number[] = [];
    if (s.kind === 'acid') {
      dmg = 0.4 * s.i * (1 - c.acidProtection());
      limbs.push(S.rng.int(0, 6), S.rng.int(0, 6));
    } else {
      const masked = c.robot || c.eq.head?.id === 'gasmask';
      if (masked) return;
      dmg = 0.35 * s.i;
      limbs.push(1, S.rng.chance(0.5) ? 0 : 2);
    }
    if (dmg <= 0.01) return;
    for (const l of limbs) if (c.body.has(l)) c.body.hp[l] -= dmg * dt;
    if (c.faction === 'player') {
      const key = `${c.id}:${s.kind}:${s.until}`;
      if (!this.warned.has(key)) {
        this.warned.add(key);
        S.fx.notice(s.kind === 'acid' ? `The acid rain is burning ${c.name}. Get under a roof or into proper gear.` : `${c.name} is choking on the gas. A mask or a roof would help.`, 'bad');
      }
    }
    if (c.status === 'up' && isKOCondition(c)) knockOut(c, s.kind === 'acid' ? 'acid burns' : 'poisoned');
    if (isDeadCondition(c)) kill(c);
  }

  serialize() { return this.spells.map((s) => ({ ...s })); }
  load(o: Spell[] | undefined) {
    if (!o) { this.seed(); return; }
    o.forEach((s, i) => { if (this.spells[i]) Object.assign(this.spells[i], s); });
  }
}
