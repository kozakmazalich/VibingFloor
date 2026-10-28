import * as THREE from "three";
import { buildViber, CHARACTERS } from "./vibers.js";
import { CYBER_LAYOUT, ISLANDS_LAYOUT, CORRIDOR_LAYOUT } from "./raceLayouts.js";

/**
 * VIBER RACE map pool — three completely separate tracks, picked at random.
 *
 * Each map owns its own layout (size + geometry) from src/raceLayouts.js and
 * only reuses the shared course system, robots, jetpack + batteries and the
 * placement / win logic:
 *
 *   CYBER SPRINT            the original course, unchanged
 *   METEOR ISLANDS          large fragmented floating islands + falling meteors
 *                           that punch holes in the islands
 *   RED LIGHT GREEN LIGHT   short, wide straight corridor + a giant META VIBER
 *                           at the finish that fires its green laser on RED
 */
export const RACE_MAPS = [
  {
    id: "cyber",
    name: "CYBER SPRINT",
    tagline: "The classic neon gauntlet",
    size: "MEDIUM",
    hazard: "none",
    accent: CYBER_LAYOUT.startGate.color,
    layout: CYBER_LAYOUT,
  },
  {
    id: "islands",
    name: "METEOR ISLANDS",
    tagline: "Jump the islands, dodge the sky",
    size: "LARGE",
    hazard: "islands",
    accent: ISLANDS_LAYOUT.startGate.color,
    layout: ISLANDS_LAYOUT,
  },
  {
    id: "redlight",
    name: "RED LIGHT GREEN LIGHT",
    tagline: "Freeze on red — the META VIBER is watching",
    size: "SHORT",
    hazard: "redlight",
    accent: CORRIDOR_LAYOUT.startGate.color,
    layout: CORRIDOR_LAYOUT,
  },
];

/**
 * Pick a random race map. Avoids repeating the map that just ran so back-to-back
 * races feel varied, while keeping the choice otherwise uniform.
 */
export function pickRaceMap(prevId) {
  let pool = RACE_MAPS;
  if (prevId && pool.length > 1) {
    const others = pool.filter((m) => m.id !== prevId);
    if (others.length) pool = others;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Build an oversized META VIBER for the Red Light Green Light map.
 * Returns { group, bodyPivot, height }. Scaled so its total height is `height`
 * world units with its feet at the group origin. The model faces +Z, so
 * rotating `group.rotation.y` turns it toward/away from the racers.
 */
export function buildOversizedMetaViber() {
  const def = CHARACTERS.find((c) => c.id === "meta") || CHARACTERS[5];
  const v = buildViber(def);

  const box = new THREE.Box3().setFromObject(v.root);
  const size = new THREE.Vector3();
  box.getSize(size);

  const group = new THREE.Group();
  group.add(v.root);

  const targetHeight = 7.0;
  const scale = targetHeight / (size.y || 1);
  group.scale.setScalar(scale);

  return { group, bodyPivot: v.bodyPivot, height: targetHeight, mats: v.mats };
}
