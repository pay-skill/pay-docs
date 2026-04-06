# Quickstart: x402 Tab Settlement

Use tabs for repeated micropayments to an HTTP API. The CLI or SDK auto-opens a tab on the first 402 response, then charges it for subsequent requests — much cheaper per call than direct settlement.

## How It Works

1. Agent requests data from a provider
2. Provider returns `402` with base64-encoded v2 requirements (`accepts[0].extra.settlement === "tab"`)
3. Client auto-opens a tab (10x the per-call price, min $5), charges it, retries with `PAYMENT-SIGNATURE`
4. On subsequent 402s to the same provider, the client reuses the existing tab

## Provider Setup

Return 402 with `settlement: "tab"`:

```javascript
// Express example — or use pay-gate for zero-code setup
app.get("/api/data", (req, res) => {
  if (!req.headers["payment-signature"]) {
    const paymentRequired = {
      x402Version: 2,
      resource: { url: `https://${req.hostname}${req.path}`, mimeType: "application/json" },
      accepts: [{
        scheme: "exact",
        network: "eip155:8453",              // mainnet; use /api/v1/contracts → chain_id
        amount: "100000",                   // $0.10 per call
        asset: "0x...",                        // USDC address from /api/v1/contracts → usdc
        payTo: "0xYourProviderWallet",
        maxTimeoutSeconds: 60,
        extra: { name: "USDC", version: "2", facilitator: "https://pay-skill.com/x402", settlement: "tab" },
      }],
      extensions: {},
    };
    const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");
    res.set("PAYMENT-REQUIRED", encoded);
    return res.status(402).json({ error: "payment_required", message: "$0.10 per call" });
  }
  // Payment verified — serve content
  res.json({ data: "premium content" });
});
```

## Agent: Auto-Tab Payments

::: code-group

```bash [CLI]
# Each call auto-manages tabs
pay request https://provider.example.com/api/data
pay request https://provider.example.com/api/data
pay request https://provider.example.com/api/data

# POST with custom headers — same tab reuse
pay request -X POST \
  -H "Authorization: Bearer tok" \
  -d '{"prompt":"hello"}' \
  https://provider.example.com/api/chat
```

```typescript [TypeScript]
import { PayClient } from "@pay-skill/sdk";

// Fetch contract addresses — never hardcode these
const contracts = await fetch("https://testnet.pay-skill.com/api/v1/contracts")
  .then(r => r.json());

const client = new PayClient({
  apiUrl: "https://testnet.pay-skill.com/api/v1",
  privateKey: process.env.PAYSKILL_KEY!,
  chainId: contracts.chain_id,
  routerAddress: contracts.router,
});

// First call: SDK auto-opens a tab ($5 min), charges $0.10
const r1 = await client.request("https://provider.example.com/api/data");

// Second call: reuses the same tab, charges another $0.10
const r2 = await client.request("https://provider.example.com/api/data");

// Third call: same tab again — no new on-chain permit needed
const r3 = await client.request("https://provider.example.com/api/data");
```

```python [Python]
import httpx
from payskill import PayClient

# Fetch contract addresses — never hardcode these
contracts = httpx.get("https://testnet.pay-skill.com/api/v1/contracts").json()

client = PayClient(
    api_url="https://testnet.pay-skill.com/api/v1",
    signer="raw",
    private_key="0xYOUR_KEY",
    chain_id=contracts["chain_id"],
    router_address=contracts["router"],
)

# First call: auto-opens tab, charges $0.10
r1 = client.request("https://provider.example.com/api/data")

# Subsequent calls reuse the tab
r2 = client.request("https://provider.example.com/api/data")
r3 = client.request("https://provider.example.com/api/data")
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
