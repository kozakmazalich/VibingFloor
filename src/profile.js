/**
 * PROFILE PAGE — pilot profile with the staking demo.
 *
 * Desktop layout: LEFT = random robot portrait + WINS / $VIB / STAKED / hold
 * stats + CLAIM / STAKE / NEXT DAY buttons; RIGHT = the embedded 3D sphere
 * vault (src/stakingVault.js renders into #staking-viewport via the shared
 * renderer); BOTTOM (full width) = grid of claimed RWA stock cards.
 * Mobile: everything stacks vertically.
 *
 * Single source of truth: src/staking.js.
 */
import {
  getStakeState,
  claimReward,
  stakeVIB,
  advanceDay,
  addClaimedStock,
} from "./staking.js";
import { showStakingVault, hideStakingVault, triggerBreachAndClaim } from "./stakingVault.js";

const PORTRAITS = [
  "assets/robot1_portrait.png",
  "assets/robot2_portrait.png",
  "assets/robot3_portrait.png",
  "assets/robot4_portrait.png",
  "assets/robot5_portrait.png",
  "assets/meta.jpg",
];

const TIER_COLORS = {
  COMMON: "#7a8299",
  UNCOMMON: "#00e5ff",
  RARE: "#39ff14",
  EPIC: "#ff2d95",
  LEGENDARY: "#ffd700",
};

const els = {};
let claimBusy = false;

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
    empty.textContent = "No RWA cards yet — stake, then claim to breach the vault.";
    els.cards.appendChild(empty);
    return;
  }
  for (const c of stocks) {
    const color = TIER_COLORS[c.tier] || TIER_COLORS.COMMON;
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
  if (els.wins) els.wins.textContent = String(s.wins);
  if (els.vib) els.vib.textContent = fmt(s.vibBalance);
  if (els.staked) els.staked.textContent = fmt(s.totalStaked);
  if (els.hold) els.hold.textContent = holdLabel(s.holdHours);
  if (els.holdTier) els.holdTier.textContent = holdTier(s.holdHours);
  if (els.cardsCount) els.cardsCount.textContent = String(s.claimedStocks.length);
  if (els.claimBtn) {
    els.claimBtn.disabled = claimBusy;
    els.claimBtn.classList.toggle("disabled", els.claimBtn.disabled);
  }
  if (els.stakeBtn) {
    els.stakeBtn.disabled = claimBusy || s.vibBalance < 1000000;
    els.stakeBtn.classList.toggle("disabled", els.stakeBtn.disabled);
  }
  if (els.nextBtn) els.nextBtn.disabled = claimBusy;
  renderCards(s.claimedStocks);
}

function onClaim() {
  if (claimBusy) return;
  // CLAIM is wired to claimReward(): the +1,000,000 $VIB faucet — and when
  // there is staked VIB it ALSO triggers the implosion + stock reveal.
  claimReward();
  const s = getStakeState();
  if (s.totalStaked >= 1000000) {
    claimBusy = true;
    triggerBreachAndClaim();
  }
  render();
}

function onStake() {
  if (claimBusy) return;
  const ok = stakeVIB(1000000);
  if (ok) render(); // the 3D sphere cluster grows on the next vault frame
}

function onNextDay() {
  if (claimBusy) return;
  advanceDay();
  render();
}

export function openProfile(renderer) {
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

  if (!els.overlay) return;

  // Random robot portrait until there is an account system
  if (els.avatar) {
    els.avatar.src = PORTRAITS[Math.floor(Math.random() * PORTRAITS.length)];
  }

  render();
  els.overlay.classList.remove("hidden");

  // Start the embedded 3D reactor (renders into #staking-viewport).
  showStakingVault(
    (res) => {
      claimBusy = false;
      addClaimedStock(res);
      render();
    },
    { renderer }
  );
}

export function closeProfile() {
  hideStakingVault();
  if (els.overlay) els.overlay.classList.add("hidden");
}

export function wireProfileButtons() {
  const claim = document.getElementById("btn-demo-claim");
  const stake = document.getElementById("btn-demo-stake");
  const next = document.getElementById("btn-demo-nextday");
  const close = document.getElementById("btn-profile-close");
  if (claim) claim.addEventListener("click", onClaim);
  if (stake) stake.addEventListener("click", onStake);
  if (next) next.addEventListener("click", onNextDay);
  if (close) close.addEventListener("click", closeProfile);
}
