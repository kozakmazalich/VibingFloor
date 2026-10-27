import * as THREE from "three";
import { COLORS, GRAVITY, QUAKE_SHARDS_MIN, QUAKE_SHARDS_MAX } from "./constants.js";
import { audio } from "./audio.js";

// Shared, never disposed. Pools below only swap materials and visibility.
const CHUNK_GEO = new THREE.BoxGeometry(0.32, 0.14, 0.24);
const EMBER_GEO = new THREE.SphereGeometry(0.08, 5, 4);
const DEBRIS_POOL = 84;
const EMBER_POOL = 80;

function makeGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.4, "rgba(255,80,170,0.7)");
  grd.addColorStop(1, "rgba(255,45,149,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const IMPACT_GLOW_TEX = makeGlowTexture();

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
    this.laserBeams = []; // META VIBER green laser shots

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

  // Flat expanding ring on the floor. worldReach is the outer radius in world units.
  // Additive, no bloom. Existing grenade shockwaves stay wireframe spheres.
  spawnQuakeRing(x, y, z, worldReach) {
    const geo = new THREE.RingGeometry(0.86, 1, 40);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff2d95,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(0.2);
    this.scene.add(mesh);
    this.shockwaves.push({
      mesh,
      mat,
      geo,
      maxRadius: worldReach,
      duration: 0.42,
      elapsed: 0,
      flat: true,
    });
  }

  // Bright disc at the slam point. One-shot, disposed with the other shockwaves.
  spawnImpactFlash(x, y, z) {
    const mat = new THREE.SpriteMaterial({
      map: IMPACT_GLOW_TEX,
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Sprite(mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(0.4, 0.4, 0.4);
    this.scene.add(mesh);
    this.shockwaves.push({
      mesh,
      mat,
      geo: null,
      maxRadius: 3.2,
      duration: 0.18,
      elapsed: 0,
      flat: true,
      sprite: true,
    });
  }

  _ensureDebris() {
    if (this.debris) return;
    this.debris = [];
    this._debrisCursor = 0;
    for (let i = 0; i < DEBRIS_POOL; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1a2038,
        roughness: 0.42,
        metalness: 0.55,
        emissive: 0x00e5ff,
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(CHUNK_GEO, mat);
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      this.debris.push({
        mesh,
        mat,
        active: false,
        vx: 0,
        vy: 0,
        vz: 0,
        sx: 0,
        sy: 0,
        sz: 0,
        life: 0,
        maxLife: 1,
      });
    }
  }

  _ensureEmbers() {
    if (this.embers) return;
    this.embers = [];
    this._emberCursor = 0;
    for (let i = 0; i < EMBER_POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x9af6ff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(EMBER_GEO, mat);
      mesh.visible = false;
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      this.embers.push({
        mesh,
        mat,
        active: false,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.3,
      });
    }
  }

  // One shattered tile: 3–6 pooled chunks plus a short dust burst.
  // Chunks fly out from the quake origin, then fall into the void.
  spawnTileShatter(tile, originX, originZ) {
    this._ensureDebris();
    const x = tile.worldX;
    const y = (tile.group ? tile.group.position.y : 0) + 0.05;
    const z = tile.worldZ;
    const color = tile.topMaterial ? tile.topMaterial.color.getHex() : 0x1a2038;
    const edge = (tile.theme && tile.theme.edge) || COLORS.tileEdge;
    const span = QUAKE_SHARDS_MAX - QUAKE_SHARDS_MIN + 1;
    const n = QUAKE_SHARDS_MIN + Math.floor(Math.random() * span);
    for (let i = 0; i < n; i++) this._launchChunk(x, y, z, originX, originZ, color, edge);
    this.spawnSparkBurst(x, y + 0.12, z, 9, edge, 0.95);
  }

  _launchChunk(x, y, z, ox, oz, color, edge) {
    const c = this.debris[this._debrisCursor];
    this._debrisCursor = (this._debrisCursor + 1) % this.debris.length;
    c.active = true;
    c.mesh.visible = true;
    c.mesh.position.set(
      x + (Math.random() - 0.5) * 0.4,
      y + Math.random() * 0.06,
      z + (Math.random() - 0.5) * 0.4
    );
    const s = 0.5 + Math.random() * 0.65;
    c.mesh.scale.set(
      s * (0.75 + Math.random() * 0.55),
      s * (0.4 + Math.random() * 0.45),
      s * (0.75 + Math.random() * 0.55)
    );
    c.mesh.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    let dx = x - ox;
    let dz = z - oz;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) {
      const a = Math.random() * Math.PI * 2;
      dx = Math.cos(a);
      dz = Math.sin(a);
    } else {
      dx /= len;
      dz /= len;
    }
    const spd = 2.6 + Math.random() * 3.2;
    c.vx = dx * spd + (Math.random() - 0.5) * 1.5;
    c.vz = dz * spd + (Math.random() - 0.5) * 1.5;
    c.vy = 3.6 + Math.random() * 4.0;
    c.sx = (Math.random() - 0.5) * 9;
    c.sy = (Math.random() - 0.5) * 9;
    c.sz = (Math.random() - 0.5) * 9;
    c.maxLife = 1.6 + Math.random() * 0.6;
    c.life = c.maxLife;
    c.mat.color.setHex(color);
    c.mat.emissive.setHex(edge);
    c.mat.emissiveIntensity = 0.5;
    c.mat.opacity = 1;
  }

  // Jetpack exhaust. Ring-buffered so a burn never allocates.
  spawnEmber(x, y, z, vx, vy, vz) {
    this._ensureEmbers();
    const e = this.embers[this._emberCursor];
    this._emberCursor = (this._emberCursor + 1) % this.embers.length;
    e.active = true;
    e.mesh.visible = true;
    e.mesh.position.set(x, y, z);
    e.mesh.scale.setScalar(0.45 + Math.random() * 0.75);
    e.vx = vx;
    e.vy = vy;
    e.vz = vz;
    e.maxLife = 0.26 + Math.random() * 0.22;
    e.life = e.maxLife;
    e.mat.color.setHex(Math.random() < 0.72 ? 0x9af6ff : 0xffe7a8);
    e.mat.opacity = 0.95;
  }

  _updateDebris(dt) {
    if (!this.debris) return;
    for (const c of this.debris) {
      if (!c.active) continue;
      c.life -= dt;
      c.vy -= GRAVITY * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.y += c.vy * dt;
      c.mesh.position.z += c.vz * dt;
      c.mesh.rotation.x += c.sx * dt;
      c.mesh.rotation.y += c.sy * dt;
      c.mesh.rotation.z += c.sz * dt;
      const k = c.maxLife > 0 ? Math.max(0, c.life / c.maxLife) : 0;
      c.mat.opacity = k;
      if (c.life <= 0 || c.mesh.position.y < -12) {
        c.active = false;
        c.mesh.visible = false;
      }
    }
  }

  _updateEmbers(dt) {
    if (!this.embers) return;
    for (const e of this.embers) {
      if (!e.active) continue;
      e.life -= dt;
      e.vy -= GRAVITY * 0.35 * dt;
      e.mesh.position.x += e.vx * dt;
      e.mesh.position.y += e.vy * dt;
      e.mesh.position.z += e.vz * dt;
      const k = e.maxLife > 0 ? Math.max(0, e.life / e.maxLife) : 0;
      e.mat.opacity = k * 0.95;
      e.mesh.scale.setScalar(0.35 + k * 0.5);
      if (e.life <= 0) {
        e.active = false;
        e.mesh.visible = false;
      }
    }
  }

  _hidePool(list) {
    if (!list) return;
    for (const item of list) {
      item.active = false;
      item.mesh.visible = false;
    }
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
        this.spawnSparkBurst(ex, ey, ez, 36, color === 0x39ff14 ? 0x39ff14 : 0xff5c1a, 1.8);
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
      this.spawnSparkBurst(p.targetX, p.targetY, p.targetZ, 36, color === 0x39ff14 ? 0x39ff14 : 0xff5c1a, 1.8);
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

  // META VIBER: instant green laser beam (visual only — the hitscan hit is
  // resolved by Robot.fireLaser). Long thin glowing beam straight along the
  // facing direction, with a white-hot core; fades out over ~0.4s.
  fireLaserBeam({ x, y, z, dirX, dirZ, maxDist = 4.32, color = 0x39ff14 }) {
    const angle = Math.atan2(-dirX, -dirZ);
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = angle;

    const mk = (w, colorHex, opacity, blend) => {
      const geo = new THREE.BoxGeometry(w, w, maxDist);
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: blend || THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = -maxDist / 2; // beam extends forward from the muzzle
      return { mesh, geo, mat, base: opacity };
    };

    const glow = mk(0.30, color, 0.5); // wide outer halo
    const beam = mk(0.09, color, 1.0); // vivid green body
    const hot = mk(0.045, 0xffffff, 1.0, THREE.NormalBlending); // white-hot core

    group.add(glow.mesh, beam.mesh, hot.mesh);
    this.scene.add(group);

    this.laserBeams.push({
      group,
      parts: [glow, beam, hot],
      duration: 0.4, // a bit longer-lasting laser
      elapsed: 0,
    });
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
      if (s.flat) s.mesh.scale.setScalar(Math.max(0.05, radius));
      else s.mesh.scale.set(radius, radius * 0.5, radius);
      s.mat.opacity = (1.0 - t) * 0.9;

      if (t >= 1.0) {
        this.scene.remove(s.mesh);
        if (s.geo) s.geo.dispose();
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

    // 6. Update Laser Beams (META: quick fade, slight shrink)
    for (let i = this.laserBeams.length - 1; i >= 0; i--) {
      const b = this.laserBeams[i];
      b.elapsed += dt;
      const t = Math.min(1.0, b.elapsed / b.duration);
      for (const p of b.parts) {
        p.mat.opacity = p.base * (1.0 - t);
      }
      b.group.scale.z = 1.0 - t * 0.4; // retract slightly as it fades
      if (t >= 1.0) {
        this.scene.remove(b.group);
        for (const p of b.parts) {
          p.geo.dispose();
          p.mat.dispose();
        }
        this.laserBeams.splice(i, 1);
      }
    }

    this._updateDebris(dt);
    this._updateEmbers(dt);
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
      if (s.geo) s.geo.dispose();
      s.mat.dispose();
    }
    this.shockwaves = [];
    this._hidePool(this.debris);
    this._hidePool(this.embers);

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

    for (const b of this.laserBeams) {
      this.scene.remove(b.group);
      for (const p of b.parts) {
        p.geo.dispose();
        p.mat.dispose();
      }
    }
    this.laserBeams = [];
  }
}
