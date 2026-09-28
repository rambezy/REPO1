// The game's colour vocabulary. Earthy, warm, slightly desaturated: soot,
// iron, wheat, linden green and ember.

export const P = {
  ink: '#1b1410',
  inkSoft: '#2b211a',
  shadow: '#0e0a08',

  grass0: '#2f5424', grass1: '#3d6b2c', grass2: '#4b7d33', grass3: '#5a8f3b', grass4: '#6ea247', grass5: '#8fbf5c',
  forest0: '#1f3a1c', forest1: '#2a4a22', forest2: '#35592a', forest3: '#446b32',
  dirt0: '#4a3423', dirt1: '#5e432c', dirt2: '#765637', dirt3: '#8f6b46', dirt4: '#a8845a',
  road0: '#6a5238', road1: '#7e6344', road2: '#937553', road3: '#a98a64', road4: '#c0a47c',
  sand0: '#a38c5e', sand1: '#bca46f', sand2: '#d1bb86', sand3: '#e2cf9d',
  mud0: '#2e2218', mud1: '#3d2e20', mud2: '#4d3a28',
  stone0: '#2f2f36', stone1: '#44444c', stone2: '#5b5b63', stone3: '#75757c', stone4: '#908f94', stone5: '#b0aeb0',
  water0: '#16304f', water1: '#1f4166', water2: '#29557f', water3: '#356b98', water4: '#5b91bd', foam: '#cde4ef',
  wood0: '#3a2416', wood1: '#4f321e', wood2: '#6b4526', wood3: '#8a5c33', wood4: '#a87444', wood5: '#c79461',
  thatch0: '#5c4722', thatch1: '#7a6230', thatch2: '#9c7f3e', thatch3: '#bf9f52', thatch4: '#d8bd72',
  clay0: '#4f1f19', clay1: '#6e2c22', clay2: '#8e3b2b', clay3: '#aa5038', clay4: '#c46a4a',
  plaster0: '#8d8168', plaster1: '#a89b7e', plaster2: '#c4b898', plaster3: '#ddd2b4', plaster4: '#ece4cc',
  timber: '#3b2a1c',
  leaf0: '#1d3519', leaf1: '#28471f', leaf2: '#355d27', leaf3: '#467531', leaf4: '#5c8f3d', leaf5: '#7aab4d',
  linden0: '#253f1c', linden1: '#315426', linden2: '#3f6a2d', linden3: '#528338', linden4: '#6d9e46', linden5: '#90bb5c',
  birch: '#d9d4c4', birchDark: '#3a3530',
  pine0: '#142a1e', pine1: '#1c3a28', pine2: '#264b32', pine3: '#32603e',
  ash0: '#1c1a19', ash1: '#2b2826', ash2: '#3d3935', ash3: '#57514b', ember: '#e0762b', ember2: '#ffb347',
  fire0: '#b83a1a', fire1: '#f07a24', fire2: '#ffc24a', fire3: '#fff3b0',
  blood0: '#5a0d0d', blood1: '#7a1414', blood2: '#a82020',
  metal0: '#34393f', metal1: '#4c535b', metal2: '#6f7882', metal3: '#9aa3ad', metal4: '#c8cfd6', metal5: '#eef2f5',
  gold0: '#6b4a12', gold1: '#9a6e1c', gold2: '#c79a2c', gold3: '#e8c55a', gold4: '#f6e39a',
  wheat0: '#8a6a2a', wheat1: '#b08a3a', wheat2: '#d4b060', wheat3: '#ecd48e',
  bread0: '#6b3e1c', bread1: '#8f5427', bread2: '#b87436', bread3: '#d99a52', bread4: '#efc47e',
  white: '#f4efe4',
  paper: '#e9dfc6',
};

export const SKIN = {
  pale: ['#8a5a44', '#c48a6a', '#e0b08e', '#f2cdb0'],
  fair: ['#7e4e38', '#b57a5a', '#d69e7c', '#ecc09f'],
  tan: ['#6b3f2a', '#9c6645', '#bf8660', '#d9a47c'],
  olive: ['#5c3a22', '#8a5a36', '#ad7a4e', '#c89668'],
  brown: ['#3e2618', '#5f3b24', '#7f5234', '#9c6a46'],
  ruddy: ['#7a4436', '#b06a55', '#d48e76', '#eab099'],
};
export type SkinTone = keyof typeof SKIN;

export const HAIR = {
  black: '#241c18', darkbrown: '#3f2a1c', brown: '#5e3c22', chestnut: '#7a4424', auburn: '#8e3f22',
  red: '#b2542a', ginger: '#c8702f', blond: '#c9a45a', flaxen: '#dcc488', ash: '#8f8676',
  grey: '#9a9794', white: '#dcd9d4', saltpepper: '#6e6a66',
};

export const CLOTH = {
  linen: '#d8cfb5', linenDark: '#b3a88a', undyed: '#a89a7c', brown: '#6b4a30', darkbrown: '#4a3322',
  russet: '#8a4a2e', red: '#8e2f2f', crimson: '#a8323a', madder: '#b4533c', ochre: '#b08a2e', mustard: '#a08a3a',
  green: '#3e6b3a', olive: '#5d6632', forest: '#2d4a2a', blue: '#2f4e7e', woad: '#4a6fa8', sky: '#7896b8',
  grey: '#6e6e6e', charcoal: '#3a3634', black: '#262220', purple: '#5a3470', plum: '#6e3a5a', white: '#e8e2d2',
  teal: '#2f6a66', pink: '#b87a86', orange: '#b8652e',
};
