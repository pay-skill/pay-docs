# TypeScript SDK Reference

## Installation

```bash
npm install @pay-skill/sdk
# or
pnpm add @pay-skill/sdk
```

## Quick Start

```typescript
import { Wallet } from "@pay-skill/sdk";

const wallet = new Wallet({
  privateKey: process.env.PAYSKILL_KEY!,
  chain: "base",
  apiUrl: "https://pay-skill.com/api/v1",
  routerAddress: "0x...", // from /api/v1/contracts
});

// Send $5 to a provider
const result = await wallet.payDirect("0xProvider...", 5, "invoice-42");
console.log(result.tx_hash);
```

## Wallet

The `Wallet` class is the recommended entry point for agents. It wraps `PayClient` with private key signing, auto-permits, and dollar-denominated amounts.

### Constructor

```typescript
import { Wallet } from "@pay-skill/sdk";

const wallet = new Wallet({
  privateKey: "0xabc...",       // Agent's private key
  chain: "base",               // "base" (mainnet) or "base-sepolia" (testnet)
  apiUrl: "https://pay-skill.com/api/v1",
  routerAddress: "0x...",       // PayRouter contract address
  chainId: 8453,               // Optional — parsed from chain if omitted
});
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `privateKey` | `string` | Yes | Agent's secp256k1 private key (hex, 0x-prefixed) |
| `chain` | `string` | Yes | `"base"` (chain ID 8453) or `"base-sepolia"` (84532) |
| `apiUrl` | `string` | Yes | Pay API base URL |
| `routerAddress` | `string` | Yes | PayRouter contract address |
| `chainId` | `number` | No | Override chain ID for EIP-712 domain |

### Properties

```typescript
wallet.address // => "0x1234..." (derived from private key)
```

### Direct Payment

```typescript
const result = await wallet.payDirect(
  "0xProviderAddress",  // Recipient
  5,                    // Amount in dollars ($5.00)
  "invoice-42",         // Memo (optional metadata)
);
// => { tx_hash: "0xabc...", status: "confirmed" }
```

- **Minimum:** $1.00
- **Fee:** 1% deducted from provider payout (0.75% for providers above $50k/month volume)
- **Permit:** Auto-signed (EIP-2612 approval to PayDirect contract)

### Tab Management

#### Open a Tab

```typescript
const tab = await wallet.openTab(
  "0xProviderAddress",  // Provider wallet
  20,                   // Lock $20.00
  2,                    // Max $2.00 per charge
);
// => { id: "abc123", tab_id: "abc123" }
```

- **Minimum:** $5.00
- **Activation fee:** `max($0.10, 1% of amount)` — non-refundable
- **Permit:** Auto-signed for PayTab contract

#### Charge a Tab (Provider-Side)

```typescript
const charge = await providerWallet.chargeTab(tabId, 1); // Charge $1.00
// => { status: "approved" }
```

#### Withdraw from a Tab (Provider-Side)

```typescript
const result = await providerWallet.withdrawTab(tabId);
// => { amount: 2000000, status: "open" }
```

Withdraw all accumulated charges from a tab (provider-only). The 1% processing fee is deducted (0.75% for high-volume providers). The tab stays open for more charges. Returns the updated Tab.

#### Close a Tab

```typescript
const close = await wallet.closeTab(tabId);
// => { status: "closed" }
```

Either agent or provider can close unilaterally. On close:
- `totalCharged × 0.99` goes to provider (×0.9925 for high-volume)
- `totalCharged × 0.01` goes to fee wallet (×0.0075 for high-volume)
- Remainder returns to agent

See the [Tab Quickstart](/quickstart/tab#fees) for the full fee breakdown.

### x402 Payments

Use `PayClient.request()` for automatic x402 handling (see PayClient section below).

### Balance

```typescript
const balance = await wallet.balance();
// => 142.50 (dollars)
```

### Fund and Withdraw Links

```typescript
const fundUrl = await wallet.createFundLink();
// => "https://pay-skill.com/fund?token=abc123"

const withdrawUrl = await wallet.createWithdrawLink();
// => "https://pay-skill.com/withdraw?token=abc123"
```

### Webhooks

```typescript
// Register
const hook = await wallet.registerWebhook(
  "https://example.com/hooks",
  ["payment.completed", "tab.charged"],  // Event filter (optional)
  "my-secret",                           // HMAC signing secret (optional)
);
// => { id: "hook-123" }
```

---

## PayClient

Lower-level stateless HTTP client. Use this when you need direct control over signing, or for x402 request handling.

### Constructor

```typescript
import { PayClient } from "@pay-skill/sdk";

const client = new PayClient({
  apiUrl: "https://pay-skill.com/api/v1",
  privateKey: "0xabc...",
  chainId: 8453,
  routerAddress: "0x...",
});
```

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiUrl` | `string` | No | Defaults to `https://pay-skill.com/api/v1` |
| `privateKey` | `string` | No | For direct auth signing |
| `signer` | `Signer \| "cli" \| "raw" \| "custom"` | No | Signer mode |
| `signerOptions` | `object` | No | Signer-specific options |
| `chainId` | `number` | No | EIP-712 domain chain ID |
| `routerAddress` | `string` | No | EIP-712 domain contract |

### Payment Methods

All amounts are in **micro-USDC** (6 decimals). `$1.00 = 1_000_000`.

```typescript
// Direct payment
const result = await client.payDirect("0xProvider", 5_000_000, { memo: "test" });

// Tabs
const tab = await client.openTab("0xProvider", 20_000_000, { maxChargePerCall: 2_000_000 });
await client.topUpTab(tab.tabId, 10_000_000);
const tabs = await client.listTabs();
const single = await client.getTab(tab.tabId);
await client.withdrawTab(tab.tabId);
await client.closeTab(tab.tabId);
```

### x402 Request Handling

```typescript
const response = await client.request("https://api.example.com/data");
```

If the upstream returns **402 Payment Required**, the SDK automatically:

1. Reads `settlement`, `amount`, and `to` from the 402 response body
2. If `settlement === "tab"`: finds or opens a tab, charges it, retries with `X-Payment-Tab` and `X-Payment-Charge` headers
3. If `settlement === "direct"`: calls `payDirect()`, retries with `X-Payment-Tx` header

Options:

```typescript
const response = await client.request("https://api.example.com/data", {
  method: "POST",
  body: { query: "..." },
  headers: { "Authorization": "Bearer ..." },
});
```

### Status

```typescript
const status = await client.getStatus();
// => { address: "0x...", balance: 142500000, openTabs: [...] }
```

### Webhooks

```typescript
const hook = await client.registerWebhook("https://example.com/hooks", {
  events: ["payment.completed"],
  secret: "my-hmac-secret",
});
const hooks = await client.listWebhooks();
await client.deleteWebhook(hook.webhookId);
```

### Fund and Withdraw Links

```typescript
const fundUrl = await client.createFundLink();
const withdrawUrl = await client.createWithdrawLink();
```

---

## Signer Modes

The SDK supports three signing modes for authentication:

### CLI Signer (Default)

Delegates signing to the `pay sign` CLI subprocess. Best for production when the CLI manages key storage.

```typescript
const client = new PayClient({
  signer: "cli",
  signerOptions: { command: "pay" },  // optional custom command
});
```

### Raw Key Signer

Uses a private key directly via `viem`. Best for development and testing.

```typescript
const client = new PayClient({
  signer: "raw",
  signerOptions: { key: "0xabc..." },
});
// Or use the shorthand:
const client = new PayClient({ privateKey: "0xabc..." });
```

### Custom Callback Signer

Provide your own signing function:

```typescript
const client = new PayClient({
  signer: "custom",
  signerOptions: {
    address: "0xYourAddress",
    callback: (hash: Uint8Array) => yourSigningFunction(hash),
  },
});
```

---

## Error Handling

```typescript
import {
  PayError,
  PayValidationError,
  PayServerError,
  PayNetworkError,
  PayInsufficientFundsError,
} from "@pay-skill/sdk";

try {
  await wallet.payDirect("0xProvider", 5, "test");
} catch (err) {
  if (err instanceof PayValidationError) {
    // Client-side validation failed (bad address, below minimum)
    console.log(err.field); // e.g., "to", "amount"
  } else if (err instanceof PayServerError) {
    // Server returned an error
    console.log(err.statusCode); // e.g., 402, 500
  } else if (err instanceof PayNetworkError) {
    // Network/connection error
  }
}
```

| Error Class | Code | When |
|-------------|------|------|
| `PayValidationError` | `validation_error` | Invalid address, amount below minimum |
| `PayServerError` | `server_error` | Server returned 4xx/5xx |
| `PayNetworkError` | `network_error` | Connection failed |
| `PayInsufficientFundsError` | `insufficient_funds` | Not enough USDC |

---

## Types

```typescript
interface DirectPaymentResult {
  txHash: string;     // On-chain transaction hash
  status: string;     // "confirmed"
  amount: number;     // Micro-USDC sent
  fee: number;        // Micro-USDC fee deducted
}

interface Tab {
  tabId: string;
  provider: string;
  amount: number;           // Total locked (micro-USDC)
  balanceRemaining: number;
  totalCharged: number;
  chargeCount: number;
  maxChargePerCall: number;
  status: TabStatus;        // "open" | "closed"
}

interface StatusResponse {
  address: string;
  balance: number;    // Micro-USDC
  openTabs: Tab[];
}

interface WebhookRegistration {
  webhookId: string;
  url: string;
  events: string[];
}
```

---

## Authentication

All `/api/v1/*` requests include EIP-712 signed headers:

| Header | Value |
|--------|-------|
| `X-Pay-Agent` | Wallet address (checksummed) |
| `X-Pay-Signature` | EIP-712 signature (hex, 65 bytes) |
| `X-Pay-Timestamp` | Unix timestamp (seconds) |
| `X-Pay-Nonce` | Random 32-byte hex |

The EIP-712 domain is:
```
name: "pay"
version: "0.1"
chainId: <configured>
verifyingContract: <router address>
```

Typed data: `APIRequest(string method, string path, uint256 timestamp, bytes32 nonce)`

Timestamps must be within 5 minutes of server time. Nonces are single-use.
