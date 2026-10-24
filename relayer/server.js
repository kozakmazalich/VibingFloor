/**
 * ROBINHOOD TESTNET TREASURY RELAYER
 * ----------------------------------
 * Signs ERC-20 `transfer(player, amount)` with the treasury key so the key
 * never reaches the browser.
 *
 * Security model:
 *   - Every payout requires a valid Privy access token (Bearer JWT).
 *   - The recipient must be an Ethereum wallet linked to that Privy user.
 *   - Per-user and global hourly/daily limits, plus claim-id deduplication.
 *   - Chain ID and token contract are verified at startup.
 *   - The relayer binds to 127.0.0.1 by default. Put it behind a tunnel or a
 *     reverse proxy; never expose the bare port to the internet.
 *
 * Run:
 *   node relayer/server.js
 *
 * Reads the repo-root `.env`:
 *   TREASURY_PRIVATE_KEY=0x...
 *   RPC_URL=https://rpc.testnet.chain.robinhood.com
 *   PRIVY_APP_ID=...
 *   PRIVY_APP_SECRET=...
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { ethers } = require("ethers");
const { PrivyClient } = require("@privy-io/node");

loadDotEnv(path.join(__dirname, "..", ".env"));

const PORT = Number(process.env.RELAYER_PORT || 3001);
const HOST = process.env.RELAYER_HOST || "127.0.0.1";
const RPC_URL = process.env.RPC_URL || "";
const TREASURY_PRIVATE_KEY = normalizePrivateKey(process.env.TREASURY_PRIVATE_KEY || "");
const TOKEN_ADDRESS =
  process.env.TOKEN_ADDRESS || "0x462cE9fA227aB2CA44C66323B8fD4c3e078072ED";

const PRIVY_APP_ID = process.env.PRIVY_APP_ID || "";
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || "";

const EXPECTED_CHAIN_ID = Number(process.env.EXPECTED_CHAIN_ID || 46630);
const MAX_AMOUNT = 1_000_000;
const MIN_CLAIM_INTERVAL_MS = Number(process.env.RELAYER_COOLDOWN_MS || 3000);
const MAX_CLAIMS_PER_HOUR = Number(process.env.RELAYER_MAX_CLAIMS_PER_HOUR || 12);
const MAX_DAILY_VIB = Number(process.env.RELAYER_MAX_DAILY_VIB || 10_000_000);
const MAX_GLOBAL_CLAIMS_PER_HOUR = Number(
  process.env.RELAYER_MAX_GLOBAL_CLAIMS_PER_HOUR || 60
);
const MAX_GLOBAL_DAILY_VIB = Number(
  process.env.RELAYER_MAX_GLOBAL_DAILY_VIB || 25_000_000
);

const MAX_BODY_BYTES = 8 * 1024;
const IP_REQUESTS_PER_MINUTE = 40;
const STORE_PATH = path.join(__dirname, "data", "claims.json");

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

let provider = null;
let treasury = null;
let token = null;
let tokenDecimals = 18;
let decimalsLoaded = false;
let initError = null;
let chainReady = false;
let chainId = null;

let privy = null;
let privyError = null;

const userCache = new Map(); // userId -> { user, expiresAt }
const tokenCache = new Map(); // sha256(token) -> { claims, expiresAt }
const ipBuckets = new Map();
let claimQueue = Promise.resolve();

const store = loadStore();

// ============================================================================
// ENV + CHAIN SETUP
// ============================================================================
function loadDotEnv(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 0) continue;
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (err) {
    console.warn(`[relayer] could not read .env: ${err.message}`);
  }
}

function normalizePrivateKey(value) {
  const key = String(value || "").trim();
  return /^[0-9a-fA-F]{64}$/.test(key) ? `0x${key}` : key;
}

function initChain() {
  if (!TREASURY_PRIVATE_KEY) {
    initError = "TREASURY_PRIVATE_KEY is not set in .env";
    return;
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(TREASURY_PRIVATE_KEY)) {
    initError = "TREASURY_PRIVATE_KEY must be a 32-byte hex private key";
    return;
  }
  if (!RPC_URL) {
    initError = "RPC_URL is not set in .env";
    return;
  }

  try {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    treasury = new ethers.Wallet(TREASURY_PRIVATE_KEY, provider);
    token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, treasury);
  } catch (err) {
    initError = `Treasury init failed: ${err.message}`;
  }
}

function initPrivy() {
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    privyError = "PRIVY_APP_ID / PRIVY_APP_SECRET are not set in .env";
    return;
  }
  try {
    privy = new PrivyClient({ appId: PRIVY_APP_ID, appSecret: PRIVY_APP_SECRET });
  } catch (err) {
    privyError = `Privy init failed: ${err.message}`;
  }
}

async function validateChain() {
  if (!token) return;
  try {
    const network = await provider.getNetwork();
    chainId = Number(network.chainId);
    if (chainId !== EXPECTED_CHAIN_ID) {
      initError = `RPC chain ID ${chainId} does not match expected ${EXPECTED_CHAIN_ID}`;
      console.error(`[relayer] ${initError}`);
      return;
    }

    const code = await provider.getCode(TOKEN_ADDRESS);
    if (!code || code === "0x") {
      initError = "Token contract not found on this chain";
      console.error(`[relayer] ${initError}`);
      return;
    }

    chainReady = true;
    console.log(`[relayer] chain ${chainId} verified, token ${TOKEN_ADDRESS}`);
  } catch (err) {
    initError = `Chain validation failed: ${err.message}`;
    console.error(`[relayer] ${initError}`);
  }
}

async function getDecimals() {
  if (decimalsLoaded) return tokenDecimals;
  try {
    const value = Number(await token.decimals());
    if (Number.isFinite(value) && value >= 0 && value <= 36) tokenDecimals = value;
  } catch {
    tokenDecimals = 18;
  }
  decimalsLoaded = true;
  return tokenDecimals;
}

// ============================================================================
// CLAIM STORE (per-user + global limits, claim-id dedupe)
// ============================================================================
function emptyStore() {
  return {
    version: 1,
    claims: {},
    users: {},
    global: { day: "", dailyVib: 0, hour: 0, hourlyClaims: 0 },
  };
}

function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const next = emptyStore();
    if (parsed && typeof parsed === "object") {
      next.claims = parsed.claims && typeof parsed.claims === "object" ? parsed.claims : {};
      next.users = parsed.users && typeof parsed.users === "object" ? parsed.users : {};
      next.global = { ...next.global, ...(parsed.global || {}) };
    }
    pruneClaims(next);
    return next;
  } catch {
    return emptyStore();
  }
}

function saveStore() {
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    const tmp = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store));
    fs.renameSync(tmp, STORE_PATH);
  } catch (err) {
    console.error(`[relayer] could not persist claim store: ${err.message}`);
  }
}

function pruneClaims(target = store) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, timestamp] of Object.entries(target.claims)) {
    if (!Number.isFinite(timestamp) || timestamp < cutoff) delete target.claims[id];
  }
}

function dayKey(now) {
  return new Date(now).toISOString().slice(0, 10);
}

function hourKey(now) {
  return Math.floor(now / 3600000);
}

function checkLimits(userId, amount) {
  const now = Date.now();
  const day = dayKey(now);
  const hour = hourKey(now);

  const user = store.users[userId] || {
    day,
    dailyVib: 0,
    hour,
    hourlyClaims: 0,
    lastClaimAt: 0,
  };
  if (user.day !== day) {
    user.day = day;
    user.dailyVib = 0;
  }
  if (user.hour !== hour) {
    user.hour = hour;
    user.hourlyClaims = 0;
  }

  if (now - (user.lastClaimAt || 0) < MIN_CLAIM_INTERVAL_MS) {
    throw new HttpError(429, "Claim cooldown: try again in a moment");
  }
  if (user.hourlyClaims >= MAX_CLAIMS_PER_HOUR) {
    throw new HttpError(429, "Hourly claim limit reached for this account");
  }
  if (user.dailyVib + amount > MAX_DAILY_VIB) {
    throw new HttpError(429, "Daily $VIB limit reached for this account");
  }

  const global = store.global;
  if (global.day !== day) {
    global.day = day;
    global.dailyVib = 0;
  }
  if (global.hour !== hour) {
    global.hour = hour;
    global.hourlyClaims = 0;
  }
  if (global.hourlyClaims >= MAX_GLOBAL_CLAIMS_PER_HOUR) {
    throw new HttpError(429, "Global hourly claim limit reached");
  }
  if (global.dailyVib + amount > MAX_GLOBAL_DAILY_VIB) {
    throw new HttpError(429, "Global daily payout limit reached");
  }

  store.users[userId] = user;
}

function recordClaim(userId, amount, claimId) {
  const now = Date.now();
  const user = store.users[userId];

  user.lastClaimAt = now;
  user.hourlyClaims += 1;
  user.dailyVib += amount;

  store.global.hourlyClaims += 1;
  store.global.dailyVib += amount;
  store.claims[claimId] = now;

  pruneClaims();
  saveStore();
}

function withClaimLock(fn) {
  const run = claimQueue.then(fn, fn);
  claimQueue = run.catch(() => {});
  return run;
}

// ============================================================================
// PRIVY AUTH
// ============================================================================
function hashToken(tokenString) {
  return crypto.createHash("sha256").update(tokenString).digest("hex");
}

async function verifyPrivyToken(tokenString) {
  if (!privy) {
    throw new HttpError(503, privyError || "Privy is not configured");
  }

  const key = hashToken(tokenString);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.claims;

  try {
    const claims = await privy.utils().auth().verifyAccessToken(tokenString);
    if (claims.app_id !== PRIVY_APP_ID) {
      throw new Error("Token audience does not match this app");
    }

    const expirationMs =
      claims.expiration > 1e12 ? claims.expiration : claims.expiration * 1000;
    tokenCache.set(key, { claims, expiresAt: expirationMs });
    if (tokenCache.size > 500) {
      const now = Date.now();
      for (const [cacheKey, entry] of tokenCache) {
        if (entry.expiresAt <= now) tokenCache.delete(cacheKey);
      }
    }
    return claims;
  } catch (err) {
    console.warn(`[relayer] access token rejected: ${err.message}`);
    throw new HttpError(401, "Invalid or expired Privy session");
  }
}

async function getPrivyUser(userId) {
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  try {
    const user = await privy.users()._get(userId);
    userCache.set(userId, { user, expiresAt: Date.now() + 60_000 });
    return user;
  } catch (err) {
    console.error(`[relayer] could not load Privy user: ${err.message}`);
    throw new HttpError(502, "Could not load the Privy user");
  }
}

function assertWalletOwned(user, address) {
  const wallets = (user.linked_accounts || [])
    .filter(
      (account) =>
        account &&
        account.type === "wallet" &&
        account.chain_type === "ethereum" &&
        typeof account.address === "string"
    )
    .map((account) => account.address.toLowerCase());

  if (!wallets.includes(address.toLowerCase())) {
    throw new HttpError(403, "Wallet is not linked to this Privy account");
  }
}

// ============================================================================
// HTTP
// ============================================================================
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  if (origin === "https://vibing-floor.vercel.app") return true;

  const extra = (process.env.RELAYER_ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return extra.includes(origin);
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let done = false;

    req.on("data", (chunk) => {
      if (done) return;
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        done = true;
        reject(new HttpError(413, "Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (done) return;
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new HttpError(400, "Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function checkIpRate(req) {
  const forwarded = req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"];
  const ip = String(forwarded || req.socket.remoteAddress || "unknown")
    .split(",")[0]
    .trim();

  const now = Date.now();
  const bucket = ipBuckets.get(ip) || { count: 0, resetAt: now + 60_000 };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + 60_000;
  }
  bucket.count += 1;
  ipBuckets.set(ip, bucket);

  if (ipBuckets.size > 2000) {
    for (const [key, value] of ipBuckets) {
      if (value.resetAt <= now) ipBuckets.delete(key);
    }
  }

  if (bucket.count > IP_REQUESTS_PER_MINUTE) {
    throw new HttpError(429, "Too many requests from this IP");
  }
}

async function payPlayer(playerAddress, amount) {
  const decimals = await getDecimals();
  const amountWei = ethers.parseUnits(String(amount), decimals);

  const treasuryBalance = await token.balanceOf(treasury.address);
  if (treasuryBalance < amountWei) {
    throw new HttpError(502, "Treasury $VIB balance is too low for this payout");
  }

  const tx = await token.transfer(playerAddress, amountWei);
  const receipt = await tx.wait(1);
  if (!receipt) throw new HttpError(502, "Transaction was dropped before confirmation");

  return { txHash: tx.hash, blockNumber: receipt.blockNumber };
}

async function handleClaim(req, res) {
  checkIpRate(req);

  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!accessToken) {
    throw new HttpError(401, "Missing Privy access token");
  }

  if (initError || !chainReady) {
    throw new HttpError(503, initError || "Relayer chain is not ready");
  }

  const claims = await verifyPrivyToken(accessToken);
  const userId = claims.user_id;

  const payload = await readJsonBody(req);
  const { playerAddress, amount, claimId } = payload;

  if (typeof playerAddress !== "string" || !ethers.isAddress(playerAddress)) {
    throw new HttpError(400, "Invalid playerAddress");
  }
  const numericAmount = Number(amount);
  if (
    !Number.isInteger(numericAmount) ||
    numericAmount <= 0 ||
    numericAmount > MAX_AMOUNT
  ) {
    throw new HttpError(
      400,
      `amount must be a whole number between 1 and ${MAX_AMOUNT}`
    );
  }
  if (typeof claimId !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(claimId)) {
    throw new HttpError(400, "Invalid claimId");
  }

  const user = await getPrivyUser(userId);
  assertWalletOwned(user, playerAddress);

  const result = await withClaimLock(async () => {
    if (store.claims[claimId]) {
      throw new HttpError(409, "This win was already paid");
    }

    checkLimits(userId, numericAmount);
    const payout = await payPlayer(playerAddress, numericAmount);
    recordClaim(userId, numericAmount, claimId);
    return payout;
  });

  console.log(
    `[relayer] paid ${numericAmount} VIB to ${playerAddress} (user ${userId}) in ${result.txHash}`
  );
  sendJson(res, 200, {
    success: true,
    txHash: result.txHash,
    blockNumber: result.blockNumber,
  });
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, {
      success: true,
      keyConfigured: Boolean(treasury),
      authConfigured: Boolean(privy),
      chainReady,
      chainId,
      expectedChainId: EXPECTED_CHAIN_ID,
      tokenAddress: TOKEN_ADDRESS,
      host: HOST,
      port: PORT,
      limits: {
        maxAmount: MAX_AMOUNT,
        cooldownMs: MIN_CLAIM_INTERVAL_MS,
        maxClaimsPerHour: MAX_CLAIMS_PER_HOUR,
        maxDailyVib: MAX_DAILY_VIB,
        maxGlobalClaimsPerHour: MAX_GLOBAL_CLAIMS_PER_HOUR,
        maxGlobalDailyVib: MAX_GLOBAL_DAILY_VIB,
      },
      ...(initError ? { error: initError } : {}),
      ...(privyError ? { authError: privyError } : {}),
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/claim-drum") {
    try {
      await handleClaim(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { success: false, error: err.message });
      } else {
        console.error(`[relayer] payout failed: ${err.message}`);
        sendJson(res, 502, {
          success: false,
          error: err.shortMessage || err.message || "Payout failed",
        });
      }
    }
    return;
  }

  sendJson(res, 404, { success: false, error: "Not found" });
});

initChain();
initPrivy();

server.listen(PORT, HOST, () => {
  console.log(`[relayer] listening on http://${HOST}:${PORT}`);
  if (initError) console.warn(`[relayer] payouts disabled: ${initError}`);
  else console.log(`[relayer] treasury address: ${treasury.address}`);
  if (privyError) console.warn(`[relayer] auth disabled: ${privyError}`);
  validateChain();
});

function shutdown() {
  console.log("\n[relayer] shutting down");
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
