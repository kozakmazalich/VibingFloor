/**
 * PUBLIC WEB3 CONFIG — safe to ship to the browser.
 *
 * Never put the treasury private key, Privy app secret, or RPC credentials
 * here. Those live only in the git-ignored `.env` used by relayer/server.js.
 *
 * Privy App ID and Client ID are public identifiers from dashboard.privy.io.
 */

// Dashboard -> App ID (public). PRIVY_CLIENT_ID is optional; leave it empty
// when the dashboard does not provide a client ID. NEVER put the App Secret
// here: this file is served to every browser.
export const PRIVY_APP_ID = "cmviusv0s01co0gjpsclo65yy";
export const PRIVY_CLIENT_ID = "";

// Official vanilla JS SDK. Loaded dynamically so guest mode still works if
// the CDN is unreachable.
export const PRIVY_SDK_URL = "https://esm.sh/@privy-io/js-sdk-core@0.79.1";

// Pinned ESM build of ethers v6 for read-only contract calls.
export const ETHERS_URL = "https://esm.sh/ethers@6.13.4";

// Robinhood Testnet $VIB token.
export const TOKEN_ADDRESS = "0x462cE9fA227aB2CA44C66323B8fD4c3e078072ED";
export const TOKEN_DECIMALS = 18;

// Public RPC used for read-only balanceOf calls. The treasury never signs here.
// Keep this in sync with RPC_URL in the relayer's `.env`.
export const ROBINHOOD_RPC_URL = "https://rpc.testnet.chain.robinhood.com";

// Local treasury relayer. Override at runtime with window.VIB_RELAYER_URL when
// the relayer is hosted elsewhere.
export const RELAYER_URL =
  (typeof window !== "undefined" && window.VIB_RELAYER_URL) ||
  "/api/claim-drum"; // same-origin Vercel serverless (no CORS needed)
