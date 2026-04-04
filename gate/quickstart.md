# Quick Start

## Prerequisites

You need a provider wallet address. If you don't have one:

```bash
# Install the Pay CLI
cargo install pay-cli

# Generate a wallet
pay init
pay address
# → 0xYourProviderAddress
```

## Cloudflare Worker

Recommended for most providers. Zero-ops, auto-scaling, free tier covers 100k requests/day.

```bash
npm create pay-gate my-api-gate
cd my-api-gate
```

The CLI prompts for your provider address, origin URL, and route pricing. Then:

```bash
# Create a KV namespace for route config
npx wrangler kv namespace create ROUTES
# → Copy the namespace ID into wrangler.toml

# Upload your routes
npx wrangler kv bulk put routes.json --namespace-id <id>

# Test locally
npx wrangler dev

# Deploy
npx wrangler deploy
```

Your API is now gated. Test it:

```bash
# Without payment → 402
curl https://my-api-gate.yourname.workers.dev/api/data
# → 402 Payment Required

# With Pay CLI → auto-pays and returns data
pay request https://my-api-gate.yourname.workers.dev/api/data --testnet
# → 200 OK
```

## Rust Binary

Single static binary. No runtime dependencies.

```bash
cargo install pay-gate
pay-gate init          # generates pay-gate.yaml
```

Edit `pay-gate.yaml`:

```yaml
version: 1
provider_address: "0xYourProviderAddress"

proxy:
  target: "http://localhost:8080"   # your API

routes:
  - path: "/api/v1/*"
    price: "0.01"                   # $0.01 per call

default_action: "passthrough"       # free for unmatched routes
```

Start:

```bash
# Production (mainnet facilitator)
pay-gate start

# Development (testnet facilitator, verbose logs)
pay-gate dev
```

## Docker

```bash
docker run \
  -v ./pay-gate.yaml:/etc/pay-gate/config.yaml \
  -p 8402:8402 \
  payskill/gate
```

Or with docker-compose:

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

## Sidecar

Run pay-gate alongside an existing reverse proxy. pay-gate handles auth subrequests — your proxy handles TLS, routing, and load balancing.

```bash
pay-gate start --sidecar
# Listens on 127.0.0.1:8402
```

### nginx

```nginx
location /api/ {
    auth_request /__pay_check;
    auth_request_set $pay_verified $upstream_http_x_pay_verified;
    auth_request_set $pay_from     $upstream_http_x_pay_from;

    proxy_set_header X-Pay-Verified $pay_verified;
    proxy_set_header X-Pay-From     $pay_from;
    proxy_pass http://localhost:8080;

    error_page 402 = @payment_required;
}

location = /__pay_check {
    internal;
    proxy_pass http://127.0.0.1:8402/__pay/check;
    proxy_set_header X-Original-URI    $request_uri;
    proxy_set_header X-Original-Method $request_method;
    proxy_set_header PAYMENT-SIGNATURE $http_payment_signature;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
}
```

### Traefik

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
          - "PAYMENT-REQUIRED"
```

### Caddy

```
api.example.com {
    forward_auth localhost:8402 {
        uri /__pay/check
        copy_headers X-Pay-Verified X-Pay-From X-Pay-Amount PAYMENT-REQUIRED
    }
    reverse_proxy localhost:8080
}
```

See the [gate repo examples/](https://github.com/remit-md/gate/tree/main/examples) for complete configs including Envoy.

## Verify It Works

```bash
# Unpaid → 402
curl -i http://localhost:8402/api/v1/data
# HTTP/1.1 402 Payment Required
# PAYMENT-REQUIRED: eyJzY2hlbWUiOi...

# Health check
curl http://localhost:8402/__pay/health
# {"status":"ok","facilitator":"reachable","version":"0.1.0"}

# Full payment flow (testnet)
pay request http://localhost:8402/api/v1/data --testnet
# → 200 OK
```
