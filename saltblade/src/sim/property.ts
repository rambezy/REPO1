// Houses for sale in the towns that will sell to strangers. A bought house
// is yours: its beds and chests, a roof against the acid rain, and a place
// to put furniture where the town will not let you build.
import { S } from './ctx';
import { WObj } from './objects';
import { RNG, hash3 } from '../core/rng';
import { toWorld, BuildingData, TownInfo } from '../world/towns';
import { FACTION } from '../content/factions';
import { emit } from '../core/events';

const SELLERS = ['drifters', 'concord', 'delvers', 'hollows', 'karuk', 'unchained'];
const USES = ['house', 'shack', 'house_big', 'hut', 'farmhouse'];

/** Picks a few empty houses in each town to put up for sale (new worlds only). */
export function markHousesForSale() {
  const W = S.W;
  for (const [siteId, info] of W.towns as Map<number, TownInfo>) {
    const fac = info.site.faction;
    if (!fac || !SELLERS.includes(fac)) continue;
    const rng = new RNG(hash3(info.site.seed, 555, 9));
    const cands: WObj[] = rng.shuffle(info.buildings.filter((b) => USES.includes(b.data?.use) && !b.data.shop));
    const n = Math.min(cands.length, Math.max(1, Math.round(cands.length * 0.12)), 3);
    for (const b of cands.slice(0, n)) {
      const d = b.data as BuildingData & { forSale?: number };
      const price = Math.round((d.w * d.d * (d.floors ?? 1) * 42 + 900) * (fac === 'concord' ? 1.6 : 1) / 100) * 100;
      d.forSale = price;
      const door = d.doors[0] ?? { side: 's', off: 0, w: 1.6 };
      const hw = d.w / 2, hd = d.d / 2;
      const [lx, lz] = door.side === 's' ? [door.off + 1.4, hd + 0.9] : door.side === 'n' ? [door.off + 1.4, -hd - 0.9] : door.side === 'e' ? [hw + 0.9, door.off + 1.4] : [-hw - 0.9, door.off + 1.4];
      const [wx, wz] = toWorld(b, lx, lz);
      W.addObj({ id: 0, kind: 'sign', def: 'forsale', x: wx, z: wz, y: S.T.heightAt(wx, wz), rot: b.rot, owner: fac, site: siteId, parent: 0, data: { building: b.id, price } });
      // nobody lives there
      info.beds = info.beds.filter((id) => W.objs.get(id)?.parent !== b.id);
    }
  }
  W.rebuildObjHash();
}

/** The house a for-sale sign belongs to. */
export function houseOf(sign: WObj): WObj | undefined {
  return sign.data?.building ? S.W.objs.get(sign.data.building) : undefined;
}

export function buyHouse(sign: WObj): string | null {
  const W = S.W;
  const b = houseOf(sign);
  const price = sign.data?.price ?? 0;
  if (!b || !price) return 'That house is not for sale.';
  if (b.owner === 'player') return 'It is already yours.';
  if (W.money < price) return `You need ${price.toLocaleString()} chits.`;
  const seller = b.owner;
  if (W.rel.hostile('player', seller)) return `The ${FACTION[seller]?.short ?? seller} will not sell to you.`;
  W.money -= price;
  b.owner = 'player';
  delete b.data.forSale;
  for (const o of W.objs.values()) if (o.parent === b.id) o.owner = 'player';
  W.removeObj(sign);
  W.rel.add('player', seller, 2);
  const town = S.T.sites.find((s) => s.id === b.site);
  W.say(`${W.factionName} bought a ${b.data.name?.toLowerCase?.() ?? 'house'} in ${town?.name ?? 'town'} for ${price} chits.`, 'trade', S.clock.t);
  S.fx.notice(`The house is yours.`, 'good');
  S.fx.sound('coin', b.x, b.z);
  emit('objs');
  return null;
}
