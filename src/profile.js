/**
 * PROFILE — STAKING DEMO (local test harness).
 *
 * A temporary demo screen to exercise the staking vault end-to-end:
 *   - shows the player's viber robot, $VIB balance, staked amount and hold time
 *   - infinite "+1,000,000 $VIB" claim button
 *   - "next day" button advancing the staking hold time (reward tiers at 72h/168h)
 *   - STAKE button that plays the real 3D stakingVault animation and collects
 *     the won RWA stock cards into the inventory
 *
 * Everything is LOCAL DEMO state (localStorage) — no real tokens, no wallet.
 */
import { showStakingVault, triggerBreachAndClaim } from "./stakingVault.js";

const STORAGE_KEY = "vf-demo-profile-v1";
const STAKE_STEP = 1000000;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* private mode etc. */
  }
  return { vib: 2500000, staked: 0, holdHours: 24, cards: [] };
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

let state = loadState();

const els = {};
let vaultBusy = false;

function fmt(n) {
  return n.toLocaleString("en-US");
}

function holdLabel(hours) {
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  if (days > 0 && rem === 0) return `${days}d (${hours}h)`;
  return `${hours}h`;
}

function holdTier(hours) {
  if (hours >= 168) return "x2.0";
  if (hours >= 72) return "x1.25";
  return "x1.0";
}

function renderCards() {
  if (!els.cards) return;
  els.cards.innerHTML = "";
  if (!state.cards.length) {
    const empty = document.createElement("div");
    empty.className = "profile-empty";
    empty.textContent = "No RWA cards yet — stake to roll the vault.";
    els.cards.appendChild(empty);
    return;
  }
  for (const c of state.cards) {
    const card = document.createElement("div");
    card.className = "stock-card";
    card.style.setProperty("--stock-color", c.color);
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
  if (els.vib) els.vib.textContent = fmt(state.vib);
  if (els.staked) els.staked.textContent = fmt(state.staked);
  if (els.hold) els.hold.textContent = holdLabel(state.holdHours);
  if (els.holdTier) els.holdTier.textContent = holdTier(state.holdHours);
  if (els.cardsCount) els.cardsCount.textContent = String(state.cards.length);
  if (els.stakeBtn) {
    els.stakeBtn.disabled = vaultBusy || state.vib < STAKE_STEP;
    els.stakeBtn.classList.toggle("disabled", els.stakeBtn.disabled);
  }
  renderCards();
}

function claimVib() {
  state.vib += STAKE_STEP;
  saveState(state);
  render();
}

function nextDay() {
  state.holdHours += 24;
  saveState(state);
  render();
}

function stakeVib() {
  if (vaultBusy || state.vib < STAKE_STEP) return;
  vaultBusy = true;
  state.vib -= STAKE_STEP;
  state.staked += STAKE_STEP;
  saveState(state);
  render();

  // Real 3D staking vault (its own full-screen standalone renderer + RAF).
  // The vault idles as an orbiting reactor; trigger the breach a moment later
  // so the implode -> stock reveal -> fade sequence plays.
  showStakingVault(
    (res) => {
      vaultBusy = false;
      if (res && res.stock) {
        state.cards.unshift({
          ticker: res.stock.ticker,
          name: res.stock.name,
          tier: res.stock.tier,
          color: res.stock.color,
          usdValue: res.usdValue,
          stakeAmount: res.stakeAmount,
          holdHours: res.holdHours,
        });
      }
      saveState(state);
      render();
    },
    { stakeAmount: state.staked, holdHours: state.holdHours }
  );
  setTimeout(() => triggerBreachAndClaim(), 1600);
}

export function openProfile(robot) {
  els.overlay = document.getElementById("profile-overlay");
  els.avatar = document.getElementById("profile-avatar");
  els.name = document.getElementById("profile-name");
  els.vib = document.getElementById("profile-vib");
  els.staked = document.getElementById("profile-staked");
  els.hold = document.getElementById("profile-hold");
  els.holdTier = document.getElementById("profile-hold-tier");
  els.cardsCount = document.getElementById("profile-cards-count");
  els.cards = document.getElementById("profile-cards");
  els.stakeBtn = document.getElementById("btn-demo-stake");

  if (!els.overlay) return;

  if (robot) {
    if (els.avatar && robot.portrait) els.avatar.src = robot.portrait;
    if (els.name) els.name.textContent = robot.name || "VIBER";
  }

  render();
  els.overlay.classList.remove("hidden");
}

export function closeProfile() {
  if (els.overlay) els.overlay.classList.add("hidden");
}

export function wireProfileButtons() {
  const claim = document.getElementById("btn-demo-claim");
  const next = document.getElementById("btn-demo-nextday");
  const stake = document.getElementById("btn-demo-stake");
  const close = document.getElementById("btn-profile-close");
  if (claim) claim.addEventListener("click", claimVib);
  if (next) next.addEventListener("click", nextDay);
  if (stake) stake.addEventListener("click", stakeVib);
  if (close) close.addEventListener("click", closeProfile);
}
