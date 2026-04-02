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
  routerAddress: "0xE0Aa45e6937F3b9Fc0BEe457361885Cb9bfC067F",
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
    router_address="0xE0Aa45e6937F3b9Fc0BEe457361885Cb9bfC067F",
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

## 2. Charge the Tab (Provider Side)

The provider charges for work completed:

::: code-group

```typescript [TypeScript]
const provider = new Wallet({
  privateKey: process.env.PROVIDER_KEY!,
  chain: "base-sepolia",
  apiUrl: "https://testnet.pay-skill.com/api/v1",
  routerAddress: "0xE0Aa45e6937F3b9Fc0BEe457361885Cb9bfC067F",
});

await provider.chargeTab("abc123", 1);  // charge $1.00
await provider.chargeTab("abc123", 1);  // charge another $1.00
```

```python [Python]
provider = PayClient(
    api_url="https://testnet.pay-skill.com/api/v1",
    signer="raw", private_key="0xPROVIDER_KEY",
    chain_id=84532,
    router_address="0xE0Aa45e6937F3b9Fc0BEe457361885Cb9bfC067F",
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

The provider can withdraw accumulated charges at any time while the tab stays open. The same 1% fee applies (identical to `closeTab`). The tab remains active for more charges after withdrawal.

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
- **Provider receives:** `$2.00 * 0.99 = $1.98`
- **Fee wallet receives:** `$2.00 * 0.01 = $0.02`
- **Agent receives:** `$20.00 - $0.20 (activation) - $2.00 (charges) = $17.80`

## Next Steps

- [x402 Tab Settlement](./x402-tab) — automatic tab-based micropayments for HTTP APIs
