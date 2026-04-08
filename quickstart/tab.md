# Quickstart: Tab Lifecycle

Open a pre-funded tab, charge it multiple times, then close. Tabs are ideal for metered billing where an agent pays a provider per unit of work.

## Prerequisites

- Agent wallet with testnet USDC (see [Direct Payment](./direct) for setup)
- Provider wallet (a second private key)

## 1. Open a Tab

::: code-group

```bash [CLI]
pay tab open 0xProviderAddress 20.00 --max-charge 2.00
# => tab_id: abc123
```

```typescript [TypeScript]
import { Wallet } from "@pay-skill/sdk";

// Fetch contract addresses — never hardcode these
const contracts = await fetch("https://testnet.pay-skill.com/api/v1/contracts")
  .then(r => r.json());

const agent = new Wallet({
  privateKey: process.env.AGENT_KEY!,
  chain: "base-sepolia",
  apiUrl: "https://testnet.pay-skill.com/api/v1",
  routerAddress: contracts.router,
});

const tab = await agent.openTab(
  "0xProviderAddress",  // provider
  20,                   // lock $20.00
  2,                    // max $2.00 per charge
);
console.log("tab:", tab.tab_id);
```

```python [Python]
import httpx
from payskill import PayClient

# Fetch contract addresses — never hardcode these
contracts = httpx.get("https://testnet.pay-skill.com/api/v1/contracts").json()

agent = PayClient(
    api_url="https://testnet.pay-skill.com/api/v1",
    signer="raw", private_key="0xAGENT_KEY",
    chain_id=contracts["chain_id"],
    router_address=contracts["router"],
)

tab = agent.open_tab(
    provider="0xProviderAddress",
    amount=20_000_000,              # $20.00
    max_charge_per_call=2_000_000,  # max $2.00/charge
)
print("tab:", tab.tab_id)
```

:::

The activation fee (`max($0.10, 1% of $20) = $0.20`) is deducted immediately.

## Fees

Tabs have two fee components:

| Fee | When | Formula | Discountable? |
|-----|------|---------|---------------|
| **Activation fee** | Paid at open | `max($0.10, 1% of tab amount)` | No |
| **Processing fee** | Paid at close or rectification | `max($0.002, 1%)` per charge | Yes (rate portion only) |

The activation fee is non-refundable and covers on-chain gas for the tab lifecycle. It is deducted from the locked balance immediately. The $0.10 floor applies to tabs under $10; above $10 the standard 1% rate applies. The $0.002 per-charge floor applies below $0.20/charge; above $0.20 the standard 1% rate applies.

The processing fee is deducted from the provider payout at close or during scheduled rectification (5am/5pm UTC daily). Providers above **$50k/month volume** pay a reduced rate: `max($0.002, 0.75%)`. The $0.002 floor always applies regardless of volume tier.

### Effective total cost

| Tier | Activation | Processing | Total on fully-used tab |
|------|-----------|------------|------------------------|
| Standard | 1% | `max($0.002, 1%)` | ~2% |
| High-volume (>$50k/mo) | 1% | `max($0.002, 0.75%)` | ~1.75% |
| Direct payments | — | 1% (0.75% high-vol) | 1% (0.75%) |

### Example: $100 tab, fully charged

| Step | Amount |
|------|--------|
| Agent locks | $100.00 |
| Activation fee → fee wallet | $1.00 |
| Tab balance after activation | $99.00 |
| Provider charges full $99.00 | — |
| Processing fee (1%) → fee wallet | $0.99 |
| Provider receives | $98.01 |
| Agent refund | $0.00 |

## 2. Charge the Tab (Provider Side)

The provider charges for work completed:

::: code-group

```bash [CLI]
pay tab charge abc123 1.00
pay tab charge abc123 1.00
```

```typescript [TypeScript]
const provider = new Wallet({
  privateKey: process.env.PROVIDER_KEY!,
  chain: "base-sepolia",
  apiUrl: "https://testnet.pay-skill.com/api/v1",
  routerAddress: contracts.router,  // from /api/v1/contracts
});

await provider.chargeTab("abc123", 1);  // charge $1.00
await provider.chargeTab("abc123", 1);  // charge another $1.00
```

```python [Python]
from payskill import PayClient, build_auth_headers

# Charge via REST API (provider-side operation)
headers = build_auth_headers(
    private_key="0xPROVIDER_KEY", method="POST",
    path="/api/v1/tabs/abc123/charge",
    chain_id=contracts["chain_id"], router_address=contracts["router"],
)
httpx.post(
    "https://testnet.pay-skill.com/api/v1/tabs/abc123/charge",
    json={"amount": 1_000_000}, headers=headers,  # $1.00
)
```

:::

## 3. Top Up (Agent Side)

If the tab runs low, the agent can add more funds:

::: code-group

```bash [CLI]
pay tab topup abc123 10.00
```

```typescript [TypeScript]
await agent.topUpTab("abc123", 10);  // add $10.00
```

:::

## 4. Scheduled Rectification

Providers receive earned charges automatically via scheduled rectification (5:00 AM and 5:00 PM UTC daily). For tabs with more than 10 settled charges and at least $0.10 unwithdrawn, the server calls `withdrawCharged` on-chain. The 1% processing fee is deducted. The tab stays open.

No manual withdrawal is needed. Providers can also close the tab at any time to receive all remaining funds immediately.

## 5. Close the Tab

Either party can close unilaterally:

::: code-group

```bash [CLI]
pay tab close abc123
```

```typescript [TypeScript]
const result = await agent.closeTab("abc123");
```

```python [Python]
result = agent.close_tab("abc123")
```

:::

## What Happened on Close

With $2.00 total charged from a $20.00 tab:
- **Provider receives:** `$2.00 × 0.99 = $1.98` (processing fee deducted)
- **Fee wallet receives:** `$0.20 (activation) + $0.02 (processing) = $0.22`
- **Agent receives:** `$20.00 − $0.20 (activation) − $2.00 (charges) = $17.80`

See [Fees](#fees) for full breakdown including volume discounts.

## Runnable Examples

- [TypeScript](https://github.com/pay-skill/pay-sdk/blob/main/docs/examples/typescript/tab-lifecycle.ts)
- [Python](https://github.com/pay-skill/pay-sdk/blob/main/docs/examples/python/tab_lifecycle.py)

## Next Steps

- [x402 Tab Settlement](./x402-tab) — automatic tab-based micropayments for HTTP APIs
