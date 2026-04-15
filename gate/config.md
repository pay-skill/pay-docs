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
    description: "Search premium data" # in x402 402 response
    mime_type: "application/json"    # in x402 402 response
    info:                            # structured Bazaar info block
      input:
        type: "http"
        method: "GET"
        queryParams:
          q:
            type: "string"
            required: true
            description: "Search query"
          limit:
            type: "integer"
            description: "Max results (default 50)"

  - path: "/api/v1/report"
    method: "POST"                   # match specific HTTP method
    price: "5.00"
    settlement: "direct"             # on-chain per call
    info:
      input:
        type: "http"
        method: "POST"
        bodyType: "json"
        body:
          type: "object"
          required: ["start_date", "end_date"]
          properties:
            start_date:
              type: "string"
              description: "YYYY-MM-DD"
            end_date:
              type: "string"
              description: "YYYY-MM-DD"

  - path: "/api/v1/generate/*"
    price_endpoint: "http://localhost:8080/internal/pricing"
    settlement: "tab"                # dynamic pricing
    info:
      input:
        type: "http"
        method: "POST"
        bodyType: "json"
        body:
          type: "object"
          required: ["prompt"]
          properties:
            prompt:
              type: "string"
            model:
              type: "string"
              description: "Model name (default gpt-4)"
      output:
        type: "json"

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
| `description` | string | No | Resource description in 402 response (e.g. `"Weather forecast data"`) |
| `mime_type` | string | No | Response MIME type in 402 response (e.g. `"application/json"`) |
| `info` | object | No | Bazaar info block — structured input/output description for agents. See [Info Block](#info-block). |
| `route_template` | string | No | Route template with named path params (e.g. `"/users/:id"`). See [Route Templates](#route-templates). |
| `proxy_rewrite` | string | No | Rewrite path before proxying (Worker only) |
| `proxy_params` | object | No | Query params to add to proxied request (Worker only) |

## Info Block

The `info` block replaces the old `hint` field with a structured description of what a route accepts and returns. Agents use this to construct valid requests before paying. When present, pay-gate also validates inbound requests against it (see [Request Validation](#request-validation)).

### HTTP GET/HEAD/DELETE

```yaml
info:
  input:
    type: "http"
    method: "GET"
    queryParams:
      q:
        type: "string"
        required: true
        description: "Search query"
      limit:
        type: "integer"
        description: "Max results"
    pathParams:
      id:
        type: "string"
        required: true
        description: "Resource ID"
  output:
    type: "json"
    example: { "results": [] }
```

### HTTP POST/PUT/PATCH

```yaml
info:
  input:
    type: "http"
    method: "POST"
    bodyType: "json"          # "json", "form-data", or "text"
    body:                     # JSON Schema (draft 2020-12)
      type: "object"
      required: ["prompt"]
      properties:
        prompt:
          type: "string"
        model:
          type: "string"
    queryParams:
      stream:
        type: "boolean"
        description: "Stream response"
  output:
    type: "json"
```

The `body` field is a standard JSON Schema. Use the `required` array at the object level to declare mandatory fields.

### MCP Tool

```yaml
info:
  input:
    type: "mcp"
    tool: "get_weather"
    description: "Get weather for a city"
    inputSchema:
      type: "object"
      required: ["city"]
      properties:
        city:
          type: "string"
    transport: "streamable-http"
```

### Info Block Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `input.type` | string | Yes | `"http"` or `"mcp"` |
| `input.method` | string | Yes (http) | HTTP method. GET/HEAD/DELETE use `HttpQueryInput`; POST/PUT/PATCH use `HttpBodyInput`. |
| `input.bodyType` | string | Yes (POST/PUT/PATCH) | `"json"`, `"form-data"`, or `"text"` |
| `input.body` | object | Yes (POST/PUT/PATCH) | JSON Schema describing the request body |
| `input.queryParams` | object | No | Map of param name to `ParamDef` |
| `input.pathParams` | object | No | Map of param name to `ParamDef` (used with `route_template`) |
| `input.headers` | object | No | Required headers (map of name to expected value) |
| `output.type` | string | No | Response type: `"json"`, `"text"`, etc. |
| `output.format` | string | No | Response format detail |
| `output.example` | any | No | Example response |

`ParamDef` fields: `type` (string, required), `description` (string), `required` (boolean), plus any additional JSON Schema properties.

## Route Templates

Use `route_template` when your API has path parameters:

```yaml
routes:
  - path: "/users/*"
    route_template: "/users/:id"
    price: "0.01"
    info:
      input:
        type: "http"
        method: "GET"
        pathParams:
          id:
            type: "string"
            required: true
            description: "User ID"
```

When `route_template` is set, the gate uses it for route matching — each `:paramName` segment matches any single path segment. The template is included in 402 responses (`extensions.bazaar.routeTemplate`) and in `.well-known/x402` so agents know the URL pattern.

Template rules (per Bazaar spec):
- Must start with `/`
- Cannot contain `..` (before or after percent-decoding)
- Cannot contain `://`

## Request Validation

When a route has an `info` block, pay-gate validates inbound requests **after payment verification, before proxying to origin**. Validation checks (in order):

1. **Required query params** — checks `info.input.queryParams` against the URL
2. **Content-Type** — for POST/PUT/PATCH, verifies the Content-Type matches `bodyType` (`json` expects `application/json`, `form-data` expects `multipart/form-data`, `text` expects `text/`)
3. **Required JSON body fields** — for `bodyType: "json"`, checks the `body.required` array against the parsed JSON body

Validation failure returns `400 Bad Request`:

```json
{
  "error": "invalid_request",
  "message": "Missing required query parameter: q",
  "docs": "https://pay-skill.com/docs/gate"
}
```

Payment is **not refunded** on validation failure. This is intentional — it incentivizes agents to read the info block (via `.well-known/x402` or the 402 response) before paying.

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
- `info.input.type` must be `"http"` or `"mcp"`
- HTTP POST/PUT/PATCH `info` must include `bodyType` and `body`
- MCP `info` must include `tool` and `inputSchema`
- `route_template` must start with `/`, cannot contain `..` or `://`

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
