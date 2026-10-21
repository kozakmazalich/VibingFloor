/**
 * VIB STAKING VAULT & ALCHEMY FORGE — RWA Stock Reveal Module for "VIBING FLOOR"
 * -------------------------------------------------------------------------------
 * Pure ES Module. Zero external dependencies beyond 'three' via importmap.
 *
 * This is a VERBATIM port of the reference gemini-code-1792588207540.js:
 *   - Central Plasma Sphere core with orbiting satellite spheres + neon rings
 *   - Procedurally rendered vector company logos (NVDA, TSLA, AAPL, MSFT,
 *     MSTR, COIN, SPY, BRK.B, SPACEX)
 *   - Singularity implosion animation leading to a 3D Holographic Stock
 *     Certificate reveal
 *
 * Integration adapters (the ONLY additions over the reference):
 *   - renders into the profile page's own canvas via options.canvas (the
 *     profile needs a persistent embedded view, not a full-screen overlay)
 *   - after a claim the reactor returns to IDLE and keeps animating, so the
 *     profile vault stays alive for repeated claims
 *   - STAKE-REACTIVE plasma colour: the more $VIB staked (live from
 *     src/staking.js), the hotter the sphere colour — cyan → green → gold →
 *     magenta
 *   - hideStakingVault() / getVaultDebug() for the profile page + tests
 */

import * as THREE from 'three';
import { getStakeState } from './staking.js';

// ============================================================================
// 1. RWA STOCK TIERS & PROCEDURAL VECTOR LOGOS
// ============================================================================
export const RWA_STOCKS = [
  { tier: 'COMMON',    ticker: 'SPY',    name: 'S&P 500 ETF',       baseUsd: 0.50, color: '#7a8299', icon: 'bull' },
  { tier: 'COMMON',    ticker: 'BRK.B',  name: 'Berkshire Hathaway',  baseUsd: 0.50, color: '#7a8299', icon: 'shield' },
  { tier: 'UNCOMMON',  ticker: 'AAPL',   name: 'Apple Inc.',          baseUsd: 2.00, color: '#39ff14', icon: 'apple' },
  { tier: 'UNCOMMON',  ticker: 'MSFT',   name: 'Microsoft Corp.',     baseUsd: 2.00, color: '#39ff14', icon: 'windows' },
  { tier: 'RARE',      ticker: 'NVDA',   name: 'NVIDIA Corp.',        baseUsd: 8.00, color: '#00e5ff', icon: 'nvidia' },
  { tier: 'RARE',      ticker: 'TSLA',   name: 'Tesla Inc.',          baseUsd: 8.00, color: '#00e5ff', icon: 'tesla' },
  { tier: 'EPIC',      ticker: 'MSTR',   name: 'MicroStrategy',       baseUsd: 35.00, color: '#ff2d95', icon: 'bitcoin' },
  { tier: 'EPIC',      ticker: 'COIN',   name: 'Coinbase Global',     baseUsd: 35.00, color: '#ff2d95', icon: 'coin' },
  { tier: 'LEGENDARY', ticker: 'SPACEX', name: 'SpaceX Pre-IPO RWA',  baseUsd: 250.00, color: '#ffd700', icon: 'spacex' },
];

const COLORS = {
  bgNum: 0x05060f,
  cyanNum: 0x00e5ff,
  magentaNum: 0xff2d95,
  goldNum: 0xffd700,
  greenNum: 0x39ff14,
  greyNum: 0x7a8299,
};

// Stake-reactive plasma colour ramp: cyan (0) -> green (3M) -> gold (5M) -> magenta (10M+)
const STAKE_COLOR_STOPS = [
  { amount: 0,        color: new THREE.Color(COLORS.cyanNum) },
  { amount: 3000000,  color: new THREE.Color(COLORS.greenNum) },
  { amount: 5000000,  color: new THREE.Color(COLORS.goldNum) },
  { amount: 10000000, color: new THREE.Color(COLORS.magentaNum) },
];
const _stakeColor = new THREE.Color(COLORS.cyanNum);

// ============================================================================
// 2. MODULE STATE (Singleton for Mesh/Texture Reuse)
// ============================================================================
let isInitialized = false;
let isActive = false;

// Renderer setup
let canvas = null;
let renderer = null;
let sharedRenderer = null;
let standaloneRenderer = null;
let standaloneContainer = null;
let rafId = null;

// Scene & Camera
let scene = null;
let camera = null;
let rootGroup = null;
let reactorGroup = null;
let revealGroup = null;

// Reactor Meshes
let centralSphere = null;
let centralSphereMat = null;
let satelliteSpheres = [];
let orbitRings = [];

// Reveal Card Meshes
let revealCardMesh = null;
let revealCardMat = null;

// Particles
let particleSystem = null;
let particlePositions = null;
let particleVelocities = null;
let particleColors = null;
let particleMat = null;
const PARTICLE_COUNT = 80;

// Animation State
let animPhase = 'IDLE'; // 'REACTOR_IDLE' | 'IMPLODING' | 'REVEALING' | 'FADING' | 'IDLE'
let phaseStartTime = 0;
let lastFrameTime = 0;
let selectedStock = null;
let currentStakeAmount = 1000000;
let currentHoldHours = 24;
let onCompleteCallback = null;

const textureCache = new Map();

// ============================================================================
// 3. PUBLIC API
// ============================================================================

/**
 * Triggers the 3D Staking Vault & Stock Reveal sequence.
 *
 * @param {Function} onComplete - Fired after the stock is claimed and fades out.
 *                                Receives `{ stock, usdValue, stakeAmount, holdHours }`.
 * @param {Object} [options] - Optional configuration.
 * @param {number} [options.stakeAmount] - $VIB tokens staked (supports 1M, 1.2M, 3M, 5M, 10M+).
 * @param {number} [options.holdHours=24] - Staking duration in hours (24h, 72h, 168h).
 * @param {HTMLCanvasElement} [options.canvas] - Render into the profile page's own canvas.
 * @param {THREE.WebGLRenderer} [options.renderer] - Pass existing game renderer to avoid a 2nd canvas.
 */
export function showStakingVault(onComplete, options = {}) {
  if (isActive) return;
  isActive = true;
  onCompleteCallback = typeof onComplete === 'function' ? onComplete : () => {};

  currentStakeAmount = options.stakeAmount ?? getStakeState().totalStaked;
  currentHoldHours = options.holdHours ?? getStakeState().holdHours;
  canvas = options.canvas || null;
  if (options.renderer) sharedRenderer = options.renderer;

  initVaultResources();

  if (!canvas && !sharedRenderer && standaloneContainer) {
    standaloneContainer.style.display = 'block';
    standaloneContainer.style.opacity = '1';
    onWindowResize();
  }

  // Reset visual state
  resetVaultForIdle();

  animPhase = 'REACTOR_IDLE';
  lastFrameTime = performance.now();
  phaseStartTime = lastFrameTime;

  const loop = (now) => {
    if (!isActive) return;
    rafId = requestAnimationFrame(loop);
    updateStakingVault(now);
  };
  rafId = requestAnimationFrame(loop);
}

/** Stop the vault (profile closed). The reactor stays built for reuse. */
export function hideStakingVault() {
  isActive = false;
  onCompleteCallback = null;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

/**
 * Trigger the Breach & Claim RWA sequence programmatically.
 */
export function triggerBreachAndClaim() {
  if (animPhase !== 'REACTOR_IDLE') return;

  // Sync with the live staking state (single source of truth) so the
  // payout and hold tiers match whatever is staked right now.
  currentStakeAmount = getStakeState().totalStaked || currentStakeAmount;
  currentHoldHours = getStakeState().holdHours || currentHoldHours;

  // Roll weighted stock based on hold hours & stake
  selectedStock = rollWeightedStock(currentHoldHours);

  animPhase = 'IMPLODING';
  phaseStartTime = performance.now();

  // Dim reactor rings and pull satellites inward
  for (let i = 0; i < satelliteSpheres.length; i++) {
    satelliteSpheres[i].userData.imploding = true;
  }
}

/** Debug snapshot for the page/tests. */
export function getVaultDebug() {
  return {
    active: isActive,
    phase: animPhase === 'REACTOR_IDLE' ? 'IDLE' : animPhase,
    sphereCount: satelliteSpheres.length,
    reactorScale: reactorGroup ? reactorGroup.scale.x : 1,
    sphereColor: centralSphereMat ? '#' + centralSphereMat.color.getHexString() : null,
  };
}

/**
 * Updates and renders the Staking Vault scene.
 */
export function updateStakingVault(now = performance.now()) {
  if (!isActive) return;

  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;
  const elapsed = (now - phaseStartTime) / 1000;

  // Rotate orbital rings and satellite spheres
  const speedFactor = currentHoldHours >= 168 ? 2.5 : currentHoldHours >= 72 ? 1.7 : 1.0;
  for (let i = 0; i < orbitRings.length; i++) {
    orbitRings[i].rotation.z += dt * 0.4 * (i % 2 === 0 ? 1 : -1) * speedFactor;
  }

  for (let i = 0; i < satelliteSpheres.length; i++) {
    const sat = satelliteSpheres[i];
    const orbit = sat.userData;
    orbit.angle += dt * orbit.speed * speedFactor;

    if (sat.userData.imploding) {
      // Spiral inward towards center
      orbit.radius = Math.max(0.1, orbit.radius - dt * 6.0);
      sat.scale.multiplyScalar(Math.max(0.85, 1.0 - dt * 2.0));
    }

    sat.position.x = Math.cos(orbit.angle) * orbit.radius;
    sat.position.y = Math.sin(orbit.angle) * orbit.radius * Math.sin(orbit.inclination);
    sat.position.z = Math.sin(orbit.angle) * orbit.radius * Math.cos(orbit.inclination);
  }

  // Pulsate central sphere core
  if (centralSphere) {
    const pulse = 1.0 + Math.sin(now * 0.005) * 0.06;
    centralSphere.scale.setScalar(pulse);
  }

  // STAKE-REACTIVE PLASMA: the more $VIB staked, the hotter the core colour
  stakeColorFor(getStakeState().totalStaked, _stakeColor);
  if (!centralSphereMat.color.equals(_stakeColor)) {
    centralSphereMat.color.lerp(_stakeColor, Math.min(1, dt * 4));
  }

  if (animPhase === 'REACTOR_IDLE') {
    // Idle floating bob
    reactorGroup.position.y = Math.sin(now * 0.002) * 0.08;
  } else if (animPhase === 'IMPLODING') {
    if (elapsed >= 0.8) {
      // Trigger reveal pop-out
      triggerStockRevealCard(now);
    }
  } else if (animPhase === 'REVEALING') {
    const revealElapsed = elapsed - 0.8;
    const t = Math.min(revealElapsed / 0.6, 1.0);
    const popScale = easeOutBack(t);
    const pulse = 1.0 + Math.sin(revealElapsed * 8.0) * 0.02;

    revealCardMesh.scale.setScalar(popScale * pulse);
    revealCardMesh.position.z = 2.5 + Math.min(revealElapsed * 1.5, 0.5);

    // Update particle burst
    if (particleSystem.visible) {
      updateParticles(dt, revealElapsed);
    }

    if (revealElapsed >= 3.5) {
      animPhase = 'FADING';
      phaseStartTime = now;
    }
  } else if (animPhase === 'FADING') {
    const t = Math.min(elapsed / 0.4, 1.0);
    const alpha = 1.0 - t;
    setVaultOpacity(alpha);

    if (t >= 1.0) {
      finishAndCleanup();
      return;
    }
  }

  renderVaultScene();
}

// ============================================================================
// 4. WEIGHTED RWA STOCK ROLLER
// ============================================================================
function rollWeightedStock(holdHours) {
  // Hold hours shift probability weights from Common toward Rare/Epic/Legendary
  let weights = RWA_STOCKS.map((stock) => {
    let w = 10;
    if (stock.tier === 'COMMON') w = holdHours >= 168 ? 15 : holdHours >= 72 ? 45 : 65;
    if (stock.tier === 'UNCOMMON') w = holdHours >= 168 ? 42 : holdHours >= 72 ? 33 : 24;
    if (stock.tier === 'RARE') w = holdHours >= 168 ? 29 : holdHours >= 72 ? 16.5 : 8.5;
    if (stock.tier === 'EPIC') w = holdHours >= 168 ? 12.5 : holdHours >= 72 ? 5.0 : 2.3;
    if (stock.tier === 'LEGENDARY') w = holdHours >= 168 ? 1.5 : holdHours >= 72 ? 0.5 : 0.2;
    return w;
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  let accum = 0;

  for (let i = 0; i < RWA_STOCKS.length; i++) {
    accum += weights[i];
    if (roll <= accum) return RWA_STOCKS[i];
  }
  return RWA_STOCKS[0];
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c2 = c1 + 1;
  return 1 + c2 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ============================================================================
// 5. 3D SCENE & GEOMETRY SETUP
// ============================================================================
function initVaultResources() {
  if (isInitialized) return;
  isInitialized = true;

  scene = new THREE.Scene();
  const aspect = canvas
    ? canvas.clientWidth / Math.max(1, canvas.clientHeight)
    : window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
  camera.position.set(0, 0, 11);

  rootGroup = new THREE.Group();
  scene.add(rootGroup);

  // Backdrop
  const bgGeo = new THREE.PlaneGeometry(60, 40);
  const bgMat = new THREE.MeshBasicMaterial({ color: COLORS.bgNum, transparent: true, opacity: 0.94 });
  const bgMesh = new THREE.Mesh(bgGeo, bgMat);
  bgMesh.position.z = -6.0;
  rootGroup.add(bgMesh);

  // --- A. THE SPHERICAL OVERCHARGE REACTOR ---
  reactorGroup = new THREE.Group();
  rootGroup.add(reactorGroup);

  // Central Plasma Sphere Core (exact reference look: glowing wireframe cage
  // over the dark inner core — colour driven by the staked amount)
  const sphereGeo = new THREE.SphereGeometry(1.4, 32, 32);
  centralSphereMat = new THREE.MeshBasicMaterial({
    color: COLORS.cyanNum,
    wireframe: true,
    transparent: true,
    opacity: 0.85,
  });
  centralSphere = new THREE.Mesh(sphereGeo, centralSphereMat);
  reactorGroup.add(centralSphere);

  // Inner solid core glow sphere
  const coreGeo = new THREE.SphereGeometry(1.25, 24, 24);
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x030614 });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  reactorGroup.add(coreMesh);

  // Orbital Rings & Satellite Spheres
  const ringCount = 3;
  const satPerRing = 6;
  for (let r = 0; r < ringCount; r++) {
    const radius = 2.4 + r * 0.75;
    const ringGeo = new THREE.TorusGeometry(radius, 0.03, 8, 48);
    ringGeo.rotateX(Math.PI / 2 + r * 0.4);
    const ringMat = new THREE.MeshBasicMaterial({
      color: r === 0 ? COLORS.cyanNum : r === 1 ? COLORS.magentaNum : COLORS.goldNum,
      transparent: true,
      opacity: 0.4,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    reactorGroup.add(ringMesh);
    orbitRings.push(ringMesh);

    // Orbiting Satellite Spheres
    for (let s = 0; s < satPerRing; s++) {
      const satGeo = new THREE.SphereGeometry(0.18, 16, 16);
      const satMat = new THREE.MeshBasicMaterial({ color: ringMat.color });
      const satMesh = new THREE.Mesh(satGeo, satMat);

      const angle = (s / satPerRing) * Math.PI * 2;
      satMesh.userData = {
        radius,
        angle,
        speed: 1.2 + r * 0.4,
        inclination: (r - 1) * 0.5,
        imploding: false,
      };
      reactorGroup.add(satMesh);
      satelliteSpheres.push(satMesh);
    }
  }

  // --- B. 3D HOLOGRAPHIC REVEAL CARD ---
  revealGroup = new THREE.Group();
  rootGroup.add(revealGroup);

  const cardGeo = new THREE.PlaneGeometry(4.2, 5.8);
  revealCardMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 1.0,
    depthTest: false,
  });
  revealCardMesh = new THREE.Mesh(cardGeo, revealCardMat);
  revealCardMesh.position.set(0, 0, 2.5);
  revealCardMesh.visible = false;
  revealCardMesh.renderOrder = 20;
  revealGroup.add(revealCardMesh);

  // --- C. PARTICLE SYSTEM FOR REVEAL BURST ---
  initParticles();

  // --- D. RENDERER TARGET ---
  if (canvas) {
    // Profile page's own canvas
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    sizeRenderer();
  } else if (!sharedRenderer) {
    // Standalone full-screen overlay fallback (reference behaviour)
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
    });
    document.body.appendChild(standaloneContainer);

    standaloneRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    standaloneRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    standaloneRenderer.setSize(window.innerWidth, window.innerHeight);
    standaloneContainer.appendChild(standaloneRenderer.domElement);
  }

  window.addEventListener('resize', onWindowResize);
}

// ============================================================================
// 6. PROCEDURAL CANVAS TEXTURES & VECTOR LOGOS
// ============================================================================
function getStockCardTexture(stock, stakeAmount, holdHours) {
  const cacheKey = `${stock.ticker}_${stakeAmount}_${holdHours}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1408; // 3:4 aspect ratio
  const ctx = canvas.getContext('2d');

  const w = canvas.width;
  const h = canvas.height;

  // 1. Background Fill
  ctx.fillStyle = '#080b1a';
  ctx.fillRect(0, 0, w, h);

  // Scanlines
  ctx.fillStyle = 'rgba(0, 229, 255, 0.025)';
  for (let y = 0; y < h; y += 10) {
    ctx.fillRect(0, y, w, 4);
  }

  // 2. Card Border & Cyber Corners
  const mainColor = stock.color;
  ctx.strokeStyle = mainColor;
  ctx.lineWidth = 10;
  ctx.shadowColor = mainColor;
  ctx.shadowBlur = 24;
  ctx.strokeRect(32, 32, w - 64, h - 64);

  ctx.fillStyle = mainColor;
  const notch = 40;
  ctx.fillRect(32, 32, notch, notch);
  ctx.fillRect(w - 32 - notch, 32, notch, notch);
  ctx.fillRect(32, h - 32 - notch, notch, notch);
  ctx.fillRect(w - 32 - notch, h - 32 - notch, notch, notch);
  ctx.shadowBlur = 0;

  // 3. Draw Vector Logo inside Top Medallion
  ctx.save();
  ctx.translate(w / 2, 240);
  ctx.fillStyle = 'rgba(0, 229, 255, 0.12)';
  ctx.beginPath();
  ctx.arc(0, 0, 110, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = mainColor;
  ctx.lineWidth = 6;
  ctx.shadowColor = mainColor;
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.restore();

  drawVectorLogo(ctx, w / 2, 240, stock.icon, mainColor);

  // 4. Stock Ticker & Company Name
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = mainColor;
  ctx.shadowBlur = 16;
  ctx.font = '900 68px "Orbitron", "Impact", sans-serif';
  ctx.fillText(`$${stock.ticker}`, w / 2, 430);

  ctx.fillStyle = '#7a8299';
  ctx.shadowBlur = 0;
  ctx.font = '700 28px "Courier New", monospace';
  ctx.fillText(stock.name.toUpperCase(), w / 2, 500);

  // 5. Calculation Payout ($ USD & Fractional Shares)
  const stakeMultiplier = stakeAmount / 1000000;
  const holdMultiplier = holdHours >= 168 ? 2.0 : holdHours >= 72 ? 1.25 : 1.0;
  const totalUsdValue = stock.baseUsd * stakeMultiplier * holdMultiplier;
  // Estimate share price mock for fractional calculation
  const mockSharePrice = stock.baseUsd > 100 ? 185 : stock.baseUsd > 10 ? 140 : 225;
  const fractionalShares = totalUsdValue / mockSharePrice;

  // Payout Box Background
  ctx.fillStyle = '#0f1633';
  ctx.strokeStyle = mainColor;
  ctx.lineWidth = 4;
  ctx.fillRect(80, 580, w - 160, 260);
  ctx.strokeRect(80, 580, w - 160, 260);

  ctx.fillStyle = '#7a8299';
  ctx.font = '700 24px "Courier New", monospace';
  ctx.fillText('RWA EQUITY ALLOCATION', w / 2, 630);

  ctx.fillStyle = mainColor;
  ctx.shadowColor = mainColor;
  ctx.shadowBlur = 20;
  ctx.font = '900 64px "Orbitron", sans-serif';
  ctx.fillText(`+$${totalUsdValue.toFixed(2)} USD`, w / 2, 700);

  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 0;
  ctx.font = '700 26px "Courier New", monospace';
  ctx.fillText(`${fractionalShares.toFixed(4)} SHARES CREDITED`, w / 2, 770);

  // 6. Stake & Hold Metadata Footer
  ctx.fillStyle = '#586075';
  ctx.font = '700 22px "Courier New", monospace';
  ctx.fillText(`STAKE: ${(stakeAmount / 1000000).toFixed(1)}M VIB  |  HOLD: ${holdHours}H`, w / 2, 950);

  // Viral Footer Tagline
  ctx.fillStyle = COLORS.cyanNum;
  ctx.shadowColor = COLORS.cyanNum;
  ctx.shadowBlur = 10;
  ctx.font = '900 26px "Orbitron", sans-serif';
  ctx.fillText('⚡ VIBING FLOOR ALCHEMY ⚡', w / 2, 1120);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  textureCache.set(cacheKey, tex);
  return tex;
}

/**
 * Procedural vector icon renderer for each RWA stock
 */
function drawVectorLogo(ctx, cx, cy, iconType, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 15;

  if (iconType === 'nvidia') {
    // Spiral Eye
    ctx.beginPath();
    ctx.arc(cx, cy, 55, 0, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 1.2);
    ctx.stroke();
  } else if (iconType === 'tesla') {
    // T Shield
    ctx.beginPath();
    ctx.moveTo(cx - 50, cy - 45);
    ctx.lineTo(cx + 50, cy - 45);
    ctx.moveTo(cx, cy - 45);
    ctx.lineTo(cx, cy + 55);
    ctx.stroke();
  } else if (iconType === 'apple') {
    // Apple silhouette
    ctx.beginPath();
    ctx.arc(cx, cy + 10, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 15, cy - 35, 12, 0, Math.PI * 2);
    ctx.fill();
  } else if (iconType === 'windows') {
    // 4 Squares
    const s = 24;
    ctx.fillRect(cx - s - 4, cy - s - 4, s, s);
    ctx.fillRect(cx + 4, cy - s - 4, s, s);
    ctx.fillRect(cx - s - 4, cy + 4, s, s);
    ctx.fillRect(cx + 4, cy + 4, s, s);
  } else if (iconType === 'bitcoin') {
    // Bitcoin Lightning
    ctx.font = '900 85px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('₿', cx, cy);
  } else if (iconType === 'spacex') {
    // X with orbital arc
    ctx.font = '900 80px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('𝕏', cx, cy);
  } else {
    // Default Bull / Shield
    ctx.font = '900 70px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📈', cx, cy);
  }
  ctx.restore();
}

// ============================================================================
// 7. PARTICLES & REVEAL CHOREOGRAPHY
// ============================================================================
function initParticles() {
  const geo = new THREE.BufferGeometry();
  particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  particleVelocities = new Float32Array(PARTICLE_COUNT * 3);
  particleColors = new Float32Array(PARTICLE_COUNT * 3);

  geo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(16, 16, 14, 0, Math.PI * 2);
  ctx.fill();
  const spriteTex = new THREE.CanvasTexture(canvas);

  particleMat = new THREE.PointsMaterial({
    size: 0.28,
    map: spriteTex,
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  particleSystem = new THREE.Points(geo, particleMat);
  particleSystem.visible = false;
  particleSystem.renderOrder = 22;
  rootGroup.add(particleSystem);
}

function triggerStockRevealCard(now) {
  animPhase = 'REVEALING';
  phaseStartTime = now;

  // Hide reactor, show reveal card
  reactorGroup.visible = false;

  revealCardMat.map = getStockCardTexture(selectedStock, currentStakeAmount, currentHoldHours);
  revealCardMat.needsUpdate = true;
  revealCardMesh.scale.setScalar(0.01);
  revealCardMesh.visible = true;

  // Spawn Particle Shockwave
  particleSystem.visible = true;
  particleMat.opacity = 1.0;
  const col = new THREE.Color(selectedStock.color);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    particlePositions[i3] = (Math.random() - 0.5) * 1.0;
    particlePositions[i3 + 1] = (Math.random() - 0.5) * 1.0;
    particlePositions[i3 + 2] = 2.5;

    const angle = Math.random() * Math.PI * 2;
    const speed = 3.0 + Math.random() * 5.0;
    particleVelocities[i3] = Math.cos(angle) * speed;
    particleVelocities[i3 + 1] = Math.sin(angle) * speed;
    particleVelocities[i3 + 2] = (Math.random() - 0.5) * 3.0;

    particleColors[i3] = col.r;
    particleColors[i3 + 1] = col.g;
    particleColors[i3 + 2] = col.b;
  }
  particleSystem.geometry.attributes.position.needsUpdate = true;
  particleSystem.geometry.attributes.color.needsUpdate = true;
}

function updateParticles(dt, elapsed) {
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    particlePositions[i3] += particleVelocities[i3] * dt;
    particlePositions[i3 + 1] += particleVelocities[i3 + 1] * dt;
    particlePositions[i3 + 2] += particleVelocities[i3 + 2] * dt;
  }
  particleSystem.geometry.attributes.position.needsUpdate = true;
  particleMat.opacity = Math.max(0, 1.0 - (elapsed / 3.5) * 0.7);
}

// ============================================================================
// 8. HELPERS & CLEANUP
// ============================================================================
function resetVaultForIdle() {
  reactorGroup.visible = true;
  revealCardMesh.visible = false;
  particleSystem.visible = false;
  for (let i = 0; i < satelliteSpheres.length; i++) {
    satelliteSpheres[i].userData.imploding = false;
    // Restore the orbit radius the implosion collapsed (the profile vault
    // persists across repeated claims, unlike the one-shot reference)
    satelliteSpheres[i].userData.radius = 2.4 + Math.floor(i / 6) * 0.75;
    satelliteSpheres[i].scale.setScalar(1.0);
  }
  setVaultOpacity(1.0);
}

function setVaultOpacity(alpha) {
  centralSphereMat.opacity = 0.85 * alpha;
  revealCardMat.opacity = alpha;
}

function renderVaultScene() {
  if (renderer) {
    renderer.render(scene, camera);
    return;
  }

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

function finishAndCleanup() {
  const stakeMultiplier = currentStakeAmount / 1000000;
  const holdMultiplier = currentHoldHours >= 168 ? 2.0 : currentHoldHours >= 72 ? 1.25 : 1.0;
  const finalUsd = selectedStock ? selectedStock.baseUsd * stakeMultiplier * holdMultiplier : 0;

  if (onCompleteCallback) {
    onCompleteCallback({
      stock: selectedStock,
      usdValue: finalUsd,
      stakeAmount: currentStakeAmount,
      holdHours: currentHoldHours,
    });
  }

  // Back to the living idle reactor (profile vault persists for the next claim)
  resetVaultForIdle();
  animPhase = 'REACTOR_IDLE';
  phaseStartTime = performance.now();
}

function onWindowResize() {
  if (!camera) return;
  camera.aspect = canvas
    ? canvas.clientWidth / Math.max(1, canvas.clientHeight)
    : window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  if (renderer && canvas) sizeRenderer();
  if (standaloneRenderer) standaloneRenderer.setSize(window.innerWidth, window.innerHeight);
}

function sizeRenderer() {
  if (!renderer || !canvas) return;
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 220;
  renderer.setSize(w, h, false);
}

// Stake -> plasma colour ramp (cyan -> green -> gold -> magenta)
function stakeColorFor(amount, out) {
  out.set(STAKE_COLOR_STOPS[0].color);
  if (amount <= STAKE_COLOR_STOPS[0].amount) return out;
  for (let i = 0; i < STAKE_COLOR_STOPS.length - 1; i++) {
    const a = STAKE_COLOR_STOPS[i];
    const b = STAKE_COLOR_STOPS[i + 1];
    if (amount >= a.amount && amount < b.amount) {
      out.set(a.color).lerp(b.color, (amount - a.amount) / (b.amount - a.amount));
      return out;
    }
  }
  out.set(STAKE_COLOR_STOPS[STAKE_COLOR_STOPS.length - 1].color);
  return out;
}
