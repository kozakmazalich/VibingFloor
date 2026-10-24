/**
 * VERCEL SERVERLESS — Prize Drum payout ($VIB on Robinhood Testnet).
 *
 * Serverless port of `relayer/server.js` so payouts run 24/7 on Vercel
 * (free Hobby) WITHOUT a local process. Same security model:
 *   - Every payout requires a valid Privy access token (Bearer JWT).
 *   - The recipient must be an Ethereum wallet linked to that Privy user.
 *   - claimId dedup + per-user / global limits.
 *   - Chain ID + token contract verified on init.
 *   - Secrets come ONLY from process.env (set in Vercel -> Settings -> Env).
 *
 * State (dedupe + limits) lives in Upstash Redis (free) instead of the
 * `claims.json` file, because serverless instances have no persistent disk.
 * Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in Vercel.
 */

const crypto = require("node:crypto");
const { ethers } = require("ethers");
// NOTE: we intentionally do NOT require("@privy-io/node") here. Its dependency
// chain pulls in @hpke/chacha20poly1305 -> @hpke/common, whose CJS build
// `require("./src/errors.js")` fails to install on Vercel ("Cannot find module
// './src/errors.js'") and crashes the function. We only need two Privy
// operations — JWT verification and a user lookup — which we do directly with
// `jose` (JWT ES256 via Privy's remote JWKS) and a plain REST call.

// --- ENV (from Vercel dashboard - never hard-coded) ---
const RPC_URL = process.env.RPC_URL || "https://rpc.testnet.chain.robinhood.com";
const TREASURY_PRIVATE_KEY = normalizePrivateKey(process.env.TREASURY_PRIVATE_KEY || "");
const TOKEN_ADDRESS =
  process.env.TOKEN_ADDRESS || "0x462cE9fA227aB2CA44C66323B8fD4c3e078072ED";
const PRIVY_APP_ID = process.env.PRIVY_APP_ID || "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || "";
const PRIVY_API_URL = process.env.PRIVY_API_URL || "https://api.privy.io";
const EXPECTED_CHAIN_ID = Number(process.env.EXPECTED_CHAIN_ID || 46630);

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";

const MAX_AMOUNT = 1_000_000;
const MIN_CLAIM_INTERVAL_MS = Number(process.env.RELAYER_COOLDOWN_MS || 3000);
const MAX_CLAIMS_PER_HOUR = Number(process.env.RELAYER_MAX_CLAIMS_PER_HOUR || 12);
const MAX_DAILY_VIB = Number(process.env.RELAYER_MAX_DAILY_VIB || 10_000_000);
const MAX_GLOBAL_CLAIMS_PER_HOUR = Number(
  process.env.RELAYER_MAX_GLOBAL_CLAIMS_PER_HOUR || 60
);
const MAX_GLOBAL_DAILY_VIB = Number(process.env.RELAYER_MAX_GLOBAL_DAILY_VIB || 25_000_000);

// Serverless budget is ~60s on Hobby; cap the on-chain confirmation wait.
const TX_WAIT_TIMEOUT_MS = Number(process.env.RELAYER_TX_WAIT_MS || 45000);

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

// Lazy per-instance singletons (reused across warm invocations).
let provider = null;
let treasury = null;
let token = null;
let tokenDecimals = 18;
let chainReady = false;
let initPromise = null;
let initError = null;
let privyReady = false;
let privyJwks = null;
let privyError = null;

const userCache = new Map(); // userId -> { user, expiresAt }
const tokenCache = new Map(); // sha256 -> { claims, expiresAt }

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normalizePrivateKey(key) {
  if (!key) return "";
  return key.startsWith("0x") ? key : `0x${key}`;
}

// --- UPSTASH REDIS (REST) - minimal client, no extra dependency ---
async function redis(cmd, args = []) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    throw new HttpError(503, "Relayer state store not configured (Upstash Redis)");
  }
  const res = await fetch(UPSTASH_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify([cmd, ...args]),
  });
  if (!res.ok) throw new HttpError(502, `State store error (HTTP ${res.status})`);
  const data = await res.json();
  return data.result;
}

// --- LAZY INIT - chain + Privy on first use (cached for warm invocations) ---
async function ensureInit() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      provider = new ethers.JsonRpcProvider(RPC_URL, EXPECTED_CHAIN_ID);
      const net = await provider.getNetwork();
      if (Number(net.chainId) !== EXPECTED_CHAIN_ID) {
        throw new Error(`RPC chain id ${net.chainId} != expected ${EXPECTED_CHAIN_ID}`);
      }
      if (!TREASURY_PRIVATE_KEY) throw new Error("TREASURY_PRIVATE_KEY not set");
      treasury = new ethers.Wallet(TREASURY_PRIVATE_KEY, provider);
      token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, treasury);
      tokenDecimals = Number(await token.decimals());
      chainReady = true;
    } catch (err) {
      initError = err.message || "chain init failed";
      chainReady = false;
    }
    try {
      if (PRIVY_APP_ID && PRIVY_APP_SECRET) {
        privyReady = true;
        // Remote JWKS from Privy (same URL the SDK uses). ES256 + issuer privy.io.
        // jose@6 is ESM-only -> must use dynamic import() from this CJS module.
        const { createRemoteJWKSet } = await import("jose");
        privyJwks = createRemoteJWKSet(
          new URL(`${PRIVY_API_URL}/v1/apps/${PRIVY_APP_ID}/jwks.json`),
          { cacheMaxAge: 60 * 60 * 1000, cooldownDuration: 10 * 60 * 1000 }
        );
      } else {
        privyError = "PRIVY_APP_ID / PRIVY_APP_SECRET not set";
      }
    } catch (err) {
      privyError = err.message || "privy init failed";
      privyReady = false;
    }
    return { initError, privyError };
  })();
  return initPromise;
}

// --- PRIVY VERIFICATION (jose + remote JWKS, no @privy-io/node) ---
async function verifyPrivyToken(tokenString) {
  const key = crypto.createHash("sha256").update(tokenString).digest("hex");
  const hit = tokenCache.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) return hit.claims;

  // jose@6 is ESM-only -> dynamic import() from this CJS module.
  const { jwtVerify } = await import("jose");
  let payload;
  try {
    ({ payload } = await jwtVerify(tokenString, privyJwks, {
      typ: "JWT",
      algorithms: ["ES256"],
      issuer: "privy.io",
      audience: PRIVY_APP_ID,
    }));
  } catch (err) {
    throw new HttpError(401, `Invalid Privy token: ${err.message}`);
  }

  const claims = {
    app_id: payload.aud,
    issuer: payload.iss,
    issued_at: payload.iat,
    expiration: payload.exp,
    session_id: payload.sid,
    user_id: payload.sub,
  };
  if (claims.app_id !== PRIVY_APP_ID) {
    throw new HttpError(401, "Token audience does not match this app");
  }
  const expiresAt = (claims.expiration > 1e12 ? claims.expiration : claims.expiration * 1000) - 30000;
  tokenCache.set(key, { claims, expiresAt });
  if (tokenCache.size > 500) {
    for (const [k, v] of tokenCache) if (v.expiresAt <= now) tokenCache.delete(k);
  }
  return claims;
}

// Fetch a Privy user by id via the REST API (basic auth with the app secret).
async function getPrivyUser(userId) {
  const hit = userCache.get(userId);
  const now = Date.now();
  if (hit && hit.expiresAt > now) return hit.user;

  const basic = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString("base64");
  const res = await fetch(`${PRIVY_API_URL}/v1/users/${encodeURIComponent(userId)}`, {
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      // Privy requires the app id in its own header alongside Basic auth.
      "privy-app-id": PRIVY_APP_ID,
    },
  });
  if (!res.ok) {
    // Surface Privy's own error body so we can see WHY (bad id, bad auth, ...)
    let detail = "";
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* ignore */
    }
    throw new HttpError(502, `Could not load the Privy user (HTTP ${res.status}) ${detail}`);
  }
  const user = await res.json();
  userCache.set(userId, { user, expiresAt: now + 300000 });
  if (userCache.size > 500) {
    for (const [k, v] of userCache) if (v.expiresAt <= now) userCache.delete(k);
  }
  return user;
}

// Mirrors the proven logic from relayer/server.js: Privy's REST user object
// exposes wallets as linked_accounts (snake_case) with type "wallet" and
// chain_type "ethereum" — NOT linkedAccounts / type "ethereum".
function assertWalletOwned(user, address) {
  const target = address.toLowerCase();

  const wallets = (user.linked_accounts || [])
    .filter(
      (account) =>
        account &&
        account.type === "wallet" &&
        account.chain_type === "ethereum" &&
        typeof account.address === "string"
    )
    .map((account) => account.address.toLowerCase());

  // Some accounts expose a single embedded wallet under `wallet`.
  const embedded =
    user.wallet && typeof user.wallet.address === "string"
      ? user.wallet.address.toLowerCase()
      : null;

  if (!wallets.includes(target) && embedded !== target) {
    throw new HttpError(403, "Wallet is not linked to this Privy account");
  }
}

// --- LIMITS + DEDUPE (Redis) ---
function dayKey(now) {
  return new Date(now).toISOString().slice(0, 10);
}
function hourKey(now) {
  return Math.floor(now / 3600000);
}

async function checkLimits(userId, amount) {
  const now = Date.now();
  const day = dayKey(now);
  const hour = hourKey(now);
  const ukey = `claim:user:${userId}`;
  const gkey = `claim:global`;
  const rawUser = await redis("HGETALL", [ukey]);
  const user = rawUser && typeof rawUser === "object" && !Array.isArray(rawUser) ? rawUser : {};
  const gRaw = await redis("HGETALL", [gkey]);
  const global = gRaw && typeof gRaw === "object" && !Array.isArray(gRaw) ? gRaw : {};

  const lastClaimAt = Number(user.lastClaimAt || 0);
  const uDay = user.day || day;
  const uDailyVib = Number(user.dailyVib || 0);
  const uHour = Number(user.hour || hour);
  const uHourlyClaims = Number(user.hourlyClaims || 0);
  const gDay = global.day || day;
  const gDailyVib = Number(global.dailyVib || 0);
  const gHour = Number(global.hour || hour);
  const gHourlyClaims = Number(global.hourlyClaims || 0);

  if (now - lastClaimAt < MIN_CLAIM_INTERVAL_MS) throw new HttpError(429, "Claim cooldown: try again in a moment");
  if (uHourlyClaims >= MAX_CLAIMS_PER_HOUR) throw new HttpError(429, "Hourly claim limit reached for this account");
  if ((uDay === day ? uDailyVib : 0) + amount > MAX_DAILY_VIB) throw new HttpError(429, "Daily $VIB limit reached for this account");
  if ((gHour === hour ? gHourlyClaims : 0) >= MAX_GLOBAL_CLAIMS_PER_HOUR) throw new HttpError(429, "Global hourly claim limit reached");
  if ((gDay === day ? gDailyVib : 0) + amount > MAX_GLOBAL_DAILY_VIB) throw new HttpError(429, "Global daily payout limit reached");

  return { uDay, uHour, gDay, gHour };
}

async function recordClaim(userId, amount, claimId, keys) {
  const now = Date.now();
  const day = dayKey(now);
  const hour = hourKey(now);
  const dedup = await redis("SET", [`claim:id:${claimId}`, String(now), "EX", 86400, "NX"]);
  if (dedup !== "OK") throw new HttpError(409, "This win was already paid");

  const ukey = `claim:user:${userId}`;
  const gkey = `claim:global`;
  const uDailyBase = keys.uDay === day ? Number((await redis("HGET", [ukey, "dailyVib"])) || 0) : 0;
  const uHourlyBase = keys.uHour === hour ? Number((await redis("HGET", [ukey, "hourlyClaims"])) || 0) : 0;
  const gDailyBase = keys.gDay === day ? Number((await redis("HGET", [gkey, "dailyVib"])) || 0) : 0;
  const gHourlyBase = keys.gHour === hour ? Number((await redis("HGET", [gkey, "hourlyClaims"])) || 0) : 0;

  await redis("HSET", [ukey, "day", day, "dailyVib", String(uDailyBase + amount),
    "hour", String(hour), "hourlyClaims", String(uHourlyBase + 1), "lastClaimAt", String(now)]);
  await redis("EXPIRE", [ukey, 172800]);
  await redis("HSET", [gkey, "day", day, "dailyVib", String(gDailyBase + amount),
    "hour", String(hour), "hourlyClaims", String(gHourlyBase + 1)]);
  await redis("EXPIRE", [gkey, 172800]);
}

// --- PAYOUT - ERC-20 transfer with a bounded confirmation wait ---
async function payPlayer(playerAddress, amount) {
  const amountWei = ethers.parseUnits(String(amount), tokenDecimals);
  const treasuryBalance = await token.balanceOf(treasury.address);
  if (treasuryBalance < amountWei) throw new HttpError(502, "Treasury $VIB balance is too low for this payout");

  const tx = await token.transfer(playerAddress, amountWei);
  const receipt = await Promise.race([
    tx.wait(1),
    new Promise((_, reject) =>
      setTimeout(() => reject(new HttpError(502, "Transaction confirmation timed out")), TX_WAIT_TIMEOUT_MS)
    ),
  ]);
  if (!receipt) throw new HttpError(502, "Transaction was dropped before confirmation");
  return { txHash: tx.hash, blockNumber: receipt.blockNumber };
}

// --- IP RATE LIMIT (best-effort; per-instance) ---
async function checkIpRate(req) {
  const ip = (req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || "unknown")
    .split(",")[0].trim() || "unknown";
  const bkey = `claim:ip:${ip}`;
  const count = Number((await redis("INCR", [bkey])) || 0);
  if (count === 1) await redis("EXPIRE", [bkey, 60]);
  if (count > 40) throw new HttpError(429, "Too many requests from this IP");
}

// --- HANDLER ---
module.exports = async function handler(req, res) {
  const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  if (req.method === "GET") {
    await ensureInit();
    res.status(200).json({
      success: true,
      keyConfigured: Boolean(TREASURY_PRIVATE_KEY),
      authConfigured: Boolean(privyReady),
      chainReady,
      chainId: EXPECTED_CHAIN_ID,
      tokenAddress: TOKEN_ADDRESS,
      stateStore:
        UPSTASH_URL && UPSTASH_TOKEN ? "upstash" : "unconfigured",
      ...(UPSTASH_URL && !UPSTASH_TOKEN
        ? { stateStoreError: "UPSTASH_REDIS_REST_TOKEN missing" }
        : {}),
      ...(!UPSTASH_URL && UPSTASH_TOKEN
        ? { stateStoreError: "UPSTASH_REDIS_REST_URL missing" }
        : {}),
      ...(!UPSTASH_URL && !UPSTASH_TOKEN
        ? { stateStoreError: "both Upstash env vars missing" }
        : {}),
      ...(initError ? { error: initError } : {}),
      ...(privyError ? { authError: privyError } : {}),
    });
    return;
  }

  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  try {
    await ensureInit();
    if (initError || !chainReady) throw new HttpError(503, initError || "Relayer chain is not ready");
    if (!privyReady) throw new HttpError(503, privyError || "Privy auth not configured");

    await checkIpRate(req);

    const authHeader = req.headers.authorization || "";
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    if (!accessToken) throw new HttpError(401, "Missing Privy access token");

    const claims = await verifyPrivyToken(accessToken);
    const userId = claims.user_id;
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const { playerAddress, amount, claimId } = payload;

    if (typeof playerAddress !== "string" || !ethers.isAddress(playerAddress))
      throw new HttpError(400, "Invalid playerAddress");
    const numericAmount = Number(amount);
    if (!Number.isInteger(numericAmount) || numericAmount <= 0 || numericAmount > MAX_AMOUNT)
      throw new HttpError(400, `amount must be a whole number between 1 and ${MAX_AMOUNT}`);
    if (typeof claimId !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(claimId))
      throw new HttpError(400, "Invalid claimId");

    const user = await getPrivyUser(userId);
    assertWalletOwned(user, playerAddress);

    const existing = await redis("GET", [`claim:id:${claimId}`]);
    if (existing) throw new HttpError(409, "This win was already paid");

    const keys = await checkLimits(userId, numericAmount);
    const payout = await payPlayer(playerAddress, numericAmount);
    await recordClaim(userId, numericAmount, claimId, keys);

    console.log(`[relayer] paid ${numericAmount} VIB to ${playerAddress} (user ${userId}) in ${payout.txHash}`);
    res.status(200).json({ success: true, txHash: payout.txHash, blockNumber: payout.blockNumber });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err && err.message ? err.message : "Relayer error";
    console.error(`[relayer] ${status}: ${message}`);
    res.status(status).json({ success: false, error: message });
  }
};
