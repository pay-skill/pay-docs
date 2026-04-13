---
title: "fetch() Wrapper — Automatic x402 for Any SDK"
description: "Make any fetch() call pay for itself. Drop-in x402 support for OpenAI, Anthropic, Vercel AI SDK, LangChain, and raw fetch."
---

# fetch() Wrapper

Make any `fetch()` call handle x402 payments automatically.

## The 30-Second Version

```typescript
import { Wallet, createPayFetch } from "@pay-skill/sdk";
import OpenAI from "openai";

const wallet = await Wallet.create();
const payFetch = createPayFetch(wallet);

const openai = new OpenAI({ fetch: payFetch });
// Every API call through this client auto-pays via x402
```

That's it. Non-402 responses pass through untouched. When a server returns 402 Payment Required, the wallet settles the payment (via tab or direct) and retries the request. Your code never sees the 402.

---

## Two Ways to Use It

### 1. Named wrapper (recommended)

Create a fetch function and pass it to any SDK:

```typescript
import { Wallet, createPayFetch } from "@pay-skill/sdk";

const wallet = await Wallet.create();
const payFetch = createPayFetch(wallet);

// Use directly
const resp = await payFetch("https://api.example.com/data");
const data = await resp.json();
```

### 2. Global patch

Patch `globalThis.fetch` so every `fetch()` in the process auto-pays:

```typescript
import { Wallet, register } from "@pay-skill/sdk";

const wallet = await Wallet.create();
const unregister = register(wallet);

// Now every fetch() handles 402 automatically
const resp = await fetch("https://api.example.com/data");

// Restore original fetch when done
unregister();
```

---

## SDK Injection Examples

Every major AI SDK accepts a custom `fetch`. One line to wire it up.

### OpenAI

```typescript
import OpenAI from "openai";

const openai = new OpenAI({ fetch: payFetch });
```

### Anthropic

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ fetch: payFetch });
```

### Vercel AI SDK

```typescript
import { createOpenAI } from "@ai-sdk/openai";

const provider = createOpenAI({ fetch: payFetch });
```

### LangChain.js

```typescript
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
  configuration: { fetch: payFetch },
});
```

---

## Budget Controls

Agents shouldn't have unlimited spending. Set hard limits:

```typescript
const payFetch = createPayFetch(wallet, {
  maxPerRequest: 1.00,   // reject any single payment over $1
  maxTotal: 50.00,       // reject once $50 total has been spent
  onPayment: ({ url, amount, settlement }) => {
    console.log(`Paid $${amount.toFixed(2)} (${settlement}) for ${url}`);
  },
});
```

When a limit is hit, `PayBudgetExceededError` is thrown:

```typescript
import { PayBudgetExceededError } from "@pay-skill/sdk";

try {
  const resp = await payFetch("https://expensive-api.example.com/generate");
} catch (err) {
  if (err instanceof PayBudgetExceededError) {
    console.log(err.limitType);  // "perRequest" or "total"
    console.log(err.spent);      // dollars spent so far
    console.log(err.requested);  // dollars this request wanted
  }
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxPerRequest` | `number` | none | Max dollars for a single 402 settlement |
| `maxTotal` | `number` | none | Max total dollars across all settlements |
| `onPayment` | `function` | none | Called after each successful payment |

### PaymentEvent

```typescript
interface PaymentEvent {
  url: string;                          // URL that required payment
  amount: number;                       // Dollars paid
  settlement: "direct" | "tab" | string; // How it was settled
}
```

---

## How It Works

```
Your code          createPayFetch         Server
   |                    |                    |
   |--- fetch(url) ---->|                    |
   |                    |--- GET url ------->|
   |                    |<-- 402 + headers --|
   |                    |                    |
   |                [check budget]           |
   |                [wallet.settle()]        |
   |                    |                    |
   |                    |--- GET url ------->|
   |                    |   + PAYMENT-SIG    |
   |                    |<-- 200 + data -----|
   |<--- Response ------|                    |
```

1. Your `fetch()` call goes to the server.
2. Server returns 402 with payment requirements in the `PAYMENT-REQUIRED` header.
3. Budget limits are checked. If exceeded, `PayBudgetExceededError` is thrown.
4. The wallet settles via **tab** (pre-funded, for micropayments) or **direct** (on-chain USDC transfer).
5. The request is retried with a `PAYMENT-SIGNATURE` header containing the payment proof.
6. The final response is returned to your code.

Tab settlement is preferred when available. It costs a fraction of a cent per call instead of an on-chain transaction per call.

---

## When to Use What

| You want to... | Use |
|----------------|-----|
| Call a paid API from your code | `createPayFetch(wallet)` |
| Inject into OpenAI/Anthropic/etc. | `new OpenAI({ fetch: createPayFetch(wallet) })` |
| Make all fetch() calls auto-pay | `register(wallet)` |
| Make a one-off paid request | `wallet.request(url)` |
| Call from CLI or shell scripts | `pay request <url>` |
