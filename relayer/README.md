# Robinhood Testnet Treasury Relayer

Node.js service that pays Prize Drum wins in `$VIB` on Robinhood Testnet.
Only this process ever sees the treasury private key.

- Token: `0x462cE9fA227aB2CA44C66323B8fD4c3e078072ED`
- Chain: Robinhood Testnet, `46630`
- Default bind: `127.0.0.1:3001`

## Security model

- Every payout requires a valid **Privy access token** (`Authorization: Bearer <JWT>`).
- The token is verified with `@privy-io/node` against your app's Privy key.
- The recipient address must be an Ethereum wallet **linked to that Privy user**.
- A unique `claimId` is required and deduplicated, so a retried request cannot pay twice.
- Per-user and global cooldowns, hourly claim caps and daily `$VIB` caps are enforced.
- The RPC chain ID and token contract are checked at startup.
- Payout state persists in `relayer/data/claims.json` (git-ignored).
- The treasury key and the Privy App Secret stay in `.env` on the server.

## Setup

1. Fill the repo-root `.env`:

   ```dotenv
   TREASURY_PRIVATE_KEY=0x...
   RPC_URL=https://rpc.testnet.chain.robinhood.com
   PRIVY_APP_ID=...
   PRIVY_APP_SECRET=...
   ```

   The App Secret must be the **rotated** secret from Privy → App settings → Basics.
   It is server-side only; never put it in `src/privyConfig.js`.

2. Install dependencies (if needed):

   ```bash
   npm install
   ```

3. Start the relayer:

   ```bash
   node relayer/server.js
   ```

4. Check it:

   ```bash
   curl http://127.0.0.1:3001/health
   ```

   `authConfigured`, `chainReady` and `chainId` should be ready. The response
   never includes secrets.

## Request contract

```http
POST /api/claim-drum
Authorization: Bearer <privy-access-token>
Content-Type: application/json

{
  "playerAddress": "0x...",
  "amount": 1000,
  "claimId": "a-unique-uuid"
}
```

Success:

```json
{ "success": true, "txHash": "0x...", "blockNumber": 123 }
```

Status codes: `401` missing/invalid Privy token, `403` wallet not linked to the
user, `409` duplicate `claimId`, `429` limit/cooldown, `502` chain/payout error,
`503` relayer not configured.

## Limits (defaults)

| Variable | Default |
| - | - |
| `RELAYER_COOLDOWN_MS` | `3000` |
| `RELAYER_MAX_CLAIMS_PER_HOUR` | `12` |
| `RELAYER_MAX_DAILY_VIB` | `10,000,000` |
| `RELAYER_MAX_GLOBAL_CLAIMS_PER_HOUR` | `60` |
| `RELAYER_MAX_GLOBAL_DAILY_VIB` | `25,000,000` |
| Single payout cap | `1,000,000` |

## Client configuration

The browser uses public values only, in `src/privyConfig.js`:

```js
export const PRIVY_APP_ID = "...";
export const PRIVY_CLIENT_ID = ""; // optional; never the App Secret
```

In the Privy dashboard:

1. Enable **Email** login.
2. Add `http://localhost:8000` and `http://127.0.0.1:8000` to
   **Configuration → App settings → Domains → Allowed origins → Web & mobile web**.
3. Add the production origin later, e.g. `https://vibing-floor.vercel.app`.

## Hosting

For a public deployment, put the relayer behind HTTPS (Cloudflare Tunnel,
Caddy, a small VPS) and allow the site origin via `RELAYER_ALLOWED_ORIGINS`.
The client calls the relayer URL configured in `src/privyConfig.js` (or
`window.VIB_RELAYER_URL`).

Use a dedicated hot wallet with a limited balance. Testnet-only code.
