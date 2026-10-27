/**
 * Map contract:
 * 1v1 is the launched arena (honeycomb ring + stairs + spire, tile for tile).
 * More fighters enlarge that same plan. The grid stays even and half-turn
 * symmetric, and landmarks (including Twin Citadel keeps) survive the scale.
 */
import { MAPS, scaledMap } from "../src/maps.js";

let failed = 0;
const ok = (c, m) => {
  if (c) console.log("OK", m);
  else {
    failed++;
    console.log("FAIL", m);
  }
};

function originalActive(x, z) {
  const ring = x <= 1 || x >= 18 || z <= 1 || z >= 18;
  if (ring) return true;
  if (x >= 8 && x <= 11 && z >= 8 && z <= 11) return true;
  const north = x >= 9 && x <= 10 && z >= 2 && z <= 7;
  const south = x >= 9 && x <= 10 && z >= 12 && z <= 17;
  const west = z >= 9 && z <= 10 && x >= 2 && x <= 7;
  const east = z >= 9 && z <= 10 && x >= 12 && x <= 17;
  return north || south || west || east;
}

function originalElev(x, z) {
  if (x >= 8 && x <= 11 && z >= 8 && z <= 11) return 4;
  const north = x >= 9 && x <= 10 && z >= 2 && z <= 7;
  const south = x >= 9 && x <= 10 && z >= 12 && z <= 17;
  const west = z >= 9 && z <= 10 && x >= 2 && x <= 7;
  const east = z >= 9 && z <= 10 && x >= 12 && x <= 17;
  if (north || south || west || east) {
    let d = 0;
    if (north) d = 7 - z;
    else if (south) d = z - 12;
    else if (west) d = 7 - x;
    else d = x - 12;
    if (d <= 0) return 2;
    if (d <= 2) return 1;
    return 0;
  }
  return 0;
}

const chasm = MAPS.find((m) => m.id === "chasm_ring");
const duel = scaledMap(chasm, 2);
ok(duel === chasm, "1v1 honeycomb returns the original map object");
ok(duel.gridSize === 20, "1v1 grid is 20");
ok(duel.p1Spawn[0] === 1 && duel.p1Spawn[1] === 1, "1v1 p1 spawn is the corner");
let maskOk = true;
let elevOk = true;
let tiles = 0;
for (let x = 0; x < 20; x++) {
  for (let z = 0; z < 20; z++) {
    if (!!duel.isTileActive(x, z) !== originalActive(x, z)) maskOk = false;
    if (duel.isTileActive(x, z)) {
      tiles++;
      if (duel.elevationAt(x, z) !== originalElev(x, z)) elevOk = false;
    }
  }
}
ok(maskOk, "1v1 tile mask matches the launched ring + stairs + spire");
ok(elevOk, "1v1 elevations match the launched stairs");
ok(tiles === 208, `1v1 honeycomb has 208 tiles (got ${tiles})`);
ok(duel.decorAt(9, 9)?.type === "crystal" && duel.decorAt(0, 0)?.type === "lamp", "1v1 spire crystal and corner lamp");

function maxStep(map) {
  const g = map.gridSize;
  let worst = 0;
  for (let x = 0; x < g; x++) {
    for (let z = 0; z < g; z++) {
      if (!map.isTileActive(x, z)) continue;
      const e = map.elevationAt(x, z);
      if (x + 1 < g && map.isTileActive(x + 1, z)) worst = Math.max(worst, Math.abs(e - map.elevationAt(x + 1, z)));
      if (z + 1 < g && map.isTileActive(x, z + 1)) worst = Math.max(worst, Math.abs(e - map.elevationAt(x, z + 1)));
    }
  }
  return worst;
}

function components(map) {
  const g = map.gridSize;
  const solid = new Uint8Array(g * g);
  for (let x = 0; x < g; x++) {
    for (let z = 0; z < g; z++) if (map.isTileActive(x, z)) solid[x + z * g] = 1;
  }
  const seen = new Uint8Array(g * g);
  let parts = 0;
  let spawnPart = 0;
  const [sx, sz] = map.p1Spawn;
  for (let k = 0; k < g * g; k++) {
    if (!solid[k] || seen[k]) continue;
    parts++;
    const q = [k];
    seen[k] = 1;
    let hasSpawn = k === sx + sz * g;
    while (q.length) {
      const c = q.pop();
      const x = c % g;
      const z = (c - x) / g;
      const step = (nx, nz) => {
        if (nx < 0 || nz < 0 || nx >= g || nz >= g) return;
        const j = nx + nz * g;
        if (solid[j] && !seen[j]) {
          seen[j] = 1;
          if (j === sx + sz * g) hasSpawn = true;
          q.push(j);
        }
      };
      step(x + 1, z);
      step(x - 1, z);
      step(x, z + 1);
      step(x, z - 1);
    }
    if (hasSpawn) spawnPart = 1;
  }
  return { parts, spawnPart };
}

function decorList(map, type) {
  const g = map.gridSize;
  const out = [];
  for (let x = 0; x < g; x++) {
    for (let z = 0; z < g; z++) {
      const d = map.decorAt(x, z);
      if (d && d.type === type && map.isTileActive(x, z)) out.push([x, z]);
    }
  }
  return out;
}

function checkScaled(base, fighters, prevSize) {
  const map = scaledMap(base, fighters);
  const g = map.gridSize;
  const id = base.id;
  ok(map !== base, `${id} ${fighters}p is a scaled copy`);
  ok(g % 2 === 0 && g > base.gridSize && g <= 40, `${id} ${fighters}p even grid ${g}`);
  ok(!prevSize || g > prevSize, `${id} ${fighters}p grew past ${prevSize} (now ${g})`);

  let sym = true;
  let active = 0;
  const elevs = new Set();
  for (let x = 0; x < g; x++) {
    for (let z = 0; z < g; z++) {
      const ax = g - 1 - x;
      const az = g - 1 - z;
      const on = !!map.isTileActive(x, z);
      if (on !== !!map.isTileActive(ax, az)) sym = false;
      if (on && map.elevationAt(x, z) !== map.elevationAt(ax, az)) sym = false;
      const d1 = map.decorAt(x, z);
      const d2 = map.decorAt(ax, az);
      if ((d1 && d1.type) !== (d2 && d2.type)) sym = false;
      if (on) {
        active++;
        elevs.add(map.elevationAt(x, z));
      }
    }
  }
  ok(sym, `${id} ${fighters}p is half-turn symmetric (tiles, height, props)`);

  const baseActive = (() => {
    let n = 0;
    for (let x = 0; x < base.gridSize; x++) {
      for (let z = 0; z < base.gridSize; z++) if (base.isTileActive(x, z)) n++;
    }
    return n;
  })();
  const density = active / (g * g);
  const baseDensity = baseActive / (base.gridSize * base.gridSize);
  ok(Math.abs(density - baseDensity) < 0.08, `${id} ${fighters}p density ${density.toFixed(3)} stays near ${baseDensity.toFixed(3)}`);

  ok(maxStep(map) <= maxStep(base), `${id} ${fighters}p step ${maxStep(map)} <= base ${maxStep(base)}`);
  const conn = components(map);
  const baseConn = components(base);
  ok(
    conn.parts === baseConn.parts && conn.spawnPart === 1,
    `${id} ${fighters}p keeps ${baseConn.parts} walkable pieces (got ${conn.parts})`
  );

  const [sx, sz] = map.p1Spawn;
  ok(map.isTileActive(sx, sz), `${id} ${fighters}p p1 spawn is on a tile`);
  ok(
    map.p2Spawn[0] === g - 1 - sx && map.p2Spawn[1] === g - 1 - sz,
    `${id} ${fighters}p spawns are a half-turn pair`
  );
  ok(map.theme.edge === base.theme.edge, `${id} ${fighters}p keeps its theme`);
  ok((map.props || [])[0]?.type === (base.props || [])[0]?.type, `${id} ${fighters}p keeps its prop`);

  if (id === "classic") {
    ok(active === g * g, `${id} ${fighters}p stays a solid arena (no shelf holes)`);
    ok(elevs.has(3), `${id} ${fighters}p still has the corner/spire height`);
  }
  if (id === "chasm_ring") {
    let voidNearCorner = false;
    const lim = Math.floor(g * 0.35);
    for (let x = 0; x < lim && !voidNearCorner; x++) {
      for (let z = 0; z < lim; z++) if (!map.isTileActive(x, z)) voidNearCorner = true;
    }
    ok(map.isTileActive(0, 0) && voidNearCorner, `${id} ${fighters}p keeps the border ring and the chasm`);
    ok(elevs.has(4) && elevs.has(2) && elevs.has(1) && elevs.has(0), `${id} ${fighters}p keeps stair heights ${[...elevs].sort()}`);
    const mid = (g - 1) / 2;
    let far = 0;
    let spire = 0;
    for (let x = 0; x < g; x++) {
      for (let z = 0; z < g; z++) {
        if (!map.isTileActive(x, z) || map.elevationAt(x, z) !== 4) continue;
        spire++;
        far = Math.max(far, Math.hypot(x - mid, z - mid));
      }
    }
    ok(spire > 0 && far < g * 0.28, `${id} ${fighters}p spire stays central (radius ${far.toFixed(1)})`);
  }
  if (id === "twin_citadels") {
    const cites = decorList(map, "citadel");
    ok(cites.length === 4, `${id} ${fighters}p has 4 citadel buildings (got ${cites.length})`);
    const paired = cites.every(([x, z]) => cites.some(([a, b]) => a === g - 1 - x && b === g - 1 - z));
    ok(paired, `${id} ${fighters}p citadels come in half-turn pairs`);
    let gap = false;
    const c = Math.floor(g / 2);
    if (!map.isTileActive(c, c) && !map.isTileActive(c - 1, c)) gap = true;
    ok(gap, `${id} ${fighters}p keeps the void between the bridges`);
  }
  if (id === "archipelago") {
    ok(map.isTileActive(0, 0) && !map.isTileActive(Math.floor(g * 0.5), 0), `${id} ${fighters}p keeps islets and the gaps`);
    const palms = decorList(map, "palm");
    ok(palms.length >= 4, `${id} ${fighters}p keeps the palms (${palms.length})`);
  }
  return g;
}

for (const id of ["classic", "archipelago", "twin_citadels", "chasm_ring"]) {
  const base = MAPS.find((m) => m.id === id);
  ok(scaledMap(base, 2) === base, `${id} 1v1 is the original object`);
  const g5 = checkScaled(base, 5, base.gridSize);
  checkScaled(base, 10, g5);
}

const twin = MAPS.find((m) => m.id === "twin_citadels");
const twinKeeps = decorList(twin, "citadel");
ok(twinKeeps.length === 4, `1v1 twin citadel has 4 keeps (got ${twinKeeps.length})`);
ok(
  twin.decorAt(3, 4)?.type === "citadel" &&
    twin.decorAt(16, 15)?.type === "citadel" &&
    twin.decorAt(3, 15)?.type === "citadel" &&
    twin.decorAt(16, 4)?.type === "citadel",
  "1v1 keeps sit on all four towers"
);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall map checks passed");
