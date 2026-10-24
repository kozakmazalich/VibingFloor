import * as THREE from "three";
import { LASER_COLOR, LASER_CORE_COLOR, LASER_DURATION } from "./constants.js";

// Cached unit-length geometries (aligned along +Z after rotation) for zero-alloc beam spawning
const _laserOuterGeo = new THREE.CylinderGeometry(0.09, 0.09, 1, 6, 1, false);
_laserOuterGeo.rotateX(Math.PI / 2);
_laserOuterGeo.translate(0, 0, 0.5); // origin at start of beam

const _laserCoreGeo = new THREE.CylinderGeometry(0.038, 0.038, 1, 6, 1, false);
_laserCoreGeo.rotateX(Math.PI / 2);
_laserCoreGeo.translate(0, 0, 0.5);

const _laserFlashGeo = new THREE.BoxGeometry(0.26, 0.26, 0.26);
const _laserSparkGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);

// Inside your FXManager class:
spawnLaserBeam(startPos, dirX, dirZ, length, target, onHit) {
  const group = new THREE.Group();
  group.position.set(startPos.x, startPos.y, startPos.z);
  group.rotation.y = Math.atan2(dirX, dirZ);

  // Outer neon green glow (0x39ff14, high emissive + additive blending)
  const outerMat = new THREE.MeshStandardMaterial({
    color: LASER_COLOR,
    emissive: LASER_COLOR,
    emissiveIntensity: 3.5,
    roughness: 0.1,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  // Near-white hot inner core (0xb8ffb0 -> 0xffffff)
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const CoreTintMat = new THREE.MeshBasicMaterial({
    color: LASER_CORE_COLOR,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const outerMesh = new THREE.Mesh(_laserOuterGeo, outerMat);
  outerMesh.scale.set(1, 1, length);

  const midMesh = new THREE.Mesh(_laserOuterGeo, CoreTintMat);
  midMesh.scale.set(0.65, 0.65, length);

  const coreMesh = new THREE.Mesh(_laserCoreGeo, coreMat);
  coreMesh.scale.set(1, 1, length + 0.04);

  // Muzzle flash cube at origin
  const muzzleFlash = new THREE.Mesh(_laserFlashGeo, CoreTintMat);

  group.add(outerMesh, midMesh, coreMesh, muzzleFlash);
  this.scene.add(group);

  // Instant hit registration for laser + green impact burst
  if (onHit) onHit();

  const endX = startPos.x + dirX * length;
  const endZ = startPos.z + dirZ * length;
  this.spawnLaserImpactParticles(
    { x: endX, y: startPos.y, z: endZ },
    target ? 14 : 7
  );

  // Track in active effects list (fades out over ~0.4s)
  if (!this.activeLasers) this.activeLasers = [];
  this.activeLasers.push({
    group,
    outerMesh,
    midMesh,
    coreMesh,
    muzzleFlash,
    outerMat,
    CoreTintMat,
    coreMat,
    age: 0,
    duration: LASER_DURATION, // 0.4s
  });
}

spawnLaserImpactParticles(pos, count = 12) {
  for (let i = 0; i < count; i++) {
    const isCore = i % 3 === 0;
    const mat = new THREE.MeshBasicMaterial({
      color: isCore ? LASER_CORE_COLOR : LASER_COLOR,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(_laserSparkGeo, mat);
    m.position.set(pos.x, pos.y, pos.z);

    const angle = Math.random() * Math.PI * 2;
    const speed = 2.2 + Math.random() * 4.5;
    const vy = 1.5 + Math.random() * 3.5;

    this.scene.add(m);
    if (!this.particles) this.particles = [];
    this.particles.push({
      mesh: m,
      mat,
      vx: Math.cos(angle) * speed,
      vy,
      vz: Math.sin(angle) * speed,
      age: 0,
      maxAge: 0.28 + Math.random() * 0.15,
    });
  }
}

// Call inside fxManager.update(dt):
updateLasers(dt) {
  if (!this.activeLasers) return;
  for (let i = this.activeLasers.length - 1; i >= 0; i--) {
    const l = this.activeLasers[i];
    l.age += dt;
    const t = Math.min(1, l.age / l.duration);
    const fade = 1 - t;

    // Thin out and fade over 0.4s
    const thickness = Math.max(0.05, 1 - t * 0.85);
    l.outerMesh.scale.x = thickness * (1 + 0.25 * Math.sin(t * 25));
    l.outerMesh.scale.y = l.outerMesh.scale.x;
    l.midMesh.scale.x = thickness * 0.65;
    l.midMesh.scale.y = l.midMesh.scale.x;
    l.coreMesh.scale.x = Math.max(0.02, fade);
    l.coreMesh.scale.y = l.coreMesh.scale.x;

    l.muzzleFlash.scale.setScalar(Math.max(0.01, (1 - t * 2.2)));
    l.muzzleFlash.rotation.z += dt * 12;

    l.outerMat.opacity = 0.92 * fade;
    l.CoreTintMat.opacity = 0.95 * fade;
    l.coreMat.opacity = fade * fade;

    if (l.age >= l.duration) {
      this.scene.remove(l.group);
      l.outerMat.dispose();
      l.CoreTintMat.dispose();
      l.coreMat.dispose();
      this.activeLasers.splice(i, 1);
    }
  }
}