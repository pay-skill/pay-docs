---
title: "Upgrading pay-gate"
description: "How to upgrade pay-gate across all deployment targets. Zero-downtime for Cloudflare Workers, sub-second restart for Rust binary."
---

# Upgrading pay-gate

pay-gate upgrades are in-place. No data migration, no state to preserve
(pay-gate is stateless). Route configuration is separate from the binary
and survives upgrades.

## Cloudflare Worker

Zero-downtime. Cloudflare deploys atomically -- old requests finish on
the old version, new requests hit the new one.

```bash
cd your-gate-project
npm update                  # pulls latest pay-gate worker code
npx wrangler deploy         # atomic deploy, zero downtime
```

Route config lives in KV and is untouched by deploys. Environment
variables in `wrangler.toml` are also preserved.

### Scaffolded projects (`npm create pay-gate`)

If you scaffolded with `npm create pay-gate`, re-run it to get the
latest template, then diff against your customizations:

```bash
npm create pay-gate@latest -- my-gate-updated
diff -r my-gate my-gate-updated/src
```

Or just update the dependencies in your existing project -- the template
source files rarely change in breaking ways.

## Rust Binary

Sub-second restart. During the restart window, the OS refuses
connections (clients retry automatically).

```bash
cargo install pay-gate      # pulls latest from crates.io
sudo systemctl restart pay-gate
```

### With Docker

```bash
docker pull payskill/gate:latest
docker compose up -d        # recreates with new image
```

Or pin to a specific version:

```bash
docker pull payskill/gate:0.2.0
```

### With Helm

```bash
helm repo update
helm upgrade pay-gate oci://ghcr.io/pay-skill/charts/pay-gate
```

## Sidecar Mode (nginx / traefik / caddy)

The gate binary runs as a sidecar, not in the hot path. Restarting
it only affects auth-check subrequests. During restart:

- `fail_mode: "closed"` (default) -- reverse proxy returns 503
- `fail_mode: "open"` -- requests pass through unpaid

The origin API is never down. Restart the sidecar independently:

```bash
sudo systemctl restart pay-gate
# nginx/traefik keeps serving, just can't auth-check for ~100ms
```

## Checking Your Version

Every pay-gate instance exposes `GET /__pay/health`:

```bash
curl https://your-api.com/__pay/health
# {"status":"ok","network":"mainnet","version":"0.2.0",...}
```

## Configuration Survives Upgrades

| Deployment | Config location | Affected by upgrade? |
|-----------|----------------|---------------------|
| CF Worker | KV namespace + wrangler.toml | No |
| Rust binary | pay-gate.yaml | No |
| Docker | Mounted config + env vars | No |
| Helm | values.yaml | No |

Route definitions, provider address, proxy target, and discovery
settings all live outside the binary.

## Breaking Changes

pay-gate follows semantic versioning. Breaking changes (route config
format, wire format, CLI flags) only happen on major versions and are
documented in release notes.

Wire format changes in the `PAYMENT-REQUIRED` header are
backwards-compatible -- agents that don't understand new fields ignore
them. Fields removed from the header (like `extra.facilitator` in
v0.2.0) don't break existing agents because the `extra` object is
optional and its contents are non-normative for payment verification.

## v0.3.0: Info Block Replaces Hint (Breaking)

v0.3.0 replaces the free-form `hint` field with a structured `info`
block (Bazaar extension). This is a **breaking config change** --
`hint` is no longer recognized.

### Migration

Before (v0.2.x):

```yaml
routes:
  - path: "/api/v1/search"
    price: "0.01"
    hint: "?q={query}&limit=50"
```

After (v0.3.0):

```yaml
routes:
  - path: "/api/v1/search"
    price: "0.01"
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
            description: "Max results (default 50)"
```

For POST routes with JSON body hints:

```yaml
# Before
hint: '{"start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD"}'

# After
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
```

### What Changed

- `hint` field removed from route config
- `info` block added -- structured Bazaar info (input type, params, body schema)
- `route_template` field added -- named path params (e.g. `/users/:id`)
- 402 responses include `extensions.bazaar` with info + auto-generated schema
- `.well-known/x402` includes info blocks per endpoint
- pay-gate validates inbound requests against info schema (post-payment, pre-proxy)
- Invalid requests get 400 -- **payment is not refunded**

### New: Route Templates

For APIs with path parameters:

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

### Validate Before Deploying

```bash
pay-gate validate --config pay-gate.yaml
```

The gate refuses to start with invalid info blocks (e.g. POST without
`bodyType`, MCP without `tool`). Run validate after migrating.

## x402 Discovery Endpoint

As of v0.2.0, every pay-gate instance serves
`GET /.well-known/x402` -- the standard x402 descriptor from the IETF
internet-draft. This endpoint is served automatically with no
configuration needed. As of v0.3.0, this endpoint includes Bazaar
info blocks for each route that has one configured.

Providers should add a DNS TXT record for full discoverability:

```
_x402.api.example.com. 300 IN TXT "v=x4021;descriptor=api;url=https://api.example.com/.well-known/x402"
```
