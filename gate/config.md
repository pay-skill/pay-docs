---
title: "pay-gate Configuration Reference"
description: "Complete configuration reference for pay-gate. Route pricing, settlement modes, provider address, facilitator URL, and proxy settings."
---

# Configuration

## YAML Config (Rust Binary / Docker)

### Minimal

```yaml
version: 1
provider_address: "0x..."
proxy:
  target: "http://localhost:8080"
routes:
  - path: "/api/*"
    price: "0.01"
default_action: "passthrough"
```

### Full Reference

```yaml
version: 1

# Provider's wallet address — receives USDC payments.
provider_address: "0x..."

# Upstream service.
proxy:
  target: "http://localhost:8080"
  timeout: "30s"                     # per-request timeout to origin

# Route definitions. First match wins. Order matters.
routes:
  - path: "/api/v1/premium/*"        # glob pattern
    method: "GET"
    price: "0.01"                    # $0.01 per call
    settlement: "tab"                # tab-backed micropayment
    hint: "?q={query}&limit=50"      # free-form hint for agents

  - path: "/api/v1/report"
    method: "POST"                   # match specific HTTP method
    price: "5.00"
    settlement: "direct"             # on-chain per call
    hint: '{"start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD"}'

  - path: "/api/v1/generate/*"
    price_endpoint: "http://localhost:8080/internal/pricing"
    settlement: "tab"                # dynamic pricing
    hint: '{"prompt": "string", "model": "gpt-4"}'

  - path: "/api/v1/health"
    free: true                       # no payment required

  - path: "/api/v1/admin/*"
    free: true
    allowlist:                       # only these agents pass
      - "0xaaaa..."

# Unmatched routes. REQUIRED — no implicit default.
default_action: "passthrough"        # "passthrough" or "block"

# Agents that skip payment on ALL routes.
global_allowlist: []

# Rate limiting per source IP.
rate_limits:
  per_agent: "1000/min"
  verification: "100/s"

# What happens when the facilitator is unreachable.
fail_mode: "closed"                  # "closed" (503) or "open" (pass through)

log:
  level: "info"                      # debug, info, warn, error
  format: "json"                     # json or text
```

## Environment Overrides

All config values can be set via environment variables. Env vars override YAML:

| Variable | Overrides |
|----------|-----------|
| `PAY_GATE_PROVIDER_ADDRESS` | `provider_address` |
| `PAY_GATE_PROXY_TARGET` | `proxy.target` |
| `PAY_GATE_DEFAULT_ACTION` | `default_action` |
| `PAY_GATE_FAIL_MODE` | `fail_mode` |
| `PAY_GATE_LOG_LEVEL` | `log.level` |

## Cloudflare Worker Config

Worker uses `wrangler.toml` for deployment and KV for route config.

### wrangler.toml

```toml
name = "my-api-gate"
main = "src/index.ts"
compatibility_date = "2026-04-01"

[vars]
PROVIDER_ADDRESS = "0x..."
PROXY_TARGET = "https://api.example.com"
DEFAULT_ACTION = "passthrough"
FAIL_MODE = "closed"
```

### Routes (KV)

Store routes as JSON in a KV namespace. Updatable without redeployment:

```json
[
  { "path": "/api/v1/premium/*", "price": "0.01", "settlement": "tab" },
  { "path": "/api/v1/report", "method": "POST", "price": "5.00", "settlement": "direct" },
  { "path": "/api/v1/health", "free": true }
]
```

## Route Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Glob pattern (e.g. `/api/*`, `/exact/path`) |
| `method` | string | No | HTTP method filter (e.g. `POST`). Omit to match all. |
| `price` | string | If not free | Dollar amount per call (e.g. `"0.01"`) |
| `settlement` | string | No | `"direct"` or `"tab"`. Auto-selects if omitted. |
| `free` | boolean | No | Skip payment for this route |
| `allowlist` | string[] | No | Agent addresses that skip payment |
| `price_endpoint` | string | No | URL for dynamic pricing |
| `hint` | string | No | Free-form usage hint for agents (e.g. `"?q={city}"`, `'{"prompt": "string"}'`) |
| `proxy_rewrite` | string | No | Rewrite path before proxying (Worker only) |
| `proxy_params` | object | No | Query params to add to proxied request (Worker only) |

## Dynamic Pricing

If a route has `price_endpoint`, pay-gate POSTs to it before generating the 402:

```json
// Request to price_endpoint
{ "method": "GET", "path": "/api/v1/generate/image" }

// Expected response
{ "price": "0.05" }
```

If the endpoint is unreachable and the route also has a static `price`, the static price is used as fallback. If no static price, pay-gate returns 503.

## Validation

pay-gate validates config on startup. Invalid config = refuse to start.

- `provider_address` must be a valid 42-character hex address
- `proxy.target` must be a valid URL
- `price` must be a positive decimal
- `settlement` must be `"direct"` or `"tab"`
- `default_action` must be `"passthrough"` or `"block"`
- Route without `price`, `price_endpoint`, or `free: true` is rejected

Test your config without starting:

```bash
pay-gate validate --config pay-gate.yaml
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `pay-gate start` | Production mode (mainnet) |
| `pay-gate dev` | Dev mode (testnet, verbose) |
| `pay-gate mock` | Mock mode (accepts all payments) |
| `pay-gate start --sidecar` | Sidecar mode |
| `pay-gate validate` | Check config |
| `pay-gate init` | Generate starter config |
| `pay-gate version` | Print version |
