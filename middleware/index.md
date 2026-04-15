---
title: "Application Middleware — Express, Next.js, FastAPI for x402"
description: "Framework middleware for apps that consume or provide x402-paid APIs. Drop-in Express, Next.js, and FastAPI packages backed by the Ᵽay SDK."
---

# Application Middleware

Framework adapters that wire the [Ᵽay SDK](/sdk/typescript) into Express, Next.js, and FastAPI. Same primitives as [`createPayFetch`](/sdk/fetch) and the [facilitator](/api-reference#x402-facilitator), exposed as middleware your route handlers call directly.

Use these packages when you want payment gating **inside your application code**, not as an external proxy. For a zero-code reverse proxy, see [pay-gate](/gate/) instead.

## Packages

| Framework | Role | Package | Install |
|-----------|------|---------|---------|
| Express 4/5 | Consumer + Provider | `@pay-skill/express` | `npm install @pay-skill/express` |
| Next.js (App Router) | Consumer + Provider | `@pay-skill/next` | `npm install @pay-skill/next` |
| FastAPI / Starlette | Consumer + Provider | `payskill-fastapi` | `pip install payskill-fastapi` |

Each package is a thin peer-dep wrapper over `@pay-skill/sdk` (TypeScript) or `pay-skill` (Python). Semver-independent from the core SDK.

## Which Package Do I Need?

Pick the row that matches your app. Direction is from your app's point of view.

| You want to... | Framework | Use |
|----------------|-----------|-----|
| Call paid APIs from a route handler | Express | `payMiddleware` |
| Call paid APIs from a route handler | Next.js App Router | `withPay` |
| Call paid APIs from a route handler | FastAPI | `PayMiddleware` |
| Gate your own routes behind payment | Express | `requirePayment` |
| Gate your own routes behind payment | Next.js App Router | `withPaywall` |
| Gate your own routes behind payment | FastAPI | `require_payment` (via `Depends`) |
| Gate with zero code changes | Any HTTP server | [pay-gate](/gate/) reverse proxy |
| Make a one-off paid request | Any | [`createPayFetch`](/sdk/fetch) directly |
| Call from a script, not a web app | Any | [`wallet.request()`](/sdk/typescript) |

Browser wallets, edge runtimes, Next.js Pages Router, and Server Actions are not covered by these packages. See [What's Not Covered](#what-s-not-covered) below.

## The Two Primitives

Every middleware package in the table above is a thin adapter over one of two primitives. Understanding the primitives makes the per-framework pages much shorter.

### Consumer primitive — `createPayFetch`

Consumer middleware attaches a pay-enabled `fetch` to the framework's request context. Under the hood it is `createPayFetch(wallet, options)` — the same wrapper documented on the [fetch() Wrapper](/sdk/fetch) page.

A single `payFetch` instance is shared across all requests in the process. Budget limits (`maxTotal`) accumulate across the middleware's lifetime; `maxPerRequest` is enforced per individual call. When a request hits a 402, the wrapper settles via tab or direct and retries. Your handler never sees the 402.

::: code-group

```typescript [TypeScript (Express)]
import express from "express";
import { Wallet } from "@pay-skill/sdk";
import { payMiddleware } from "@pay-skill/express";

const wallet = await Wallet.create();
const app = express();

app.use(payMiddleware(wallet, {
  maxPerRequest: 1.00,   // reject any single payment over $1
  maxTotal: 100.00,      // reject once $100 total has been spent
  onPayment: ({ url, amount, settlement }) => {
    console.log(`Paid $${amount.toFixed(2)} (${settlement}) for ${url}`);
  },
}));

app.get("/forecast", async (req, res) => {
  const data = await req.pay.fetch("https://api.example.com/forecast");
  res.json(await data.json());
});
```

```python [Python (FastAPI)]
from fastapi import FastAPI, Request
from payskill import Wallet
from payskill_fastapi import PayMiddleware

wallet = Wallet.create()
app = FastAPI()

app.add_middleware(
    PayMiddleware,
    wallet=wallet,
    max_per_request=1.00,  # reject any single payment over $1
    max_total=100.00,      # reject once $100 total has been spent
    on_payment=lambda e: print(f"Paid ${e.amount:.2f} ({e.settlement}) for {e.url}"),
)

@app.get("/forecast")
async def forecast(request: Request):
    resp = request.state.pay.fetch("https://api.example.com/forecast")
    return resp.json()
```

:::

The Express wrapper attaches `req.pay.fetch` and `req.pay.wallet`. The FastAPI wrapper attaches `request.state.pay.fetch` and `request.state.pay.wallet`. The Next.js wrapper (`withPay`) passes a `pay` context as the second argument to the handler. Same primitive in all three cases.

### Provider primitive — facilitator verify

Provider middleware calls the [facilitator](/api-reference#x402-facilitator) `POST /verify` endpoint on every request. The flow is identical across frameworks:

```
Client                    Middleware                 Facilitator
  |                           |                           |
  |-- GET /api/data --------->|                           |
  |                           |  (no PAYMENT-SIGNATURE)   |
  |<-- 402 + PAYMENT-REQUIRED-|                           |
  |                           |                           |
  |-- GET /api/data --------->|                           |
  |   + PAYMENT-SIGNATURE     |                           |
  |                           |-- POST /verify ---------->|
  |                           |<-- { isValid, payer } ----|
  |                           |                           |
  |                    (attach req.payment)                |
  |                    (call route handler)                |
  |<-- 200 + data ------------|                           |
```

Step by step:

1. Request arrives without `PAYMENT-SIGNATURE` header. Middleware responds 402 with a base64-encoded `PAYMENT-REQUIRED` body describing the price, asset, network, and settlement mode.
2. Client's x402 layer reads the requirements, signs a payment, and retries with `PAYMENT-SIGNATURE: <base64-payload>`.
3. Middleware base64-decodes the payload and POSTs it to `https://pay-skill.com/x402/verify` along with the offer it originally presented.
4. Facilitator returns `{ isValid: true, payer: "0x..." }`. Middleware attaches verified payment info to the request and calls the route handler.
5. If the facilitator returns `isValid: false`, middleware responds 402 with the `invalidReason`.
6. If the facilitator is unreachable, middleware responds 503 by default (`failMode: "closed"`) or falls through without verification (`failMode: "open"`).

Middleware calls `/verify` only. It does **not** call `/settle` — the facilitator handles settlement at verify time. This matches [pay-gate](/gate/) behavior.

::: code-group

```typescript [TypeScript (Express)]
import express from "express";
import { requirePayment } from "@pay-skill/express";

const app = express();

app.get("/api/data", requirePayment({
  price: 0.01,
  settlement: "tab",
  providerAddress: "0xYourProviderWallet...",
}), (req, res) => {
  // req.payment.from is the verified payer address
  res.json({ data: "premium", paidBy: req.payment.from });
});
```

```python [Python (FastAPI)]
from fastapi import FastAPI, Depends
from payskill_fastapi import require_payment, PaymentInfo

app = FastAPI()

@app.get("/api/data")
async def get_data(
    payment: PaymentInfo = Depends(
        require_payment(
            price=0.01,
            settlement="tab",
            provider_address="0xYourProviderWallet...",
        ),
    ),
):
    return {"data": "premium", "paid_by": payment.from_address}
```

:::

### Headers set on verified requests

When a payment verifies successfully, the provider middleware attaches these headers to the request before it reaches your handler. Downstream code can use them for per-payer analytics, access logs, or tiered rate limiting. `PAYMENT-SIGNATURE` is stripped before the handler runs.

| Header | Value |
|--------|-------|
| `X-Pay-Verified` | `true` |
| `X-Pay-From` | Payer wallet address (`0x...`) |
| `X-Pay-Amount` | Amount in micro-USDC (e.g. `10000` for $0.01) |
| `X-Pay-Settlement` | `direct` or `tab` |

The same four headers are set by [pay-gate](/gate/), so handlers written against one can read from the other without changes.

## Wallet Setup

All middleware packages expect a configured `Wallet` on mainnet by default. The recommended setup matches the CLI and SDK: a single keychain-backed wallet shared between `pay` on your laptop and your server process.

::: code-group

```typescript [TypeScript]
import { Wallet } from "@pay-skill/sdk";

// OS keychain — same key as the pay CLI
const wallet = await Wallet.create();

// Or: environment variable (Docker / CI / Vercel / Lambda)
const wallet = new Wallet();  // reads PAYSKILL_KEY

// Or: explicit env-only
const wallet = Wallet.fromEnv();
```

```python [Python]
from payskill import Wallet

# OS keychain -- same key as the pay CLI
wallet = Wallet.create()

# Or: environment variable (Docker / CI / Lambda)
wallet = Wallet()  # reads PAYSKILL_KEY

# Or: explicit env-only
wallet = Wallet.from_env()
```

:::

Fund the wallet with USDC on Base before starting the server:

```bash
pay fund        # opens Coinbase Onramp
pay status      # confirm balance
```

Mainnet is the default in every example on this page. The core SDK supports testnet via `testnet: true` / `PAYSKILL_TESTNET=1`, but the middleware packages inherit that from the wallet — nothing framework-specific is required.

## Consumer vs Provider — Using Both in One App

A single app can consume paid APIs **and** sell paid endpoints. Nothing prevents running `payMiddleware` and `requirePayment` in the same Express process, or mounting `PayMiddleware` while exposing routes gated with `Depends(require_payment(...))`. The two directions use the same wallet but track state independently.

```typescript
// Your app charges $0.05 per /api/summary call,
// and uses a paid upstream LLM API to generate the summary.
app.use(payMiddleware(wallet, { maxPerRequest: 0.50 }));

app.post("/api/summary", requirePayment({
  price: 0.05,
  settlement: "tab",
  providerAddress: wallet.address,
}), async (req, res) => {
  const llm = await req.pay.fetch("https://llm.example.com/summarize", {
    method: "POST",
    body: JSON.stringify({ text: req.body.text }),
  });
  res.json({ summary: await llm.json(), paidBy: req.payment.from });
});
```

## Framework Guides

Each framework has a short guide covering installation, route-handler patterns, error handling, and CI-ready wiring:

- [**Express guide**](/middleware/express) — `payMiddleware` and `requirePayment`, Express 4 and 5, error-handling middleware, cookbook routes.
- **Next.js guide** — `withPay` and `withPaywall` for App Router route handlers, `dynamic = "force-dynamic"`, Vercel env vars.
- **FastAPI guide** — `PayMiddleware` (Starlette) and `require_payment` (Depends), dependency injection patterns, async handlers.

See also [fetch() Wrapper](/sdk/fetch) for the underlying `createPayFetch` / `create_pay_fetch` API and [pay-gate](/gate/) for the reverse-proxy alternative to provider middleware.

## What's Not Covered

These middleware packages deliberately do not address:

- **Browser-side x402.** Wallet keys in browser storage are not safe. Use [OWS](https://openwalletstandard.org/) for browser signing.
- **Edge middleware and edge runtimes.** Edge functions cannot hold wallet state or sign transactions reliably.
- **Next.js Pages Router.** Legacy route style; use Express middleware via a custom server.
- **Next.js Server Actions.** Form-bound, not HTTP API consumption. Use a route handler with `withPay` instead.
- **Go / Rust / Java / C# / Ruby middleware.** Not planned. Use [pay-gate](/gate/) as a sidecar.
- **Wallet key rotation.** One wallet = one key. Rotate by creating a new wallet and draining the old one via `pay withdraw`.
- **Per-user wallet management.** All middleware uses a single server-side wallet. Multi-tenant wallet custody is an application-layer concern.
