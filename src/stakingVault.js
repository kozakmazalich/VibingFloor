/**
 * STAKING VAULT — embedded 3D reactor for the profile page.
 *
 * A glowing cluster of spheres represents the staked $VIB. It sits in the
 * RIGHT column of the profile page and is rendered INTO THE MAIN CANVAS via
 * the shared WebGLRenderer (autoClear=false + clearDepth + scissored
 * viewport, exactly like drum.js). No second canvas, no second context.
 *
 * Reactive: the cluster reads getStakeState().totalStaked every frame —
 * more staked VIB = more / larger spheres, less = fewer / smaller.
 *
 * triggerBreachAndClaim(): the cluster implodes into the center, a flash,
 * then a tier-coloured RWA stock card pops out (ticker + company + $USD).
 * The callback receives { stock, usdValue }.
 */
import * as THREE from "three";
import { getStakeState } from "./staking.js";

export const RWA_STOCKS = [
  { tier: "COMMON", ticker: "SPY", name: "S&P 500 ETF", baseUsd: 0.5, icon: "bull" },
  { tier: "COMMON", ticker: "BRK.B", name: "Berkshire Hathaway", baseUsd: 0.5, icon: "shield" },
  { tier: "UNCOMMON", ticker: "AAPL", name: "Apple Inc.", baseUsd: 2.0, icon: "apple" },
  { tier: "UNCOMMON", ticker: "MSFT", name: "Microsoft Corp.", baseUsd: 2.0, icon: "windows" },
  { tier: "RARE", ticker: "NVDA", name: "NVIDIA Corp.", baseUsd: 8.0, icon: "nvidia" },
  { tier: "RARE", ticker: "TSLA", name: "Tesla Inc.", baseUsd: 8.0, icon: "tesla" },
  { tier: "EPIC", ticker: "MSTR", name: "MicroStrategy", baseUsd: 35.0, icon: "bitcoin" },
  { tier: "EPIC", ticker: "COIN", name: "Coinbase Global", baseUsd: 35.0, icon: "coin" },
  { tier: "LEGENDARY", ticker: "SPACEX", name: "SpaceX Pre-IPO RWA", baseUsd: 250.0, icon: "spacex" },
];

// Card/UI tier colours (profile spec).
const TIER_COLORS = {
  COMMON: "#7a8299",
  UNCOMMON: "#00e5ff",
  RARE: "#39ff14",
  EPIC: "#ff2d95",
  LEGENDARY: "#ffd700",
};

const CLUSTER_COLORS = [0xffd700, 0x00e5ff, 0xff2d95, 0x39ff14];
const MAX_SPHERES = 26;
const BASE_SPHERES = 6;

// Module state
let isActive = false;
let renderer = null;
let viewportEl = null;
let scene = null;
let camera = null;
let rootGroup = null;
let clusterGroup = null;
let flashMesh = null;
let flashMat = null;
let cardMesh = null;
let cardMat = null;
let particleSystem = null;
let particlePositions = null;
let particleVelocities = null;
let particleColors = null;
let particleMat = null;

let clusterSpheres = []; // { mesh, home: Vector3, phase }
let targetCount = -1;
let targetScale = -1;
let buildPop = 1; // pop-in lerp while the cluster rebuilds
let animPhase = "IDLE"; // IDLE | IMPLODING | REVEALING | FADING
let phaseStartTime = 0;
let lastFrameTime = 0;
let selectedStock = null;
let currentStakeAmount = 0;
let currentHoldHours = 24;
let onCompleteCb = null;

// Cached geometry/materials/textures
const sphereGeo = new THREE.SphereGeometry(1, 20, 16);
const clusterMatCache = new Map();
const textureCache = new Map();

/* ================= public API ================= */

/**
 * Activate the reactor and start rendering into the viewport div.
 * @param {Function} callback(result) — { stock, usdValue } after a claim.
 * @param {{ stakeAmount?: number, holdHours?: number, renderer?: THREE.WebGLRenderer, viewport?: HTMLElement }} options
 */
export function showStakingVault(callback, options = {}) {
  if (isActive) return;
  isActive = true;
  onCompleteCb = typeof callback === "function" ? callback : () => {};
  currentStakeAmount = options.stakeAmount ?? getStakeState().totalStaked;
  currentHoldHours = options.holdHours ?? getStakeState().holdHours;
  renderer = options.renderer || null;
  viewportEl = options.viewport || document.getElementById("staking-viewport");

  initResources();
  resetIdle();
  targetCount = -1; // force a rebuild on the first frame
  animPhase = "IDLE";
  lastFrameTime = performance.now();
  phaseStartTime = lastFrameTime;
}

/** Deactivate (profile closed) — no more rendering. */
export function hideStakingVault() {
  isActive = false;
  onCompleteCb = null;
}

/** Debug/test hook: { active, phase, sphereCount, targetCount }. */
export function getVaultDebug() {
  return {
    active: isActive,
    phase: animPhase,
    sphereCount: clusterSpheres.length,
    targetCount,
  };
}

/** The sphere cluster implodes, a flash, then the stock card reveals. */
export function triggerBreachAndClaim() {
  if (!isActive || animPhase !== "IDLE") return;
  const st = getStakeState();
  currentStakeAmount = st.totalStaked;
  currentHoldHours = st.holdHours;
  selectedStock = rollWeightedStock(currentHoldHours);
  animPhase = "IMPLODING";
  phaseStartTime = performance.now();
}

/** Advance the animation one frame and render into the viewport. */
export function updateStakingVault(now = performance.now()) {
  if (!isActive) return;
  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;
  const elapsed = (now - phaseStartTime) / 1000;

  // Reactive cluster: follow the staking state every frame
  const st = getStakeState();
  const n = Math.min(MAX_SPHERES, BASE_SPHERES + Math.floor(st.totalStaked / 1000000));
  const s = 0.85 + Math.min(1.4, st.totalStaked / 6000000);
  if (n !== targetCount || Math.abs(s - targetScale) > 0.01) {
    targetCount = n;
    targetScale = s;
    rebuildCluster(n, s);
    buildPop = 0;
  }
  if (buildPop < 1) buildPop = Math.min(1, buildPop + dt * 3.5);

  if (animPhase === "IDLE") {
    clusterGroup.rotation.y += dt * 0.22;
    clusterGroup.position.y = Math.sin(now * 0.0016) * 0.08;
    const pop = easeOutBack(Math.min(1, buildPop));
    clusterGroup.scale.setScalar(pop);
    if (flashMesh.visible) flashMesh.visible = false;
  } else if (animPhase === "IMPLODING") {
    const t = Math.min(elapsed / 0.9, 1.0);
    clusterGroup.rotation.y += dt * (0.22 + t * 9);
    for (const s of clusterSpheres) {
      s.mesh.position.lerpVectors(s.home, ZERO_V3, t * t);
      s.mesh.scale.setScalar(Math.max(0.02, 1 - t));
    }
    if (t >= 1.0) {
      animPhase = "REVEALING";
      phaseStartTime = now;
      triggerReveal(now);
    }
  } else if (animPhase === "REVEALING") {
    clusterGroup.rotation.y += dt * 0.1;
    const t = Math.min(elapsed / 0.6, 1.0);
    const pop = easeOutBack(t);
    cardMesh.scale.setScalar(Math.max(0.001, pop));
    cardMesh.position.z = 0.1 + Math.min(elapsed * 1.2, 0.5);
    updateParticles(dt, elapsed);
    if (elapsed >= 3.2) {
      animPhase = "FADING";
      phaseStartTime = now;
    }
  } else if (animPhase === "FADING") {
    const t = Math.min(elapsed / 0.4, 1.0);
    cardMat.opacity = 1 - t;
    particleMat.opacity = Math.max(0, 1 - t * 2);
    if (t >= 1.0) {
      finishAndCleanup();
      return;
    }
  }

  renderVault();
}

/* ================= internals ================= */

const ZERO_V3 = new THREE.Vector3(0, 0, 0);

function getClusterMat(color) {
  if (!clusterMatCache.has(color)) {
    clusterMatCache.set(color, new THREE.MeshBasicMaterial({ color }));
  }
  return clusterMatCache.get(color);
}

function rebuildCluster(count, scale) {
  if (!clusterGroup) return;
  for (const s of clusterSpheres) clusterGroup.remove(s.mesh);
  clusterSpheres = [];

  // Evenly distributed points on a sphere (fibonacci lattice), then a
  // deterministic radial jitter so rebuilds keep a similar silhouette.
  const R = 1.35 + scale * 0.7;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = i === 0 ? 1 : 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * golden;
    const jitter = 0.82 + ((i * 37) % 100) / 100 * 0.36;
    const pos = new THREE.Vector3(
      Math.cos(th) * r * R * jitter,
      y * R * jitter,
      Math.sin(th) * r * R * jitter
    );
    const mesh = new THREE.Mesh(sphereGeo, getClusterMat(CLUSTER_COLORS[i % CLUSTER_COLORS.length]));
    mesh.position.copy(pos);
    mesh.scale.setScalar((0.16 + ((i * 13) % 10) / 10 * 0.2) * scale);
    clusterGroup.add(mesh);
    clusterSpheres.push({ mesh, home: pos.clone(), phase: (i * 0.37) % 1 });
  }
}

function resetIdle() {
  if (cardMesh) {
    cardMesh.visible = false;
    cardMat.opacity = 1;
  }
  if (particleSystem) {
    particleSystem.visible = false;
    particleMat.opacity = 1;
  }
  if (clusterGroup) clusterGroup.visible = true;
}

function finishAndCleanup() {
  const stakeMult = Math.max(0, currentStakeAmount) / 1000000;
  const holdMult = currentHoldHours >= 168 ? 2.0 : currentHoldHours >= 72 ? 1.25 : 1.0;
  const usdValue = selectedStock ? selectedStock.baseUsd * stakeMult * holdMult : 0;

  const cb = onCompleteCb;
  if (cb) {
    cb({ stock: selectedStock, usdValue });
  }

  resetIdle();
  animPhase = "IDLE";
  phaseStartTime = performance.now();
  targetCount = -1; // rebuild the (possibly changed) cluster next frame
}

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

function initResources() {
  if (scene) return;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

  rootGroup = new THREE.Group();
  scene.add(rootGroup);

  // Backdrop covering the viewport frustum
  const bgGeo = new THREE.PlaneGeometry(60, 40);
  const bgMat = new THREE.MeshBasicMaterial({ color: 0x05060f });
  const bgMesh = new THREE.Mesh(bgGeo, bgMat);
  bgMesh.position.z = -3;
  rootGroup.add(bgMesh);

  clusterGroup = new THREE.Group();
  rootGroup.add(clusterGroup);

  // Implosion flash (additive sphere)
  const flashGeo = new THREE.SphereGeometry(1, 24, 16);
  flashMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  flashMesh = new THREE.Mesh(flashGeo, flashMat);
  flashMesh.visible = false;
  rootGroup.add(flashMesh);

  // Reveal card plane
  const cardGeo = new THREE.PlaneGeometry(3.4, 4.7);
  cardMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthTest: false });
  cardMesh = new THREE.Mesh(cardGeo, cardMat);
  cardMesh.visible = false;
  cardMesh.renderOrder = 20;
  rootGroup.add(cardMesh);

  initParticles();
}

function triggerReveal(now) {
  flashMesh.scale.setScalar(0.2);
  flashMesh.visible = true;
  clusterGroup.visible = false;

  const tier = selectedStock.tier;
  const color = TIER_COLORS[tier] || TIER_COLORS.COMMON;
  const stakeMult = Math.max(0, currentStakeAmount) / 1000000;
  const holdMult = currentHoldHours >= 168 ? 2.0 : currentHoldHours >= 72 ? 1.25 : 1.0;
  const usdValue = selectedStock.baseUsd * stakeMult * holdMult;

  cardMat.map = getCardTexture(selectedStock, color, usdValue);
  cardMat.needsUpdate = true;
  cardMat.opacity = 1;
  cardMesh.scale.setScalar(0.001);
  cardMesh.visible = true;

  spawnBurst(color);
}

function initParticles() {
  const geo = new THREE.BufferGeometry();
  particlePositions = new Float32Array(75 * 3);
  particleVelocities = new Float32Array(75 * 3);
  particleColors = new Float32Array(75 * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));
  particleMat = new THREE.PointsMaterial({
    size: 0.16,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  particleSystem = new THREE.Points(geo, particleMat);
  particleSystem.visible = false;
  particleSystem.renderOrder = 21;
  rootGroup.add(particleSystem);
}

function spawnBurst(tierHex) {
  particleSystem.visible = true;
  particleMat.opacity = 1;
  const c = new THREE.Color(tierHex);
  for (let i = 0; i < 75; i++) {
    const i3 = i * 3;
    particlePositions[i3] = (Math.random() - 0.5) * 1.4;
    particlePositions[i3 + 1] = (Math.random() - 0.5) * 1.4;
    particlePositions[i3 + 2] = 0.4;
    const a = Math.random() * Math.PI * 2;
    const sp = 1.4 + Math.random() * 3.4;
    particleVelocities[i3] = Math.cos(a) * sp;
    particleVelocities[i3 + 1] = Math.sin(a) * sp + 1.2;
    particleVelocities[i3 + 2] = (Math.random() - 0.4) * 2;
    particleColors[i3] = c.r;
    particleColors[i3 + 1] = c.g;
    particleColors[i3 + 2] = c.b;
  }
  particleSystem.geometry.attributes.position.needsUpdate = true;
  particleSystem.geometry.attributes.color.needsUpdate = true;
}

function updateParticles(dt, elapsed) {
  for (let i = 0; i < 75; i++) {
    const i3 = i * 3;
    particleVelocities[i3 + 1] -= 4.5 * dt;
    particlePositions[i3] += particleVelocities[i3] * dt;
    particlePositions[i3 + 1] += particleVelocities[i3 + 1] * dt;
    particlePositions[i3 + 2] += particleVelocities[i3 + 2] * dt;
  }
  particleSystem.geometry.attributes.position.needsUpdate = true;
  particleMat.opacity = Math.max(0, 1 - (elapsed / 3.2) * 0.9);
}

function getCardTexture(stock, hex, usdValue) {
  const key = `${stock.ticker}_${usdValue.toFixed(2)}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = "#0b1026";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = hex;
  ctx.lineWidth = 14;
  ctx.shadowColor = hex;
  ctx.shadowBlur = 30;
  ctx.strokeRect(40, 40, w - 80, h - 80);
  ctx.shadowBlur = 0;

  ctx.fillStyle = hex;
  ctx.font = '900 44px "Orbitron", "Impact", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(stock.tier, w / 2, 150);

  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = hex;
  ctx.shadowBlur = 22;
  ctx.font = '900 150px "Orbitron", "Impact", sans-serif';
  ctx.fillText(`$${stock.ticker}`, w / 2, 430);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#7a8299";
  ctx.font = '700 40px "Courier New", monospace';
  ctx.fillText(stock.name.toUpperCase(), w / 2, 520);

  ctx.fillStyle = hex;
  ctx.shadowColor = hex;
  ctx.shadowBlur = 20;
  ctx.font = '900 88px "Orbitron", "Impact", sans-serif';
  ctx.fillText(`+$${usdValue.toFixed(2)} USD`, w / 2, 700);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#586075";
  ctx.font = '700 34px "Courier New", monospace';
  ctx.fillText("RWA EQUITY CREDITED", w / 2, 800);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}

/* ================= viewport rendering ================= */

function renderVault() {
  if (!renderer || !viewportEl || !scene) return;
  const rect = viewportEl.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return;

  const dpr = renderer.getPixelRatio();
  const canvas = renderer.domElement;
  const px = Math.round(rect.left * dpr);
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  // viewport y is measured from the BOTTOM of the canvas
  const vy = Math.round(canvas.height - (rect.top + rect.height) * dpr);

  camera.aspect = rect.width / rect.height;
  camera.position.set(0, 0.25, fitDistance(camera.aspect));
  camera.lookAt(0, 0.25, 0);
  camera.updateProjectionMatrix();

  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setViewport(px, vy, w, h);
  renderer.setScissor(px, vy, w, h);
  renderer.setScissorTest(true);
  renderer.clearDepth();
  renderer.render(scene, camera);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, canvas.width, canvas.height);
  renderer.autoClear = prevAutoClear;
}

function fitDistance(aspect) {
  // Cluster radius ~2.2 * scale; the reveal card half-width is 1.7.
  const need = 2.3 / Math.tan((45 * Math.PI) / 360) / Math.max(0.2, aspect);
  return Math.max(7.2, need + 0.6);
}
