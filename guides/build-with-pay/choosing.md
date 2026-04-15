---
title: "Choosing Your Integration — Middleware, SDK, CLI, or pay-gate"
description: "Before picking an Express or FastAPI package, decide whether you need application middleware at all. Five common scenarios and the right Ᵽay integration layer for each."
---

# Choosing Your Integration

Ᵽay exposes five integration layers, and the right one depends less on your language and more on **what you are building**. Before jumping to `@pay-skill/express` or `payskill-fastapi`, decide whether you need application middleware at all. A single-shot script, a standalone agent, and a long-running HTTP server all have different best answers.

This page walks through the five scenarios we see most often and links to the right per-framework page once you have picked a lane. For the lower-level "which framework package do I install" question, see the [middleware overview](/middleware/).

## The Five Scenarios at a Glance

| Your situation | Use | Docs |
|----------------|-----|------|
| Agent with a wallet, calling APIs directly | CLI (`pay request`) or MCP server | [CLI reference](/cli/), [Claude Desktop quickstart](/quickstart/claude-desktop) |
| Code that makes one paid HTTP call | `createPayFetch` / `create_pay_fetch` directly | [fetch() Wrapper](/sdk/fetch) |
| HTTP server consuming paid APIs inside route handlers | Consumer middleware | [Application Middleware](/middleware/) |
| HTTP server providing paid APIs to other agents | Provider middleware or pay-gate | [Application Middleware](/middleware/), [pay-gate](/gate/) |
| Existing HTTP server that is not Node or Python | pay-gate as a sidecar | [pay-gate](/gate/) |

The rest of this page expands each row with a concrete example and the trade-offs that push you toward one layer over another. Mainnet is the default in every snippet below. The core SDK supports testnet via `testnet: true` / `PAYSKILL_TESTNET=1`, but everything we advertise in production is mainnet.

## Scenario 1: Agent With a Wallet, Calling APIs Directly

You are an AI agent (Claude Desktop, Cursor, a custom tool loop, a shell script). The agent already holds a wallet. It needs to call a paid HTTP API and move on. There is no long-running web server in the picture.

**Pick this lane if all of the following are true:**

- The caller is an agent or a script, not a web application
- You do not need to share the wallet with other processes
- You want the shortest possible integration

**The right answer is the CLI or the MCP server, not middleware.**

```bash
# Initialize once
pay init              # generates a key in the OS keychain
pay fund              # top up via Coinbase Onramp
pay status            # confirm the balance

# Every subsequent call handles 402 automatically
pay request https://api.example.com/data
pay request -X POST -d '{"query":"test"}' https://api.example.com/search
```

`pay request` is the simplest x402-aware HTTP client Ᵽay ships. It reads the same keychain `Wallet.create()` uses, so the CLI and any Node or Python process on the same machine share a wallet without any wiring.

For an AI assistant that wants tools instead of shell commands, install the [MCP server](/quickstart/claude-desktop) and call `pay_request` as a tool. Same wallet, same keychain, no Express or FastAPI involved.

**Further reading:** [CLI reference](/cli/), [Claude Desktop quickstart](/quickstart/claude-desktop).

## Scenario 2: Code That Makes One Paid HTTP Call

You are writing a script, a Lambda handler, a cron job, or a data pipeline. You need exactly one function call to handle 402 responses. There is no Express app, no FastAPI app, and no long-lived `req.pay` context to attach to.

**Pick this lane if all of the following are true:**

- You call paid APIs from your code, but you do not host an HTTP server yourself
- You do not want a peer dep on `@pay-skill/express` or `payskill-fastapi` just to make one call
- You want to inject a custom fetch into an existing SDK (OpenAI, Anthropic, Vercel AI SDK, LangChain)

**The right answer is `createPayFetch` / `create_pay_fetch` directly.** It is a thin wrapper around the SDK's `wallet.request()` that exposes a callable with the same interface as `fetch()`.

::: code-group

```typescript [TypeScript]
import { Wallet, createPayFetch } from "@pay-skill/sdk";

const wallet = await Wallet.create();           // OS keychain, mainnet
const payFetch = createPayFetch(wallet, {
  maxPerRequest: 1.00,                          // reject any single payment over $1
  maxTotal: 50.00,                              // reject once $50 total has been spent
});

// Use it directly
const resp = await payFetch("https://api.example.com/data");
const data = await resp.json();

// Or inject into any SDK that accepts a custom fetch
import OpenAI from "openai";
const openai = new OpenAI({ fetch: payFetch });
```

```python [Python]
from payskill import Wallet, create_pay_fetch

wallet = Wallet.create()                        # OS keychain, mainnet
pay_fetch = create_pay_fetch(
    wallet,
    max_per_request=1.00,                       # reject any single payment over $1
    max_total=50.00,                            # reject once $50 total has been spent
)

# Use it directly
resp = pay_fetch("https://api.example.com/data")
data = resp.json()

# Or mount on an httpx.Client via its transport
import httpx
client = httpx.Client(transport=pay_fetch.transport())
```

:::

This is the primitive every other consumer integration is built on. The middleware packages in Scenario 3 wrap this same call and attach the result to a framework's request context.

**Further reading:** [fetch() Wrapper](/sdk/fetch), [TypeScript SDK](/sdk/typescript), [Python SDK](/sdk/python).

## Scenario 3: HTTP Server Consuming Paid APIs Inside Route Handlers

You run an Express, Next.js, or FastAPI server. Inside your route handlers you call upstream APIs that are gated by x402, and you want every handler to treat those calls like ordinary `fetch()` without ever seeing a 402. You want budget limits, a shared wallet, and a single `onPayment` log stream for auditing.

**Pick this lane if all of the following are true:**

- Your app is a long-running HTTP server (not a cron job or a one-off script)
- Multiple routes need to call paid upstream APIs
- You want spending caps, per-payment logging, and shared state enforced in one place

**The right answer is consumer middleware.** Each framework has its own package; all three wrap the same `createPayFetch` primitive from Scenario 2.

::: code-group

```typescript [TypeScript (Express)]
import express from "express";
import { Wallet } from "@pay-skill/sdk";
import { payMiddleware } from "@pay-skill/express";

const wallet = await Wallet.create();
const app = express();

app.use(payMiddleware(wallet, {
  maxPerRequest: 1.00,
  maxTotal: 100.00,
}));

app.get("/forecast", async (req, res) => {
  const data = await req.pay.fetch("https://weather.example.com/forecast?city=NYC");
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
    max_per_request=1.00,
    max_total=100.00,
)

@app.get("/forecast")
async def forecast(request: Request):
    resp = request.state.pay.fetch("https://weather.example.com/forecast?city=NYC")
    return resp.json()
```

:::

The exact attachment point depends on the framework — `req.pay.fetch` in Express, `request.state.pay.fetch` in FastAPI, `pay.fetch` as the second argument to a `withPay`-wrapped handler in Next.js. The underlying primitive is the same.

**Further reading:** [Application Middleware overview](/middleware/), [Express guide](/middleware/express), [Next.js guide](/middleware/next), [FastAPI guide](/middleware/fastapi).

## Scenario 4: HTTP Server Providing Paid APIs to Other Agents

You host an API that other agents pay to call. Every request must present a valid x402 payment before your handler runs. You have two real options, and the right one depends on whether you want payment gating **inside your application code** or **as an external proxy**.

### Option A: Provider middleware

Pick this if any of the following is true:

- You want payment info on the request object (`req.payment`, `PaymentInfo`) so handlers can use the payer address for analytics, logging, or tiered rate limiting
- You want per-route pricing declared next to the route definition, not in a separate config file
- You want the same process that runs your business logic to own payment verification
- You already have an Express, Next.js, or FastAPI app and want a one-line change per route

```typescript
// Express
import { requirePayment } from "@pay-skill/express";

app.get("/api/data", requirePayment({
  price: 0.01,
  settlement: "tab",
  providerAddress: "0xYourProviderWallet...",
}), (req, res) => {
  res.json({ data: "premium", paidBy: req.payment.from });
});
```

See [Application Middleware overview](/middleware/) for the equivalent Next.js (`withPaywall`) and FastAPI (`require_payment` via `Depends`) forms.

### Option B: pay-gate (reverse proxy)

Pick this if any of the following is true:

- Your API server runs in a language Ᵽay does not ship middleware for (Go, Rust, Ruby, Java, C#, Elixir)
- You want **zero code changes to your backend** — deploy a proxy, set prices in a YAML file, done
- You want payment verification to be a separate process from your business logic (blast radius, deploy cadence, team ownership)
- You are already running nginx, Caddy, Envoy, or Traefik and want to slot in a sidecar

```
Agent ─────> pay-gate ─────> Your API (unchanged)
                |
          pay-skill.com/x402
             (facilitator)
```

pay-gate reads a config file describing per-route pricing, handles 402 and verify, and forwards the verified request to your origin with the same `X-Pay-*` headers that the middleware packages set. Handlers written against middleware can read from pay-gate without changes.

**How to decide:** If you are already writing Node or Python and you want the payment context in your handler, pick middleware. If you are running anything else, or you want to deploy payment gating independently of your app, pick pay-gate.

**Further reading:** [Application Middleware overview](/middleware/), [Express guide](/middleware/express), [Next.js guide](/middleware/next), [FastAPI guide](/middleware/fastapi), [pay-gate overview](/gate/), [pay-gate quickstart](/gate/quickstart).

## Scenario 5: Existing HTTP Server That Is Not Node or Python

You already run a production API in Go, Rust, Ruby, Java, C#, Elixir, PHP, or something else. Rewriting it in Node or Python to get Ᵽay middleware is not on the table.

**Pick this lane if any of the following is true:**

- Your API is in a language we do not ship middleware for
- You cannot or will not change the backend code
- You want to keep your existing deploy pipeline, observability, and rate limiting

**The right answer is pay-gate as a sidecar.** It deploys in front of your API as a reverse proxy, handles 402 and facilitator verification, and forwards verified requests to your origin with payment headers attached. Your backend sees only paid requests and can read `X-Pay-From`, `X-Pay-Amount`, and `X-Pay-Settlement` from the incoming headers for per-payer analytics.

```
Agent ───> pay-gate ───> Your Go / Rust / Ruby / Java API
```

pay-gate ships in four forms so you can match your existing deployment shape:

| Form | Best for |
|------|----------|
| Cloudflare Worker | Zero-ops, auto-scaling, free tier for most providers |
| Rust binary | Self-hosted, Docker, systemd |
| Docker image | Container orchestration, Kubernetes |
| Sidecar alongside nginx / Caddy / Envoy / Traefik | Existing reverse-proxy stacks |

**Further reading:** [pay-gate overview](/gate/), [pay-gate quickstart](/gate/quickstart), [pay-gate configuration](/gate/config).

## Anti-Patterns

A few patterns we see people reach for that usually lead somewhere worse.

**Don't build x402 verification from scratch.** The protocol has signing, nonce, and replay protections that are easy to get wrong. Use pay-gate or provider middleware. Both call the same hosted facilitator under the hood, so there is no performance or flexibility reason to roll your own.

**Don't install middleware for a single paid call.** If one route handler makes one paid `fetch()` call, `createPayFetch` from Scenario 2 is simpler than pulling in `@pay-skill/express` for the whole app. Reach for the framework adapter when more than one handler needs a shared wallet, budget, or audit log.

**Don't mix provider middleware and pay-gate on the same routes.** Running both in front of the same endpoint double-charges the payer — pay-gate verifies, forwards the request, and then middleware tries to verify a second time against a `PAYMENT-SIGNATURE` header that has already been consumed. Pick one layer per route.

**Don't use a browser wallet to call x402 APIs.** All the patterns on this page assume server-side wallets. Browser storage is not a safe place for signing keys. For browser signing, see [OWS (Open Wallet Standard)](https://openwalletstandard.org/).

**Don't put testnet in your README.** The SDK, CLI, and middleware all default to Base mainnet. Testnet exists for our own development and is not something we advertise to downstream developers. Fund real USDC and use real amounts; most integration calls cost a fraction of a cent.

## What This Page Does Not Cover

This page answers the "which integration layer" question one level above the [middleware overview](/middleware/). Once you have picked a lane, follow the framework-specific link for the how-to. Specifically:

- **Per-framework install and route patterns** live on [/middleware/express](/middleware/express), [/middleware/next](/middleware/next), and [/middleware/fastapi](/middleware/fastapi).
- **The `createPayFetch` / `create_pay_fetch` API reference** lives on [fetch() Wrapper](/sdk/fetch).
- **pay-gate deployment shapes** live on [/gate/quickstart](/gate/quickstart) and [/gate/config](/gate/config).
- **Wallet funding, the `pay fund` / `pay status` commands, and the keychain setup** live on the [CLI reference](/cli/).

Later pages in this guide cover production concerns that apply across all five scenarios: wallet key management, tab lifecycle across restarts, spending controls and budgeting, error handling for x402, a pre-production checklist, and how to choose between tab and direct settlement.
