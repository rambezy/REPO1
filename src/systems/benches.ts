// Workbenches: alchemy, forge/anvil crafting, and sharpening at the grindstone.

import { openAlchemy } from '../ui/minigames/alchemy';
import { forge } from '../ui/minigames/forge';
import { conversation, choose, narrate } from './script';
import { count, removeItem, addItem } from './inventory';
import { S, flag } from '../state';
import { notify } from '../ui/notify';
import { item } from '../content/items';
import { addXp, skill } from './stats';
import { emit } from '../engine/events';
import { sfx } from '../audio/sfx';

interface ForgeRecipe { id: string; label: string; needs: [string, number][]; strikes: number; shape: 'horseshoe' | 'knife' | 'blade' | 'sword'; level: number; result: string; value?: number }

const FORGE_RECIPES: ForgeRecipe[] = [
  { id: 'horseshoe', label: 'Horseshoes (1 iron, 1 charcoal)', needs: [['iron_ingot', 1], ['charcoal', 1]], strikes: 5, shape: 'horseshoe', level: 0, result: 'horseshoes' },
  { id: 'knife', label: 'Hunting knife (1 iron, 1 charcoal)', needs: [['iron_ingot', 1], ['charcoal', 1]], strikes: 7, shape: 'knife', level: 2, result: 'hunting_knife' },
  { id: 'hatchet', label: 'Hatchet (2 iron, 1 charcoal)', needs: [['iron_ingot', 2], ['charcoal', 1]], strikes: 8, shape: 'blade', level: 3, result: 'hatchet' },
  { id: 'sword', label: 'Arming sword (1 steel, 1 iron, 2 charcoal)', needs: [['steel_ingot', 1], ['iron_ingot', 1], ['charcoal', 2]], strikes: 11, shape: 'sword', level: 5, result: 'arming_sword' },
];

export async function openBench(kind: 'alchemy' | 'grindstone' | 'forge' | 'anvil') {
  if (kind === 'alchemy') { openAlchemy(); return; }
  if (kind === 'grindstone') { sharpen(); return; }
  // forge / anvil
  if (flag('forge_script')) { emit('forge:scripted'); return; }
  let pick: ForgeRecipe | null = null;
  await conversation(async () => {
    await narrate('The coals are banked and waiting. What will you make?');
    const opts = FORGE_RECIPES.map((r) => ({
      id: r.id,
      text: r.label,
      locked: r.needs.some(([id, n]) => count(id) < n) || skill('smithing') < r.level,
      tag: skill('smithing') < r.level ? `Smithing ${r.level}` : undefined,
      tagState: 'fail' as const,
    }));
    const c = await choose([...opts, { id: 'none', text: 'Nothing, for now.' }]);
    pick = FORGE_RECIPES.find((r) => r.id === c) || null;
  });
  if (!pick) return;
  const r: ForgeRecipe = pick;
  for (const [id, n] of r.needs) removeItem(id, n);
  const q = await forge({ title: r.label.split(' (')[0], strikes: r.strikes, shape: r.shape });
  if (q <= 0) { notify('You let the iron go cold and give up on it.', 'bad'); return; }
  if (r.result === 'horseshoes') {
    const coins = Math.round(4 + q / 12);
    addItem('horseshoe_sale', 1, { quiet: true });
    notify(`You forge a set of horseshoes (quality ${q}). Any smith or stable will pay about ${coins} groschen.`, 'item');
  } else {
    S.inv.push({ id: r.result, n: 1, q, cond: 100 });
    notify(`You forged a <b>${item(r.result).name}</b> (quality ${q}).`, 'item');
    sfx('quest_done');
  }
  addXp('smithing', 5 + r.level * 2);
  emit('forged', r.result, q);
}

async function sharpen() {
  const wid = S.equip.weapon;
  if (!wid) { notify('You have no blade to sharpen.', 'bad'); return; }
  const s = S.inv.find((x) => x.id === wid);
  if (!s) return;
  const d = item(wid);
  if (d.weapon?.kind !== 'sword' && d.weapon?.kind !== 'axe' && d.weapon?.kind !== 'dagger' && d.weapon?.kind !== 'spear') { notify('That has no edge to sharpen.', 'bad'); return; }
  const q = await forge({ title: 'Sharpening ' + d.name, strikes: 4, shape: 'blade', easy: true, help: 'Pump the treadle (Bellows) to keep the wheel turning, and lay the edge on the stone (Strike) when the mark is on the target.' });
  if (q > 0) {
    s.cond = 100;
    S.flags['sharp:' + wid] = S.minutes + 60 * 24;
    notify(`The edge gleams. <b>${d.name}</b> is sharp.`, 'item');
    addXp('smithing', 3);
  }
}

export { FORGE_RECIPES };
