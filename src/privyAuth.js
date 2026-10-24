/**
 * PRIVY EMAIL AUTH & ROBINHOOD TESTNET TOKEN PAYOUT
 * -------------------------------------------------
 * Optional login. Guest mode is the default and never changes game state.
 *
 * Logged in:
 *   Privy email OTP -> embedded EVM wallet -> treasury relayer pays won $VIB
 *   to that wallet on Robinhood Testnet -> balanceOf is synced into the
 *   existing profile state via the callback passed to initPrivyAuth().
 *
 * Security:
 *   - The treasury key lives only in the relayer's `.env`, never in the browser.
 *   - No deterministic/derived private keys are created here.
 *   - Privy App ID / Client ID are public identifiers (src/privyConfig.js).
 */

import {
  PRIVY_APP_ID,
  PRIVY_CLIENT_ID,
  PRIVY_SDK_URL,
  ETHERS_URL,
  TOKEN_ADDRESS,
  TOKEN_DECIMALS,
  ROBINHOOD_RPC_URL,
  RELAYER_URL,
} from "./privyConfig.js";

const SESSION_KEY = "vib_privy_session_v1";
const MAX_WIN_PER_SPIN = 1_000_000;

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

// ============================================================================
// STATE
// ============================================================================
const authState = {
  isAuthenticated: false,
  email: null,
  walletAddress: null,
  onChainBalance: 0,
  balanceKnown: false,
};

let onBalanceSyncCallback = null;
let statusBadgeEl = null;
let modalEl = null;
let modalMode = "closed"; // 'closed' | 'email' | 'code' | 'account' | 'config'

let privyClient = null;
let privySdk = null;
let privyInitPromise = null;
let privyIframe = null;
let privyMessageListener = null;
let pendingEmail = "";

let ethersMod = null;
let readContract = null;
let tokenDecimals = TOKEN_DECIMALS;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Mount the top-right login badge and restore an existing session.
 *
 * @param {(balance:number, walletAddress:string) => void} [onBalanceSync]
 *   Receives the on-chain balance so the existing profile state can show it.
 */
export function initPrivyAuth(onBalanceSync = null) {
  onBalanceSyncCallback = typeof onBalanceSync === "function" ? onBalanceSync : null;
  injectStyles();
  ensureBadge();
  restoreLocalSession();
  updateBadge();

  if (authState.walletAddress) {
    refreshRobinhoodTokenBalance();
    if (PRIVY_APP_ID) reconcilePrivySession();
  }
}

export function isPlayerLoggedIn() {
  return authState.isAuthenticated && Boolean(authState.walletAddress);
}

export function getPlayerWeb3State() {
  return { ...authState };
}

/**
 * Call after a Prize Drum settle. Guests and zero wins are ignored.
 * Never throws: failures are reported with a toast and returned.
 */
export async function handlePrizeDrumWinPayout(wonAmount) {
  const amount = Number(wonAmount);

  if (!isPlayerLoggedIn()) {
    return { credited: false, reason: "GUEST_MODE" };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { credited: false, reason: "ZERO_WIN" };
  }
  if (amount > MAX_WIN_PER_SPIN) {
    return { credited: false, reason: "AMOUNT_ABOVE_DRUM_MAX" };
  }

  showToast(`Sending +${amount.toLocaleString("en-US")} $VIB on Robinhood Testnet...`, "#00e5ff");

  try {
    const client = await getPrivyClient();
    const accessToken = await client.getAccessToken();
    if (!accessToken) {
      throw new Error("No active Privy session. Please log in again.");
    }

    const claimId = makeClaimId();
    const response = await fetch(RELAYER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        playerAddress: authState.walletAddress,
        amount,
        claimId,
      }),
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { error: raw || `HTTP ${response.status}` };
    }

    if (!response.ok || !data.success) {
      throw new Error(data.error || `Relayer HTTP ${response.status}`);
    }

    showToast(
      `+${amount.toLocaleString("en-US")} $VIB credited - tx ${String(data.txHash).slice(0, 10)}...`,
      "#39ff14"
    );
    await refreshRobinhoodTokenBalance();

    return {
      credited: true,
      txHash: data.txHash,
      newBalance: authState.onChainBalance,
    };
  } catch (err) {
    const message = err && err.message ? err.message : "Unknown relayer error";
    console.error("[VIB Web3] Payout failed:", message);
    showToast(`Testnet payout failed: ${message}`, "#ff2d95");
    return { credited: false, error: message };
  }
}

// The name used by the game integration.
export const creditWinToPrivyWallet = handlePrizeDrumWinPayout;

/**
 * Read balanceOf for the logged-in wallet and push it to the profile state.
 * Returns the cached balance when RPC is unavailable.
 */
export async function refreshRobinhoodTokenBalance() {
  if (!authState.walletAddress) return 0;

  try {
    const { contract, formatUnits } = await getReadContract();
    if (!Number.isFinite(tokenDecimals) || tokenDecimals <= 0) {
      try {
        tokenDecimals = Number(await contract.decimals());
      } catch {
        tokenDecimals = TOKEN_DECIMALS;
      }
    }

    const rawBalance = await contract.balanceOf(authState.walletAddress);
    const formatted = Number(formatUnits(rawBalance, tokenDecimals));

    authState.onChainBalance = Number.isFinite(formatted) ? formatted : 0;
    authState.balanceKnown = true;
    updateBadge();
    if (modalMode === "account") renderAccountStep();

    if (typeof onBalanceSyncCallback === "function") {
      onBalanceSyncCallback(authState.onChainBalance, authState.walletAddress);
    }
    return authState.onChainBalance;
  } catch (err) {
    // A placeholder RPC or an offline dev machine is non-fatal for guest play.
    console.warn("[VIB Web3] Balance read failed:", err && err.message ? err.message : err);
    updateBadge();
    return authState.onChainBalance;
  }
}

// ============================================================================
// PRIVY CLIENT & SESSION
// ============================================================================
async function getPrivyClient() {
  if (privyClient) return privyClient;
  if (!PRIVY_APP_ID) {
    throw new Error("Privy is not configured. Add PRIVY_APP_ID in src/privyConfig.js.");
  }

  if (!privyInitPromise) {
    privyInitPromise = (async () => {
      const mod = await import(PRIVY_SDK_URL);
      const Privy = mod.default;
      const client = new Privy({
        appId: PRIVY_APP_ID,
        ...(PRIVY_CLIENT_ID ? { clientId: PRIVY_CLIENT_ID } : {}),
        storage: new mod.LocalStorage(),
      });
      await client.initialize();
      privySdk = mod;
      privyClient = client;
      mountSecureContext(client);
      return client;
    })().catch((err) => {
      privyInitPromise = null;
      throw err;
    });
  }

  return privyInitPromise;
}

/**
 * Privy's embedded wallet key material lives in a secure iframe. Mounting it
 * lets the SDK create a wallet for users who logged in through loginWithCode
 * (Privy's automatic createOnLogin only applies to its own modal).
 */
function mountSecureContext(client) {
  if (privyIframe) return;

  try {
    const iframe = document.createElement("iframe");
    iframe.src = client.embeddedWallet.getURL();
    iframe.style.display = "none";
    iframe.setAttribute("aria-hidden", "true");
    iframe.title = "Privy secure wallet context";
    document.body.appendChild(iframe);

    client.setMessagePoster(iframe.contentWindow);
    const listener = (event) => {
      if (event.source !== iframe.contentWindow) return;
      let data = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      client.embeddedWallet.onMessage(data);
    };
    window.addEventListener("message", listener);

    privyIframe = iframe;
    privyMessageListener = listener;
  } catch (err) {
    console.warn("[VIB Web3] Privy secure context unavailable:", err && err.message ? err.message : err);
  }
}

async function reconcilePrivySession() {
  try {
    const client = await getPrivyClient();
    const { user } = await client.user.get();
    if (!user) {
      clearLocalSession();
      return;
    }
    applyPrivyUser(user, true);
    await refreshRobinhoodTokenBalance();
  } catch (err) {
    // Keep the locally stored address if Privy is unreachable; payouts still work.
    console.warn("[VIB Web3] Privy session restore skipped:", err && err.message ? err.message : err);
  }
}

function applyPrivyUser(user, persist) {
  const wallet = findWalletAddress(user);
  if (!wallet) return false;

  authState.isAuthenticated = true;
  authState.email = findEmail(user) || authState.email;
  authState.walletAddress = wallet;
  if (persist) saveLocalSession();
  updateBadge();
  return true;
}

function findEmail(user) {
  const accounts = Array.isArray(user && user.linked_accounts) ? user.linked_accounts : [];
  const emailAccount = accounts.find((a) => a && a.type === "email");
  if (emailAccount) return emailAccount.address || emailAccount.email || null;
  if (user && user.email && typeof user.email.address === "string") return user.email.address;
  return null;
}

function findWalletAddress(user) {
  try {
    if (privySdk && typeof privySdk.getUserEmbeddedEthereumWallet === "function") {
      const wallet = privySdk.getUserEmbeddedEthereumWallet(user);
      if (wallet && typeof wallet.address === "string") return wallet.address;
    }
  } catch {
    /* fall through to linked_accounts */
  }

  const accounts = Array.isArray(user && user.linked_accounts) ? user.linked_accounts : [];
  const walletAccount = accounts.find(
    (a) => a && a.type === "wallet" && (!a.chain_type || a.chain_type === "ethereum")
  );
  return walletAccount && typeof walletAccount.address === "string" ? walletAccount.address : null;
}

function saveLocalSession() {
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ email: authState.email, walletAddress: authState.walletAddress })
    );
  } catch {
    /* storage can be blocked */
  }
}

function restoreLocalSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (typeof parsed.walletAddress === "string" && /^0x[a-fA-F0-9]{40}$/.test(parsed.walletAddress)) {
      authState.isAuthenticated = true;
      authState.email = typeof parsed.email === "string" ? parsed.email : null;
      authState.walletAddress = parsed.walletAddress;
    }
  } catch {
    /* ignore corrupt storage */
  }
}

function clearLocalSession() {
  authState.isAuthenticated = false;
  authState.email = null;
  authState.walletAddress = null;
  authState.onChainBalance = 0;
  authState.balanceKnown = false;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  updateBadge();
}

async function logout() {
  try {
    if (privyClient) {
      const { user } = await privyClient.user.get();
      if (user) await privyClient.auth.logout({ userId: user.id });
    }
  } catch (err) {
    console.warn("[VIB Web3] Privy logout warning:", err && err.message ? err.message : err);
  }
  clearLocalSession();
  closeModal();
  showToast("Logged out - guest mode active.", "#7a8299");
}

// ============================================================================
// EMAIL OTP FLOW
// ============================================================================
async function sendLoginCode(email) {
  const client = await getPrivyClient();
  await client.auth.email.sendCode(email);
}

async function verifyLoginCode(email, code) {
  const client = await getPrivyClient();
  const session = await client.auth.email.loginWithCode(email, code);

  let user = session && session.user;
  if (!user) {
    const current = await client.user.get();
    user = current && current.user;
  }
  if (!user) throw new Error("Privy did not return a user.");

  // Dashboard auto-creation is preferred; this is a fallback for existing apps.
  if (!findWalletAddress(user)) {
    try {
      const created = await Promise.race([
        client.embeddedWallet.create({}),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Wallet creation timed out")), 12000)),
      ]);
      user = (created && created.user) || user;
      if (!findWalletAddress(user)) {
        const current = await client.user.get();
        user = (current && current.user) || user;
      }
    } catch (err) {
      console.warn("[VIB Web3] Embedded wallet creation failed:", err && err.message ? err.message : err);
    }
  }

  const wallet = findWalletAddress(user);
  if (!wallet) {
    throw new Error(
      "No embedded wallet found. Enable automatic embedded wallet creation for this Privy app."
    );
  }

  authState.isAuthenticated = true;
  authState.email = findEmail(user) || email;
  authState.walletAddress = wallet;
  saveLocalSession();
  updateBadge();
  closeModal();
  showToast(`Wallet connected: ${shortAddress(wallet)}`, "#39ff14");
  await refreshRobinhoodTokenBalance();
}

// ============================================================================
// BALANCE READ
// ============================================================================
async function getEthers() {
  if (!ethersMod) ethersMod = await import(ETHERS_URL);
  return ethersMod;
}

async function getReadContract() {
  const mod = await getEthers();
  if (!readContract) {
    const provider = new mod.JsonRpcProvider(ROBINHOOD_RPC_URL);
    readContract = new mod.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);
  }
  return { contract: readContract, formatUnits: mod.formatUnits };
}

// ============================================================================
// UI
// ============================================================================
function ensureBadge() {
  if (statusBadgeEl) return;
  statusBadgeEl = createBadge("vib-privy-badge");
  document.body.appendChild(statusBadgeEl);
}

function createBadge(className) {
  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = className;
  badge.setAttribute("aria-label", "Privy email login or sign up");
  badge.addEventListener("click", () => {
    if (authState.isAuthenticated) renderAccountStep();
    else renderEmailStep();
  });
  return badge;
}

function updateBadge() {
  if (!statusBadgeEl) return;

  const connected = authState.isAuthenticated;
  const label = connected
    ? `🟢 ${shortAddress(authState.walletAddress)} | ${
        authState.balanceKnown ? formatBalance(authState.onChainBalance) : "..."
      } $VIB`
    : "📧 LOGIN / SIGN UP (PRIVY)";
  const title = connected
    ? "Privy wallet - click for account"
    : "Optional: log in or create an account";

  statusBadgeEl.textContent = label;
  statusBadgeEl.classList.toggle("is-connected", connected);
  statusBadgeEl.title = title;
}

function ensureModal() {
  if (modalEl) return;
  modalEl = document.createElement("div");
  modalEl.className = "vib-privy-modal";
  modalEl.hidden = true;
  modalEl.innerHTML = `<div class="vib-privy-card" role="dialog" aria-modal="true"><div class="vib-privy-body"></div></div>`;
  modalEl.addEventListener("click", (event) => {
    if (event.target === modalEl) closeModal();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modalEl && !modalEl.hidden) closeModal();
  });
  document.body.appendChild(modalEl);
}

function openModal(mode, html) {
  ensureModal();
  modalMode = mode;
  modalEl.querySelector(".vib-privy-body").innerHTML = html;
  modalEl.hidden = false;
}

function closeModal() {
  if (!modalEl) return;
  modalMode = "closed";
  modalEl.hidden = true;
  modalEl.querySelector(".vib-privy-body").innerHTML = "";
}

function renderEmailStep(error = "") {
  if (!PRIVY_APP_ID) {
    renderConfigStep();
    return;
  }

  openModal(
    "email",
    `
    <div class="vib-privy-kicker">PRIVY EMBEDDED WALLET</div>
    <h2 class="vib-privy-title">LOGIN WITH EMAIL</h2>
    <p class="vib-privy-copy">
      Optional. Privy creates an embedded wallet so Prize Drum wins can be paid
      on Robinhood Testnet. New emails create an account automatically. You can
      keep playing as a guest.
    </p>
    <div class="vib-privy-error" id="vibPrivyError" ${error ? "" : "hidden"}></div>
    <input class="vib-privy-input" id="vibPrivyEmail" type="email" autocomplete="email"
      inputmode="email" placeholder="you@example.com" />
    <button class="vib-privy-btn" id="vibPrivySend" type="button">📧 SEND CODE</button>
    <button class="vib-privy-btn secondary" id="vibPrivyGuest" type="button">CONTINUE AS GUEST</button>
  `
  );

  const emailInput = modalEl.querySelector("#vibPrivyEmail");
  const errorEl = modalEl.querySelector("#vibPrivyError");
  if (error) errorEl.textContent = error;

  const submit = async () => {
    const email = emailInput.value.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      showModalError("Enter a valid email address.");
      return;
    }

    const button = modalEl.querySelector("#vibPrivySend");
    button.disabled = true;
    button.textContent = "SENDING CODE...";
    try {
      pendingEmail = email;
      await sendLoginCode(email);
      renderCodeStep();
      showToast(`Login code sent to ${email}`, "#00e5ff");
    } catch (err) {
      button.disabled = false;
      button.textContent = "📧 SEND CODE";
      showModalError(prettyError(err));
    }
  };

  modalEl.querySelector("#vibPrivySend").addEventListener("click", submit);
  emailInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submit();
  });
  modalEl.querySelector("#vibPrivyGuest").addEventListener("click", closeModal);
  emailInput.focus();
}

function renderCodeStep(error = "") {
  openModal(
    "code",
    `
    <div class="vib-privy-kicker">CHECK YOUR INBOX</div>
    <h2 class="vib-privy-title">ENTER THE CODE</h2>
    <p class="vib-privy-copy">
      We sent a one-time code to <b id="vibPrivyCodeEmail"></b>.
    </p>
    <div class="vib-privy-error" id="vibPrivyError" ${error ? "" : "hidden"}></div>
    <input class="vib-privy-input" id="vibPrivyCode" type="text" inputmode="numeric"
      autocomplete="one-time-code" maxlength="6" placeholder="123456" />
    <button class="vib-privy-btn" id="vibPrivyVerify" type="button">VERIFY & LOGIN</button>
    <button class="vib-privy-btn secondary" id="vibPrivyBack" type="button">CHANGE EMAIL</button>
    <button class="vib-privy-btn ghost" id="vibPrivyGuest" type="button">CONTINUE AS GUEST</button>
  `
  );

  modalEl.querySelector("#vibPrivyCodeEmail").textContent = pendingEmail;
  const errorEl = modalEl.querySelector("#vibPrivyError");
  if (error) errorEl.textContent = error;

  const codeInput = modalEl.querySelector("#vibPrivyCode");
  const submit = async () => {
    const code = codeInput.value.trim();
    if (!/^\d{4,8}$/.test(code)) {
      showModalError("Enter the code from your email.");
      return;
    }

    const button = modalEl.querySelector("#vibPrivyVerify");
    button.disabled = true;
    button.textContent = "VERIFYING...";
    try {
      await verifyLoginCode(pendingEmail, code);
    } catch (err) {
      button.disabled = false;
      button.textContent = "VERIFY & LOGIN";
      showModalError(prettyError(err));
    }
  };

  modalEl.querySelector("#vibPrivyVerify").addEventListener("click", submit);
  codeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submit();
  });
  modalEl.querySelector("#vibPrivyBack").addEventListener("click", () => renderEmailStep());
  modalEl.querySelector("#vibPrivyGuest").addEventListener("click", closeModal);
  codeInput.focus();
}

function renderAccountStep() {
  if (!authState.isAuthenticated) {
    renderEmailStep();
    return;
  }

  openModal(
    "account",
    `
    <div class="vib-privy-kicker">PRIVY EMBEDDED WALLET</div>
    <h2 class="vib-privy-title">WALLET CONNECTED</h2>
    <div class="vib-privy-rows">
      <div class="vib-privy-row"><span>EMAIL</span><b id="vibPrivyAccountEmail"></b></div>
      <div class="vib-privy-row"><span>WALLET</span><b id="vibPrivyAccountWallet"></b></div>
      <div class="vib-privy-row"><span>BALANCE</span><b id="vibPrivyAccountBalance"></b></div>
      <div class="vib-privy-row"><span>NETWORK</span><b>Robinhood Testnet</b></div>
    </div>
    <button class="vib-privy-btn" id="vibPrivyRefresh" type="button">REFRESH BALANCE</button>
    <button class="vib-privy-btn danger" id="vibPrivyLogout" type="button">LOG OUT</button>
    <button class="vib-privy-btn secondary" id="vibPrivyClose" type="button">CLOSE</button>
  `
  );

  modalEl.querySelector("#vibPrivyAccountEmail").textContent = authState.email || "-";
  modalEl.querySelector("#vibPrivyAccountWallet").textContent = authState.walletAddress || "-";
  modalEl.querySelector("#vibPrivyAccountBalance").textContent = authState.balanceKnown
    ? `${formatBalance(authState.onChainBalance)} $VIB`
    : "reading...";

  const refreshBtn = modalEl.querySelector("#vibPrivyRefresh");
  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "REFRESHING...";
    await refreshRobinhoodTokenBalance();
  });

  modalEl.querySelector("#vibPrivyLogout").addEventListener("click", async () => {
    const button = modalEl.querySelector("#vibPrivyLogout");
    button.disabled = true;
    button.textContent = "LOGGING OUT...";
    await logout();
  });
  modalEl.querySelector("#vibPrivyClose").addEventListener("click", closeModal);
}

function renderConfigStep() {
  openModal(
    "config",
    `
    <div class="vib-privy-kicker">CONFIGURATION REQUIRED</div>
    <h2 class="vib-privy-title">PRIVY IS NOT SET UP</h2>
    <p class="vib-privy-copy">
      Add your public <b>PRIVY_APP_ID</b> and <b>PRIVY_CLIENT_ID</b> to
      <b>src/privyConfig.js</b>, and allow this origin in the Privy dashboard.
      Guest mode and the Prize Drum already work without login.
    </p>
    <button class="vib-privy-btn secondary" id="vibPrivyClose" type="button">CLOSE</button>
  `
  );
  modalEl.querySelector("#vibPrivyClose").addEventListener("click", closeModal);
}

function showModalError(message) {
  if (!modalEl) return;
  const errorEl = modalEl.querySelector("#vibPrivyError");
  if (!errorEl) {
    showToast(message, "#ff2d95");
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = message;
}

// ============================================================================
// SMALL UTILITIES
// ============================================================================
function shortAddress(address) {
  if (!address) return "0x...";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function makeClaimId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `claim_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function formatBalance(value) {
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function prettyError(err) {
  const message = err && err.message ? String(err.message) : "Something went wrong";
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Privy request blocked. Check the allowed origins in the Privy dashboard.";
  }
  return message.replace(/^Error:\s*/i, "").slice(0, 220);
}

function showToast(message, color) {
  const toast = document.createElement("div");
  toast.className = "vib-privy-toast";
  toast.style.borderColor = color;
  toast.style.boxShadow = `0 0 20px ${color}44`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

function injectStyles() {
  if (document.getElementById("vib-privy-styles")) return;
  const style = document.createElement("style");
  style.id = "vib-privy-styles";
  style.textContent = `
    .vib-privy-badge {
      position: fixed;
      top: 84px;
      right: 24px;
      z-index: 9500;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 40px;
      padding: 10px 14px;
      background: rgba(5, 6, 15, 0.92);
      border: 1.5px solid #ff2d95;
      border-radius: 8px;
      box-shadow: 0 0 18px rgba(255, 45, 149, 0.28);
      color: #ffffff;
      font-family: 'Orbitron', 'Segoe UI', system-ui, sans-serif;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.6px;
      cursor: pointer;
      backdrop-filter: blur(8px);
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .vib-privy-badge:hover {
      transform: translateY(-1px);
      box-shadow: 0 0 26px rgba(0, 229, 255, 0.35);
    }
    .vib-privy-badge.is-connected {
      border-color: #39ff14;
      box-shadow: 0 0 18px rgba(57, 255, 20, 0.25);
      color: #d9ffe0;
    }
    body:has(#profile-overlay:not(.hidden)) .vib-privy-badge {
      display: none;
    }
    /* Start menu: pin the optional auth chip to the top-right corner. */
    body:has(#start-menu:not(.hidden)) .vib-privy-badge {
      top: 20px;
      right: 20px;
    }

    .vib-privy-modal[hidden] { display: none; }
    .vib-privy-modal {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(5, 6, 15, 0.82);
      backdrop-filter: blur(6px);
    }
    .vib-privy-card {
      width: 400px;
      max-width: 100%;
      max-height: calc(100vh - 40px);
      overflow-y: auto;
      padding: 26px;
      background: #080b1a;
      border: 2px solid #00e5ff;
      border-radius: 12px;
      box-shadow: 0 0 38px rgba(0, 229, 255, 0.3);
      color: #ffffff;
      font-family: 'Orbitron', 'Segoe UI', system-ui, sans-serif;
      text-align: center;
    }
    .vib-privy-kicker {
      margin-bottom: 6px;
      color: #ff2d95;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 2px;
    }
    .vib-privy-title {
      margin: 0 0 12px;
      color: #00e5ff;
      font-size: 20px;
      font-weight: 900;
      letter-spacing: 1px;
    }
    .vib-privy-copy {
      margin: 0 0 18px;
      color: #8b95b0;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 12px;
      line-height: 1.55;
    }
    .vib-privy-error[hidden] { display: none; }
    .vib-privy-error {
      display: block;
      margin: 0 0 12px;
      padding: 9px 11px;
      border: 1px solid rgba(255, 45, 149, 0.55);
      border-radius: 6px;
      background: rgba(255, 45, 149, 0.1);
      color: #ff8fc0;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      text-align: left;
    }
    .vib-privy-input {
      width: 100%;
      box-sizing: border-box;
      margin-bottom: 12px;
      padding: 12px 14px;
      background: #05060f;
      border: 1.5px solid #3a425e;
      border-radius: 6px;
      outline: none;
      color: #ffffff;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 14px;
    }
    .vib-privy-input:focus { border-color: #00e5ff; box-shadow: 0 0 0 2px rgba(0, 229, 255, 0.15); }
    .vib-privy-btn {
      width: 100%;
      min-height: 42px;
      margin-bottom: 9px;
      padding: 11px 14px;
      border: none;
      border-radius: 6px;
      background: linear-gradient(90deg, #00e5ff, #0099ff);
      color: #05060f;
      font-family: inherit;
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.8px;
      cursor: pointer;
      transition: filter 0.15s ease, opacity 0.15s ease;
    }
    .vib-privy-btn:hover:not(:disabled) { filter: brightness(1.1); }
    .vib-privy-btn:disabled { opacity: 0.55; cursor: wait; }
    .vib-privy-btn.secondary {
      background: transparent;
      border: 1px solid #283048;
      color: #8b95b0;
    }
    .vib-privy-btn.ghost {
      background: transparent;
      border: none;
      color: #586075;
      font-size: 10px;
    }
    .vib-privy-btn.danger {
      background: transparent;
      border: 1px solid rgba(255, 45, 149, 0.6);
      color: #ff8fc0;
    }
    .vib-privy-rows {
      margin-bottom: 16px;
      padding: 12px;
      border: 1px solid #1b2440;
      border-radius: 8px;
      background: #05060f;
      text-align: left;
    }
    .vib-privy-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 6px 0;
      font-family: 'Courier New', monospace;
      font-size: 11px;
    }
    .vib-privy-row span { color: #586075; letter-spacing: 1px; }
    .vib-privy-row b { color: #00e5ff; word-break: break-all; text-align: right; }
    .vib-privy-toast {
      position: fixed;
      right: 24px;
      bottom: 96px;
      z-index: 10001;
      max-width: min(360px, calc(100vw - 48px));
      padding: 12px 16px;
      border: 1.5px solid #00e5ff;
      border-radius: 8px;
      background: rgba(8, 11, 26, 0.96);
      color: #ffffff;
      font-family: 'Orbitron', monospace, sans-serif;
      font-size: 11px;
      line-height: 1.45;
      transition: opacity 0.3s ease, transform 0.3s ease;
    }
    .vib-privy-toast.is-leaving { opacity: 0; transform: translateY(6px); }

    @media (max-width: 720px) {
      .vib-privy-badge {
        top: 74px;
        right: 12px;
        padding: 8px 10px;
        font-size: 10px;
      }
      body:has(#start-menu:not(.hidden)) .vib-privy-badge {
        top: 12px;
        right: 12px;
      }
      .vib-privy-card { padding: 20px; }
      .vib-privy-toast { right: 12px; bottom: 84px; }
    }
  `;
  document.head.appendChild(style);
}
