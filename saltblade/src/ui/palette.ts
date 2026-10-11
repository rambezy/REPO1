// The colours that carry meaning: who is a friend and who a foe, how hurt
// someone is, good news and bad. Three palettes for colour-blind players swap
// the red/green pairs for ones they can tell apart. Everything that paints
// these colours reads them from here (or from the --c-* variables).

export type Vision = 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia';
export const VISIONS: [Vision, string][] = [['none', 'Off'], ['deuteranopia', 'Deuteranopia'], ['protanopia', 'Protanopia'], ['tritanopia', 'Tritanopia']];

export interface Palette {
  friend: string; // selection ring, your people's cards
  foe: string; // the ring under an enemy
  hover: string;
  move: string; // the marker where you sent people
  attack: string; // the marker on whom you sent them, and the ring under the one being fought
  hp: string; hpMid: string; hpLow: string; blood: string;
  good: string; goodText: string; goodSoft: string;
  bad: string; badText: string; badSoft: string;
  warn: string;
  nameFriend: string; nameFoe: string; nameNeutral: string;
  seen: string; hidden: string;
  mapMe: string; mapDown: string; mapBounty: string;
}

export const PALETTES: Record<Vision, Palette> = {
  none: {
    friend: '#9ce07a', foe: '#e0503a', hover: '#e8e0c8', move: '#a8e08a', attack: '#f07050',
    hp: '#9cc070', hpMid: '#d8b048', hpLow: '#d0583a', blood: '#e03020',
    good: '#7fae5a', goodText: '#9cd070', goodSoft: '#c0e0a8', bad: '#c6523a', badText: '#e8765a', badSoft: '#f0b0a0', warn: '#d8b24a',
    nameFriend: '#d8f0b8', nameFoe: '#f0a088', nameNeutral: '#e8dcc0', seen: '#f0a050', hidden: '#9cd080',
    mapMe: '#5ec23a', mapDown: '#c05a3a', mapBounty: '#b02a1a',
  },
  // red and green look alike: blue for friends and good news, orange for foes and bad, and a dusty rose
  // for the one being fought (it reads as neither the blue nor the orange to these eyes)
  deuteranopia: {
    friend: '#5ab8f5', foe: '#f58a1e', hover: '#e8e0c8', move: '#8ac8f8', attack: '#d7759c',
    hp: '#5ab8f5', hpMid: '#f0e442', hpLow: '#f58a1e', blood: '#e86a10',
    good: '#3d8fd0', goodText: '#6ec0ff', goodSoft: '#b8dcf8', bad: '#d8741a', badText: '#f5a04a', badSoft: '#f8d0a0', warn: '#f0e442',
    nameFriend: '#bfe0ff', nameFoe: '#ffc48a', nameNeutral: '#e8dcc0', seen: '#f58a1e', hidden: '#5ab8f5',
    mapMe: '#2a8ef0', mapDown: '#f58a1e', mapBounty: '#d8600a',
  },
  // as above, with the oranges brighter, since reds and oranges look darker without the red cones
  protanopia: {
    friend: '#5ab8f5', foe: '#ffa02a', hover: '#e8e0c8', move: '#8ac8f8', attack: '#d7757e',
    hp: '#5ab8f5', hpMid: '#f0e442', hpLow: '#ffa02a', blood: '#f08020',
    good: '#3d8fd0', goodText: '#6ec0ff', goodSoft: '#b8dcf8', bad: '#e88a28', badText: '#ffb458', badSoft: '#ffd8a8', warn: '#f0e442',
    nameFriend: '#bfe0ff', nameFoe: '#ffcc90', nameNeutral: '#e8dcc0', seen: '#ffa02a', hidden: '#5ab8f5',
    mapMe: '#2a8ef0', mapDown: '#ffa02a', mapBounty: '#e87a18',
  },
  // blue and yellow look alike: red and green stay, pink stands in for yellow, and violet marks the one being fought
  tritanopia: {
    friend: '#7fe070', foe: '#f0404a', hover: '#e8e0c8', move: '#a0e890', attack: '#9b83fc',
    hp: '#80d060', hpMid: '#f080b8', hpLow: '#f0404a', blood: '#e03020',
    good: '#6cb84c', goodText: '#9ce070', goodSoft: '#c4e8a8', bad: '#d8303a', badText: '#f06a70', badSoft: '#f8b8bc', warn: '#f080b8',
    nameFriend: '#d8f0b8', nameFoe: '#ff9aa0', nameNeutral: '#e8dcc0', seen: '#f080b8', hidden: '#9ce070',
    mapMe: '#40c840', mapDown: '#f0404a', mapBounty: '#d02040',
  },
};

/** The colours in use. Read from this rather than keep a copy; it changes in place. */
export const palette: Palette = { ...PALETTES.none };

const watchers: (() => void)[] = [];
/** Called whenever the palette changes, for things that bake colours into materials. */
export function watchPalette(fn: () => void) {
  watchers.push(fn);
  return () => { const i = watchers.indexOf(fn); if (i >= 0) watchers.splice(i, 1); };
}

/** The --c-* variable name of a palette entry: hpLow is --c-hp-low. */
export const cssVar = (k: keyof Palette) => '--c-' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

export function applyPalette(v: Vision) {
  Object.assign(palette, PALETTES[v] ?? PALETTES.none);
  if (typeof document !== 'undefined') {
    const st = document.documentElement.style;
    for (const k of Object.keys(palette) as (keyof Palette)[]) st.setProperty(cssVar(k), palette[k]);
  }
  for (const fn of watchers) fn();
}

/** A palette colour as a number, for three.js materials. */
export const hex = (c: string) => parseInt(c.slice(1), 16);
