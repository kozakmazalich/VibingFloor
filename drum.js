/**
 * VIB PRIZE DRUM — Post-Win 3D Reward Wheel for "VIBING FLOOR"
 * -------------------------------------------------------------
 * Pure ES Module. Zero external dependencies beyond 'three' via importmap.
 * Designed for 60fps on MacBook Air M1 (no bloom, no lights, pre-cached textures,
 * reused geometry, single-draw-call particle burst).
 */

import * as THREE from 'three';

// ============================================================================
// 1. PRIZE TIERS CONFIGURATION
// ============================================================================
// Comment out or delete the first line to guarantee a minimum 100 $VIB payout.
// Cumulative weight calculation automatically normalizes whatever remains.
export const PRIZE_TIERS = [
  { amount: 0,       label: "NO WIN",    chance: 18   }, // <-- Delete this single line to always pay >= 100 VIB
  { amount: 100,     label: "100",       chance: 20   },
  { amount: 500,     label: "500",       chance: 15   },
  { amount: 1000,    label: "1,000",     chance: 12   },
  { amount: 5000,    label: "5,000",     chance: 10   },
  { amount: 10000,   label: "10,000",    chance: 8    },
  { amount: 25000,   label: "25,000",    chance: 6    },
  { amount: 50000,   label: "50,000",    chance: 5    },
  { amount: 100000,  label: "100,000",   chance: 3    },
  { amount: 250000,  label: "250,000",   chance: 1.5  },
  { amount: 500000,  label: "500,000",   chance: 1    },
  { amount: 1000000, label: "1,000,000", chance: 0.5  },
];

// ============================================================================
// 2. THEME & CONSTANTS
// ============================================================================
const COLORS = {
  bgHex: '#05060f',
  bgNum: 0x05060f,
  cyanHex: '#00e5ff',
  cyanNum: 0x00e5ff,
  magentaHex: '#ff2d95',
  magentaNum: 0xff2d95,
  goldHex: '#ffd700',
  goldNum: 0xffd700,
  greenHex: '#39ff14',
  greenNum: 0x39ff14,
  greyHex: '#7a8299',
  greyNum: 0x7a8299,
};

const DRUM_RADIUS = 3.3;
const DRUM_WIDTH = 5.4;
const SPIN_DURATION = 3.2;     // Seconds for fast spin + ease-out + mechanical bounce
const DISPLAY_DURATION = 2.5;  // Seconds to hold the winning amount lit up
const FADE_OUT_DURATION = 0.45;
const FULL_SPINS = 6;          // Full revolutions before stopping on target
const PARTICLE_COUNT = 75;     // Kept low for M1 integrated GPU

// ============================================================================
// 3. MODULE STATE (Singleton for Memory & Mesh Reuse)
// ============================================================================
let isInitialized = false;
let isActive = false;

// Dedicated mode vs Shared Renderer mode
let standaloneRenderer = null;
let standaloneContainer = null;
let sharedRenderer = null;
let rafId = null;

// Scene & Camera
let scene = null;
let camera = null;
let rootGroup = null;
let drumGroup = null;
let frameGroup = null;

// Reusable Meshes & Materials
let backdropMat = null;
let panelItems = []; // { mesh, baseMat, winTexture, defaultTexture, tierIndex }
let winnerCardMesh = null;
let winnerCardMat = null;
let pointerLeft = null;
let pointerRight = null;
let glowRingMat = null;

// Particles
let particleSystem = null;
let particlePositions = null;
let particleVelocities = null;
let particleColors = null;
let particleMat = null;

// Animation Timeline State
let animPhase = 'IDLE'; // 'SPINNING' | 'CELEBRATING' | 'FADING' | 'IDLE'
let phaseStartTime = 0;
let lastFrameTime = 0;
let startAngle = 0;
let targetAngle = 0;
let selectedTierIndex = 0;
let selectedTier = null;
let onCompleteCallback = null;

// Texture Cache
const textureCache = new Map();

// ============================================================================
// 4. PUBLIC API
// ============================================================================

/**
 * Triggers the full-screen 3D VIB Prize Drum overlay.
 *
 * @param {Function} onComplete - Fired after the drum settles, displays the win, and fades out.
 *                                Receives `(wonAmount, tierObject)` as arguments.
 * @param {Object} [options] - Optional configuration for deeper engine integration.
 * @param {THREE.WebGLRenderer} [options.renderer] - Pass existing renderer to avoid creating a 2nd canvas.
 * @param {boolean} [options.manualLoop=false] - Set true if you call `updatePrizeDrum()` inside your own requestAnimationFrame.
 */
export function showPrizeDrum(onComplete, options = {}) {
  if (isActive) return;
  isActive = true;
  onCompleteCallback = typeof onComplete === 'function' ? onComplete : () => {};

  if (options.renderer) {
    sharedRenderer = options.renderer;
  }

  initPrizeDrumResources();

  // Attach standalone DOM overlay if not sharing the main game renderer
  if (!sharedRenderer && standaloneContainer) {
    standaloneContainer.style.display = 'block';
    standaloneContainer.style.opacity = '1';
    onWindowResize();
  }

  // 1. Roll weighted random prize
  const roll = rollWeightedPrize();
  selectedTierIndex = roll.index;
  selectedTier = roll.tier;

  // 2. Reset visual states from previous runs
  resetVisualsForNewSpin();

  // 3. Calculate cylindrical rotation angles
  const count = PRIZE_TIERS.length;
  const sliceAngle = (Math.PI * 2) / count;

  // Normalize current angle to [0, 2PI)
  startAngle = ((drumGroup.rotation.x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  drumGroup.rotation.x = startAngle;

  // Panel `i` sits at local angle `-i * sliceAngle` in the YZ plane. A drum
  // rotation of `theta` moves a point at angle `a` to `a - theta`, so the
  // panel reaches the +Z selection window exactly at `theta = -i * sliceAngle`.
  // (The old `+i * sliceAngle` target stopped the drum on a gap — the win card
  // then popped out of nowhere.)
  const targetMod = ((-selectedTierIndex * sliceAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  let delta = targetMod - startAngle;
  if (delta < 0) delta += Math.PI * 2;

  targetAngle = startAngle + (FULL_SPINS * Math.PI * 2) + delta;

  // 4. Start timeline
  animPhase = 'SPINNING';
  lastFrameTime = performance.now();
  phaseStartTime = lastFrameTime;

  // 5. Run loop automatically unless the integrator opted into manualLoop
  if (!options.manualLoop) {
    const loop = (now) => {
      if (!isActive) return;
      rafId = requestAnimationFrame(loop);
      updatePrizeDrum(now);
    };
    rafId = requestAnimationFrame(loop);
  }
}

/**
 * Updates and renders the Prize Drum.
 * Called automatically unless `options.manualLoop: true` was passed to `showPrizeDrum`.
 *
 * @param {number} [now=performance.now()] - High-res timestamp in ms.
 */
export function updatePrizeDrum(now = performance.now()) {
  if (!isActive) return;

  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;
  const elapsed = (now - phaseStartTime) / 1000;

  // Subtle idle camera/frame float for cyberpunk feel
  frameGroup.position.y = Math.sin(now * 0.0025) * 0.05;

  if (animPhase === 'SPINNING') {
    const t = Math.min(elapsed / SPIN_DURATION, 1.0);
    const eased = easeOutBackScroll(t);

    const prevAngle = drumGroup.rotation.x;
    drumGroup.rotation.x = startAngle + (targetAngle - startAngle) * eased;

    // Side pointers mechanical tick as slats pass the center line
    const sliceAngle = (Math.PI * 2) / PRIZE_TIERS.length;
    const prevTick = Math.floor(prevAngle / sliceAngle);
    const currTick = Math.floor(drumGroup.rotation.x / sliceAngle);
    if (currTick !== prevTick && t < 0.94) {
      // Kick pointers outward slightly on tick
      pointerLeft.rotation.z = -0.32;
      pointerRight.rotation.z = 0.32;
    }

    // Spring pointers back to center
    pointerLeft.rotation.z += (0 - pointerLeft.rotation.z) * Math.min(1, dt * 18);
    pointerRight.rotation.z += (0 - pointerRight.rotation.z) * Math.min(1, dt * 18);

    // Pulse neon frame intensity with spin speed
    const speedFactor = Math.max(0, 1 - t);
    glowRingMat.opacity = 0.35 + Math.sin(now * 0.03) * 0.2 * speedFactor;

    if (t >= 1.0) {
      drumGroup.rotation.x = targetAngle;
      triggerResultPresentation(now);
    }
  } else if (animPhase === 'CELEBRATING') {
    const t = Math.min(elapsed / DISPLAY_DURATION, 1.0);

    // Elastic pop-in for the winning hero card
    const popScale = easeOutElasticCard(Math.min(elapsed / 0.55, 1.0));
    const pulse = 1.0 + Math.sin(elapsed * 9.0) * 0.035;
    winnerCardMesh.scale.setScalar(popScale * pulse);

    // Slight Z-advance towards camera
    winnerCardMesh.position.z = 3.45 + Math.min(elapsed * 2.0, 0.35);

    // Update confetti burst if player won > 0 VIB
    if (selectedTier.amount > 0 && particleSystem.visible) {
      updateParticles(dt, elapsed);
    }

    if (t >= 1.0) {
      animPhase = 'FADING';
      phaseStartTime = now;
    }
  } else if (animPhase === 'FADING') {
    const t = Math.min(elapsed / FADE_OUT_DURATION, 1.0);
    const alpha = 1.0 - t;

    setSceneOpacity(alpha);
    if (!sharedRenderer && standaloneContainer) {
      standaloneContainer.style.opacity = String(alpha);
    }

    if (t >= 1.0) {
      finishAndCleanup();
      return;
    }
  }

  renderPrizeDrumScene();
}

// ============================================================================
// 5. WEIGHTED RANDOM PICKER
// ============================================================================
function rollWeightedPrize() {
  let totalWeight = 0;
  for (let i = 0; i < PRIZE_TIERS.length; i++) {
    totalWeight += PRIZE_TIERS[i].chance;
  }

  let randomRoll = Math.random() * totalWeight;
  let cumulative = 0;

  for (let i = 0; i < PRIZE_TIERS.length; i++) {
    cumulative += PRIZE_TIERS[i].chance;
    if (randomRoll <= cumulative) {
      return { index: i, tier: PRIZE_TIERS[i] };
    }
  }

  // Fallback for floating-point edge cases
  const lastIdx = PRIZE_TIERS.length - 1;
  return { index: lastIdx, tier: PRIZE_TIERS[lastIdx] };
}

// ============================================================================
// 6. CUSTOM EASING FUNCTIONS (Fast Spin -> Slow Ease -> Mechanical Bounce)
// ============================================================================
function easeOutBackScroll(t) {
  // Power-4 ease-out blended with a subtle damped cosine overshoot at the very end
  const base = 1 - Math.pow(1 - t, 4);
  const overshoot = Math.sin(t * Math.PI) * Math.pow(1 - t, 2.2) * 0.045 * Math.cos(t * 14);
  return base + overshoot;
}

function easeOutElasticCard(t) {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

// ============================================================================
// 7. SCENE INITIALIZATION & GEOMETRY (Built Once, Reused Forever)
// ============================================================================
function initPrizeDrumResources() {
  if (isInitialized) return;
  isInitialized = true;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 11.5);

  rootGroup = new THREE.Group();
  scene.add(rootGroup);

  // --- A. Full-Screen Dark Cyberpunk Backdrop ---
  const bgGeo = new THREE.PlaneGeometry(60, 40);
  backdropMat = new THREE.MeshBasicMaterial({
    color: COLORS.bgNum,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const backdropMesh = new THREE.Mesh(bgGeo, backdropMat);
  backdropMesh.position.z = -5.0;
  rootGroup.add(backdropMesh);

  // --- B. The 3D Slot Drum ---
  drumGroup = new THREE.Group();
  rootGroup.add(drumGroup);

  const count = PRIZE_TIERS.length;
  const sliceAngle = (Math.PI * 2) / count;
  // Chord height so panels form a tight multi-faceted cylinder
  const panelHeight = 2 * DRUM_RADIUS * Math.sin(sliceAngle / 2) * 0.95;
  const panelGeo = new THREE.PlaneGeometry(DRUM_WIDTH, panelHeight);

  // Inner dark core cylinder to block rear panels from showing through gaps
  const coreGeo = new THREE.CylinderGeometry(DRUM_RADIUS * 0.94, DRUM_RADIUS * 0.94, DRUM_WIDTH * 0.98, count);
  coreGeo.rotateZ(Math.PI / 2);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x03040a });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  drumGroup.add(coreMesh);

  // Create slats around the drum perimeter
  for (let i = 0; i < count; i++) {
    const tier = PRIZE_TIERS[i];
    const tex = getSlotPanelTexture(tier, 'DEFAULT');

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 1.0,
    });

    const mesh = new THREE.Mesh(panelGeo, mat);
    const angle = -i * sliceAngle;

    mesh.position.y = Math.sin(angle) * DRUM_RADIUS;
    mesh.position.z = Math.cos(angle) * DRUM_RADIUS;
    // The outward radial direction at this position is (0, sin a, cos a).
    // Rotating the plane by -angle maps its +Z normal exactly there, so every
    // slat faces OUT (the previous +angle flipped the top/bottom/side slats
    // inward and the backface culling hid or mirrored their numbers).
    mesh.rotation.x = -angle;

    drumGroup.add(mesh);
    panelItems.push({ mesh, mat, tier, index: i });
  }

  // --- C. Neon Cyberpunk Housing Frame & Side Rims ---
  frameGroup = new THREE.Group();
  rootGroup.add(frameGroup);

  // Left & Right Neon Cyan Torus Rims
  const rimGeo = new THREE.TorusGeometry(DRUM_RADIUS + 0.14, 0.06, 12, 48);
  rimGeo.rotateY(Math.PI / 2);
  const cyanRimMat = new THREE.MeshBasicMaterial({ color: COLORS.cyanNum });

  const leftRim = new THREE.Mesh(rimGeo, cyanRimMat);
  leftRim.position.x = -DRUM_WIDTH / 2 - 0.12;
  frameGroup.add(leftRim);

  const rightRim = new THREE.Mesh(rimGeo, cyanRimMat);
  rightRim.position.x = DRUM_WIDTH / 2 + 0.12;
  frameGroup.add(rightRim);

  // Outer Magenta Selection Window Frame (front of drum)
  const winWidth = DRUM_WIDTH + 0.7;
  const winHeight = panelHeight + 0.35;
  const barThickness = 0.08;

  const hBarGeo = new THREE.BoxGeometry(winWidth, barThickness, barThickness);
  const vBarGeo = new THREE.BoxGeometry(barThickness, winHeight, barThickness);
  const magentaMat = new THREE.MeshBasicMaterial({ color: COLORS.magentaNum });

  const topBar = new THREE.Mesh(hBarGeo, magentaMat);
  topBar.position.set(0, winHeight / 2, DRUM_RADIUS + 0.25);
  frameGroup.add(topBar);

  const bottomBar = new THREE.Mesh(hBarGeo, magentaMat);
  bottomBar.position.set(0, -winHeight / 2, DRUM_RADIUS + 0.25);
  frameGroup.add(bottomBar);

  const leftBar = new THREE.Mesh(vBarGeo, magentaMat);
  leftBar.position.set(-winWidth / 2, 0, DRUM_RADIUS + 0.25);
  frameGroup.add(leftBar);

  const rightBar = new THREE.Mesh(vBarGeo, magentaMat);
  rightBar.position.set(winWidth / 2, 0, DRUM_RADIUS + 0.25);
  frameGroup.add(rightBar);

  // Fake Neon Glow Halo (Additive Blended Plane — zero bloom cost)
  const glowGeo = new THREE.PlaneGeometry(winWidth + 1.2, winHeight + 1.2);
  glowRingMat = new THREE.MeshBasicMaterial({
    map: createRadialGlowTexture(),
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glowMesh = new THREE.Mesh(glowGeo, glowRingMat);
  glowMesh.position.set(0, 0, DRUM_RADIUS + 0.1);
  frameGroup.add(glowMesh);

  // Left & Right Mechanical Tick Pointers
  const ptrGeo = new THREE.ConeGeometry(0.28, 0.65, 4);
  const ptrMat = new THREE.MeshBasicMaterial({ color: COLORS.cyanNum });

  pointerLeft = new THREE.Mesh(ptrGeo, ptrMat);
  pointerLeft.rotation.z = -Math.PI / 2;
  pointerLeft.position.set(-winWidth / 2 - 0.25, 0, DRUM_RADIUS + 0.3);
  frameGroup.add(pointerLeft);

  pointerRight = new THREE.Mesh(ptrGeo, ptrMat);
  pointerRight.rotation.z = Math.PI / 2;
  pointerRight.position.set(winWidth / 2 + 0.25, 0, DRUM_RADIUS + 0.3);
  frameGroup.add(pointerRight);

  // Header Banner ("VIB PRIZE DRUM")
  const headerGeo = new THREE.PlaneGeometry(5.6, 0.95);
  const headerMat = new THREE.MeshBasicMaterial({
    map: createHeaderBannerTexture(),
    transparent: true,
    depthWrite: false,
  });
  const headerMesh = new THREE.Mesh(headerGeo, headerMat);
  headerMesh.position.set(0, DRUM_RADIUS + 1.15, 1.2);
  frameGroup.add(headerMesh);

  // --- D. Winner Pop-Out Hero Card (Hidden during spin, pops on stop) ---
  const heroGeo = new THREE.PlaneGeometry(DRUM_WIDTH * 1.12, panelHeight * 1.35);
  winnerCardMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 1.0,
    depthTest: false,
  });
  winnerCardMesh = new THREE.Mesh(heroGeo, winnerCardMat);
  winnerCardMesh.position.set(0, 0, DRUM_RADIUS + 0.5);
  winnerCardMesh.visible = false;
  winnerCardMesh.renderOrder = 10;
  rootGroup.add(winnerCardMesh);

  // --- E. Lightweight Confetti / Particle Burst ---
  initParticles();

  // --- F. Standalone Overlay Renderer (Fallback if game renderer isn't passed) ---
  if (!sharedRenderer) {
    standaloneContainer = document.createElement('div');
    Object.assign(standaloneContainer.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      pointerEvents: 'none',
      zIndex: '9999',
      display: 'none',
      transition: 'opacity 0.1s linear',
    });
    document.body.appendChild(standaloneContainer);

    standaloneRenderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    standaloneRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    standaloneRenderer.setSize(window.innerWidth, window.innerHeight);
    standaloneContainer.appendChild(standaloneRenderer.domElement);
  }

  window.addEventListener('resize', onWindowResize);
}

// ============================================================================
// 8. RESULT PRESENTATION & PARTICLE SYSTEM
// ============================================================================
function triggerResultPresentation(now) {
  animPhase = 'CELEBRATING';
  phaseStartTime = now;

  pointerLeft.rotation.z = 0;
  pointerRight.rotation.z = 0;

  const isWin = selectedTier.amount > 0;
  const isJackpot = selectedTier.amount >= 50000;

  // Choose highlight style: Gold (#ffd700) for high tiers, Neon Green (#39ff14) for standard wins, Grey for 0 VIB
  let stateKey = 'NO_WIN';
  if (isWin) {
    stateKey = isJackpot ? 'WIN_GOLD' : 'WIN_GREEN';
  }

  winnerCardMat.map = getSlotPanelTexture(selectedTier, stateKey);
  winnerCardMat.needsUpdate = true;
  winnerCardMesh.scale.setScalar(0.01);
  winnerCardMesh.visible = true;

  // Dim the background drum slightly so the winning card pops unmistakably
  for (let i = 0; i < panelItems.length; i++) {
    panelItems[i].mat.opacity = 0.25;
  }

  // Trigger lightweight particle burst only on actual wins
  if (isWin) {
    spawnParticleBurst(isJackpot);
  }
}

function initParticles() {
  const geo = new THREE.BufferGeometry();
  particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  particleVelocities = new Float32Array(PARTICLE_COUNT * 3);
  particleColors = new Float32Array(PARTICLE_COUNT * 3);

  geo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

  particleMat = new THREE.PointsMaterial({
    size: 0.32,
    map: createParticleSpriteTexture(),
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  particleSystem = new THREE.Points(geo, particleMat);
  particleSystem.visible = false;
  particleSystem.renderOrder = 12;
  rootGroup.add(particleSystem);
}

function spawnParticleBurst(isJackpot) {
  particleSystem.visible = true;
  particleMat.opacity = 1.0;

  const palette = isJackpot
    ? [new THREE.Color(COLORS.goldNum), new THREE.Color(COLORS.cyanNum), new THREE.Color(COLORS.magentaNum)]
    : [new THREE.Color(COLORS.greenNum), new THREE.Color(COLORS.cyanNum), new THREE.Color(COLORS.goldNum)];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    // Spawn around the winning slot edge
    particlePositions[i3]     = (Math.random() - 0.5) * 4.5;
    particlePositions[i3 + 1] = (Math.random() - 0.5) * 1.2;
    particlePositions[i3 + 2] = DRUM_RADIUS + 0.6;

    // Outward explosive velocity
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.5 + Math.random() * 6.5;
    particleVelocities[i3]     = Math.cos(angle) * speed * 1.3;
    particleVelocities[i3 + 1] = Math.sin(angle) * speed + 2.0; // Upward bias
    particleVelocities[i3 + 2] = (Math.random() - 0.3) * 4.0;

    const col = palette[i % palette.length];
    particleColors[i3]     = col.r;
    particleColors[i3 + 1] = col.g;
    particleColors[i3 + 2] = col.b;
  }

  particleSystem.geometry.attributes.position.needsUpdate = true;
  particleSystem.geometry.attributes.color.needsUpdate = true;
}

function updateParticles(dt, elapsed) {
  const gravity = 9.8;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    particleVelocities[i3 + 1] -= gravity * dt; // Gravity pull

    particlePositions[i3]     += particleVelocities[i3] * dt;
    particlePositions[i3 + 1] += particleVelocities[i3 + 1] * dt;
    particlePositions[i3 + 2] += particleVelocities[i3 + 2] * dt;
  }
  particleSystem.geometry.attributes.position.needsUpdate = true;
  particleMat.opacity = Math.max(0, 1.0 - (elapsed / DISPLAY_DURATION) * 0.85);
}

// ============================================================================
// 9. PROCEDURAL CANVAS TEXTURES (Sharp Typography, Zero Font Asset Overhead)
// ============================================================================
function getSlotPanelTexture(tier, state = 'DEFAULT') {
  const cacheKey = `${tier.amount}_${state}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const w = canvas.width;
  const h = canvas.height;

  // 1. Background Fill
  ctx.fillStyle = state === 'DEFAULT' ? '#080b1a' : '#0b1026';
  ctx.fillRect(0, 0, w, h);

  // Subtle horizontal scanlines for cyberpunk CRT vibe
  ctx.fillStyle = 'rgba(0, 229, 255, 0.03)';
  for (let y = 0; y < h; y += 8) {
    ctx.fillRect(0, y, w, 3);
  }

  // 2. Determine Color Scheme based on State & Tier
  let borderColor = COLORS.cyanHex;
  let textColor = '#ffffff';
  let glowColor = COLORS.cyanHex;
  let mainText = `${tier.label} $VIB`;
  let subText = 'MATCH VICTORY REWARD';

  if (state === 'DEFAULT') {
    if (tier.amount === 0) {
      borderColor = '#3a3f54';
      textColor = COLORS.greyHex;
      glowColor = 'transparent';
      mainText = 'NO WIN';
      subText = '0 $VIB';
    } else if (tier.amount >= 100000) {
      borderColor = COLORS.magentaHex;
      textColor = '#fffdf0';
      glowColor = COLORS.magentaHex;
    }
  } else if (state === 'WIN_GOLD') {
    borderColor = COLORS.goldHex;
    textColor = COLORS.goldHex;
    glowColor = COLORS.goldHex;
    mainText = `+${tier.label} $VIB`;
    subText = 'JACKPOT TIER UNLOCKED!';
  } else if (state === 'WIN_GREEN') {
    borderColor = COLORS.greenHex;
    textColor = COLORS.greenHex;
    glowColor = COLORS.greenHex;
    mainText = `+${tier.label} $VIB`;
    subText = 'TOKENS CREDITED TO WALLET';
  } else if (state === 'NO_WIN') {
    borderColor = COLORS.greyHex;
    textColor = COLORS.greyHex;
    glowColor = 'transparent';
    mainText = 'NO WIN — TRY AGAIN';
    subText = '0 $VIB REWARDED THIS MATCH';
  }

  // 3. Draw Neon Border Frame
  ctx.save();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = state === 'DEFAULT' ? 6 : 12;
  if (glowColor !== 'transparent') {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = state === 'DEFAULT' ? 12 : 28;
  }
  ctx.strokeRect(14, 14, w - 28, h - 28);

  // Corner cyber-notches
  ctx.fillStyle = borderColor;
  const notch = 26;
  ctx.fillRect(14, 14, notch, notch);
  ctx.fillRect(w - 14 - notch, 14, notch, notch);
  ctx.fillRect(14, h - 14 - notch, notch, notch);
  ctx.fillRect(w - 14 - notch, h - 14 - notch, notch, notch);
  ctx.restore();

  // 4. Draw Main Prize Digits
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor;
  if (glowColor !== 'transparent') {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = state === 'DEFAULT' ? 16 : 32;
  }

  // Dynamically scale font size for long labels like "NO WIN — TRY AGAIN" or "1,000,000 $VIB"
  const fontSize = mainText.length > 14 ? 72 : 92;
  ctx.font = `900 ${fontSize}px "Orbitron", "Impact", "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(mainText, w / 2, h / 2 - 14);
  ctx.restore();

  // 5. Draw Sub-label
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = state === 'NO_WIN' ? '#586075' : COLORS.cyanHex;
  ctx.font = '700 24px "Courier New", monospace';
  ctx.letterSpacing = '4px';
  ctx.fillText(subText, w / 2, h - 46);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  textureCache.set(cacheKey, texture);
  return texture;
}

function createHeaderBannerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Outer magenta neon glow
  ctx.shadowColor = COLORS.magentaHex;
  ctx.shadowBlur = 24;
  ctx.fillStyle = COLORS.cyanHex;
  ctx.font = '900 68px "Orbitron", "Impact", system-ui, sans-serif';
  ctx.fillText('⚡ VIB PRIZE DRUM ⚡', canvas.width / 2, canvas.height / 2 - 12);

  ctx.shadowBlur = 0;
  ctx.fillStyle = COLORS.magentaHex;
  ctx.font = '700 24px "Courier New", monospace';
  ctx.fillText('VICTORY BONUS ROLL', canvas.width / 2, canvas.height - 34);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createRadialGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  grad.addColorStop(0.0, 'rgba(255, 45, 149, 0.55)');
  grad.addColorStop(0.5, 'rgba(0, 229, 255, 0.25)');
  grad.addColorStop(1.0, 'rgba(5, 6, 15, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createParticleSpriteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  // Crisp diamond/spark shape
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.lineTo(60, 32);
  ctx.lineTo(32, 60);
  ctx.lineTo(4, 32);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// ============================================================================
// 10. HELPERS, RENDER & CLEANUP
// ============================================================================
function resetVisualsForNewSpin() {
  setSceneOpacity(1.0);
  winnerCardMesh.visible = false;
  particleSystem.visible = false;
  for (let i = 0; i < panelItems.length; i++) {
    panelItems[i].mat.opacity = 1.0;
  }
}

function setSceneOpacity(alpha) {
  backdropMat.opacity = 0.92 * alpha;
  winnerCardMat.opacity = alpha;
  glowRingMat.opacity = 0.4 * alpha;
  for (let i = 0; i < panelItems.length; i++) {
    panelItems[i].mat.opacity = (winnerCardMesh.visible ? 0.25 : 1.0) * alpha;
  }
}

function renderPrizeDrumScene() {
  const activeRenderer = sharedRenderer || standaloneRenderer;
  if (!activeRenderer) return;

  if (sharedRenderer) {
    // Render cleanly on top of the existing game canvas without wiping the 3D arena
    const prevAutoClear = sharedRenderer.autoClear;
    sharedRenderer.autoClear = false;
    sharedRenderer.clearDepth();
    sharedRenderer.render(scene, camera);
    sharedRenderer.autoClear = prevAutoClear;
  } else {
    standaloneRenderer.render(scene, camera);
  }
}

function finishAndCleanup() {
  isActive = false;
  animPhase = 'IDLE';

  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  if (!sharedRenderer && standaloneContainer) {
    standaloneContainer.style.display = 'none';
  }

  const wonAmount = selectedTier ? selectedTier.amount : 0;
  const tierCopy = selectedTier ? { ...selectedTier } : null;

  if (onCompleteCallback) {
    onCompleteCallback(wonAmount, tierCopy);
  }
}

function onWindowResize() {
  if (!camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  if (standaloneRenderer) {
    standaloneRenderer.setSize(window.innerWidth, window.innerHeight);
  }
}