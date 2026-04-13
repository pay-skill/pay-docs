---
title: "Full Stack Tutorial — Build a Paid API with Ᵽay"
description: "Build a paid weather API and call it from an AI agent. Complete tutorial: provider deploys pay-gate, agent pays with USDC, money flows on Base."
---

# Full Stack Tutorial

Build a paid weather API and call it from an AI agent. This tutorial shows the complete Pay flow: provider deploys pay-gate, agent pays, money flows.

## What You'll Build

```
Agent (CLI)  -->  pay-gate  -->  Weather API (Express)
                    |
              pay-skill.com/x402
               (facilitator)
```

The provider runs a weather API priced at $0.01 per call via tab settlement. The agent discovers it, calls it, and the agent's SDK handles payment automatically.

## Part 1: Provider Sets Up a Paid API

### 1a. Create a simple API

```javascript
// server.js
const express = require("express");
const app = express();

app.get("/forecast", (req, res) => {
  const city = req.query.city || "London";
  res.json({
    city,
    temperature: Math.round(15 + Math.random() * 15),
    conditions: ["sunny", "cloudy", "rainy"][Math.floor(Math.random() * 3)],
    paid_by: req.headers["x-pay-from"] || "unpaid",
  });
});

app.listen(3000, () => console.log("Weather API on :3000"));
```

```bash
npm init -y && npm install express
node server.js
```

### 1b. Deploy pay-gate in front of it

```bash
npm create pay-gate weather-gate
cd weather-gate
```

Edit `pay-gate.yaml`:

```yaml
provider: "0xYourProviderAddress"    # from `pay address`
facilitator: "https://pay-skill.com/x402"
proxy:
  target: "http://localhost:3000"
routes:
  - path: "/forecast"
    price: "$0.01"
    settlement: tab
discovery:
  discoverable: true
  base_url: "https://weather.yourdomain.com"
  name: "Weather API"
  description: "Real-time weather forecasts"
  keywords: ["weather", "forecast"]
  category: "data"
```

Deploy:

```bash
npx wrangler deploy
# Or run locally: npx pay-gate dev
```

Now any agent can pay $0.01 per forecast call. The provider's API code didn't change at all.

## Part 2: Agent Calls the Paid API

### 2a. Set up agent wallet

```bash
pay init
pay fund    # add $5-10 USDC via Coinbase Onramp
```

### 2b. Discover the API

```bash
pay discover weather
# => [{"name":"Weather API","base_url":"https://weather.yourdomain.com",...}]
```

### 2c. Make a paid request

::: code-group

```bash [CLI]
pay request "https://weather.yourdomain.com/forecast?city=tokyo"
# => [200] {"city":"tokyo","temperature":22,"conditions":"sunny","paid_by":"0xYourAgent..."}
```

```typescript [TypeScript]
import { Wallet } from "@pay-skill/sdk";

const wallet = await Wallet.create();  // OS keychain (same key as CLI)

// SDK auto-opens a tab, pays $0.01, gets the forecast
const response = await wallet.request(
  "https://weather.yourdomain.com/forecast?city=tokyo"
);
const data = await response.json();
console.log(data);
// { city: "tokyo", temperature: 22, conditions: "sunny", paid_by: "0xYourAgent..." }
```

```python [Python]
from payskill import Wallet

wallet = Wallet()

response = wallet.request(
    "https://weather.yourdomain.com/forecast?city=tokyo"
)
print(response.json())
# {"city": "tokyo", "temperature": 22, "conditions": "sunny", "paid_by": "0xYourAgent..."}
```

:::

What happened behind the scenes:

1. Agent sent `GET /forecast?city=tokyo`
2. pay-gate returned `402` with price ($0.01, tab settlement)
3. Agent SDK auto-opened a $5 tab with the provider (first call only)
4. Agent SDK charged $0.01 against the tab and retried with payment proof
5. pay-gate verified payment via the facilitator, proxied to the Weather API
6. Agent received the forecast

### 2d. Make more calls (same tab)

```bash
pay request "https://weather.yourdomain.com/forecast?city=london"
pay request "https://weather.yourdomain.com/forecast?city=paris"
pay request "https://weather.yourdomain.com/forecast?city=berlin"
```

Each call charges $0.01 against the existing tab. No new on-chain transactions.

## Part 3: Provider Checks Revenue

### 3a. Register a webhook (provider side)

```bash
pay webhook register https://your-webhook.example.com/hooks \
  --events "tab.settled,tab.closed"
```

### 3b. Check balance

```bash
pay status
```

Provider payouts are processed at 5 AM and 5 PM UTC daily. When the tab is closed, the provider receives all earned charges minus the 1% processing fee.

## Part 4: Agent Closes the Tab

```bash
pay tab list
# Shows open tabs with remaining balances

pay tab close <tab_id>
# Provider gets earned amount, agent gets remaining balance back
```

## Summary

| Step | Who | What happened |
|------|-----|--------------|
| 1 | Provider | Created an Express API, deployed pay-gate in front |
| 2 | Agent | Funded wallet, discovered API, made paid request |
| 3 | pay-gate | Returned 402, verified payment, proxied request |
| 4 | Facilitator | Validated signature, settled charge (batched) |
| 5 | Agent | Made more calls (reused tab, no new on-chain txs) |
| 6 | Provider | Received USDC payout at next rectification window |
| 7 | Agent | Closed tab, got remaining balance back |

Total cost to the agent: $0.04 for 4 API calls + $0.10 tab activation fee = $0.14.
Provider receives: $0.04 * 0.99 = $0.0396 (1% processing fee deducted).

## Next Steps

- [pay-gate Configuration](/gate/config) -- per-route pricing, settlement modes
- [Tab Lifecycle](/quickstart/tab) -- detailed tab mechanics
- [Webhooks](/webhooks) -- event notifications for providers
