---
title: "TypeScript SDK — USDC Payments for Node.js Agents"
description: "TypeScript SDK for Ᵽay. Wallet management, direct payments, tabs, x402 requests, and webhook registration. npm install @pay-skill/sdk."
---

# TypeScript SDK Reference

## Installation

```bash
npm install @pay-skill/sdk
```

Node.js 18+ required.

## Quick Start

```typescript
import { Wallet } from "@pay-skill/sdk";

const wallet = await Wallet.create();  // OS keychain (same key as CLI)

// Send $5 to a provider
const result = await wallet.send("0xProvider...", 5, "invoice-42");
console.log(result.txHash);

// Open a metered tab
const tab = await wallet.openTab("0xProvider...", 20, 2); // $20 locked, $2/call max

// Paid HTTP (x402 handled automatically)
const response = await wallet.request("https://api.example.com/data");
```

## Wallet Initialization

```typescript
import { Wallet } from "@pay-skill/sdk";

// OS keychain (recommended — same key as CLI)
const wallet = await Wallet.create();

// Environment variable (CI/containers — reads PAYSKILL_KEY)
const wallet = new Wallet();

// Explicit key (testing only)
const wallet = new Wallet({ privateKey: "0xabc..." });

// Env var only
const wallet = Wallet.fromEnv();

// Testnet (Base Sepolia)
const wallet = new Wallet({ testnet: true });
// or set PAYSKILL_TESTNET=1

// OWS (Open Wallet Standard) — browser wallet extensions
const wallet = await Wallet.fromOws({ walletId: "my-agent" });
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `privateKey` | `string` | `PAYSKILL_KEY` env | Agent's secp256k1 private key |
| `testnet` | `boolean` | `false` | Use Base Sepolia testnet |
| `timeout` | `number` | `30000` | Request timeout in ms |

### Properties

```typescript
wallet.address // "0x1234..." (derived from private key, read-only)
```

## Amounts

Dollar amounts by default. Use `{ micro: number }` for micro-USDC precision:

```typescript
await wallet.send("0x...", 5);                  // $5.00
await wallet.send("0x...", 0.01);               // $0.01
await wallet.send("0x...", { micro: 5_000_000 }); // $5.00 (exact micro-USDC)
```

| Dollars | Micro-USDC |
|---------|-----------|
| $1.00 | 1,000,000 |
| $5.00 | 5,000,000 |
| $0.01 | 10,000 |

---

## Direct Payment

```typescript
const result = await wallet.send(
  "0xProviderAddress",  // Recipient
  5,                    // Amount ($5.00)
  "invoice-42",         // Memo (optional)
);
// => { txHash: "0xabc...", status: "confirmed", amount: 5, fee: 0.05 }
```

- **Minimum:** $1.00
- **Fee:** 1% deducted from provider payout (0.75% above $50k/month)
- **Permit:** Auto-signed internally (EIP-2612)

## Tab Management

### Open a Tab

```typescript
const tab = await wallet.openTab(
  "0xProviderAddress",  // Provider wallet
  20,                   // Lock $20.00
  2,                    // Max $2.00 per charge
);
// => { id: "abc123", amount: 20, status: "open", ... }
```

- **Minimum:** $5.00
- **Activation fee:** `max($0.10, 1% of amount)` -- non-refundable

### Charge a Tab (Provider-Side)

```typescript
const charge = await providerWallet.chargeTab(tabId, 1); // Charge $1.00
// => { chargeId: "chg-1", status: "buffered" }
```

### Top Up

```typescript
const tab = await wallet.topUpTab(tabId, 10); // Add $10.00
```

### Close

```typescript
const tab = await wallet.closeTab(tabId);
// => { status: "closed", ... }
```

Either agent or provider can close. On close:
- `totalCharged x 0.99` goes to provider
- `totalCharged x 0.01` goes to fee wallet
- Remainder returns to agent

### List and Get

```typescript
const tabs = await wallet.listTabs();
const tab = await wallet.getTab("abc123");
```

## x402 Payments

```typescript
const response = await wallet.request("https://api.example.com/data");
```

If the upstream returns **402 Payment Required**, the SDK automatically:

1. Parses the `PAYMENT-REQUIRED` header or response body
2. Routes by settlement mode:
   - **direct:** signs EIP-3009 TransferWithAuthorization, retries with `PAYMENT-SIGNATURE`
   - **tab:** finds or auto-opens a tab, charges it, retries with tab proof
3. Returns the final response

Options:

```typescript
const response = await wallet.request("https://api.example.com/data", {
  method: "POST",
  body: { query: "..." },
  headers: { "Authorization": "Bearer ..." },
});
```

### fetch() Wrapper

Inject x402 into **any SDK** that accepts a custom `fetch`:

```typescript
import { Wallet, createPayFetch } from "@pay-skill/sdk";
import OpenAI from "openai";

const wallet = await Wallet.create();
const payFetch = createPayFetch(wallet, { maxTotal: 50.00 });

const openai = new OpenAI({ fetch: payFetch });
// Every API call now auto-pays via x402
```

Or patch `globalThis.fetch` for the entire process:

```typescript
import { Wallet, register } from "@pay-skill/sdk";

const wallet = await Wallet.create();
const unregister = register(wallet);
// fetch() globally handles 402 now
```

See the full [fetch() Wrapper guide](/docs/sdk/fetch) for budget controls, SDK injection examples, and the `onPayment` callback.

## Balance and Status

```typescript
const bal = await wallet.balance();
// => { total: 142.50, locked: 20.00, available: 122.50 }

const status = await wallet.status();
// => { address: "0x...", balance: { total, locked, available }, openTabs: 2 }
```

## Discovery

```typescript
// Instance method
const services = await wallet.discover("weather");

// Standalone (no wallet needed)
import { discover } from "@pay-skill/sdk";
const services = await discover("weather", { testnet: true });
```

## Fund and Withdraw Links

```typescript
const fundUrl = await wallet.createFundLink({ message: "Need funds" });
const withdrawUrl = await wallet.createWithdrawLink();
```

Links expire after 1 hour.

## Webhooks

```typescript
const hook = await wallet.registerWebhook(
  "https://example.com/hooks",
  ["payment.completed", "tab.opened"],
  "my-hmac-secret",
);
// => { id: "hook-123", url: "...", events: [...] }

const hooks = await wallet.listWebhooks();
await wallet.deleteWebhook("hook-123");
```

## Testnet Minting

```typescript
const result = await wallet.mint(100); // Mint $100 testnet USDC
// => { txHash: "0x...", amount: 100 }
```

Only works when `testnet: true` or `PAYSKILL_TESTNET=1`.

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
  await wallet.send("0xProvider", 5);
} catch (err) {
  if (err instanceof PayInsufficientFundsError) {
    console.log(err.balance, err.required);
    const url = await wallet.createFundLink({ message: "Need funds" });
  } else if (err instanceof PayValidationError) {
    console.log(err.field);
  } else if (err instanceof PayServerError) {
    console.log(err.statusCode);
  }
}
```

| Error Class | Code | When |
|-------------|------|------|
| `PayValidationError` | `validation_error` | Invalid address, amount below minimum |
| `PayServerError` | `server_error` | Server returned 4xx/5xx |
| `PayNetworkError` | `network_error` | Connection failed |
| `PayInsufficientFundsError` | `insufficient_funds` | Not enough USDC |
| `PayBudgetExceededError` | `budget_exceeded` | `createPayFetch` budget limit hit |

---

## Types

```typescript
type Amount = number | { micro: number };

interface SendResult {
  txHash: string;
  status: string;
  amount: number;   // Dollars
  fee: number;      // Dollars
}

interface Tab {
  id: string;
  provider: string;
  amount: number;              // Dollars
  balanceRemaining: number;
  totalCharged: number;
  chargeCount: number;
  maxChargePerCall: number;
  totalWithdrawn: number;
  status: "open" | "closed";
  pendingChargeCount: number;
  pendingChargeTotal: number;
  effectiveBalance: number;
}

interface Balance {
  total: number;      // Dollars
  locked: number;
  available: number;
}

interface Status {
  address: string;
  balance: Balance;
  openTabs: number;
}

interface DiscoverService {
  name: string;
  description: string;
  baseUrl: string;
  category: string;
  keywords: string[];
  routes: { path: string; method?: string; price?: string; settlement?: string }[];
  docsUrl?: string;
}

interface WebhookRegistration {
  id: string;
  url: string;
  events: string[];
}

interface MintResult {
  txHash: string;
  amount: number;   // Dollars
}
```

---

## Authentication

All API requests are automatically signed with EIP-712 auth headers. No manual signing needed.

For advanced use, auth headers include:

| Header | Value |
|--------|-------|
| `X-Pay-Agent` | Wallet address (checksummed) |
| `X-Pay-Signature` | EIP-712 signature (hex, 65 bytes) |
| `X-Pay-Timestamp` | Unix timestamp (seconds) |
| `X-Pay-Nonce` | Random 32-byte hex |

Contract addresses and chain ID are fetched automatically from the server on first use.
