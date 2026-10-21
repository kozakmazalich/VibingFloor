/**
 * STAKING — demo state (single source of truth for the profile page).
 *
 * Everything the profile reads/writes lives here: VIB balance, total staked,
 * hold time (lock countdown), claimed RWA stocks and win count. Persisted in
 * localStorage so the demo survives reloads. No real tokens, no wallet.
 */
const STORAGE_KEY = "vf-staking-demo-v1";
const CLAIM_STEP = 1000000;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* private mode */
  }
  return { vib: 2500000, staked: 0, holdHours: 24, cards: [], wins: 0 };
}

const state = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Snapshot of the whole demo state (copies, never the live object). */
export function getStakeState() {
  return {
    vibBalance: state.vib,
    totalStaked: state.staked,
    holdHours: state.holdHours,
    lockCountdown: state.holdHours, // demo: lock == hold time (hours)
    wins: state.wins,
    claimedStocks: state.cards.map((c) => ({ ...c })),
  };
}

/** Demo faucet: +1,000,000 $VIB per click (infinite). */
export function claimReward() {
  state.vib += CLAIM_STEP;
  save();
  return CLAIM_STEP;
}

/** Stake `amount` $VIB (default 1,000,000). Returns false when short. */
export function stakeVIB(amount = CLAIM_STEP) {
  if (state.vib < amount) return false;
  state.vib -= amount;
  state.staked += amount;
  save();
  return true;
}

/** Demo time-skip: +24h of hold time (reward tiers at 72h/168h). */
export function advanceDay() {
  state.holdHours += 24;
  save();
}

/** Record a claimed RWA stock from the vault's onComplete payload. */
export function addClaimedStock(res) {
  if (!res || !res.stock) return;
  state.cards.unshift({
    ticker: res.stock.ticker,
    name: res.stock.name,
    tier: res.stock.tier,
    usdValue: res.usdValue,
    stakeAmount: res.stakeAmount,
    holdHours: res.holdHours,
  });
  save();
}

/** Increment the pilot's win counter (called on a won round). */
export function addWin() {
  state.wins++;
  save();
}
