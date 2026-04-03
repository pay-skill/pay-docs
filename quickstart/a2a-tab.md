# Quickstart: A2A + Tab (Metered Billing)

Use A2A tasks with tab-backed metered billing. The agent opens a tab, and the provider charges per unit of work as the task progresses.

## How It Works

1. Agent opens a tab with the provider
2. Agent sends an A2A `message/send` referencing the tab
3. Provider charges the tab as work is performed (per API call, per token, per minute)
4. Agent or provider closes the tab when the task is done

## Setup: Open a Tab First

::: code-group

```typescript [TypeScript]
import { Wallet } from "@pay-skill/sdk";

const agent = new Wallet({
  privateKey: process.env.AGENT_KEY!,
  chain: "base-sepolia",
  apiUrl: "https://testnet.pay-skill.com/api/v1",
  routerAddress: "0x24F26eCb1f46451994c59585817e87896749935D",
});

// Open a $50 tab with $5 max per charge
const tab = await agent.openTab("0xProviderAddress", 50, 5);
console.log("tab:", tab.tab_id);
```

```python [Python]
from payskill import PayClient

agent = PayClient(
    api_url="https://testnet.pay-skill.com/api/v1",
    signer="raw", private_key="0xAGENT_KEY",
    chain_id=84532,
    router_address="0x24F26eCb1f46451994c59585817e87896749935D",
)

tab = agent.open_tab("0xProviderAddress", 50_000_000, 5_000_000)
print("tab:", tab.tab_id)
```

:::

## Send an A2A Task with Tab Reference

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
          { type: "text", text: "Analyze this dataset — charge per row processed" },
          {
            type: "data",
            mimeType: "application/json",
            data: {
              paymentType: "tab",
              tabId: tab.tab_id,
            },
          },
        ],
      },
    },
  }),
});
```

## Monitor Charges via Webhooks

Register a webhook to track charges in real time:

```bash
pay webhook register https://your-app.example.com/hooks --events "tab.charged"
```

Each charge triggers a `tab.charged` webhook with the amount and running total.

## Close When Done

```typescript
await agent.closeTab(tab.tab_id);
// Provider gets 99% of total charged, 1% fee, remainder returns to agent
```

## When to Use Tab vs Direct

| Scenario | Use |
|----------|-----|
| One-off task with fixed price | Direct payment |
| Long-running task with variable cost | Tab (metered) |
| Many small API calls | Tab (amortized on-chain cost) |
| Unknown total cost upfront | Tab (set a budget, top up if needed) |

## Next Steps

- [AP2 Mandate](./ap2) — add spending constraints to payments
