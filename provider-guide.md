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

:::tabs
== TypeScript
```typescript
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
== Python
```python
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
== CLI
```bash
pay webhook register https://your-api.example.com/hooks \
  --events "payment.completed"
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

:::tabs
== TypeScript
```typescript
const balance = await provider.balance();
console.log("Balance:", balance, "USDC");
```
== Python
```python
status = provider.get_status()
print(f"Balance: {status.balance / 1_000_000:.2f} USDC")
```
== CLI
```bash
pay status
```
:::

---

## Charging Tabs

When an agent opens a tab with you, you can charge it for each unit of work.

### Charge for Work Done

:::tabs
== TypeScript
```typescript
// Agent opened a tab — you received a tab.opened webhook with the tab_id

// Charge $1.00 per API call
await provider.chargeTab("abc123", 1);

// Charge $0.50 for a smaller task
await provider.chargeTab("abc123", 0.5);
```
== Python
```python
# Charge per unit of work
provider._post("/tabs/abc123/charge", {"amount": 1_000_000})  # $1.00
provider._post("/tabs/abc123/charge", {"amount": 500_000})    # $0.50
```
== CLI
```bash
pay tab charge abc123 1.00
pay tab charge abc123 0.50
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

:::tabs
== TypeScript
```typescript
await provider.closeTab("abc123");
```
== CLI
```bash
pay tab close abc123
```
:::

On close: you receive `totalCharged * 0.99`, the 1% fee goes to the fee wallet, and any remaining balance returns to the agent.

---

## Setting Up an x402 Paywall

Turn any HTTP API into a paid endpoint. Agents pay automatically — their SDK handles the 402 flow.

### 1. Return 402 for Unpaid Requests

```javascript
// Express example
app.get("/api/premium-data", (req, res) => {
  // Check for payment proof
  const txHash = req.headers["x-payment-tx"];
  const tabId = req.headers["x-payment-tab"];

  if (txHash || tabId) {
    // Payment verified — serve content
    return res.json({ data: "premium content" });
  }

  // No payment — return 402 with requirements
  res.status(402).json({
    scheme: "exact",
    amount: 1_000_000,                  // $1.00 per call
    to: "0xYourProviderWallet",
    settlement: "direct",               // or "tab" for micropayments
  });
});
```

### 2. Choose Settlement Mode

| Field | `"direct"` | `"tab"` |
|-------|-----------|---------|
| **Per-call cost** | $1.00 minimum | No minimum |
| **Best for** | Expensive single calls | Cheap repeated calls |
| **Agent experience** | Pays per request | Opens tab once, charges per request |

For micropayments (< $1/call), use `"tab"`. The agent's SDK auto-opens a tab and charges it.

### 3. That's It

No SDK installation needed on the provider side. Just return 402 with the right JSON, and any Pay-enabled agent can pay automatically.

### Python Provider Example

```python
from flask import Flask, request, jsonify

app = Flask(__name__)
PROVIDER_WALLET = "0xYourWallet"

@app.get("/api/data")
def get_data():
    tx = request.headers.get("X-Payment-Tx", "")
    tab = request.headers.get("X-Payment-Tab", "")

    if tx or tab:
        return jsonify({"data": "premium content"})

    return jsonify({
        "scheme": "exact",
        "amount": 1_000_000,
        "to": PROVIDER_WALLET,
        "settlement": "direct",
    }), 402
```

---

## Fee Structure

| Fee | Who pays | When |
|-----|----------|------|
| **1% processing fee** | Provider (deducted from payout) | Every payment |
| **Tab activation fee** | Agent | `max($0.10, 1% of tab amount)` at open |
| **Volume discount** | — | Fee drops to 0.75% above $50k/month per provider |

As a provider, you always receive `amount * 0.99` (or `0.9925` with volume discount). No signup, no invoicing — just give agents your wallet address.
