import * as THREE from "three";
import {
  ROBOT_RADIUS,
  ROBOT_SCALE,
  P1_ACCEL,
  P1_MAX_SPEED,
  P1_DAMPING,
  AI_DAMPING,
  PUSH_RADIUS,
  PUSH_COOLDOWN,
  PUSH_IMPULSE,
  JUMP_FORCE,
  JUMP_COOLDOWN,
  JUMP_FORWARD_BOOST,
  DASH_COOLDOWN,
  DASH_DURATION,
  DASH_SPEED_MULT,
  DASH_RECOVERY,
  DASH_TRAIL_INTERVAL,
  DASH_TRAIL_LIFE,
  SPEAR_COOLDOWN,
  SPEAR_IMPULSE,
  GRENADE_COOLDOWN,
  GRENADE_RADIUS,
  GRENADE_THROW_DISTANCE,
  GRENADE_IMPULSE,
  GRAVITY,
  VOID_KILL_Y,
  TILE_HEIGHT,
  TILE_SPACING,
  STEP_UP_MAX,
  ROBOT_BODY_HEIGHT,
  DIFFICULTIES,
  COLORS,
} from "./constants.js";
import { audio } from "./audio.js";
import { buildViber, CHARACTERS } from "./vibers.js";

// Selectable fighters: type key -> character index, name and menu avatar
// pushMult scales the knockback of the J push (CHOG VIBER hits harder)
export const CHAR_TYPES = {
  robot1_jpg: { idx: 0, name: "Crimson Miner", portrait: "assets/robot1_portrait.png" },
  moss: { idx: 1, name: "Moss Viber", portrait: "assets/robot3_portrait.png" },
  mecha: { idx: 2, name: "Volt Viber", portrait: "assets/robot2_portrait.png" },
  phantom: { idx: 3, name: "Phantom Viber", portrait: "assets/robot4_portrait.png" },
  chog: { idx: 4, name: "Chog Viber", portrait: "assets/robot5_portrait.png", pushMult: 2.52 },
};

export class Robot {
  constructor(id, name, texturePath, startX, startZ, teamColor, isPlayer, scene) {
    this.id = id;
    this.name = name;
    this.portraitPath = `assets/robot${id}_portrait.png`;
    this.startX = startX;
    this.startZ = startZ;
    this.teamColor = teamColor;
    this.isPlayer = isPlayer;
    this.scene = scene;

    // Which Viber body this robot wears (0 = Crimson Miner, 2 = Volt Viber)
    this.charIndex = id === 1 ? 0 : 2;

    // State: "alive" | "falling" | "eliminated"
    this.state = "alive";

    // CPU difficulty preset (affects the AI controller)
    this.setDifficulty("normal");

    // 2D Ground Physics
    this.pos = new THREE.Vector3(startX, 0, startZ);
    this.vel = new THREE.Vector2(0, 0);
    this.radius = ROBOT_RADIUS;

    // Facing angle (0 = facing forward -Z)
    this.facingAngle = isPlayer ? -Math.PI / 4 : (3 * Math.PI) / 4;

    // 3D Falling & Jumping physics
    this.vy = 0;
    this.angVelX = 0;
    this.angVelY = 0;
    this.angVelZ = 0;
    this.isGrounded = true;

    // Active Abilities & Cooldowns
    this.jumpCooldown = 0;
    this.pushCooldown = 0;
    this.pushWaveTimer = 0;
    this.pushLungeTimer = 0;
    this.pushMult = 1; // per-character push knockback scale (CHOG VIBER = 2.52)

    this.spearCooldown = 0;
    this.grenadeCooldown = 0;

    // Dash ability (SHIFT): burst + afterimage trail
    this.dashCooldown = 0;
    this.dashTimer = 0; // remaining burst time (>0 = dashing)
    this.dashRecovery = 0; // smooth speed bleed after the burst
    this.dashDir = new THREE.Vector2(0, 0); // normalized burst direction
    this.dashHeld = false; // fresh-press detection (keyboard)
    this.remoteDashHeld = false; // fresh-press detection (online guest input)
    this.dashGhostTimer = 0; // while >0, spawn afterimages at fixed cadence
    this.dashTrailAccum = 0;
    this.ghosts = []; // { mesh, mat, life, maxLife }

    // Animation variables
    this.walkPhase = 0;
    this.hitShakeTimer = 0;

    // 3D Model state
    this.has3DModel = false;
    this.hasSpikes = false; // CHOG VIBER: push scatters quills

    // AI navigation variables
    this.aiWanderTimer = 0;
    this.aiWanderDir = new THREE.Vector2(0, 0);

    // Online multiplayer
    this.fxJumpCount = 0; // incremented on each jump (host broadcasts as fx event)
    this.fxPushCount = 0; // incremented on each push (host broadcasts as fx event)
    this.fxDashCount = 0; // incremented on each dash (host broadcasts as fx event)
    this.netPose = null; // latest authoritative pose from the host (guest only)
    this.predictingHop = false; // guest predicted a jump locally (mid-flight)
    this._netTarget = new THREE.Vector3();

    // Root 3D group
    this.group = new THREE.Group();
    this.group.position.copy(this.pos);

    // Ground Decal / Team Pedestal
    this.setupGroundRing();

    // Build the Viber block robot (extracted from VIBER BRAWL)
    this.buildBlockRobot();

    this.scene.add(this.group);
  }

  buildBlockRobot() {
    const def = CHARACTERS[this.charIndex]; // Crimson Miner (0) vs Volt (2)
    const v = buildViber(def);
    this.viber = v;
    this.modelGroup = new THREE.Group();
    this.hasSpikes = !!(def.spikes && def.spikes.length);

    // Normalize height to ROBOT_SCALE and sit feet at y = 0
    const targetHeight = ROBOT_SCALE * 1.15;
    const box = new THREE.Box3().setFromObject(v.root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = targetHeight / (size.y || 1);
    v.root.scale.multiplyScalar(s);

    const b2 = new THREE.Box3().setFromObject(v.root);
    v.root.position.y = -b2.min.y;
    // Viber's face points +Z; the game's forward is -Z, so turn it around.
    v.root.rotation.y = Math.PI;

    this.modelGroup.add(v.root);
    this.group.add(this.modelGroup);
    this.has3DModel = true;
  }

  setupGroundRing() {
    this.groundGroup = new THREE.Group();

    // 1. Soft dark contact shadow circle
    const shadowGeo = new THREE.CircleGeometry(0.52, 32);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.01;
    this.groundGroup.add(shadowMesh);

    // 2. Physical 3D metallic pedestal base
    const basePuckGeo = new THREE.CylinderGeometry(0.52, 0.56, 0.04, 32);
    const basePuckMat = new THREE.MeshStandardMaterial({
      color: 0x161b2e,
      roughness: 0.4,
      metalness: 0.8,
    });
    const basePuckMesh = new THREE.Mesh(basePuckGeo, basePuckMat);
    basePuckMesh.position.y = 0.02;
    basePuckMesh.receiveShadow = true;
    this.groundGroup.add(basePuckMesh);

    // 3. Glowing neon team ring
    const ringGeo = new THREE.RingGeometry(0.48, 0.55, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: this.teamColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.042;
    this.groundGroup.add(ringMesh);

    // 4. Directional heading pointer arrow (points where robot faces)
    const pointerGeo = new THREE.ConeGeometry(0.12, 0.24, 16);
    const pointerMat = new THREE.MeshBasicMaterial({ color: this.teamColor });
    this.pointerMesh = new THREE.Mesh(pointerGeo, pointerMat);
    this.pointerMesh.rotation.x = -Math.PI / 2;
    this.pointerMesh.position.set(0, 0.045, -0.52);
    this.groundGroup.add(this.pointerMesh);

    // 5. In-world cooldown indicator ring (for Player 1)
    if (this.isPlayer) {
      const cdGeo = new THREE.RingGeometry(0.58, 0.65, 32);
      this.cdMat = new THREE.MeshBasicMaterial({
        color: this.teamColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      this.cdMesh = new THREE.Mesh(cdGeo, this.cdMat);
      this.cdMesh.rotation.x = -Math.PI / 2;
      this.cdMesh.position.y = 0.045;
      this.groundGroup.add(this.cdMesh);
    }

    this.group.add(this.groundGroup);

    // 6. Radial push shockwave ring (expanding wave on SPACE)
    const waveGeo = new THREE.RingGeometry(0.25, 0.45, 32);
    this.waveMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    this.waveMesh = new THREE.Mesh(waveGeo, this.waveMat);
    this.waveMesh.rotation.x = -Math.PI / 2;
    this.waveMesh.position.y = 0.05;
    this.waveMesh.visible = false;
    this.group.add(this.waveMesh);
  }

  switchCharacter(charType) {
    const meta = CHAR_TYPES[charType] || CHAR_TYPES.robot1_jpg;
    this.charIndex = meta.idx;
    this.pushMult = meta.pushMult || 1;
    if (this.isPlayer) {
      this.name = meta.name;
      this.portraitPath = meta.portrait;
    }
    if (this.modelGroup) {
      this.group.remove(this.modelGroup);
      this.modelGroup = null;
      this.has3DModel = false;
    }
    this.buildBlockRobot();
  }

  setDifficulty(level) {
    const d = DIFFICULTIES[level] || DIFFICULTIES.normal;
    this.difficulty = level;
    this.ai = {
      maxSpeed: d.maxSpeed,
      accel: d.accel,
      aggro: d.aggro,
      spearChance: d.spearChance,
      grenadeChance: d.grenadeChance,
      pushChance: d.pushChance,
      edgeSense: d.edgeSense,
      dodge: d.dodge,
    };
  }

  reset() {
    this.state = "alive";
    this.pos.set(this.startX, 0, this.startZ);
    this.vel.set(0, 0);
    this.vy = 0;
    this.angVelX = 0;
    this.angVelY = 0;
    this.angVelZ = 0;
    this.isGrounded = true;
    this.walkPhase = 0;
    this.hitShakeTimer = 0;
    this.facingAngle = this.isPlayer ? -Math.PI / 4 : (3 * Math.PI) / 4;
    this.netPose = null; // drop stale snapshot target (online guest: fresh ones arrive ~33ms later)
    this.predictingHop = false;

    this.jumpCooldown = 0;
    this.pushCooldown = 0;
    this.pushWaveTimer = 0;
    this.pushLungeTimer = 0;
    this.spearCooldown = 0;
    this.grenadeCooldown = 0;

    this.dashCooldown = 0;
    this.dashTimer = 0;
    this.dashRecovery = 0;
    this.dashDir.set(0, 0);
    this.dashHeld = false;
    this.remoteDashHeld = false;
    this.dashGhostTimer = 0;
    this.dashTrailAccum = 0;
    this.clearDashGhosts();

    if (this.waveMesh) this.waveMesh.visible = false;

    this.group.position.copy(this.pos);
    this.group.rotation.set(0, 0, 0);

    if (this.modelGroup) {
      this.modelGroup.rotation.y = this.facingAngle;
      this.modelGroup.position.set(0, 0, 0);
      this.modelGroup.scale.set(1, 1, 1);
    }

    this.groundGroup.rotation.y = this.facingAngle;
    this.group.visible = true;
    this.groundGroup.visible = true;
  }

  applyImpulse(ix, iz) {
    this.vel.x += ix;
    this.vel.y += iz;
    this.hitShakeTimer = 0.25;
    audio.playImpact(Math.hypot(ix, iz) / 5);
  }

  startFalling() {
    if (this.state !== "alive") return;
    this.state = "falling";
    this.isGrounded = false;
    this.vy = -1.0;
    this.angVelX = (Math.random() - 0.5) * 5.0;
    this.angVelY = (Math.random() - 0.5) * 6.0;
    this.angVelZ = (Math.random() - 0.5) * 5.0;
    this.groundGroup.visible = false;
    audio.playRobotFall();
  }

  // --- ABILITY 1: JET JUMP (SPACE) ---
  triggerJump(fxManager) {
    if (this.state !== "alive" || !this.isGrounded || this.jumpCooldown > 0) return false;

    this.jumpCooldown = JUMP_COOLDOWN;
    this.isGrounded = false;
    this.vy = JUMP_FORCE;
    this.fxJumpCount++;

    // Add forward momentum boost if moving
    const speed = this.vel.length();
    if (speed > 0.15) {
      this.vel.x += (this.vel.x / speed) * JUMP_FORWARD_BOOST;
      this.vel.y += (this.vel.y / speed) * JUMP_FORWARD_BOOST;
    }

    audio.playJump();

    if (fxManager) {
      fxManager.spawnJumpThruster(this.pos.x, this.pos.y + 0.15, this.pos.z, this.teamColor);
    }

    return true;
  }

  // Visual-only jump FX + sound (online guest: physics is host-authoritative)
  triggerJumpVisual(fxManager) {
    if (this.state !== "alive") return;
    audio.playJump();
    if (fxManager) {
      fxManager.spawnJumpThruster(this.pos.x, this.pos.y + 0.15, this.pos.z, this.teamColor);
    }
  }

  // --- ABILITY 2: FORCE PUSH (KEY P) ---
  triggerPush(target, fxManager) {
    if (this.state !== "alive" || this.pushCooldown > 0) return false;

    this.pushCooldown = PUSH_COOLDOWN;
    this.pushWaveTimer = 0.28;
    this.pushLungeTimer = 0.16;
    this.fxPushCount++;

    this.playPushWaveVisual();
    this.spawnSpikeBurst(fxManager); // CHOG: quills scatter with the push

    if (target && target.state === "alive") {
      const dx = target.pos.x - this.pos.x;
      const dz = target.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= PUSH_RADIUS) {
        let dirX = dx / (dist || 0.001);
        let dirZ = dz / (dist || 0.001);

        const speed = this.vel.length();
        if (speed > 0.5) {
          const moveDirX = this.vel.x / speed;
          const moveDirZ = this.vel.y / speed;
          dirX = dirX * 0.75 + moveDirX * 0.25;
          dirZ = dirZ * 0.75 + moveDirZ * 0.25;
          const blendLen = Math.hypot(dirX, dirZ);
          dirX /= (blendLen || 1);
          dirZ /= (blendLen || 1);
        }

        const distBonus = 1.0 + (1.0 - dist / PUSH_RADIUS) * 0.35;
        const impulse = PUSH_IMPULSE * distBonus * (this.pushMult || 1);

        target.applyImpulse(dirX * impulse, dirZ * impulse);

        if (fxManager) {
          fxManager.spawnSparkBurst(target.pos.x, 0.4, target.pos.z, 24, this.teamColor, 1.4);
        }
      }
    }

    return true;
  }

  // Expanding radial shockwave ring + sound, no gameplay effect
  // (shared by local triggerPush and the online guest's fx events)
  playPushWaveVisual() {
    if (this.waveMesh) {
      this.waveMesh.visible = true;
      this.waveMesh.scale.set(0.4, 0.4, 0.4);
      this.waveMat.color.setHex(this.teamColor);
      this.waveMat.opacity = 0.95;
    }
    this.pushWaveTimer = 0.28;
    audio.playPushWhoosh();
  }

  // CHOG VIBER: scatter a symmetric ring of quill cones on push (visual only)
  spawnSpikeBurst(fxManager) {
    if (!this.hasSpikes || !fxManager) return;
    fxManager.spawnSpikeBurst(this.pos.x, this.pos.y + 0.4, this.pos.z, 8, 0xfdf7d3);
  }

  // --- ABILITY: NEON DASH (SHIFT) ---
  // Short speed burst along (dirX, dirZ) (normalized). Fires the afterimage
  // trail + sound; cooldown and burst timing live on the Robot.
  triggerDash(dirX, dirZ) {
    if (this.state !== "alive" || this.dashCooldown > 0) return false;

    const len = Math.hypot(dirX, dirZ);
    if (len < 0.001) return false;

    this.dashCooldown = DASH_COOLDOWN;
    this.dashTimer = DASH_DURATION;
    this.dashDir.set(dirX / len, dirZ / len);
    this.fxDashCount++;

    this.playDashVisual();

    return true;
  }

  // Visual + audio only (online guest rendering the opponent's dash fx event)
  playDashVisual() {
    if (this.state !== "alive") return;
    this.dashGhostTimer = DASH_DURATION;
    this.dashTrailAccum = 0;
    this.spawnDashGhost();
    audio.playDash();
  }

  // Cheap afterimage: a flat translucent team-colored silhouette of the robot
  // that fades out over DASH_TRAIL_LIFE. Geometry is shared (clone), one
  // material per ghost — no bloom, no post-processing.
  spawnDashGhost() {
    if (!this.modelGroup) return;
    const ghost = this.modelGroup.clone(true); // deep clone, shares geometry
    const ghostMat = new THREE.MeshBasicMaterial({
      color: this.teamColor,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    ghost.traverse((child) => {
      if (child.isMesh) {
        child.material = ghostMat;
        child.castShadow = false;
        child.receiveShadow = false;
      } else if (child.isLineSegments) {
        child.visible = false; // clean silhouette, no outlines in the trail
      }
    });
    // Replicate the model group's transform inside the scene (group pos + bob)
    ghost.position.set(
      this.group.position.x + this.modelGroup.position.x,
      this.group.position.y + this.modelGroup.position.y,
      this.group.position.z + this.modelGroup.position.z
    );
    ghost.rotation.y = this.modelGroup.rotation.y;
    ghost.scale.copy(this.modelGroup.scale);
    this.scene.add(ghost);
    this.ghosts.push({ mesh: ghost, mat: ghostMat, life: DASH_TRAIL_LIFE, maxLife: DASH_TRAIL_LIFE });
  }

  // Spawn afterimages while a dash burst is active and fade existing ones out.
  updateDashVisuals(dt) {
    if (this.dashGhostTimer > 0) {
      this.dashGhostTimer -= dt;
      this.dashTrailAccum += dt;
      while (this.dashTrailAccum >= DASH_TRAIL_INTERVAL) {
        this.dashTrailAccum -= DASH_TRAIL_INTERVAL;
        this.spawnDashGhost();
      }
      if (this.dashGhostTimer <= 0) this.dashTrailAccum = 0;
    }

    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.life -= dt;
      if (g.life <= 0) {
        this.scene.remove(g.mesh);
        g.mat.dispose();
        this.ghosts.splice(i, 1);
      } else {
        g.mat.opacity = 0.35 * (g.life / g.maxLife);
        g.mesh.scale.setScalar(1 + (1 - g.life / g.maxLife) * 0.35);
      }
    }
  }

  clearDashGhosts() {
    for (const g of this.ghosts) {
      this.scene.remove(g.mesh);
      g.mat.dispose();
    }
    this.ghosts.length = 0;
    this.dashGhostTimer = 0;
    this.dashTrailAccum = 0;
  }
  // --- ABILITY 3: CYBER SPEAR (KEY E) — FLIES IN FACING DIRECTION ---
  triggerSpear(target, fxManager, onScreenShake) {
    if (this.state !== "alive" || this.spearCooldown > 0) return false;

    this.spearCooldown = SPEAR_COOLDOWN;
    this.pushLungeTimer = 0.18; // Brief attack lunge animation

    // Forward direction from facing angle
    const dirX = -Math.sin(this.facingAngle);
    const dirZ = -Math.cos(this.facingAngle);

    audio.playSpearThrust();

    if (fxManager) {
      fxManager.spawnFlyingSpear(
        this.pos.x + dirX * 0.4,
        this.pos.y + 0.55,
        this.pos.z + dirZ * 0.4,
        dirX,
        dirZ,
        7.0, // Max reach distance
        24.0, // High-speed javelin velocity
        target,
        (hitTarget, hitDirX, hitDirZ) => {
          // Heavy impact and massive knockback
          audio.playSpearHit();
          hitTarget.applyImpulse(hitDirX * SPEAR_IMPULSE, hitDirZ * SPEAR_IMPULSE);
          if (onScreenShake) onScreenShake(0.35);
        },
        this.teamColor,
        null, // fx id (auto-assigned)
        this.id // owner robot id (online fx routing)
      );
    }

    return true;
  }

  // --- ABILITY 4: CYBER GRENADE (KEY G) — FLIES IN FACING DIRECTION & DESTROYS FLOOR ---
  triggerGrenade(target, island, fxManager, onScreenShake) {
    if (this.state !== "alive" || this.grenadeCooldown > 0) return false;

    this.grenadeCooldown = GRENADE_COOLDOWN;
    audio.playGrenadeThrow();

    // STRICTLY facing direction (never snapping directly under opponent)
    const dirX = -Math.sin(this.facingAngle);
    const dirZ = -Math.cos(this.facingAngle);

    const targetX = this.pos.x + dirX * GRENADE_THROW_DISTANCE;
    const targetZ = this.pos.z + dirZ * GRENADE_THROW_DISTANCE;

    // Land on the surface of the tile below the target (works on raised platforms)
    const surf = island.getSurfaceAt(targetX, targetZ);
    const targetY = (surf ? surf.y : 0) + 0.02;

    // Create 3D cyber grenade projectile
    const nadeGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const nadeMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.9,
      roughness: 0.2,
      emissive: this.teamColor,
      emissiveIntensity: 2.2,
    });
    const nadeMesh = new THREE.Mesh(nadeGeo, nadeMat);
    this.scene.add(nadeMesh);

    if (fxManager) {
      fxManager.addProjectile({
        mesh: nadeMesh,
        geo: nadeGeo,
        mat: nadeMat,
        indicatorMat: nadeMat,
        owner: this.id, // robot that threw it (online fx routing)
        startX: this.pos.x,
        startY: this.pos.y + 0.75,
        startZ: this.pos.z,
        targetX,
        targetY,
        targetZ,
        peakHeight: 2.6,
        flightTime: 0.65,
        elapsed: 0,
        onDetonate: (ex, ey, ez) => {
          audio.playExplosion();
          if (onScreenShake) onScreenShake(0.42);

          fxManager.spawnExplosionShockwave(ex, ey, ez, this.teamColor, 2.6);
          fxManager.spawnSparkBurst(ex, ey, ez, 36, COLORS.tileWarning, 1.8);

          // Destroy floor tiles immediately in shockwave radius
          island.destroyTilesAt(ex, ez, GRENADE_RADIUS);

          // Apply blast knockback to all robots in radius
          const combatants = [target, this].filter((r) => r && r.state === "alive");
          for (const robot of combatants) {
            const tdx = robot.pos.x - ex;
            const tdz = robot.pos.z - ez;
            const tdist = Math.hypot(tdx, tdz);
            if (tdist <= GRENADE_RADIUS + 0.5) {
              const ndx = tdx / (tdist || 0.001);
              const ndz = tdz / (tdist || 0.001);
              robot.applyImpulse(ndx * GRENADE_IMPULSE, ndz * GRENADE_IMPULSE);
            }
          }
        },
      });
    }

    return true;
  }

  updatePlayerInput(camera, keys, dt, opponent, island, fxManager, onScreenShake) {
    // 1. J = Force Push (knockback wave)
    if (keys["KeyJ"] && this.pushCooldown <= 0) {
      this.triggerPush(opponent, fxManager);
    }

    // 2. SPACE = Jet Jump
    if (keys["Space"] && this.jumpCooldown <= 0 && this.isGrounded) {
      this.triggerJump(fxManager);
    }

    // 3. E = Spear Thrust / Throw
    if (keys["KeyE"] && this.spearCooldown <= 0) {
      this.triggerSpear(opponent, fxManager, onScreenShake);
    }

    // 4. G = Grenade Throw
    if (keys["KeyG"] && this.grenadeCooldown <= 0) {
      this.triggerGrenade(opponent, island, fxManager, onScreenShake);
    }

    // Movement: WASD / Arrow keys -> CAMERA-RELATIVE world direction.
    // Forward is the camera's view direction projected onto the ground plane
    // (screen-up), right is forward × up (screen-right). Read fresh every frame
    // so orbiting the camera re-aims the controls instantly.
    const inputForward =
      (keys["KeyW"] || keys["ArrowUp"] ? 1 : 0) -
      (keys["KeyS"] || keys["ArrowDown"] ? 1 : 0);
    const inputRight =
      (keys["KeyD"] || keys["ArrowRight"] ? 1 : 0) -
      (keys["KeyA"] || keys["ArrowLeft"] ? 1 : 0);

    // 5. SHIFT = Neon Dash (fresh press only — holding never re-triggers)
    const shiftDown = !!(keys["ShiftLeft"] || keys["ShiftRight"]);
    if (shiftDown && !this.dashHeld && this.dashCooldown <= 0) {
      let dirX;
      let dirZ;
      if (inputForward !== 0 || inputRight !== 0) {
        // Dash along the current move input (camera-relative)
        const v = this.cameraRelativeMove(camera, inputForward, inputRight);
        dirX = v.x;
        dirZ = v.z;
      } else {
        // Not moving: dash along the current facing (spear/grenade convention)
        dirX = -Math.sin(this.facingAngle);
        dirZ = -Math.cos(this.facingAngle);
      }
      this.triggerDash(dirX, dirZ);
    }
    this.dashHeld = shiftDown;

    if (this.dashTimer > 0) {
      // Burst: override velocity along the dash direction
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) this.dashRecovery = DASH_RECOVERY;
      const burst = P1_MAX_SPEED * DASH_SPEED_MULT;
      this.vel.set(this.dashDir.x * burst, this.dashDir.y * burst);

      this.facingAngle = Math.atan2(-this.dashDir.x, -this.dashDir.y);
      this.groundGroup.rotation.y = this.facingAngle;
      if (this.modelGroup) this.modelGroup.rotation.y = this.facingAngle;
    } else if (inputForward !== 0 || inputRight !== 0) {
      const moveWorld = this.cameraRelativeMove(camera, inputForward, inputRight);
      this.vel.x += moveWorld.x * P1_ACCEL * dt;
      this.vel.y += moveWorld.z * P1_ACCEL * dt;

      // Face the direction of travel on screen
      // (convention: facingAngle -> (-sin, -cos) used by spear/grenade)
      this.facingAngle = Math.atan2(-moveWorld.x, -moveWorld.z);
      this.groundGroup.rotation.y = this.facingAngle;
      if (this.modelGroup) this.modelGroup.rotation.y = this.facingAngle;
    }

    // Friction & speed clamp (knockback impulses slide freely while hitShakeTimer
    // is active; the dash burst and its short recovery bleed above the cap too)
    if (this.dashRecovery > 0) this.dashRecovery -= dt;
    const dampingFactor = Math.max(0, 1 - P1_DAMPING * dt);
    this.vel.multiplyScalar(dampingFactor);

    const currentSpeed = this.vel.length();
    if (
      currentSpeed > P1_MAX_SPEED &&
      this.hitShakeTimer <= 0 &&
      this.dashTimer <= 0 &&
      this.dashRecovery <= 0
    ) {
      this.vel.multiplyScalar(P1_MAX_SPEED / currentSpeed);
    }
  }

  updateAI(opponent, island, dt, fxManager, onScreenShake) {
    const aiDesired = new THREE.Vector2(0, 0);
    const center = island.getActiveCenter();

    const toPlayer = new THREE.Vector2(
      opponent.pos.x - this.pos.x,
      opponent.pos.z - this.pos.z
    );
    const distToPlayer = toPlayer.length();

    // Edge sensing: look ahead along the movement (or facing) direction
    const speed = this.vel.length();
    const moveDirX = speed > 0.15 ? this.vel.x / speed : -Math.sin(this.facingAngle);
    const moveDirZ = speed > 0.15 ? this.vel.y / speed : -Math.cos(this.facingAngle);
    const lookAhead = this.ai.edgeSense * (0.8 + Math.min(1.5, speed * 0.25));
    const forwardX = this.pos.x + moveDirX * lookAhead;
    const forwardZ = this.pos.z + moveDirZ * lookAhead;
    const isEdgeAhead = !island.hasGroundUnder(forwardX, forwardZ);

    // Danger: the tile under us is about to fall (claim-accurate surface lookup)
    const sUnder = island.getSurfaceAt(this.pos.x, this.pos.z);
    const underTile = sUnder ? sUnder.tile : null;
    const tileInDanger = !!(underTile && underTile.state === "warning");

    // First safe direction among candidates: prefers solid (idle) tiles, falls back to any walkable one.
    // Probes are taken from the tile we stand on (tile centers), so edges are never missed.
    const tileBaseX = underTile ? underTile.worldX : this.pos.x;
    const tileBaseZ = underTile ? underTile.worldZ : this.pos.z;
    const findSafeDir = (candidates) => {
      let fallback = null;
      for (const [dx, dz] of candidates) {
        const px = tileBaseX + dx * TILE_SPACING;
        const pz = tileBaseZ + dz * TILE_SPACING;
        const st = island.getSurfaceAt(px, pz);
        if (!st) continue;
        if (st.tile.state === "idle") return new THREE.Vector2(dx, dz);
        if (!fallback) fallback = new THREE.Vector2(dx, dz);
      }
      return fallback;
    };

    // Is a gap in the given direction jumpable (void nearby + landing ground within reach)?
    const jumpableAhead = (wx, wz) =>
      !island.hasGroundUnder(this.pos.x + wx * 0.9, this.pos.z + wz * 0.9) &&
      island.hasGroundUnder(this.pos.x + wx * 2.2, this.pos.z + wz * 2.2);

    // Wander on safe ground, biased toward the opponent (or the arena center)
    const doWander = () => {
      this.aiWanderTimer -= dt;
      if (this.aiWanderTimer <= 0) {
        this.aiWanderTimer = 0.8 + Math.random() * 1.2;
        let picked = false;
        for (let i = 0; i < 10 && !picked; i++) {
          const angle = Math.random() * Math.PI * 2;
          const wx = Math.cos(angle);
          const wz = Math.sin(angle);
          if (
            island.hasGroundUnder(this.pos.x + wx * 1.6, this.pos.z + wz * 1.6) ||
            jumpableAhead(wx, wz)
          ) {
            this.aiWanderDir.set(wx, wz);
            picked = true;
          }
        }
        if (!picked) {
          // Every direction leads into the void — hold position
          this.aiWanderDir.set(0, 0);
        } else {
          // Drift toward the opponent (or the arena center) when safe
          const tx = opponent.state === "alive" ? opponent.pos.x : center.x;
          const tz = opponent.state === "alive" ? opponent.pos.z : center.z;
          const toTarget = new THREE.Vector2(tx - this.pos.x, tz - this.pos.z);
          if (toTarget.length() > 4.0) {
            const blend = new THREE.Vector2().copy(this.aiWanderDir).add(toTarget.normalize()).normalize();
            if (
              island.hasGroundUnder(this.pos.x + blend.x * 1.6, this.pos.z + blend.y * 1.6) ||
              jumpableAhead(blend.x, blend.y)
            ) {
              this.aiWanderDir.copy(blend);
            }
          }
        }
      }
      aiDesired.copy(this.aiWanderDir);
    };

    // AI JUMP DECISION: leap over gaps (following motion, or toward the opponent)
    if (this.isGrounded && this.jumpCooldown <= 0) {
      let dirX = speed > 0.1 ? this.vel.x / speed : 0;
      let dirZ = speed > 0.1 ? this.vel.y / speed : 0;
      const towardOpponent = opponent.state === "alive" && distToPlayer > 2.0 && distToPlayer < this.ai.aggro;
      if (towardOpponent) {
        dirX = toPlayer.x / (distToPlayer || 1);
        dirZ = toPlayer.y / (distToPlayer || 1);
      }
      // Only leap across a gap while actually moving (or chasing the opponent).
      // Probe the ACTUAL landing distance so the jump is guaranteed to reach ground.
      if (towardOpponent || speed > 0.8) {
        // triggerJump adds JUMP_FORWARD_BOOST on top of the current speed
        const jumpSpeed = (towardOpponent ? speed + 1.5 : speed) + 1.2;
        const landDist = jumpSpeed * 0.87;
        const nearAhead = island.hasGroundUnder(this.pos.x + dirX * 0.9, this.pos.z + dirZ * 0.9);
        const landX = this.pos.x + dirX * landDist;
        const landZ = this.pos.z + dirZ * landDist;
        if (!nearAhead && island.hasGroundUnder(landX, landZ)) {
          if (towardOpponent) {
            // Aggressive leap: nudge momentum toward the target so the jump carries across
            this.vel.x += dirX * 1.5;
            this.vel.y += dirZ * 1.5;
          }
          this.triggerJump(fxManager);
        }
      }
    }

    // AI COMBAT ABILITIES: Opponent has full arsenal (Push, Spear, Grenade)
    if (opponent.state === "alive") {
      const angleToOpponent = Math.atan2(-toPlayer.x, -toPlayer.y);

      // 1. Force Push (P): close combat (< PUSH_RADIUS)
      if (
        distToPlayer <= PUSH_RADIUS * 1.15 &&
        this.pushCooldown <= 0 &&
        Math.random() < this.ai.pushChance
      ) {
        this.facingAngle = angleToOpponent;
        if (this.modelGroup) this.modelGroup.rotation.y = this.facingAngle;
        this.groundGroup.rotation.y = this.facingAngle;
        this.triggerPush(opponent, fxManager);
      }
      // 2. Cyber Spear (E): straight line javelin thrust at mid-range (2.2 - 5.5 units)
      else if (
        distToPlayer >= 2.0 &&
        distToPlayer <= 5.5 &&
        this.spearCooldown <= 0 &&
        Math.random() < this.ai.spearChance
      ) {
        this.facingAngle = angleToOpponent;
        if (this.modelGroup) this.modelGroup.rotation.y = this.facingAngle;
        this.groundGroup.rotation.y = this.facingAngle;
        this.triggerSpear(opponent, fxManager, onScreenShake);
      }
      // 3. Cyber Grenade (G): tactical floor explosion at medium-far distance (3.5 - 6.2 units)
      else if (
        distToPlayer >= 3.2 &&
        distToPlayer <= 6.2 &&
        this.grenadeCooldown <= 0 &&
        Math.random() < this.ai.grenadeChance
      ) {
        this.facingAngle = angleToOpponent;
        if (this.modelGroup) this.modelGroup.rotation.y = this.facingAngle;
        this.groundGroup.rotation.y = this.facingAngle;
        this.triggerGrenade(opponent, island, fxManager, onScreenShake);
      }
    }

    if (tileInDanger && this.isGrounded) {
      // Urgent: step off the warning tile onto the safest walkable neighbor
      const dir = findSafeDir(
        [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
      );
      if (dir) {
        aiDesired.copy(dir).multiplyScalar(1.8);
      } else {
        // Trapped on an isolated tile — leap to a reachable tile in a CARDINAL direction
        // (2 or 3 tiles away) with a velocity tuned to the exact landing distance.
        const leapTargets = [[2, 0], [-2, 0], [0, 2], [0, -2], [3, 0], [-3, 0], [0, 3], [0, -3]];
        let best = null;
        let fallback = null;
        for (const [gdx, gdz] of leapTargets) {
          const px = tileBaseX + gdx * TILE_SPACING;
          const pz = tileBaseZ + gdz * TILE_SPACING;
          const st = island.getSurfaceAt(px, pz);
          if (!st) continue;
          if (st.tile.state === "idle" && !best) {
            best = { gdx, gdz, dist: Math.hypot(gdx, gdz) * TILE_SPACING };
            break;
          }
          if (!fallback) fallback = { gdx, gdz, dist: Math.hypot(gdx, gdz) * TILE_SPACING };
        }
        const target = best || fallback;
        if (target && this.jumpCooldown <= 0) {
          const dirLen = Math.hypot(target.gdx, target.gdz) || 1;
          // triggerJump adds JUMP_FORWARD_BOOST — account for it in the velocity
          const need = Math.max(0.5, target.dist / 0.87 - 1.2);
          this.vel.set((target.gdx / dirLen) * need, (target.gdz / dirLen) * need);
          this.facingAngle = Math.atan2(-target.gdx, -target.gdz);
          this.triggerJump(fxManager);
        }
      }
    } else if (isEdgeAhead) {
      // Walk along the edge: pick the perpendicular with safe ground (probed from tile centers)
      const perpA = new THREE.Vector2(-moveDirZ, moveDirX);
      const perpB = new THREE.Vector2(moveDirZ, -moveDirX);
      const aSafe = island.hasGroundUnder(tileBaseX + perpA.x * TILE_SPACING, tileBaseZ + perpA.y * TILE_SPACING);
      const bSafe = island.hasGroundUnder(tileBaseX + perpB.x * TILE_SPACING, tileBaseZ + perpB.y * TILE_SPACING);
      if (aSafe && bSafe) {
        const sign = Math.round(Math.abs(this.pos.x * 3.1 + this.pos.z * 1.7)) % 2 === 0 ? 1 : -1;
        aiDesired.copy(sign > 0 ? perpA : perpB).multiplyScalar(1.5);
      } else if (aSafe) {
        aiDesired.copy(perpA).multiplyScalar(1.5);
      } else if (bSafe) {
        aiDesired.copy(perpB).multiplyScalar(1.5);
      } else {
        // Narrow ledge with void on both sides — reverse course
        aiDesired.set(-moveDirX, -moveDirZ);
      }
    } else if (opponent.state === "alive") {
      // Hunt the player whenever the direct path is safe (or jumpable)
      const huntDir = toPlayer.clone().normalize();
      const safeDirect =
        island.hasGroundUnder(this.pos.x + huntDir.x * 1.6, this.pos.z + huntDir.y * 1.6) ||
        jumpableAhead(huntDir.x, huntDir.y);
      if (safeDirect && distToPlayer > 1.0) {
        aiDesired.copy(huntDir);
        if (distToPlayer < 1.3) {
          aiDesired.multiplyScalar(1.4);
        }
      } else {
        doWander();
      }
    } else {
      doWander();
    }

    // Hard bots dodge incoming spears aimed at them (overrides other steering)
    if (this.ai.dodge && fxManager) {
      for (const s of fxManager.spears) {
        if (s.targetRobot === this) {
          const dx = this.pos.x - s.group.position.x;
          const dz = this.pos.z - s.group.position.z;
          if (Math.hypot(dx, dz) < 3.6) {
            const perpX = -s.dirZ;
            const perpZ = s.dirX;
            const d1 = island.hasGroundUnder(this.pos.x + perpX * 1.2, this.pos.z + perpZ * 1.2);
            const d2 = island.hasGroundUnder(this.pos.x - perpX * 1.2, this.pos.z - perpZ * 1.2);
            if (d1 && d2) {
              aiDesired.set(perpX * (Math.random() > 0.5 ? 1 : -1), perpZ * (Math.random() > 0.5 ? 1 : -1));
            } else if (d1) {
              aiDesired.set(perpX, perpZ);
            } else if (d2) {
              aiDesired.set(-perpX, -perpZ);
            }
            break;
          }
        }
      }

      // Step out of incoming grenade blast zones
      for (const p of fxManager.projectiles) {
        if (p.indicatorMat && p.elapsed < p.flightTime) {
          const dx = this.pos.x - p.targetX;
          const dz = this.pos.z - p.targetZ;
          if (Math.hypot(dx, dz) < GRENADE_RADIUS + 0.7) {
            const dir = findSafeDir(
              [[dx, dz], [dx, 0], [0, dz], [-dx, -dz], [dx, -dz], [-dx, dz]]
            );
            if (dir) {
              aiDesired.copy(dir).multiplyScalar(1.6);
              break;
            }
          }
        }
      }
    }

    // Avoid stepping onto tiles that are about to fall
    if (this.isGrounded && aiDesired.lengthSq() > 0) {
      const d = aiDesired.clone().normalize();
      const stAhead = island.getSurfaceAt(this.pos.x + d.x * 1.0, this.pos.z + d.y * 1.0);
      if (stAhead && stAhead.tile.state === "warning") {
        const alt = findSafeDir(
          [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
        );
        if (alt) aiDesired.copy(alt).multiplyScalar(1.5);
      }
    }

    if (aiDesired.lengthSq() > 0) {
      aiDesired.normalize();
      this.vel.x += aiDesired.x * this.ai.accel * dt;
      this.vel.y += aiDesired.y * this.ai.accel * dt;

      this.facingAngle = Math.atan2(-aiDesired.x, -aiDesired.y);
      this.groundGroup.rotation.y = this.facingAngle;
      if (this.modelGroup) this.modelGroup.rotation.y = this.facingAngle;
    }

    // Emergency brake (AFTER acceleration): never walk into a missing neighboring
    // tile — gaps are crossed by jumping, not by walking off the edge.
    if (this.isGrounded && underTile) {
      if (this.vel.x > 0 && !island.hasGroundUnder(tileBaseX + TILE_SPACING, this.pos.z)) this.vel.x = 0;
      if (this.vel.x < 0 && !island.hasGroundUnder(tileBaseX - TILE_SPACING, this.pos.z)) this.vel.x = 0;
      if (this.vel.y > 0 && !island.hasGroundUnder(this.pos.x, tileBaseZ + TILE_SPACING)) this.vel.y = 0;
      if (this.vel.y < 0 && !island.hasGroundUnder(this.pos.x, tileBaseZ - TILE_SPACING)) this.vel.y = 0;
    }

    const dampingFactor = Math.max(0, 1 - AI_DAMPING * dt);
    this.vel.multiplyScalar(dampingFactor);

    const currentSpeed = this.vel.length();
    // Skip the clamp while knocked back so push/spear/grenade impulses land properly
    if (currentSpeed > this.ai.maxSpeed && this.hitShakeTimer <= 0) {
      this.vel.multiplyScalar(this.ai.maxSpeed / currentSpeed);
    }
  }

  // Drive this robot from a remote player's input (online host applies
  // the guest's input to its p2). `input` = { mx, mz, jump, push, spear, grenade, dash }
  // where (mx, mz) is the guest's camera-relative move vector in WORLD space
  // (already transformed on the guest side with its own camera).
  updateRemoteInput(input, dt, opponent, island, fxManager, onScreenShake) {
    if (input.push && this.pushCooldown <= 0) {
      this.triggerPush(opponent, fxManager);
    }
    if (input.jump && this.jumpCooldown <= 0 && this.isGrounded) {
      this.triggerJump(fxManager);
    }
    if (input.spear && this.spearCooldown <= 0) {
      this.triggerSpear(opponent, fxManager, onScreenShake);
    }
    if (input.grenade && this.grenadeCooldown <= 0) {
      this.triggerGrenade(opponent, island, fxManager, onScreenShake);
    }

    const mx = input.mx || 0;
    const mz = input.mz || 0;
    const len = Math.hypot(mx, mz);

    // Remote dash: fresh press only (the guest sends dash on key-down and
    // dash:false on key-up, so holding the key never re-triggers)
    if (input.dash && this.dashCooldown <= 0 && !this.remoteDashHeld) {
      let dirX;
      let dirZ;
      if (len > 0.001) {
        dirX = mx / len;
        dirZ = mz / len;
      } else {
        dirX = -Math.sin(this.facingAngle);
        dirZ = -Math.cos(this.facingAngle);
      }
      this.triggerDash(dirX, dirZ);
    }
    this.remoteDashHeld = !!input.dash;

    if (this.dashTimer > 0) {
      // Burst: override velocity along the dash direction
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) this.dashRecovery = DASH_RECOVERY;
      const burst = P1_MAX_SPEED * DASH_SPEED_MULT;
      this.vel.set(this.dashDir.x * burst, this.dashDir.y * burst);

      this.facingAngle = Math.atan2(-this.dashDir.x, -this.dashDir.y);
      this.groundGroup.rotation.y = this.facingAngle;
      if (this.modelGroup) this.modelGroup.rotation.y = this.facingAngle;
    } else if (len > 0.001) {
      const nx = mx / len;
      const nz = mz / len;
      this.vel.x += nx * P1_ACCEL * dt;
      this.vel.y += nz * P1_ACCEL * dt;

      // Same facing convention as the local player
      // (facingAngle -> (-sin, -cos) used by spear/grenade)
      this.facingAngle = Math.atan2(-nx, -nz);
      this.groundGroup.rotation.y = this.facingAngle;
      if (this.modelGroup) this.modelGroup.rotation.y = this.facingAngle;
    }

    // Friction & speed clamp (identical to the local player path)
    if (this.dashRecovery > 0) this.dashRecovery -= dt;
    const dampingFactor = Math.max(0, 1 - P1_DAMPING * dt);
    this.vel.multiplyScalar(dampingFactor);

    const currentSpeed = this.vel.length();
    if (
      currentSpeed > P1_MAX_SPEED &&
      this.hitShakeTimer <= 0 &&
      this.dashTimer <= 0 &&
      this.dashRecovery <= 0
    ) {
      this.vel.multiplyScalar(P1_MAX_SPEED / currentSpeed);
    }
  }

  // Store the latest authoritative pose from the host (online guest only).
  // pose = { x, y, z, f, vx, vz, st, cd: [push, jump, spear, grenade, dash] }
  setNetPose(pose) {
    this.netPose = pose;
    if (pose.cd) {
      this.pushCooldown = pose.cd[0] || 0;
      this.jumpCooldown = pose.cd[1] || 0;
      this.spearCooldown = pose.cd[2] || 0;
      this.grenadeCooldown = pose.cd[3] || 0;
      this.dashCooldown = pose.cd[4] || 0;
    }
    // Don't stomp a locally predicted hop: while we are mid-air locally the
    // host's pose (one RTT behind) still reports the robot as grounded.
    if (pose.st !== "alive") {
      this.isGrounded = false;
    } else if (!this.predictingHop) {
      this.isGrounded = true;
    }
  }

  // Smoothly drive the visual state toward the host's snapshot (online guest
  // does not simulate authoritative physics — it renders with interpolation).
  // inputActive = the guest is steering right now: correction is gentler so
  // local prediction is not pulled back by snapshots that are one RTT old.
  netTick(dt, inputActive = false, island = null) {
    this.updateDashVisuals(dt); // dash afterimages tick for both robots on the guest
    const pose = this.netPose;
    if (!pose) {
      // Never received a snapshot yet — keep the spawn pose
      this.group.position.copy(this.pos);
      return;
    }

    // State transitions (host-authoritative)
    if (pose.st !== "alive" && this.state === "alive") {
      if (pose.st === "eliminated") {
        this.state = "eliminated";
        this.group.visible = false;
      } else {
        this.startFalling();
      }
    }

    // Exponential smoothing toward the latest snapshot (≈1 snapshot of lag,
    // robust to jitter). While steering, correct drift only slowly.
    this._netTarget.set(pose.x, pose.y, pose.z);
    const k = 1 - Math.exp(-dt * (inputActive ? 1.8 : 14));
    const surf = island ? island.getSurfaceAt(this.pos.x, this.pos.z) : null;
    const surfY = surf ? surf.y : 0;
    // The host is genuinely mid-HOP (not just off a ledge or standing on a
    // platform): above the local surface with its grounded flag false. Only
    // then keep the local Y; drops and platform walking follow the host.
    const hostAirborne =
      pose.st === "alive" && pose.g === 0 && pose.y > surfY + 0.2;
    if ((!this.isGrounded && this.state === "alive") || hostAirborne) {
      // Predicted hop in flight: keep the local Y, only correct X/Z gently.
      this.pos.x += (pose.x - this.pos.x) * k;
      this.pos.z += (pose.z - this.pos.z) * k;
    } else {
      this.pos.lerp(this._netTarget, k);
    }

    // Shortest-arc facing interpolation (skip while steering: the local
    // prediction owns the facing, the snapshot is one RTT behind)
    if (!inputActive) {
      let df = pose.f - this.facingAngle;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      this.facingAngle += df * k;
    }

    // Walk bob from the host-reported velocity
    const speed = Math.hypot(pose.vx || 0, pose.vz || 0);
    if (speed > 0.1 && this.state === "alive") {
      this.walkPhase += speed * dt * 10;
    }

    if (this.state === "alive") {
      const bobOffset = Math.abs(Math.sin(this.walkPhase)) * 0.08;
      this.group.position.copy(this.pos);
      this.groundGroup.rotation.y = this.facingAngle;
      if (this.modelGroup) {
        this.modelGroup.rotation.y = this.facingAngle;
        this.modelGroup.position.y = bobOffset;
        if (this.viber) {
          const sw = Math.sin(this.walkPhase) * 0.5;
          this.viber.legL.rotation.x = sw;
          this.viber.legR.rotation.x = -sw;
          this.viber.armL.rotation.x = -sw * 0.6;
          this.viber.armR.rotation.x = sw * 0.6;
        }
      }
    } else if (this.state === "falling") {
      // Local tumble while the position follows the host's falling pose
      this.group.rotation.x += this.angVelX * dt;
      this.group.rotation.y += this.angVelY * dt;
      this.group.rotation.z += this.angVelZ * dt;
      this.group.position.copy(this.pos);
      if (this.pos.y < VOID_KILL_Y + 1) {
        this.state = "eliminated";
        this.group.visible = false;
      }
    }
  }

  update(dt, camera, island, opponent, keys, fxManager, onScreenShake, remoteInput = null) {
    // Tick cooldowns
    if (this.jumpCooldown > 0) {
      this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    }
    if (this.pushCooldown > 0) {
      this.pushCooldown = Math.max(0, this.pushCooldown - dt);
    }
    if (this.spearCooldown > 0) {
      this.spearCooldown = Math.max(0, this.spearCooldown - dt);
    }
    if (this.grenadeCooldown > 0) {
      this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
    }
    if (this.dashCooldown > 0) {
      this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    }

    // Dash afterimage trail (visual only, cheap)
    this.updateDashVisuals(dt);

    // Animate radial push shockwave
    if (this.pushWaveTimer > 0) {
      this.pushWaveTimer -= dt;
      const progress = 1.0 - Math.max(0, this.pushWaveTimer) / 0.28;
      const scale = 0.4 + progress * 4.2;
      this.waveMesh.scale.set(scale, scale, scale);
      this.waveMat.opacity = (1.0 - progress) * 0.95;
      if (this.pushWaveTimer <= 0) {
        this.waveMesh.visible = false;
      }
    }

    // In-world cooldown indicator ring (Player 1)
    if (this.isPlayer && this.cdMesh) {
      if (this.pushCooldown > 0) {
        const progress = 1.0 - this.pushCooldown / PUSH_COOLDOWN;
        this.cdMesh.scale.setScalar(0.72 + progress * 0.28);
        this.cdMat.opacity = 0.25 + progress * 0.55;
        this.cdMat.color.setHex(0x475569);
      } else {
        const pulse = 0.75 + 0.25 * Math.sin(performance.now() * 0.008);
        this.cdMesh.scale.setScalar(1.0);
        this.cdMat.opacity = pulse;
        this.cdMat.color.setHex(this.teamColor);
      }
    }

    if (this.state === "alive") {
      if (this.isPlayer) {
        this.updatePlayerInput(camera, keys, dt, opponent, island, fxManager, onScreenShake);
      } else if (remoteInput) {
        this.updateRemoteInput(remoteInput, dt, opponent, island, fxManager, onScreenShake);
      } else {
        this.updateAI(opponent, island, dt, fxManager, onScreenShake);
      }

      // Horizontal movement with per-axis ledge/wall blocking
      const tryX = this.pos.x + this.vel.x * dt;
      const sx = island.getSurfaceAt(tryX, this.pos.z);
      if (sx && this.blockedBySurface(sx.y)) {
        this.vel.x = 0;
      } else {
        this.pos.x = tryX;
      }

      const tryZ = this.pos.z + this.vel.y * dt;
      const sz = island.getSurfaceAt(this.pos.x, tryZ);
      if (sz && this.blockedBySurface(sz.y)) {
        this.vel.y = 0;
      } else {
        this.pos.z = tryZ;
      }

      const s = island.getSurfaceAt(this.pos.x, this.pos.z);

      if (this.isGrounded) {
        if (!s) {
          // Walked off the edge into the void
          this.startFalling();
        } else {
          const dy = s.y - this.pos.y;
          if (dy > STEP_UP_MAX) {
            // Pinned against a too-tall ledge (axes already blocked)
          } else if (dy < -STEP_UP_MAX) {
            // Stepped off a high ledge — drop down
            this.isGrounded = false;
            this.vy = -0.5;
          } else {
            this.pos.y = s.y; // Walkable step: snap to the surface
          }
        }
      } else {
        // Aerial jump / ledge drop physics
        this.vy -= GRAVITY * dt;
        this.pos.y += this.vy * dt;

        if (s && this.pos.y <= s.y && this.vy <= 0) {
          // Land on the surface below
          this.pos.y = s.y;
          this.vy = 0;
          this.isGrounded = true;
          audio.playLand();
          if (fxManager) {
            fxManager.spawnLandingRing(this.pos.x, this.pos.y, this.pos.z, this.teamColor);
          }
        } else if (!s && this.pos.y <= -0.4) {
          // Descended below the lowest island level over a hole — fall into the abyss
          this.startFalling();
        }
      }

      // Walking bob animation
      const speed = this.vel.length();
      if (speed > 0.1 && this.isGrounded) {
        this.walkPhase += speed * dt * 10;
      }
      const bobOffset = this.isGrounded ? Math.abs(Math.sin(this.walkPhase)) * 0.08 : 0;

      // Hit shake
      let shakeX = 0;
      if (this.hitShakeTimer > 0) {
        this.hitShakeTimer -= dt;
        shakeX = (Math.random() - 0.5) * 0.1;
      }

      // Attack lunge scale pulse
      let lungeScale = 1.0;
      if (this.pushLungeTimer > 0) {
        this.pushLungeTimer -= dt;
        lungeScale = 1.0 + (this.pushLungeTimer / 0.16) * 0.25;
      }

      // Update 3D model transforms
      if (this.has3DModel && this.modelGroup) {
        this.modelGroup.position.y = bobOffset;
        this.modelGroup.position.x = shakeX;
        this.modelGroup.scale.setScalar(lungeScale);
        // Walk animation: swing legs and arms
        if (this.viber) {
          const sw = this.isGrounded ? Math.sin(this.walkPhase) * 0.5 : 0.3;
          this.viber.legL.rotation.x = sw;
          this.viber.legR.rotation.x = -sw;
          this.viber.armL.rotation.x = -sw * 0.6;
          this.viber.armR.rotation.x = sw * 0.6;
        }
      }

      this.group.position.x = this.pos.x;
      this.group.position.z = this.pos.z;
      this.group.position.y = this.pos.y;
    } else if (this.state === "falling") {
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;

      this.pos.x += this.vel.x * dt * 0.7;
      this.pos.z += this.vel.y * dt * 0.7;

      this.group.rotation.x += this.angVelX * dt;
      this.group.rotation.y += this.angVelY * dt;
      this.group.rotation.z += this.angVelZ * dt;

      this.group.position.copy(this.pos);

      if (this.pos.y < VOID_KILL_Y) {
        this.state = "eliminated";
        this.group.visible = false;
      }
    }
  }

  // Can the robot horizontally enter a tile whose surface is at surfaceY?
  blockedBySurface(surfaceY) {
    if (surfaceY <= this.pos.y) return false; // Above or level with the surface
    const dy = surfaceY - this.pos.y;
    if (this.isGrounded) {
      return dy > STEP_UP_MAX; // Grounded robots can walk up small steps
    }
    if (this.vy > 0) {
      // Rising: allow entry near the ledge top (step-up assist) or when the arc can clear it
      if (this.pos.y >= surfaceY - 0.45) return false;
      const apex = this.pos.y + (this.vy * this.vy) / (2 * GRAVITY);
      return apex < surfaceY - 0.05;
    }
    // Falling: block only while the body still overlaps the tile slab
    return surfaceY - TILE_HEIGHT < this.pos.y + ROBOT_BODY_HEIGHT;
  }

  // Camera-relative movement direction on the ground (XZ) plane.
  // forwardInput > 0 = away from the camera (screen-up), rightInput > 0 = screen-right.
  cameraRelativeMove(camera, forwardInput, rightInput) {
    const fwd = new THREE.Vector3();
    if (camera && camera.getWorldDirection) {
      camera.getWorldDirection(fwd);
    } else {
      fwd.set(0, 0, -1);
    }
    fwd.y = 0; // project onto the ground plane
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); // looking straight down: pick a sane default
    fwd.normalize();

    // right = forward × up = (-fwd.z, 0, fwd.x)
    const move = new THREE.Vector3(-fwd.z * rightInput + fwd.x * forwardInput, 0, fwd.x * rightInput + fwd.z * forwardInput);
    if (move.lengthSq() > 1e-6) move.normalize();
    return move;
  }

  // Get status for all abilities
  getAbilityStatus() {
    return {
      jump: {
        ready: this.jumpCooldown <= 0 && this.isGrounded,
        remaining: this.jumpCooldown,
        max: JUMP_COOLDOWN,
        progress: Math.min(1.0, Math.max(0, 1.0 - this.jumpCooldown / JUMP_COOLDOWN)),
      },
      push: {
        ready: this.pushCooldown <= 0,
        remaining: this.pushCooldown,
        max: PUSH_COOLDOWN,
        progress: Math.min(1.0, Math.max(0, 1.0 - this.pushCooldown / PUSH_COOLDOWN)),
      },
      spear: {
        ready: this.spearCooldown <= 0,
        remaining: this.spearCooldown,
        max: SPEAR_COOLDOWN,
        progress: Math.min(1.0, Math.max(0, 1.0 - this.spearCooldown / SPEAR_COOLDOWN)),
      },
      grenade: {
        ready: this.grenadeCooldown <= 0,
        remaining: this.grenadeCooldown,
        max: GRENADE_COOLDOWN,
        progress: Math.min(1.0, Math.max(0, 1.0 - this.grenadeCooldown / GRENADE_COOLDOWN)),
      },
      dash: {
        ready: this.dashCooldown <= 0,
        remaining: this.dashCooldown,
        max: DASH_COOLDOWN,
        progress: Math.min(1.0, Math.max(0, 1.0 - this.dashCooldown / DASH_COOLDOWN)),
      },
    };
  }

  dispose() {
    this.clearDashGhosts();
    this.scene.remove(this.group);
  }
}
