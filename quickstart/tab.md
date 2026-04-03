# Quickstart: Tab Lifecycle

Open a pre-funded tab, charge it multiple times, then close. Tabs are ideal for metered billing where an agent pays a provider per unit of work.

## Prerequisites

- Agent wallet with testnet USDC (see [Direct Payment](./direct) for setup)
- Provider wallet (a second private key)

## 1. Open a Tab

::: code-group

```typescript [TypeScript]
import { Wallet } from "@pay-skill/sdk";

const agent = new Wallet({
  privateKey: process.env.AGENT_KEY!,
  chain: "base-sepolia",
  apiUrl: "https://testnet.pay-skill.com/api/v1",
  routerAddress: "0x24F26eCb1f46451994c59585817e87896749935D",
});

const tab = await agent.openTab(
  "0xProviderAddress",  // provider
  20,                   // lock $20.00
  2,                    // max $2.00 per charge
);
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

tab = agent.open_tab(
    provider="0xProviderAddress",
    amount=20_000_000,              # $20.00
    max_charge_per_call=2_000_000,  # max $2.00/charge
)
print("tab:", tab.tab_id)
```

```bash [CLI]
pay tab open 0xProviderAddress 20.00 --max-charge 2.00
# => tab_id: abc123
```

:::

The activation fee (`max($0.10, 1% of $20) = $0.20`) is deducted immediately.

## Fees

Tabs have two fee components:

| Fee | When | Formula | Discountable? |
|-----|------|---------|---------------|
| **Activation fee** | Paid at open | `max($0.10, 1% of tab amount)` | No |
| **Processing fee** | Paid at close or withdraw | 1% of charged amount | Yes |

The activation fee is non-refundable and covers on-chain gas for locking funds. It is deducted from the locked balance immediately.

The processing fee is deducted from the provider payout when the tab is closed or when the provider withdraws charged funds. Providers above **$50k/month volume** pay a reduced rate of **0.75%**. Minimum withdrawal is $1.00 -- charges below $1.00 accumulate until the threshold is reached, and at `closeTab` all remaining charges are paid out regardless of amount.

### Effective total cost

| Tier | Activation | Processing | Total on fully-used tab |
|------|-----------|------------|------------------------|
| Standard | 1% | 1% | ~2% |
| High-volume (>$50k/mo) | 1% | 0.75% | ~1.75% |
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

```typescript [TypeScript]
const provider = new Wallet({
  privateKey: process.env.PROVIDER_KEY!,
  chain: "base-sepolia",
  apiUrl: "https://testnet.pay-skill.com/api/v1",
  routerAddress: "0x24F26eCb1f46451994c59585817e87896749935D",
});

await provider.chargeTab("abc123", 1);  // charge $1.00
await provider.chargeTab("abc123", 1);  // charge another $1.00
```

```python [Python]
provider = PayClient(
    api_url="https://testnet.pay-skill.com/api/v1",
    signer="raw", private_key="0xPROVIDER_KEY",
    chain_id=84532,
    router_address="0x24F26eCb1f46451994c59585817e87896749935D",
)

provider._post("/tabs/abc123/charge", {"amount": 1_000_000})  # $1.00
provider._post("/tabs/abc123/charge", {"amount": 1_000_000})  # $1.00
```

```bash [CLI]
pay tab charge abc123 1.00
pay tab charge abc123 1.00
```

:::

## 3. Top Up (Agent Side)

If the tab runs low, the agent can add more funds:

::: code-group

```typescript [TypeScript]
await agent.topUpTab("abc123", 10);  // add $10.00
```

```bash [CLI]
pay tab topup abc123 10.00
```

:::

## 4. Withdraw Charged Funds

The provider can withdraw accumulated charges at any time while the tab stays open. The same 1% fee applies (identical to `closeTab`). The tab remains active for more charges after withdrawal. Minimum withdrawal: $1.00 -- charges below $1.00 accumulate until the threshold is reached. At `closeTab`, all remaining charges are paid out regardless of amount.

::: code-group

```typescript [TypeScript]
const result = await provider.withdrawTab("abc123");
console.log(`Withdrawn: $${result.amount / 1_000_000}`);
```

```python [Python]
result = provider.withdraw_tab("abc123")
print(f"Withdrawn: ${result.amount / 1_000_000}")
```

```bash [CLI]
pay tab withdraw abc123
```

:::

## 5. Close the Tab

Either party can close unilaterally:

::: code-group

```typescript [TypeScript]
const result = await agent.closeTab("abc123");
```

```python [Python]
result = agent.close_tab("abc123")
```

```bash [CLI]
pay tab close abc123
```

:::

## What Happened on Close

With $2.00 total charged from a $20.00 tab:
- **Provider receives:** `$2.00 × 0.99 = $1.98` (processing fee deducted)
- **Fee wallet receives:** `$0.20 (activation) + $0.02 (processing) = $0.22`
- **Agent receives:** `$20.00 − $0.20 (activation) − $2.00 (charges) = $17.80`

See [Fees](#fees) for full breakdown including volume discounts.

## Next Steps

- [x402 Tab Settlement](./x402-tab) — automatic tab-based micropayments for HTTP APIs
