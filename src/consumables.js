/**
 * Consumable power-up pickups for Vibing Floor.
 *
 * Jetpack and Quake share ONE item slot and fire with Q. A jetpack has five
 * charges; a quake is one slam. Each round spawns a few pods on walkable tiles
 * that cannot shrink. A pod disappears if its tile falls. Icons are the
 * existing PNGs (assets/Jetpack.png, assets/Quake.png) with a neon glow.
 */

import * as THREE from "three";
import { ROBOT_RADIUS, CONSUMABLE_COUNT } from "./constants.js";

export const CONSUMABLE_TYPES = {
  jetpack: { color: 0x00e5ff, label: "JETPACK", icon: "assets/Jetpack.png" },
  quake: { color: 0xff2d95, label: "QUAKE", icon: "assets/Quake.png" },
};

export const CONSUMABLE_COLLECT_RADIUS = ROBOT_RADIUS + 0.45;

// A shared sprite texture cache (keyed by URL) so repeated pickups are cheap.
const textureCache = new Map();
function loadSprite(url) {
  if (textureCache.has(url)) return textureCache.get(url);
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(url, tex);
  return tex;
}

class ConsumablePickup {
  constructor(kind, tile, scene) {
    this.kind = kind; // "jetpack" | "quake"
    this.tile = tile;
    this.collected = false;
    const x = tile.worldX;
    const z = tile.worldZ;
    const y = tile.surfaceY + 0.02;
    this.pos = new THREE.Vector3(x, y, z);
    this.phase = Math.random() * Math.PI * 2;
    this.scene = scene;
    const meta = CONSUMABLE_TYPES[kind];

    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    this.group.userData.consumable = true;
    this.group.userData.consumableKind = kind;

    // Floating sprite icon (the PNG) + soft neon glow behind it
    const tex = loadSprite(meta.icon);
    this.spriteMat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    });
    this.icon = new THREE.Sprite(this.spriteMat);
    this.icon.scale.set(0.9, 0.9, 0.9);
    this.icon.position.y = 1.0;
    this.group.add(this.icon);

    // Soft radial glow (a tinted, additive sprite behind the icon)
    this.glowMat = new THREE.SpriteMaterial({
      color: meta.color,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glow = new THREE.Sprite(this.glowMat);
    this.glow.scale.set(1.4, 1.4, 1.4);
    this.glow.position.y = 1.0;
    this.group.add(this.glow);

    // Ground ring beacon
    const ringGeo = new THREE.RingGeometry(0.32, 0.4, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: meta.color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(ringGeo, ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.04;
    this.group.add(this.ring);

    scene.add(this.group);
  }

  update(dt, now) {
    if (this.collected) return;
    // The floor under this pod fell, cracked, or left the walkable set.
    if (this.tile && !this.tile.isWalkable()) {
      this.collect();
      return;
    }
    const t = now * 0.001 + this.phase;
    this.icon.position.y = 1.0 + Math.sin(t * 2.2) * 0.14;
    this.glow.position.y = this.icon.position.y;
    // Gentle sway + pulse
    this.icon.material.rotation += dt * 0.8;
    this.glow.material.opacity = 0.35 + 0.2 * Math.sin(t * 3.0);
    this.ring.scale.setScalar(1.0 + Math.sin(t * 3.0) * 0.15);
  }

  collect() {
    this.collected = true;
    this.dispose();
  }

  dispose() {
    if (this.group.parent) this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.spriteMat.dispose();
    this.glowMat.dispose();
  }
}

export class ConsumableManager {
  constructor(scene) {
    this.scene = scene;
    this.pods = [];
    this.count = CONSUMABLE_COUNT; // total pods to spawn per round
  }

  spawn(island, avoidPoints = []) {
    this.clear();

    const candidates = [];
    for (const tile of island.allTiles) {
      if (!tile || !tile.isIdle()) continue;
      // Rim tiles are the ones that shrink. Never drop a pod on one.
      if (island.isRimTile(tile.gx, tile.gz)) continue;
      let blocked = false;
      for (const p of avoidPoints) {
        if (Math.hypot(tile.worldX - p.x, tile.worldZ - p.z) < 4.5) {
          blocked = true;
          break;
        }
      }
      if (!blocked) candidates.push(tile);
    }

    // Alternate jetpack / quake. Count is CONSUMABLE_COUNT (a few per round).
    const kinds = [];
    for (let i = 0; i < this.count; i++) {
      kinds.push(i % 2 === 0 ? "jetpack" : "quake");
    }

    for (const kind of kinds) {
      if (candidates.length === 0) break;
      const idx = Math.floor(Math.random() * candidates.length);
      const tile = candidates.splice(idx, 1)[0];
      const pod = new ConsumablePickup(kind, tile, this.scene);
      this.pods.push(pod);
    }
  }

  update(dt, now) {
    for (const p of this.pods) p.update(dt, now);
  }

  // The pod a robot overlaps, if any uncollected.
  at(x, z) {
    for (const p of this.pods) {
      if (p.collected) continue;
      if (Math.hypot(p.pos.x - x, p.pos.z - z) <= CONSUMABLE_COLLECT_RADIUS) return p;
    }
    return null;
  }

  // Nearest uncollected pod (for CPU bots to path toward).
  nearest(x, z, kind) {
    let best = null;
    let bestD = Infinity;
    for (const p of this.pods) {
      if (p.collected) continue;
      if (kind && p.kind !== kind) continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  get active() {
    return this.pods.filter((p) => !p.collected);
  }

  clear() {
    for (const p of this.pods) p.dispose();
    this.pods = [];
  }
}
