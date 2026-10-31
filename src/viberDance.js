import * as THREE from "three";
import { buildViber, CHARACTERS } from "./vibers.js";

// Same routine the main-menu showcase plays (see animateShowcase in main.js):
// idle breathing, a jump/jump/dance cycle, and a landing squash. Kept in one
// self-contained class so the win screen can replay it without touching the
// menu code.
const SHOWCASE_CYCLE = ["jump", "jump", "dance"];
const HOP_VELOCITY = 5.2;
const HOP_GRAVITY = 18;
const DANCE_TIME = 2.6;
const POP_TIME = 0.3;

const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/**
 * A free-standing, self-animating viber dancer.
 *
 *   const dancer = new ViberDancer({ height: 2.2 });
 *   scene.add(dancer.root);
 *   dancer.setCharacter(0);
 *   dancer.update(elapsedSeconds, dt);
 */
export class ViberDancer {
  constructor({ height = 2.2, yawSway = 0.38 } = {}) {
    this.height = height;
    this.yawSway = yawSway;

    // root (world placement) -> actor (hop + yaw) -> sway -> squash -> model
    this.root = new THREE.Group();
    this.root.name = "viber-dancer";
    this.actor = new THREE.Group();
    this.sway = new THREE.Group();
    this.squash = new THREE.Group();
    this.actor.add(this.sway);
    this.sway.add(this.squash);
    this.root.add(this.actor);

    this.model = null;
    this.mats = [];
    this.characterIndex = -1;

    this.action = "idle";
    this.actionT = 0;
    this.nextActionIn = 1.2;
    this.cycle = 0;
    this.hopY = 0;
    this.hopV = 0;
    this.land = 0;
    this.pop = 0;
    this.opacity = 1;
    this._fading = false;
  }

  /** Build (or rebuild) the model for a CHARACTERS index. */
  setCharacter(index) {
    const idx = Number.isFinite(index) ? index : 0;
    if (idx === this.characterIndex) return;
    this.characterIndex = idx;

    if (this.model) {
      this.squash.remove(this.model.root);
      this._disposeModel();
    }

    const def = CHARACTERS[idx] || CHARACTERS[0];
    const viber = buildViber(def);
    this.model = viber;

    // Normalize height and stand the feet at local y = 0, centred on X/Z.
    const box = new THREE.Box3().setFromObject(viber.root);
    const size = new THREE.Vector3();
    box.getSize(size);
    viber.root.scale.multiplyScalar(this.height / (size.y || 1));
    const b2 = new THREE.Box3().setFromObject(viber.root);
    viber.root.position.set(
      -(b2.min.x + b2.max.x) / 2,
      -b2.min.y,
      -(b2.min.z + b2.max.z) / 2
    );

    this.squash.add(viber.root);
    this.mats = (viber.mats || []).slice();
    this.setOpacity(this.opacity);

    this.pop = POP_TIME;
    this.action = "idle";
    this.actionT = 0;
    this.nextActionIn = 0.9;
    this.cycle = 0;
    this.hopY = 0;
    this.hopV = 0;
    this.land = 0;
  }

  /** 0..1 — used to fade the dancer with the rest of the win scene. */
  setOpacity(alpha) {
    const a = Math.max(0, Math.min(1, alpha));
    this.opacity = a;
    const fade = a < 0.999;
    // Toggling `transparent` recompiles the shader, so only do it on the edge.
    const retoggle = fade !== this._fading;
    this._fading = fade;
    for (const m of this.mats) {
      if (retoggle) {
        m.transparent = fade;
        m.needsUpdate = true;
      }
      m.opacity = a;
    }
    this.root.visible = a > 0.01;
  }

  update(t, dt) {
    if (!this.model) return;
    const s = this;
    s.actionT += dt;

    // Idle base (always on)
    const breath = Math.sin(t * 2.2);
    let scaleY = 1 + 0.025 * breath;
    let scaleXZ = 1 - 0.012 * breath;
    let swayZ = 0.05 * Math.sin(t * 1.3);
    let extraSpin = 0;
    let bounce = 0;
    let armLX = 0.1 * Math.sin(t * 2.2);
    let armRX = -armLX;
    let armLZ = -0.06;
    let armRZ = 0.06;
    let legLX = 0;
    let legRX = 0;
    let headZ = 0.03 * Math.sin(t * 1.3 + 0.6);

    if (s.action === "idle") {
      s.nextActionIn -= dt;
      if (s.nextActionIn <= 0) {
        const next = SHOWCASE_CYCLE[s.cycle % SHOWCASE_CYCLE.length];
        s.cycle++;
        s.actionT = 0;
        s.action = next === "jump" ? "crouch" : next;
      }
    }

    if (s.action === "crouch") {
      const k = Math.min(1, s.actionT / 0.12);
      scaleY *= 1 - 0.14 * k;
      scaleXZ *= 1 + 0.08 * k;
      armLZ = armRZ = 0;
      armLX = armRX = 0.5 * k;
      if (s.actionT >= 0.12) {
        s.action = "air";
        s.actionT = 0;
        s.hopV = HOP_VELOCITY;
      }
    } else if (s.action === "air") {
      s.hopV -= HOP_GRAVITY * dt;
      s.hopY += s.hopV * dt;
      const up = Math.max(0, s.hopV / HOP_VELOCITY);
      scaleY *= 1 + 0.1 * up;
      scaleXZ *= 1 - 0.05 * up;
      armLZ = -2.3;
      armRZ = 2.3;
      legLX = -0.45;
      legRX = 0.45;
      if (s.hopY <= 0 && s.hopV < 0) {
        s.hopY = 0;
        s.hopV = 0;
        s.land = 0.22;
        s.action = "idle";
        s.nextActionIn = 2.2 + Math.random() * 0.8;
      }
    } else if (s.action === "dance") {
      const p = s.actionT / DANCE_TIME;
      const beat = s.actionT * Math.PI * 4;
      bounce = Math.abs(Math.sin(beat)) * 0.12;
      swayZ = 0.16 * Math.sin(beat);
      headZ = 0.14 * Math.sin(beat + 0.5);
      extraSpin = Math.PI * 2 * easeInOut(Math.min(1, Math.max(0, (p - 0.35) / 0.4)));
      if (p < 0.5) {
        armRZ = 2.5 + 0.35 * Math.sin(s.actionT * 14);
        armLZ = -0.3 - 0.25 * Math.sin(beat);
      } else {
        const pump = Math.sin(beat);
        armLZ = -1.6 - 0.8 * pump;
        armRZ = 1.6 - 0.8 * pump;
      }
      legLX = 0.4 * Math.max(0, Math.sin(beat));
      legRX = 0.4 * Math.max(0, -Math.sin(beat));
      if (p >= 1) {
        s.action = "idle";
        s.nextActionIn = 2.0 + Math.random() * 0.8;
      }
    }

    if (s.land > 0) {
      s.land = Math.max(0, s.land - dt);
      const k = s.land / 0.22;
      scaleY *= 1 - 0.2 * k;
      scaleXZ *= 1 + 0.12 * k;
    }

    let pop = 1;
    if (s.pop > 0) {
      s.pop = Math.max(0, s.pop - dt);
      const x = 1 - s.pop / POP_TIME;
      pop = 1 + 0.12 * Math.sin(x * Math.PI) - 0.25 * (1 - x) * (1 - x);
    }

    s.actor.position.y = s.hopY + bounce;
    s.actor.rotation.y = Math.sin(t * 0.7) * s.yawSway + extraSpin;
    s.sway.rotation.z = swayZ;
    s.squash.scale.set(scaleXZ * pop, scaleY * pop, scaleXZ * pop);

    const v = s.model;
    if (v.armL) v.armL.rotation.set(armLX, 0, armLZ);
    if (v.armR) v.armR.rotation.set(armRX, 0, armRZ);
    if (v.legL) v.legL.rotation.x = legLX;
    if (v.legR) v.legR.rotation.x = legRX;
    if (v.head) v.head.rotation.z = headZ;
  }

  _disposeModel() {
    if (!this.model) return;
    this.model.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of list) if (m) m.dispose();
      }
    });
    this.model = null;
    this.mats = [];
  }

  dispose() {
    if (this.root.parent) this.root.parent.remove(this.root);
    this._disposeModel();
  }
}
