# Quickstart: x402 Tab Settlement

Use tabs for repeated micropayments to an HTTP API. The SDK auto-opens a tab on the first 402 response, then charges it for subsequent requests — much cheaper per call than direct settlement.

## How It Works

1. Agent requests data from a provider
2. Provider returns `402` with `settlement: "tab"`
3. SDK auto-opens a tab (10x the per-call price, min $5), charges it, and retries
4. On subsequent 402s to the same provider, the SDK reuses the existing tab

## Provider Setup

Return 402 with `settlement: "tab"`:

```javascript
app.get("/api/data", (req, res) => {
  const tabId = req.headers["x-payment-tab"];
  const chargeId = req.headers["x-payment-charge"];

  if (!tabId || !chargeId) {
    return res.status(402).json({
      scheme: "exact",
      amount: 100_000,              // $0.10 per call
      to: "0xYourProviderWallet",
      settlement: "tab",
    });
  }
  // Payment verified — serve content
  res.json({ data: "premium content", chargeId });
});
```

## Agent: Auto-Tab Payments

:::tabs
== TypeScript
```typescript
import { PayClient } from "@pay-skill/sdk";

const client = new PayClient({
  apiUrl: "https://testnet.pay-skill.com/api/v1",
  privateKey: process.env.PAYSKILL_KEY!,
  chainId: 84532,
  routerAddress: "0xE0Aa45e6937F3b9Fc0BEe457361885Cb9bfC067F",
});

// First call: SDK auto-opens a tab ($5 min), charges $0.10
const r1 = await client.request("https://provider.example.com/api/data");

// Second call: reuses the same tab, charges another $0.10
const r2 = await client.request("https://provider.example.com/api/data");

// Third call: same tab again — no new on-chain permit needed
const r3 = await client.request("https://provider.example.com/api/data");
```
== Python
```python
from payskill import PayClient

client = PayClient(
    api_url="https://testnet.pay-skill.com/api/v1",
    signer="raw",
    private_key="0xYOUR_KEY",
    chain_id=84532,
    router_address="0xE0Aa45e6937F3b9Fc0BEe457361885Cb9bfC067F",
)

# First call: auto-opens tab, charges $0.10
r1 = client.request("https://provider.example.com/api/data")

# Subsequent calls reuse the tab
r2 = client.request("https://provider.example.com/api/data")
r3 = client.request("https://provider.example.com/api/data")
```
== CLI
```bash
# Each call auto-manages tabs
pay request https://provider.example.com/api/data
pay request https://provider.example.com/api/data
pay request https://provider.example.com/api/data
```
:::

## Why Tabs for Micropayments

| | Direct Settlement | Tab Settlement |
|---|---|---|
| Per-call cost | $1.00 minimum + permit signing | No minimum per charge |
| On-chain TXs | 1 per call (permit + transfer) | 1 to open, 1 to close |
| Best for | Single large payments | Repeated small payments |

Tabs amortize the on-chain cost across many calls. A $5 tab at $0.10/call covers 50 API calls with only 2 on-chain transactions.

## Next Steps

- [A2A + Direct](./a2a-direct) — combine payments with A2A agent task protocol
