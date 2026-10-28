import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TILE_SPACING, COLORS } from "./constants.js";

/**
 * Animated arena props (map decorations that move).
 * Attached per-map via `props: [...]` in src/maps.js and driven by Island.
 * Elevator / orb are purely visual: robots do not collide with them.
 *
 * The VIBER RACE course also builds its moving obstacles here:
 *   slider / lift / piston -> `platform` record (walkable, carries riders)
 *   spinner                -> `spinner` record (sweeping knockback bar)
 * The race course reads those records for collision; the props only own
 * their meshes and motion.
 */

function disposeAll(list) {
  for (const item of list) {
    try {
      item.dispose();
    } catch {
      /* ignore */
    }
  }
}

/** Map a prop definition to a live prop object: { group, update, dispose }. */
export function buildProp(def) {
  if (!def || !def.type) return null;
  switch (def.type) {
    case "elevator":
      return buildElevator(def);
    case "orb":
      return buildOrb(def);
    case "slider":
    case "lift":
    case "piston":
      return buildMovingPlatform(def);
    case "spinner":
      return buildSpinner(def);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Neon slab: the arena tile look (dark body, gridded faceplate, glowing rim,
// underglow) stretched to any footprint. Origin = centre of the TOP face.
// ---------------------------------------------------------------------------
let slabGridTexture = null;
function getSlabGridTexture() {
  if (slabGridTexture) return slabGridTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  g.fillStyle = "rgb(30,36,64)";
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = "rgb(44,52,90)";
  g.fillRect(9, 9, 110, 110);
  g.strokeStyle = "rgb(255,255,255)";
  g.lineWidth = 4;
  g.strokeRect(2, 2, 124, 124);
  g.fillStyle = "rgb(210,210,210)";
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const px = 64 + Math.cos(a) * 9;
    const py = 64 + Math.sin(a) * 9;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fill();
  slabGridTexture = new THREE.CanvasTexture(canvas);
  slabGridTexture.wrapS = THREE.RepeatWrapping;
  slabGridTexture.wrapT = THREE.RepeatWrapping;
  slabGridTexture.colorSpace = THREE.SRGBColorSpace;
  slabGridTexture.anisotropy = 4;
  return slabGridTexture;
}

/**
 * Build a walkable neon slab of w x d (world units). One cell of the grid
 * texture = one arena tile, so long platforms read as rows of tiles.
 * Returns { group, geos, mats, rimMat, topMat, underMat }.
 */
export function buildNeonSlab(w, d, color = COLORS.tileEdge, opts = {}) {
  const height = opts.height ?? 0.6;
  const geos = [];
  const mats = [];
  const group = new THREE.Group();

  const baseGeo = new THREE.BoxGeometry(w, height, d);
  const baseMat = new THREE.MeshStandardMaterial({
    color: COLORS.tileBase,
    roughness: 0.65,
    metalness: 0.45,
    emissive: color,
    emissiveIntensity: 0.04,
  });
  geos.push(baseGeo);
  mats.push(baseMat);
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = -height / 2 - 0.01;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const topGeo = new THREE.PlaneGeometry(w, d);
  const uv = topGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) * w) / TILE_SPACING, (uv.getY(i) * d) / TILE_SPACING);
  }
  uv.needsUpdate = true;
  const grid = getSlabGridTexture();
  const topMat = new THREE.MeshStandardMaterial({
    color: 0x5a6699,
    map: grid,
    roughness: 0.3,
    metalness: 0.6,
    emissive: color,
    emissiveMap: grid,
    emissiveIntensity: 0.55,
  });
  geos.push(topGeo);
  mats.push(topMat);
  const top = new THREE.Mesh(topGeo, topMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.002;
  top.receiveShadow = true;
  group.add(top);

  // Glowing rim: four thin bars merged into one draw call.
  const t = 0.08;
  const rh = 0.07;
  const parts = [
    new THREE.BoxGeometry(w + t, rh, t).translate(0, 0, d / 2),
    new THREE.BoxGeometry(w + t, rh, t).translate(0, 0, -d / 2),
    new THREE.BoxGeometry(t, rh, d + t).translate(w / 2, 0, 0),
    new THREE.BoxGeometry(t, rh, d + t).translate(-w / 2, 0, 0),
  ];
  const rimGeo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const rimMat = new THREE.MeshBasicMaterial({ color });
  geos.push(rimGeo);
  mats.push(rimMat);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.position.y = -0.01;
  group.add(rim);

  const underGeo = new THREE.PlaneGeometry(w * 0.92, d * 0.92);
  const underMat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  geos.push(underGeo);
  mats.push(underMat);
  const under = new THREE.Mesh(underGeo, underMat);
  under.rotation.x = Math.PI / 2;
  under.position.y = -height - 0.05;
  group.add(under);

  return { group, geos, mats, rimMat, topMat, underMat };
}

// Moving walkable platform.
//   slider: oscillates along x (or z) -> carries riders sideways
//   lift:   oscillates between yMin and yMax on an energy pillar
//   piston: like lift, but with a tall body so it reads as a rising column
// def: { x, y, z, w, d, axis, amp, speed, phase, yMin, yMax, color, margin }
function buildMovingPlatform(def) {
  const w = def.w ?? 3;
  const d = def.d ?? 3;
  const color = def.color ?? 0xffd700;
  const vertical = def.type !== "slider";
  const axis = vertical ? "y" : def.axis || "x";
  let baseY = def.y ?? 0;
  let amp = def.amp ?? 2;
  if (vertical && def.yMin != null && def.yMax != null) {
    baseY = (def.yMin + def.yMax) / 2;
    amp = (def.yMax - def.yMin) / 2;
  }
  const speed = def.speed ?? 1;
  const phase = def.phase ?? 0;
  const bx = def.x ?? 0;
  const bz = def.z ?? 0;

  const slab = buildNeonSlab(w, d, color, {
    height: def.type === "piston" ? 0.6 + amp * 2 + 0.4 : 0.45,
  });
  const { group, geos, mats } = slab;

  if (def.type === "lift") {
    const pillarGeo = new THREE.CylinderGeometry(w * 0.28, w * 0.55, 3.2, 6, 1, true);
    const pillarMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    geos.push(pillarGeo);
    mats.push(pillarMat);
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = -2.1;
    group.add(pillar);
  } else if (def.type === "slider") {
    // Thruster pods on both sliding ends sell the motion.
    const podGeo = new THREE.BoxGeometry(0.16, 0.26, d * 0.7);
    const podMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    geos.push(podGeo);
    mats.push(podMat);
    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(podGeo, podMat);
      pod.position.set(side * (w / 2 + 0.1), -0.22, 0);
      group.add(pod);
    }
  }

  let t = 0;
  const platform = {
    kind: def.type,
    moving: true,
    x: bx,
    y: baseY,
    z: bz,
    w,
    d,
    margin: def.margin ?? 0.15,
    dx: 0,
    dy: 0,
    dz: 0,
    // Position `tOffset` seconds from now (bots use it to time jumps).
    at(tOffset) {
      const o = Math.sin((t + tOffset) * speed + phase) * amp;
      return {
        x: bx + (axis === "x" ? o : 0),
        y: baseY + (axis === "y" ? o : 0),
        z: bz + (axis === "z" ? o : 0),
      };
    },
  };
  const place = () => {
    const p = platform.at(0);
    platform.dx = p.x - platform.x;
    platform.dy = p.y - platform.y;
    platform.dz = p.z - platform.z;
    platform.x = p.x;
    platform.y = p.y;
    platform.z = p.z;
    group.position.set(p.x, p.y, p.z);
  };
  place();
  platform.dx = platform.dy = platform.dz = 0;

  return {
    group,
    platform,
    update(dt) {
      t += dt;
      place();
    },
    reset() {
      t = 0;
      place();
      platform.dx = platform.dy = platform.dz = 0;
    },
    dispose() {
      disposeAll(geos);
      disposeAll(mats);
    },
  };
}

// Spinning sweeper bar on a hub pillar. Bar direction in XZ is
// (cos angle, sin angle); the mesh uses rotation.y = -angle for that.
// def: { x, y, z, radius, speed, phase, color }
function buildSpinner(def) {
  const geos = [];
  const mats = [];
  const group = new THREE.Group();
  const color = def.color ?? COLORS.accentMagenta;
  const radius = def.radius ?? 4.5;
  const speed = def.speed ?? 1.6;
  const phase = def.phase ?? 0;
  const barY = 0.55;
  const barHalf = 0.17;
  group.position.set(def.x ?? 0, def.y ?? 0, def.z ?? 0);

  const hubGeo = new THREE.CylinderGeometry(0.42, 0.55, 1.25, 16);
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0x161b2e,
    metalness: 0.8,
    roughness: 0.3,
    emissive: color,
    emissiveIntensity: 0.35,
  });
  geos.push(hubGeo);
  mats.push(hubMat);
  const hub = new THREE.Mesh(hubGeo, hubMat);
  hub.position.y = 0.62;
  hub.castShadow = true;
  group.add(hub);

  const arm = new THREE.Group();
  arm.position.y = barY;
  group.add(arm);

  const barGeo = new THREE.BoxGeometry(radius * 2, barHalf * 2, barHalf * 2);
  const barMat = new THREE.MeshStandardMaterial({
    color: 0x22283f,
    metalness: 0.7,
    roughness: 0.25,
    emissive: color,
    emissiveIntensity: 1.1,
  });
  geos.push(barGeo);
  mats.push(barMat);
  const bar = new THREE.Mesh(barGeo, barMat);
  bar.castShadow = true;
  arm.add(bar);

  const stripeGeo = new THREE.BoxGeometry(radius * 2 - 0.2, 0.05, 0.12);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  geos.push(stripeGeo);
  mats.push(stripeMat);
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.position.y = barHalf + 0.02;
  arm.add(stripe);

  const capGeo = new THREE.BoxGeometry(0.3, 0.46, 0.46);
  const capMat = new THREE.MeshBasicMaterial({ color: COLORS.tileWarning });
  geos.push(capGeo);
  mats.push(capMat);
  for (const side of [-1, 1]) {
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.x = side * (radius - 0.12);
    arm.add(cap);
  }

  // Danger disc on the floor: where the bar sweeps.
  const ringGeo = new THREE.RingGeometry(radius - 0.09, radius + 0.03, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  geos.push(ringGeo);
  mats.push(ringMat);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(ring);

  const discGeo = new THREE.CircleGeometry(radius, 48);
  const discMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  geos.push(discGeo);
  mats.push(discMat);
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.025;
  group.add(disc);

  let t = 0;
  const spinner = {
    x: group.position.x,
    y: group.position.y,
    z: group.position.z,
    radius,
    speed,
    angle: phase,
    barY,
    barHalf,
    hubRadius: 0.55,
    angleAt(tOffset) {
      return phase + (t + tOffset) * speed;
    },
  };
  const place = () => {
    spinner.angle = phase + t * speed;
    arm.rotation.y = -spinner.angle;
  };
  place();

  return {
    group,
    spinner,
    update(dt) {
      t += dt;
      place();
      ringMat.opacity = 0.3 + 0.12 * Math.sin(t * 5);
    },
    reset() {
      t = 0;
      place();
    },
    dispose() {
      disposeAll(geos);
      disposeAll(mats);
    },
  };
}

// Hexagonal energy plate that rides up and down on a light pillar
function buildElevator(def) {
  const geos = [];
  const mats = [];
  const group = new THREE.Group();
  const color = def.color ?? 0x00e5ff;

  const plateGeo = new THREE.CylinderGeometry(1.15, 1.32, 0.22, 6);
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x141a2e,
    metalness: 0.75,
    roughness: 0.3,
    emissive: color,
    emissiveIntensity: 0.5,
  });
  geos.push(plateGeo);
  mats.push(plateMat);
  const plate = new THREE.Mesh(plateGeo, plateMat);
  group.add(plate);

  const ringGeo = new THREE.TorusGeometry(1.45, 0.07, 8, 48);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  geos.push(ringGeo);
  mats.push(ringMat);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.17;
  group.add(ring);

  // Faint energy pillar below the plate
  const pillarGeo = new THREE.CylinderGeometry(0.45, 1.55, 3.4, 6, 1, true);
  const pillarMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  geos.push(pillarGeo);
  mats.push(pillarMat);
  const pillar = new THREE.Mesh(pillarGeo, pillarMat);
  pillar.position.y = -1.8;
  group.add(pillar);

  const beaconGeo = new THREE.SphereGeometry(0.17, 10, 10);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
  });
  geos.push(beaconGeo);
  mats.push(beaconMat);
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.y = 0.46;
  group.add(beacon);

  const yMin = def.yMin ?? 3.3;
  const yMax = def.yMax ?? 5.3;
  const mid = (yMin + yMax) / 2;
  const amp = (yMax - yMin) / 2;
  const speed = def.speed ?? 0.9;
  let t = Math.random() * Math.PI * 2;
  group.position.set(def.x ?? 0, mid, def.z ?? 0);

  return {
    group,
    update(dt) {
      t += dt * speed;
      group.position.y = mid + Math.sin(t) * amp;
      plate.rotation.y += dt * 0.35;
      ring.rotation.z += dt * 0.7;
      beaconMat.opacity = 0.65 + 0.35 * Math.sin(t * 2.2);
    },
    dispose() {
      disposeAll(geos);
      disposeAll(mats);
    },
  };
}

// Floating glowing orb with rotating halos (hovers + bobs)
function buildOrb(def) {
  const geos = [];
  const mats = [];
  const group = new THREE.Group();
  const color = def.color ?? 0xb46bff;

  const coreGeo = new THREE.SphereGeometry(0.85, 24, 24);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x141226,
    metalness: 0.4,
    roughness: 0.25,
    emissive: color,
    emissiveIntensity: 1.5,
  });
  geos.push(coreGeo);
  mats.push(coreMat);
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  const haloGeo = new THREE.TorusGeometry(1.3, 0.05, 8, 48);
  const haloMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
  geos.push(haloGeo);
  mats.push(haloMat);
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.rotation.x = Math.PI / 2.4;
  group.add(halo);
  const halo2 = new THREE.Mesh(haloGeo, haloMat);
  halo2.scale.setScalar(1.55);
  halo2.rotation.x = Math.PI / 1.55;
  group.add(halo2);

  const yBase = def.yBase ?? 5.0;
  const bobAmp = def.bobAmp ?? 0.5;
  let t = Math.random() * Math.PI * 2;
  group.position.set(def.x ?? 0, yBase, def.z ?? 0);

  return {
    group,
    update(dt) {
      t += dt;
      group.position.y = yBase + Math.sin(t * 1.2) * bobAmp;
      core.rotation.y += dt * 0.7;
      halo.rotation.z += dt * 0.5;
      halo2.rotation.z -= dt * 0.35;
    },
    dispose() {
      disposeAll(geos);
      disposeAll(mats);
    },
  };
}
