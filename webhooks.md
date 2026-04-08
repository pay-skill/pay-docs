# Webhooks

Real-time event notifications delivered to your URL. Register a webhook to get notified when payments complete, tabs change state, or x402 settlements happen.

## Register a Webhook

::: code-group

```bash [CLI]
pay webhook register https://your-app.example.com/hooks \
  --events "payment.completed,tab.opened" \
  --secret "my-hmac-secret"
```

```typescript [TypeScript]
import { Wallet } from "@pay-skill/sdk";

// Fetch contract addresses — never hardcode these
const contracts = await fetch("https://testnet.pay-skill.com/api/v1/contracts")
  .then(r => r.json());

const wallet = new Wallet({
  privateKey: process.env.PAYSKILL_KEY!,
  chain: "base-sepolia",
  apiUrl: "https://testnet.pay-skill.com/api/v1",
  routerAddress: contracts.router,
});

const hook = await wallet.registerWebhook(
  "https://your-app.example.com/hooks",
  ["payment.completed", "tab.opened"],  // optional filter
  "my-hmac-secret",                       // optional signing secret
);
console.log("webhook id:", hook.id);
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

hook = client.register_webhook(
    url="https://your-app.example.com/hooks",
    events=["payment.completed", "tab.opened"],
    secret="my-hmac-secret",
)
print("webhook id:", hook.id)
```

:::

If you omit `secret`, the server generates one automatically.

## Events

| Event | When | Who receives |
|-------|------|-------------|
| `payment.completed` | Direct payment confirms on-chain | Agent and provider |
| `tab.opened` | Tab created and funded | Agent and provider |
| `tab.low_balance` | Tab balance drops below 20% | Agent |
| `tab.closing_soon` | Tab will auto-close in 24h | Agent and provider |
| `tab.closed` | Tab closed, funds distributed | Agent and provider |
| `tab.topped_up` | Agent adds funds to a tab | Agent and provider |
| `x402.settled` | x402 payment settled on-chain | Agent and provider |

## Payload Format

Every webhook delivery is a POST with a JSON body:

```json
{
  "event": "payment.completed",
  "timestamp": "2026-04-01T12:00:00Z",
  "data": {
    "tx_hash": "0xabc...",
    "from": "0xAgentAddress",
    "to": "0xProviderAddress",
    "amount": 5000000,
    "fee": 50000,
    "memo": "invoice-42"
  }
}
```

### tab.opened

```json
{
  "event": "tab.opened",
  "timestamp": "2026-04-01T12:00:00Z",
  "data": {
    "tab_id": "abc123",
    "agent": "0xAgentAddress",
    "provider": "0xProviderAddress",
    "amount": 20000000,
    "max_charge_per_call": 2000000,
    "activation_fee": 200000
  }
}
```

### tab.low_balance

```json
{
  "event": "tab.low_balance",
  "timestamp": "2026-04-01T12:10:00Z",
  "data": {
    "tab_id": "abc123",
    "agent": "0xAgentAddress",
    "provider": "0xProviderAddress",
    "balance_remaining": 2000000,
    "amount": 20000000
  }
}
```

Sent when tab balance drops below 20% of the original amount.

### tab.closing_soon

```json
{
  "event": "tab.closing_soon",
  "timestamp": "2026-04-01T12:15:00Z",
  "data": {
    "tab_id": "abc123",
    "agent": "0xAgentAddress",
    "provider": "0xProviderAddress",
    "auto_close_at": "2026-04-02T12:15:00Z"
  }
}
```

Sent 24 hours before a tab with `auto_close_after` will be closed.

### tab.closed

```json
{
  "event": "tab.closed",
  "timestamp": "2026-04-01T13:00:00Z",
  "data": {
    "tab_id": "abc123",
    "agent": "0xAgentAddress",
    "provider": "0xProviderAddress",
    "total_charged": 5000000,
    "provider_payout": 4950000,
    "fee": 50000,
    "agent_refund": 14500000
  }
}
```

### tab.topped_up

```json
{
  "event": "tab.topped_up",
  "timestamp": "2026-04-01T12:30:00Z",
  "data": {
    "tab_id": "abc123",
    "agent": "0xAgentAddress",
    "provider": "0xProviderAddress",
    "amount": 10000000,
    "new_balance": 22000000
  }
}
```

### x402.settled

```json
{
  "event": "x402.settled",
  "timestamp": "2026-04-01T12:45:00Z",
  "data": {
    "tx_hash": "0xdef...",
    "from": "0xAgentAddress",
    "to": "0xProviderAddress",
    "amount": 1000000,
    "fee": 10000,
    "settlement": "direct"
  }
}
```

## HMAC Verification

Every delivery includes an `X-Pay-Signature` header — an HMAC-SHA256 of the raw body using your secret:

::: code-group

```typescript [TypeScript (Express)]
import crypto from "node:crypto";

app.post("/hooks", (req, res) => {
  const signature = req.headers["x-pay-signature"] as string;
  const expected = crypto
    .createHmac("sha256", "my-hmac-secret")
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (signature !== expected) {
    return res.status(401).send("Invalid signature");
  }

  const { event, data } = req.body;
  console.log(`${event}:`, data);
  res.sendStatus(200);
});
```

```python [Python (Flask)]
import hmac, hashlib

@app.post("/hooks")
def handle_webhook():
    signature = request.headers.get("X-Pay-Signature", "")
    expected = hmac.new(
        b"my-hmac-secret",
        request.get_data(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(signature, expected):
        return "Invalid signature", 401

    event = request.json["event"]
    data = request.json["data"]
    print(f"{event}: {data}")
    return "", 200
```

:::

## List and Delete

::: code-group

```bash [CLI]
# List
pay webhook list

# Delete
pay webhook delete <WEBHOOK_ID>
```

```typescript [TypeScript]
// List all webhooks
const hooks = await client.listWebhooks();

// Delete one
await client.deleteWebhook(hooks[0].webhookId);
```

```python [Python]
# List all webhooks
hooks = client.list_webhooks()

# Delete one
client.delete_webhook(hooks[0].id)
```

:::

## Delivery Guarantees

- **At-least-once delivery** — events may be delivered more than once, use idempotency keys
- **Retries** — failed deliveries retry with exponential backoff (up to 3 attempts)
- **HTTPS required** — webhook URLs must use HTTPS (HTTP allowed only for localhost/internal IPs during development)
- **Timeout** — deliveries time out after 10 seconds

## Testing with webhook.site

1. Go to [webhook.site](https://webhook.site) and copy your unique URL
2. Register it:
   ```bash
   pay webhook register https://webhook.site/YOUR-ID --events all
   ```
3. Run a payment or tab operation
4. Check webhook.site for the delivered events
