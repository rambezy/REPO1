// Seven body parts, each with its own health. Vital parts at zero knock you
// out; at minus their maximum they kill you. Limbs break, bleed and can be
// cut off. Blood drains from open wounds until treated or clotted.
import { RACE } from '../content/races';

export const LIMBS = ['head', 'chest', 'stomach', 'larm', 'rarm', 'lleg', 'rleg'] as const;
export type Limb = (typeof LIMBS)[number];
export const LI = { head: 0, chest: 1, stomach: 2, larm: 3, rarm: 4, lleg: 5, rleg: 6 } as const;
export const LIMB_NAMES = ['Head', 'Chest', 'Stomach', 'Left Arm', 'Right Arm', 'Left Leg', 'Right Leg'];
export const BASE_HP = [60, 95, 85, 65, 65, 75, 75];
/** Where blows land, by weight. */
export const HIT_WEIGHTS = [0.11, 0.27, 0.2, 0.1, 0.12, 0.1, 0.1];

export class Body {
  hp = new Float32Array(7);
  max = new Float32Array(7);
  bleed = new Float32Array(7); // blood per second
  treated = new Float32Array(7); // bandage quality (speeds healing, stops bleeding)
  lost = 0; // bitmask
  splint = 0; // bitmask
  prost: (string | null)[] = [null, null, null, null, null, null, null];
  blood = 100;
  bloodMax = 100;
  koT = 0; // seconds knocked out
  robotic = false;

  init(race: string, toughness: number) {
    const r = RACE[race];
    const mul = (r?.hp ?? 1) * (1 + toughness * 0.004);
    for (let i = 0; i < 7; i++) {
      this.max[i] = Math.round(BASE_HP[i] * mul);
      this.hp[i] = this.max[i];
    }
    this.robotic = !!r?.robotic;
    this.bloodMax = Math.round(100 * (r?.hp ?? 1));
    this.blood = this.bloodMax;
  }
  rescale(race: string, toughness: number) {
    const r = RACE[race];
    const mul = (r?.hp ?? 1) * (1 + toughness * 0.004);
    for (let i = 0; i < 7; i++) {
      const nm = Math.round(BASE_HP[i] * mul);
      if (nm !== this.max[i]) { this.hp[i] += nm - this.max[i]; this.max[i] = nm; }
    }
  }
  has(l: number) { return !(this.lost & (1 << l)); }
  /** Worst fraction of health across vital parts. */
  vital() {
    return Math.min(this.hp[0] / this.max[0], this.hp[1] / this.max[1], this.hp[2] / this.max[2]);
  }
  total() {
    let s = 0, m = 0;
    for (let i = 0; i < 7; i++) { if (!this.has(i)) continue; s += Math.max(0, this.hp[i]); m += this.max[i]; }
    return m ? s / m : 0;
  }
  bleeding() {
    let b = 0;
    for (let i = 0; i < 7; i++) b += this.bleed[i];
    return b;
  }
  armOK(l: 3 | 4) { return this.has(l) ? this.hp[l] > 0 || !!this.prost[l] : !!this.prost[l]; }
  legOK(l: 5 | 6) {
    if (!this.has(l)) return !!this.prost[l];
    return this.hp[l] > 0 || !!(this.splint & (1 << l));
  }
  canWalk() { return this.legOK(5) && this.legOK(6); }
  limp(): number {
    const l = this.has(5) ? this.hp[5] / this.max[5] : this.prost[5] ? 0.6 : 0;
    const r = this.has(6) ? this.hp[6] / this.max[6] : this.prost[6] ? 0.6 : 0;
    if (Math.min(l, r) > 0.35) return 0;
    return l < r ? 1 : 2;
  }
  /** Damage needing treatment (for medics). */
  needsAid() {
    for (let i = 0; i < 7; i++) {
      if (!this.has(i)) continue;
      if (this.bleed[i] > 0.02) return true;
      if (this.hp[i] < this.max[i] * 0.75 && this.treated[i] < 0.5) return true;
      if (i >= 5 && this.hp[i] <= 0 && !(this.splint & (1 << i))) return true; // a broken leg wants a splint
    }
    return false;
  }
  serialize() {
    return { hp: [...this.hp], max: [...this.max], bleed: [...this.bleed], treated: [...this.treated], lost: this.lost, splint: this.splint, prost: this.prost, blood: this.blood, bloodMax: this.bloodMax, koT: this.koT, robotic: this.robotic };
  }
  static from(o: any) {
    const b = new Body();
    b.hp.set(o.hp); b.max.set(o.max); b.bleed.set(o.bleed); b.treated.set(o.treated);
    b.lost = o.lost; b.splint = o.splint; b.prost = o.prost; b.blood = o.blood; b.bloodMax = o.bloodMax; b.koT = o.koT; b.robotic = o.robotic;
    return b;
  }
}
