/**
 * Map configurations for Vibing Floor
 * Big 20x20 neon arenas with raised platforms, themed decorations and
 * per-map color palettes. Tiles still shrink and fall like the classic mode.
 */

// Deterministic pseudo-random hash per tile
function hash2(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export const MAPS = [
  {
    id: "classic",
    name: "CYBER ARENA",
    tagline: "Vast 20x20 platform with jumpable corner towers and a central spire.",
    difficulty: "BALANCED",
    badgeColor: "cyan",
    gridSize: 20,
    p1Spawn: [2, 2],
    p2Spawn: [17, 17],
    theme: { edge: 0x00e5ff, underglow: 0x00e5ff, top: 0x1a2038, core: 0x00e5ff },
    // Floating energy plate that rides up and down above the central spire
    props: [{ type: "elevator", x: 0, z: 0, yMin: 3.3, yMax: 5.4, speed: 0.9, color: 0x00e5ff }],
    isTileActive: () => true,
    elevationAt(x, z) {
      const spire = x >= 9 && x <= 10 && z >= 9 && z <= 10;
      if (spire) return 3;
      const corner = (x <= 1 || x >= 18) && (z <= 1 || z >= 18);
      if (corner) return 3;
      const cornerStep =
        ((x === 2 || x === 17) && (z <= 1 || z >= 18)) ||
        ((z === 2 || z === 17) && (x <= 1 || x >= 18));
      if (cornerStep) return 1;
      const center = x >= 8 && x <= 11 && z >= 8 && z <= 11;
      if (center) return 1;
      const nearSpawn = (x <= 3 && z <= 3) || (x >= 16 && z >= 16);
      if (!nearSpawn && hash2(x, z) < 0.025) return 1; // scattered low blocks
      return 0;
    },
    decorAt(x, z) {
      if ((x === 0 || x === 19) && (z === 0 || z === 19)) return { type: "lamp", color: 0x00e5ff };
      if (x === 9 && z === 10) return { type: "crystal", color: 0x00e5ff };
      if (x === 10 && z === 9) return { type: "crystal", color: 0x00e5ff };
      if (x === 8 && z === 8) return { type: "antenna", color: 0x00e5ff };
      const h = hash2(x, z);
      if (h < 0.012) return { type: "crystal", color: 0x00e5ff };
      if (h < 0.026) return { type: "lamp", color: 0x00e5ff };
      if (h < 0.042) return { type: "rock" };
      return null;
    },
  },
  {
    id: "archipelago",
    name: "ISLAND ARCHIPELAGO",
    tagline: "Glowing palms on four islets ring a raised jungle core. Leap the gaps!",
    difficulty: "TACTICAL",
    badgeColor: "magenta",
    gridSize: 20,
    p1Spawn: [1, 1],
    p2Spawn: [18, 18],
    theme: { edge: 0x2bff9e, underglow: 0x2bff9e, top: 0x14241d, core: 0x2bff9e },
    isTileActive(x, z) {
      const island = x >= 5 && x <= 14 && z >= 5 && z <= 14; // 10x10 center
      if (island) return true;
      const nw = x <= 3 && z <= 3;
      const ne = x >= 16 && z <= 3;
      const sw = x <= 3 && z >= 16;
      const se = x >= 16 && z >= 16;
      if (nw || ne || sw || se) return true;
      // Walkable bridge corridors from each islet to the island (2 tiles wide)
      if ((z === 3 || z === 4) && x >= 4 && x <= 8) return true; // north bridge
      if ((z === 15 || z === 16) && x >= 11 && x <= 15) return true; // south bridge
      if ((x === 3 || x === 4) && z >= 4 && z <= 8) return true; // west bridge
      if ((x === 15 || x === 16) && z >= 11 && z <= 15) return true; // east bridge
      return false;
    },
    elevationAt(x, z) {
      const core = x >= 8 && x <= 11 && z >= 8 && z <= 11;
      if (core) return 3;
      const island = x >= 5 && x <= 14 && z >= 5 && z <= 14;
      if (island) return 1;
      return 0;
    },
    decorAt(x, z) {
      if (x === 1 && z === 1) return { type: "palm", color: 0x35ffa8 };
      if (x === 1 && z === 18) return { type: "palm", color: 0x35ffa8 };
      if (x === 18 && z === 1) return { type: "palm", color: 0x35ffa8 };
      if (x === 18 && z === 18) return { type: "palm", color: 0x35ffa8 };
      if (x === 9 && z === 9) return { type: "crystal", color: 0x2bff9e };
      if (x === 10 && z === 10) return { type: "crystal", color: 0x2bff9e };
      const h = hash2(x, z);
      if (h < 0.02) return { type: "palm", color: 0x35ffa8 };
      if (h < 0.04) return { type: "fern", color: 0x35ffa8 };
      if (h < 0.055) return { type: "rock" };
      return null;
    },
  },
  {
    id: "twin_citadels",
    name: "TWIN CITADELS",
    tagline: "Two fortified towers joined by elevated bridges across the void.",
    difficulty: "ADVANCED",
    badgeColor: "warning",
    gridSize: 20,
    p1Spawn: [2, 2],
    p2Spawn: [17, 17],
    theme: { edge: 0xffb020, underglow: 0xff2d95, top: 0x241a0e, core: 0xffb020 },
    isTileActive(x, z) {
      const west = x >= 1 && x <= 7 && z >= 2 && z <= 17;
      const east = x >= 12 && x <= 18 && z >= 2 && z <= 17;
      if (west || east) return true;
      const bridgeA = x >= 8 && x <= 11 && z >= 5 && z <= 7; // upper bridge
      const bridgeB = x >= 8 && x <= 11 && z >= 12 && z <= 14; // lower bridge
      return bridgeA || bridgeB;
    },
    elevationAt(x, z) {
      const tower =
        (x >= 2 && x <= 4) || (x >= 15 && x <= 17)
          ? (z >= 3 && z <= 5) || (z >= 14 && z <= 16)
          : false;
      if (tower) return 2;
      const bridge = x >= 8 && x <= 11 && ((z >= 5 && z <= 7) || (z >= 12 && z <= 14));
      if (bridge) return 1;
      return 0;
    },
    decorAt(x, z) {
      // A keep on every tower. The four footprints already exist; only two of
      // them used to carry a building, so the empty pair read as bare pads.
      // (3,4)<->(16,15) and (3,15)<->(16,4) are half-turn pairs.
      if (
        (x === 3 && z === 4) || (x === 16 && z === 15) ||
        (x === 3 && z === 15) || (x === 16 && z === 4)
      ) {
        return { type: "citadel", color: 0xffb020 };
      }
      if (
        (x === 2 && z === 4) || (x === 2 && z === 15) ||
        (x === 17 && z === 4) || (x === 17 && z === 15)
      ) {
        return { type: "crystal", color: 0xff2d95 };
      }
      if ((x === 4 && z === 9) || (x === 15 && z === 9)) {
        return { type: "antenna", color: 0xffb020 };
      }
      if ((x === 9 || x === 10) && (z === 6 || z === 13)) {
        return { type: "lamp", color: 0xffb020 };
      }
      const h = hash2(x, z);
      if (h < 0.02) return { type: "crystal", color: 0xff2d95 };
      if (h < 0.035) return { type: "lamp", color: 0xffb020 };
      if (h < 0.05) return { type: "rock" };
      return null;
    },
  },
  {
    id: "chasm_ring",
    name: "HONEYCOMB CHASM",
    tagline: "A hollow ring around a floating violet spire, reached by stair paths.",
    difficulty: "HARDCORE",
    badgeColor: "cyan",
    gridSize: 20,
    p1Spawn: [1, 1],
    p2Spawn: [18, 18],
    theme: { edge: 0xb46bff, underglow: 0xb46bff, top: 0x1c1428, core: 0xb46bff },
    // Glowing sphere floating above the central spire
    props: [{ type: "orb", x: 0, z: 0, yBase: 5.4, bobAmp: 0.55, color: 0xb46bff }],
    isTileActive(x, z) {
      const ring = x <= 1 || x >= 18 || z <= 1 || z >= 18;
      if (ring) return true;
      const spire = x >= 8 && x <= 11 && z >= 8 && z <= 11;
      if (spire) return true;
      const north = x >= 9 && x <= 10 && z >= 2 && z <= 7;
      const south = x >= 9 && x <= 10 && z >= 12 && z <= 17;
      const west = z >= 9 && z <= 10 && x >= 2 && x <= 7;
      const east = z >= 9 && z <= 10 && x >= 12 && x <= 17;
      return north || south || west || east;
    },
    elevationAt(x, z) {
      const spire = x >= 8 && x <= 11 && z >= 8 && z <= 11;
      if (spire) return 4;
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
        if (d <= 0) return 2; // adjacent to spire
        if (d <= 2) return 1; // mid stair
        return 0; // walkable from the ring
      }
      return 0;
    },
    decorAt(x, z) {
      if ((x === 9 && z === 9) || (x === 10 && z === 10)) {
        return { type: "crystal", color: 0xb46bff };
      }
      if ((x === 0 || x === 19) && (z === 0 || z === 19)) {
        return { type: "lamp", color: 0xb46bff };
      }
      const h = hash2(x, z);
      if (h < 0.025) return { type: "crystal", color: 0xb46bff };
      if (h < 0.045) return { type: "lamp", color: 0xb46bff };
      return null;
    },
  },
];

/**
 * Arena for a fighter count.
 * 2 fighters returns the base map unchanged (the launched 1v1).
 * More fighters enlarge that same plan: even grid, half-turn symmetric,
 * landmarks (citadels, crystals, lamps) replayed from the original cells.
 */
export function scaledMap(mapDef, fighters) {
  const n = Math.max(2, fighters | 0);
  if (n <= 2) return mapDef;
  return scaleSymmetric(mapDef, n);
}

// Even size so the centre stays between tiles (every base map is 20x20).
// ~sqrt growth: 5 fighters → 28, 10 fighters → 34, never past 40.
function scaledSize(base, fighters) {
  const factor = Math.sqrt(1 + 0.2 * (fighters - 1));
  let size = Math.round(base * factor);
  if (size % 2 !== 0) size += 1;
  if (size < base) size = base + (base % 2 === 0 ? 0 : 1);
  if (size > 40) size = 40;
  if (size % 2 !== 0) size -= 1;
  return size;
}

/**
 * Magnify `mapDef` onto a bigger even grid without changing the floor plan.
 * The lower half of each axis is a uniform scale of the base's lower half;
 * the upper half is its half-turn, so project(size-1-v) = base-1-project(v).
 * Activity and height take both sides, which mirrors the 1v1 hash scatter.
 * Each original landmark is placed once, on the big cell nearest the centre
 * of the cells that magnify that base cell (and on the opposite side).
 */
function scaleSymmetric(mapDef, fighters) {
  const base = mapDef.gridSize || 20;
  const size = scaledSize(base, fighters);
  const half = size >> 1;

  const isBaseActive = mapDef.isTileActive || (() => true);
  const baseElev = mapDef.elevationAt || (() => 0);
  const baseDecor = mapDef.decorAt || (() => null);

  // Equal slices of the lower half, then a mirror. Every base index gets
  // either floor or ceil cells, so a 2-tile ring stays a 2-tile ring.
  const buckets = base >> 1;
  const proj = new Int16Array(size);
  let cursor = 0;
  for (let i = 0; i < buckets; i++) {
    const end = Math.round(((i + 1) * half) / buckets);
    for (let v = cursor; v < end; v++) {
      proj[v] = i;
      proj[size - 1 - v] = base - 1 - i;
    }
    cursor = end;
  }

  // Centre of the band of big cells that magnify base index `c`.
  const inv = (c) => {
    const partner = base - 1 - c;
    if (c > partner) return size - 1 - inv(partner);
    let sum = 0;
    let n = 0;
    for (let v = 0; v < half; v++) {
      if (proj[v] !== c) continue;
      sum += v;
      n++;
    }
    const ideal = n ? sum / n : 0;
    let best = 0;
    let bestD = Infinity;
    for (let v = 0; v < half; v++) {
      if (proj[v] !== c) continue;
      const d = Math.abs(v - ideal);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  };

  const p1 = mapDef.p1Spawn || [1, 1];
  const p2 = mapDef.p2Spawn || [base - 2, base - 2];

  // Representative big cell per base cell. Canonical half is chosen first;
  // the opposite cell is forced to its half-turn so props stay symmetric.
  const sumX = new Float64Array(base * base);
  const sumZ = new Float64Array(base * base);
  const count = new Int16Array(base * base);
  for (let x = 0; x < size; x++) {
    const bx = proj[x];
    for (let z = 0; z < size; z++) {
      const i = bx * base + proj[z];
      sumX[i] += x;
      sumZ[i] += z;
      count[i]++;
    }
  }
  const repX = new Int16Array(base * base);
  const repZ = new Int16Array(base * base);
  repX.fill(-1);
  for (let bx = 0; bx < base; bx++) {
    for (let bz = 0; bz < base; bz++) {
      const px = base - 1 - bx;
      const pz = base - 1 - bz;
      const canonical = bx < px || (bx === px && bz <= pz);
      if (!canonical) continue;
      const i = bx * base + bz;
      if (count[i] === 0) continue;
      const cx = sumX[i] / count[i];
      const cz = sumZ[i] / count[i];
      let bestX = 0;
      let bestZ = 0;
      let bestD = Infinity;
      for (let x = 0; x < size; x++) {
        if (proj[x] !== bx) continue;
        for (let z = 0; z < size; z++) {
          if (proj[z] !== bz) continue;
          const d = (x - cx) * (x - cx) + (z - cz) * (z - cz);
          if (d < bestD) {
            bestD = d;
            bestX = x;
            bestZ = z;
          }
        }
      }
      repX[i] = bestX;
      repZ[i] = bestZ;
      const j = px * base + pz;
      if (j !== i) {
        repX[j] = size - 1 - bestX;
        repZ[j] = size - 1 - bestZ;
      }
    }
  }

  // Hand-placed landmarks outrank the hash scatter, so a citadel or antenna
  // is never replaced by the rock that happened to land on its half-turn.
  const decorRank = { citadel: 5, antenna: 4, palm: 3, crystal: 2, lamp: 1, fern: 1, rock: 0 };
  // `a` is the canonical side. Equal rank keeps `a`, so both halves agree.
  const preferDecor = (a, b) => {
    if (!a) return b || null;
    if (!b) return a;
    return (decorRank[b.type] || 0) > (decorRank[a.type] || 0) ? b : a;
  };
  const decorMap = new Map();
  for (let bx = 0; bx < base; bx++) {
    for (let bz = 0; bz < base; bz++) {
      const px = base - 1 - bx;
      const pz = base - 1 - bz;
      if (!isBaseActive(bx, bz) && !isBaseActive(px, pz)) continue;
      const i = bx * base + bz;
      if (repX[i] < 0) continue;
      const left = bx < px || (bx === px && bz <= pz);
      const decor = preferDecor(
        baseDecor(left ? bx : px, left ? bz : pz),
        baseDecor(left ? px : bx, left ? pz : bz)
      );
      if (!decor) continue;
      decorMap.set(`${repX[i]},${repZ[i]}`, decor);
    }
  }

  return {
    ...mapDef,
    gridSize: size,
    scaledFor: fighters,
    p1Spawn: [inv(p1[0]), inv(p1[1])],
    p2Spawn: [inv(p2[0]), inv(p2[1])],
    isTileActive(x, z) {
      if (x < 0 || z < 0 || x >= size || z >= size) return false;
      const bx = proj[x];
      const bz = proj[z];
      return isBaseActive(bx, bz) || isBaseActive(base - 1 - bx, base - 1 - bz);
    },
    elevationAt(x, z) {
      const bx = proj[x];
      const bz = proj[z];
      const px = base - 1 - bx;
      const pz = base - 1 - bz;
      const a = isBaseActive(bx, bz);
      const b = isBaseActive(px, pz);
      if (a && b) return Math.max(baseElev(bx, bz), baseElev(px, pz));
      if (a) return baseElev(bx, bz);
      if (b) return baseElev(px, pz);
      return 0;
    },
    decorAt(x, z) {
      return decorMap.get(`${x},${z}`) || null;
    },
  };
}

