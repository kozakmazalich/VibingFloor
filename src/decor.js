import * as THREE from "three";

/**
 * Low-poly neon arena decorations (palms, crystals, antennas, lamps, rocks).
 * Geometries and materials are shared across instances for GPU efficiency.
 */

const geos = {};
const mats = {};

function geo(key, make) {
  if (!geos[key]) geos[key] = make();
  return geos[key];
}

function mat(key, make) {
  if (!mats[key]) mats[key] = make();
  return mats[key];
}

function colorMat(hex, opts = {}) {
  return mat(
    `c_${hex.toString(16)}_${JSON.stringify(opts)}`,
    () => new THREE.MeshStandardMaterial(Object.assign({ color: hex, roughness: 0.4, metalness: 0.3 }, opts))
  );
}

function emissiveMat(hex, intensity = 1.6) {
  return mat(`e_${hex.toString(16)}_${intensity}`, () =>
    new THREE.MeshStandardMaterial({
      color: 0x101418,
      roughness: 0.2,
      metalness: 0.6,
      emissive: hex,
      emissiveIntensity: intensity,
    })
  );
}

// Stylized glowing palm: dark trunk + radiating emissive fronds + red apples
function buildPalm(color) {
  const g = new THREE.Group();

  const trunk = new THREE.Mesh(
    geo("trunk", () => new THREE.CylinderGeometry(0.07, 0.12, 0.9, 7)),
    colorMat(0x2a2018)
  );
  trunk.position.y = 0.45;
  g.add(trunk);

  const frondGeo = geo("frond", () => new THREE.ConeGeometry(0.42, 0.8, 5));
  const frondMat = emissiveMat(color, 1.2);
  for (let i = 0; i < 6; i++) {
    const frond = new THREE.Mesh(frondGeo, frondMat);
    const a = (i / 6) * Math.PI * 2;
    frond.position.set(Math.cos(a) * 0.16, 0.95, Math.sin(a) * 0.16);
    frond.rotation.z = Math.cos(a) * 0.85;
    frond.rotation.x = -Math.sin(a) * 0.85;
    g.add(frond);
  }

  // Red apples hanging under the crown
  const appleGeo = geo("apple", () => new THREE.SphereGeometry(0.085, 8, 8));
  const appleMat = emissiveMat(0xff2a2a, 1.3);
  const appleStemGeo = geo("appleStem", () => new THREE.CylinderGeometry(0.012, 0.012, 0.07, 5));
  const appleStemMat = colorMat(0x3a2416);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.35;
    const apple = new THREE.Mesh(appleGeo, appleMat);
    apple.position.set(Math.cos(a) * 0.4, 0.62 + (i % 2) * 0.22, Math.sin(a) * 0.4);
    g.add(apple);
    const stem = new THREE.Mesh(appleStemGeo, appleStemMat);
    stem.position.set(Math.cos(a) * 0.4, apple.position.y + 0.1, Math.sin(a) * 0.4);
    g.add(stem);
  }

  const crown = new THREE.Mesh(
    geo("crown", () => new THREE.SphereGeometry(0.09, 6, 6)),
    emissiveMat(color, 1.8)
  );
  crown.position.y = 0.95;
  g.add(crown);

  return g;
}

// Cluster of glowing octahedron crystals
function buildCrystal(color) {
  const g = new THREE.Group();
  const crystalGeo = geo("crystal", () => new THREE.OctahedronGeometry(0.22, 0));
  const m = emissiveMat(color, 1.8);

  const defs = [
    { p: [0, 0.28, 0], s: 1.2 },
    { p: [0.27, 0.1, 0.12], s: 0.7, r: 0.6 },
    { p: [-0.25, 0.08, -0.14], s: 0.6, r: -0.8 },
  ];
  for (const d of defs) {
    const c = new THREE.Mesh(crystalGeo, m);
    c.position.set(d.p[0], d.p[1], d.p[2]);
    c.scale.setScalar(d.s);
    if (d.r) c.rotation.y = d.r;
    g.add(c);
  }
  return g;
}

// Radio antenna mast with a glowing tip beacon
function buildAntenna(color) {
  const g = new THREE.Group();

  const pole = new THREE.Mesh(
    geo("pole", () => new THREE.CylinderGeometry(0.035, 0.05, 1.3, 6)),
    colorMat(0x1a2030, { metalness: 0.9, roughness: 0.3 })
  );
  pole.position.y = 0.65;
  g.add(pole);

  const tip = new THREE.Mesh(
    geo("tip", () => new THREE.SphereGeometry(0.09, 8, 8)),
    emissiveMat(color, 2.2)
  );
  tip.position.y = 1.34;
  g.add(tip);

  const ring = new THREE.Mesh(
    geo("antRing", () => new THREE.TorusGeometry(0.14, 0.03, 6, 12)),
    emissiveMat(color, 1.4)
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.05;
  g.add(ring);

  return g;
}

// Boulder pair
function buildRock() {
  const g = new THREE.Group();
  const m = colorMat(0x23283a, { roughness: 0.9, metalness: 0.1 });

  const r1 = new THREE.Mesh(geo("rock1", () => new THREE.DodecahedronGeometry(0.2, 0)), m);
  r1.position.set(0.05, 0.14, 0.03);
  r1.scale.set(1, 0.8, 1);
  g.add(r1);

  const r2 = new THREE.Mesh(geo("rock2", () => new THREE.DodecahedronGeometry(0.13, 0)), m);
  r2.position.set(-0.18, 0.07, -0.05);
  g.add(r2);

  return g;
}

// Tall citadel keep: stacked dark blocks, glowing windows, neon roof and beacon
function buildCitadel(color) {
  const g = new THREE.Group();
  const stoneMat = colorMat(0x1a2038, { metalness: 0.7, roughness: 0.35 });
  const windowMat = emissiveMat(color, 1.7);
  const roofMat = emissiveMat(color, 1.6);

  const mkBox = (w, h, d, y, mat) => {
    const b = new THREE.Mesh(geo(`citBox_${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d)), mat);
    b.position.y = y;
    g.add(b);
    return b;
  };

  mkBox(1.15, 1.1, 1.15, 0.55, stoneMat); // base
  mkBox(0.9, 1.35, 0.9, 1.78, stoneMat); // keep
  mkBox(0.62, 0.85, 0.62, 2.88, stoneMat); // upper
  mkBox(0.75, 0.16, 0.75, 3.4, stoneMat); // parapet

  // Glowing windows on each side of the keep
  const winGeo = geo("citWindow", () => new THREE.BoxGeometry(0.09, 0.34, 0.07));
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(winGeo, windowMat);
    const a = (i / 4) * Math.PI * 2;
    w.position.set(Math.cos(a) * 0.48, 1.78, Math.sin(a) * 0.48);
    w.rotation.y = -a;
    g.add(w);
    const w2 = new THREE.Mesh(winGeo, windowMat);
    w2.position.set(Math.cos(a) * 0.34, 2.88, Math.sin(a) * 0.34);
    w2.rotation.y = -a;
    g.add(w2);
  }

  // Neon pyramid roof + beacon
  const roof = new THREE.Mesh(
    geo("citRoof", () => new THREE.ConeGeometry(0.52, 0.85, 4)),
    roofMat
  );
  roof.position.y = 3.88;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);

  const beacon = new THREE.Mesh(
    geo("citBeacon", () => new THREE.SphereGeometry(0.12, 8, 8)),
    emissiveMat(0xffffff, 2.2)
  );
  beacon.position.y = 4.45;
  g.add(beacon);

  return g;
}

// Neon bollard lamp
function buildLamp(color) {
  const g = new THREE.Group();

  const pole = new THREE.Mesh(
    geo("lampPole", () => new THREE.CylinderGeometry(0.04, 0.06, 0.55, 6)),
    colorMat(0x1a2030, { metalness: 0.9, roughness: 0.3 })
  );
  pole.position.y = 0.275;
  g.add(pole);

  const head = new THREE.Mesh(
    geo("lampHead", () => new THREE.BoxGeometry(0.22, 0.22, 0.22)),
    emissiveMat(color, 2.0)
  );
  head.position.y = 0.62;
  head.rotation.y = Math.PI / 4;
  g.add(head);

  return g;
}

// Low glowing fern bush
function buildFern(color) {
  const g = new THREE.Group();
  const m = emissiveMat(color, 0.9);
  const coneGeo = geo("fern", () => new THREE.ConeGeometry(0.18, 0.42, 6));

  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(coneGeo, m);
    c.position.set(Math.cos(i * 2.1) * 0.09, 0.14, Math.sin(i * 2.1) * 0.09);
    c.scale.setScalar(0.7 + (i % 2) * 0.45);
    g.add(c);
  }
  return g;
}

/**
 * Build a decoration group from a map's decor definition.
 * @param {{type: string, color?: number}} def
 */
export function buildDecor(def) {
  if (!def || !def.type) return null;
  const color = def.color || 0x00e5ff;
  switch (def.type) {
    case "palm":
      return buildPalm(color);
    case "citadel":
      return buildCitadel(color);
    case "crystal":
      return buildCrystal(color);
    case "antenna":
      return buildAntenna(color);
    case "lamp":
      return buildLamp(color);
    case "fern":
      return buildFern(color);
    case "rock":
      return buildRock();
    default:
      return null;
  }
}
