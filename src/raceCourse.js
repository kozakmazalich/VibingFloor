import * as THREE from "three";
import { buildProp, buildNeonSlab } from "./props.js";
import { COLORS, RACE_BATTERY_RESPAWN } from "./constants.js";

/**
 * VIBER RACE course builder.
 *
 * One long neon track runs along -Z; the geometry comes entirely from a layout
 * object (src/raceLayouts.js), so each map is a completely separate track:
 *   CYBER SPRINT          the original winding obstacle gauntlet
 *   METEOR ISLANDS        fragmented floating islands over the void
 *   RED LIGHT GREEN LIGHT a short, wide straight corridor
 *
 * Distances are measured as `s` = -z (forward progress from the start line).
 * The course stands in for the battle Island when robots query the floor:
 * getSurfaceAt(x, z) returns { y, platform } for the highest platform under
 * a point, or null over the void / a meteor hole. Moving platforms and spinners
 * come from src/props.js; this module owns platforms, checkpoints, gates and
 * batteries for whichever layout it is given.
 */

// Internal palette for checkpoint tints (track colours come from the layout).
const AC = {
  cyan: COLORS.accentCyan,
  magenta: COLORS.accentMagenta,
  green: 0x39ff14,
};

// ---------------------------------------------------------------------------
// Shared canvas textures
// ---------------------------------------------------------------------------
function textTexture(text, { color = "#00e5ff", w = 512, h = 128, size = 62, bg = "rgba(8,10,24,0.78)" } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
  }
  g.font = `900 ${size}px Orbitron, "JetBrains Mono", monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = color;
  g.shadowBlur = 18;
  g.fillStyle = "#ffffff";
  g.fillText(text, w / 2, h / 2 + 2);
  g.shadowBlur = 0;
  g.fillStyle = color;
  g.globalAlpha = 0.35;
  g.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function checkerTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 32;
  const g = canvas.getContext("2d");
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 4; j++) {
      g.fillStyle = (i + j) % 2 === 0 ? "#ffffff" : "#0a0a14";
      g.fillRect(i * 8, j * 8, 8, 8);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

let glowTex = null;
function getGlowTexture() {
  if (glowTex) return glowTex;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 1, 32, 32, 30);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.4, "rgba(255,255,255,0.45)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(canvas);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

// ---------------------------------------------------------------------------
// Battery pickup (+1 jetpack charge). Geometry/materials are shared by every
// battery; only the group transform and visibility are per-instance.
// ---------------------------------------------------------------------------
const BATTERY_COLOR = 0x00e5ff;
let batteryKit = null;
function getBatteryKit() {
  if (batteryKit) return batteryKit;
  batteryKit = {
    bodyGeo: new THREE.CylinderGeometry(0.17, 0.17, 0.44, 14),
    bandGeo: new THREE.CylinderGeometry(0.182, 0.182, 0.12, 14),
    capGeo: new THREE.CylinderGeometry(0.08, 0.08, 0.08, 10),
    ringGeo: new THREE.RingGeometry(0.3, 0.38, 28),
    bodyMat: new THREE.MeshStandardMaterial({ color: 0x1b2138, metalness: 0.8, roughness: 0.25, emissive: BATTERY_COLOR, emissiveIntensity: 0.25 }),
    bandMat: new THREE.MeshBasicMaterial({ color: BATTERY_COLOR }),
    capMat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    ringMat: new THREE.MeshBasicMaterial({ color: BATTERY_COLOR, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    glowMat: new THREE.SpriteMaterial({ map: getGlowTexture(), color: BATTERY_COLOR, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
  };
  return batteryKit;
}

class Battery {
  constructor(x, y, z, grounded, parent) {
    const kit = getBatteryKit();
    this.x = x;
    this.y = y; // centre height
    this.z = z;
    this.s = -z;
    this.grounded = grounded;
    this.groundY = grounded ? y - 0.75 : null;
    this.collected = false;
    this.respawnT = 0;
    this.phase = Math.random() * Math.PI * 2;

    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    this.spin = new THREE.Group();
    this.group.add(this.spin);
    const body = new THREE.Mesh(kit.bodyGeo, kit.bodyMat);
    const band = new THREE.Mesh(kit.bandGeo, kit.bandMat);
    const cap = new THREE.Mesh(kit.capGeo, kit.capMat);
    cap.position.y = 0.26;
    this.spin.add(body, band, cap);
    this.spin.rotation.z = 0.35;
    const glow = new THREE.Sprite(kit.glowMat);
    glow.scale.setScalar(1.2);
    this.group.add(glow);
    if (grounded) {
      this.ring = new THREE.Mesh(kit.ringGeo, kit.ringMat);
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.y = -0.72;
      this.group.add(this.ring);
    }
    parent.add(this.group);
  }

  update(dt, t) {
    if (this.collected) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        this.collected = false;
        this.group.visible = true;
      }
      return;
    }
    const k = t + this.phase;
    this.spin.position.y = Math.sin(k * 2.4) * 0.1;
    this.spin.rotation.y += dt * 2.2;
    if (this.ring) this.ring.scale.setScalar(1 + Math.sin(k * 3) * 0.12);
  }

  take() {
    this.collected = true;
    this.respawnT = RACE_BATTERY_RESPAWN;
    this.group.visible = false;
  }

  reset() {
    this.collected = false;
    this.respawnT = 0;
    this.group.visible = true;
  }
}

// ---------------------------------------------------------------------------
// The course
// ---------------------------------------------------------------------------
export class RaceCourse {
  constructor(scene, layout) {
    this.scene = scene;
    this.layout = layout;
    this.root = new THREE.Group();
    this.root.name = "viber-race-course";
    scene.add(this.root);

    this.platforms = []; // { x, y, z, w, d, margin, moving? }
    this.props = []; // live props from props.js (update / reset / dispose)
    this.sliders = []; // slider platform records (bot nav targets)
    this.spinners = []; // spinner records
    this.batteries = [];
    this.checkpoints = [];
    this.holes = []; // { x, z, y, r, group, geos, mats } punched by meteors
    this.halfWidth = layout.halfWidth || 5;
    this.checkpointHalf = layout.checkpointHalf ?? this.halfWidth;
    this.finishS = layout.finishS;
    this.finishX = layout.finishX || [-this.halfWidth, this.halfWidth];
    this.bossX = layout.bossX ?? 0;
    this.nav = layout.nav || {};
    this.decideS = layout.decideS || null;
    this.time = 0;

    this._geos = [];
    this._mats = [];
    this._textures = [];
    this._anim = []; // (dt, t) => void decorations

    this.buildPlatforms();
    this.buildMovers();
    this.buildCheckpoints();
    this.buildGates();
    this.buildSigns();
    this.buildScenery();
    for (const [x, s, y] of layout.batteries) {
      const grounded = y == null;
      const surf = grounded ? this.getSurfaceAt(x, -s) : null;
      const by = grounded ? (surf ? surf.y : 0) + 0.75 : y;
      this.batteries.push(new Battery(x, by, -s, grounded, this.root));
    }
  }

  // ---- building -----------------------------------------------------------
  _track(slab) {
    this._geos.push(...slab.geos);
    this._mats.push(...slab.mats);
  }

  addStatic(x0, x1, s0, s1, y, color, margin = 0.15) {
    const w = x1 - x0;
    const d = s1 - s0;
    const x = (x0 + x1) / 2;
    const z = -(s0 + s1) / 2;
    // Raised platforms get a body that reaches back down below the track.
    const slab = buildNeonSlab(w, d, color, { height: y > 0.5 ? y + 0.6 : 0.6 });
    slab.group.position.set(x, y, z);
    this.root.add(slab.group);
    this._track(slab);
    const platform = { x, y, z, w, d, margin, moving: false };
    this.platforms.push(platform);
    return platform;
  }

  addProp(def) {
    const prop = buildProp(def);
    if (!prop) return null;
    this.root.add(prop.group);
    this.props.push(prop);
    if (prop.platform) this.platforms.push(prop.platform);
    if (prop.spinner) this.spinners.push(prop.spinner);
    return prop;
  }

  buildPlatforms() {
    for (const [x0, x1, s0, s1, y, color] of this.layout.staticPlatforms) {
      this.addStatic(x0, x1, s0, s1, y, color);
    }
  }

  buildMovers() {
    for (const def of this.layout.props || []) {
      const prop = this.addProp(def);
      if (prop && def.type === "slider") this.sliders.push(prop.platform);
    }
  }

  buildCheckpoints() {
    const HW = this.checkpointHalf;
    const postGeo = new THREE.BoxGeometry(0.16, 2.3, 0.16);
    const stripGeo = new THREE.PlaneGeometry(HW * 2, 0.32);
    this._geos.push(postGeo, stripGeo);
    this.layout.checkpoints.forEach((s, i) => {
      const cp = { index: i, s, z: -s, x: 0 };
      this.checkpoints.push(cp);
      if (i === 0) return; // the start gate marks checkpoint 0
      const postMat = new THREE.MeshBasicMaterial({ color: AC.cyan });
      const stripMat = new THREE.MeshBasicMaterial({
        color: AC.cyan,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const tex = textTexture(`CHECKPOINT ${i}`, { w: 512, h: 96, size: 46 });
      const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      this._mats.push(postMat, stripMat, labelMat);
      this._textures.push(tex);
      const g = new THREE.Group();
      g.position.set(0, 0, -s);
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(side * (HW + 0.25), 1.15, 0);
        g.add(post);
      }
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.y = 0.012;
      g.add(strip);
      const labelGeo = new THREE.PlaneGeometry(2.6, 0.49);
      this._geos.push(labelGeo);
      const label = new THREE.Mesh(labelGeo, labelMat);
      label.position.set(-(HW + 0.25), 2.65, 0);
      g.add(label);
      this.root.add(g);
      cp.mats = { postMat, stripMat };
      cp.reached = false;
    });
  }

  // Tint a checkpoint green once the PLAYER has activated it.
  markCheckpoint(index) {
    const cp = this.checkpoints[index];
    if (!cp || !cp.mats || cp.reached) return;
    cp.reached = true;
    cp.mats.postMat.color.setHex(AC.green);
    cp.mats.stripMat.color.setHex(AC.green);
    cp.flash = 0.6;
  }

  buildGate(s, x0, x1, text, color, checker) {
    const g = new THREE.Group();
    g.position.set(0, 0, -s);
    const width = x1 - x0;
    const cx = (x0 + x1) / 2;
    const postGeo = new THREE.BoxGeometry(0.42, 4.2, 0.42);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x161b2e, metalness: 0.8, roughness: 0.3, emissive: color, emissiveIntensity: 0.55 });
    const beamGeo = new THREE.BoxGeometry(width + 0.9, 0.9, 0.36);
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x0f1324, metalness: 0.7, roughness: 0.35, emissive: color, emissiveIntensity: 0.2 });
    const tex = textTexture(text, { color: `#${color.toString(16).padStart(6, "0")}`, w: 1024, h: 128, size: 78, bg: null });
    const bannerGeo = new THREE.PlaneGeometry(width * 0.9, (width * 0.9) / 8);
    const bannerMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const stripGeo = new THREE.BoxGeometry(width + 0.9, 0.06, 0.06);
    const stripMat = new THREE.MeshBasicMaterial({ color });
    this._geos.push(postGeo, beamGeo, bannerGeo, stripGeo);
    this._mats.push(postMat, beamMat, bannerMat, stripMat);
    this._textures.push(tex);
    for (const x of [x0 - 0.45, x1 + 0.45]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, 2.1, 0);
      post.castShadow = true;
      g.add(post);
    }
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(cx, 4.2, 0);
    g.add(beam);
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(cx, 4.2, 0.19);
    g.add(banner);
    for (const y of [3.73, 4.67]) {
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.position.set(cx, y, 0.2);
      g.add(strip);
    }
    if (checker) {
      const ctex = checkerTexture();
      ctex.wrapS = THREE.RepeatWrapping;
      ctex.repeat.set(width / 4, 1);
      const lineGeo = new THREE.PlaneGeometry(width, 1.0);
      const lineMat = new THREE.MeshBasicMaterial({ map: ctex, transparent: true, opacity: 0.9, depthWrite: false });
      this._geos.push(lineGeo);
      this._mats.push(lineMat);
      this._textures.push(ctex);
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(cx, 0.014, 0);
      g.add(line);
    }
    this.root.add(g);
    return { group: g, postMat, stripMat };
  }

  buildGates() {
    const L = this.layout;
    const sg = L.startGate;
    this.buildGate(sg.s, sg.x0, sg.x1, sg.label, sg.color, false);
    const fg = L.finishGate;
    const finish = this.buildGate(L.finishS, fg.x0, fg.x1, "\u2691 FINISH \u2691", fg.color, true);
    // Landmark ring behind the finish gate, visible down the whole track.
    const ringCfg = L.ring || { x: 0, y: 4, sOffset: 4 };
    const ringGeo = new THREE.TorusGeometry(8.5, 0.16, 10, 96);
    const ringMat = new THREE.MeshBasicMaterial({ color: ringCfg.color ?? AC.cyan, transparent: true, opacity: 0.85 });
    const ring2Geo = new THREE.TorusGeometry(10.2, 0.08, 8, 96);
    const ring2Mat = new THREE.MeshBasicMaterial({ color: ringCfg.color2 ?? AC.magenta, transparent: true, opacity: 0.6 });
    this._geos.push(ringGeo, ring2Geo);
    this._mats.push(ringMat, ring2Mat);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(ringCfg.x, ringCfg.y, -(L.finishS + ringCfg.sOffset));
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.position.copy(ring.position);
    this.root.add(ring, ring2);
    this._anim.push((dt, t) => {
      ring.rotation.z += dt * 0.4;
      ring2.rotation.z -= dt * 0.25;
      ring2.rotation.y = Math.sin(t * 0.5) * 0.25;
      finish.stripMat.color.setHSL((t * 0.15) % 1, 1, 0.6);
    });
  }

  addSign(text, x, y, s, color, width = 6) {
    const tex = textTexture(text, { color: `#${color.toString(16).padStart(6, "0")}`, w: 1024, h: 160, size: 70 });
    const geo = new THREE.PlaneGeometry(width, width * (160 / 1024));
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this._geos.push(geo);
    this._mats.push(mat);
    this._textures.push(tex);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, -s);
    this.root.add(mesh);
    const base = y;
    const ph = Math.random() * 6;
    this._anim.push((dt, t) => {
      mesh.position.y = base + Math.sin(t * 1.6 + ph) * 0.08;
      mat.opacity = 0.82 + 0.18 * Math.sin(t * 4 + ph);
    });
    return mesh;
  }

  buildSigns() {
    for (const s of this.layout.signs || []) {
      this.addSign(s.text, s.x, s.y, s.s, s.color, s.width);
    }
  }

  // Cheap atmosphere: neon pylons along the track and a dark skyline.
  // Both are single InstancedMeshes (2 draw calls total).
  buildScenery() {
    const L = this.layout;
    const sc = L.scenery;
    const accentAt = L.accentAt || (() => AC.cyan);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    const pylonGeo = new THREE.BoxGeometry(0.18, 1, 0.18);
    const pylonMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pylonSpots = [];
    for (let s = sc.pylonStartS; s <= sc.pylonEndS; s += sc.pylonStep) {
      pylonSpots.push([sc.pylonLeft, s]);
      pylonSpots.push([sc.pylonRight, s + 4.5]);
    }
    const pylons = new THREE.InstancedMesh(pylonGeo, pylonMat, pylonSpots.length);
    pylonSpots.forEach(([x, s], i) => {
      const h = 3 + ((i * 37) % 7) * 0.6;
      dummy.position.set(x, -2.5 + h / 2, -s);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      pylons.setMatrixAt(i, dummy.matrix);
      pylons.setColorAt(i, color.setHex(accentAt(s)));
    });
    pylons.instanceMatrix.needsUpdate = true;
    if (pylons.instanceColor) pylons.instanceColor.needsUpdate = true;
    this.root.add(pylons);

    const towerGeo = new THREE.BoxGeometry(1, 1, 1);
    const towerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true });
    const towerCount = sc.towerCount;
    const [spreadMin, spreadMax] = sc.towerSpread;
    const [sMin, sMax] = sc.towerS;
    const towers = new THREE.InstancedMesh(towerGeo, towerMat, towerCount);
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < towerCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (spreadMin + rnd() * (spreadMax - spreadMin)) + (side > 0 ? 4 : 0);
      const s = sMin + rnd() * (sMax - sMin);
      const w = 3 + rnd() * 5;
      const h = 10 + rnd() * 26;
      dummy.position.set(x, -18 + h / 2, -s);
      dummy.scale.set(w, h, 3 + rnd() * 5);
      dummy.updateMatrix();
      towers.setMatrixAt(i, dummy.matrix);
      const tint = accentAt(s);
      color.setHex(tint).multiplyScalar(0.07 + rnd() * 0.06);
      towers.setColorAt(i, color);
    }
    towers.instanceMatrix.needsUpdate = true;
    if (towers.instanceColor) towers.instanceColor.needsUpdate = true;
    this.root.add(towers);

    this._geos.push(pylonGeo, towerGeo);
    this._mats.push(pylonMat, towerMat);
    this._instanced = [pylons, towers];
  }

  // ---- queries -------------------------------------------------------------
  // Highest platform top under (x, z), or null over the void / a meteor hole.
  getSurfaceAt(x, z) {
    let best = null;
    for (const p of this.platforms) {
      if (Math.abs(x - p.x) <= p.w / 2 + p.margin && Math.abs(z - p.z) <= p.d / 2 + p.margin) {
        if (!p.moving && this._isHole(x, z, p.y)) continue; // meteors punched through the floor
        if (!best || p.y > best.y) best = { y: p.y, platform: p };
      }
    }
    return best;
  }

  // Same query `t` seconds in the future (moving platforms extrapolated).
  surfaceAtFuture(x, z, t) {
    let best = null;
    for (const p of this.platforms) {
      let px = p.x;
      let py = p.y;
      let pz = p.z;
      if (p.moving) {
        const f = p.at(t);
        px = f.x;
        py = f.y;
        pz = f.z;
      } else if (this._isHole(x, z, p.y)) {
        continue; // a static floor hole stays a hole
      }
      if (Math.abs(x - px) <= p.w / 2 + p.margin && Math.abs(z - pz) <= p.d / 2 + p.margin) {
        if (!best || py > best.y) best = { y: py, platform: p };
      }
    }
    return best;
  }

  // Moving platform a grounded robot at (x, y, z) is standing on, if any.
  movingPlatformUnder(x, y, z) {
    const s = this.getSurfaceAt(x, z);
    if (!s || !s.platform.moving) return null;
    return Math.abs(s.y - y) < 0.2 ? s.platform : null;
  }

  // First uncollected battery overlapping a robot body centre.
  batteryAt(x, cy, z) {
    for (const b of this.batteries) {
      if (b.collected) continue;
      if (Math.abs(b.y - cy) > 1.0) continue;
      if (Math.hypot(b.x - x, b.z - z) <= 0.9) return b;
    }
    return null;
  }

  // ---- meteor holes --------------------------------------------------------
  // Punch a circular hole through the static surface at (x, z, y). Returns true
  // when a hole was carved (false on moving platforms, voids or overlaps).
  addHole(x, z, y, r, color = 0xff7a1a) {
    for (const h of this.holes) {
      if (Math.abs(h.y - y) < 0.6 && Math.hypot(h.x - x, h.z - z) < h.r * 0.7) return false;
    }
    const discGeo = new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x050508,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.set(x, y + 0.025, z);

    const rimGeo = new THREE.RingGeometry(r * 0.9, r * 1.04, 28).rotateX(-Math.PI / 2);
    const rimMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.set(x, y + 0.035, z);

    const group = new THREE.Group();
    group.add(disc, rim);
    this.root.add(group);
    this.holes.push({ x, z, y, r, group, geos: [discGeo, rimGeo], mats: [discMat, rimMat] });
    return true;
  }

  clearHoles() {
    for (const h of this.holes) {
      this.root.remove(h.group);
      for (const g of h.geos) g.dispose();
      for (const m of h.mats) m.dispose();
    }
    this.holes = [];
  }

  _isHole(x, z, y) {
    if (this.holes.length === 0) return false;
    for (const h of this.holes) {
      if (Math.abs(h.y - y) > 0.6) continue;
      const dx = x - h.x;
      const dz = z - h.z;
      if (dx * dx + dz * dz < h.r * h.r) return true;
    }
    return false;
  }

  // ---- lifecycle -----------------------------------------------------------
  update(dt) {
    this.time += dt;
    for (const prop of this.props) prop.update(dt);
    for (const b of this.batteries) b.update(dt, this.time);
    for (const fn of this._anim) fn(dt, this.time);
    for (const cp of this.checkpoints) {
      if (!cp.mats) continue;
      if (cp.flash > 0) {
        cp.flash = Math.max(0, cp.flash - dt);
        cp.mats.stripMat.opacity = 0.55 + cp.flash;
      } else {
        cp.mats.stripMat.opacity = 0.42 + 0.14 * Math.sin(this.time * 3 + cp.index);
      }
    }
  }

  reset() {
    this.time = 0;
    this.clearHoles(); // a fresh race restores the meteored floor
    for (const prop of this.props) if (prop.reset) prop.reset();
    for (const b of this.batteries) b.reset();
    for (const cp of this.checkpoints) {
      if (!cp.mats) continue;
      cp.reached = false;
      cp.flash = 0;
      cp.mats.postMat.color.setHex(AC.cyan);
      cp.mats.stripMat.color.setHex(AC.cyan);
    }
  }

  dispose() {
    this.clearHoles();
    this.scene.remove(this.root);
    for (const prop of this.props) if (prop.dispose) prop.dispose();
    for (const inst of this._instanced || []) inst.dispose();
    for (const g of this._geos) g.dispose();
    for (const m of this._mats) m.dispose();
    for (const t of this._textures) t.dispose();
    this.props = [];
    this.platforms = [];
    this.spinners = [];
    this.sliders = [];
    this.batteries = [];
    this._anim = [];
  }
}
