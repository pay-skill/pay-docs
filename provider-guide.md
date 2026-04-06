# Provider Guide

How to accept payments from AI agents. Providers are the services that agents pay — APIs, tools, data sources, or any service that accepts USDC.

## Three Ways to Get Paid

| Method | Best for | Agent effort | Provider effort |
|--------|----------|-------------|----------------|
| **Direct payment** | One-off purchases, invoices | Agent calls `payDirect` | Check balance or listen for webhook |
| **Tab charges** | Metered/usage-based billing | Agent opens tab upfront | Provider charges per unit of work |
| **x402 paywall** | HTTP API monetization | Agent's SDK handles it automatically | Add 402 response + facilitator URL |

---

## Receiving Direct Payments

No setup required. An agent sends money to your address — you receive it.

### Verify via Webhook

Register a webhook to get notified instantly:

::: code-group

```bash [CLI]
pay webhook register https://your-api.example.com/hooks \
  --events "payment.completed"
```

```typescript [TypeScript]
import { Wallet } from "@pay-skill/sdk";

const provider = new Wallet({
  privateKey: process.env.PROVIDER_KEY!,
  chain: "base",
  apiUrl: "https://pay-skill.com/api/v1",
  routerAddress: "0x...",
});

await provider.registerWebhook(
  "https://your-api.example.com/hooks",
  ["payment.completed"],
);
```

```python [Python]
from payskill import PayClient

provider = PayClient(
    api_url="https://pay-skill.com/api/v1",
    signer="raw",
    private_key="0xPROVIDER_KEY",
    chain_id=8453,
    router_address="0x...",
)

provider.register_webhook(
    url="https://your-api.example.com/hooks",
    events=["payment.completed"],
)
```

:::

When a payment arrives, your webhook receives:

```json
{
  "event": "payment.completed",
  "data": {
    "from": "0xAgentAddress",
    "to": "0xYourAddress",
    "amount": 5000000,
    "fee": 50000,
    "memo": "invoice-42"
  }
}
```

You receive `amount * 0.99` (1% fee deducted).

### Verify via Balance Check

::: code-group

```bash [CLI]
pay status
```

```typescript [TypeScript]
const balance = await provider.balance();
console.log("Balance:", balance, "USDC");
```

```python [Python]
status = provider.get_status()
print(f"Balance: {status.balance / 1_000_000:.2f} USDC")
```

:::

---

## Charging Tabs

When an agent opens a tab with you, you can charge it for each unit of work.

### Charge for Work Done

::: code-group

```bash [CLI]
pay tab charge abc123 1.00
pay tab charge abc123 0.50
```

```typescript [TypeScript]
// Agent opened a tab — you received a tab.opened webhook with the tab_id

// Charge $1.00 per API call
await provider.chargeTab("abc123", 1);

// Charge $0.50 for a smaller task
await provider.chargeTab("abc123", 0.5);
```

```python [Python]
# Charge per unit of work (use the REST API directly)
import httpx
from payskill import build_auth_headers

headers = build_auth_headers(
    private_key="0xPROVIDER_KEY",
    method="POST", path="/api/v1/tabs/abc123/charge",
    chain_id=8453, router_address="0x...",  # from /api/v1/contracts
)
httpx.post(
    "https://pay-skill.com/api/v1/tabs/abc123/charge",
    json={"amount": 1_000_000},  # $1.00
    headers=headers,
)
```

:::

### Monitor Tab State

Register for tab events to track charges and balance:

```bash
pay webhook register https://your-api.example.com/hooks \
  --events "tab.opened,tab.charged,tab.closed,tab.topped_up"
```

Key events for providers:

| Event | What it means |
|-------|--------------|
| `tab.opened` | Agent created a tab with you — you can start charging |
| `tab.charged` | Your charge was confirmed — includes running total |
| `tab.topped_up` | Agent added more funds — tab balance increased |
| `tab.closed` | Tab closed — you receive 99% of total charged |

### Close a Tab

Either party can close. As provider, close when the work is done:

::: code-group

```bash [CLI]
pay tab close abc123
```

```typescript [TypeScript]
await provider.closeTab("abc123");
```

:::

On close: you receive `totalCharged * 0.99`, the 1% fee goes to the fee wallet, and any remaining balance returns to the agent.

---

## Setting Up an x402 Paywall

Turn any HTTP API into a paid endpoint. Agents pay automatically — their SDK handles the 402 flow.

### Option A: Use pay-gate (recommended)

[pay-gate](/gate/) is a drop-in reverse proxy that handles x402 for you. No code changes to your backend.

```bash
npm create pay-gate my-api-gate
# Set your provider address, origin URL, route pricing
npx wrangler deploy
```

See the [pay-gate Quick Start](/gate/quickstart) for full setup.

### Option B: Implement x402 Directly

If you want full control, implement the x402 V2 protocol in your backend.

#### 1. Return 402 with PAYMENT-REQUIRED header

```javascript
// Express example — or use pay-gate for zero-code setup
app.get("/api/premium-data", async (req, res) => {
  const paymentSig = req.headers["payment-signature"];

  // Build payment requirements (used for both 402 response and verification)
  const paymentRequired = {
    x402Version: 2,
    resource: {
      url: `https://${req.hostname}${req.path}`,
      mimeType: "application/json",
    },
    accepts: [{
      scheme: "exact",
      network: "eip155:8453",              // mainnet; use /api/v1/contracts → chain_id
      amount: "1000000",                   // $1.00 in micro-USDC
      asset: "0x...",                        // USDC address from /api/v1/contracts → usdc
      payTo: "0xYourProviderWallet",
      maxTimeoutSeconds: 60,
      extra: {
        name: "USDC",
        version: "2",
        facilitator: "https://pay-skill.com/x402",
        settlement: "direct",              // or "tab" for micropayments
      },
    }],
    extensions: {},
  };

  const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");

  if (paymentSig) {
    // Verify payment with the facilitator
    const verifyResp = await fetch("https://pay-skill.com/x402/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        x402Version: 2,
        paymentPayload: paymentSig,
        paymentRequirements: encoded,
      }),
    });
    const { isValid } = await verifyResp.json();
    if (isValid) return res.json({ data: "premium content" });
    // Fall through to 402 if invalid
  }
  res.set("PAYMENT-REQUIRED", encoded);
  res.status(402).json({
    error: "payment_required",
    message: "This endpoint requires payment. $1.00 per request.",
  });
});
```

#### 2. Choose Settlement Mode

| Price | `"direct"` | `"tab"` |
|-------|-----------|---------|
| **Best for** | > $1/call | < $1/call (micropayments) |
| **Agent experience** | Pays per request on-chain | Opens tab once, charges per call |
| **Latency** | ~2s (chain confirmation) | ~50ms (off-chain verify) |

#### 3. x402 V2 Headers

| Header | Direction | Purpose |
|--------|-----------|---------|
| `PAYMENT-REQUIRED` | Server -> Agent | Base64 JSON requirements (in 402) |
| `PAYMENT-SIGNATURE` | Agent -> Server | Payment proof (in retry) |
| `PAYMENT-RESPONSE` | Server -> Agent | Settlement receipt (in response) |

---

## Fee Structure

| Fee | Who pays | When |
|-----|----------|------|
| **1% processing fee** | Provider (deducted from payout) | Every payment |
| **Tab activation fee** | Agent | `max($0.50, 1% of tab amount)` at open |
| **Volume discount** | — | Fee drops to 0.75% above $50k/month per provider |

As a provider, you always receive `amount * 0.99` (or `0.9925` with volume discount). No signup, no invoicing — just give agents your wallet address.
