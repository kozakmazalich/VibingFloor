import { COLORS } from "./constants.js";

/**
 * VIBER RACE layouts — three completely separate tracks.
 *
 * Each layout is pure data consumed by RaceCourse (src/raceCourse.js):
 *   halfWidth / finishS / finishX   track size + finish trigger
 *   staticPlatforms                 [x0, x1, s0, s1, topY, colour]
 *   props                           movers / obstacles (slider, piston, lift, spinner)
 *   checkpoints                     [s, ...] (index 0 = start line)
 *   batteries                       [x, s, y]  (y=null sits on the floor)
 *   nav                             bot route (named branches or a flat `route`)
 *   decideS                         branch distances (only CYBER uses branches)
 *   signs / startGate / finishGate / ring / accentAt / scenery
 *
 * Distances are measured as `s` = -z.
 */

const AC = {
  cyan: COLORS.accentCyan,
  magenta: COLORS.accentMagenta,
  gold: 0xffd700,
  violet: 0xa855f7,
  green: 0x39ff14,
  orange: COLORS.tileWarning,
  red: 0xff3b30,
};

// ---------------------------------------------------------------------------
// MAP 1 — CYBER SPRINT (medium, the original course, unchanged)
// ---------------------------------------------------------------------------
const HW = 5;

const CYBER_PROPS = [
  // Sliders over the void
  { type: "slider", x: 0, y: 0, z: -82.5, w: 3.6, d: 3, axis: "x", amp: 3, speed: 0.9, phase: 0, color: AC.gold },
  { type: "slider", x: 0, y: 0, z: -87.5, w: 3.6, d: 3, axis: "x", amp: 3, speed: 1.1, phase: 2.1, color: AC.gold },
  { type: "slider", x: 0, y: 0, z: -92.5, w: 3.6, d: 3, axis: "x", amp: 3, speed: 0.8, phase: 4.2, color: AC.gold },
  // Piston field
  ...[111.85, 115.35, 118.85, 122.35].flatMap((s, row) =>
    [-3.35, 0, 3.35].map((x, col) => ({
      type: "piston",
      x,
      z: -s,
      w: 3.2,
      d: 3.3,
      yMin: 0,
      yMax: 1.6,
      speed: 1.5,
      phase: row * 1.25 + col * 0.85,
      color: AC.violet,
      margin: 0.25,
    }))
  ),
  // Detour lift
  { type: "lift", x: 8.8, z: -150.5, w: 2.4, d: 2.4, yMin: 0, yMax: 1.6, speed: 1.1, phase: 0, color: AC.violet, margin: 0.22 },
  // Sweepers
  { type: "spinner", x: 0, y: 0, z: -55, radius: 4.6, speed: 1.5, phase: 0, color: AC.magenta },
  { type: "spinner", x: 0, y: 0, z: -65, radius: 4.6, speed: -1.9, phase: 1.2, color: AC.magenta },
  { type: "spinner", x: 0, y: 0, z: -181, radius: 4.6, speed: 2.1, phase: 0.4, color: AC.orange },
  { type: "spinner", x: 0, y: 0, z: -192, radius: 4.6, speed: -2.5, phase: 2.0, color: AC.orange },
];

export const CYBER_LAYOUT = {
  halfWidth: HW,
  finishS: 212,
  finishX: [-5.4, 9.4],
  staticPlatforms: [
    [-HW, HW, -8, 20, 0, AC.cyan], // start pad
    [-HW, HW, 22.5, 32, 0, AC.cyan],
    [-4, -2, 34.5, 36.5, 0, AC.cyan], // stepping stones
    [-1, 1, 34.5, 36.5, 0, AC.cyan],
    [2, 4, 34.5, 36.5, 0, AC.cyan],
    [-HW, HW, 39, 72, 0, AC.magenta], // CP1 + sweeper gauntlet
    [-HW, HW, 74, 80, 0, AC.gold], // CP2 ledge
    [-HW, HW, 96, 110, 0, AC.gold], // CP3 landing
    [-HW, HW, 124, 146.5, 0, AC.green], // CP4 + battery stash (then a 7.5u jetpack gap)
    [5, 10, 140, 142.5, 0, AC.violet], // detour: connector out
    [7.6, 10, 142.5, 149, 0, AC.violet], // detour: low bridge
    [7.6, 10, 152, 163, 1.6, AC.violet], // detour: high bridge
    [5, 7.6, 160.5, 163, 1.6, AC.violet], // detour: connector back (drops to landing)
    [-HW, HW, 154, 172, 0, AC.orange], // big-gap landing + CP5
    [-HW, HW, 174, 200, 0, AC.orange], // final sweepers
    [5.6, 8.6, 168, 200, 3.0, AC.green], // SKYWAY (jetpack only)
    [-HW, 9, 200, 218, 0, AC.cyan], // finish plaza
  ],
  props: CYBER_PROPS,
  checkpoints: [0, 46, 77, 101, 130, 166],
  batteries: [
    [-2.5, 12, null],
    [2.5, 12, null],
    [0, 21.2, 1.5],
    [-3, 35.5, null],
    [3, 35.5, null],
    [3.6, 60, null],
    [-3.6, 60, null],
    [3, 78, null],
    [-3, 78, null],
    [0, 104, null],
    [-2.5, 136, null],
    [0, 138.5, null],
    [2.5, 136, null],
    [0, 150, 3.8], // mid-gap refuel, sits in the jetpack flight arc
    [3.9, 168.5, null],
    [3.9, 170.5, null],
    [-4, 186.5, null],
    [4, 186.5, null],
    [7.1, 184, null],
  ],
  nav: {
    A: [
      { x: 0, s: 19.6, w: 3.4 },
      { x: 0, s: 31.6, w: 3.4 },
      { stones: [-3, 0, 3], s: 35.5 },
      { x: 0, s: 41, w: 3.4 },
      { x: 0, s: 71.6, w: 3.2 },
      { x: 0, s: 79.6, w: 3 },
      { slider: 0, s: 82.6 },
      { slider: 1, s: 87.6 },
      { slider: 2, s: 92.6 },
      { x: 0, s: 101, w: 3.4 },
      { x: 0, s: 112, w: 3.35 },
      { x: 0, s: 122.4, w: 3.35 },
      { x: 0, s: 126, w: 3 },
      { x: 0, s: 139.4, w: 3, decide: 1 },
    ],
    GAP_MAIN: [
      { x: 8.8, s: 141.3, reach: true },
      { x: 8.8, s: 148.6, w: 0.3 },
      { x: 8.8, s: 151.4, w: 0 },
      { x: 8.8, s: 158, w: 0.4 },
      { x: 6.3, s: 161.8, reach: true },
      { x: 2.5, s: 162, reach: true },
    ],
    GAP_JET: [
      { x: 0, s: 146.2, w: 2.4, jet: true, need: 2 },
      { x: 0, s: 157, w: 2.4, jet: true, need: 2 },
    ],
    B: [{ x: 0, s: 166.4, w: 3, decide: 2 }],
    SKY_MAIN: [
      { x: 0, s: 171.6, w: 3.4 },
      { x: 0, s: 199, w: 3.2 },
    ],
    SKY_JET: [
      { x: 4.4, s: 169.4, reach: true },
      { x: 7.1, s: 170.2, reach: true, jet: true, climb: 3, need: 1 },
      { x: 7.1, s: 199.4, w: 0.5 },
      { x: 3.5, s: 203, w: 1.5 },
    ],
    END: [
      { x: 0, s: 213.5, w: 3.4 },
      { x: 0, s: 215.8, w: 3 },
    ],
  },
  decideS: { 1: 139.4, 2: 166.4 },
  signs: [
    { text: "\u26a0 SWEEPERS \u2014 JUMP!", x: 0, y: 2.7, s: 49, color: AC.magenta, width: 5.5 },
    { text: "RIDE THE SLIDERS", x: 0, y: 2.6, s: 79, color: AC.gold, width: 5 },
    { text: "\u26a1 JETPACK SHORTCUT \u2014 JUMP + Q", x: 0, y: 3.4, s: 146.5, color: AC.green, width: 7 },
    { text: "DETOUR \u2192", x: 7.5, y: 2.4, s: 139.6, color: AC.violet, width: 3.2 },
    { text: "\u26a1 SKYWAY \u2014 JETPACK ONLY", x: 7.1, y: 5.0, s: 167.4, color: AC.green, width: 4.6 },
  ],
  startGate: { s: 3, x0: -HW, x1: HW, label: "VIBER RACE \u00b7 START", color: AC.cyan },
  finishGate: { x0: -HW, x1: 9, color: 0xffffff },
  ring: { x: 2, y: 4, sOffset: 4, color: AC.cyan, color2: AC.magenta },
  accentAt: (s) => {
    if (s < 39) return AC.cyan;
    if (s < 73) return AC.magenta;
    if (s < 110) return AC.gold;
    if (s < 124) return AC.violet;
    if (s < 173) return AC.green;
    if (s < 200) return AC.orange;
    return AC.cyan;
  },
  scenery: { pylonLeft: -7.4, pylonRight: 12.6, pylonStartS: -6, pylonEndS: 220, pylonStep: 9, towerCount: 70, towerSpread: [24, 50], towerS: [-20, 240] },
};

// ---------------------------------------------------------------------------
// MAP 2 — METEOR ISLANDS (large ~235, fragmented floating islands)
// ---------------------------------------------------------------------------
const ISLAND_HALF = 7;
const ISLAND_CENTERS = [0, -1.5, 1.5, -2, 2, -1, 1, -2, 0, 2, -2, 1.5, -1.5, 0, 2, -2];
const ISLAND_DEPTH = 10;
const ISLAND_GAP = 2.7;
const ISLAND_W = 6.5;

const islands = [];
const islandBatteries = [];
const islandNav = [];
islands.push([-6, 6, -8, 12, 0, AC.orange]); // start pad
let isS = 14;
for (let i = 0; i < ISLAND_CENTERS.length; i++) {
  const cx = ISLAND_CENTERS[i];
  const color = i % 2 ? AC.red : AC.orange;
  islands.push([cx - ISLAND_W / 2, cx + ISLAND_W / 2, isS, isS + ISLAND_DEPTH, 0, color]);
  islandNav.push({ x: cx, s: isS + ISLAND_DEPTH / 2, w: 1.8 });
  if (i % 3 === 0) islandBatteries.push([cx, isS + ISLAND_DEPTH / 2, null]);
  isS += ISLAND_DEPTH + ISLAND_GAP;
}
const ISLANDS_PLAZA_S = isS;
islands.push([-ISLAND_HALF, ISLAND_HALF, ISLANDS_PLAZA_S, ISLANDS_PLAZA_S + 26, 0, AC.orange]);
const ISLANDS_FINISH = ISLANDS_PLAZA_S + 18;
islandNav.push({ x: 0, s: ISLANDS_PLAZA_S + 2, w: 3 });
islandNav.push({ x: 0, s: ISLANDS_FINISH + 1, w: 3 });

export const ISLANDS_LAYOUT = {
  halfWidth: ISLAND_HALF,
  checkpointHalf: 3.2,
  finishS: ISLANDS_FINISH,
  finishX: [-ISLAND_HALF, ISLAND_HALF],
  staticPlatforms: islands,
  props: [],
  checkpoints: [0, 44, 95, 133, 171],
  batteries: islandBatteries,
  nav: { route: islandNav },
  decideS: null,
  signs: [
    { text: "METEOR ISLANDS \u2014 JUMP!", x: 0, y: 2.8, s: 8, color: AC.orange, width: 6.5 },
    { text: "\u2624 DODGE THE SKY", x: 0, y: 2.8, s: 100, color: AC.red, width: 5.5 },
    { text: "\u2624 WATCH THE SHADOW", x: 0, y: 2.8, s: 160, color: AC.orange, width: 6 },
  ],
  startGate: { s: 3, x0: -6, x1: 6, label: "METEOR ISLANDS \u00b7 START", color: AC.orange },
  finishGate: { x0: -ISLAND_HALF, x1: ISLAND_HALF, color: 0xffffff },
  ring: { x: 0, y: 4, sOffset: 4, color: AC.orange, color2: AC.red },
  accentAt: (s) => {
    if (s < 60) return AC.orange;
    if (s < 130) return AC.red;
    if (s < 190) return AC.orange;
    return AC.gold;
  },
  scenery: { pylonLeft: -9.5, pylonRight: 9.5, pylonStartS: -6, pylonEndS: 245, pylonStep: 9, towerCount: 80, towerSpread: [24, 50], towerS: [-20, 280] },
};

// ---------------------------------------------------------------------------
// MAP 3 — RED LIGHT GREEN LIGHT (short ~100, wide straight corridor)
// ---------------------------------------------------------------------------
const CORRIDOR_HALF = 14;

export const CORRIDOR_LAYOUT = {
  halfWidth: CORRIDOR_HALF,
  finishS: 100,
  finishX: [-CORRIDOR_HALF, CORRIDOR_HALF],
  bossX: 0,
  staticPlatforms: [[-CORRIDOR_HALF, CORRIDOR_HALF, -8, 108, 0, AC.magenta]],
  props: [],
  checkpoints: [0, 50],
  batteries: [
    [-8, 26, null],
    [8, 26, null],
    [0, 50, null],
    [-8, 74, null],
    [8, 74, null],
  ],
  nav: {
    route: [
      { x: 0, s: 20, w: 6 },
      { x: 0, s: 50, w: 6 },
      { x: 0, s: 80, w: 6 },
      { x: 0, s: 102, w: 6 },
    ],
  },
  decideS: null,
  signs: [
    { text: "FREEZE ON RED", x: 0, y: 4.6, s: 10, color: AC.green, width: 9 },
    { text: "RED LIGHT = STOP", x: 0, y: 4.6, s: 55, color: AC.green, width: 9 },
  ],
  startGate: { s: 3, x0: -CORRIDOR_HALF, x1: CORRIDOR_HALF, label: "RED LIGHT GREEN LIGHT", color: AC.magenta },
  finishGate: { x0: -CORRIDOR_HALF, x1: CORRIDOR_HALF, color: AC.green },
  ring: { x: 0, y: 4, sOffset: 4, color: AC.green, color2: AC.cyan },
  accentAt: (s) => (s < 50 ? AC.magenta : AC.cyan),
  scenery: { pylonLeft: -18, pylonRight: 18, pylonStartS: -6, pylonEndS: 110, pylonStep: 10, towerCount: 40, towerSpread: [26, 50], towerS: [-20, 130] },
};
