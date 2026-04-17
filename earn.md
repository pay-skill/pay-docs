---
title: "Earn from AI Agents"
description: "Put pay-gate in front of your API, set a price per call, and earn USDC from every AI agent that uses it. No signup, no API keys, no invoicing."
---

# Earn from AI Agents

You have an API. AI agents need it. Put [pay-gate](/docs/gate/) in front, set a price, and every agent that calls your endpoint pays you automatically.

No signup. No API keys to manage. No invoicing. Agents pay per request in USDC on Base.

---

## How It Works

**1. Install pay-gate**

```bash
# Binary
curl -fsSL https://pay-skill.com/install.sh | sh

# Or Docker
docker pull ghcr.io/pay-skill/gate
```

**2. Configure your routes**

```yaml
# pay-gate.yml
listen: ":8402"
proxy:
  target: "http://localhost:8080"  # your existing API
facilitator: "https://pay-skill.com/x402"
routes:
  - path: "/weather"
    price: "0.01"
    settlement: "tab"
    description: "Current weather by city"
    info:
      input:
        type: "http"
        method: "GET"
        queryParams:
          city: { type: "string", description: "City name" }
      output:
        type: "json"
        example: { city: "London", temp: 15, conditions: "cloudy" }
discovery:
  discoverable: true
  base_url: "https://your-api.example.com"
  name: "Your API Name"
  description: "What your API does"
  keywords: ["weather", "forecast"]
  category: "data"
```

**3. Run**

```bash
pay-gate start
```

Your API now returns `402 Payment Required` for unpaid requests. Agents pay, you earn. You're automatically listed in [service discovery](/docs/api-reference#discovery) so every agent using Pay can find you.

Your existing API doesn't change. If you remove pay-gate, everything works exactly as before. No lock-in.

---

## Provider Program

We're paying **$5 USDC** to every developer who puts a qualifying API live behind pay-gate. Limited spots.

### Requirements

Your API must meet ALL of these:

- Publicly accessible at an HTTPS URL
- Returns 402 with valid x402 headers when called without payment
- Returns real, useful data when called with payment
- Appears in `pay discover` results (heartbeat configured)
- Has a filled `info` block describing inputs and outputs
- Responds in under 5 seconds
- Has at least 2 endpoints or meaningful query parameters
- Provides real value (reselling a paid upstream service like Suno/Runway/Replicate is fine — the x402 interface itself is value-add. What's not allowed: a thin proxy of a free public API with no transformation.)
- Serves a purpose an AI agent would actually use

Instant disqualifiers: same response regardless of input, requires auth beyond payment, duplicate of another submission, offline during review.

### How to claim

1. Set up your API with pay-gate (follow the [quickstart](/docs/gate/quickstart))
2. Submit your API URL and wallet address on the bounty platform
3. We verify your API meets the requirements
4. $5 USDC sent to your wallet immediately on approval

---

## Pricing Guidance

You set the price. Some guidelines:

- **Data lookups** (weather, DNS, geo): $0.005 - $0.05 per call
- **Light compute** (formatting, conversion, validation): $0.005 - $0.02 per call
- **Heavy compute** (image processing, transcription, ML inference): $0.05 - $1.00 per call
- **Communication** (email, SMS): $0.01 - $0.10 per message

The processing fee is 1% — invisible at these price points. You receive what you charge minus a penny per dollar. Price based on value, not fees.

---

## FAQ

**Do I need crypto experience?**
No. Run `pay signer init` to create a wallet. That's the only crypto-adjacent step. pay-gate handles everything else.

**Can I keep my existing API key / Stripe monetization?**
Yes. pay-gate is a reverse proxy that sits in front of your API. Existing customers using API keys hit your API directly. Agent traffic hits pay-gate. Two revenue streams, no conflict.

**What if I want to stop?**
Remove pay-gate. Your API works exactly as before. No contract, no minimum commitment.

**How do I see my earnings?**
Check your wallet balance with `pay balance` or view it in the [dashboard](https://pay-skill.com/fund).

**How do I convert USDC to dollars?**
Transfer USDC from your wallet to Coinbase, Kraken, or any exchange that supports USDC on Base. Withdraw to your bank account.

**How do agents find my API?**
When you enable `discoverable: true` in your gate config, your API is automatically indexed. Agents find it via `pay discover`, the SDK's discover function, or the MCP server.

---

## Next Steps

- [pay-gate Quickstart](/docs/gate/quickstart) — full setup guide
- [pay-gate Configuration](/docs/gate/config) — all config options
- [Provider Guide](/docs/provider-guide) — deep dive on payment flows
- [Integration Examples](https://github.com/pay-skill/pay-examples) — 16 working patterns
