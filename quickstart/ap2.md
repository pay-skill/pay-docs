# Quickstart: AP2 Mandate-Backed Payment

Use AP2 mandates to constrain agent spending. A mandate sets bounds on what an agent can pay — maximum amount, allowed currency, expiry — and the server validates every payment against it.

## How It Works

1. A principal (human or system) issues a **mandate** defining spending limits
2. The agent includes the mandate when sending a payment via A2A
3. The Pay server validates the payment against the mandate constraints
4. If the payment exceeds the mandate, it's rejected before any on-chain transaction

## Mandate Structure

A mandate defines:

```json
{
  "mandateId": "mandate-001",
  "issuer": "0xPrincipalAddress",
  "maxAmount": 50000000,
  "currency": "USDC",
  "expiresAt": "2026-12-31T23:59:59Z"
}
```

| Field | Description |
|-------|-------------|
| `mandateId` | Unique identifier |
| `issuer` | Principal who authorized the spending |
| `maxAmount` | Maximum payment in micro-USDC |
| `currency` | Must be `"USDC"` |
| `expiresAt` | ISO 8601 expiry timestamp |

## Send a Mandate-Constrained Payment

```typescript
const response = await fetch("https://testnet.pay-skill.com/a2a", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: "1",
    method: "message/send",
    params: {
      message: {
        role: "user",
        parts: [
          { type: "text", text: "Purchase the dataset" },
          {
            type: "data",
            mimeType: "application/json",
            data: {
              paymentType: "direct",
              to: "0xProviderAddress",
              amount: 25_000_000,  // $25.00
              memo: "dataset-purchase",
              mandate: {
                mandateId: "mandate-001",
                issuer: "0xPrincipalAddress",
                maxAmount: 50_000_000,   // $50 max
                currency: "USDC",
                expiresAt: "2026-12-31T23:59:59Z",
              },
            },
          },
        ],
      },
    },
  }),
});
```

## Validation Rules

The server rejects payments that violate mandate constraints:

| Violation | Error |
|-----------|-------|
| `amount > maxAmount` | 400: exceeds mandate maximum |
| `currency != mandate.currency` | 400: currency mismatch |
| Current time > `expiresAt` | 400: mandate expired |
| `issuer` doesn't match | 400: issuer mismatch |

## Example: Rejected Payment

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "error": {
    "code": -32600,
    "message": "mandate validation failed: amount 75000000 exceeds mandate maximum 50000000"
  }
}
```

## Why Mandates Matter

Mandates let principals delegate spending authority to agents with guardrails:

- **Budget caps:** Agent can't spend more than $50 on a single task
- **Time limits:** Authorization expires after a deadline
- **Auditability:** Every payment links back to the authorizing mandate

## Next Steps

- [Direct Payment](./direct) — basics of sending USDC
- [Tab Lifecycle](./tab) — metered billing for ongoing work
