import * as THREE from "three";
import { buildProp, buildNeonSlab } from "./props.js";
import { COLORS, RACE_BATTERY_RESPAWN } from "./constants.js";
import { preloadHalloweenAssets } from "./halloweenAssets.js";

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
function textTexture(text, { color = "#00e5ff", w = 512, h = 128, size = 62, bg = "rgba(8,10,24,0.78)", blur = 18 } = {}) {
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
  g.shadowBlur = blur;
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
// Halloween carved-face texture (canvas, cached). The 3D pumpkin itself comes
// from assets/halloween/models; this decal makes the carved face glow on top.
// Only built when the spooky race theme is on.
// ---------------------------------------------------------------------------
let halFaceTex = null;
function getHalloweenFaceTexture() {
  if (halFaceTex) return halFaceTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = "#ffcf5c";
  g.shadowColor = "#ff8a00";
  g.shadowBlur = 16;
  // eyes
  g.beginPath(); g.moveTo(30, 50); g.lineTo(54, 34); g.lineTo(54, 60); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(98, 50); g.lineTo(74, 34); g.lineTo(74, 60); g.closePath(); g.fill();
  // jagged mouth
  g.beginPath();
  g.moveTo(32, 80); g.lineTo(46, 96); g.lineTo(56, 80); g.lineTo(66, 98);
  g.lineTo(78, 80); g.lineTo(96, 84); g.lineTo(92, 102); g.lineTo(36, 102);
  g.closePath(); g.fill();
  halFaceTex = new THREE.CanvasTexture(c);
  halFaceTex.colorSpace = THREE.SRGBColorSpace;
  return halFaceTex;
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
  constructor(scene, layout, opts = {}) {
    this.scene = scene;
    this.layout = layout;
    this.halloween = !!opts.halloween;
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
    this._alive = true;
    this._pumpkinMat = null;
    this._pumpkins = [];
    this._shards = null; // pooled pumpkin shards (built on first smash)
    this._drifters = []; // drifting bat / ghost props

    this.buildPlatforms();
    this.buildMovers();
    this.buildCheckpoints();
    this.buildGates();
    this.buildSigns();
    this.buildScenery();
    if (this.halloween) this.buildHalloweenDecor();
    for (const [x, s, y] of layout.batteries) {
      const grounded = y == null;
      const surf = grounded ? this.getSurfaceAt(x, -s) : null;
      const by = grounded ? (surf ? surf.y : 0) + 0.75 : y;
      this.batteries.push(new Battery(x, by, -s, grounded, this.root));
    }
  }

  // Halloween palette remap: cyan/magenta edges become witch purple / pumpkin
  // orange, keeping the neon glow. No-op for the plain neon theme.
  _col(c) {
    if (!this.halloween) return c;
    switch (c) {
      case COLORS.accentCyan:
        return 0x7b2ff7; // witch purple
      case COLORS.accentMagenta:
        return 0xff6a00; // pumpkin orange
      case COLORS.tileWarning:
        return 0xff6a00;
      case 0xa855f7:
        return 0x7b2ff7;
      case 0xffd700:
        return 0xff6a00;
      case 0x39ff14:
        return 0xa020f0; // spooky purple for green edges
      default:
        return c;
    }
  }

  // Checkpoint "reached" tint (distinct from the active colour).
  _reachedColor() {
    return this.halloween ? 0xff6a00 : AC.green;
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
    const slab = buildNeonSlab(w, d, this._col(color), { height: y > 0.5 ? y + 0.6 : 0.6 });
    slab.group.position.set(x, y, z);
    this.root.add(slab.group);
    this._track(slab);
    const platform = { x, y, z, w, d, margin, moving: false };
    this.platforms.push(platform);
    return platform;
  }

  addProp(def) {
    const themed = this.halloween && def && def.color != null ? { ...def, color: this._col(def.color) } : def;
    const prop = buildProp(themed);
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
      const cpColor = this._col(AC.cyan);
      const postMat = new THREE.MeshBasicMaterial({ color: cpColor });
      const stripMat = new THREE.MeshBasicMaterial({
        color: cpColor,
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

  // Tint a checkpoint once the PLAYER has activated it.
  markCheckpoint(index) {
    const cp = this.checkpoints[index];
    if (!cp || !cp.mats || cp.reached) return;
    cp.reached = true;
    const reached = this._reachedColor();
    cp.mats.postMat.color.setHex(reached);
    cp.mats.stripMat.color.setHex(reached);
    cp.flash = 0.6;
  }

  buildGate(s, x0, x1, text, color, checker) {
    const g = new THREE.Group();
    g.position.set(0, 0, -s);
    const width = x1 - x0;
    const cx = (x0 + x1) / 2;
    const bannerW = width * 0.9;
    const bannerH = bannerW / 8;
    // The finish gate is a white nameplate: keep its own glow low so the banner
    // stays the brightest element and the letters never wash out in the bloom.
    const postGlow = checker ? 0.3 : 0.55;
    const beamGlow = checker ? 0.1 : 0.2;
    const postGeo = new THREE.BoxGeometry(0.42, 4.2, 0.42);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x161b2e, metalness: 0.8, roughness: 0.3, emissive: color, emissiveIntensity: postGlow });
    const beamGeo = new THREE.BoxGeometry(width + 0.9, bannerH + 0.2, 0.36);
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x0f1324, metalness: 0.7, roughness: 0.35, emissive: color, emissiveIntensity: beamGlow });
    const tex = textTexture(text, { color: `#${color.toString(16).padStart(6, "0")}`, w: 1024, h: 128, size: 78, bg: null, blur: 7 });
    const bannerGeo = new THREE.PlaneGeometry(bannerW, bannerH);
    const bannerMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    // Opaque dark nameplate between the glowing beam and the text. Without it
    // the beam's glow bled straight through the transparent glyph area.
    const plateGeo = new THREE.BoxGeometry(bannerW + 0.16, bannerH + 0.08, 0.08);
    const plateMat = new THREE.MeshBasicMaterial({ color: 0x05060f });
    const stripGeo = new THREE.BoxGeometry(width + 0.9, 0.06, 0.06);
    const stripMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    this._geos.push(postGeo, beamGeo, bannerGeo, plateGeo, stripGeo);
    this._mats.push(postMat, beamMat, bannerMat, plateMat, stripMat);
    this._textures.push(tex);
    for (const x of [x0 - 0.45, x1 + 0.45]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, 2.1, 0);
      post.castShadow = true;
      g.add(post);
    }
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(cx, 4.2, -0.06);
    g.add(beam);
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.set(cx, 4.2, 0.14);
    g.add(plate);
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(cx, 4.2, 0.2);
    g.add(banner);
    // Neon edging sits just OUTSIDE the banner, hugging the beam's edges, so it
    // frames the text instead of glowing across it.
    for (const y of [4.2 - bannerH / 2 - 0.09, 4.2 + bannerH / 2 + 0.09]) {
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
    this.buildGate(sg.s, sg.x0, sg.x1, sg.label, this._col(sg.color), false);
    const fg = L.finishGate;
    const finish = this.buildGate(L.finishS, fg.x0, fg.x1, "\u2691 FINISH \u2691", this._col(fg.color), true);
    // Landmark ring behind the finish gate, visible down the whole track.
    const ringCfg = L.ring || { x: 0, y: 4, sOffset: 4 };
    const ringGeo = new THREE.TorusGeometry(8.5, 0.16, 10, 96);
    const ringMat = new THREE.MeshBasicMaterial({ color: this._col(ringCfg.color ?? AC.cyan), transparent: true, opacity: 0.85 });
    const ring2Geo = new THREE.TorusGeometry(10.2, 0.08, 8, 96);
    const ring2Mat = new THREE.MeshBasicMaterial({ color: this._col(ringCfg.color2 ?? AC.magenta), transparent: true, opacity: 0.6 });
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
      finish.stripMat.color.setHSL((t * 0.15) % 1, 1, 0.55);
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
      this.addSign(s.text, s.x, s.y, s.s, this._col(s.color), s.width);
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
      pylons.setColorAt(i, color.setHex(this._col(accentAt(s))));
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
      const tint = this._col(accentAt(s));
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

  // ---- Halloween decorations ---------------------------------------------
  // The 3D props (pumpkins, bats, ghosts) come from assets/halloween/models
  // and are cloned in once the kit has loaded. Until then the track simply has
  // no spooky props — the race itself never waits on decoration.
  buildHalloweenDecor() {
    const half = this.halfWidth;
    const finishS = this.finishS;

    // Cobweb decal material (PNG from the generated kit).
    preloadHalloweenAssets().then((assets) => {
      if (!this._alive || !assets) return;
      this._buildCobwebs(assets, half, finishS);
      this._buildPumpkins(assets, half, finishS);
      this._buildDrifters(assets, half, finishS);
    });
  }

  _buildCobwebs(assets, half, finishS) {
    if (!assets.textures.cobweb) return;
    const webGeo = new THREE.PlaneGeometry(2.6, 2.6);
    const webMat = new THREE.MeshBasicMaterial({
      map: assets.textures.cobweb,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
      color: 0xcbb6ff,
    });
    this._geos.push(webGeo);
    this._mats.push(webMat);

    for (let s = 12; s < finishS - 6; s += 22) {
      const side = Math.floor(s / 22) % 2 === 0 ? -1 : 1;
      const x = side * (half - 0.9);
      const surf = this.getSurfaceAt(x, -s);
      if (!surf) continue;
      const web = new THREE.Mesh(webGeo, webMat);
      web.rotation.x = -Math.PI / 2;
      // Corner sits on the platform edge, web spills inward.
      web.rotation.z = side < 0 ? -Math.PI / 2 : Math.PI / 2;
      web.position.set(x, surf.y + 0.035, -s);
      this.root.add(web);
    }
  }

  _buildPumpkins(assets, half, finishS) {
    if (!assets.models.pumpkin) return;

    const bodyMat = assets.materials.Pumpkin_Orange_PBR;
    const faceMat = assets.materials.Face_Glow_Emissive;
    this._pumpkinMat = bodyMat || null;
    this._pumpkinFaceMat = faceMat || null;

    const faceGeo = new THREE.PlaneGeometry(0.62, 0.62);
    const decalMat = new THREE.MeshBasicMaterial({
      map: getHalloweenFaceTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this._geos.push(faceGeo);
    this._mats.push(decalMat);

    const spots = [];
    for (let s = 8; s < finishS - 4; s += 15) {
      spots.push([-(half - 1.1), s]);
      spots.push([half - 1.1, s + 7]);
    }

    let lights = 0;
    spots.forEach(([x, s], i) => {
      const surf = this.getSurfaceAt(x, -s);
      if (!surf) return;
      const g = assets.models.pumpkin.clone(true);
      const baseRot = x < 0 ? Math.PI / 2 : -Math.PI / 2; // face the track centre
      g.position.set(x, surf.y, -s);
      g.rotation.y = baseRot;
      g.scale.setScalar(0.9 + ((i * 13) % 5) * 0.1);

      // Glowing carved face on the track-facing side.
      const face = new THREE.Mesh(faceGeo, decalMat);
      face.position.set(0, 0.55, 0.52);
      g.add(face);

      // A few warm pools of light — capped so the scene stays cheap.
      let pumpkinLight = null;
      if (lights < 3 && i % 7 === 3) {
        pumpkinLight = new THREE.PointLight(0xff6a00, 4.2, 6.5, 2);
        pumpkinLight.position.set(0, 0.75, 0.25);
        g.add(pumpkinLight);
        lights++;
      }

      this.root.add(g);
      this._pumpkins.push({
        group: g,
        light: pumpkinLight,
        lightIntensity: pumpkinLight ? pumpkinLight.intensity : 0,
        baseY: surf.y,
        baseRot,
        phase: Math.random() * 6.283,
        x,
        z: -s,
        y: surf.y,
        radius: 0.46 * g.scale.x + 0.2,
        broken: false,
      });
    });
  }

  _buildDrifters(assets, half, finishS) {
    const hasBat = !!assets.models.bat;
    const hasGhost = !!assets.models.ghost;
    if (!hasBat && !hasGhost) return;

    // Eight drifters: enough to sell the Halloween skyline without paying for
    // a dozen HD props every frame (they are decorative, not gameplay).
    for (let i = 0; i < 8; i++) {
      const wantGhost = i % 2 === 0;
      const isGhost = wantGhost ? hasGhost : false;
      if (!isGhost && !hasBat) continue;

      const template = isGhost ? assets.models.ghost : assets.models.bat;
      const node = template.clone(true);
      const s = 6 + Math.random() * Math.max(10, finishS - 12);
      const bx = (Math.random() - 0.5) * (half * 2 + 6);
      const by = isGhost ? 1.8 + Math.random() * 2.6 : 3.0 + Math.random() * 2.6;
      const sc = isGhost ? 0.9 + Math.random() * 0.5 : 0.8 + Math.random() * 0.5;
      node.position.set(bx, by, -s);
      node.scale.setScalar(sc);

      const body = node.getObjectByName("body") || null;
      this.root.add(node);
      this._drifters.push({
        obj: node,
        isGhost,
        body,
        bodyBaseY: body ? body.position.y : 0,
        wingL: node.getObjectByName("wingL") || null,
        wingR: node.getObjectByName("wingR") || null,
        bx,
        by,
        bz: -s,
        ampX: 1.5 + Math.random() * 2.5,
        ampY: 0.4 + Math.random() * 0.8,
        speed: 0.3 + Math.random() * 0.5,
        phase: Math.random() * 6.283,
        yaw: (Math.random() - 0.5) * 0.7,
      });
    }
  }

  _updateHalloween(dt) {
    const t = this.time;
    if (this._pumpkinMat) {
      this._pumpkinMat.emissiveIntensity = 0.8 + 0.3 * Math.sin(t * 3.2);
    }
    if (this._pumpkinFaceMat) {
      this._pumpkinFaceMat.emissiveIntensity = 1.15 + 0.3 * Math.sin(t * 3.2 + 0.8);
    }
    for (const p of this._pumpkins) {
      if (p.broken) continue;
      p.group.position.y = p.baseY + Math.sin(t * 2.0 + p.phase) * 0.05;
      p.group.rotation.y = p.baseRot + Math.sin(t * 0.9 + p.phase) * 0.07;
    }
    for (const d of this._drifters) {
      const wobble = Math.sin(t * d.speed + d.phase);
      d.obj.position.x = d.bx + wobble * d.ampX;
      d.obj.position.y = d.by + Math.sin(t * d.speed * 1.7 + d.phase) * d.ampY;
      d.obj.position.z = d.bz + Math.cos(t * d.speed + d.phase) * 2.0;

      if (d.isGhost) {
        // Gentle hover + tail/body sway.
        if (d.body) {
          d.body.position.y = d.bodyBaseY + Math.sin(t * 2.8 + d.phase) * 0.18;
          d.body.rotation.z = Math.sin(t * 2.0 + d.phase) * 0.08;
        }
        d.obj.rotation.y = d.yaw + wobble * 0.18;
      } else {
        // Wing flap on both Z and Y, plus a soft body bob.
        const flap = Math.sin(t * 9.0 + d.phase) * 0.38;
        if (d.wingL) {
          d.wingL.rotation.z = -flap;
          d.wingL.rotation.y = -flap;
        }
        if (d.wingR) {
          d.wingR.rotation.z = flap;
          d.wingR.rotation.y = flap;
        }
        if (d.body) {
          d.body.position.y = d.bodyBaseY + Math.sin(t * 4.5 + d.phase) * 0.12;
        }
        d.obj.rotation.y = d.yaw + wobble * 0.25;
        d.obj.rotation.z = Math.sin(t * 2.1 + d.phase) * 0.12;
      }
    }
  }

  // ---- breakable pumpkins ---------------------------------------------------
  // A racer that runs into a jack-o'-lantern smashes it: the pumpkin disappears
  // and its shards fly out, tumble and fade. Purely cosmetic — no knockback.
  checkPumpkins(racers, fx) {
    if (!this._pumpkins.length || !racers) return;
    for (const p of this._pumpkins) {
      if (p.broken) continue;
      const reach = p.radius + 0.34;
      const reachSq = reach * reach;
      for (const rc of racers) {
        const robot = rc && rc.robot ? rc.robot : rc;
        const pos = robot && robot.pos;
        if (!pos) continue;
        if (robot.state && robot.state !== "alive") continue;
        const dx = pos.x - p.x;
        const dz = pos.z - p.z;
        if (dx * dx + dz * dz > reachSq) continue;
        if (Math.abs(pos.y - p.y) > 1.7) continue;
        this._smashPumpkin(p, fx);
        break;
      }
    }
  }

  _ensureShardPool() {
    if (this._shards && this._shards.length) return;
    const geo = new THREE.TetrahedronGeometry(0.14, 0);
    this._geos.push(geo);
    this._shards = [];
    for (let i = 0; i < 14; i++) {
      const glow = i % 4 === 0; // a few glowing "face" bits
      const mat = new THREE.MeshStandardMaterial({
        color: glow ? 0xffcf5c : 0xff6a00,
        emissive: glow ? 0xffa53a : 0x7a2a00,
        emissiveIntensity: glow ? 1.7 : 0.55,
        roughness: 0.5,
        metalness: 0.05,
        flatShading: true,
        transparent: true,
        opacity: 1,
      });
      this._mats.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.root.add(mesh);
      this._shards.push({
        mesh,
        mat,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        life: 0,
        maxLife: 1,
        floorY: 0,
      });
    }
  }

  _smashPumpkin(p, fx) {
    p.broken = true;
    // Hide the pumpkin's meshes but keep the group (and any point light) alive:
    // dropping a light changes the scene's light count, which makes three.js
    // recompile every lit material mid-race — a visible freeze right when you
    // run into a pumpkin. Zeroing the intensity keeps the count constant.
    p.group.traverse((o) => {
      if (o.isMesh) o.visible = false;
    });
    if (p.light) p.light.intensity = 0;

    if (fx) {
      fx.spawnSparkBurst(p.x, p.y + 0.45, p.z, 16, 0xff6a00, 1.1);
      fx.spawnImpactFlash(p.x, p.y + 0.4, p.z);
    }

    this._ensureShardPool();
    for (const s of this._shards) {
      if (s.life > 0) continue;
      const a = Math.random() * Math.PI * 2;
      const speed = 1.1 + Math.random() * 2.1;
      s.mesh.position.set(
        p.x + (Math.random() - 0.5) * 0.34,
        p.y + 0.3 + Math.random() * 0.5,
        p.z + (Math.random() - 0.5) * 0.34
      );
      s.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      s.mesh.visible = true;
      s.mat.opacity = 1;
      s.vx = Math.cos(a) * speed;
      s.vz = Math.sin(a) * speed;
      s.vy = 2.2 + Math.random() * 2.6;
      s.rx = (Math.random() - 0.5) * 12;
      s.ry = (Math.random() - 0.5) * 12;
      s.rz = (Math.random() - 0.5) * 12;
      s.life = 0.85 + Math.random() * 0.45;
      s.maxLife = s.life;
      s.floorY = p.y;
    }
  }

  _updateShards(dt) {
    if (!this._shards) return;
    for (const s of this._shards) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.life = 0;
        s.mesh.visible = false;
        continue;
      }
      s.vy -= 15 * dt;
      const pos = s.mesh.position;
      pos.x += s.vx * dt;
      pos.y += s.vy * dt;
      pos.z += s.vz * dt;
      if (pos.y < s.floorY + 0.06 && s.vy < 0) {
        pos.y = s.floorY + 0.06;
        s.vy *= -0.34; // small bounce, then it settles
        s.vx *= 0.6;
        s.vz *= 0.6;
      }
      s.mesh.rotation.x += s.rx * dt;
      s.mesh.rotation.y += s.ry * dt;
      s.mesh.rotation.z += s.rz * dt;
      s.mat.opacity = Math.min(1, (s.life / s.maxLife) * 2.4);
    }
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
    if (this.halloween) this._updateHalloween(dt);
    this._updateShards(dt);
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
    for (const p of this._pumpkins) {
      p.broken = false;
      p.group.visible = true;
      p.group.traverse((o) => {
        if (o.isMesh) o.visible = true;
      });
      if (p.light) p.light.intensity = p.lightIntensity;
    }
    if (this._shards) {
      for (const s of this._shards) {
        s.life = 0;
        s.mesh.visible = false;
      }
    }
    for (const prop of this.props) if (prop.reset) prop.reset();
    for (const b of this.batteries) b.reset();
    for (const cp of this.checkpoints) {
      if (!cp.mats) continue;
      cp.reached = false;
      cp.flash = 0;
      const base = this._col(AC.cyan);
      cp.mats.postMat.color.setHex(base);
      cp.mats.stripMat.color.setHex(base);
    }
  }

  dispose() {
    this._alive = false;
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
    this._pumpkins = [];
    this._drifters = [];
    this._shards = null;
    this.sliders = [];
    this.batteries = [];
    this._anim = [];
  }
}
