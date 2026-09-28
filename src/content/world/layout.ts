// Coordinates of everything on the overworld (in tiles). Every other world
// module reads from here so the geography stays consistent.

export const OW = { w: 240, h: 180 };

export const LOC = {
  hollowbrook: { x: 40, y: 100 },
  home: { x: 45, y: 93 }, // family house footprint top-left
  forge: { x: 51, y: 97 },
  green: { x: 38, y: 101 },
  mill: { x: 16, y: 80 },
  linden: { x0: 92, y0: 46, x1: 132, y1: 88 }, // town walls
  lindenKeep: { x: 107, y: 50 },
  crossroads: { x: 119, y: 128 },
  camp: { x: 122, y: 131 },
  silverdale: { x: 40, y: 26 },
  mine: { x: 42, y: 13 },
  priory: { x0: 180, y0: 92, x1: 204, y1: 114 },
  wenda: { x: 60, y: 148 },
  burners: { x: 96, y: 160 },
  bandits: { x: 26, y: 162 },
  lodge: { x: 136, y: 150 },
  chapelRuin: { x: 20, y: 54 },
  crowStone: { x: 72, y: 62 },
  warcamp: { x0: 158, y0: 38, x1: 178, y1: 56 },
  ravenstone: { x0: 182, y0: 10, x1: 206, y1: 32 },
  angelicaGrove: { x: 78, y: 138 },
  wolfDen: { x: 150, y: 164 },
};

/** River Linden, north to south. */
export const RIVER: [number, number][] = [[150, -2], [148, 20], [151, 40], [153, 60], [151, 80], [149, 100], [152, 120], [150, 140], [155, 160], [158, 182]];
/** The Hollow Brook, from the western hills, through the mill and the village, into the river. */
export const BROOK: [number, number][] = [[10, 40], [16, 60], [21, 78], [26, 90], [29, 100], [31, 108], [40, 119], [70, 128], [100, 138], [128, 146], [149, 150]];

export const ROADS: [number, number][][] = [
  // Hollowbrook -> Linden Hill south gate
  [[33, 102], [48, 102], [62, 99], [76, 94], [90, 90], [110, 89]],
  // Linden Hill north gate -> Silverdale
  [[110, 45], [104, 40], [84, 36], [62, 30], [44, 29]],
  // Linden Hill north gate -> Ravenstone
  [[110, 45], [124, 40], [140, 36], [160, 34], [178, 30], [192, 31]],
  // war camp spur
  [[156, 35], [164, 42]],
  // Linden Hill east gate -> Priory
  [[132, 68], [142, 76], [152, 88], [166, 98], [180, 102]],
  // Linden Hill south gate -> crossroads -> forest
  [[110, 89], [114, 104], [118, 118], [119, 128], [118, 140], [124, 150], [134, 152]],
  // crossroads -> Hollowbrook (southern way)
  [[119, 128], [100, 124], [80, 118], [62, 111], [56, 104]],
  // Hollowbrook -> mill (crosses the brook once, then up the west bank)
  [[34, 96], [22, 96], [20, 86]],
  // lane to Vojta across the footbridge
  [[33, 102], [22, 102]],
  // Hollowbrook -> chapel ruin & the Crow's Stone (old pass road)
  [[41, 97], [42, 88], [46, 78], [58, 68], [72, 62], [84, 56], [100, 48], [110, 45]],
  [[46, 78], [34, 64], [22, 56]],
  // forest tracks
  [[80, 118], [74, 132], [64, 144], [60, 148]],
  [[118, 140], [106, 150], [98, 158]],
  [[64, 144], [44, 152], [30, 160]],
];
