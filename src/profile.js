/**
 * PROFILE PAGE — pilot profile with the staking demo.
 *
 * Layout (desktop): LEFT = random robot portrait + WINS/$VIB stats + CLAIM /
 * STAKE / NEXT DAY buttons; CENTER = a 3D pile of VIB coins that grows with
 * the staked amount; BOTTOM = grid of claimed RWA stock cards.
 * Mobile: everything stacks vertically.
 *
 * Single source of truth: src/staking.js (getStakeState / claimReward /
 * stakeVIB / advanceDay / addClaimedStock).
 */
import * as THREE from "three";
import {
  getStakeState,
  claimReward,
  stakeVIB,
  advanceDay,
  addClaimedStock,
} from "./staking.js";
import { showStakingVault, triggerBreachAndClaim } from "./stakingVault.js";

const PORTRAITS = [
  "assets/robot1_portrait.png",
  "assets/robot2_portrait.png",
  "assets/robot3_portrait.png",
  "assets/robot4_portrait.png",
  "assets/robot5_portrait.png",
  "assets/meta.jpg",
];

// Tier colours for the stock cards (per the profile spec).
const TIER_COLORS = {
  COMMON: "#7a8299",
  UNCOMMON: "#00e5ff",
  RARE: "#39ff14",
  EPIC: "#ff2d95",
  LEGENDARY: "#ffd700",
};

const els = {};
let vaultBusy = false;

/* ---------------------------------------------------------------- */
/* 3D coin pile (center) — grows with totalStaked, 60fps, no bloom  */
/* ---------------------------------------------------------------- */
let coinRenderer = null;
let coinScene = null;
let coinCamera = null;
let coinGroup = null;
let coinRaf = 0;
let coinCoins = [];
let coinCount = -1;

function buildCoinPile(count) {
  if (!coinGroup) return;
  for (const c of coinCoins) coinGroup.remove(c);
  coinCoins = [];

  const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.14, 22);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
  // Highlight rim for every coin (single shared geometry)
  const rimGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.05, 22);
  const rimMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });

  // Pyramid pile: rows of 1..n coins (max 6 rows = 21 coins)
  const n = Math.min(6, Math.max(1, Math.ceil((Math.sqrt(8 * count + 1) - 1) / 2)));
  let placed = 0;
  for (let row = 1; row <= n && placed < count; row++) {
    for (let i = 0; i < row && placed < count; i++) {
      const coin = new THREE.Mesh(geo, mat);
      const x = (i - (row - 1) / 2) * 0.98;
      const y = (n - row) * 0.16 + 0.1 + (placed % 2) * 0.02;
      coin.position.set(x, y, 0);
      coin.rotation.x = Math.PI / 2;
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.set(x, y + 0.06, 0);
      rim.rotation.x = Math.PI / 2;
      coinGroup.add(coin, rim);
      coinCoins.push(coin, rim);
      placed++;
    }
  }
}

function syncCoinPile(staked) {
  const count = Math.min(21, 3 + Math.floor(staked / 1000000));
  if (count !== coinCount) {
    coinCount = count;
    buildCoinPile(count);
  }
}

function startCoinLoop() {
  if (coinRaf) return;
  const loop = () => {
    if (!coinRenderer) return;
    coinRaf = requestAnimationFrame(loop);
    if (coinGroup) {
      coinGroup.rotation.y += 0.012;
      coinGroup.position.y = Math.sin(performance.now() * 0.0015) * 0.06;
    }
    coinRenderer.render(coinScene, coinCamera);
  };
  coinRaf = requestAnimationFrame(loop);
}

function stopCoinLoop() {
  if (coinRaf) cancelAnimationFrame(coinRaf);
  coinRaf = 0;
}

function initCoinPile(canvas) {
  if (coinRenderer) return;
  coinRenderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  coinRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  coinRenderer.setSize(canvas.clientWidth || 320, canvas.clientHeight || 200, false);
  coinScene = new THREE.Scene();
  coinCamera = new THREE.PerspectiveCamera(45, canvas.clientWidth / Math.max(1, canvas.clientHeight), 0.1, 50);
  coinCamera.position.set(0, 0.6, 5.2);
  coinCamera.lookAt(0, 0.9, 0);
  coinGroup = new THREE.Group();
  coinScene.add(coinGroup);
}

/* ---------------------------------------------------------------- */
/* UI rendering                                                      */
/* ---------------------------------------------------------------- */
function fmt(n) {
  return n.toLocaleString("en-US");
}

function holdLabel(hours) {
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  if (days > 0 && rem === 0) return `${days}d`;
  return `${hours}h`;
}

function holdTier(hours) {
  if (hours >= 168) return "x2.0";
  if (hours >= 72) return "x1.25";
  return "x1.0";
}

function renderCards(stocks) {
  if (!els.cards) return;
  els.cards.innerHTML = "";
  if (!stocks.length) {
    const empty = document.createElement("div");
    empty.className = "profile-empty";
    empty.textContent = "No RWA cards yet — stake to breach the vault.";
    els.cards.appendChild(empty);
    return;
  }
  for (const c of stocks) {
    const color = TIER_COLORS[c.tier] || "#7a8299";
    const card = document.createElement("div");
    card.className = "stock-card";
    card.style.setProperty("--stock-color", color);
    card.innerHTML = `
      <div class="stock-tier">${c.tier}</div>
      <div class="stock-ticker">$${c.ticker}</div>
      <div class="stock-name">${c.name}</div>
      <div class="stock-value tabular">+$${c.usdValue.toFixed(2)} USD</div>
      <div class="stock-meta">stake ${(c.stakeAmount / 1000000).toFixed(1)}M · hold ${c.holdHours}h</div>
    `;
    els.cards.appendChild(card);
  }
}

function render() {
  const s = getStakeState();
  if (els.vib) els.vib.textContent = fmt(s.vibBalance);
  if (els.staked) els.staked.textContent = fmt(s.totalStaked);
  if (els.wins) els.wins.textContent = String(s.wins);
  if (els.hold) els.hold.textContent = holdLabel(s.holdHours);
  if (els.holdTier) els.holdTier.textContent = holdTier(s.holdHours);
  if (els.cardsCount) els.cardsCount.textContent = String(s.claimedStocks.length);
  if (els.stakeBtn) {
    els.stakeBtn.disabled = vaultBusy || s.vibBalance < 1000000;
    els.stakeBtn.classList.toggle("disabled", els.stakeBtn.disabled);
  }
  if (els.claimBtn) els.claimBtn.disabled = vaultBusy;
  if (els.nextBtn) els.nextBtn.disabled = vaultBusy;
  renderCards(s.claimedStocks);
  syncCoinPile(s.totalStaked);
}

/* ---------------------------------------------------------------- */
/* Actions                                                           */
/* ---------------------------------------------------------------- */
function onClaim() {
  claimReward();
  render();
}

function onNextDay() {
  advanceDay();
  render();
}

function onStake() {
  if (vaultBusy) return;
  const s = getStakeState();
  if (s.vibBalance < 1000000) return;

  stakeVIB(1000000);
  vaultBusy = true;
  render();
  if (els.overlay) els.overlay.classList.add("hidden");

  const { totalStaked, holdHours } = getStakeState();
  showStakingVault(
    (res) => {
      vaultBusy = false;
      addClaimedStock(res);
      render();
      if (els.overlay) els.overlay.classList.remove("hidden");
    },
    { stakeAmount: totalStaked, holdHours }
  );

  // Give the reactor ~2.5s to spin before the implosion/claim sequence
  setTimeout(() => triggerBreachAndClaim(), 2500);
}

/* ---------------------------------------------------------------- */
/* Public API                                                        */
/* ---------------------------------------------------------------- */
export function openProfile() {
  els.overlay = document.getElementById("profile-overlay");
  els.avatar = document.getElementById("profile-avatar");
  els.wins = document.getElementById("profile-wins");
  els.vib = document.getElementById("profile-vib");
  els.staked = document.getElementById("profile-staked");
  els.hold = document.getElementById("profile-hold");
  els.holdTier = document.getElementById("profile-hold-tier");
  els.cardsCount = document.getElementById("profile-cards-count");
  els.cards = document.getElementById("profile-cards");
  els.claimBtn = document.getElementById("btn-demo-claim");
  els.stakeBtn = document.getElementById("btn-demo-stake");
  els.nextBtn = document.getElementById("btn-demo-nextday");
  els.coinCanvas = document.getElementById("profile-coins");

  if (!els.overlay) return;

  // Random robot portrait until there is an account system
  if (els.avatar) {
    els.avatar.src = PORTRAITS[Math.floor(Math.random() * PORTRAITS.length)];
  }

  render();
  els.overlay.classList.remove("hidden");

  if (els.coinCanvas) {
    initCoinPile(els.coinCanvas);
    coinCount = -1; // force a rebuild now that the scene exists
    syncCoinPile(getStakeState().totalStaked);
    startCoinLoop();
  }
}

export function closeProfile() {
  if (els.overlay) els.overlay.classList.add("hidden");
  stopCoinLoop();
}

export function wireProfileButtons() {
  const claim = document.getElementById("btn-demo-claim");
  const next = document.getElementById("btn-demo-nextday");
  const stake = document.getElementById("btn-demo-stake");
  const close = document.getElementById("btn-profile-close");
  if (claim) claim.addEventListener("click", onClaim);
  if (next) next.addEventListener("click", onNextDay);
  if (stake) stake.addEventListener("click", onStake);
  if (close) close.addEventListener("click", closeProfile);
}
