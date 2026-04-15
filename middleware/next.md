---
title: "Next.js Middleware — @pay-skill/next"
description: "x402 payments inside Next.js App Router route handlers. withPay wraps consumer routes; withPaywall gates provider routes. Vercel-ready."
---

# Next.js Middleware

`@pay-skill/next` wraps the [Ᵽay SDK](/sdk/typescript) for Next.js **App Router** route handlers. Two exports:

- **`withPay(wallet, handler, options?)`** — consumer. Wraps a route handler so it receives a `pay` context with a pay-enabled fetch.
- **`withPaywall(options, handler)`** — provider. Gates a route handler behind x402 payment verification.

Start at the [middleware overview](/middleware/) if you haven't picked a package yet.

## What's Supported

| Next.js feature | Supported |
|-----------------|-----------|
| App Router route handlers (`app/**/route.ts`) | **Yes** |
| Node.js runtime | **Yes** |
| Edge runtime | No (no wallet state, no signing) |
| Pages Router (`pages/api/**`) | No — use [Express middleware](/middleware/express) via a custom server |
| Server Actions | No — not an API consumption surface |
| Middleware (`middleware.ts`) | No — runs on Edge |

All examples on this page are Node.js runtime + App Router. This is the only combination where the package is designed to work.

## Install

```bash
npm install @pay-skill/sdk @pay-skill/next
```

Peer dependencies:

| Package | Range |
|---------|-------|
| `@pay-skill/sdk` | `>=0.1.0` |
| `next` | `>=13.4.0` (App Router stable) |
| Node.js | `>=18.0.0` |

The package is ESM-only. Next.js handles ESM imports transparently in the App Router.

## Consumer — `withPay`

Wrap any route handler with `withPay(wallet, handler)`. The handler signature becomes `(req, pay) => Response`, where `pay.fetch` auto-settles 402 responses and `pay.wallet` is the wallet instance.

```typescript
// app/api/forecast/route.ts
import { withPay } from "@pay-skill/next";
import { Wallet } from "@pay-skill/sdk";

// Module-scope wallet — one per worker.
const wallet = await Wallet.create();

export const dynamic = "force-dynamic";

export const GET = withPay(
  wallet,
  async (req, pay) => {
    const { searchParams } = new URL(req.url);
    const city = searchParams.get("city") ?? "NYC";

    const upstream = await pay.fetch(
      `https://weather.example.com/v1/forecast?city=${encodeURIComponent(city)}`,
    );
    if (!upstream.ok) {
      return Response.json({ error: upstream.statusText }, { status: upstream.status });
    }
    return Response.json(await upstream.json());
  },
  {
    maxPerRequest: 1.00,
    maxTotal: 100.00,
    onPayment: ({ url, amount, settlement }) => {
      console.log(`[pay] $${amount.toFixed(2)} (${settlement}) -> ${url}`);
    },
  },
);
```

### Why `dynamic = "force-dynamic"`

Route handlers that call paid APIs must opt out of static rendering. Without `export const dynamic = "force-dynamic"`, Next.js may attempt to render the route at build time, which fails because the wallet's network calls cannot run during `next build`. Add `force-dynamic` to every route handler that uses `withPay`.

### Options

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `maxPerRequest` | `number` | none | Max dollars for a single 402 settlement |
| `maxTotal` | `number` | none | Max total dollars across the handler's lifetime |
| `onPayment` | `(event) => void` | none | Called after each successful payment |

These pass directly to [`createPayFetch`](/sdk/fetch#budget-controls). The `createPayFetch` instance is created once when the module loads and shared across requests — `maxTotal` accumulates across the entire worker lifetime, not per request.

### Handling budget-exceeded errors

```typescript
import { PayBudgetExceededError } from "@pay-skill/sdk";

export const GET = withPay(wallet, async (req, pay) => {
  try {
    const resp = await pay.fetch("https://expensive-api.example.com/generate");
    return Response.json(await resp.json());
  } catch (err) {
    if (err instanceof PayBudgetExceededError) {
      return Response.json(
        { error: "budget_exceeded", limitType: err.limitType, spent: err.spent },
        { status: 503 },
      );
    }
    throw err;
  }
});
```

## Provider — `withPaywall`

Gate a route handler behind an x402 paywall. Unpaid requests return 402 with a `PAYMENT-REQUIRED` header; verified requests call the handler with a `PaymentInfo` argument.

```typescript
// app/api/quote/route.ts
import { withPaywall } from "@pay-skill/next";

const PROVIDER = "0xYourProviderWallet0000000000000000000000";

export const dynamic = "force-dynamic";

export const GET = withPaywall(
  {
    price: 0.01,
    settlement: "tab",
    providerAddress: PROVIDER,
  },
  async (_req, payment) => {
    return Response.json({
      quote: "The best way out is always through.",
      author: "Robert Frost",
      paidBy: payment.from,
    });
  },
);
```

One-shot direct-settlement example:

```typescript
// app/api/report/route.ts
import { withPaywall } from "@pay-skill/next";

const PROVIDER = "0xYourProviderWallet0000000000000000000000";

export const dynamic = "force-dynamic";

export const POST = withPaywall(
  {
    price: 2.00,
    settlement: "direct",
    providerAddress: PROVIDER,
  },
  async (req, payment) => {
    const body = await req.json();
    return Response.json({
      report: generateReport(body),
      paidBy: payment.from,
    });
  },
);
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

See the [overview](/middleware/#the-two-primitives) for the full facilitator `/verify` flow.

### Using `payment` in your handler

```typescript
export const GET = withPaywall(
  { price: 0.05, settlement: "tab", providerAddress: PROVIDER },
  async (req, payment) => {
    payment.from         // "0xAgentWallet..." — verified payer
    payment.amount       // 50000 — micro-USDC
    payment.settlement   // "tab"
    payment.verified     // always true
    return Response.json({ /* ... */ });
  },
);
```

Unlike the Express middleware, `withPaywall` does not mutate `req.headers`. The `PaymentInfo` is passed as the handler's second argument.

### Fail modes

| `failMode` | Behavior when facilitator is unreachable |
|------------|-----------------------------------------|
| `"closed"` (default) | 503 response, handler never runs. Safe default. |
| `"open"` | Handler runs with an empty `payment.from`. Use only for non-financial routes. |

## Multiple HTTP Methods on One Route

App Router routes can export multiple HTTP-method handlers. Each can be wrapped independently:

```typescript
// app/api/quote/route.ts
import { withPay, withPaywall } from "@pay-skill/next";
import { Wallet } from "@pay-skill/sdk";

const wallet = await Wallet.create();
const PROVIDER = wallet.address;

export const dynamic = "force-dynamic";

// Public free route
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

// Paid read — provider pattern
export const GET = withPaywall(
  { price: 0.01, settlement: "tab", providerAddress: PROVIDER },
  async (_req, payment) => Response.json({ quote: randomQuote(), paidBy: payment.from }),
);

// Paid write that also calls an upstream paid API — both patterns
export const POST = withPay(wallet, async (req, pay) => {
  const { text } = await req.json();
  const upstream = await pay.fetch("https://llm.example.com/summarize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return Response.json({ summary: (await upstream.json()).summary });
});
```

`withPay` and `withPaywall` can be composed on the same route by chaining — wrap with `withPaywall` on the outside and `withPay` on the inside if you need both the payer identity and a pay-enabled fetch:

```typescript
export const POST = withPaywall(
  { price: 0.05, settlement: "tab", providerAddress: wallet.address },
  withPay(wallet, async (req, pay) => {
    // payment info is lost here — chain order matters.
    const upstream = await pay.fetch("https://llm.example.com/summarize", {
      method: "POST",
      body: await req.text(),
    });
    return Response.json(await upstream.json());
  }),
);
```

`withPay` returns a route-handler signature `(req) => Response`, which `withPaywall` accepts as its inner handler. The caveat: the inner handler does not see `payment`. If you need both, use `withPaywall` alone and construct a pay-enabled fetch manually:

```typescript
import { createPayFetch } from "@pay-skill/sdk";

const payFetch = createPayFetch(wallet, { maxPerRequest: 0.50 });

export const POST = withPaywall(
  { price: 0.05, settlement: "tab", providerAddress: wallet.address },
  async (req, payment) => {
    const { text } = await req.json();
    const upstream = await payFetch("https://llm.example.com/summarize", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    return Response.json({ summary: (await upstream.json()).summary, paidBy: payment.from });
  },
);
```

## Production Setup

### Vercel

Set `PAYSKILL_KEY` in your Vercel project environment variables, then initialize the wallet from env:

```typescript
// app/api/forecast/route.ts
import { withPay } from "@pay-skill/next";
import { Wallet } from "@pay-skill/sdk";

const wallet = Wallet.fromEnv();   // reads PAYSKILL_KEY

export const dynamic = "force-dynamic";
export const runtime = "nodejs";    // explicit — edge not supported

export const GET = withPay(wallet, async (req, pay) => {
  const data = await pay.fetch("https://api.example.com/data");
  return Response.json(await data.json());
});
```

```bash
vercel env add PAYSKILL_KEY production
```

### Self-hosted (Docker, standalone output)

```dockerfile
# Dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
ENV NODE_ENV=production
CMD ["node", "server.js"]
```

Inject `PAYSKILL_KEY` via your orchestrator's secret mechanism (Kubernetes secret, Docker secret, ECS task role). Never bake the key into the image.

### Mainnet default

All examples on this page target mainnet (`https://pay-skill.com/x402`). For Base Sepolia:

```typescript
const wallet = new Wallet({ testnet: true });    // or PAYSKILL_TESTNET=1
```

Point `withPaywall` at the testnet facilitator in the same call:

```typescript
export const GET = withPaywall(
  {
    price: 0.01,
    settlement: "tab",
    providerAddress: PROVIDER,
    facilitatorUrl: "https://testnet.pay-skill.com/x402",
  },
  handler,
);
```

Fund with `pay fund` from your laptop before your first request.

## Troubleshooting

### "Error occurred prerendering page" at `next build`

The route is static-rendered and tries to open a network connection during build. Add `export const dynamic = "force-dynamic"` to the route file.

### "Cannot use edge runtime" / "global is not defined"

You exported `runtime = "edge"`. Remove it, or set it explicitly to `runtime = "nodejs"`. The package cannot hold a wallet or sign in Edge runtime.

### Wallet constructed per request instead of per worker

You placed `Wallet.create()` inside the handler body. Move it to module scope — one wallet per process, not per request. Handlers share the wallet via closure:

```typescript
// correct
const wallet = await Wallet.create();
export const GET = withPay(wallet, async (req, pay) => { /* ... */ });

// wrong — creates a new wallet every request, doesn't share tabs
export const GET = async (req) => {
  const wallet = await Wallet.create();
  const pay = createPayFetch(wallet);
  // ...
};
```

### 402 on every request even after payment

Your client is reading the 402 and retrying **without** the `PAYMENT-SIGNATURE` header. Verify the client uses the Ᵽay [fetch() wrapper](/sdk/fetch) or [`wallet.request()`](/sdk/typescript), which handle the retry automatically. Ad-hoc clients must read `PAYMENT-REQUIRED`, settle via the facilitator, and retry with `PAYMENT-SIGNATURE: <base64-payload>`.

### 503 `facilitator_unavailable` on every request

The route cannot reach `https://pay-skill.com/x402/verify` within 5 seconds. On Vercel, confirm your deployment's outbound region has Internet access. On self-hosted platforms, check firewall rules and DNS.

### `withPaywall` handler runs but `payment.from` is empty

`failMode` is `"open"` and the facilitator was unreachable — the handler was called with a fallback `PaymentInfo`. Switch to `failMode: "closed"` (the default) for any route that must actually charge.

## What's Not Covered

- **Edge runtime.** No wallet state, no signing. Use Node.js runtime.
- **Pages Router.** Use [Express middleware](/middleware/express) via a Next.js custom server, or migrate the route to the App Router.
- **Server Actions.** Form-bound, not an API consumption surface. Use an App Router route handler with `withPay`.
- **`middleware.ts`.** Runs on Edge. Put gating logic inside the route handler with `withPaywall`.
- **Per-user wallet custody.** Single server-side wallet per deployment. Multi-tenant wallet management is application-layer.

## Next Steps

- [Middleware overview](/middleware/) — decision tree and primitives reference.
- [Express guide](/middleware/express) — the peer package, useful if you also run an Express API.
- [fetch() Wrapper](/sdk/fetch) — underlying `createPayFetch` that backs `withPay`.
- [TypeScript SDK](/sdk/typescript) — `Wallet` API for direct payments, tabs, and webhook registration.
