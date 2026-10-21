/**
 * STAKING — demo state (single source of truth for the profile page).
 *
 * Everything the profile reads/writes lives here: VIB balance, total staked,
 * hold time (lock countdown), claimed RWA stocks and win count. Persisted in
 * localStorage so the demo survives reloads. No real tokens, no wallet.
 */
const STORAGE_KEY = "vf-staking-demo-v1";
const CLAIM_STEP = 1000000;
const MIN_STAKE = 1000000;
const MAX_STAKE = 10000000;
const LOCK_HOURS = 24;
const GENESIS_LUCK = 1.15;

function freshState() {
  return { vib: 2500000, staked: 0, effectiveHoldHours: 0, pureUpfront: true, cards: [], wins: 0 };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    const next = freshState();
    if (Number.isFinite(parsed.vib)) next.vib = parsed.vib;
    if (Number.isFinite(parsed.staked)) next.staked = Math.min(MAX_STAKE, Math.max(0, parsed.staked));
    const hours = Number(parsed.effectiveHoldHours ?? parsed.holdHours);
    next.effectiveHoldHours = next.staked > 0 && Number.isFinite(hours) ? Math.max(0, hours) : 0;
    next.pureUpfront = parsed.pureUpfront != null ? !!parsed.pureUpfront : true;
    if (Array.isArray(parsed.cards)) next.cards = parsed.cards;
    if (Number.isFinite(parsed.wins)) next.wins = parsed.wins;
    return next;
  } catch {
    /* private mode */
  }
  return freshState();
}

const state = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Luck tier from effective hold. 24h = x1, 72h = x2, 168h = x5. */
export function luckTier(hours) {
  if (hours >= 168) return 5;
  if (hours >= 72) return 2;
  return 1;
}

/** USD size multiplier. Separate from luck. 24h = x1, 72h = x1.25, 168h = x2. */
export function holdSizeMultiplier(hours) {
  if (hours >= 168) return 2;
  if (hours >= 72) return 1.25;
  return 1;
}

/** Full 10M deposited once, never topped up. */
export function isGenesisLock(stake, pureUpfront) {
  return pureUpfront === true && stake === MAX_STAKE;
}

/** Displayed luck. Genesis lock adds 15% on top of the tier. */
export function luckMultiplier(hours, stake, pureUpfront) {
  const base = luckTier(hours);
  return isGenesisLock(stake, pureUpfront) ? base * GENESIS_LUCK : base;
}

/**
 * Drop weight at the effective-hold tier. Genesis lock adds 15% weight
 * to Rare, Epic and Legendary only.
 */
export function holdDropWeight(stock, hours, stake = 0, pureUpfront = false) {
  const weight = hours >= 168 ? stock.chance168h : hours >= 72 ? stock.chance72h : stock.chance24h;
  if (!isGenesisLock(stake, pureUpfront)) return weight;
  if (stock.tier === "RARE" || stock.tier === "EPIC" || stock.tier === "LEGENDARY") {
    return weight * GENESIS_LUCK;
  }
  return weight;
}

/** Snapshot of the whole demo state (copies, never the live object). */
export function getStakeState() {
  const hours = state.effectiveHoldHours;
  return {
    vibBalance: state.vib,
    totalStaked: state.staked,
    holdHours: hours,
    effectiveHoldHours: hours,
    lockCountdown: Math.max(0, LOCK_HOURS - hours),
    pureUpfront: state.pureUpfront,
    luckMultiplier: luckMultiplier(hours, state.staked, state.pureUpfront),
    holdSizeMultiplier: holdSizeMultiplier(hours),
    vaultActive: state.staked > 0,
    canClaim: state.staked >= MIN_STAKE && hours >= LOCK_HOURS,
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

/**
 * Open the one active vault. Refuses a second position, anything under 1M,
 * anything over 10M, or more than the free balance. The 24h lock starts at 0.
 */
export function stakeVIB(amount = MIN_STAKE) {
  if (state.staked > 0) return false;
  if (!Number.isFinite(amount) || amount < MIN_STAKE || amount > MAX_STAKE) return false;
  if (state.vib < amount) return false;
  state.vib -= amount;
  state.staked = amount;
  state.effectiveHoldHours = 0;
  state.pureUpfront = true;
  save();
  return true;
}

/**
 * Stake-weighted hold after a top-up. Late money must not inherit the time
 * already served: (currentStake * effectiveHoldHours) / (currentStake + added).
 */
export function weightedEffectiveHold(currentStake, effectiveHoldHours, addedVib) {
  const next = (Number(currentStake) || 0) + (Number(addedVib) || 0);
  if (!(next > 0)) return 0;
  return ((Number(currentStake) || 0) * (Number(effectiveHoldHours) || 0)) / next;
}

/**
 * Add $VIB to the open vault, up to 10M. Effective hold is the stake-weighted
 * average, so late money does not inherit the time already served.
 */
export function topUpVIB(amount) {
  if (state.staked <= 0) return false;
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (state.vib < amount) return false;
  if (state.staked + amount > MAX_STAKE) return false;
  state.effectiveHoldHours = weightedEffectiveHold(state.staked, state.effectiveHoldHours, amount);
  state.staked += amount;
  state.vib -= amount;
  state.pureUpfront = false;
  save();
  return true;
}

/** +24h on the open vault only. No vault, no clock. */
export function advanceDay() {
  if (state.staked <= 0) return false;
  state.effectiveHoldHours += 24;
  save();
  return true;
}

/**
 * The card was claimed. Staked $VIB burns, the clock and the upfront flag
 * reset, and a new vault can be opened.
 */
export function burnStake() {
  state.staked = 0;
  state.effectiveHoldHours = 0;
  state.pureUpfront = true;
  save();
}

function stockCard(res) {
  return {
    ticker: res.stock.ticker,
    name: res.stock.name,
    tier: res.stock.tier,
    usdValue: res.usdValue,
    stakeAmount: res.stakeAmount,
    holdHours: res.holdHours,
    luckMultiplier: res.luckMultiplier,
    pureMaxLock: !!res.pureMaxLock,
  };
}

/** Record a won RWA stock. Newest card is first. */
export function addClaimedStock(res) {
  if (!res || !res.stock) return;
  state.cards.unshift(stockCard(res));
  save();
}

/** Replace the newest won card (same opening, the player switched ticker). */
export function updateLatestClaimedStock(res) {
  if (!res || !res.stock || !state.cards.length) return;
  state.cards[0] = stockCard(res);
  save();
}

/** Increment the pilot's win counter (called on a won round). */
export function addWin() {
  state.wins++;
  save();
}
