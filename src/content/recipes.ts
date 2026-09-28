// Alchemy recipes as ordered steps. The bench compares what you did to these.

export type Step =
  | { op: 'base'; liquid: 'water' | 'wine' }
  | { op: 'add'; herb: string; n: number; ground: boolean }
  | { op: 'boil' }
  | { op: 'bottle' };

export interface Recipe { id: string; name: string; result: string; steps: Step[]; level: number; yields?: number }

export const RECIPES: Record<string, Recipe> = {};
const R = (r: Recipe) => { RECIPES[r.id] = r; };

R({ id: 'yarrow_salve', name: 'Yarrow Salve', result: 'yarrow_salve', level: 0, steps: [
  { op: 'base', liquid: 'water' }, { op: 'add', herb: 'yarrow', n: 2, ground: true }, { op: 'boil' }, { op: 'add', herb: 'marigold', n: 1, ground: false }, { op: 'boil' }, { op: 'bottle' }] });
R({ id: 'comfrey_poultice', name: 'Comfrey Poultice', result: 'comfrey_poultice', level: 0, steps: [
  { op: 'base', liquid: 'water' }, { op: 'add', herb: 'comfrey', n: 1, ground: true }, { op: 'add', herb: 'nettle', n: 1, ground: false }, { op: 'boil' }, { op: 'bottle' }] });
R({ id: 'feverwort_remedy', name: 'Feverwort Remedy', result: 'feverwort_remedy', level: 0, steps: [
  { op: 'base', liquid: 'water' }, { op: 'add', herb: 'willow_bark', n: 1, ground: false }, { op: 'boil' }, { op: 'add', herb: 'feverfew', n: 1, ground: true }, { op: 'add', herb: 'angelica', n: 1, ground: true }, { op: 'boil' }, { op: 'bottle' }] });
R({ id: 'valerian_draught', name: 'Valerian Draught', result: 'valerian_draught', level: 1, steps: [
  { op: 'base', liquid: 'wine' }, { op: 'add', herb: 'valerian', n: 1, ground: true }, { op: 'add', herb: 'chamomile', n: 1, ground: false }, { op: 'boil' }, { op: 'bottle' }] });
R({ id: 'wind_tonic', name: 'Wind Tonic', result: 'wind_tonic', level: 1, steps: [
  { op: 'base', liquid: 'water' }, { op: 'add', herb: 'chamomile', n: 2, ground: false }, { op: 'add', herb: 'mint', n: 1, ground: true }, { op: 'boil' }, { op: 'bottle' }] });
R({ id: 'wormwood_tonic', name: 'Wormwood Tonic', result: 'wormwood_tonic', level: 1, steps: [
  { op: 'base', liquid: 'water' }, { op: 'add', herb: 'wormwood', n: 1, ground: true }, { op: 'boil' }, { op: 'boil' }, { op: 'bottle' }] });
R({ id: 'bulls_blood', name: "Bull's Blood", result: 'bulls_blood', level: 2, steps: [
  { op: 'base', liquid: 'wine' }, { op: 'add', herb: 'nettle', n: 1, ground: true }, { op: 'add', herb: 'stjohnswort', n: 1, ground: true }, { op: 'boil' }, { op: 'boil' }, { op: 'bottle' }] });
R({ id: 'owls_eye', name: "Owl's Eye", result: 'owls_eye', level: 2, steps: [
  { op: 'base', liquid: 'wine' }, { op: 'add', herb: 'moonwort', n: 1, ground: false }, { op: 'boil' }, { op: 'boil' }, { op: 'add', herb: 'chamomile', n: 1, ground: false }, { op: 'bottle' }] });
R({ id: 'fox_tongue', name: 'Fox Tongue', result: 'fox_tongue', level: 2, steps: [
  { op: 'base', liquid: 'wine' }, { op: 'add', herb: 'sage', n: 1, ground: true }, { op: 'add', herb: 'mint', n: 1, ground: true }, { op: 'boil' }, { op: 'bottle' }] });
R({ id: 'nightshade', name: 'Nightshade Poison', result: 'nightshade', level: 3, steps: [
  { op: 'base', liquid: 'water' }, { op: 'add', herb: 'belladonna', n: 2, ground: true }, { op: 'boil' }, { op: 'boil' }, { op: 'boil' }, { op: 'bottle' }] });

export function stepText(s: Step): string {
  switch (s.op) {
    case 'base': return `Pour ${s.liquid === 'wine' ? 'wine' : 'water'} into the cauldron.`;
    case 'add': return `Add ${s.n > 1 ? s.n + ' ' : ''}${s.ground ? 'ground ' : ''}${s.herb.replace(/_/g, ' ')}.`;
    case 'boil': return 'Boil (turn the hourglass).';
    case 'bottle': return 'Strain it into a bottle.';
  }
}
