---
title: "pay-gate Implementation Guide — Zero to Production"
description: "End-to-end guide for deploying pay-gate. Provider setup, route pricing, settlement modes, testing, and production deployment."
---

# Implementing pay-gate: End-to-End Guide

This guide walks through everything a provider needs to go from zero to a production pay-gate deployment. By the end, your HTTP API will accept USDC payments from AI agents — no changes to your backend code.

## What You're Building

pay-gate is a reverse proxy. It sits in front of your API and handles x402 payment negotiation with agents automatically:

```
Agent ──> pay-gate ──> Your API
             |
       pay-skill.com/x402
         (facilitator)
```

When an agent hits a paid route without paying, pay-gate returns a `402 Payment Required` response with pricing details. The agent's SDK reads those details, pays, and retries — all transparent to your backend. Your backend just sees normal requests with extra `X-Pay-*` headers telling you who paid and how much.

## Prerequisites

**A wallet address.** This is where your USDC revenue lands. If you don't have one:

```bash
cargo install pay-cli
pay init
pay address
# 0xYourProviderAddress
```

**An API to monetize.** Any HTTP service — Express, FastAPI, Rails, a static file server, anything that listens on a port.

**A deployment target.** Pick one:

| Target | When to use |
|--------|------------|
| Cloudflare Worker | You want zero-ops. Auto-scaling, free tier (100k req/day). |
| Rust binary | You're self-hosting. Docker, systemd, bare metal. |
| Docker | Container orchestration (K8s, Compose, ECS). |
| Sidecar | You already run nginx, Traefik, Caddy, or Envoy. |

## Step 1: Choose Your Deployment

### Option A: Cloudflare Worker

The fastest path. Scaffolds a Hono worker with your config baked in.

```bash
npm create pay-gate my-api-gate
cd my-api-gate
```

The CLI asks three things: your provider address, your origin URL, and which routes to charge for. It generates a `wrangler.toml` and a `routes.json`.

Set up route storage:

```bash
npx wrangler kv namespace create ROUTES
# Copy the namespace ID into wrangler.toml

npx wrangler kv bulk put routes.json --namespace-id <id>
```

Test locally, then deploy:

```bash
npx wrangler dev     # local dev server
npx wrangler deploy  # production
```

Your `wrangler.toml` looks like this:

```toml
name = "my-api-gate"
main = "src/index.ts"
compatibility_date = "2026-04-01"

[vars]
PROVIDER_ADDRESS = "0xYourProviderAddress"
PROXY_TARGET = "https://api.example.com"
DEFAULT_ACTION = "passthrough"
FAIL_MODE = "closed"

[[kv_namespaces]]
binding = "ROUTES"
id = "abc123"
```

Routes live in KV, so you can update pricing without redeploying:

```json
[
  { "path": "/api/v1/premium/*", "price": "0.01", "settlement": "tab" },
  { "path": "/api/v1/report", "method": "POST", "price": "5.00", "settlement": "direct" },
  { "path": "/api/v1/health", "free": true }
]
```

### Option B: Rust Binary

Single static binary. No runtime dependencies.

```bash
cargo install pay-gate
pay-gate init
```

This generates a `pay-gate.yaml`. Edit it:

```yaml
version: 1

provider_address: "0xYourProviderAddress"

proxy:
  target: "http://localhost:8080"

routes:
  - path: "/api/v1/premium/*"
    price: "0.01"

  - path: "/api/v1/health"
    free: true

default_action: "passthrough"
```

Start:

```bash
pay-gate start   # production (mainnet)
pay-gate dev     # development (testnet, verbose logs)
```

### Option C: Docker

Mount your config and go:

```bash
docker run \
  -v ./pay-gate.yaml:/etc/pay-gate/config.yaml \
  -p 8402:8402 \
  payskill/gate
```

Or with Compose:

```yaml
services:
  gate:
    image: payskill/gate
    ports:
      - "8402:8402"
    volumes:
      - ./pay-gate.yaml:/etc/pay-gate/config.yaml

  origin:
    image: your-api
    ports:
      - "8080:8080"
```

### Option D: Sidecar

If you already run a reverse proxy, pay-gate runs on localhost and handles auth subrequests. Your proxy asks pay-gate "should this request pass?" before forwarding to origin.

```bash
pay-gate start --sidecar
# Listens on 127.0.0.1:8402
```

Then configure your proxy to check `/__pay/check` before forwarding. The sidecar returns `200` (paid/free), `402` (needs payment), or `403` (blocked).

**Traefik** — native 402 support, cleanest integration:

```yaml
http:
  middlewares:
    pay-gate:
      forwardAuth:
        address: "http://127.0.0.1:8402/__pay/check"
        authRequestHeaders:
          - "PAYMENT-SIGNATURE"
        authResponseHeaders:
          - "X-Pay-Verified"
          - "X-Pay-From"
          - "X-Pay-Amount"
          - "X-Pay-Settlement"
          - "X-Pay-Tab"
          - "PAYMENT-REQUIRED"
```

**Caddy** — also handles 402 natively:

```
api.example.com {
    forward_auth localhost:8402 {
        uri /__pay/check
        copy_headers X-Pay-Verified X-Pay-From X-Pay-Amount PAYMENT-REQUIRED
    }
    reverse_proxy localhost:8080
}
```

**nginx** — requires the njs module (standard `auth_request` cannot forward 402 responses):

```nginx
load_module modules/ngx_http_js_module.so;

http {
    js_path /etc/nginx/njs/;
    js_import gate from gate.js;

    server {
        location /api/ {
            js_content gate.handle;
        }

        location = /__pay_check {
            internal;
            proxy_pass http://127.0.0.1:8402/__pay/check;
            proxy_set_header X-Original-URI $request_uri;
            proxy_set_header X-Original-Method $request_method;
            proxy_set_header PAYMENT-SIGNATURE $http_payment_signature;
            proxy_pass_request_body off;
            proxy_set_header Content-Length "";
        }

        location = /__origin {
            internal;
            proxy_pass http://localhost:8080;
        }
    }
}
```

The `gate.js` njs handler is in the [gate repo examples/](https://github.com/pay-skill/gate/tree/main/examples).

**Envoy** — uses `ext_authz`:

```yaml
http_filters:
  - name: envoy.filters.http.ext_authz
    typed_config:
      "@type": type.googleapis.com/envoy.extensions.filters.http.ext_authz.v3.ExtAuthz
      http_service:
        server_uri:
          uri: "127.0.0.1:8402"
          cluster: pay-gate
          timeout: 5s
        path_prefix: "/__pay/check"
        authorization_request:
          headers_to_add:
            - key: "X-Original-URI"
              value: "%REQ(:PATH)%"
            - key: "X-Original-Method"
              value: "%REQ(:METHOD)%"
```

## Step 2: Configure Routes

Routes define what costs money. First match wins — order matters.

### Static Pricing

Most routes have a fixed price:

```yaml
routes:
  - path: "/api/v1/premium/*"
    method: "GET"
    price: "0.01"                  # $0.01 per call
    hint: "?q={query}&limit=50"    # free-form hint for agents

  - path: "/api/v1/report"
    method: "POST"                 # match specific HTTP method
    price: "5.00"                  # $5.00 per call
    hint: '{"start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD"}'

  - path: "/api/v1/health"
    free: true                     # no payment required
```

The `hint` field is a free-form string that tells agents what parameters the route accepts. Query params, body examples, whatever helps an LLM construct the right request. For full API docs, point `docs_url` in your discovery config to an OpenAPI spec.

### Dynamic Pricing

For routes where cost varies (LLM inference, image generation), point to a pricing endpoint on your backend:

```yaml
routes:
  - path: "/api/v1/generate/*"
    price_endpoint: "http://localhost:8080/internal/pricing"
    settlement: "tab"
    hint: '{"prompt": "string", "model": "gpt-4"}'
```

pay-gate calls your pricing endpoint with the request details:

```json
{
  "method": "GET",
  "path": "/api/v1/generate/image",
  "headers": { "content-type": "application/json" }
}
```

Your endpoint returns the price:

```json
{ "price": "0.05" }
```

If the pricing endpoint is down and you also set a static `price`, that's used as fallback. If there's no static price, pay-gate returns `503`.

### Settlement Modes

Two modes. Pick per route, or let pay-gate auto-select:

| Route Price | Default | Why |
|-------------|---------|-----|
| <= $1.00 | `tab` | Micropayments. On-chain gas per call would exceed the price. Tabs batch thousands of calls into a few on-chain txs. |
| > $1.00 | `direct` | High-value. Per-call on-chain settlement is economical. Provider gets immediate settlement. |

Override explicitly:

```yaml
routes:
  - path: "/api/v1/cheap"
    price: "0.001"
    settlement: "tab"      # forced tab

  - path: "/api/v1/expensive"
    price: "10.00"
    settlement: "direct"   # forced direct
```

### Default Action

What happens when a request doesn't match any route. Required — no implicit default:

```yaml
default_action: "passthrough"   # unmatched routes pass through free
# or
default_action: "block"         # unmatched routes get 403
```

### Allowlists

Skip payment for specific agents:

```yaml
# Global — these wallets skip payment on ALL routes
global_allowlist:
  - "0xaaaa..."
  - "0xbbbb..."

routes:
  - path: "/api/v1/admin/*"
    free: true
    allowlist:              # per-route override
      - "0xaaaa..."
```

### Rate Limits

In-memory token bucket per agent wallet. Resets on restart.

```yaml
rate_limits:
  per_agent: "1000/min"
  verification: "100/s"     # max facilitator /verify calls per IP
```

## Step 3: Understand the Request Flow

### What Agents See

**First request (no payment):**

```
GET /api/v1/premium/data
→ 402 Payment Required
  PAYMENT-REQUIRED: base64({
    "x402Version": 2,
    "accepts": [{ "scheme": "exact", "amount": "10000",
      "payTo": "0xprovider...", "network": "eip155:8453",
      "extra": { "settlement": "tab", "facilitator": "https://pay-skill.com/x402" } }]
  })
```

The agent's SDK handles this automatically — parses the 402, opens a tab or signs a direct payment, and retries.

**Retry (with payment):**

```
GET /api/v1/premium/data
  PAYMENT-SIGNATURE: <x402 V2 proof>
→ 200 OK { data: ... }
```

### What Your Backend Sees

Every paid request arrives at your origin with extra headers:

| Header | Value |
|--------|-------|
| `X-Pay-Verified` | `true` |
| `X-Pay-From` | Agent wallet `0x...` |
| `X-Pay-Amount` | Amount in micro-USDC (6 decimals) |
| `X-Pay-Settlement` | `direct` or `tab` |
| `X-Pay-Tab` | Tab ID (tab-backed only) |

Your backend doesn't need to do anything with these. But you can use them for per-agent analytics, tiered access, or audit logging.

pay-gate never modifies your response body.

### Fail Modes

What happens when the facilitator is unreachable:

```yaml
fail_mode: "closed"   # default — return 503 if facilitator is down
# or
fail_mode: "open"     # pass requests through unpaid (availability > enforcement)
```

Use `closed` for anything with real marginal cost (LLM inference, compute, third-party API calls). An attacker who disrupts facilitator connectivity gets unlimited free access in `open` mode.

## Step 4: Test It

### Validate config

```bash
pay-gate validate
# Checks: valid address, valid URLs, no duplicate routes, valid prices
```

### Dev mode (testnet)

```bash
pay-gate dev
# Uses testnet facilitator, verbose logs
```

From another terminal:

```bash
# Unpaid request — should get 402
curl -i http://localhost:8402/api/v1/premium/data
# HTTP/1.1 402 Payment Required
# PAYMENT-REQUIRED: eyJzY2hlbWUi...

# Health check
curl http://localhost:8402/__pay/health
# {"status":"ok","facilitator":"reachable","version":"0.1.0"}

# Full flow with Pay CLI (testnet)
pay request http://localhost:8402/api/v1/premium/data --testnet
# → 200 OK (CLI handles 402, pays, retries)
```

### Mock mode (no facilitator)

For testing proxy behavior without real payments:

```bash
pay-gate mock
# Accepts all payment headers, never calls facilitator
```

## Step 5: Go to Production

### Environment variables

All YAML config values have env var overrides:

```bash
PAY_GATE_PROVIDER_ADDRESS=0x1234...
PAY_GATE_PROXY_TARGET=http://localhost:8080
PAY_GATE_PORT=8402
PAY_GATE_FAIL_MODE=closed
PAY_GATE_LOG_LEVEL=info
PAY_GATE_DEFAULT_ACTION=passthrough
```

### Start in production mode

```bash
pay-gate start
# Uses mainnet facilitator (pay-skill.com/x402)
```

### Secure your origin

pay-gate doesn't help if agents can hit your origin directly. Firewall your origin to only accept traffic from pay-gate's IP. This is your responsibility — pay-gate documents it but doesn't enforce it.

### Register webhooks (optional)

If you want real-time notifications about payments and tab events, register webhooks directly with Pay (not through pay-gate):

```bash
pay webhook register https://your-api.example.com/hooks \
  --events "payment.completed,tab.opened,tab.closed"
```

Or via SDK:

```typescript
import { Wallet } from "@pay-skill/sdk";

const provider = new Wallet({
  privateKey: process.env.PROVIDER_KEY!,
  chain: "base",
  apiUrl: "https://pay-skill.com/api/v1",
  routerAddress: "0x...",
});

await provider.registerWebhook(
  "https://your-api.example.com/hooks",
  ["payment.completed", "tab.opened", "tab.closed"],
);
```

### Make it discoverable (optional)

Add a `discovery` block to your config so agents can find your API through `pay discover`:

```yaml
discovery:
  discoverable: true
  name: "My Weather API"
  description: "Real-time weather data for any location"
  category: "data"
  keywords: ["weather", "forecast", "climate"]
```

pay-gate sends a heartbeat to the facilitator on startup and every 24 hours. Agents searching with `pay discover weather` will find your service.

## Step 6: Monitor

### Health endpoint

Always available, even if your origin is down:

```bash
curl http://localhost:8402/__pay/health
# {"status":"ok","facilitator":"reachable","uptime":3600,"version":"0.1.0"}
```

`status: "degraded"` means the facilitator is unreachable. In `closed` mode, all paid requests return 503 until connectivity recovers.

### Logs

Structured JSON logs to stdout (configurable):

```yaml
log:
  level: "info"    # debug, info, warn, error
  format: "json"   # json or text
```

pay-gate logs route matches, settlement modes, agent addresses, verification results, and latency. It never logs payment signatures or response bodies.

### Manage tabs

Providers manage tabs through the Pay platform, not pay-gate:

```bash
pay tab list             # see open tabs
pay tab close <id>       # close a specific tab
pay status               # overall balance and revenue
```

## How Fees Work

pay-gate itself is free. Standard Pay fees apply:

| Fee | Who pays | Amount |
|-----|----------|--------|
| Processing | Provider (deducted from payout) | 1% (0.75% above $50k/month) |
| Tab activation | Agent (at tab open) | max($0.10, 1% of tab amount) |
| Gas | Pay protocol | Included |

### Why tabs matter for micropayments

| Metric | Direct (per-call on-chain) | Tab (batched) |
|--------|---------------------------|---------------|
| Gas per API call | ~$0.002-$0.004 | Near-zero (batched) |
| On-chain txs for 1000 calls | 1000 | Minimal (batched) |
| Latency per call | ~2s | ~50ms |
| Minimum viable price | ~$0.01 | ~$0.0001 |

If you're charging $0.001 per call, direct settlement loses money on gas. Tab settlement makes it profitable.

## Agent Compatibility

**Direct settlement** works with any x402-compatible agent SDK:
- Pay SDKs (`@pay-skill/sdk`, `pay-sdk` for Python)
- Coinbase's `@x402/fetch`, `@x402/axios`
- Any SDK that speaks x402 V2

**Tab settlement** requires the Pay SDK, because tab lifecycle (open, charge, top-up, close) is Pay-specific.

## What pay-gate Does NOT Do

- Hold private keys
- Sign transactions or custody funds
- Store payment data (stateless)
- Process settlements (facilitator handles this)
- Terminate TLS (deploy behind nginx/Cloudflare/etc.)
- Manage webhooks (register directly with Pay)

## Complete Config Reference

```yaml
version: 1

provider_address: "0x..."

proxy:
  target: "http://localhost:8080"
  timeout: 30s

routes:
  - path: "/api/v1/premium/*"
    price: "0.01"
    settlement: "tab"

  - path: "/api/v1/report"
    method: "POST"
    price: "5.00"
    settlement: "direct"

  - path: "/api/v1/generate/*"
    price_endpoint: "http://localhost:8080/internal/pricing"
    settlement: "tab"

  - path: "/api/v1/health"
    free: true

  - path: "/api/v1/admin/*"
    free: true
    allowlist:
      - "0xaaaa..."

default_action: "passthrough"

global_allowlist: []

rate_limits:
  per_agent: "1000/min"
  verification: "100/s"

fail_mode: "closed"

discovery:
  discoverable: true
  name: "My API"
  description: "What my API does"
  category: "data"
  keywords: ["relevant", "keywords"]

log:
  level: "info"
  format: "json"
```
