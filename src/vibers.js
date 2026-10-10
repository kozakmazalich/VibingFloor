// Viber robots — extracted from VIBER BRAWL (vibe-vibers).
// Chunky low-poly block characters with thick black outlines, built in code.
import * as THREE from "three";

const outlineMat = new THREE.LineBasicMaterial({ color: 0x14161a });
const edgeCache = new Map();
function edgeGeo(g) {
  const p = g.parameters;
  const key = (p.width || 0) + "_" + (p.height || 0) + "_" + (p.depth || 0) + "_" + (p.radius || 0);
  if (!edgeCache.has(key)) edgeCache.set(key, new THREE.EdgesGeometry(g));
  return edgeCache.get(key);
}
function mkBox(w, h, d, mat, outline) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (outline !== false) m.add(new THREE.LineSegments(edgeGeo(g), outlineMat));
  return m;
}
function mkCone(r, h, mat, outline) {
  const g = new THREE.ConeGeometry(r, h, 8); // 8 segments: low poly, chunky look
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (outline !== false) m.add(new THREE.LineSegments(edgeGeo(g), outlineMat));
  return m;
}

export const CHARACTERS = [
  {
    id: "miner", name: "CRIMSON MINER VIBER",
    colors: { head: 0xd23a2a, body: 0x1a1a1e, arm: 0x2a2a30, foot: 0x111115, belt: 0x3a2a20, dark: 0x0a0a0a, visor: 0xf0f0e8, eye: 0x0a0a0a, accent: 0x8b5a3a, boot: 0x0a0a0a },
    headExtras: [
      { w: 0.22, h: 1.30, d: 0.22, x: -0.38, y: 1.42, z: -0.25, c: "accent" },
      { w: 0.22, h: 1.60, d: 0.22, x: 0.00, y: 1.58, z: 0.00, c: "accent" },
      { w: 0.22, h: 1.30, d: 0.22, x: 0.38, y: 1.42, z: -0.25, c: "accent" },
      { w: 0.80, h: 0.72, d: 0.10, x: -0.44, y: 0.15, z: 0.90, c: "visor" },
      { w: 0.80, h: 0.72, d: 0.10, x: 0.44, y: 0.15, z: 0.90, c: "visor" },
      { w: 0.36, h: 0.36, d: 0.10, x: -0.50, y: -0.16, z: 0.96, c: "eye" },
      { w: 0.36, h: 0.36, d: 0.10, x: 0.50, y: -0.16, z: 0.96, c: "eye" },
      { w: 1.66, h: 0.22, d: 1.72, x: 0, y: -0.60, z: 0, c: "accent" },
    ],
    bodyExtras: [
      { w: 1.36, h: 0.24, d: 1.10, x: 0, y: 0.32, z: 0, c: "accent" },
      { w: 0.30, h: 0.90, d: 1.14, x: 0, y: 0.00, z: 0, c: "dark" },
    ],
    armExtrasL: [{ w: 0.50, h: 0.20, d: 0.54, x: 0, y: -0.88, z: 0, c: "accent" }],
    armExtrasR: [
      { w: 0.50, h: 0.20, d: 0.54, x: 0, y: -0.88, z: 0, c: "accent" },
      { w: 0.16, h: 1.80, d: 0.16, x: 0, y: -0.30, z: -0.60, c: "accent" },
      { w: 0.95, h: 0.22, d: 0.24, x: 0, y: 0.55, z: -0.60, c: "visor" },
    ],
  },
  {
    id: "moss", name: "MOSS VIBER",
    colors: { head: 0x1a4a30, body: 0x1a4a30, arm: 0x1a4a30, foot: 0xa8ffc0, belt: 0x2a3035, dark: 0x0a1a10, visor: 0x8fffaa, eye: 0xf0f0e8, accent: 0x2a3035, boot: 0x0a1a10 },
    headExtras: [
      { w: 1.86, h: 0.28, d: 1.82, x: 0, y: 0.86, z: 0, c: "accent" },
      { w: 1.30, h: 0.22, d: 1.26, x: 0, y: 1.10, z: 0, c: "accent" },
      { w: 0.78, h: 0.78, d: 0.12, x: -0.44, y: 0.10, z: 0.88, c: "visor" },
      { w: 0.78, h: 0.78, d: 0.12, x: 0.44, y: 0.10, z: 0.88, c: "visor" },
      { w: 0.40, h: 0.40, d: 0.10, x: -0.44, y: 0.10, z: 0.96, c: "eye" },
      { w: 0.40, h: 0.40, d: 0.10, x: 0.44, y: 0.10, z: 0.96, c: "eye" },
      { w: 0.22, h: 0.22, d: 0.14, x: 0, y: -0.30, z: 0.92, c: "dark" },
    ],
    bodyExtras: [
      { w: 0.26, h: 0.72, d: 1.14, x: -0.35, y: 0.00, z: 0, c: "visor" },
      { w: 0.26, h: 0.72, d: 1.14, x: 0.35, y: 0.00, z: 0, c: "visor" },
    ],
    armExtrasL: [{ w: 0.48, h: 0.20, d: 0.54, x: 0, y: -0.28, z: 0, c: "visor" }],
    armExtrasR: [{ w: 0.48, h: 0.20, d: 0.54, x: 0, y: -0.28, z: 0, c: "visor" }],
  },
  {
    id: "volt", name: "VOLT VIBER",
    colors: { head: 0x2a6ac0, body: 0x2a6ac0, arm: 0x2a6ac0, foot: 0xffe060, belt: 0x2a5040, dark: 0x3a2a20, visor: 0xffe880, eye: 0xfff0a0, accent: 0x2a8040, boot: 0x3a2a20 },
    headExtras: [
      { w: 1.90, h: 0.30, d: 1.88, x: 0, y: 0.86, z: 0, c: "dark" },
      { w: 1.24, h: 0.34, d: 1.22, x: 0, y: 1.16, z: 0, c: "dark" },
      { w: 0.24, h: 0.55, d: 0.24, x: -0.52, y: 1.60, z: 0, c: "visor" },
      { w: 0.24, h: 0.55, d: 0.24, x: 0.52, y: 1.60, z: 0, c: "visor" },
      { w: 0.38, h: 0.34, d: 0.38, x: -0.52, y: 1.98, z: 0, c: "visor" },
      { w: 0.38, h: 0.34, d: 0.38, x: 0.52, y: 1.98, z: 0, c: "visor" },
      { w: 0.62, h: 0.62, d: 0.12, x: -0.44, y: 0.10, z: 0.90, c: "eye" },
      { w: 0.62, h: 0.62, d: 0.12, x: 0.44, y: 0.10, z: 0.90, c: "eye" },
      { w: 1.66, h: 0.22, d: 1.72, x: 0, y: -0.58, z: 0, c: "accent" },
    ],
    bodyExtras: [
      { w: 1.34, h: 0.22, d: 1.10, x: 0, y: 0.30, z: 0, c: "accent" },
      { w: 0.30, h: 0.50, d: 1.14, x: 0, y: -0.10, z: 0, c: "dark" },
    ],
    armExtrasL: [{ w: 0.50, h: 0.22, d: 0.54, x: 0, y: -0.88, z: 0, c: "accent" }],
    armExtrasR: [{ w: 0.50, h: 0.22, d: 0.54, x: 0, y: -0.88, z: 0, c: "accent" }],
  },
  {
    id: "phantom", name: "PHANTOM VIBER",
    ghost: true,
    colors: { head: 0x7a4ab0, body: 0x7a4ab0, arm: 0x7a4ab0, foot: 0xe8e0d0, belt: 0x4ad0c0, dark: 0x2a1840, visor: 0xb0b0b0, eye: 0x0a0a0a, accent: 0x4ad0c0, boot: 0x2a1840 },
    headExtras: [
      { w: 0.30, h: 0.40, d: 0.30, x: -0.50, y: 0.90, z: 0, c: "head" },
      { w: 0.24, h: 0.44, d: 0.24, x: -0.50, y: 1.30, z: 0, c: "head" },
      { w: 0.30, h: 0.40, d: 0.30, x: 0.50, y: 0.90, z: 0, c: "head" },
      { w: 0.24, h: 0.44, d: 0.24, x: 0.50, y: 1.30, z: 0, c: "head" },
      { w: 0.72, h: 0.72, d: 0.10, x: -0.44, y: 0.12, z: 0.90, c: "visor" },
      { w: 0.72, h: 0.72, d: 0.10, x: 0.44, y: 0.12, z: 0.90, c: "visor" },
      { w: 0.34, h: 0.34, d: 0.10, x: -0.44, y: 0.06, z: 0.98, c: "eye" },
      { w: 0.34, h: 0.34, d: 0.10, x: 0.44, y: 0.06, z: 0.98, c: "eye" },
    ],
    bodyExtras: [
      { w: 1.36, h: 0.20, d: 1.10, x: 0, y: 0.34, z: 0, c: "accent" },
      { w: 1.36, h: 0.20, d: 1.10, x: 0, y: -0.02, z: 0, c: "accent" },
    ],
    armExtrasL: [{ w: 0.50, h: 0.20, d: 0.54, x: 0, y: -0.28, z: 0, c: "accent" }],
    armExtrasR: [{ w: 0.50, h: 0.20, d: 0.54, x: 0, y: -0.28, z: 0, c: "accent" }],
  },
  {
    id: "chog", name: "CHOG VIBER",
    colors: { head: 0x5c36b0, body: 0x5c36b0, arm: 0x5c36b0, foot: 0x686ffe, belt: 0x686ffe, dark: 0x2a1840, visor: 0xfdf7d3, eye: 0x14161a, accent: 0x686ffe, boot: 0x2a1840 },
    headExtras: [
      // Blue periwinkle top band
      { w: 1.79, h: 0.30, d: 1.75, x: 0, y: 0.62, z: 0, c: "accent" },
      // Cream face plate
      { w: 1.40, h: 1.10, d: 0.16, x: 0, y: 0.02, z: 0.84, c: "visor" },
      // Black hedgehog eyes
      { w: 0.30, h: 0.30, d: 0.10, x: -0.44, y: 0.24, z: 0.94, c: "eye" },
      { w: 0.30, h: 0.30, d: 0.10, x: 0.44, y: 0.24, z: 0.94, c: "eye" },
      // Dark nose
      { w: 0.24, h: 0.24, d: 0.12, x: 0, y: -0.10, z: 0.96, c: "dark" },
      // Blue cheek tint patches
      { w: 0.22, h: 0.22, d: 0.08, x: -0.74, y: -0.16, z: 0.88, c: "accent" },
      { w: 0.22, h: 0.22, d: 0.08, x: 0.74, y: -0.16, z: 0.88, c: "accent" },
    ],
    bodyExtras: [
      // Blue belly plate
      { w: 0.90, h: 0.55, d: 0.08, x: 0, y: 0.00, z: 0.55, c: "accent" },
    ],
    armExtrasL: [{ w: 0.50, h: 0.20, d: 0.54, x: 0, y: -0.60, z: 0, c: "accent" }],
    armExtrasR: [{ w: 0.50, h: 0.20, d: 0.54, x: 0, y: -0.60, z: 0, c: "accent" }],
    // Hedgehog spikes: cream cones along the back (pointing -Z) and on top
    // of the head (pointing up), in bodyPivot space. rx = -PI/2 turns the
    // cone tip toward -Z (the model's back).
    spikes: [
      // Back of the body (fan of quills)
      { x: -0.42, y: 1.18, z: -0.56, r: 0.18, h: 0.62, rx: -Math.PI / 2, c: "visor" },
      { x: -0.21, y: 1.26, z: -0.56, r: 0.18, h: 0.66, rx: -Math.PI / 2, c: "visor" },
      { x: 0.00, y: 1.30, z: -0.56, r: 0.18, h: 0.70, rx: -Math.PI / 2, c: "visor" },
      { x: 0.21, y: 1.26, z: -0.56, r: 0.18, h: 0.66, rx: -Math.PI / 2, c: "visor" },
      { x: 0.42, y: 1.18, z: -0.56, r: 0.18, h: 0.62, rx: -Math.PI / 2, c: "visor" },
      // Back of the head
      { x: -0.60, y: 2.45, z: -0.82, r: 0.16, h: 0.55, rx: -Math.PI / 2, c: "visor" },
      { x: -0.30, y: 2.55, z: -0.86, r: 0.16, h: 0.60, rx: -Math.PI / 2, c: "visor" },
      { x: 0.00, y: 2.60, z: -0.88, r: 0.16, h: 0.62, rx: -Math.PI / 2, c: "visor" },
      { x: 0.30, y: 2.55, z: -0.86, r: 0.16, h: 0.60, rx: -Math.PI / 2, c: "visor" },
      { x: 0.60, y: 2.45, z: -0.82, r: 0.16, h: 0.55, rx: -Math.PI / 2, c: "visor" },
      // Top of the head (mohawk row)
      { x: -0.55, y: 2.95, z: -0.30, r: 0.17, h: 0.55, c: "visor" },
      { x: -0.28, y: 3.05, z: -0.25, r: 0.17, h: 0.62, c: "visor" },
      { x: 0.00, y: 3.10, z: -0.20, r: 0.17, h: 0.68, c: "visor" },
      { x: 0.28, y: 3.05, z: -0.25, r: 0.17, h: 0.62, c: "visor" },
      { x: 0.55, y: 2.95, z: -0.30, r: 0.17, h: 0.55, c: "visor" },
    ],
  },
];

export function buildViber(def) {
  const C = def.colors;
  const mats = [];
  function M(color, opts) {
    const m = new THREE.MeshLambertMaterial(Object.assign({ color: color }, opts || {}));
    if (def.ghost) { m.transparent = true; m.opacity = 0.74; }
    mats.push(m);
    return m;
  }
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);
  const headMat = M(C.head), bodyMat = M(C.body), armMat = M(C.arm), footMat = M(C.foot),
    beltMat = M(C.belt), darkMat = M(C.dark),
    visorMat = M(C.visor, { emissive: C.visor, emissiveIntensity: 0.45 }),
    eyeMat = M(C.eye, { emissive: C.eye, emissiveIntensity: 0.7 }),
    accentMat = M(C.accent, { emissive: C.accent, emissiveIntensity: 0.25 });
  const matByName = { head: headMat, body: bodyMat, arm: armMat, foot: footMat, belt: beltMat, dark: darkMat, visor: visorMat, eye: eyeMat, accent: accentMat };
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.27, 0.66, 0); legR.position.set(0.27, 0.66, 0);
  bodyPivot.add(legL, legR);
  const legMeshL = mkBox(0.44, 0.66, 0.52, footMat); legMeshL.position.y = -0.33; legL.add(legMeshL);
  const legMeshR = mkBox(0.44, 0.66, 0.52, footMat); legMeshR.position.y = -0.33; legR.add(legMeshR);
  const bodyMesh = mkBox(1.28, 0.88, 1.05, bodyMat); bodyMesh.position.y = 1.10; bodyPivot.add(bodyMesh);
  const belt = mkBox(1.36, 0.18, 1.12, beltMat); belt.position.y = 0.76; bodyPivot.add(belt);
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.86, 1.42, 0); armR.position.set(0.86, 1.42, 0);
  bodyPivot.add(armL, armR);
  const armMeshL = mkBox(0.46, 0.78, 0.52, armMat); armMeshL.position.y = -0.36; armL.add(armMeshL);
  const armMeshR = mkBox(0.46, 0.78, 0.52, armMat); armMeshR.position.y = -0.36; armR.add(armMeshR);
  const foreL = mkBox(0.48, 0.20, 0.54, visorMat); foreL.position.y = -0.60; armL.add(foreL);
  const foreR = mkBox(0.48, 0.20, 0.54, visorMat); foreR.position.y = -0.60; armR.add(foreR);
  const head = new THREE.Group(); head.position.y = 2.27; bodyPivot.add(head);
  const headMesh = mkBox(1.72, 1.46, 1.68, headMat); head.add(headMesh);
  const band = mkBox(1.79, 0.60, 1.75, darkMat); band.position.y = 0.08; head.add(band);
  const visor = mkBox(1.58, 0.30, 0.18, visorMat); visor.position.set(0, 0.17, 0.86); head.add(visor);
  const notch = mkBox(0.50, 0.42, 0.20, visorMat); notch.position.set(0, 0.29, 0.87); head.add(notch);
  const eyeL = mkBox(0.28, 0.22, 0.16, eyeMat); eyeL.position.set(-0.58, -0.11, 0.86); head.add(eyeL);
  const eyeR = mkBox(0.28, 0.22, 0.16, eyeMat); eyeR.position.set(0.58, -0.11, 0.86); head.add(eyeR);
  const hasDetail = (def.headExtras && def.headExtras.length);
  if (hasDetail) { band.visible = false; visor.visible = false; notch.visible = false; eyeL.visible = false; eyeR.visible = false; }
  function addExtras(list, group) {
    if (!list || !list.length) return;
    for (const p of list) {
      const mat = (typeof p.c === "string") ? (matByName[p.c] || accentMat) : M(p.c);
      const b = mkBox(p.w, p.h, p.d, mat, p.outline !== false);
      b.position.set(p.x || 0, p.y || 0, p.z || 0);
      if (p.rx) b.rotation.x = p.rx; if (p.ry) b.rotation.y = p.ry; if (p.rz) b.rotation.z = p.rz;
      group.add(b);
    }
  }
  // Hedgehog spikes: cone quills (CHOG VIBER). Entries may set on: "head" to
  // attach to the head group (head-local coords) instead of the body pivot.
  function addSpikes(list) {
    if (!list || !list.length) return;
    for (const p of list) {
      const mat = (typeof p.c === "string") ? (matByName[p.c] || accentMat) : M(p.c);
      const cone = mkCone(p.r, p.h, mat, p.outline !== false);
      cone.position.set(p.x || 0, p.y || 0, p.z || 0);
      if (p.rx) cone.rotation.x = p.rx;
      if (p.ry) cone.rotation.y = p.ry;
      if (p.rz) cone.rotation.z = p.rz;
      (p.on === "head" ? head : bodyPivot).add(cone);
    }
  }
  addExtras(def.headExtras, head);
  addExtras(def.bodyExtras, bodyPivot);
  addExtras(def.armExtrasL, armL);
  addExtras(def.armExtrasR, armR);
  addSpikes(def.spikes);
  root.scale.setScalar(0.8);
  return { root, bodyPivot, head, mats, legL, legR, armL, armR, visorMat, eyeMat };
}
