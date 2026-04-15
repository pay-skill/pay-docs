---
title: "Express.js Middleware — @pay-skill/express"
description: "Drop-in Express middleware for x402 payments. payMiddleware attaches a pay-enabled fetch to req.pay; requirePayment gates routes behind USDC paywalls."
---

# Express Middleware

`@pay-skill/express` wraps the [Ᵽay SDK](/sdk/typescript) for Express 4 and 5. Two exports:

- **`payMiddleware(wallet, options?)`** — consumer. Attaches `req.pay.fetch` and `req.pay.wallet` to every request so handlers can call paid APIs without seeing 402s.
- **`requirePayment(options)`** — provider. A route-level middleware that responds 402 to unpaid requests and populates `req.payment` on verified ones.

Start at the [middleware overview](/middleware/) if you haven't picked a package yet.

## Install

```bash
npm install @pay-skill/sdk @pay-skill/express express
```

Peer dependencies:

| Package | Range |
|---------|-------|
| `@pay-skill/sdk` | `>=0.1.0` |
| `express` | `>=4.0.0` (Express 4 and 5 both supported) |
| Node.js | `>=18.0.0` |

The package is ESM-only (`"type": "module"`). If your app is CommonJS, import it via dynamic `import()` or switch to ESM.

## Consumer — `payMiddleware`

Call paid APIs from inside a route handler. Attach the middleware once at app startup, then use `req.pay.fetch` exactly like the global `fetch`.

```typescript
// src/app.ts
import express from "express";
import { Wallet } from "@pay-skill/sdk";
import { payMiddleware } from "@pay-skill/express";

const wallet = await Wallet.create();           // OS keychain, mainnet
const app = express();

app.use(payMiddleware(wallet, {
  maxPerRequest: 1.00,                          // reject any single payment over $1
  maxTotal: 100.00,                             // stop after $100 total
  onPayment: ({ url, amount, settlement }) => {
    console.log(`[pay] $${amount.toFixed(2)} (${settlement}) -> ${url}`);
  },
}));

app.get("/forecast/:city", async (req, res, next) => {
  try {
    const upstream = await req.pay.fetch(
      `https://weather.example.com/v1/forecast?city=${encodeURIComponent(req.params.city)}`,
    );
    if (!upstream.ok) return res.status(upstream.status).json({ error: upstream.statusText });
    res.json(await upstream.json());
  } catch (err) {
    next(err);                                  // forward to error-handling middleware
  }
});

app.listen(3000);
```

### What the middleware attaches

TypeScript users automatically get the `req.pay` type via the package's ambient declaration (`@pay-skill/express` augments `Express.Request`).

```typescript
req.pay.fetch     // typeof globalThis.fetch — pay-enabled
req.pay.wallet    // Wallet instance (for direct payments, tab management)
```

### Options

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `maxPerRequest` | `number` | none | Max dollars for a single 402 settlement |
| `maxTotal` | `number` | none | Max total dollars across all settlements in this middleware's lifetime |
| `onPayment` | `(event) => void` | none | Called after each successful payment |

All options pass straight through to [`createPayFetch`](/sdk/fetch#budget-controls). A single `createPayFetch` instance is shared across requests, so `maxTotal` accumulates across the whole process — not per request.

### Handling budget-exceeded errors

```typescript
import { PayBudgetExceededError } from "@pay-skill/sdk";

app.use((err, req, res, next) => {
  if (err instanceof PayBudgetExceededError) {
    return res.status(503).json({
      error: "budget_exceeded",
      limitType: err.limitType,            // "perRequest" or "total"
      spent: err.spent,
      requested: err.requested,
    });
  }
  next(err);
});
```

Place the error handler **after** `payMiddleware` and all routes. Express error middleware is identified by its four-argument signature.

## Provider — `requirePayment`

Gate individual routes behind x402 paywalls. Mount `requirePayment({ ... })` before the handler. Unpaid requests get 402 with a `PAYMENT-REQUIRED` header; verified requests pass through with `req.payment` populated.

```typescript
import express from "express";
import { requirePayment } from "@pay-skill/express";

const app = express();
app.use(express.json());

const PROVIDER = "0xYourProviderWallet0000000000000000000000";

// Free route
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Micropayment — tab settlement, $0.01 per call
app.get(
  "/api/quote",
  requirePayment({
    price: 0.01,
    settlement: "tab",
    providerAddress: PROVIDER,
  }),
  (req, res) => {
    res.json({
      quote: "The best way out is always through.",
      author: "Robert Frost",
      paidBy: req.payment.from,
    });
  },
);

// One-shot — direct settlement, $2.00 per call
app.post(
  "/api/report",
  requirePayment({
    price: 2.00,
    settlement: "direct",
    providerAddress: PROVIDER,
  }),
  (req, res) => {
    res.json({ report: generateReport(req.body), paidBy: req.payment.from });
  },
);

app.listen(3000);
```

### Options

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `price` | `number` | **required** | Dollar amount charged per request |
| `settlement` | `"tab" \| "direct"` | **required** | `tab` for micropayments, `direct` for $1+ one-shot |
| `providerAddress` | `string` | **required** | Your provider wallet (`0x...`) |
| `facilitatorUrl` | `string` | `https://pay-skill.com/x402` | Facilitator base URL |
| `failMode` | `"closed" \| "open"` | `"closed"` | Behavior when the facilitator is unreachable |
| `asset` | `string` | auto | USDC address; auto-detected from `facilitatorUrl` |

See the [overview](/middleware/#the-two-primitives) for how `/verify` is called and what happens at each branch of the flow.

### Using `req.payment` in your handler

After `requirePayment` calls `next()`, the handler has access to verified payer info:

```typescript
app.get("/api/premium", requirePayment({ price: 0.05, settlement: "tab", providerAddress: PROVIDER }), (req, res) => {
  req.payment.from         // "0xAgentWallet..." — verified payer
  req.payment.amount       // 50000 — micro-USDC
  req.payment.settlement   // "tab"
  req.payment.verified     // always true
  res.json({ /* ... */ });
});
```

`req.payment` is also typed automatically — no manual `declare global` needed.

### Using the X-Pay-* headers

The middleware sets these headers on the request before calling `next()`, so downstream middleware (access logs, per-payer rate limits, metrics) can read them without knowing about x402:

| Header | Value |
|--------|-------|
| `X-Pay-Verified` | `true` |
| `X-Pay-From` | Payer wallet `0x...` |
| `X-Pay-Amount` | Amount in micro-USDC |
| `X-Pay-Settlement` | `direct` or `tab` |

The raw `PAYMENT-SIGNATURE` header is stripped before the handler runs so downstream code cannot accidentally re-use it.

### Fail modes

| `failMode` | Behavior when facilitator is unreachable |
|------------|-----------------------------------------|
| `"closed"` (default) | 503 response, handler never runs. Safe default for financial paths. |
| `"open"` | Passes the request through without verification. Use only for non-financial routes (read-only health metrics, etc). |

Fail-closed matches the project's [no silent fallbacks](/troubleshooting) rule.

## Consumer and Provider in One App

Nothing prevents running both middlewares in the same Express process — a single wallet funds outbound calls and receives inbound payments simultaneously.

```typescript
const wallet = await Wallet.create();
const app = express();
app.use(express.json());
app.use(payMiddleware(wallet, { maxPerRequest: 0.50 }));

// Your API charges $0.05 per /api/summary,
// funded by calling a paid upstream LLM at under $0.50 per call.
app.post(
  "/api/summary",
  requirePayment({ price: 0.05, settlement: "tab", providerAddress: wallet.address }),
  async (req, res, next) => {
    try {
      const llm = await req.pay.fetch("https://llm.example.com/summarize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: req.body.text }),
      });
      const { summary } = await llm.json();
      res.json({ summary, paidBy: req.payment.from });
    } catch (err) {
      next(err);
    }
  },
);
```

## Production Setup

**Environment variables** — in Docker, Kubernetes, Vercel, Render, Fly, or any platform that injects env vars at runtime, construct the wallet from `PAYSKILL_KEY`:

```typescript
import { Wallet } from "@pay-skill/sdk";
const wallet = Wallet.fromEnv();   // reads PAYSKILL_KEY
```

Never hardcode keys. Never commit `.env` files containing real keys. Use your platform's secrets manager.

**Mainnet by default.** Examples on this page all target mainnet. If you need Base Sepolia for local experimentation, the wallet handles network selection — nothing framework-specific is required:

```typescript
const wallet = new Wallet({ testnet: true });      // or PAYSKILL_TESTNET=1
```

The middleware reads the facilitator URL from the options you pass to `requirePayment`. To point at testnet for both middlewares:

```typescript
app.use(payMiddleware(wallet));
app.get("/api/data", requirePayment({
  price: 0.01,
  settlement: "tab",
  providerAddress: PROVIDER,
  facilitatorUrl: "https://testnet.pay-skill.com/x402",
}), /* handler */);
```

**Funding the wallet:**

```bash
pay fund       # opens Coinbase Onramp (zero fee)
pay status     # confirm balance
```

## Troubleshooting

### "Invalid PAYMENT-SIGNATURE header: base64/JSON decode failed"

The client sent a `PAYMENT-SIGNATURE` header that is not a valid base64-encoded JSON payload. This is always a client-side bug. Confirm the client is using a current x402 V2 SDK (e.g. `@pay-skill/sdk` 0.1.0+ or `pay-skill` 0.1.14+) and that the header is set on the retry, not the initial request.

### 503 `facilitator_unavailable` on every request

The middleware cannot reach `https://pay-skill.com/x402/verify` within 5 seconds. Check outbound network access from your host, verify the facilitator URL, and confirm DNS. If this is a non-financial read-only route, `failMode: "open"` will let requests through without verification — do not use it on paid routes that move real money.

### `req.pay` is `undefined` in a handler

`payMiddleware` was not mounted before the route. Middleware order matters in Express; move `app.use(payMiddleware(wallet))` above your routes.

### TypeScript: "Property 'pay' does not exist on type 'Request'"

Ensure your `tsconfig.json` includes `@pay-skill/express` in its compilation scope — the package uses module augmentation (`declare global { namespace Express { ... } }`) which is only applied when the type declarations are loaded. A single `import "@pay-skill/express"` anywhere in your source is enough.

### Express 4 vs Express 5

The peer dep range is `>=4.0.0` so both work. Express 5 removes implicit unhandled-promise-rejection handling — if you `await` inside a handler, wrap the body in `try { ... } catch (err) { next(err); }` or use an `asyncHandler` helper. Express 5's promise support is opt-in via the `express.Router` options; neither middleware exported by this package relies on it.

## What's Not Covered

- Browser wallets and edge runtimes — use the core [SDK](/sdk/typescript) with [OWS](https://openwalletstandard.org/) if you're in a browser context.
- Koa, Fastify, Hapi, NestJS — not planned. Wrap the underlying `createPayFetch` manually, or deploy [pay-gate](/gate/) as a sidecar.
- Per-user wallet custody — all middleware uses a single server-side wallet. Multi-tenant wallet management is an application-layer concern.

## Next Steps

- [fetch() Wrapper](/sdk/fetch) — the underlying `createPayFetch` API, including the `transport()` / `register()` patterns used by other SDKs.
- [TypeScript SDK](/sdk/typescript) — `Wallet` methods for direct payments, tab management, and webhook registration.
- [Middleware overview](/middleware/) — decision tree and primitives reference.
- [pay-gate](/gate/) — zero-code reverse-proxy alternative to `requirePayment`.
