/**
 * VIB STAKING VAULT & ALCHEMY FORGE — RWA Stock Reveal Module.
 * Ported from the original design (gemini-code-1792588207540.js):
 *   - Central glowing wireframe plasma sphere + inner core
 *   - 3 orbital neon rings with satellite spheres (hold-hours speed boost)
 *   - Singularity implosion -> holographic stock certificate with a
 *     PROCEDURAL VECTOR COMPANY LOGO in a medallion (NVDA spiral, TSLA T,
 *     Apple, Windows squares, ₿, 𝕏, default bull)
 *   - Particle shockwave, tier-coloured card, payout + fractional shares
 *
 * Renders into the profile page's own canvas (options.canvas) with its own
 * renderer + animation loop — fully independent from the game scene.
 * Reactivity: the reactor scales gently with getStakeState().totalStaked.
 */
import * as THREE from "three";
import { getStakeState } from "./staking.js";

export const RWA_STOCKS = [
  { tier: "COMMON", ticker: "SPY", name: "S&P 500 ETF", baseUsd: 0.5, color: "#7a8299", icon: "bull" },
  { tier: "COMMON", ticker: "BRK.B", name: "Berkshire Hathaway", baseUsd: 0.5, color: "#7a8299", icon: "shield" },
  { tier: "UNCOMMON", ticker: "AAPL", name: "Apple Inc.", baseUsd: 2.0, color: "#39ff14", icon: "apple" },
  { tier: "UNCOMMON", ticker: "MSFT", name: "Microsoft Corp.", baseUsd: 2.0, color: "#39ff14", icon: "windows" },
  { tier: "RARE", ticker: "NVDA", name: "NVIDIA Corp.", baseUsd: 8.0, color: "#00e5ff", icon: "nvidia" },
  { tier: "RARE", ticker: "TSLA", name: "Tesla Inc.", baseUsd: 8.0, color: "#00e5ff", icon: "tesla" },
  { tier: "EPIC", ticker: "MSTR", name: "MicroStrategy", baseUsd: 35.0, color: "#ff2d95", icon: "bitcoin" },
  { tier: "EPIC", ticker: "COIN", name: "Coinbase Global", baseUsd: 35.0, color: "#ff2d95", icon: "coin" },
  { tier: "LEGENDARY", ticker: "SPACEX", name: "SpaceX Pre-IPO RWA", baseUsd: 250.0, color: "#ffd700", icon: "spacex" },
];

const COLORS = {
  bgNum: 0x05060f,
  cyanNum: 0x00e5ff,
  magentaNum: 0xff2d95,
  goldNum: 0xffd700,
  greenNum: 0x39ff14,
  greyNum: 0x7a8299,
};

// Module state
let isActive = false;
let canvas = null;
let renderer = null;
let sharedRenderer = null;
let rafId = 0;
let onResizeBound = null;

let scene = null;
let camera = null;
let rootGroup = null;
let reactorGroup = null;
let revealGroup = null;

let centralSphere = null;
let centralSphereMat = null;
let satelliteSpheres = [];
let orbitRings = [];

let revealCardMesh = null;
let revealCardMat = null;

let particleSystem = null;
let particlePositions = null;
let particleVelocities = null;
let particleColors = null;
let particleMat = null;
const PARTICLE_COUNT = 80;

let animPhase = "IDLE"; // 'REACTOR_IDLE' | 'IMPLODING' | 'REVEALING' | 'FADING' | 'IDLE'
let phaseStartTime = 0;
let lastFrameTime = 0;
let selectedStock = null;
let currentStakeAmount = 1000000;
let currentHoldHours = 24;
let onCompleteCallback = null;
let reactorScaleTarget = 1;

const textureCache = new Map();

/* ================= public API ================= */

export function showStakingVault(onComplete, options = {}) {
  if (isActive) return;
  isActive = true;
  onCompleteCallback = typeof onComplete === "function" ? onComplete : () => {};
  currentStakeAmount = options.stakeAmount ?? getStakeState().totalStaked;
  currentHoldHours = options.holdHours ?? getStakeState().holdHours;
  canvas = options.canvas || null;
  if (options.renderer) sharedRenderer = options.renderer;

  initVaultResources();
  resetVaultForIdle();
  animPhase = "REACTOR_IDLE";
  lastFrameTime = performance.now();
  phaseStartTime = lastFrameTime;

  const loop = (now) => {
    if (!isActive) return;
    rafId = requestAnimationFrame(loop);
    updateStakingVault(now);
  };
  rafId = requestAnimationFrame(loop);
}

export function hideStakingVault() {
  isActive = false;
  onCompleteCallback = null;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

export function triggerBreachAndClaim() {
  if (animPhase !== "REACTOR_IDLE") return;
  selectedStock = rollWeightedStock(currentHoldHours);
  animPhase = "IMPLODING";
  phaseStartTime = performance.now();
  for (let i = 0; i < satelliteSpheres.length; i++) {
    satelliteSpheres[i].userData.imploding = true;
  }
}

export function getVaultDebug() {
  return {
    active: isActive,
    phase: animPhase === "REACTOR_IDLE" ? "IDLE" : animPhase,
    sphereCount: satelliteSpheres.length,
    reactorScale: reactorGroup ? reactorGroup.scale.x : 1,
  };
}

export function updateStakingVault(now = performance.now()) {
  if (!isActive) return;

  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;
  const elapsed = (now - phaseStartTime) / 1000;

  // Reactive: the reactor swells gently with the staked amount
  const staked = getStakeState().totalStaked;
  reactorScaleTarget = 1 + Math.min(0.5, staked / 12000000);
  reactorGroup.scale.lerp(new THREE.Vector3(reactorScaleTarget, reactorScaleTarget, reactorScaleTarget), Math.min(1, dt * 3));

  // Rotate orbital rings and satellites (hold-hours speed boost)
  const speedFactor = currentHoldHours >= 168 ? 2.5 : currentHoldHours >= 72 ? 1.7 : 1.0;
  for (let i = 0; i < orbitRings.length; i++) {
    orbitRings[i].rotation.z += dt * 0.4 * (i % 2 === 0 ? 1 : -1) * speedFactor;
  }

  for (let i = 0; i < satelliteSpheres.length; i++) {
    const sat = satelliteSpheres[i];
    const orbit = sat.userData;
    orbit.angle += dt * orbit.speed * speedFactor;

    if (sat.userData.imploding) {
      orbit.radius = Math.max(0.1, orbit.radius - dt * 6.0);
      sat.scale.multiplyScalar(Math.max(0.85, 1.0 - dt * 2.0));
    }

    sat.position.x = Math.cos(orbit.angle) * orbit.radius;
    sat.position.y = Math.sin(orbit.angle) * orbit.radius * Math.sin(orbit.inclination);
    sat.position.z = Math.sin(orbit.angle) * orbit.radius * Math.cos(orbit.inclination);
  }

  // Pulsate the central plasma sphere
  if (centralSphere) {
    const pulse = 1.0 + Math.sin(now * 0.005) * 0.06;
    centralSphere.scale.setScalar(pulse);
  }

  if (animPhase === "REACTOR_IDLE") {
    reactorGroup.position.y = Math.sin(now * 0.002) * 0.08;
  } else if (animPhase === "IMPLODING") {
    if (elapsed >= 0.8) {
      triggerStockRevealCard(now);
    }
  } else if (animPhase === "REVEALING") {
    const revealElapsed = elapsed - 0.8;
    const t = Math.min(revealElapsed / 0.6, 1.0);
    const popScale = easeOutBack(t);
    const pulse = 1.0 + Math.sin(revealElapsed * 8.0) * 0.02;
    revealCardMesh.scale.setScalar(popScale * pulse);
    revealCardMesh.position.z = 2.5 + Math.min(revealElapsed * 1.5, 0.5);

    if (particleSystem.visible) {
      updateParticles(dt, revealElapsed);
    }

    if (revealElapsed >= 3.5) {
      animPhase = "FADING";
      phaseStartTime = now;
    }
  } else if (animPhase === "FADING") {
    const t = Math.min(elapsed / 0.4, 1.0);
    setVaultOpacity(1.0 - t);
    if (t >= 1.0) {
      finishAndCleanup();
      return;
    }
  }

  renderVaultScene();
}

/* ================= rolling ================= */

function rollWeightedStock(holdHours) {
  const weights = RWA_STOCKS.map((stock) => {
    let w = 10;
    if (stock.tier === "COMMON") w = holdHours >= 168 ? 15 : holdHours >= 72 ? 45 : 65;
    if (stock.tier === "UNCOMMON") w = holdHours >= 168 ? 42 : holdHours >= 72 ? 33 : 24;
    if (stock.tier === "RARE") w = holdHours >= 168 ? 29 : holdHours >= 72 ? 16.5 : 8.5;
    if (stock.tier === "EPIC") w = holdHours >= 168 ? 12.5 : holdHours >= 72 ? 5.0 : 2.3;
    if (stock.tier === "LEGENDARY") w = holdHours >= 168 ? 1.5 : holdHours >= 72 ? 0.5 : 0.2;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  let acc = 0;
  for (let i = 0; i < RWA_STOCKS.length; i++) {
    acc += weights[i];
    if (roll <= acc) return RWA_STOCKS[i];
  }
  return RWA_STOCKS[0];
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c2 = c1 + 1;
  return 1 + c2 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/* ================= scene ================= */

function initVaultResources() {
  if (scene) return;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bgNum);
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  sizeCamera();

  rootGroup = new THREE.Group();
  scene.add(rootGroup);

  // Backdrop
  const bgGeo = new THREE.PlaneGeometry(60, 40);
  const bgMat = new THREE.MeshBasicMaterial({ color: COLORS.bgNum, transparent: true, opacity: 0.94 });
  const bgMesh = new THREE.Mesh(bgGeo, bgMat);
  bgMesh.position.z = -6.0;
  rootGroup.add(bgMesh);

  // --- A. SPHERICAL OVERCHARGE REACTOR ---
  reactorGroup = new THREE.Group();
  rootGroup.add(reactorGroup);

  // Central plasma sphere (wireframe)
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

  // Orbital rings + satellite spheres
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

  // --- C. PARTICLES ---
  initParticles();

  // --- D. RENDERER (profile canvas) ---
  initRenderer();
}

function initRenderer() {
  if (renderer || !canvas) return;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  sizeRenderer();

  if (!onResizeBound) {
    onResizeBound = () => sizeCameraAndRenderer();
    window.addEventListener("resize", onResizeBound);
  }
}

function sizeCameraAndRenderer() {
  sizeCamera();
  sizeRenderer();
}

function sizeCamera() {
  if (!camera) return;
  const aspect = (canvas ? canvas.clientWidth / Math.max(1, canvas.clientHeight) : window.innerWidth / window.innerHeight);
  camera.aspect = aspect || 1;
  // Fit the reactor rings (radius ~3.9) on narrow screens
  const need = 4.2 / Math.tan((45 * Math.PI) / 360) / Math.max(0.2, camera.aspect);
  camera.position.set(0, 0, Math.max(11, need + 0.5));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

function sizeRenderer() {
  if (!renderer || !canvas) return;
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 220;
  renderer.setSize(w, h, false);
}

function renderVaultScene() {
  if (renderer) {
    renderer.render(scene, camera);
    return;
  }
  if (sharedRenderer && scene) {
    const prevAutoClear = sharedRenderer.autoClear;
    sharedRenderer.autoClear = false;
    sharedRenderer.clearDepth();
    sharedRenderer.render(scene, camera);
    sharedRenderer.autoClear = prevAutoClear;
  }
}

/* ================= reveal choreography ================= */

function triggerStockRevealCard(now) {
  animPhase = "REVEALING";
  phaseStartTime = now;

  reactorGroup.visible = false;

  revealCardMat.map = getStockCardTexture(selectedStock, currentStakeAmount, currentHoldHours);
  revealCardMat.needsUpdate = true;
  revealCardMesh.scale.setScalar(0.01);
  revealCardMesh.visible = true;

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

function resetVaultForIdle() {
  reactorGroup.visible = true;
  revealCardMesh.visible = false;
  particleSystem.visible = false;
  for (let i = 0; i < satelliteSpheres.length; i++) {
    satelliteSpheres[i].userData.imploding = false;
    satelliteSpheres[i].userData.radius = 2.4 + Math.floor(i / 6) * 0.75;
    satelliteSpheres[i].scale.setScalar(1.0);
  }
  setVaultOpacity(1.0);
}

function setVaultOpacity(alpha) {
  centralSphereMat.opacity = 0.85 * alpha;
  revealCardMat.opacity = alpha;
}

function finishAndCleanup() {
  const stakeMultiplier = currentStakeAmount / 1000000;
  const holdMultiplier = currentHoldHours >= 168 ? 2.0 : currentHoldHours >= 72 ? 1.25 : 1.0;
  const finalUsd = selectedStock ? selectedStock.baseUsd * stakeMultiplier * holdMultiplier : 0;

  const cb = onCompleteCallback;
  if (cb) {
    cb({
      stock: selectedStock,
      usdValue: finalUsd,
      stakeAmount: currentStakeAmount,
      holdHours: currentHoldHours,
    });
  }

  resetVaultForIdle();
  animPhase = "REACTOR_IDLE";
  phaseStartTime = performance.now();
}

/* ================= particles ================= */

function initParticles() {
  const geo = new THREE.BufferGeometry();
  particlePositions = new Float32Array(PARTICLE_COUNT * 3);
  particleVelocities = new Float32Array(PARTICLE_COUNT * 3);
  particleColors = new Float32Array(PARTICLE_COUNT * 3);

  geo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));

  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = 32;
  spriteCanvas.height = 32;
  const ctx = spriteCanvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(16, 16, 14, 0, Math.PI * 2);
  ctx.fill();
  const spriteTex = new THREE.CanvasTexture(spriteCanvas);

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

/* ================= card texture + vector logos ================= */

function getStockCardTexture(stock, stakeAmount, holdHours) {
  const cacheKey = `${stock.ticker}_${stakeAmount}_${holdHours}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const canvasTex = document.createElement("canvas");
  canvasTex.width = 1024;
  canvasTex.height = 1408; // 3:4 aspect ratio
  const ctx = canvasTex.getContext("2d");
  const w = canvasTex.width;
  const h = canvasTex.height;

  // 1. Background
  ctx.fillStyle = "#080b1a";
  ctx.fillRect(0, 0, w, h);

  // Scanlines
  ctx.fillStyle = "rgba(0, 229, 255, 0.025)";
  for (let y = 0; y < h; y += 10) {
    ctx.fillRect(0, y, w, 4);
  }

  // 2. Card border + cyber corners
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

  // 3. Logo medallion
  ctx.save();
  ctx.translate(w / 2, 240);
  ctx.fillStyle = "rgba(0, 229, 255, 0.12)";
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

  // 4. Ticker + company name
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = mainColor;
  ctx.shadowBlur = 16;
  ctx.font = '900 68px "Orbitron", "Impact", sans-serif';
  ctx.fillText(`$${stock.ticker}`, w / 2, 430);

  ctx.fillStyle = "#7a8299";
  ctx.shadowBlur = 0;
  ctx.font = '700 28px "Courier New", monospace';
  ctx.fillText(stock.name.toUpperCase(), w / 2, 500);

  // 5. Payout box ($USD + fractional shares)
  const stakeMultiplier = stakeAmount / 1000000;
  const holdMultiplier = holdHours >= 168 ? 2.0 : holdHours >= 72 ? 1.25 : 1.0;
  const totalUsdValue = stock.baseUsd * stakeMultiplier * holdMultiplier;
  const mockSharePrice = stock.baseUsd > 100 ? 185 : stock.baseUsd > 10 ? 140 : 225;
  const fractionalShares = totalUsdValue / mockSharePrice;

  ctx.fillStyle = "#0f1633";
  ctx.strokeStyle = mainColor;
  ctx.lineWidth = 4;
  ctx.fillRect(80, 580, w - 160, 260);
  ctx.strokeRect(80, 580, w - 160, 260);

  ctx.fillStyle = "#7a8299";
  ctx.font = '700 24px "Courier New", monospace';
  ctx.fillText("RWA EQUITY ALLOCATION", w / 2, 630);

  ctx.fillStyle = mainColor;
  ctx.shadowColor = mainColor;
  ctx.shadowBlur = 20;
  ctx.font = '900 64px "Orbitron", sans-serif';
  ctx.fillText(`+$${totalUsdValue.toFixed(2)} USD`, w / 2, 700);

  ctx.fillStyle = "#ffffff";
  ctx.shadowBlur = 0;
  ctx.font = '700 26px "Courier New", monospace';
  ctx.fillText(`${fractionalShares.toFixed(4)} SHARES CREDITED`, w / 2, 770);

  // 6. Stake & hold metadata footer
  ctx.fillStyle = "#586075";
  ctx.font = '700 22px "Courier New", monospace';
  ctx.fillText(`STAKE: ${(stakeAmount / 1000000).toFixed(1)}M VIB  |  HOLD: ${holdHours}H`, w / 2, 950);

  // Viral footer tagline
  ctx.fillStyle = COLORS.cyanNum;
  ctx.shadowColor = COLORS.cyanNum;
  ctx.shadowBlur = 10;
  ctx.font = '900 26px "Orbitron", sans-serif';
  ctx.fillText("⚡ VIBING FLOOR ALCHEMY ⚡", w / 2, 1120);

  const tex = new THREE.CanvasTexture(canvasTex);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  textureCache.set(cacheKey, tex);
  return tex;
}

/**
 * Procedural vector logo renderer for each RWA stock (inside the medallion).
 */
function drawVectorLogo(ctx, cx, cy, iconType, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 15;

  if (iconType === "nvidia") {
    // Spiral eye
    ctx.beginPath();
    ctx.arc(cx, cy, 55, 0, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 1.2);
    ctx.stroke();
  } else if (iconType === "tesla") {
    // T shield
    ctx.beginPath();
    ctx.moveTo(cx - 50, cy - 45);
    ctx.lineTo(cx + 50, cy - 45);
    ctx.moveTo(cx, cy - 45);
    ctx.lineTo(cx, cy + 55);
    ctx.stroke();
  } else if (iconType === "apple") {
    // Apple silhouette
    ctx.beginPath();
    ctx.arc(cx, cy + 10, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 15, cy - 35, 12, 0, Math.PI * 2);
    ctx.fill();
  } else if (iconType === "windows") {
    // 4 squares
    const s = 24;
    ctx.fillRect(cx - s - 4, cy - s - 4, s, s);
    ctx.fillRect(cx + 4, cy - s - 4, s, s);
    ctx.fillRect(cx - s - 4, cy + 4, s, s);
    ctx.fillRect(cx + 4, cy + 4, s, s);
  } else if (iconType === "bitcoin") {
    // Bitcoin
    ctx.font = "900 85px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("₿", cx, cy);
  } else if (iconType === "spacex") {
    // X with orbital arc
    ctx.font = "900 80px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("𝕏", cx, cy);
  } else if (iconType === "coin") {
    // Coin circle with C
    ctx.beginPath();
    ctx.arc(cx, cy, 52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 34, Math.PI * 0.4, Math.PI * 1.6);
    ctx.stroke();
  } else if (iconType === "shield") {
    // Shield outline
    ctx.beginPath();
    ctx.moveTo(cx - 45, cy - 50);
    ctx.lineTo(cx + 45, cy - 50);
    ctx.lineTo(cx + 45, cy + 5);
    ctx.quadraticCurveTo(cx + 45, cy + 35, cx, cy + 55);
    ctx.quadraticCurveTo(cx - 45, cy + 35, cx - 45, cy + 5);
    ctx.closePath();
    ctx.stroke();
  } else {
    // Default bull chart
    ctx.font = "900 70px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("📈", cx, cy);
  }
  ctx.restore();
}
