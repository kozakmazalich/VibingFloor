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
    // cone tip toward -Z (the model's back). 3x scale for a big quill crest.
    spikes: [
      // Back of the body (fan of quills)
      { x: -0.42, y: 1.18, z: -0.56, r: 0.54, h: 1.86, rx: -Math.PI / 2, c: "visor" },
      { x: -0.21, y: 1.26, z: -0.56, r: 0.54, h: 1.98, rx: -Math.PI / 2, c: "visor" },
      { x: 0.00, y: 1.30, z: -0.56, r: 0.54, h: 2.10, rx: -Math.PI / 2, c: "visor" },
      { x: 0.21, y: 1.26, z: -0.56, r: 0.54, h: 1.98, rx: -Math.PI / 2, c: "visor" },
      { x: 0.42, y: 1.18, z: -0.56, r: 0.54, h: 1.86, rx: -Math.PI / 2, c: "visor" },
      // Back of the head
      { x: -0.60, y: 2.45, z: -0.82, r: 0.48, h: 1.65, rx: -Math.PI / 2, c: "visor" },
      { x: -0.30, y: 2.55, z: -0.86, r: 0.48, h: 1.80, rx: -Math.PI / 2, c: "visor" },
      { x: 0.00, y: 2.60, z: -0.88, r: 0.48, h: 1.86, rx: -Math.PI / 2, c: "visor" },
      { x: 0.30, y: 2.55, z: -0.86, r: 0.48, h: 1.80, rx: -Math.PI / 2, c: "visor" },
      { x: 0.60, y: 2.45, z: -0.82, r: 0.48, h: 1.65, rx: -Math.PI / 2, c: "visor" },
      // Top of the head (mohawk row)
      { x: -0.55, y: 2.95, z: -0.30, r: 0.51, h: 1.65, c: "visor" },
      { x: -0.28, y: 3.05, z: -0.25, r: 0.51, h: 1.86, c: "visor" },
      { x: 0.00, y: 3.10, z: -0.20, r: 0.51, h: 2.04, c: "visor" },
      { x: 0.28, y: 3.05, z: -0.25, r: 0.51, h: 1.86, c: "visor" },
      { x: 0.55, y: 2.95, z: -0.30, r: 0.51, h: 1.65, c: "visor" },
    ],
  },
  {
    id: "meta", name: "META VIBER",
    laser: true,
    customBuild: "meta", // chibi body built by buildMetaViber (see below)
    // Design spec from assets/meta/gemini-code-1791997066782.html: exact
    // proportions + extras in that preview's coordinate system.
    colors: { head: 0xc5d41d, body: 0xc5d41d, arm: 0xc5d41d, foot: 0x272125, belt: 0x272125, dark: 0x96a117, visor: 0xc5d41d, eye: 0xffffff, accent: 0xeaff3a, boot: 0x272125 },
    headExtras: [
      // Ears on top of the head + white cubes on the front of the ears
      { w: 0.24, h: 0.20, d: 0.22, x: -0.22, y: 0.44, z: 0.02, c: 0x272125 },
      { w: 0.10, h: 0.10, d: 0.06, x: -0.22, y: 0.39, z: 0.14, c: 0xffffff },
      { w: 0.24, h: 0.20, d: 0.22, x: 0.22, y: 0.44, z: 0.02, c: 0x272125 },
      { w: 0.10, h: 0.10, d: 0.06, x: 0.22, y: 0.39, z: 0.14, c: 0xffffff },
      // Big square white eyes
      { w: 0.32, h: 0.34, d: 0.08, x: -0.19, y: -0.02, z: 0.36, c: 0xffffff },
      { w: 0.32, h: 0.34, d: 0.08, x: 0.19, y: -0.02, z: 0.36, c: 0xffffff },
      // Protruding black cube pupils
      { w: 0.11, h: 0.11, d: 0.07, x: -0.19, y: -0.02, z: 0.42, c: 0x272125 },
      { w: 0.11, h: 0.11, d: 0.07, x: 0.19, y: -0.02, z: 0.42, c: 0x272125 },
      // Black nose between the eyes
      { w: 0.09, h: 0.14, d: 0.07, x: 0.00, y: -0.12, z: 0.37, c: 0x272125 },
    ],
    bodyExtras: [
      // Overalls: bib + two shoulder straps
      { w: 0.46, h: 0.36, d: 0.44, x: 0.00, y: -0.06, z: 0.02, c: 0x272125 },
      { w: 0.11, h: 0.14, d: 0.44, x: -0.17, y: 0.18, z: 0.02, c: 0x272125 },
      { w: 0.11, h: 0.14, d: 0.44, x: 0.17, y: 0.18, z: 0.02, c: 0x272125 },
      // White square button on the bib
      { w: 0.10, h: 0.10, d: 0.06, x: 0.06, y: 0.04, z: 0.25, c: 0xffffff },
      // White stripe over the viewer's right leg
      { w: 0.22, h: 0.06, d: 0.24, x: 0.15, y: -0.27, z: 0.00, c: 0xffffff },
    ],
    armExtrasL: [
      { w: 0.23, h: 0.14, d: 0.23, x: 0.00, y: -0.10, z: 0.00, c: 0x272125 }, // dark cuff
      { w: 0.22, h: 0.10, d: 0.24, x: 0.00, y: -0.21, z: 0.02, c: 0xeaff3a }, // lime hand
    ],
    armExtrasR: [
      { w: 0.23, h: 0.14, d: 0.23, x: 0.00, y: -0.10, z: 0.00, c: 0x272125 },
      { w: 0.22, h: 0.10, d: 0.24, x: 0.00, y: -0.21, z: 0.02, c: 0xeaff3a },
    ],
  },
  // PAGE 2 FIGHTERS — AGENT VIBERS. Each body is rebuilt box-for-box from its
  // cutout PNG (assets/robots-cutout copy/vibe-vibers-agent-*.png, the source
  // of truth): per-robot head / torso / arm / leg proportions plus every
  // visible detail. Built by buildAgentViber (customBuild: "agent").
  // Units: head width = 1. x < 0 is the viewer's left in the PNG (the face
  // looks +Z). Part fields: on = head | torso | arms | armL | armR | legs |
  // legL | legR ("arms"/"legs" mirror x outward); x, y relative to the parent
  // centre; front = how far the part's face sits proud of the parent's front
  // face (else z); glow = emissive boost for bright eyes/pupils.
  {
    id: "agent103", name: "AGENT 103",
    customBuild: "agent",
    agent: {
      head: { w: 1.0, h: 0.95, d: 0.9, c: 0x9a8a5c },
      torso: { w: 0.84, h: 0.46, d: 0.7, c: 0x9a8a5c },
      arms: { w: 0.3, h: 0.5, d: 0.42, c: 0x262c33 },
      legs: { w: 0.3, h: 0.3, d: 0.36, x: 0.2, c: 0x9a8a5c },
      parts: [
        // Stacked block ears
        { on: "head", w: 0.24, h: 0.2, d: 0.24, x: -0.3, y: 0.575, z: 0, c: 0x9a8a5c },
        { on: "head", w: 0.14, h: 0.14, d: 0.14, x: -0.36, y: 0.745, z: -0.02, c: 0x9a8a5c },
        { on: "head", w: 0.24, h: 0.2, d: 0.24, x: 0.3, y: 0.575, z: 0, c: 0x9a8a5c },
        { on: "head", w: 0.14, h: 0.14, d: 0.14, x: 0.36, y: 0.745, z: -0.02, c: 0x9a8a5c },
        // Big black eye frames with white pupils glancing left
        { on: "head", w: 0.38, h: 0.35, d: 0.1, x: -0.32, y: -0.1, front: 0.06, c: 0x15191a },
        { on: "head", w: 0.38, h: 0.35, d: 0.1, x: 0.3, y: -0.12, front: 0.06, c: 0x15191a },
        { on: "head", w: 0.15, h: 0.15, d: 0.06, x: -0.39, y: -0.13, front: 0.1, c: 0xeef2fc, glow: 0.45 },
        { on: "head", w: 0.15, h: 0.15, d: 0.06, x: 0.23, y: -0.15, front: 0.1, c: 0xeef2fc, glow: 0.45 },
        // Grinning mouth: white interior with four slate teeth bars
        { on: "torso", w: 0.64, h: 0.36, d: 0.06, x: 0, y: 0.03, front: 0.02, c: 0xe8eef8, glow: 0.2 },
        { on: "torso", w: 0.13, h: 0.42, d: 0.1, x: -0.25, y: 0.06, front: 0.06, c: 0x262c33 },
        { on: "torso", w: 0.13, h: 0.42, d: 0.1, x: -0.08, y: 0.06, front: 0.06, c: 0x262c33 },
        { on: "torso", w: 0.13, h: 0.42, d: 0.1, x: 0.09, y: 0.06, front: 0.06, c: 0x262c33 },
        { on: "torso", w: 0.13, h: 0.42, d: 0.1, x: 0.26, y: 0.06, front: 0.06, c: 0x1c2026 },
        // Cream hands, black boots
        { on: "arms", w: 0.31, h: 0.2, d: 0.43, y: -0.15, c: 0xccc6c0 },
        { on: "legs", w: 0.32, h: 0.12, d: 0.38, y: -0.09, c: 0x15171a },
      ],
    },
  },
  {
    id: "agent107", name: "AGENT 107",
    customBuild: "agent",
    agent: {
      head: { w: 1.0, h: 0.9, d: 0.9, c: 0x452c25 },
      torso: { w: 0.88, h: 0.48, d: 0.75, c: 0x452c25 },
      arms: { w: 0.28, h: 0.42, d: 0.4, c: 0x452c25, drop: 0.04 },
      legs: { w: 0.34, h: 0.14, d: 0.4, x: 0.2, c: 0x6a5c4e },
      parts: [
        // Off-white cap with a black front brim and blue-grey badge
        { on: "head", w: 1.08, h: 0.42, d: 1.0, x: 0, y: 0.54, z: -0.02, c: 0xdcd6cb },
        { on: "head", w: 1.06, h: 0.15, d: 0.3, x: 0, y: 0.255, front: 0.14, c: 0x14181a },
        { on: "head", w: 0.3, h: 0.16, d: 0.1, x: -0.09, y: 0.4, front: 0.09, c: 0xb4bac6 },
        // Pale band under the brim
        { on: "head", w: 1.0, h: 0.14, d: 0.06, x: 0, y: 0.115, front: 0.02, c: 0xccc6c0 },
        // Huge black eyes with teal pupils
        { on: "head", w: 0.47, h: 0.42, d: 0.1, x: -0.255, y: -0.17, front: 0.05, c: 0x14181a },
        { on: "head", w: 0.47, h: 0.42, d: 0.1, x: 0.255, y: -0.17, front: 0.05, c: 0x14181a },
        { on: "head", w: 0.16, h: 0.16, d: 0.06, x: -0.36, y: -0.22, front: 0.09, c: 0x7ee4d8, glow: 0.55 },
        { on: "head", w: 0.16, h: 0.16, d: 0.06, x: 0.15, y: -0.23, front: 0.09, c: 0x7ee4d8, glow: 0.55 },
        // Chest button + taupe base plate
        { on: "torso", w: 0.15, h: 0.15, d: 0.12, x: -0.08, y: 0.04, front: 0.07, c: 0xb4bac6 },
        { on: "torso", w: 0.94, h: 0.1, d: 0.8, x: 0, y: -0.21, z: 0, c: 0x605448 },
        // Left hand: small grey cube
        { on: "armL", w: 0.22, h: 0.16, d: 0.26, x: 0, y: -0.25, z: 0.04, c: 0x9c9c96 },
        // Right arm: grey elbow, big cream fist gripping a blue-grey block
        { on: "armR", w: 0.16, h: 0.2, d: 0.16, x: 0.1, y: 0.12, z: -0.14, c: 0xb4bac6 },
        { on: "armR", w: 0.38, h: 0.26, d: 0.44, x: -0.02, y: -0.3, z: 0.1, c: 0xdcd6cb },
        { on: "armR", w: 0.22, h: 0.3, d: 0.14, x: -0.08, y: -0.32, z: 0.36, c: 0xb4bac6 },
      ],
    },
  },
  {
    id: "agent111", name: "AGENT 111",
    customBuild: "agent",
    agent: {
      head: { w: 1.0, h: 1.0, d: 0.95, c: 0xd69456 },
      torso: { w: 0.85, h: 0.44, d: 0.72, c: 0xd69456 },
      arms: { w: 0.3, h: 0.46, d: 0.4, c: 0x5a6678 },
      legs: { w: 0.2, h: 0.16, d: 0.24, x: 0.2, c: 0x1c1f24 },
      parts: [
        // Antenna with a green tip
        { on: "head", w: 0.12, h: 0.36, d: 0.12, x: 0.05, y: 0.68, z: 0, c: 0x14181a },
        { on: "head", w: 0.16, h: 0.16, d: 0.16, x: 0.05, y: 0.92, z: 0, c: 0xa8ea9c, glow: 0.5 },
        // Mismatched eyes: green frame (left) + slate frame (right), cream pupils
        { on: "head", w: 0.5, h: 0.56, d: 0.1, x: -0.27, y: -0.16, front: 0.05, c: 0xa8ea9c, glow: 0.3 },
        { on: "head", w: 0.48, h: 0.54, d: 0.1, x: 0.27, y: -0.18, front: 0.05, c: 0x5a6678 },
        { on: "head", w: 0.27, h: 0.28, d: 0.06, x: -0.32, y: -0.17, front: 0.09, c: 0xd8d2c8, glow: 0.25 },
        { on: "head", w: 0.27, h: 0.28, d: 0.06, x: 0.22, y: -0.2, front: 0.09, c: 0xd8d2c8, glow: 0.25 },
        { on: "head", w: 0.12, h: 0.14, d: 0.1, x: -0.02, y: -0.33, front: 0.1, c: 0x14181a },
        // Slate collar, cream chest panel with slate bar + button, slate hips
        { on: "torso", w: 0.95, h: 0.08, d: 0.8, x: 0, y: 0.2, z: 0, c: 0x5a6678 },
        { on: "torso", w: 0.6, h: 0.3, d: 0.06, x: -0.04, y: 0.0, front: 0.02, c: 0xd8d2c8, glow: 0.15 },
        { on: "torso", w: 0.3, h: 0.07, d: 0.08, x: 0.1, y: 0.1, front: 0.05, c: 0x5a6678 },
        { on: "torso", w: 0.15, h: 0.14, d: 0.1, x: -0.06, y: -0.02, front: 0.08, c: 0x5a6678 },
        { on: "torso", w: 0.7, h: 0.08, d: 0.64, x: 0, y: -0.24, z: 0, c: 0x5a6678 },
        // Orange shoulders over slate arms
        { on: "arms", w: 0.31, h: 0.22, d: 0.41, y: 0.12, c: 0xd69456 },
      ],
    },
  },
  {
    id: "agent116", name: "AGENT 116",
    customBuild: "agent",
    agent: {
      head: { w: 1.0, h: 1.0, d: 0.92, c: 0xb83826 },
      torso: { w: 0.85, h: 0.48, d: 0.72, c: 0xb83826 },
      arms: { w: 0.3, h: 0.5, d: 0.42, c: 0xb83826 },
      legs: { w: 0.3, h: 0.22, d: 0.34, x: 0.2, c: 0xb83826 },
      parts: [
        // Stacked block ears
        { on: "head", w: 0.24, h: 0.2, d: 0.24, x: -0.3, y: 0.6, z: 0, c: 0xb83826 },
        { on: "head", w: 0.14, h: 0.14, d: 0.14, x: -0.36, y: 0.77, z: -0.02, c: 0xb83826 },
        { on: "head", w: 0.24, h: 0.2, d: 0.24, x: 0.3, y: 0.6, z: 0, c: 0xb83826 },
        { on: "head", w: 0.14, h: 0.14, d: 0.14, x: 0.36, y: 0.77, z: -0.02, c: 0xb83826 },
        // Green-framed left eye with cream pupil
        { on: "head", w: 0.54, h: 0.54, d: 0.1, x: -0.3, y: -0.03, front: 0.05, c: 0xa8ea9c, glow: 0.3 },
        { on: "head", w: 0.28, h: 0.28, d: 0.06, x: -0.34, y: -0.06, front: 0.09, c: 0xd8d2c8, glow: 0.25 },
        // Cream scar stripe crossing the small black right eye
        { on: "head", w: 0.15, h: 0.88, d: 0.06, x: 0.29, y: 0.0, front: 0.02, c: 0xd8d2c8 },
        { on: "head", w: 0.3, h: 0.26, d: 0.1, x: 0.24, y: -0.1, front: 0.06, c: 0x15181a },
        { on: "head", w: 0.19, h: 0.16, d: 0.1, x: 0.0, y: -0.28, front: 0.08, c: 0x15181a },
        // Taupe pocket with a rust nub and a cream button
        { on: "torso", w: 0.36, h: 0.29, d: 0.06, x: -0.1, y: -0.03, front: 0.02, c: 0x605448 },
        { on: "torso", w: 0.13, h: 0.1, d: 0.08, x: -0.07, y: 0.15, front: 0.04, c: 0x9c5a48 },
        { on: "torso", w: 0.15, h: 0.15, d: 0.12, x: 0.1, y: -0.12, front: 0.08, c: 0xd8d2c8 },
        // Black cuffs + cream hands, cream boots
        { on: "arms", w: 0.31, h: 0.1, d: 0.43, y: -0.06, c: 0x15181a },
        { on: "arms", w: 0.31, h: 0.14, d: 0.43, y: -0.18, c: 0xd8d2c8 },
        { on: "legs", w: 0.36, h: 0.12, d: 0.44, y: -0.05, z: 0.05, c: 0xdcd6cb },
      ],
    },
  },
  {
    id: "agent120", name: "AGENT 120",
    customBuild: "agent",
    agent: {
      head: { w: 1.0, h: 1.2, d: 0.9, c: 0x452c25 },
      torso: { w: 0.62, h: 0.48, d: 0.55, c: 0x262c33 },
      arms: { w: 0.42, h: 0.5, d: 0.55, c: 0x452c25 },
      legs: { w: 0.15, h: 0.24, d: 0.15, x: 0.15, c: 0x2c3038 },
      parts: [
        // Flat raised crown block + blue headband
        { on: "head", w: 0.74, h: 0.14, d: 0.66, x: 0, y: 0.67, z: 0, c: 0x52342b },
        { on: "head", w: 1.02, h: 0.13, d: 0.92, x: 0, y: 0.36, z: 0, c: 0x3054c0, glow: 0.15 },
        // Green-framed eyes with cream pupils
        { on: "head", w: 0.46, h: 0.55, d: 0.1, x: -0.255, y: -0.12, front: 0.05, c: 0xa8ea9c, glow: 0.3 },
        { on: "head", w: 0.46, h: 0.55, d: 0.1, x: 0.255, y: -0.12, front: 0.05, c: 0xa8ea9c, glow: 0.3 },
        { on: "head", w: 0.21, h: 0.24, d: 0.06, x: -0.29, y: -0.14, front: 0.09, c: 0xe4ded2, glow: 0.25 },
        { on: "head", w: 0.21, h: 0.24, d: 0.06, x: 0.21, y: -0.14, front: 0.09, c: 0xe4ded2, glow: 0.25 },
        // Black mouth block
        { on: "head", w: 0.26, h: 0.13, d: 0.1, x: -0.1, y: -0.46, front: 0.08, c: 0x15181a },
        // Black chest bar + tan shoulder nubs on the navy vest
        { on: "torso", w: 0.58, h: 0.18, d: 0.14, x: 0, y: 0.06, front: 0.1, c: 0x15181a },
        { on: "torso", w: 0.12, h: 0.07, d: 0.3, x: -0.3, y: 0.2, z: 0, c: 0x8a7a60 },
        { on: "torso", w: 0.12, h: 0.07, d: 0.3, x: 0.3, y: 0.2, z: 0, c: 0x8a7a60 },
        // Big brown arms with cream cuffs, black boots on thin legs
        { on: "arms", w: 0.43, h: 0.12, d: 0.56, y: -0.19, c: 0xe4ded2 },
        { on: "legs", w: 0.25, h: 0.12, d: 0.34, y: -0.06, z: 0.06, c: 0x15171a },
      ],
    },
  },
  {
    id: "agent123", name: "AGENT 123",
    customBuild: "agent",
    agent: {
      head: { w: 1.0, h: 0.9, d: 0.9, c: 0x9280c2 },
      torso: { w: 0.88, h: 0.44, d: 0.72, c: 0x9280c2 },
      arms: { w: 0.26, h: 0.48, d: 0.4, c: 0xe4ded2 },
      legs: { w: 0.25, h: 0.26, d: 0.3, x: 0.2, c: 0x2a2e36 },
      parts: [
        // Cream hat with a nub, tan tuft behind
        { on: "head", w: 0.6, h: 0.38, d: 0.6, x: 0.05, y: 0.64, z: -0.06, c: 0xe4ded2 },
        { on: "head", w: 0.12, h: 0.1, d: 0.12, x: 0.08, y: 0.88, z: -0.06, c: 0xe4ded2 },
        { on: "head", w: 0.18, h: 0.2, d: 0.2, x: -0.36, y: 0.52, z: -0.3, c: 0xba9c78 },
        // Wrap-around black mask with periwinkle eye slits
        { on: "head", w: 1.04, h: 0.5, d: 0.94, x: 0, y: -0.18, z: 0, c: 0x15181a },
        { on: "head", w: 0.24, h: 0.12, d: 0.06, x: -0.27, y: -0.02, front: 0.05, c: 0x96b4fc, glow: 0.55 },
        { on: "head", w: 0.24, h: 0.12, d: 0.06, x: 0.22, y: -0.06, front: 0.05, c: 0x96b4fc, glow: 0.55 },
        // Cream moustache bar over a periwinkle strip
        { on: "head", w: 0.5, h: 0.12, d: 0.06, x: -0.06, y: -0.3, front: 0.05, c: 0x96b4fc, glow: 0.3 },
        { on: "head", w: 0.47, h: 0.17, d: 0.14, x: -0.09, y: -0.33, front: 0.13, c: 0xe4ded2 },
        // Periwinkle chest panel, tan belt, slate hips
        { on: "torso", w: 0.56, h: 0.36, d: 0.06, x: -0.04, y: 0.04, front: 0.02, c: 0x96b4fc, glow: 0.2 },
        { on: "torso", w: 0.9, h: 0.11, d: 0.82, x: 0, y: -0.17, z: 0.02, c: 0xba9c78 },
        { on: "torso", w: 0.52, h: 0.1, d: 0.6, x: 0, y: -0.25, z: 0, c: 0x2a2e36 },
        // Cream arms with tan cuffs, dark boots
        { on: "arms", w: 0.27, h: 0.11, d: 0.41, y: -0.185, c: 0xba9c78 },
        { on: "legs", w: 0.27, h: 0.1, d: 0.32, y: -0.08, c: 0x1c1e24 },
      ],
    },
  },
];

export function buildViber(def) {
  if (def.customBuild === "meta") return buildMetaViber(def);
  if (def.customBuild === "agent") return buildAgentViber(def);
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
    accentMat = M(C.accent, { emissive: C.accent, emissiveIntensity: 0.25 }),
    bootMat = M(C.boot);
  const matByName = { head: headMat, body: bodyMat, arm: armMat, foot: footMat, belt: beltMat, dark: darkMat, visor: visorMat, eye: eyeMat, accent: accentMat, boot: bootMat };
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
  addExtras(def.footExtrasL, legL);
  addExtras(def.footExtrasR, legR);
  addSpikes(def.spikes);
  root.scale.setScalar(0.8);
  return { root, bodyPivot, head, body: bodyMesh, mats, legL, legR, armL, armR, visorMat, eyeMat };
}

// META VIBER chibi build — matches assets/meta/gemini-code-1791997066782.html
// one-to-one: big head on a stubby torso, short arms with cuffs + lime hands,
// short legs with boots, extras in the preview's exact coordinates.
function buildMetaViber(def) {
  const C = def.colors;
  const mats = [];
  function M(color, opts) {
    const m = new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
    mats.push(m);
    return m;
  }
  const headMat = M(C.head), bodyMat = M(C.body), armMat = M(C.arm), footMat = M(C.foot),
    bootMat = M(C.boot);
  // Flat per-colour cache for the numeric extras (same as the HTML preview),
  // with emissive white/lime so the eyes and hands read as bright as the
  // other vibers' face plates under the game lighting.
  const matCache = new Map();
  function getMat(c) {
    if (!matCache.has(c)) {
      let mat;
      if (c === 0xffffff) mat = M(c, { emissive: 0xffffff, emissiveIntensity: 0.55 });
      else if (c === 0xeaff3a) mat = M(c, { emissive: 0xeaff3a, emissiveIntensity: 0.45 });
      else mat = M(c);
      matCache.set(c, mat);
    }
    return matCache.get(c);
  }

  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  bodyPivot.position.y = 0.66;
  root.add(bodyPivot);

  // Torso
  const torso = mkBox(0.62, 0.52, 0.40, bodyMat);
  bodyPivot.add(torso);

  // Head (wider than the torso — the chibi look)
  const head = mkBox(0.76, 0.68, 0.68, headMat);
  head.position.set(0, 0.60, 0);
  bodyPivot.add(head);

  // Arms
  const armL = new THREE.Group();
  armL.position.set(-0.42, 0.14, 0);
  armL.add(mkBox(0.20, 0.24, 0.20, armMat));
  bodyPivot.add(armL);
  const armR = new THREE.Group();
  armR.position.set(0.42, 0.14, 0);
  armR.add(mkBox(0.20, 0.24, 0.20, armMat));
  bodyPivot.add(armR);

  // Legs + boots
  const legL = new THREE.Group();
  legL.position.set(-0.15, 0.40, 0);
  const legMeshL = mkBox(0.22, 0.30, 0.22, footMat);
  legMeshL.position.y = -0.12;
  const bootL = mkBox(0.28, 0.12, 0.34, bootMat);
  bootL.position.set(0, -0.33, 0.04);
  legL.add(legMeshL, bootL);
  root.add(legL);
  const legR = new THREE.Group();
  legR.position.set(0.15, 0.40, 0);
  const legMeshR = mkBox(0.22, 0.30, 0.22, footMat);
  legMeshR.position.y = -0.12;
  const bootR = mkBox(0.28, 0.12, 0.34, bootMat);
  bootR.position.set(0, -0.33, 0.04);
  legR.add(legMeshR, bootR);
  root.add(legR);

  function addExtras(parent, list) {
    if (!list || !list.length) return;
    for (const p of list) {
      const b = mkBox(p.w, p.h, p.d, getMat(p.c));
      b.position.set(p.x || 0, p.y || 0, p.z || 0);
      if (p.rx) b.rotation.x = p.rx; if (p.ry) b.rotation.y = p.ry; if (p.rz) b.rotation.z = p.rz;
      parent.add(b);
    }
  }
  addExtras(head, def.headExtras);
  addExtras(torso, def.bodyExtras);
  addExtras(armL, def.armExtrasL);
  addExtras(armR, def.armExtrasR);

  root.scale.setScalar(0.8);
  return { root, bodyPivot, head, body: torso, mats, legL, legR, armL, armR, visorMat: null, eyeMat: null };
}

// AGENT VIBER build: proportions and parts come straight from the per-robot
// `agent` spec (measured off each cutout PNG). Stacks legs -> torso -> head
// from y = 0, hangs the arms off the torso shoulders, then attaches parts.
// Same return shape as the other builders (walk cycle swings legL/R, armL/R;
// the jetpack anchors on `body`).
function buildAgentViber(def) {
  const S = def.agent;
  const mats = [];
  const matCache = new Map();
  function getMat(c, glow) {
    const key = c + "_" + (glow || 0);
    if (!matCache.has(key)) {
      const opts = { color: c };
      if (glow) {
        opts.emissive = c;
        opts.emissiveIntensity = glow;
      }
      const m = new THREE.MeshLambertMaterial(opts);
      mats.push(m);
      matCache.set(key, m);
    }
    return matCache.get(key);
  }

  const { head: H, torso: T, arms: A, legs: L } = S;
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const legX = L.x ?? 0.2;
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-legX, L.h, 0);
  legR.position.set(legX, L.h, 0);
  for (const leg of [legL, legR]) {
    const m = mkBox(L.w, L.h, L.d, getMat(L.c));
    m.position.y = -L.h / 2;
    leg.add(m);
  }
  root.add(legL, legR);

  const torso = mkBox(T.w, T.h, T.d, getMat(T.c));
  torso.position.y = L.h + T.h / 2;
  bodyPivot.add(torso);

  const head = new THREE.Group();
  head.position.y = L.h + T.h + H.h / 2;
  head.add(mkBox(H.w, H.h, H.d, getMat(H.c)));
  bodyPivot.add(head);

  const armX = T.w / 2 + A.w / 2 + 0.01;
  const shoulderY = L.h + T.h - (A.drop || 0);
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-armX, shoulderY, 0);
  armR.position.set(armX, shoulderY, 0);
  for (const arm of [armL, armR]) {
    const m = mkBox(A.w, A.h, A.d, getMat(A.c));
    m.position.y = -A.h / 2;
    arm.add(m);
  }
  bodyPivot.add(armL, armR);

  // Parent -> { group, depth of its main box, y origin of part coords }.
  const slots = {
    head: { g: head, d: H.d, y0: 0 },
    torso: { g: torso, d: T.d, y0: 0 },
    armL: { g: armL, d: A.d, y0: -A.h / 2 },
    armR: { g: armR, d: A.d, y0: -A.h / 2 },
    legL: { g: legL, d: L.d, y0: -L.h / 2 },
    legR: { g: legR, d: L.d, y0: -L.h / 2 },
  };
  function place(slotName, p, mirror) {
    const slot = slots[slotName];
    const b = mkBox(p.w, p.h, p.d, getMat(p.c, p.glow));
    const z = p.front != null ? slot.d / 2 + p.front - p.d / 2 : p.z || 0;
    b.position.set((p.x || 0) * mirror, slot.y0 + (p.y || 0), z);
    slot.g.add(b);
  }
  for (const p of S.parts || []) {
    if (p.on === "arms") {
      place("armL", p, -1);
      place("armR", p, 1);
    } else if (p.on === "legs") {
      place("legL", p, -1);
      place("legR", p, 1);
    } else if (slots[p.on]) {
      place(p.on, p, 1);
    }
  }

  root.scale.setScalar(0.8);
  return { root, bodyPivot, head, body: torso, mats, legL, legR, armL, armR, visorMat: null, eyeMat: null };
}
