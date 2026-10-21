/**
 * STAKING VAULT — self-contained 3D reactor for the profile page.
 *
 * A glowing cluster of spheres represents the staked $VIB. It renders into
 * its OWN canvas (passed in via options.canvas) with its own WebGLRenderer
 * and its own animation loop — completely independent from the game scene,
 * so it is always clearly visible inside the profile page.
 *
 * Reactive: reads getStakeState().totalStaked every frame — more staked VIB
 * = more / larger spheres, less = fewer / smaller.
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
let canvas = null;
let renderer = null;
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

let clusterSpheres = []; // { mesh, home: Vector3 }
let targetCount = -1;
let targetScale = -1;
let buildPop = 1;
let animPhase = "IDLE"; // IDLE | IMPLODING | REVEALING | FADING
let phaseStartTime = 0;
let lastFrameTime = 0;
let selectedStock = null;
let currentStakeAmount = 0;
let currentHoldHours = 24;
let onCompleteCb = null;
let rafId = 0;
let onResizeBound = null;

// Cached geometry/materials/textures
const sphereGeo = new THREE.SphereGeometry(1, 20, 16);
const clusterMatCache = new Map();
const textureCache = new Map();
const ZERO_V3 = new THREE.Vector3(0, 0, 0);

/* ================= public API ================= */

/**
 * Activate the reactor on the given canvas.
 * @param {Function} callback(result) — { stock, usdValue } after a claim.
 * @param {{ stakeAmount?: number, holdHours?: number, canvas?: HTMLCanvasElement }} options
 */
export function showStakingVault(callback, options = {}) {
  if (isActive) return;
  isActive = true;
  onCompleteCb = typeof callback === "function" ? callback : () => {};
  currentStakeAmount = options.stakeAmount ?? getStakeState().totalStaked;
  currentHoldHours = options.holdHours ?? getStakeState().holdHours;
  canvas = options.canvas || null;

  initResources();
  resetIdle();
  targetCount = -1;
  animPhase = "IDLE";
  lastFrameTime = performance.now();
  phaseStartTime = lastFrameTime;

  const loop = (now) => {
    if (!isActive) return;
    rafId = requestAnimationFrame(loop);
    updateStakingVault(now);
  };
  rafId = requestAnimationFrame(loop);
}

/** Deactivate (profile closed) — stop rendering. */
export function hideStakingVault() {
  isActive = false;
  onCompleteCb = null;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
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

/** Debug/test hook: { active, phase, sphereCount, targetCount }. */
export function getVaultDebug() {
  return { active: isActive, phase: animPhase, sphereCount: clusterSpheres.length, targetCount };
}

/** Advance the animation one frame (also used by the internal RAF). */
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
    clusterGroup.rotation.x += dt * 0.07;
    clusterGroup.position.y = Math.sin(now * 0.0016) * 0.08;
    const pop = easeOutBack(Math.min(1, buildPop));
    clusterGroup.scale.setScalar(pop);
    flashMesh.visible = false;
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
      triggerReveal();
    }
  } else if (animPhase === "REVEALING") {
    const t = Math.min(elapsed / 0.6, 1.0);
    cardMesh.scale.setScalar(Math.max(0.001, easeOutBack(t)));
    cardMesh.position.z = 0.1 + Math.min(elapsed * 1.2, 0.5);
    cardMesh.rotation.y = Math.sin(elapsed * 1.2) * 0.06;
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

  renderFrame();
}

/* ================= internals ================= */

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

  const R = 1.5 + scale * 0.6;
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
    mesh.scale.setScalar((0.24 + ((i * 13) % 10) / 10 * 0.3) * scale);
    clusterGroup.add(mesh);
    clusterSpheres.push({ mesh, home: pos.clone() });
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
  if (cb) cb({ stock: selectedStock, usdValue });

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
  scene.background = new THREE.Color(0x05060f);
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

  rootGroup = new THREE.Group();
  scene.add(rootGroup);

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
  initRenderer();
}

function initRenderer() {
  if (!canvas) return;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  sizeRenderer();

  if (!onResizeBound) {
    onResizeBound = () => sizeRenderer();
    window.addEventListener("resize", onResizeBound);
  }
}

function sizeRenderer() {
  if (!renderer || !canvas) return;
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 220;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.position.set(0, 0.3, fitDistance(camera.aspect));
  camera.lookAt(0, 0.3, 0);
  camera.updateProjectionMatrix();
}

function fitDistance(aspect) {
  // Cluster radius ~2.2 * scale; the reveal card half-width is 1.7.
  const need = 2.3 / Math.tan((45 * Math.PI) / 360) / Math.max(0.2, aspect);
  return Math.max(7.2, need + 0.6);
}

function renderFrame() {
  if (!renderer || !scene) return;
  renderer.render(scene, camera);
}

function triggerReveal() {
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

  const canvasTex = document.createElement("canvas");
  canvasTex.width = 768;
  canvasTex.height = 1024;
  const ctx = canvasTex.getContext("2d");
  const w = canvasTex.width;
  const h = canvasTex.height;

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

  const tex = new THREE.CanvasTexture(canvasTex);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}
