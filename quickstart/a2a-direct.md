# Quickstart: A2A + Direct Payment

Combine Google's Agent-to-Agent (A2A) protocol with Pay direct payments. The agent sends a task via A2A with a payment part — the server validates payment before executing the task.

## How It Works

1. Agent sends a JSON-RPC `message/send` to the Pay server's A2A endpoint
2. The message includes a `payment` part with a direct payment
3. Server validates payment, executes the task, returns the result
4. Payment settles on-chain

## Discover the Agent Card

```bash
curl https://testnet.pay-skill.com/.well-known/agent-card.json
```

The agent card describes the server's A2A capabilities, supported payment methods, and task types.

## Send a Task with Payment

The A2A endpoint requires EIP-712 authentication. Include `X-Pay-Agent`, `X-Pay-Signature`, `X-Pay-Timestamp`, and `X-Pay-Nonce` headers (see [Authentication](/sdk/typescript#authentication)).

::: code-group

```typescript [TypeScript]
import { buildAuthHeaders } from "@pay-skill/sdk";

const contracts = await fetch("https://testnet.pay-skill.com/api/v1/contracts")
  .then(r => r.json());

const authHeaders = await buildAuthHeaders(
  process.env.PAYSKILL_KEY!, "POST", "/a2a",
  { chainId: contracts.chain_id, routerAddress: contracts.router },
);

const response = await fetch("https://testnet.pay-skill.com/a2a", {
  method: "POST",
  headers: { "Content-Type": "application/json", ...authHeaders },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: "1",
    method: "message/send",
    params: {
      message: {
        role: "user",
        parts: [
          {
            type: "text",
            text: "Process this payment for data analysis",
          },
          {
            type: "data",
            mimeType: "application/json",
            data: {
              paymentType: "direct",
              to: "0xProviderAddress",
              amount: 5_000_000,  // $5.00
              memo: "data-analysis-task",
            },
          },
        ],
      },
    },
  }),
});

const result = await response.json();
console.log(result.result.task.status); // "completed"
```

```python [Python]
import httpx

response = httpx.post(
    "https://testnet.pay-skill.com/a2a",
    json={
        "jsonrpc": "2.0",
        "id": "1",
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "parts": [
                    {"type": "text", "text": "Process this payment"},
                    {
                        "type": "data",
                        "mimeType": "application/json",
                        "data": {
                            "paymentType": "direct",
                            "to": "0xProviderAddress",
                            "amount": 5_000_000,
                            "memo": "data-analysis-task",
                        },
                    },
                ],
            }
        },
    },
)
print(response.json()["result"]["task"]["status"])
```

:::

## Check Task Status

```bash
curl -X POST https://testnet.pay-skill.com/a2a \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"2","method":"tasks/get","params":{"id":"TASK_ID"}}'
```

## Next Steps

- [A2A + Tab](./a2a-tab) — metered billing for long-running A2A tasks
- [AP2 Mandate](./ap2) — constrained payments with spending limits
