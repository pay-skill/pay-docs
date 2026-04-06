# Quickstart: Direct Payment

Send a one-shot USDC payment from an agent to a provider. This is the simplest Pay flow.

## Prerequisites

- A wallet (run `pay init` to create one)
- Testnet USDC (we'll mint some below)

## 1. Setup

```bash
# Install and initialize
pay init

# Switch to testnet
pay network testnet

# Fetch contract addresses (see /contracts)
curl https://testnet.pay-skill.com/api/v1/contracts
```

## 2. Mint Testnet USDC

::: code-group

```bash [CLI]
pay mint 100.00
```

```typescript [TypeScript]
const res = await fetch("https://testnet.pay-skill.com/api/v1/mint", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ wallet: "YOUR_ADDRESS", amount: 100 }),
});
```

```python [Python]
import httpx
httpx.post("https://testnet.pay-skill.com/api/v1/mint",
    json={"wallet": "YOUR_ADDRESS", "amount": 100})
```

:::

## 3. Send a Direct Payment

::: code-group

```bash [CLI]
pay direct 0xProviderAddress 5.00 --memo "invoice-42"
# => {"tx_hash":"0xabc...","status":"confirmed"}
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

const result = await wallet.payDirect(
  "0xProviderAddress",  // recipient
  5,                    // $5.00
  "invoice-42",         // memo
);
console.log("tx:", result.tx_hash);
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

result = client.pay_direct(
    to="0xProviderAddress",
    amount=5_000_000,       # $5.00 in micro-USDC
    memo="invoice-42",
)
print("tx:", result.tx_hash)
```

:::

## 4. Verify

```bash
pay status
```

## What Happened

1. The CLI signed an EIP-2612 **permit** granting the PayDirect contract approval to transfer USDC
2. The server submitted the permit on-chain, then called `payDirectFor`
3. PayDirect transferred `$5.00 * 0.99 = $4.95` to the provider and `$0.05` to the fee wallet
4. The server returned the transaction hash

## Next Steps

- [Tab Lifecycle](./tab) — pre-funded metered billing
- [x402 Direct Settlement](./x402-direct) — automatic HTTP paywall payments
