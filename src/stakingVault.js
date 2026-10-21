/**
 * VIB STAKING VAULT & ALCHEMY FORGE — High-Fidelity 1:1 Visual Edition
 * --------------------------------------------------------------------
 * Pure ES Module for Three.js. Runs at 60fps on MacBook Air M1 without post-processing.
 * Replicates the exact multi-layered plasma sphere, glowing satellite trails,
 * 540-degree card spin, 3-layer 3D parallax card, and custom Bezier vector logos.
 */

import * as THREE from 'three';

// Anti-exploit economy. Local copies so this module depends only on three.
const MIN_STAKE = 1000000;
const MAX_STAKE = 10000000;
const LOCK_HOURS = 24;
const GENESIS_LUCK = 1.15;
const STAKE_STEP = 1000000;
const TOPUP_STEP = 500000;

function luckTier(hours) {
  if (hours >= 168) return 5;
  if (hours >= 72) return 2;
  return 1;
}

function holdSizeMultiplier(hours) {
  if (hours >= 168) return 2;
  if (hours >= 72) return 1.25;
  return 1;
}

function isGenesisLock(stake, pureUpfront) {
  return pureUpfront === true && stake === MAX_STAKE;
}

function luckMultiplier(hours, stake, pureUpfront) {
  const base = luckTier(hours);
  return isGenesisLock(stake, pureUpfront) ? base * GENESIS_LUCK : base;
}

function holdDropWeight(stock, hours, stake, pureUpfront) {
  const weight = hours >= 168 ? stock.chance168h : hours >= 72 ? stock.chance72h : stock.chance24h;
  if (!isGenesisLock(stake, pureUpfront)) return weight;
  if (stock.tier === 'RARE' || stock.tier === 'EPIC' || stock.tier === 'LEGENDARY') {
    return weight * GENESIS_LUCK;
  }
  return weight;
}

/** 60h / 60.5h — effective hold, not wall clock. */
function formatHoldStamp(hours) {
  const h = Math.round((Number(hours) || 0) * 10) / 10;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

// ============================================================================
// 1. RWA STOCK TIERS & CONFIGURATION
// ============================================================================
export const RWA_STOCKS = [
  { tier: 'COMMON',    ticker: 'SPY',    name: 'S&P 500 ETF',         baseUsd: 0.50,   sharePrice: 580, color: '#00e5ff', accent: '#7a8299', chance24h: 65.0, chance72h: 45.0, chance168h: 15.0 },
  { tier: 'UNCOMMON',  ticker: 'AAPL',   name: 'APPLE INC.',          baseUsd: 2.00,   sharePrice: 230, color: '#39ff14', accent: '#00e5ff', chance24h: 24.0, chance72h: 33.0, chance168h: 42.0 },
  { tier: 'RARE',      ticker: 'NVDA',   name: 'NVIDIA CORP.',        baseUsd: 8.00,   sharePrice: 140, color: '#00e5ff', accent: '#39ff14', chance24h: 4.5,  chance72h: 8.5,  chance168h: 15.0 },
  { tier: 'RARE',      ticker: 'TSLA',   name: 'TESLA INC.',          baseUsd: 8.00,   sharePrice: 250, color: '#00e5ff', accent: '#ff2d95', chance24h: 4.0,  chance72h: 8.0,  chance168h: 14.0 },
  { tier: 'RARE',      ticker: 'MSFT',   name: 'MICROSOFT CORP.',     baseUsd: 8.00,   sharePrice: 415, color: '#00a4ef', accent: '#7fba00', chance24h: 4.0,  chance72h: 8.0,  chance168h: 14.0 },
  { tier: 'EPIC',      ticker: 'MSTR',   name: 'MICROSTRATEGY',       baseUsd: 35.00,  sharePrice: 380, color: '#ff2d95', accent: '#ffd700', chance24h: 2.3,  chance72h: 5.0,  chance168h: 12.5 },
  { tier: 'LEGENDARY', ticker: 'SPACEX', name: 'SPACEX PRE-IPO RWA',  baseUsd: 250.00, sharePrice: 185, color: '#ffd700', accent: '#ffffff', chance24h: 0.2,  chance72h: 0.5,  chance168h: 1.5  },
];

// ============================================================================
// 2. MODULE STATE
// ============================================================================
let isInitialized = false;
let isActive = false;

let sharedRenderer = null;
let standaloneRenderer = null;
let standaloneContainer = null;
let hudContainer = null;
let rafId = null;

let scene = null;
let camera = null;
let rootGroup = null;
let bgGroup = null;
let reactorGroup = null;
let cardGroup = null;

// Multi-layer Plasma Sphere Core
let coreInnerMesh = null;
let corePlasmaMesh = null;
let coreWireMesh = null;
let coreHaloSprite = null;
let coreShockwaveRing = null;

// Orbiting Rings & 18 Satellites with Comet Trails
let orbitRings = [];
let satellites = []; // { group, mesh, halo, trails: [], orbitRadius, baseRadius, angle, speed, tiltX, tiltZ, color }

// 3-Layer Parallax 3D Stock Card
let cardChassisMesh = null;
let cardBasePlane = null;
let cardMidHoloPlane = null;
let cardFrontParallaxPlane = null;
let cardSheenPlane = null;
let cardHaloSprite = null;
let cardOrbitRings = [];

// Spherical Burst Particles
let burstSystem = null;
let burstPositions = null;
let burstVelocities = null;
let burstColors = null;
let burstMat = null;
const BURST_COUNT = 110;

// Ambient Floating Dust
let dustSystem = null;

// Interactive & Timeline State
let animPhase = 'REACTOR_IDLE'; // 'REACTOR_IDLE' | 'IMPLODING' | 'REVEALING' | 'FADING'
let phaseStartTime = 0;
let lastFrameTime = 0;

let chargeMultiplier = 1; // Visual orbit charge from effective hold days (floor 1, ceiling 7)
let currentStakeAmount = 0;
let currentHoldHours = 0;
let pureUpfront = true;
let walletVib = 0;
let forcedTicker = 'RANDOM';
let selectedStock = RWA_STOCKS[2]; // NVDA default

// Mouse / Orbit Parallax
let pointerX = 0;
let pointerY = 0;
let smoothPointerX = 0;
let smoothPointerY = 0;
let isDragging = false;
let dragRotationY = 0;
let dragRotationX = 0;

let onCompleteCallback = null;
let onRevealCallback = null;
let revealDelivered = false;
// Stake and hold that opened the current card. Profile burns the live
// position as soon as the card is won; the reveal keeps these numbers.
let lockedStakeAmount = null;
let lockedHoldHours = null;
let lockedPure = null;
let onInitialStakeCallback = null;
let onTopUpCallback = null;
let glowSpriteTexture = null;
const cardTextureCache = new Map();

// Profile embed: draw into the page's canvas and park the control bar under it.
let embedCanvas = null;
let hostEl = null;

// ============================================================================
// 3. PUBLIC API
// ============================================================================

/**
 * Opens the 3D Neon-Cyberpunk Staking Vault & Stock Reveal experience.
 *
 * @param {Function} onComplete - Callback receiving `{ stock, usdValue, shares, stakeAmount, holdHours }`
 * @param {Object} [options]
 * @param {number} [options.stakeAmount=0] - Staked $VIB in the one open vault (0 when none)
 * @param {number} [options.holdHours=0] - Effective hold hours (weighted, not wall-clock)
 * @param {boolean} [options.pureUpfront=true] - False after any top-up
 * @param {number} [options.vibBalance=0] - Free $VIB the HUD slider is allowed to spend
 * @param {boolean} [options.showUI=true] - Renders the interactive cyberpunk control bar under the reactor
 * @param {HTMLCanvasElement} [options.canvas] - Draw into this canvas instead of a fullscreen overlay
 * @param {HTMLElement} [options.host] - Element that holds the canvas; the control bar is appended under it
 * @param {THREE.WebGLRenderer} [options.renderer] - Optional shared WebGLRenderer
 * @param {Function} [options.onReveal] - Called when a card is won, so it can be collected
 * @param {Function} [options.onInitialStake] - Commit the first deposit (1M–10M)
 * @param {Function} [options.onTopUp] - Add $VIB to the open vault (dilutes effective hold)
 */
export function showStakingVault(onComplete, options = {}) {
  if (typeof onComplete === 'function') onCompleteCallback = onComplete;
  if (typeof options.onReveal === 'function') onRevealCallback = options.onReveal;
  if (typeof options.onInitialStake === 'function') onInitialStakeCallback = options.onInitialStake;
  if (typeof options.onTopUp === 'function') onTopUpCallback = options.onTopUp;
  if (options.stakeAmount != null) currentStakeAmount = options.stakeAmount;
  else if (!isActive) currentStakeAmount = 0;
  if (options.holdHours != null) currentHoldHours = options.holdHours;
  else if (!isActive) currentHoldHours = 0;
  if (options.pureUpfront != null) pureUpfront = !!options.pureUpfront;
  else if (!isActive) pureUpfront = true;
  if (options.canvas) embedCanvas = options.canvas;
  if (options.host) hostEl = options.host;
  else if (embedCanvas && !hostEl) hostEl = embedCanvas.parentElement;
  if (options.renderer) sharedRenderer = options.renderer;
  if (options.vibBalance != null) walletVib = Number(options.vibBalance) || 0;
  else if (!embedCanvas) walletVib = MAX_STAKE; // standalone demo wallet
  chargeMultiplier = chargeFromHoldHours(currentHoldHours);

  // Already on screen: keep the reactor, just pick up the new stake / hold.
  // Mid-reveal, leave the orbiting spheres on the stake that opened the card.
  if (isActive) {
    syncChargeSlider();
    syncEconomyHud();
    if (animPhase === 'REACTOR_IDLE') applyStakeSatellites();
    return;
  }
  isActive = true;

  initVaultScene();

  if (!sharedRenderer && standaloneContainer) {
    standaloneContainer.style.display = 'block';
    standaloneContainer.style.opacity = '1';
  }
  if (embedCanvas) embedCanvas.style.opacity = '1';
  if (hudContainer) {
    hudContainer.style.display = options.showUI === false ? 'none' : 'flex';
    hudContainer.style.opacity = '1';
  }
  syncChargeSlider();

  onWindowResize();
  resetToReactorState();

  lastFrameTime = performance.now();
  phaseStartTime = lastFrameTime;

  const loop = (now) => {
    if (!isActive) return;
    rafId = requestAnimationFrame(loop);
    updateStakingVault(now);
  };
  rafId = requestAnimationFrame(loop);
}

/**
 * Triggers the 0.85s singularity implosion and 540-degree 3D Stock Card reveal.
 */
export function triggerBreachAndClaim(overrideTicker = null) {
  if (animPhase === 'IMPLODING') return;

  if (animPhase === 'REVEALING') {
    resetToReactorState();
    return;
  }

  if (animPhase !== 'REACTOR_IDLE') return;

  // The 24h lock uses effective hold, so a diluted top-up closes the safe again.
  if (currentStakeAmount < MIN_STAKE || currentHoldHours < LOCK_HOURS) {
    syncEconomyHud();
    return;
  }

  lockedStakeAmount = currentStakeAmount;
  lockedHoldHours = currentHoldHours;
  lockedPure = pureUpfront;

  const targetTicker = overrideTicker || forcedTicker;
  if (targetTicker && targetTicker !== 'RANDOM') {
    selectedStock = RWA_STOCKS.find((s) => s.ticker === targetTicker) || RWA_STOCKS[2];
  } else {
    selectedStock = rollWeightedStock(lockedHoldHours, lockedStakeAmount, lockedPure);
  }

  animPhase = 'IMPLODING';
  phaseStartTime = performance.now();
  const actionBtn = hudContainer && hudContainer.querySelector('#vibVaultActionBtn');
  if (actionBtn) {
    actionBtn.disabled = false;
    actionBtn.style.opacity = '1';
    actionBtn.style.cursor = 'pointer';
  }
  updateHudButtonLabel('⚡ SINGULARITY...');
  emitRevealedCard();
}

/**
 * Closes the Vault overlay with a smooth fade and fires onComplete.
 */
export function closeStakingVault() {
  if (!isActive || animPhase === 'FADING') return;
  animPhase = 'FADING';
  phaseStartTime = performance.now();
}

/** Stop the reactor without delivering a stock (profile page closed). */
export function hideStakingVault() {
  isActive = false;
  onCompleteCallback = null;
  animPhase = 'REACTOR_IDLE';
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (standaloneContainer) standaloneContainer.style.display = 'none';
  if (embedCanvas) embedCanvas.style.opacity = '1';
  if (hudContainer) {
    hudContainer.style.display = 'none';
    hudContainer.style.opacity = '1';
  }
}

// ============================================================================
// 4. MAIN 60FPS ANIMATION LOOP
// ============================================================================
export function updateStakingVault(now = performance.now()) {
  if (!isActive) return;

  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;
  const elapsed = (now - phaseStartTime) / 1000;

  // Smooth mouse parallax interpolation
  smoothPointerX += (pointerX - smoothPointerX) * Math.min(1, dt * 8);
  smoothPointerY += (pointerY - smoothPointerY) * Math.min(1, dt * 8);

  // Subtle camera sway
  camera.position.x = smoothPointerX * 0.55;
  camera.position.y = smoothPointerY * 0.35;
  camera.lookAt(0, 0, 0);

  // Ambient dust drift
  if (dustSystem) {
    dustSystem.rotation.y = now * 0.00008;
    dustSystem.rotation.x = Math.sin(now * 0.0001) * 0.05;
  }

  // 1 staked day → cyan, 7 staked days → gold.
  const chargeNorm = Math.min(1, Math.max(0, (chargeMultiplier - 1.0) / 6.0));
  const dynamicCoreColor = getChargeColor(chargeNorm);

  // --------------------------------------------------------------------------
  // PHASE 1: REACTOR IDLE (Spinning Plasma Sphere + 18 Orbiting Spheres)
  // --------------------------------------------------------------------------
  if (animPhase === 'REACTOR_IDLE') {
    reactorGroup.visible = true;
    cardGroup.visible = false;

    reactorGroup.position.y = Math.sin(now * 0.0022) * 0.12;
    reactorGroup.rotation.y = dragRotationY + smoothPointerX * 0.35;
    reactorGroup.rotation.x = dragRotationX - smoothPointerY * 0.25;

    // Pulse central sphere layers. The wire cage stays off; orbits stay.
    const pulse = 1.0 + Math.sin(now * 0.0045 * chargeMultiplier) * 0.055;
    corePlasmaMesh.scale.setScalar(pulse);
    corePlasmaMesh.material.color.copy(dynamicCoreColor);
    corePlasmaMesh.material.emissive.copy(dynamicCoreColor);

    if (coreHaloSprite) {
      coreHaloSprite.scale.setScalar(5.2 + Math.sin(now * 0.006) * 0.45 + chargeNorm * 1.1);
      coreHaloSprite.material.color.copy(dynamicCoreColor);
    }

    // Rotate gyroscopic orbit rings
    for (let i = 0; i < orbitRings.length; i++) {
      const r = orbitRings[i];
      r.rotation.z += dt * (0.25 + i * 0.12) * (i % 2 === 0 ? 1 : -1) * chargeMultiplier;
    }

    // Update 18 orbiting satellite spheres + comet trails
    updateSatellites(dt, chargeMultiplier, 1.0);
  }

  // --------------------------------------------------------------------------
  // PHASE 2: IMPLODING (0.85s Spiral Collapse into Central Sphere)
  // --------------------------------------------------------------------------
  else if (animPhase === 'IMPLODING') {
    const t = Math.min(elapsed / 0.85, 1.0);
    const collapseFactor = 1.0 - Math.pow(t, 2.4);

    // Spin reactor furiously as satellites spiral into the center
    const burstSpeed = chargeMultiplier * (1.0 + t * 5.5);
    updateSatellites(dt, burstSpeed, collapseFactor);

    // Compress central sphere then flash white-hot right before detonation
    const coreScale = t < 0.75
      ? 1.0 - t * 0.55
      : 0.58 + (t - 0.75) * 4.2;
    corePlasmaMesh.scale.setScalar(coreScale);

    // Cycle teases of tier colors during compression
    const flashColor = new THREE.Color().setHSL((now * 0.003) % 1.0, 1.0, 0.6);
    corePlasmaMesh.material.emissive.copy(flashColor);
    if (coreHaloSprite) {
      coreHaloSprite.material.color.copy(flashColor);
      coreHaloSprite.scale.setScalar(4.5 + t * 4.5);
    }

    // Fade orbit rings down
    for (let i = 0; i < orbitRings.length; i++) {
      orbitRings[i].scale.setScalar(Math.max(0.15, collapseFactor));
    }

    if (t >= 1.0) {
      triggerCardExplosion(now);
    }
  }

  // --------------------------------------------------------------------------
  // PHASE 3: REVEALING (540° Spin, 3-Layer Parallax Card & Spherical Particles)
  // --------------------------------------------------------------------------
  else if (animPhase === 'REVEALING') {
    const t = Math.min(elapsed / 0.95, 1.0);
    const easeScale = easeOutBackCard(t);

    // 540-degree Y-axis spin (3 * Math.PI -> 0) settling smoothly
    const spinEase = 1.0 - Math.pow(1.0 - t, 3.5);
    const spinAngleY = (1.0 - spinEase) * Math.PI * 3.0;

    cardGroup.scale.setScalar(Math.max(0.001, easeScale));

    // Interactive 3D tilt following mouse + gentle floating idle
    const tiltY = smoothPointerX * 0.42 + dragRotationY * 0.5 + Math.sin(elapsed * 2.2) * 0.06;
    const tiltX = -smoothPointerY * 0.32 + dragRotationX * 0.5 + Math.cos(elapsed * 1.8) * 0.04;

    cardGroup.rotation.y = spinAngleY + tiltY;
    cardGroup.rotation.x = tiltX;
    cardGroup.position.y = Math.sin(elapsed * 2.5) * 0.09;

    // True 3D Parallax shift between Mid and Foreground card planes
    cardMidHoloPlane.position.x = smoothPointerX * 0.06;
    cardMidHoloPlane.position.y = smoothPointerY * 0.06;
    cardFrontParallaxPlane.position.x = smoothPointerX * 0.14;
    cardFrontParallaxPlane.position.y = smoothPointerY * 0.14;

    // Animated holographic diagonal sheen sweep across the card
    if (cardSheenPlane) {
      const sheenCycle = ((elapsed * 0.65) % 2.2) - 1.1;
      cardSheenPlane.position.x = sheenCycle * 2.2;
      cardSheenPlane.material.opacity = Math.max(0, 0.22 - Math.abs(sheenCycle) * 0.18);
    }

    // Background orbital halo rings behind the revealed card
    for (let i = 0; i < cardOrbitRings.length; i++) {
      const ring = cardOrbitRings[i];
      ring.rotation.z += dt * (0.4 + i * 0.2) * (i % 2 === 0 ? 1 : -1);
      ring.rotation.x = Math.sin(elapsed * 0.8 + i) * 0.25;
    }

    // Expand shockwave ring
    if (coreShockwaveRing && coreShockwaveRing.visible) {
      const swT = Math.min(elapsed / 0.75, 1.0);
      coreShockwaveRing.scale.setScalar(0.5 + swT * 9.5);
      coreShockwaveRing.material.opacity = (1.0 - swT) * 0.75;
      if (swT >= 1.0) coreShockwaveRing.visible = false;
    }

    // Update spherical particle burst
    if (burstSystem && burstSystem.visible) {
      updateBurstParticles(dt, elapsed);
    }
  }

  // --------------------------------------------------------------------------
  // PHASE 4: FADING OUT
  // --------------------------------------------------------------------------
  else if (animPhase === 'FADING') {
    const t = Math.min(elapsed / 0.4, 1.0);
    const alpha = 1.0 - t;
    if (!sharedRenderer && standaloneContainer) standaloneContainer.style.opacity = String(alpha);
    if (embedCanvas) embedCanvas.style.opacity = String(alpha);
    if (hudContainer) hudContainer.style.opacity = String(alpha);

    if (t >= 1.0) {
      finishVaultSession();
      return;
    }
  }

  renderScene();
}

// ============================================================================
// 5. SCENE CONSTRUCTION (High-Fidelity PBR + Additive Glow)
// ============================================================================
function initVaultScene() {
  if (isInitialized) return;
  isInitialized = true;

  glowSpriteTexture = createRadialGlowTexture();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 10.8);

  rootGroup = new THREE.Group();
  scene.add(rootGroup);

  // --- LIGHTING (Crucial for 3D glossy spheres and metallic card chassis) ---
  const ambientLight = new THREE.AmbientLight(0x182248, 2.2);
  scene.add(ambientLight);

  const cyanLight = new THREE.PointLight(0x00e5ff, 6, 25);
  cyanLight.position.set(-5, 4, 6);
  scene.add(cyanLight);

  const magentaLight = new THREE.PointLight(0xff2d95, 6, 25);
  magentaLight.position.set(5, -4, 6);
  scene.add(magentaLight);

  const topGoldLight = new THREE.DirectionalLight(0xffffff, 2.0);
  topGoldLight.position.set(0, 8, 8);
  scene.add(topGoldLight);

  // Black field. Dust stays; the blue backdrop plane does not.
  bgGroup = new THREE.Group();
  rootGroup.add(bgGroup);
  initAmbientDust();

  // --- B. SPHERICAL OVERCHARGE REACTOR ---
  reactorGroup = new THREE.Group();
  rootGroup.add(reactorGroup);

  // Layer 1: Deep Dark Inner Singularity Sphere
  const innerGeo = new THREE.SphereGeometry(1.12, 48, 48);
  const innerMat = new THREE.MeshStandardMaterial({
    color: 0x040714,
    roughness: 0.15,
    metalness: 0.9,
  });
  coreInnerMesh = new THREE.Mesh(innerGeo, innerMat);
  reactorGroup.add(coreInnerMesh);

  // Layer 2: Glowing Translucent Plasma Shell Sphere
  const plasmaGeo = new THREE.SphereGeometry(1.28, 48, 48);
  const plasmaMat = new THREE.MeshStandardMaterial({
    color: 0x00e5ff,
    emissive: 0x00e5ff,
    emissiveIntensity: 0.75,
    roughness: 0.2,
    metalness: 0.3,
    transparent: true,
    opacity: 0.68,
  });
  corePlasmaMesh = new THREE.Mesh(plasmaGeo, plasmaMat);
  reactorGroup.add(corePlasmaMesh);

  // Outer glow. The geodesic wire cage is intentionally not built.
  const haloMat = new THREE.SpriteMaterial({
    map: glowSpriteTexture,
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  coreHaloSprite = new THREE.Sprite(haloMat);
  coreHaloSprite.scale.setScalar(5.4);
  reactorGroup.add(coreHaloSprite);

  // 3 orbit tracks. Small spheres are added later, one per 0.5M after the first 1M.
  const orbitConfigs = [
    { radius: 2.35, tiltX: 1.12,  tiltZ: 0.28,  color: 0x00e5ff, speed: 1.35 },
    { radius: 2.95, tiltX: -0.95, tiltZ: 0.52,  color: 0xff2d95, speed: -1.05 },
    { radius: 3.55, tiltX: 0.42,  tiltZ: -1.10, color: 0xffd700, speed: 0.85 },
  ];

  const satSphereGeo = new THREE.SphereGeometry(0.14, 24, 24);
  const trailSphereGeo = new THREE.SphereGeometry(0.09, 12, 12);

  orbitConfigs.forEach((cfg) => {
    const ringHolder = new THREE.Group();
    ringHolder.rotation.x = cfg.tiltX;
    ringHolder.rotation.z = cfg.tiltZ;
    reactorGroup.add(ringHolder);

    const torusGeo = new THREE.TorusGeometry(cfg.radius, 0.018, 12, 96);
    const torusMat = new THREE.MeshBasicMaterial({
      color: cfg.color,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
    });
    const torusMesh = new THREE.Mesh(torusGeo, torusMat);
    ringHolder.add(torusMesh);
    orbitRings.push(torusMesh);
  });

  // Round-robin so sphere 1 and sphere 2 land on different orbits.
  const PER_ORBIT = 8;
  for (let n = 0; n < PER_ORBIT; n++) {
    orbitConfigs.forEach((cfg, ringIdx) => {
      const satMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: cfg.color,
        emissiveIntensity: 1.2,
        roughness: 0.1,
      });
      const satMesh = new THREE.Mesh(satSphereGeo, satMat);
      satMesh.visible = false;

      const satHalo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowSpriteTexture,
          color: cfg.color,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      satHalo.scale.setScalar(0.85);
      satMesh.add(satHalo);

      const trails = [];
      for (let tr = 1; tr <= 4; tr++) {
        const trMat = new THREE.MeshBasicMaterial({
          color: cfg.color,
          transparent: true,
          opacity: (1.0 - tr / 5) * 0.55,
          blending: THREE.AdditiveBlending,
        });
        const trMesh = new THREE.Mesh(trailSphereGeo, trMat);
        trMesh.scale.setScalar(1.0 - tr * 0.18);
        trMesh.visible = false;
        reactorGroup.add(trMesh);
        trails.push(trMesh);
      }

      reactorGroup.add(satMesh);
      satellites.push({
        mesh: satMesh,
        halo: satHalo,
        trails,
        baseRadius: cfg.radius,
        orbitRadius: cfg.radius,
        angle: 0,
        speed: cfg.speed,
        tiltX: cfg.tiltX,
        tiltZ: cfg.tiltZ,
        color: cfg.color,
        orbitIndex: ringIdx,
        active: false,
      });
    });
  }
  applyStakeSatellites();

  // --- C. 3-LAYER STOCK REVEAL CARD (no orbit rings around it) ---
  cardGroup = new THREE.Group();
  cardGroup.visible = false;
  rootGroup.add(cardGroup);

  const cardW = 3.8;
  const cardH = 5.25;

  // 3D Metallic Obsidian Card Chassis
  const chassisGeo = new THREE.BoxGeometry(cardW + 0.08, cardH + 0.08, 0.12);
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x0b1024,
    roughness: 0.25,
    metalness: 0.85,
  });
  cardChassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
  cardChassisMesh.position.z = -0.07;
  cardGroup.add(cardChassisMesh);

  // Layer 1 (z = 0.0): Base Cyber Frame, Grid & Corner Notches
  const layerGeo = new THREE.PlaneGeometry(cardW, cardH);
  cardBasePlane = new THREE.Mesh(
    layerGeo,
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
  );
  cardBasePlane.position.z = 0.0;
  cardGroup.add(cardBasePlane);

  // Layer 2 (z = +0.07): Mid Holographic Vector Logo Medallion & Ticker
  cardMidHoloPlane = new THREE.Mesh(
    layerGeo,
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
  );
  cardMidHoloPlane.position.z = 0.07;
  cardGroup.add(cardMidHoloPlane);

  // Layer 3 (z = +0.15): Foreground Pop-out Payout Box & Fractional Shares
  cardFrontParallaxPlane = new THREE.Mesh(
    layerGeo,
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
  );
  cardFrontParallaxPlane.position.z = 0.15;
  cardGroup.add(cardFrontParallaxPlane);

  // Layer 4 (z = +0.17): Diagonal Holographic Foil Sheen Sweep
  const sheenGeo = new THREE.PlaneGeometry(1.1, cardH * 1.15);
  const sheenMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  cardSheenPlane = new THREE.Mesh(sheenGeo, sheenMat);
  cardSheenPlane.rotation.z = -0.35;
  cardSheenPlane.position.z = 0.17;
  cardGroup.add(cardSheenPlane);

  // Card Backplate so 540° spin looks solid from behind
  const backPlane = new THREE.Mesh(
    layerGeo,
    new THREE.MeshBasicMaterial({ map: createCardBackplateTexture() })
  );
  backPlane.rotation.y = Math.PI;
  backPlane.position.z = -0.14;
  cardGroup.add(backPlane);

  cardHaloSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowSpriteTexture,
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  cardHaloSprite.scale.setScalar(7.5);
  cardHaloSprite.position.z = -0.4;
  cardGroup.add(cardHaloSprite);

  const swGeo = new THREE.RingGeometry(0.6, 0.85, 64);
  const swMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  coreShockwaveRing = new THREE.Mesh(swGeo, swMat);
  coreShockwaveRing.visible = false;
  rootGroup.add(coreShockwaveRing);

  // --- D. SPHERICAL BURST PARTICLES ---
  initBurstParticles();

  // --- E. DOM OVERLAY & INTERACTIVE CONTROLS ---
  setupDomAndEvents();
}

// ============================================================================
// 6. SATELLITE ORBIT KINEMATICS & 3-LAYER CARD TEXTURE GENERATOR
// ============================================================================
function updateSatellites(dt, speedMult, radiusFactor) {
  const euler = new THREE.Euler();
  const vec = new THREE.Vector3();

  for (let i = 0; i < satellites.length; i++) {
    const sat = satellites[i];
    if (!sat.active) {
      sat.mesh.visible = false;
      sat.trails.forEach((tr) => { tr.visible = false; });
      continue;
    }
    sat.mesh.visible = true;
    sat.angle += dt * sat.speed * speedMult;
    sat.orbitRadius = sat.baseRadius * radiusFactor;

    euler.set(sat.tiltX, 0, sat.tiltZ);
    vec.set(
      Math.cos(sat.angle) * sat.orbitRadius,
      Math.sin(sat.angle) * sat.orbitRadius,
      0
    ).applyEuler(euler);

    sat.mesh.position.copy(vec);
    sat.mesh.scale.setScalar(Math.max(0.2, radiusFactor));

    // Update trailing comet spheres along the same orbital curve
    for (let tr = 0; tr < sat.trails.length; tr++) {
      const lagAngle = sat.angle - (tr + 1) * 0.11 * Math.sign(sat.speed);
      vec.set(
        Math.cos(lagAngle) * sat.orbitRadius,
        Math.sin(lagAngle) * sat.orbitRadius,
        0
      ).applyEuler(euler);
      sat.trails[tr].position.copy(vec);
      sat.trails[tr].visible = radiusFactor > 0.25;
    }
  }
}

function triggerCardExplosion(now) {
  animPhase = 'REVEALING';
  phaseStartTime = now;
  updateHudButtonLabel('↺ RETURN REACTOR');

  reactorGroup.visible = false;
  cardGroup.visible = true;
  cardGroup.scale.setScalar(0.001);

  const layers = getThreeLayerCardTextures(selectedStock, payoutStake(), payoutHold(), payoutPure());
  cardBasePlane.material.map = layers.baseTex;
  cardBasePlane.material.needsUpdate = true;

  cardMidHoloPlane.material.map = layers.midTex;
  cardMidHoloPlane.material.needsUpdate = true;

  cardFrontParallaxPlane.material.map = layers.frontTex;
  cardFrontParallaxPlane.material.needsUpdate = true;

  const tierColor = new THREE.Color(selectedStock.color);
  if (cardHaloSprite) cardHaloSprite.material.color.copy(tierColor);
  cardOrbitRings.forEach((r) => r.material.color.copy(tierColor));

  // Trigger Shockwave Ring
  if (coreShockwaveRing) {
    coreShockwaveRing.visible = true;
    coreShockwaveRing.scale.setScalar(0.5);
    coreShockwaveRing.material.color.copy(tierColor);
  }

  // Trigger Spherical Particle Burst
  spawnSphericalBurst(tierColor, new THREE.Color(selectedStock.accent));
}

/**
 * Generates 3 separate transparent CanvasTextures for the 3D card.
 * No extra rings are drawn around the card.
 */
function getThreeLayerCardTextures(stock, stakeAmount, holdHours, pureUpfrontStake) {
  const hoursKey = Math.round(holdHours * 10) / 10;
  const key = `${stock.ticker}_${stakeAmount}_${hoursKey}_${pureUpfrontStake ? 1 : 0}`;
  if (cardTextureCache.has(key)) return cardTextureCache.get(key);

  const w = 1024;
  const h = 1408;

  const c1 = document.createElement('canvas');
  c1.width = w; c1.height = h;
  const ctx1 = c1.getContext('2d');

  const bgGrad = ctx1.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, '#070a18');
  bgGrad.addColorStop(0.5, '#0c1229');
  bgGrad.addColorStop(1, '#050711');
  ctx1.fillStyle = bgGrad;
  ctx1.fillRect(24, 24, w - 48, h - 48);

  ctx1.fillStyle = 'rgba(0, 229, 255, 0.03)';
  for (let y = 30; y < h - 30; y += 10) ctx1.fillRect(30, y, w - 60, 3);

  ctx1.strokeStyle = stock.color;
  ctx1.lineWidth = 12;
  ctx1.shadowColor = stock.color;
  ctx1.shadowBlur = 28;
  ctx1.strokeRect(36, 36, w - 72, h - 72);

  ctx1.strokeStyle = stock.accent;
  ctx1.lineWidth = 3;
  ctx1.shadowBlur = 8;
  ctx1.strokeRect(58, 58, w - 116, h - 116);

  ctx1.fillStyle = stock.color;
  const bLen = 54;
  ctx1.fillRect(30, 30, bLen, 16); ctx1.fillRect(30, 30, 16, bLen);
  ctx1.fillRect(w - 30 - bLen, 30, bLen, 16); ctx1.fillRect(w - 46, 30, 16, bLen);
  ctx1.fillRect(30, h - 46, bLen, 16); ctx1.fillRect(30, h - 30 - bLen, 16, bLen);
  ctx1.fillRect(w - 30 - bLen, h - 46, bLen, 16); ctx1.fillRect(w - 46, h - 30 - bLen, 16, bLen);

  ctx1.shadowBlur = 0;
  ctx1.fillStyle = stock.color;
  ctx1.font = '900 28px "Orbitron", "Segoe UI", system-ui, sans-serif';
  ctx1.textAlign = 'center';
  ctx1.fillText(`◆ ${stock.tier} RWA EQUITY ◆`, w / 2, 108);

  const c2 = document.createElement('canvas');
  c2.width = w; c2.height = h;
  const ctx2 = c2.getContext('2d');

  const medY = 335;
  const medGrad = ctx2.createRadialGradient(w / 2, medY, 15, w / 2, medY, 145);
  medGrad.addColorStop(0, 'rgba(0, 229, 255, 0.22)');
  medGrad.addColorStop(1, 'rgba(5, 6, 15, 0.0)');
  ctx2.fillStyle = medGrad;
  ctx2.beginPath();
  ctx2.arc(w / 2, medY, 145, 0, Math.PI * 2);
  ctx2.fill();

  ctx2.strokeStyle = stock.color;
  ctx2.lineWidth = 7;
  ctx2.shadowColor = stock.color;
  ctx2.shadowBlur = 24;
  ctx2.beginPath();
  ctx2.arc(w / 2, medY, 122, 0, Math.PI * 2);
  ctx2.stroke();

  drawAuthenticVectorLogo(ctx2, w / 2, medY, stock.ticker, stock.color);

  ctx2.textAlign = 'center';
  ctx2.fillStyle = '#ffffff';
  ctx2.shadowColor = stock.color;
  ctx2.shadowBlur = 22;
  ctx2.font = '900 84px "Orbitron", "Impact", system-ui, sans-serif';
  ctx2.fillText(`$${stock.ticker}`, w / 2, 575);

  ctx2.shadowBlur = 0;
  ctx2.fillStyle = '#9aa6c4';
  ctx2.font = '700 30px "Courier New", monospace';
  ctx2.fillText(stock.name, w / 2, 638);

  const c3 = document.createElement('canvas');
  c3.width = w; c3.height = h;
  const ctx3 = c3.getContext('2d');

  const stakeMult = stakeAmount / 1000000;
  const sizeMult = holdSizeMultiplier(holdHours);
  const usdValue = stock.baseUsd * stakeMult * sizeMult;
  const shares = usdValue / stock.sharePrice;
  const luck = luckMultiplier(holdHours, stakeAmount, pureUpfrontStake);
  const genesis = isGenesisLock(stakeAmount, pureUpfrontStake);
  const holdStamp = formatHoldStamp(holdHours);

  ctx3.fillStyle = 'rgba(10, 17, 40, 0.92)';
  ctx3.strokeStyle = stock.color;
  ctx3.lineWidth = 6;
  ctx3.shadowColor = stock.color;
  ctx3.shadowBlur = 24;
  ctx3.fillRect(92, 720, w - 184, 360);
  ctx3.strokeRect(92, 720, w - 184, 360);

  ctx3.shadowBlur = 0;
  ctx3.textAlign = 'center';
  ctx3.fillStyle = '#8b95b0';
  ctx3.font = '700 25px "Courier New", monospace';
  ctx3.fillText('ALLOCATED RWA VALUE', w / 2, 778);

  ctx3.fillStyle = stock.color;
  ctx3.shadowColor = stock.color;
  ctx3.shadowBlur = 28;
  ctx3.font = '900 82px "Orbitron", "Impact", system-ui, sans-serif';
  ctx3.fillText(`+$${usdValue.toFixed(2)}`, w / 2, 875);

  ctx3.shadowBlur = 0;
  ctx3.fillStyle = '#ffffff';
  ctx3.font = '700 32px "Courier New", monospace';
  ctx3.fillText(`${shares.toFixed(4)} ${stock.ticker} SHARES`, w / 2, 955);

  ctx3.fillStyle = stock.accent;
  ctx3.shadowColor = stock.accent;
  ctx3.shadowBlur = 10;
  ctx3.font = '700 24px "Courier New", monospace';
  ctx3.fillText(
    `STAKE: ${(stakeAmount / 1000000).toFixed(1)}M VIB | EFF. HOLD: ${holdStamp} | LUCK: ${luck.toFixed(2)}x`,
    w / 2,
    1006
  );
  if (genesis) {
    ctx3.fillStyle = '#ffd700';
    ctx3.shadowColor = '#ffd700';
    ctx3.shadowBlur = 16;
    ctx3.font = '900 24px "Orbitron", system-ui, sans-serif';
    ctx3.fillText('PURE MAX LOCK +15%', w / 2, 1052);
  }

  ctx3.fillStyle = '#00e5ff';
  ctx3.shadowColor = '#00e5ff';
  ctx3.shadowBlur = 12;
  ctx3.font = '800 26px "Orbitron", system-ui, sans-serif';
  ctx3.fillText('⚡ VERIFIED ON-CHAIN RWA DROP ⚡', w / 2, 1245);

  const result = {
    baseTex: new THREE.CanvasTexture(c1),
    midTex: new THREE.CanvasTexture(c2),
    frontTex: new THREE.CanvasTexture(c3),
  };
  result.baseTex.anisotropy = 4;
  result.midTex.anisotropy = 4;
  result.frontTex.anisotropy = 4;

  cardTextureCache.set(key, result);
  return result;
}

/**
 * Draws crisp, recognizable vector company logos using Canvas 2D Bezier paths.
 */
function drawAuthenticVectorLogo(ctx, cx, cy, ticker, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (ticker === 'NVDA') {
    // NVIDIA Iconic Spiral Eye
    ctx.beginPath();
    ctx.moveTo(-68, 8);
    ctx.bezierCurveTo(-35, -52, 40, -52, 72, 8);
    ctx.bezierCurveTo(40, 56, -30, 56, -54, 14);
    ctx.bezierCurveTo(-30, -24, 22, -24, 42, 8);
    ctx.bezierCurveTo(24, 30, -12, 28, -22, 8);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(4, 6, 11, 0, Math.PI * 2);
    ctx.fill();
  } else if (ticker === 'TSLA') {
    // Tesla T-Crest Emblem
    ctx.beginPath();
    ctx.moveTo(-58, -48);
    ctx.quadraticCurveTo(0, -68, 58, -48);
    ctx.lineWidth = 10;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-46, -30);
    ctx.quadraticCurveTo(0, -44, 46, -30);
    ctx.lineTo(14, -18);
    ctx.lineTo(0, 62);
    ctx.lineTo(-14, -18);
    ctx.closePath();
    ctx.fill();
  } else if (ticker === 'AAPL') {
    // Apple Bitten Silhouette + Leaf
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.bezierCurveTo(-22, -46, -54, -26, -52, 10);
    ctx.bezierCurveTo(-50, 44, -24, 66, -8, 62);
    ctx.bezierCurveTo(0, 60, 6, 60, 14, 62);
    ctx.bezierCurveTo(30, 66, 52, 40, 52, 12);
    ctx.bezierCurveTo(32, 4, 30, -22, 48, -32);
    ctx.bezierCurveTo(36, -46, 16, -44, 0, -28);
    ctx.closePath();
    ctx.fill();

    // Top Leaf
    ctx.beginPath();
    ctx.moveTo(2, -34);
    ctx.quadraticCurveTo(4, -64, 28, -68);
    ctx.quadraticCurveTo(26, -40, 2, -34);
    ctx.fill();
  } else if (ticker === 'MSFT') {
    // Microsoft four-square mark, official brand colors.
    const size = 46;
    const gap = 8;
    const panes = [
      [-size - gap, -size - gap, '#f25022'],
      [gap, -size - gap, '#7fba00'],
      [-size - gap, gap, '#00a4ef'],
      [gap, gap, '#ffb900'],
    ];
    ctx.shadowBlur = 0;
    for (const [x, y, fill] of panes) {
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, size, size);
    }
  } else if (ticker === 'MSTR') {
    // MicroStrategy Bold M + Bitcoin Lightning Emblem
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(-54, 46);
    ctx.lineTo(-54, -42);
    ctx.lineTo(-14, 18);
    ctx.lineTo(26, -42);
    ctx.lineTo(26, 46);
    ctx.stroke();

    // Lightning Bolt
    ctx.beginPath();
    ctx.moveTo(46, -54);
    ctx.lineTo(18, 2);
    ctx.lineTo(42, 2);
    ctx.lineTo(22, 56);
    ctx.lineTo(64, -6);
    ctx.lineTo(38, -6);
    ctx.closePath();
    ctx.fill();
  } else if (ticker === 'SPACEX') {
    // SpaceX X with Long Orbital Sweep
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(-52, -42);
    ctx.lineTo(44, 48);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-52, 48);
    ctx.quadraticCurveTo(-5, -18, 68, -52);
    ctx.stroke();
  } else {
    // SPY / S&P 500 Ascending Bull Market Bars + Arrow
    ctx.fillRect(-52, 16, 20, 36);
    ctx.fillRect(-18, -6, 20, 58);
    ctx.fillRect(16, -32, 20, 84);

    ctx.beginPath();
    ctx.moveTo(-58, 8);
    ctx.lineTo(-8, -28);
    ctx.lineTo(12, -14);
    ctx.lineTo(54, -52);
    ctx.stroke();
  }

  ctx.restore();
}

// ============================================================================
// 7. SPHERICAL PARTICLES, TEXTURES & HUD CONTROLS
// ============================================================================
function initBurstParticles() {
  const geo = new THREE.BufferGeometry();
  burstPositions = new Float32Array(BURST_COUNT * 3);
  burstVelocities = new Float32Array(BURST_COUNT * 3);
  burstColors = new Float32Array(BURST_COUNT * 3);

  geo.setAttribute('position', new THREE.BufferAttribute(burstPositions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(burstColors, 3));

  burstMat = new THREE.PointsMaterial({
    size: 0.42,
    map: glowSpriteTexture,
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  burstSystem = new THREE.Points(geo, burstMat);
  burstSystem.visible = false;
  rootGroup.add(burstSystem);
}

function spawnSphericalBurst(primaryColor, accentColor) {
  burstSystem.visible = true;
  burstMat.opacity = 1.0;

  for (let i = 0; i < BURST_COUNT; i++) {
    const i3 = i * 3;
    burstPositions[i3] = 0;
    burstPositions[i3 + 1] = 0;
    burstPositions[i3 + 2] = 0;

    // Spherical 3D explosion distribution
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const speed = 2.8 + Math.random() * 6.5;

    burstVelocities[i3] = Math.sin(phi) * Math.cos(theta) * speed;
    burstVelocities[i3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
    burstVelocities[i3 + 2] = Math.cos(phi) * speed;

    const c = i % 3 === 0 ? accentColor : primaryColor;
    burstColors[i3] = c.r;
    burstColors[i3 + 1] = c.g;
    burstColors[i3 + 2] = c.b;
  }

  burstSystem.geometry.attributes.position.needsUpdate = true;
  burstSystem.geometry.attributes.color.needsUpdate = true;
}

function updateBurstParticles(dt, elapsed) {
  for (let i = 0; i < BURST_COUNT; i++) {
    const i3 = i * 3;
    // Slight drag for space plasma feel
    burstVelocities[i3] *= 0.985;
    burstVelocities[i3 + 1] *= 0.985;
    burstVelocities[i3 + 2] *= 0.985;

    burstPositions[i3] += burstVelocities[i3] * dt;
    burstPositions[i3 + 1] += burstVelocities[i3 + 1] * dt;
    burstPositions[i3 + 2] += burstVelocities[i3 + 2] * dt;
  }
  burstSystem.geometry.attributes.position.needsUpdate = true;
  burstMat.opacity = Math.max(0, 1.0 - elapsed / 2.6);
}

function createRadialGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.25, 'rgba(255, 255, 255, 0.7)');
  grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.18)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function initAmbientDust() {
  const count = 90;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i += 3) {
    pos[i] = (Math.random() - 0.5) * 22;
    pos[i + 1] = (Math.random() - 0.5) * 14;
    pos[i + 2] = (Math.random() - 0.5) * 10 - 2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.18,
    map: glowSpriteTexture,
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  dustSystem = new THREE.Points(geo, mat);
  bgGroup.add(dustSystem);
}

function createCardBackplateTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 704;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#070b19';
  ctx.fillRect(0, 0, 512, 704);
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 8;
  ctx.strokeRect(20, 20, 472, 664);
  ctx.fillStyle = '#00e5ff';
  ctx.font = '900 42px "Orbitron", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('⚡ VIB VAULT ⚡', 256, 352);
  return new THREE.CanvasTexture(canvas);
}

/** Orbit charge follows staked days. 1 day is the floor, 7 days is the ceiling. */
function chargeFromHoldHours(hours) {
  const days = hours / 24;
  return Math.min(7, Math.max(1, days));
}

// ============================================================================
// 8. EMBEDDED CYBERPUNK UI HUD (Matches Interactive Demo Controls)
// ============================================================================
function setupDomAndEvents() {
  if (embedCanvas) {
    standaloneRenderer = new THREE.WebGLRenderer({
      canvas: embedCanvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    standaloneRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    standaloneRenderer.setClearColor(0x000000, 1);
    sizeEmbedRenderer();
  } else if (!sharedRenderer) {
    standaloneContainer = document.createElement('div');
    Object.assign(standaloneContainer.style, {
      position: 'fixed',
      inset: '0',
      width: '100vw',
      height: '100vh',
      zIndex: '9998',
      display: 'none',
      background: '#05060f',
    });
    document.body.appendChild(standaloneContainer);

    standaloneRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    standaloneRenderer.setClearColor(0x000000, 1);
    standaloneRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    standaloneRenderer.setSize(window.innerWidth, window.innerHeight);
    standaloneContainer.appendChild(standaloneRenderer.domElement);
  }

  // Control bar. Fullscreen widget pins it to the viewport; the profile
  // host places it directly under the reactor canvas.
  hudContainer = document.createElement('div');
  hudContainer.className = 'staking-vault-hud';
  Object.assign(hudContainer.style, hostEl ? {
    position: 'relative',
    zIndex: '2',
    display: 'none',
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    gap: '10px',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: '10px',
    padding: '12px',
    background: '#000000',
    border: '1px solid rgba(0, 229, 255, 0.55)',
    boxShadow: '0 0 22px rgba(0, 229, 255, 0.22)',
    borderRadius: '12px',
    fontFamily: '"Orbitron", "Segoe UI", system-ui, sans-serif',
    color: '#ffffff',
    backdropFilter: 'blur(8px)',
  } : {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '9999',
    display: 'none',
    gap: '14px',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    padding: '14px 24px',
    background: 'rgba(8, 12, 28, 0.88)',
    border: '1.5px solid #00e5ff',
    boxShadow: '0 0 28px rgba(0, 229, 255, 0.28)',
    borderRadius: '12px',
    fontFamily: '"Orbitron", "Segoe UI", system-ui, sans-serif',
    color: '#ffffff',
    backdropFilter: 'blur(8px)',
  });

  hudContainer.innerHTML = `
    <button id="vibVaultActionBtn" style="
      background: linear-gradient(90deg, #00e5ff, #0099ff);
      color: #05060f;
      border: none;
      padding: 11px 22px;
      font-weight: 900;
      font-size: 14px;
      border-radius: 6px;
      cursor: pointer;
      letter-spacing: 1px;
      box-shadow: 0 0 16px rgba(0, 229, 255, 0.5);
    ">⚡ OPEN SAFE</button>

    <label style="font-size: 12px; color: #9aa6c4; display: flex; align-items: center; gap: 8px;">
      STAKE:
      <input id="vibVaultStakeSlider" type="range" min="1000000" max="10000000" step="500000" value="1000000" aria-label="Stake or top-up amount" style="
        accent-color: #00e5ff;
        cursor: pointer;
        width: 120px;
      "/>
      <span id="vibVaultStakeValue" class="tabular" style="color: #00e5ff; font-weight: 800; font-size: 12px; min-width: 40px; text-align: right;">1.0M</span>
    </label>

    <button id="vibVaultTopUpBtn" style="
      background: linear-gradient(90deg, #ff2d95, #ff5c1a);
      color: #05060f;
      border: none;
      padding: 10px 16px;
      font-weight: 900;
      font-size: 12px;
      border-radius: 6px;
      cursor: pointer;
      letter-spacing: 0.8px;
      box-shadow: 0 0 14px rgba(255, 45, 149, 0.5);
    ">⚡ STAKE 1.0M</button>

    <div id="vibVaultEconomy" style="
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 10px;
      width: 100%;
      padding-top: 2px;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      letter-spacing: 0.5px;
      color: #7a8299;
    ">
      <span>STAKE <b id="vibVaultEconStake" style="color: #ffffff;">0.0M</b></span>
      <span>EFF. HOLD <b id="vibVaultEconHold" style="color: #00e5ff;">—</b></span>
      <span>LUCK <b id="vibVaultEconLuck" style="color: #ff2d95;">1.00x</b></span>
      <span id="vibVaultEconBadge" style="display: none; color: #05060f; background: #ffd700; border-radius: 4px; padding: 2px 7px; font-weight: 900; font-size: 10px;">[⚡ UPFRONT MAX +15% LUCK]</span>
    </div>

    <label style="font-size: 12px; color: #9aa6c4; display: flex; align-items: center; gap: 8px;">
      STOCK:
      <select id="vibVaultTickerSelect" style="
        background: #050816;
        color: #00e5ff;
        border: 1px solid #00e5ff;
        padding: 8px 12px;
        border-radius: 6px;
        font-weight: 700;
        cursor: pointer;
      ">
        <option value="RANDOM">Weighted random</option>
        <option value="NVDA" selected>NVIDIA ($NVDA)</option>
        <option value="TSLA">Tesla ($TSLA)</option>
        <option value="AAPL">Apple ($AAPL)</option>
        <option value="MSFT">Microsoft ($MSFT)</option>
        <option value="MSTR">MicroStrategy ($MSTR)</option>
        <option value="SPACEX">SpaceX ($SPACEX)</option>
        <option value="SPY">S&P 500 ($SPY)</option>
      </select>
    </label>

    <label style="font-size: 12px; color: #9aa6c4; display: flex; align-items: center; gap: 8px;">
      ORBIT CHARGE:
      <input id="vibVaultChargeSlider" type="range" min="1" max="7" step="0.1" value="1" style="
        accent-color: #ff2d95;
        cursor: pointer;
        width: 110px;
      "/>
    </label>

    <button id="vibVaultCloseBtn" style="
      background: transparent;
      color: #7a8299;
      border: 1px solid #3a425e;
      padding: 9px 14px;
      font-size: 12px;
      border-radius: 6px;
      cursor: pointer;
    ">✕ CLOSE</button>
  `;
  (hostEl || document.body).appendChild(hudContainer);

  // Wire up UI events
  const actionBtn = hudContainer.querySelector('#vibVaultActionBtn');
  const selectEl = hudContainer.querySelector('#vibVaultTickerSelect');
  const sliderEl = hudContainer.querySelector('#vibVaultChargeSlider');
  const closeBtn = hudContainer.querySelector('#vibVaultCloseBtn');
  const stakeSliderEl = hudContainer.querySelector('#vibVaultStakeSlider');
  const topUpBtn = hudContainer.querySelector('#vibVaultTopUpBtn');

  forcedTicker = selectEl.value;

  actionBtn.addEventListener('click', () => triggerBreachAndClaim());
  stakeSliderEl.addEventListener('input', (e) => {
    refreshStakeChoiceLabels(Number(e.target.value));
  });
  topUpBtn.addEventListener('click', () => handleStakeOrTopUp());
  selectEl.addEventListener('change', (e) => {
    forcedTicker = e.target.value;
    if (animPhase === 'REVEALING') {
      selectedStock = RWA_STOCKS.find((s) => s.ticker === forcedTicker) || RWA_STOCKS[2];
      triggerCardExplosion(performance.now());
      emitRevealedCard();
    }
  });
  sliderEl.addEventListener('input', (e) => {
    chargeMultiplier = parseFloat(e.target.value);
  });
  closeBtn.addEventListener('click', () => closeStakingVault());

  // Mouse Tilt & Orbit Drag Inspection
  window.addEventListener('pointermove', (e) => {
    if (!isActive) return;
    const rect = (embedCanvas || standaloneRenderer?.domElement)?.getBoundingClientRect();
    const nx = rect && rect.width
      ? ((e.clientX - rect.left) / rect.width) * 2 - 1
      : (e.clientX / window.innerWidth) * 2 - 1;
    const ny = rect && rect.height
      ? -((e.clientY - rect.top) / rect.height) * 2 + 1
      : -(e.clientY / window.innerHeight) * 2 + 1;
    pointerX = nx;
    pointerY = ny;

    if (isDragging) {
      dragRotationY = nx * 1.2;
      dragRotationX = -ny * 0.8;
    }
  });
  window.addEventListener('pointerdown', () => { isDragging = true; });
  window.addEventListener('pointerup', () => { isDragging = false; });
  window.addEventListener('resize', onWindowResize);
}

function updateHudButtonLabel(text) {
  if (!hudContainer) return;
  const btn = hudContainer.querySelector('#vibVaultActionBtn');
  if (btn) btn.textContent = text;
}

function syncChargeSlider() {
  if (!hudContainer) return;
  const slider = hudContainer.querySelector('#vibVaultChargeSlider');
  if (!slider || document.activeElement === slider) return;
  slider.value = String(chargeMultiplier);
}

/**
 * Economy HUD: one vault at a time, 1M–10M. Offers the first deposit while
 * empty and a top-up while a vault is open. Shows effective hold (weighted)
 * and the luck multiplier it buys, plus the pure-max badge.
 */
function syncEconomyHud() {
  if (!hudContainer) return;

  const slider = hudContainer.querySelector('#vibVaultStakeSlider');
  const topUpBtn = hudContainer.querySelector('#vibVaultTopUpBtn');
  const econStake = hudContainer.querySelector('#vibVaultEconStake');
  const econHold = hudContainer.querySelector('#vibVaultEconHold');
  const econLuck = hudContainer.querySelector('#vibVaultEconLuck');
  const badge = hudContainer.querySelector('#vibVaultEconBadge');

  const active = currentStakeAmount > 0;
  const room = active
    ? Math.max(0, MAX_STAKE - currentStakeAmount)
    : Math.min(MAX_STAKE, walletVib);
  const step = active ? TOPUP_STEP : STAKE_STEP;
  const maxAdd = Math.floor(room / step) * step;
  const minAdd = active ? Math.min(step, maxAdd) : MIN_STAKE;
  const enabled = maxAdd >= minAdd && maxAdd > 0;

  let choice = 0;
  if (slider) {
    slider.min = String(Math.max(0, minAdd));
    slider.max = String(Math.max(minAdd, maxAdd));
    slider.step = String(step);
    slider.disabled = !enabled;
    let value = Number(slider.value);
    if (!Number.isFinite(value) || value <= 0) value = minAdd;
    value = Math.round(value / step) * step;
    if (value < minAdd) value = minAdd;
    if (value > maxAdd) value = maxAdd;
    if (enabled) slider.value = String(value);
    choice = enabled ? value : 0;

    const span = Math.max(1, maxAdd - minAdd);
    const pct = enabled ? ((value - minAdd) / span) * 100 : 0;
    slider.style.setProperty('--stake-pct', `${Math.max(0, Math.min(100, pct))}%`);
  }

  if (topUpBtn) {
    topUpBtn.disabled = !enabled;
    topUpBtn.style.opacity = enabled ? '1' : '0.45';
    topUpBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }
  refreshStakeChoiceLabels(choice);

  if (econStake) econStake.textContent = active ? `${(currentStakeAmount / 1000000).toFixed(1)}M` : '0.0M';
  if (econHold) {
    const locked = active && currentHoldHours < LOCK_HOURS;
    econHold.textContent = active ? `${formatHoldStamp(currentHoldHours)}${locked ? ' 🔒' : ''}` : '—';
    econHold.style.color = locked ? '#ff5c1a' : '#00e5ff';
  }
  if (econLuck) {
    econLuck.textContent = `${luckMultiplier(currentHoldHours, currentStakeAmount, pureUpfront).toFixed(2)}x`;
  }
  if (badge) {
    badge.style.display = isGenesisLock(currentStakeAmount, pureUpfront) ? 'inline-block' : 'none';
  }
  syncActionButtonLabel();
}

/** OPEN SAFE only when the effective hold has actually cleared the 24h lock. */
function syncActionButtonLabel() {
  if (!isActive || animPhase !== 'REACTOR_IDLE') return;
  if (currentStakeAmount <= 0) {
    updateHudButtonLabel('⚡ OPEN SAFE');
    return;
  }
  if (currentHoldHours < LOCK_HOURS) {
    updateHudButtonLabel(`🔒 LOCKED · ${formatHoldStamp(Math.max(0, LOCK_HOURS - currentHoldHours))}`);
    return;
  }
  updateHudButtonLabel('⚡ OPEN SAFE');
}

/** Slider value + button copy. Range limits stay put so dragging stays smooth. */
function refreshStakeChoiceLabels(choice) {
  if (!hudContainer) return;
  const valueEl = hudContainer.querySelector('#vibVaultStakeValue');
  const topUpBtn = hudContainer.querySelector('#vibVaultTopUpBtn');
  const active = currentStakeAmount > 0;
  const amount = Number(choice) > 0 ? `${(Number(choice) / 1000000).toFixed(1)}M` : '';

  if (valueEl) valueEl.textContent = amount || '—';
  if (topUpBtn) {
    if (active) {
      topUpBtn.textContent = amount ? `+ TOP-UP ${amount}` : 'MAX CAP REACHED';
    } else {
      topUpBtn.textContent = amount ? `⚡ STAKE ${amount}` : 'NEED 1M $VIB';
    }
  }
}

function handleStakeOrTopUp() {
  if (animPhase !== 'REACTOR_IDLE' || !hudContainer) return;
  const slider = hudContainer.querySelector('#vibVaultStakeSlider');
  const amount = slider ? Number(slider.value) : 0;
  if (!Number.isFinite(amount) || amount <= 0) return;

  // The profile owns the live economy; fall back to a local simulation when
  // the vault is mounted as a standalone widget.
  if (currentStakeAmount > 0) {
    if (typeof onTopUpCallback === 'function') onTopUpCallback(amount);
    else applyLocalTopUp(amount);
  } else if (typeof onInitialStakeCallback === 'function') {
    onInitialStakeCallback(amount);
  } else {
    applyLocalStake(amount);
  }

  chargeMultiplier = chargeFromHoldHours(currentHoldHours);
  syncChargeSlider();
  syncEconomyHud();
  applyStakeSatellites();
}

function applyLocalStake(amount) {
  if (currentStakeAmount > 0) return false;
  if (!Number.isFinite(amount) || amount < MIN_STAKE || amount > MAX_STAKE) return false;
  if (amount > walletVib) return false;
  walletVib -= amount;
  currentStakeAmount = amount;
  currentHoldHours = 0;
  pureUpfront = true;
  return true;
}

/** newEffectiveHours = (currentStake * effectiveHoldHours) / (currentStake + added) */
function applyLocalTopUp(amount) {
  if (currentStakeAmount <= 0) return false;
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (amount > walletVib) return false;
  const next = currentStakeAmount + amount;
  if (next > MAX_STAKE) return false;
  currentHoldHours = (currentStakeAmount * currentHoldHours) / next;
  currentStakeAmount = next;
  walletVib -= amount;
  pureUpfront = false;
  return true;
}

// ============================================================================
// 9. HELPERS & RESET
// ============================================================================
function resetToReactorState() {
  animPhase = 'REACTOR_IDLE';
  phaseStartTime = performance.now();
  reactorGroup.visible = true;
  cardGroup.visible = false;
  burstSystem.visible = false;
  if (coreShockwaveRing) coreShockwaveRing.visible = false;

  orbitRings.forEach((r) => r.scale.setScalar(1.0));
  satellites.forEach((s) => {
    s.orbitRadius = s.baseRadius;
    s.mesh.scale.setScalar(1.0);
  });
  revealDelivered = false;
  lockedStakeAmount = null;
  lockedHoldHours = null;
  lockedPure = null;
  applyStakeSatellites();
  syncEconomyHud();
}

/** 1M staked → 1 sphere, each extra 0.5M → one more, spread across the three orbits. */
function stakeSatelliteCount(amount) {
  return Math.max(0, Math.floor((amount || 0) / 500_000) - 1);
}

function applyStakeSatellites() {
  const count = Math.min(satellites.length, stakeSatelliteCount(currentStakeAmount));
  const groups = [[], [], []];
  satellites.forEach((sat, i) => {
    sat.active = i < count;
    sat.mesh.visible = sat.active;
    sat.trails.forEach((tr) => { tr.visible = sat.active; });
    if (sat.active) groups[sat.orbitIndex].push(sat);
  });
  groups.forEach((group, orbitIndex) => {
    group.forEach((sat, i) => {
      sat.angle = (i / group.length) * Math.PI * 2 + orbitIndex * 0.35;
    });
  });
  if (embedCanvas) embedCanvas.dataset.orbitSpheres = String(count);
}

function payoutStake() {
  return lockedStakeAmount != null ? lockedStakeAmount : currentStakeAmount;
}

function payoutHold() {
  return lockedHoldHours != null ? lockedHoldHours : currentHoldHours;
}

function payoutPure() {
  return lockedPure != null ? lockedPure : pureUpfront;
}

function rewardPayload() {
  const stakeAmount = payoutStake();
  const holdHours = payoutHold();
  const upfront = payoutPure();
  const stakeMult = stakeAmount / 1000000;
  const sizeMult = holdSizeMultiplier(holdHours);
  const usdValue = selectedStock.baseUsd * stakeMult * sizeMult;
  return {
    stock: selectedStock,
    usdValue,
    shares: usdValue / selectedStock.sharePrice,
    stakeAmount,
    holdHours,
    luckMultiplier: luckMultiplier(holdHours, stakeAmount, upfront),
    pureMaxLock: isGenesisLock(stakeAmount, upfront),
  };
}

function emitRevealedCard() {
  if (typeof onRevealCallback !== 'function') return;
  const update = revealDelivered;
  revealDelivered = true;
  onRevealCallback(rewardPayload(), { update });
}

function getChargeColor(norm) {
  const cyan = new THREE.Color(0x00e5ff);
  const magenta = new THREE.Color(0xff2d95);
  const gold = new THREE.Color(0xffd700);
  if (norm < 0.5) {
    return cyan.lerp(magenta, norm * 2.0);
  }
  return magenta.lerp(gold, (norm - 0.5) * 2.0);
}

function rollWeightedStock(holdHours, stakeAmount = 0, pureUpfrontStake = false) {
  const weights = RWA_STOCKS.map((s) => holdDropWeight(s, holdHours, stakeAmount, pureUpfrontStake));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < RWA_STOCKS.length; i++) {
    r -= weights[i];
    if (r <= 0) return RWA_STOCKS[i];
  }
  return RWA_STOCKS[0];
}

function easeOutBackCard(t) {
  const c1 = 1.70158;
  const c2 = c1 + 1;
  return 1 + c2 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function renderScene() {
  const activeRenderer = sharedRenderer || standaloneRenderer;
  if (!activeRenderer) return;

  if (sharedRenderer) {
    const prevAutoClear = sharedRenderer.autoClear;
    sharedRenderer.autoClear = false;
    sharedRenderer.clearDepth();
    sharedRenderer.render(scene, camera);
    sharedRenderer.autoClear = prevAutoClear;
  } else {
    standaloneRenderer.render(scene, camera);
  }
}

function finishVaultSession() {
  isActive = false;
  animPhase = 'REACTOR_IDLE';
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (!sharedRenderer && standaloneContainer) standaloneContainer.style.display = 'none';
  if (hudContainer) hudContainer.style.display = 'none';

  if (onCompleteCallback) onCompleteCallback(rewardPayload());
}

function sizeEmbedRenderer() {
  if (!standaloneRenderer || !embedCanvas) return;
  const w = embedCanvas.clientWidth || 640;
  const h = embedCanvas.clientHeight || w;
  standaloneRenderer.setSize(w, h, false);
  if (camera) {
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
}

function onWindowResize() {
  if (!camera) return;
  if (embedCanvas) {
    sizeEmbedRenderer();
    return;
  }
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (standaloneRenderer) {
    standaloneRenderer.setSize(window.innerWidth, window.innerHeight);
  }
}