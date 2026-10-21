/**
 * PROFILE PAGE — pilot profile with the staking demo.
 *
 * Desktop: LEFT = portrait + WINS / $VIB / STAKED / hold + CLAIM / STAKE;
 * RIGHT = the 3D reactor (stakingVault.js draws into #staking-canvas);
 * BELOW = claimed RWA stock cards. Mobile stacks those blocks.
 *
 * Single source of truth: src/staking.js.
 * CLAIM only credits $VIB. The safe opens from the vault's own button,
 * which stakingVault.js mounts under the reactor canvas.
 */
import {
  getStakeState,
  claimReward,
  stakeVIB,
  topUpVIB,
  advanceDay,
  burnStake,
  addClaimedStock,
  updateLatestClaimedStock,
} from "./staking.js";
import { showStakingVault, hideStakingVault } from "./stakingVault.js";

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

const STAKE_MIN = 1_000_000;
const STAKE_MAX = 10_000_000;
const STAKE_STEP = 100_000;

const els = {};
let lastVaultW = 0;
let lastVaultH = 0;

function fmt(n) {
  return n.toLocaleString("en-US");
}

function holdLabel(hours) {
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  if (days > 0 && rem === 0) return `${days}d`;
  return `${hours}h`;
}

function holdTier(luck) {
  return `x${luck.toFixed(2)}`;
}

function renderCards(stocks) {
  if (!els.cards) return;
  els.cards.innerHTML = "";
  if (!stocks.length) {
    const empty = document.createElement("div");
    empty.className = "profile-empty";
    empty.textContent = "No RWA cards yet — open the safe under the reactor.";
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
  if (els.holdTier) els.holdTier.textContent = holdTier(s.luckMultiplier);
  if (els.cardsCount) els.cardsCount.textContent = String(s.claimedStocks.length);
  syncStakeSlider(s);
  renderCards(s.claimedStocks);
}

/**
 * Largest amount the slider can offer: whole steps, never past the vault cap
 * or the free balance. A second deposit is a top-up into the same vault.
 */
function stakeCeiling(s) {
  const free = Math.max(0, Number(s.vibBalance) || 0);
  const room = s.totalStaked > 0
    ? Math.min(free, Math.max(0, STAKE_MAX - s.totalStaked))
    : Math.min(free, STAKE_MAX);
  return Math.floor(room / STAKE_STEP) * STAKE_STEP;
}

function syncStakeSlider(s) {
  const slider = els.stakeSlider;
  const max = stakeCeiling(s);
  const disabled = max < STAKE_MIN;
  const active = s.totalStaked > 0;
  if (slider) {
    slider.min = String(STAKE_MIN);
    slider.max = String(Math.max(STAKE_MIN, max));
    slider.step = String(STAKE_STEP);
    slider.disabled = disabled;
    let value = Number(slider.value);
    if (!Number.isFinite(value)) value = Math.min(STAKE_MIN, max);
    value = Math.round(value / STAKE_STEP) * STAKE_STEP;
    if (value < STAKE_MIN) value = Math.min(STAKE_MIN, max);
    if (value > max) value = max;
    if (!disabled) slider.value = String(value);
    const span = Math.max(STAKE_MIN, max) - STAKE_MIN;
    const pct = span > 0 ? ((value - STAKE_MIN) / span) * 100 : 100;
    slider.style.setProperty("--stake-pct", `${Math.max(0, Math.min(100, pct))}%`);
  }
  const shown = disabled ? 0 : Number(els.stakeSlider && els.stakeSlider.value) || 0;
  if (els.stakeValue) els.stakeValue.textContent = fmt(shown);
  if (els.stakeMax) els.stakeMax.textContent = fmt(Math.max(0, max));
  if (els.stakeBtn) {
    els.stakeBtn.disabled = disabled;
    els.stakeBtn.classList.toggle("disabled", disabled);
    const label = els.stakeBtn.querySelector(".btn-text");
    if (label) {
      label.textContent = disabled
        ? active
          ? "VAULT AT MAX CAP"
          : "STAKE $VIB"
        : active
          ? `TOP UP +${fmt(shown)} $VIB`
          : `STAKE ${fmt(shown)} $VIB`;
    }
  }
}

function selectedStakeAmount() {
  const raw = els.stakeSlider ? Number(els.stakeSlider.value) : 0;
  if (!Number.isFinite(raw) || raw < STAKE_MIN) return 0;
  return raw;
}

function vaultOptions() {
  const s = getStakeState();
  const canvas = els.vaultCanvas;
  return {
    canvas,
    host: canvas ? canvas.parentElement : undefined,
    stakeAmount: s.totalStaked,
    holdHours: s.holdHours,
    pureUpfront: s.pureUpfront,
    vibBalance: s.vibBalance,
    showUI: true,
    onReveal: onCardWon,
    onInitialStake: (amount) => {
      if (stakeVIB(amount)) {
        render();
        refreshVault();
      }
    },
    onTopUp: (amount) => {
      if (topUpVIB(amount)) {
        render();
        refreshVault();
      }
    },
  };
}

/** The safe puts the won card into WON RWA EQUITY as soon as it is drawn. */
function onCardWon(res, meta) {
  if (meta && meta.update) {
    updateLatestClaimedStock(res);
    render();
    return;
  }
  addClaimedStock(res);
  // The card already carries the stake and hold that produced it.
  // What was staked is burnt, and the hold clock starts over.
  burnStake();
  render();
  refreshVault();
}

/** CLOSE fades the vault, then the idle reactor returns. The card is already saved. */
function onVaultComplete() {
  if (!els.overlay || els.overlay.classList.contains("hidden")) return;
  showStakingVault(onVaultComplete, vaultOptions());
  requestAnimationFrame(syncVaultSize);
}

function refreshVault() {
  if (!els.overlay || els.overlay.classList.contains("hidden")) return;
  if (!els.vaultCanvas) return;
  showStakingVault(onVaultComplete, vaultOptions());
}

function onClaim() {
  // Credits $VIB only. The safe is opened by the button under the reactor.
  claimReward();
  render();
  // The vault HUD spends the free balance, so it needs the new wallet too.
  refreshVault();
}

function onStake() {
  const s = getStakeState();
  const amount = selectedStakeAmount();
  if (!amount) return;
  const ok = s.totalStaked > 0 ? topUpVIB(amount) : stakeVIB(amount);
  if (!ok) return;
  render();
  refreshVault();
}

function onStakeSlider() {
  syncStakeSlider(getStakeState());
}

/**
 * stakingVault.js sizes its drawing buffer from the canvas's client box, and
 * only again on window resize. Ping that once the CSS box has actually changed.
 */
function syncVaultSize() {
  const canvas = els.vaultCanvas || document.getElementById("staking-canvas");
  if (!canvas) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w < 8 || h < 8) return;
  if (w === lastVaultW && h === lastVaultH) return;
  lastVaultW = w;
  lastVaultH = h;
  window.dispatchEvent(new Event("resize"));
}

function onNextDay() {
  advanceDay();
  render();
  refreshVault();
}

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
  els.stakeSlider = document.getElementById("stake-amount");
  els.stakeValue = document.getElementById("stake-amount-value");
  els.stakeMax = document.getElementById("stake-amount-max");
  els.nextBtn = document.getElementById("btn-demo-nextday");
  els.vaultCanvas = document.getElementById("staking-canvas");

  if (!els.overlay) return;

  // Random robot portrait until there is an account system
  if (els.avatar) {
    els.avatar.src = PORTRAITS[Math.floor(Math.random() * PORTRAITS.length)];
  }

  render();
  els.overlay.classList.remove("hidden");
  els.overlay.setAttribute("aria-hidden", "false");

  // The overlay is display:none while closed, so the canvas has no box yet.
  // stakingVault.js reads clientWidth/clientHeight when the renderer is created.
  const mountVault = (triesLeft) => {
    const canvas = els.vaultCanvas;
    if (!canvas) return;
    if ((canvas.clientWidth < 8 || canvas.clientHeight < 8) && triesLeft > 0) {
      requestAnimationFrame(() => mountVault(triesLeft - 1));
      return;
    }
    showStakingVault(onVaultComplete, vaultOptions());
    requestAnimationFrame(syncVaultSize);
  };
  requestAnimationFrame(() => mountVault(30));
}

export function closeProfile() {
  hideStakingVault();
  lastVaultW = 0;
  lastVaultH = 0;
  if (els.overlay) {
    els.overlay.classList.add("hidden");
    els.overlay.setAttribute("aria-hidden", "true");
  }
}

export function wireProfileButtons() {
  const claim = document.getElementById("btn-demo-claim");
  const stake = document.getElementById("btn-demo-stake");
  const slider = document.getElementById("stake-amount");
  const next = document.getElementById("btn-demo-nextday");
  const close = document.getElementById("btn-profile-close");
  els.stakeBtn = stake;
  els.stakeSlider = slider;
  els.stakeValue = document.getElementById("stake-amount-value");
  els.stakeMax = document.getElementById("stake-amount-max");
  if (claim) claim.addEventListener("click", onClaim);
  if (stake) stake.addEventListener("click", onStake);
  if (slider) slider.addEventListener("input", onStakeSlider);
  if (next) next.addEventListener("click", onNextDay);
  if (close) close.addEventListener("click", closeProfile);
}
