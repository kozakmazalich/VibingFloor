/**
 * Weapon pickups for Vibing Floor.
 *
 * Fighters start each round UNARMED (push + jump + dash only). Two drop pods
 * spawn on random walkable tiles: a SPEAR (E) and a GRENADE (G). Stepping onto
 * one permanently equips that weapon for the round (until elimination).
 *
 * These are pure scene objects managed by the Game (not the Robot): the Game
 * owns their placement, animation and collection, and hands the reference list
 * to robots so CPU bots can path toward unclaimed pickups.
 */

import * as THREE from "three";
import { ROBOT_RADIUS } from "./constants.js";

// Pickup kinds and their neon identity
export const PICKUP_TYPES = {
  spear: { color: 0xc0c0c0, label: "SPEAR", key: "E" },
  grenade: { color: 0xff5c1a, label: "GRENADE", key: "G" },
};

// Weapon pickup colours. The grenade is hot orange; the spear's silver tint is
// set inline below (spear = #C0C0C0 chrome, grenade = orange).
const GRENADE_COLOR = 0xff5c1a;
export const COLLECT_RADIUS = ROBOT_RADIUS + 0.42; // generous overlap for pickup

// One floating holographic pickup
class Pickup {
  constructor(kind, x, z, y, scene) {
    this.kind = kind; // "spear" | "grenade"
    this.collected = false;
    this.pos = new THREE.Vector3(x, y, z);
    this.phase = Math.random() * Math.PI * 2; // offset the bob/spin
    this.scene = scene;

    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    this.group.userData.pickup = true;
    this.group.userData.pickupKind = kind;

    const isGrenade = kind === "grenade";
    // Spear = silver #C0C0C0; grenade = hot orange. The spear uses a NEUTRAL
    // silver beacon (not cyan) so it reads as pure chrome with no blue glow.
    const SPEAR_COLOR = 0xc0c0c0;
    const color = isGrenade ? GRENADE_COLOR : SPEAR_COLOR;

    // Holographic beacon column (vertical light shaft)
    const shaftGeo = new THREE.CylinderGeometry(0.08, 0.2, 1.6, 12, 1, true);
    const shaftMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: isGrenade ? 0.55 : 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.shaft = new THREE.Mesh(shaftGeo, shaftMat);
    this.shaft.position.y = 0.8;
    this.group.add(this.shaft);

    // The floating weapon icon
    if (isGrenade) {
      const bodyGeo = new THREE.SphereGeometry(0.22, 16, 16);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.9,
        roughness: 0.2,
        emissive: color,
        emissiveIntensity: 2.4,
      });
      this.icon = new THREE.Mesh(bodyGeo, bodyMat);
      const capGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10);
      const capMat = new THREE.MeshStandardMaterial({
        color: 0x0b1020,
        metalness: 0.8,
        roughness: 0.3,
        emissive: color,
        emissiveIntensity: 1.4,
      });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = 0.26;
      this.icon.add(cap);
    } else {
      // Spear: CHROME silver. MeshPhongMaterial with a bright white specular
      // highlight gives a polished-metal look even under the arena's simple
      // lighting (no env-map needed). A slight emissive tint keeps it from
      // going too dark while retaining shiny chrome speculars.
      const chrome = () =>
        new THREE.MeshPhongMaterial({
          color: 0xc8c8c8,
          specular: 0xffffff,
          shininess: 120,
          emissive: 0x2a2a2a,
        });
      const shaftGeo2 = new THREE.CylinderGeometry(0.06, 0.08, 1.0, 16);
      const shaftMat2 = chrome();
      this.icon = new THREE.Mesh(shaftGeo2, shaftMat2);
      // Faceted spearhead with a sharper specular
      const tipGeo = new THREE.ConeGeometry(0.16, 0.36, 4);
      const tipMat = new THREE.MeshPhongMaterial({
        color: 0xf0f0f0,
        specular: 0xffffff,
        shininess: 200,
        emissive: 0x222222,
      });
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.y = 0.64;
      tip.rotation.y = Math.PI / 4;
      this.icon.add(tip);
      // Cross-guard, slightly darker silver for definition
      const guardGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.32, 8);
      const guardMat = chrome();
      const guard = new THREE.Mesh(guardGeo, guardMat);
      guard.position.y = 0.36;
      guard.rotation.z = Math.PI / 2;
      this.icon.add(guard);
    }
    this.icon.position.y = 1.0;
    this.group.add(this.icon);

    // Ground ring beacon
    const ringGeo = new THREE.RingGeometry(0.34, 0.42, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
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
    const t = now * 0.001 + this.phase;
    this.icon.position.y = 1.0 + Math.sin(t * 2.2) * 0.12;
    this.icon.rotation.y += dt * 2.4;
    this.ring.scale.setScalar(1.0 + Math.sin(t * 3.0) * 0.18);
    this.ring.material.opacity = 0.65 + 0.35 * Math.sin(t * 3.0);
    this.shaft.material.opacity = 0.4 + 0.25 * Math.sin(t * 2.2);
  }

  collect() {
    this.collected = true;
    if (this.group.parent) this.scene.remove(this.group);
    this.dispose();
  }

  dispose() {
    if (this.group.parent) this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}

export class PickupManager {
  constructor(scene) {
    this.scene = scene;
    this.pickups = [];
    this.spearCount = 1; // how many spear pickups to spawn per round
    this.grenadeCount = 1; // how many grenade pickups to spawn per round
  }

  // Spawn pickups on distinct random walkable tiles, avoiding the given
  // spawn points so fighters don't instantly grab them at match start.
  spawn(island, avoidPoints = []) {
    this.clear();

    const candidates = [];
    for (const tile of island.allTiles) {
      if (!tile || !tile.isIdle()) continue; // only fully-idle tiles
      let blocked = false;
      for (const p of avoidPoints) {
        if (Math.hypot(tile.worldX - p.x, tile.worldZ - p.z) < 4.5) {
          blocked = true;
          break;
        }
      }
      if (!blocked) candidates.push(tile);
    }

    const kinds = [];
    for (let i = 0; i < this.spearCount; i++) kinds.push("spear");
    for (let i = 0; i < this.grenadeCount; i++) kinds.push("grenade");

    for (const kind of kinds) {
      if (candidates.length === 0) break;
      const idx = Math.floor(Math.random() * candidates.length);
      const tile = candidates.splice(idx, 1)[0];
      const p = new Pickup(kind, tile.worldX, tile.worldZ, tile.surfaceY + 0.02, this.scene);
      this.pickups.push(p);
    }
  }

  update(dt, now) {
    for (const p of this.pickups) p.update(dt, now);
  }

  // Return the pickup a robot is overlapping (world x/z), if any uncollected.
  pickupAt(x, z) {
    for (const p of this.pickups) {
      if (p.collected) continue;
      if (Math.hypot(p.pos.x - x, p.pos.z - z) <= COLLECT_RADIUS) return p;
    }
    return null;
  }

  // Uncollected pickup nearest to a position — for CPU bots to home in on.
  nearest(x, z, kind) {
    let best = null;
    let bestD = Infinity;
    for (const p of this.pickups) {
      if (p.collected) continue;
      if (kind && p.kind !== kind) continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  // Uncollected pickups in original order (for AI pathing).
  get active() {
    return this.pickups.filter((p) => !p.collected);
  }

  clear() {
    for (const p of this.pickups) p.dispose();
    this.pickups = [];
  }
}
