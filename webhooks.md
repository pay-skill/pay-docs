# Webhooks

Real-time event notifications delivered to your URL. Register a webhook to get notified when payments complete, tabs are charged, or x402 settlements happen.

## Register a Webhook

:::tabs
== TypeScript
```typescript
import { Wallet } from "@pay-skill/sdk";

const wallet = new Wallet({
  privateKey: process.env.PAYSKILL_KEY!,
  chain: "base-sepolia",
  apiUrl: "https://testnet.pay-skill.com/api/v1",
  routerAddress: "0xE0Aa45e6937F3b9Fc0BEe457361885Cb9bfC067F",
});

const hook = await wallet.registerWebhook(
  "https://your-app.example.com/hooks",
  ["payment.completed", "tab.charged"],  // optional filter
  "my-hmac-secret",                       // optional signing secret
);
console.log("webhook id:", hook.id);
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

hook = client.register_webhook(
    url="https://your-app.example.com/hooks",
    events=["payment.completed", "tab.charged"],
    secret="my-hmac-secret",
)
print("webhook id:", hook.id)
```
== CLI
```bash
pay webhook register https://your-app.example.com/hooks \
  --events "payment.completed,tab.charged" \
  --secret "my-hmac-secret"
```
:::

If you omit `secret`, the server generates one automatically.

## Events

| Event | When | Who receives |
|-------|------|-------------|
| `payment.completed` | Direct payment confirms on-chain | Agent and provider |
| `tab.opened` | Tab created and funded | Agent and provider |
| `tab.charged` | Provider charges a tab | Agent and provider |
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

### Tab Events

```json
{
  "event": "tab.charged",
  "timestamp": "2026-04-01T12:05:00Z",
  "data": {
    "tab_id": "abc123",
    "agent": "0xAgentAddress",
    "provider": "0xProviderAddress",
    "charge_amount": 1000000,
    "total_charged": 3000000,
    "balance_remaining": 17000000,
    "charge_count": 3
  }
}
```

## HMAC Verification

Every delivery includes an `X-Pay-Signature` header — an HMAC-SHA256 of the raw body using your secret:

:::tabs
== TypeScript (Express)
```typescript
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
== Python (Flask)
```python
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

:::tabs
== TypeScript
```typescript
// List all webhooks
const hooks = await client.listWebhooks();

// Delete one
await client.deleteWebhook(hooks[0].webhookId);
```
== Python
```python
# List all webhooks
hooks = client.list_webhooks()

# Delete one
client.delete_webhook(hooks[0].id)
```
== CLI
```bash
# List
pay webhook list

# Delete
pay webhook delete <WEBHOOK_ID>
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
   pay webhook register https://webhook.site/YOUR-ID
   ```
3. Run a payment or tab operation
4. Check webhook.site for the delivered events
