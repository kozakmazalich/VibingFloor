import * as THREE from "three";
import {
  TILE_SIZE,
  TILE_HEIGHT,
  TILE_SPACING,
  WARNING_DURATION,
  GRAVITY,
  VOID_KILL_Y,
  LEVEL_STEP,
  QUAKE_CRACK_TIME,
  COLORS,
} from "./constants.js";
import { audio } from "./audio.js";
import { buildDecor } from "./decor.js";

// Reusable shared geometries to maximize GPU efficiency on M1
const baseBoxGeometry = new THREE.BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE);
const topPlateGeometry = new THREE.BoxGeometry(
  TILE_SIZE * 0.94,
  0.04,
  TILE_SIZE * 0.94
);
const topEdgeGeometry = new THREE.EdgesGeometry(topPlateGeometry);
const underglowGeometry = new THREE.PlaneGeometry(
  TILE_SIZE * 0.9,
  TILE_SIZE * 0.9
);
const cyberCoreGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 6);
const crackPlaneGeo = new THREE.PlaneGeometry(TILE_SIZE * 0.92, TILE_SIZE * 0.92);

// One shared crack mask. Per-tile materials tint it; the texture is never disposed.
let crackTexture = null;
function getCrackTexture() {
  if (crackTexture) return crackTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, 128, 128);
  g.lineCap = "round";
  g.lineJoin = "round";
  g.strokeStyle = "rgba(255,255,255,0.95)";
  g.shadowColor = "#ff2d95";
  g.shadowBlur = 8;
  g.lineWidth = 2.2;
  const cx = 64;
  const cy = 64;
  for (let i = 0; i < 8; i++) {
    let ang = (i / 8) * Math.PI * 2 + 0.2;
    let x = cx;
    let y = cy;
    g.beginPath();
    g.moveTo(cx, cy);
    for (let s = 0; s < 4; s++) {
      ang += s % 2 === 0 ? 0.45 : -0.32;
      x += Math.cos(ang) * (16 + s * 3);
      y += Math.sin(ang) * (16 + s * 3);
      g.lineTo(x, y);
    }
    g.stroke();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang + 1.15) * 14, y + Math.sin(ang + 1.15) * 14);
    g.stroke();
  }
  crackTexture = new THREE.CanvasTexture(canvas);
  crackTexture.colorSpace = THREE.SRGBColorSpace;
  return crackTexture;
}

export class Tile {
  constructor(gx, gz, scene, gridSize = 10, elevation = 0, theme = null, decorDef = null) {
    this.gx = gx; // Grid X
    this.gz = gz; // Grid Z
    this.gridSize = gridSize;
    this.scene = scene;
    this.elevation = elevation; // Raised platform level (0 = base)

    // Center coordinates in 3D world space
    const centerOffset = (gridSize - 1) / 2;
    this.worldX = (gx - centerOffset) * TILE_SPACING;
    this.worldZ = (gz - centerOffset) * TILE_SPACING;
    this.distFromCenter = Math.hypot(this.worldX, this.worldZ);

    // Colors: per-map neon theme overrides, otherwise global palette
    this.theme = theme || null;
    const edgeColor = (this.theme && this.theme.edge) || COLORS.tileEdge;
    const underglowColor = (this.theme && this.theme.underglow) || COLORS.tileUnderglow;
    const coreColor = (this.theme && this.theme.core) || COLORS.tileEdge;
    const topColor = (this.theme && this.theme.top) || COLORS.tileTop;

    // States: "idle" | "warning" | "falling" | "dead"
    this.state = "idle";
    this.warningTimer = 0;

    // Motion physics during fall
    this.vy = 0;
    this.angVelX = (Math.random() - 0.5) * 2.5;
    this.angVelZ = (Math.random() - 0.5) * 2.5;
    this.isDead = false;

    // Create 3D group and meshes
    this.group = new THREE.Group();
    this.group.userData.isTile = true;
    this.group.position.set(this.worldX, elevation * LEVEL_STEP, this.worldZ);

    // 1. Dark cyber base block
    this.baseMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.tileBase,
      roughness: 0.65,
      metalness: 0.45,
    });
    this.baseMesh = new THREE.Mesh(baseBoxGeometry, this.baseMaterial);
    this.baseMesh.position.y = -TILE_HEIGHT / 2;
    this.baseMesh.castShadow = true;
    this.baseMesh.receiveShadow = true;
    this.group.add(this.baseMesh);

    // 2. High-tech top faceplate
    this.topMaterial = new THREE.MeshStandardMaterial({
      color: topColor,
      roughness: 0.25,
      metalness: 0.65,
      emissive: coreColor,
      emissiveIntensity: 0.22,
    });
    this.topMesh = new THREE.Mesh(topPlateGeometry, this.topMaterial);
    this.topMesh.position.y = -0.02; // Sits flush on top
    this.topMesh.receiveShadow = true;
    this.group.add(this.topMesh);

    // 3. Glowing neon edge outlines
    this.edgeMaterial = new THREE.LineBasicMaterial({
      color: edgeColor,
      transparent: true,
      opacity: 0.85,
    });
    this.edgeMesh = new THREE.LineSegments(topEdgeGeometry, this.edgeMaterial);
    this.edgeMesh.position.y = -0.02;
    this.group.add(this.edgeMesh);

    // 4. Central hexagonal cyber energy conduit
    this.coreMaterial = new THREE.MeshStandardMaterial({
      color: 0x080c18,
      emissive: coreColor,
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0.8,
    });
    this.coreMesh = new THREE.Mesh(cyberCoreGeometry, this.coreMaterial);
    this.coreMesh.position.y = 0.005;
    this.group.add(this.coreMesh);

    // 5. Ethereal levitation under-glow
    this.underglowMaterial = new THREE.MeshBasicMaterial({
      color: underglowColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.underglowMesh = new THREE.Mesh(underglowGeometry, this.underglowMaterial);
    this.underglowMesh.rotation.x = Math.PI / 2;
    this.underglowMesh.position.y = -TILE_HEIGHT - 0.02;
    this.group.add(this.underglowMesh);

    // 6. Optional arena decoration (palm, crystal, antenna, lamp, rock...)
    if (decorDef) {
      const decor = buildDecor(decorDef);
      if (decor) {
        decor.position.y = 0.02; // Sit on top of the tile faceplate
        decor.name = decorDef.type;
        decor.userData.decorType = decorDef.type;
        this.group.add(decor);
      }
    }

    // Add to 3D scene
    this.scene.add(this.group);
  }

  // World Y of this tile's walkable top face
  get surfaceY() {
    return this.elevation * LEVEL_STEP + 0.02;
  }

  // Is this tile safe to stand on?
  isWalkable() {
    return this.state === "idle" || this.state === "warning";
  }

  // Is this tile fully active?
  isIdle() {
    return this.state === "idle";
  }

  // Start shaking & flashing warning before falling
  startWarning() {
    if (this.state !== "idle") return;
    this.state = "warning";
    this.warningTimer = WARNING_DURATION;

    // Switch to hot neon warning color
    this.edgeMaterial.color.setHex(COLORS.tileWarning);
    this.underglowMaterial.color.setHex(COLORS.tileWarning);
    if (this.coreMaterial) {
      this.coreMaterial.emissive.setHex(COLORS.tileWarning);
      this.coreMaterial.emissiveIntensity = 2.0;
    }

    audio.playWarning();
  }

  // Drop the tile into the abyss
  startFalling() {
    if (this.state === "falling" || this.state === "dead" || this.state === "cracking") return;
    this.state = "falling";
    this.vy = -1.5; // Initial downward nudge
    audio.playTileFall();
  }

  // Quake: crack in place, then hide the tile and hand it to the debris burst.
  // Gameplay treats it as gone (not walkable) the moment the crack starts.
  // The whole-tile tumble stays on collapseInstantly for grenades.
  beginShatter(onBurst) {
    if (this.state === "falling" || this.state === "dead" || this.state === "cracking" || this.isDead) {
      return false;
    }
    this.state = "cracking";
    this.crackTimer = QUAKE_CRACK_TIME * (0.85 + Math.random() * 0.35);
    this._onShatter = onBurst || null;

    this.group.position.set(this.worldX, this.elevation * LEVEL_STEP, this.worldZ);
    this.group.rotation.set(0, 0, 0);
    this.topMaterial.emissive.setHex(0xfff4ff);
    this.topMaterial.emissiveIntensity = 1.8;
    this.edgeMaterial.color.setHex(0xff2d95);
    if (this.coreMaterial) {
      this.coreMaterial.emissive.setHex(0xff2d95);
      this.coreMaterial.emissiveIntensity = 2.2;
    }

    this.crackMat = new THREE.MeshBasicMaterial({
      map: getCrackTexture(),
      color: 0xff4db0,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.crackMesh = new THREE.Mesh(crackPlaneGeo, this.crackMat);
    this.crackMesh.rotation.x = -Math.PI / 2;
    this.crackMesh.position.y = 0.04;
    this.group.add(this.crackMesh);
    return true;
  }

  _finishShatter() {
    const cb = this._onShatter;
    this._onShatter = null;
    if (this.crackMesh) {
      this.group.remove(this.crackMesh);
      this.crackMesh = null;
    }
    if (this.crackMat) {
      this.crackMat.dispose();
      this.crackMat = null;
    }
    this.group.visible = false;
    this.state = "dead";
    this.isDead = true;
    if (cb) cb(this);
  }

  // Destroyed by weapon explosion — collapses immediately
  collapseInstantly() {
    if (this.state === "falling" || this.state === "dead" || this.state === "cracking") return;
    this.state = "falling";
    this.vy = -7.5; // High velocity downward plunge
    this.angVelX = (Math.random() - 0.5) * 5.0;
    this.angVelZ = (Math.random() - 0.5) * 5.0;
    this.edgeMaterial.color.setHex(COLORS.tileWarning);
    this.underglowMaterial.color.setHex(COLORS.tileWarning);
    this.topMaterial.emissive.setHex(COLORS.tileWarning);
    this.topMaterial.emissiveIntensity = 1.5;
    if (this.coreMaterial) {
      this.coreMaterial.emissive.setHex(COLORS.tileWarning);
      this.coreMaterial.emissiveIntensity = 2.5;
    }
    audio.playTileFall();
  }

  update(dt) {
    if (this.state === "idle") {
      // Dynamic cyber wave pulse traveling through the platform grid
      const time = performance.now() * 0.0025;
      const wave = 0.5 + 0.5 * Math.sin(time * 3.0 - this.distFromCenter * 0.65);

      this.edgeMaterial.opacity = 0.65 + wave * 0.35;
      this.topMaterial.emissiveIntensity = 0.15 + wave * 0.3;
      this.underglowMaterial.opacity = 0.2 + wave * 0.25;
      if (this.coreMaterial) {
        this.coreMaterial.emissiveIntensity = 0.45 + wave * 0.65;
      }
    } else if (this.state === "warning") {
      this.warningTimer -= dt;

      // Shake animation
      const progress = 1.0 - this.warningTimer / WARNING_DURATION;
      const shakeIntensity = 0.04 + progress * 0.06;
      const shakeFreq = 48;
      const time = performance.now() * 0.001;

      this.group.position.x =
        this.worldX + Math.sin(time * shakeFreq) * shakeIntensity;
      this.group.position.z =
        this.worldZ + Math.cos(time * shakeFreq * 1.3) * shakeIntensity;
      this.group.position.y = -Math.abs(Math.sin(time * shakeFreq * 2)) * 0.04;

      // Intense neon warning strobe
      const pulse = 0.5 + 0.5 * Math.sin(time * 30);
      this.topMaterial.emissive.setHex(COLORS.tileWarning);
      this.topMaterial.emissiveIntensity = 0.7 + pulse * 0.9;
      this.baseMaterial.emissive.setHex(COLORS.tileWarningGlow);
      this.baseMaterial.emissiveIntensity = 0.3 + pulse * 0.5;

      this.edgeMaterial.opacity = 0.8 + pulse * 0.2;
      this.underglowMaterial.opacity = 0.4 + pulse * 0.4;
      if (this.coreMaterial) {
        this.coreMaterial.emissiveIntensity = 1.2 + pulse * 1.5;
      }

      if (this.warningTimer <= 0) {
        this.startFalling();
      }
    } else if (this.state === "cracking") {
      this.crackTimer -= dt;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.045);
      this.topMaterial.emissive.setHex(pulse > 0.55 ? 0xfff6ff : 0xff2d95);
      this.topMaterial.emissiveIntensity = 1.3 + pulse * 1.5;
      this.edgeMaterial.color.setHex(0xff2d95);
      this.edgeMaterial.opacity = 0.75 + pulse * 0.25;
      if (this.crackMat) this.crackMat.opacity = 0.35 + pulse * 0.6;
      const j = Math.sin(performance.now() * 0.06) * 0.018;
      this.group.position.x = this.worldX + j;
      this.group.position.z = this.worldZ - j * 0.6;
      if (this.crackTimer <= 0) this._finishShatter();
    } else if (this.state === "falling") {
      // Free fall gravity
      this.vy -= GRAVITY * dt;
      this.group.position.y += this.vy * dt;

      // Subtle tumbling rotation
      this.group.rotation.x += this.angVelX * dt;
      this.group.rotation.z += this.angVelZ * dt;

      // Fade out underglow as tile drops
      this.underglowMaterial.opacity = Math.max(
        0,
        this.underglowMaterial.opacity - dt * 2
      );

      // Once deep in the void, mark as dead and cleanup
      if (this.group.position.y < VOID_KILL_Y) {
        this.state = "dead";
        this.isDead = true;
        this.dispose();
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.baseMaterial.dispose();
    this.topMaterial.dispose();
    this.edgeMaterial.dispose();
    this.underglowMaterial.dispose();
    if (this.coreMaterial) this.coreMaterial.dispose();
    if (this.crackMat) this.crackMat.dispose();
  }
}
