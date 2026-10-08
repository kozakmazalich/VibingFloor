/**
 * Minimal Mobile Wallet Adapter hook (Seed Vault).
 *
 * CRITICAL: crypto is OPTIONAL and INVISIBLE.
 * - No imports, no dependencies: the native bridge is `window.Capacitor.Plugins.MwaPlugin`,
 *   which only exists inside the Capacitor Android WebView.
 * - In a plain browser `window.Capacitor` is undefined, so every function here
 *   returns a graceful result and the game plays exactly the same.
 * - Nothing runs until the user explicitly taps CONNECT WALLET.
 */

export const walletState = {
  status: "disconnected", // disconnected | connected
  address: "",
  displayAddress: "",
};

function shorten(address) {
  return address.length > 9 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

/** Returns the native MWA bridge, or null outside the Android app. */
function nativeMwa() {
  try {
    const cap = window.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return null;
    const plugin = cap.Plugins && cap.Plugins.MwaPlugin;
    return plugin && typeof plugin.connect === "function" ? plugin : null;
  } catch {
    return null;
  }
}

/** True when the app runs inside the Capacitor Android build with the MWA plugin. */
export function isWalletCapable() {
  return !!nativeMwa();
}

/** Opens Seed Vault (or another MWA wallet) and authorizes the app. */
export async function connectWallet() {
  const mwa = nativeMwa();
  if (!mwa) {
    return { ok: false, reason: "web" }; // browser: wallet unavailable, silently
  }
  try {
    const res = await mwa.connect();
    if (res && res.ok && res.address) {
      walletState.address = res.address;
      walletState.displayAddress = shorten(res.address);
      walletState.status = "connected";
      return { ok: true, address: res.address };
    }
    return { ok: false, reason: (res && res.reason) || "rejected" };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  }
}

/** Signs a short memo (e.g. a round win) with the connected wallet. */
export async function signWinMessage(message) {
  const mwa = nativeMwa();
  if (!mwa || !walletState.address) {
    return { ok: false, reason: "not-connected" };
  }
  try {
    const bytes = new TextEncoder().encode(message);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const payloadBase64 = btoa(binary);
    const res = await mwa.signMessage({ address: walletState.address, payloadBase64 });
    return {
      ok: !!(res && res.ok),
      signatureBase64: (res && res.signatureBase64) || "",
      reason: (res && res.reason) || "",
    };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  }
}
