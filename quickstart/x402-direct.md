# Quickstart: x402 Direct Settlement

Pay for HTTP API calls automatically using the x402 protocol. When a server returns `402 Payment Required`, the SDK pays and retries — no manual payment logic needed.

## How It Works

1. Agent requests `GET /api/data` from a provider
2. Provider returns `402` with payment requirements: `{ settlement: "direct", amount: 1000000, to: "0x..." }`
3. SDK automatically pays via `payDirect`, then retries the request with an `X-Payment-Tx` header
4. Provider verifies payment and returns the data

## Provider Setup

Add a facilitator URL to your server. When a request lacks payment proof, return 402:

```javascript
// Express example
app.get("/api/data", (req, res) => {
  if (!req.headers["x-payment-tx"]) {
    return res.status(402).json({
      scheme: "exact",
      amount: 1_000_000,          // $1.00 in micro-USDC
      to: "0xYourProviderWallet",
      settlement: "direct",
    });
  }
  // Payment verified — serve content
  res.json({ data: "premium content" });
});
```

## Agent: Pay Automatically

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

// One line — payment is automatic
const response = await client.request("https://provider.example.com/api/data");
const data = await response.json();
console.log(data); // { data: "premium content" }
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

# One line — payment is automatic
response = client.request("https://provider.example.com/api/data")
print(response.json())  # { "data": "premium content" }
```
== CLI
```bash
pay request https://provider.example.com/api/data
# => [200] {"data": "premium content"}
```
:::

## What Happened

1. SDK sent `GET /api/data` — got `402` back
2. SDK read the payment requirements (`$1.00` to provider via direct settlement)
3. SDK called `payDirect` to send $1.00 to the provider
4. SDK retried the original request with `X-Payment-Tx: 0xabc...`
5. Provider verified the payment hash and returned the content

## Next Steps

- [x402 Tab Settlement](./x402-tab) — use tabs for repeated micropayments (cheaper per call)
