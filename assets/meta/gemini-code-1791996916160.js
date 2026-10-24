import {
  SPEAR_REACH,
  SPEAR_IMPULSE,
  SPEAR_COOLDOWN,
  LASER_REACH,
  LASER_COLOR,
} from "./constants.js";

// Helper on the Robot class to get the active ability reach (used by input/AI range checks too):
getAbilityReach() {
  return this.charDef && this.charDef.laser ? LASER_REACH : SPEAR_REACH;
}

triggerSpear(target, fxManager, onScreenShake) {
  if (this.spearCooldown > 0) return false;

  const isLaser = Boolean(this.charDef && this.charDef.laser);
  const maxReach = isLaser ? LASER_REACH : SPEAR_REACH;

  // Determine facing direction or vector toward target
  let dirX = Math.sin(this.facingAngle ?? this.root.rotation.y);
  let dirZ = Math.cos(this.facingAngle ?? this.root.rotation.y);
  let distToTarget = Infinity;

  if (target && target.position) {
    const dx = target.position.x - this.position.x;
    const dz = target.position.z - this.position.z;
    distToTarget = Math.hypot(dx, dz);
    if (distToTarget > 0.0001) {
      dirX = dx / distToTarget;
      dirZ = dz / distToTarget;
      this.facingAngle = Math.atan2(dirX, dirZ);
      this.root.rotation.y = this.facingAngle;
    }
  }

  this.spearCooldown = SPEAR_COOLDOWN;

  // Origin around chest/eye height
  const startPos = {
    x: this.position.x + dirX * 0.45,
    y: (this.position.y || 0) + 1.05,
    z: this.position.z + dirZ * 0.45,
  };

  if (isLaser) {
    // Laser beam extends to target (if in reach) or full LASER_REACH (4.32)
    const hitTarget = target && distToTarget <= maxReach ? target : null;
    const beamLength = hitTarget ? Math.max(0.6, distToTarget) : maxReach;

    fxManager.spawnLaserBeam(
      startPos,
      dirX,
      dirZ,
      beamLength,
      hitTarget,
      () => {
        if (hitTarget) {
          hitTarget.applyImpulse(dirX * SPEAR_IMPULSE, dirZ * SPEAR_IMPULSE);
          if (fxManager.spawnHitSparks) {
            fxManager.spawnHitSparks(
              {
                x: hitTarget.position.x,
                y: (hitTarget.position.y || 0) + 0.9,
                z: hitTarget.position.z,
              },
              LASER_COLOR
            );
          }
          if (onScreenShake) onScreenShake(0.32);
        }
      }
    );

    if (onScreenShake && !hitTarget) onScreenShake(0.12);
    return true;
  }

  // Default spear path for all other characters
  fxManager.spawnFlyingSpear(
    startPos,
    dirX,
    dirZ,
    target,
    maxReach,
    () => {
      if (target) {
        target.applyImpulse(dirX * SPEAR_IMPULSE, dirZ * SPEAR_IMPULSE);
        if (onScreenShake) onScreenShake(0.28);
      }
    }
  );
  return true;
}