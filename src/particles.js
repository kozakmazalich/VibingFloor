import * as THREE from "three";
import { COLORS } from "./constants.js";
import { audio } from "./audio.js";

/**
 * Lightweight particle & projectile FX manager for Vibing Floor
 * Highly optimized for 60 FPS on fanless M1 Mac
 */
export class FXManager {
  constructor(scene) {
    this.scene = scene;

    // Active projectiles
    this.projectiles = []; // Thrown grenades
    this.spears = []; // Flying spears

    // Active particle systems
    this.sparkBursts = [];
    this.shockwaves = [];
    this.spikeBursts = []; // CHOG VIBER push quill rings

    // Stable ids so online host/guest can reference the same FX
    this._seq = 0;
  }

  nextId() {
    return ++this._seq;
  }

  // Spawn an expanding fiery/neon shockwave sphere on grenade explosion
  spawnExplosionShockwave(x, y, z, colorHex = 0xff3b30, maxRadius = 2.4) {
    const geo = new THREE.SphereGeometry(0.3, 16, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.9,
      wireframe: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 0.1, z);
    this.scene.add(mesh);

    this.shockwaves.push({
      mesh,
      mat,
      geo,
      maxRadius,
      duration: 0.28,
      elapsed: 0,
    });
  }

  // Jump thruster downward spark plume
  spawnJumpThruster(x, y, z, colorHex = 0x00f0ff) {
    this.spawnSparkBurst(x, y, z, 14, colorHex, 0.7);
  }

  // Ground landing ring shockwave
  spawnLandingRing(x, y, z, colorHex = 0x00f0ff) {
    const geo = new THREE.RingGeometry(0.2, 0.45, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.03, z);
    this.scene.add(mesh);
    this.shockwaves.push({
      mesh,
      mat,
      geo,
      maxRadius: 1.3,
      duration: 0.22,
      elapsed: 0,
    });
  }

  // Spawn quick directional or radial sparks (for spear hits, explosions, tile breaks)
  spawnSparkBurst(x, y, z, count = 18, colorHex = 0x00f0ff, speedMul = 1.0) {
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y + 0.2;
      positions[i * 3 + 2] = z;

      const angle = Math.random() * Math.PI * 2;
      const elevation = (Math.random() - 0.2) * 1.5;
      const spd = (3.5 + Math.random() * 5.0) * speedMul;

      velocities.push({
        vx: Math.cos(angle) * spd,
        vy: (elevation + 1.2) * spd * 0.7,
        vz: Math.sin(angle) * spd,
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: colorHex,
      size: 0.2,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geo, mat);
    this.scene.add(points);

    this.sparkBursts.push({
      points,
      geo,
      mat,
      velocities,
      count,
      duration: 0.35,
      elapsed: 0,
    });
  }

  // Guest-side visual-only grenade: flies the same arc and explodes with FX,
  // but has NO gameplay effect (tile damage / knockback are synced by the
  // host via authoritative snapshots). onBoom(x, z) lets the guest collapse
  // the tiles LOCALLY at detonation for an instant visual (the authoritative
  // tile deltas arrive right after and are idempotent).
  spawnNetGrenade({ id, x, y, z, tx, ty, tz, ft, color = 0x00e5ff, onBoom = null }) {
    const geo = new THREE.SphereGeometry(0.22, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.9,
      roughness: 0.2,
      emissive: color,
      emissiveIntensity: 2.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);
    this.addProjectile({
      id,
      mesh,
      geo,
      mat,
      indicatorMat: mat,
      startX: x,
      startY: y,
      startZ: z,
      targetX: tx,
      targetY: ty,
      targetZ: tz,
      peakHeight: 2.6,
      flightTime: ft || 0.65,
      elapsed: 0,
      onDetonate: (ex, ey, ez) => {
        audio.playExplosion();
        this.spawnExplosionShockwave(ex, ey, ez, color, 2.6);
        this.spawnSparkBurst(ex, ey, ez, 36, 0xff5c1a, 1.8);
        if (onBoom) onBoom(ex, ez);
      },
    });
  }

  // The host reported a grenade detonation — end the local arc early with a boom.
  detonateNetGrenade(id) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.id !== id) continue;
      const color = p.mat && p.mat.emissive ? p.mat.emissive.getHex() : 0x00e5ff;
      this.scene.remove(p.mesh);
      if (p.geo) p.geo.dispose();
      if (p.mat) p.mat.dispose();
      this.projectiles.splice(i, 1);
      audio.playExplosion();
      this.spawnExplosionShockwave(p.targetX, p.targetY, p.targetZ, color, 2.6);
      this.spawnSparkBurst(p.targetX, p.targetY, p.targetZ, 36, 0xff5c1a, 1.8);
      return;
    }
  }

  // CHOG VIBER: a ring of cone quills bursts out of the pusher (visual only,
  // the knockback itself is handled by Robot.triggerPush). Even 360° spread —
  // spike i flies at angle (i / count) * 2PI with IDENTICAL speed, travel
  // distance and fade time, so the pattern is perfectly symmetric.
  // Geometry + materials are shared across the whole burst (fanless M1).
  spawnSpikeBurst(x, y, z, count = 8, colorHex = 0xfdf7d3) {
    const SPEED = 6.0; // units/sec — same for every spike
    const DURATION = 0.4; // fade-to-zero time — same for every spike
    const DIST = SPEED * DURATION; // travel distance — same for every spike

    const coneGeo = new THREE.ConeGeometry(0.1, 0.55, 8);
    coneGeo.rotateX(Math.PI / 2); // bake tip toward +Z so lookAt() aims the quill
    const edgeGeo = new THREE.EdgesGeometry(coneGeo);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
    });
    const outlineMat = new THREE.LineBasicMaterial({ color: 0x14161a });

    const burst = {
      spikes: [],
      geo: coneGeo,
      edgeGeo,
      mat,
      outlineMat,
      speed: SPEED,
      duration: DURATION,
      dist: DIST,
    };
    this.spikeBursts.push(burst);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2; // even spread, no randomness
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);

      const mesh = new THREE.Mesh(coneGeo, mat);
      mesh.add(new THREE.LineSegments(edgeGeo, outlineMat)); // black outline
      mesh.position.set(x, y, z);
      mesh.lookAt(x + dx, y, z + dz); // quill tip points along its fixed direction
      this.scene.add(mesh);

      burst.spikes.push({ mesh, dx, dz, traveled: 0, elapsed: 0 });
    }
  }

  // Add an active grenade projectile (assigns a stable id)
  addProjectile(proj) {
    if (!proj.id) proj.id = this.nextId();
    this.projectiles.push(proj);
  }

  // Launch a flying cyber spear in the facing direction
  spawnFlyingSpear(startX, startY, startZ, dirX, dirZ, maxDist = 6.0, speed = 22.0, targetRobot, onHit, colorHex = 0x00f0ff, id = null, owner = null) {
    const spearGroup = new THREE.Group();

    // 1. Sleek metallic cyber shaft
    const shaftGeo = new THREE.CylinderGeometry(0.038, 0.038, 2.2, 12);
    const shaftMat = new THREE.MeshStandardMaterial({
      color: 0x1e2638,
      metalness: 0.9,
      roughness: 0.2,
    });
    const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
    shaftMesh.rotation.x = Math.PI / 2; // Point forward along -Z
    shaftMesh.position.z = -1.1;
    spearGroup.add(shaftMesh);

    // 2. Piercing laser energy spearhead
    const tipGeo = new THREE.ConeGeometry(0.13, 0.75, 16);
    const tipMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 2.2,
      roughness: 0.1,
    });
    const tipMesh = new THREE.Mesh(tipGeo, tipMat);
    tipMesh.rotation.x = -Math.PI / 2;
    tipMesh.position.z = -2.35;
    spearGroup.add(tipMesh);

    // 3. Energy crossguard emitter
    const guardGeo = new THREE.TorusGeometry(0.15, 0.03, 12, 24);
    const guardMat = new THREE.MeshBasicMaterial({ color: colorHex });
    const guardMesh = new THREE.Mesh(guardGeo, guardMat);
    guardMesh.position.z = -1.95;
    spearGroup.add(guardMesh);

    spearGroup.position.set(startX, startY, startZ);

    // Orient spear so that -Z points along (dirX, 0, dirZ)
    const angle = Math.atan2(-dirX, -dirZ);
    spearGroup.rotation.y = angle;

    this.scene.add(spearGroup);

    this.spears.push({
      id: id !== null ? id : this.nextId(),
      owner,
      group: spearGroup,
      dirX,
      dirZ,
      speed,
      distanceTraveled: 0,
      maxDist,
      targetRobot,
      onHit,
      colorHex,
    });
  }

  // Remove a specific flying spear by id (used by the online guest when
  // the host reports the spear is done). Returns true if one was removed.
  removeSpear(id) {
    for (let i = this.spears.length - 1; i >= 0; i--) {
      if (this.spears[i].id === id) {
        const s = this.spears[i];
        this.scene.remove(s.group);
        this.spears.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  update(dt) {
    // 1. Update Flying Spears
    for (let i = this.spears.length - 1; i >= 0; i--) {
      const s = this.spears[i];
      const step = s.speed * dt;
      s.group.position.x += s.dirX * step;
      s.group.position.z += s.dirZ * step;
      s.distanceTraveled += step;

      // Small trailing energy particles
      if (Math.random() < 0.4) {
        this.spawnSparkBurst(
          s.group.position.x,
          s.group.position.y,
          s.group.position.z,
          3,
          s.colorHex || 0x00f0ff,
          0.3
        );
      }

      // Check collision with target
      if (s.targetRobot && s.targetRobot.state === "alive") {
        const dx = s.group.position.x - s.targetRobot.pos.x;
        const dz = s.group.position.z - s.targetRobot.pos.z;
        const dist = Math.hypot(dx, dz);

        if (dist <= 0.85) {
          // HIT!
          if (s.onHit) {
            s.onHit(s.targetRobot, s.dirX, s.dirZ);
          }
          this.spawnSparkBurst(
            s.group.position.x,
            s.group.position.y + 0.3,
            s.group.position.z,
            24,
            s.colorHex || 0x00f0ff,
            1.5
          );
          this.scene.remove(s.group);
          this.spears.splice(i, 1);
          continue;
        }
      }

      // Max distance check
      if (s.distanceTraveled >= s.maxDist) {
        this.spawnSparkBurst(
          s.group.position.x,
          s.group.position.y,
          s.group.position.z,
          8,
          s.colorHex || 0x00f0ff,
          0.6
        );
        this.scene.remove(s.group);
        this.spears.splice(i, 1);
      }
    }

    // 2. Update Grenade Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.elapsed += dt;
      const t = Math.min(1.0, p.elapsed / p.flightTime);

      // Interpolate horizontal position
      const currX = p.startX + (p.targetX - p.startX) * t;
      const currZ = p.startZ + (p.targetZ - p.startZ) * t;

      // Parabolic arc height
      const arcHeight = 4.0 * p.peakHeight * t * (1.0 - t);
      const currY = p.startY + (p.targetY - p.startY) * t + arcHeight;

      p.mesh.position.set(currX, currY, currZ);
      p.mesh.rotation.x += dt * 8.0;
      p.mesh.rotation.z += dt * 6.0;

      // Pulse grenade core indicator
      if (p.indicatorMat) {
        const pulse = 0.5 + 0.5 * Math.sin(p.elapsed * 25);
        p.indicatorMat.emissiveIntensity = 1.0 + pulse * 2.0;
      }

      // Detonation on landing
      if (t >= 1.0) {
        if (p.onDetonate) {
          p.onDetonate(p.targetX, p.targetY, p.targetZ);
        }
        this.scene.remove(p.mesh);
        if (p.geo) p.geo.dispose();
        if (p.mat) p.mat.dispose();
        this.projectiles.splice(i, 1);
      }
    }

    // 3. Update Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.elapsed += dt;
      const t = Math.min(1.0, s.elapsed / s.duration);

      const radius = 0.3 + (s.maxRadius - 0.3) * Math.sin(t * (Math.PI / 2));
      s.mesh.scale.set(radius, radius * 0.5, radius);
      s.mat.opacity = (1.0 - t) * 0.9;

      if (t >= 1.0) {
        this.scene.remove(s.mesh);
        s.geo.dispose();
        s.mat.dispose();
        this.shockwaves.splice(i, 1);
      }
    }

    // 4. Update Spark Bursts
    for (let i = this.sparkBursts.length - 1; i >= 0; i--) {
      const b = this.sparkBursts[i];
      b.elapsed += dt;
      const t = Math.min(1.0, b.elapsed / b.duration);

      const pos = b.geo.attributes.position.array;
      for (let j = 0; j < b.count; j++) {
        const v = b.velocities[j];
        v.vy -= 18.0 * dt; // Gravity on sparks
        pos[j * 3 + 0] += v.vx * dt;
        pos[j * 3 + 1] += v.vy * dt;
        pos[j * 3 + 2] += v.vz * dt;
      }
      b.geo.attributes.position.needsUpdate = true;
      b.mat.opacity = (1.0 - t) * 0.95;

      if (t >= 1.0) {
        this.scene.remove(b.points);
        b.geo.dispose();
        b.mat.dispose();
        this.sparkBursts.splice(i, 1);
      }
    }

    // 5. Update Spike Bursts (CHOG push quills: straight out, even ring, fade)
    for (let i = this.spikeBursts.length - 1; i >= 0; i--) {
      const b = this.spikeBursts[i];
      for (let j = b.spikes.length - 1; j >= 0; j--) {
        const s = b.spikes[j];
        s.elapsed += dt;
        const step = b.speed * dt; // identical for every spike in the burst
        s.mesh.position.x += s.dx * step;
        s.mesh.position.z += s.dz * step;
        s.traveled += step;

        if (s.traveled >= b.dist || s.elapsed >= b.duration) {
          this.scene.remove(s.mesh);
          b.spikes.splice(j, 1);
        }
      }

      // All spikes share one material: fade the whole ring together
      const t = Math.min(1.0, (b.spikes[0] ? b.spikes[0].elapsed : 1) / b.duration);
      b.mat.opacity = 1.0 - t;

      if (b.spikes.length === 0) {
        // Ring done: release the shared resources
        b.geo.dispose();
        b.edgeGeo.dispose();
        b.mat.dispose();
        b.outlineMat.dispose();
        this.spikeBursts.splice(i, 1);
      }
    }
  }

  clear() {
    for (const s of this.spears) {
      this.scene.remove(s.group);
    }
    this.spears = [];

    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
      if (p.geo) p.geo.dispose();
      if (p.mat) p.mat.dispose();
    }
    this.projectiles = [];

    for (const s of this.shockwaves) {
      this.scene.remove(s.mesh);
      s.geo.dispose();
      s.mat.dispose();
    }
    this.shockwaves = [];

    for (const b of this.sparkBursts) {
      this.scene.remove(b.points);
      b.geo.dispose();
      b.mat.dispose();
    }
    this.sparkBursts = [];

    for (const b of this.spikeBursts) {
      for (const s of b.spikes) this.scene.remove(s.mesh);
      b.geo.dispose();
      b.edgeGeo.dispose();
      b.mat.dispose();
      b.outlineMat.dispose();
    }
    this.spikeBursts = [];
  }
}
