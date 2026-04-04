# pay-gate

Drop-in x402 payment gateway for any HTTP API. Deploy in front of your service, define pricing per route, and every request is gated via x402.

```
Agent ──> pay-gate ──> Your API
             |
       pay-skill.com/x402
         (facilitator)
```

## Why pay-gate

- **No code changes to your backend.** Deploy a proxy, set prices, done.
- **Micropayments that work.** Tab settlement: one on-chain tx for thousands of API calls.
- **Any x402 agent can pay.** Direct settlement is standard x402. Tab settlement is the Pay differentiator.

## Deployment Options

| Target | Best for | Setup |
|--------|----------|-------|
| [Cloudflare Worker](/gate/quickstart#cloudflare-worker) | Most providers. Zero-ops, auto-scaling, free tier. | `npm create pay-gate` |
| [Rust binary](/gate/quickstart#rust-binary) | Self-hosted, Docker, systemd. | `cargo install pay-gate` |
| [Docker](/gate/quickstart#docker) | Container orchestration. | `docker run payskill/gate` |
| [Sidecar](/gate/quickstart#sidecar) | Existing nginx/traefik/envoy/caddy. | `pay-gate start --sidecar` |

## How It Works

### Unpaid request

Agent hits your API without payment:

```
GET /api/v1/data → 402 Payment Required
  PAYMENT-REQUIRED: base64({ scheme: "exact", amount: "10000", ... })
```

The agent's SDK parses the 402, pays automatically, and retries.

### Paid request

Agent retries with payment proof:

```
GET /api/v1/data
  PAYMENT-SIGNATURE: <x402 proof>

→ pay-gate verifies with facilitator
→ proxies to your API with X-Pay-* headers
→ 200 OK
```

### Your backend sees

| Header | Value |
|--------|-------|
| `X-Pay-Verified` | `true` |
| `X-Pay-From` | Agent wallet `0x...` |
| `X-Pay-Amount` | Micro-USDC amount |
| `X-Pay-Settlement` | `direct` or `tab` |
| `X-Pay-Tab` | Tab ID (tab-backed only) |

Use these for per-agent analytics, access control, or audit logging. pay-gate does not modify your response body.

## Settlement Modes

| Route Price | Default Mode | Why |
|-------------|-------------|-----|
| <= $1.00 | `tab` | Micropayments. On-chain gas per call would exceed the price. |
| > $1.00 | `direct` | High-value. Immediate on-chain settlement. |

Override per route with `settlement: "direct"` or `settlement: "tab"`.

## Fees

pay-gate itself is free. Standard Pay fees apply to each payment:

| Fee | Who pays | Amount |
|-----|----------|--------|
| Processing | Provider (deducted) | 1% (0.75% above $50k/month) |
| Tab activation | Agent | `max($0.10, 1% of tab amount)` |
| Gas | Pay protocol | Included |
