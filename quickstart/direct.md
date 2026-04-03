# Quickstart: Direct Payment

Send a one-shot USDC payment from an agent to a provider. This is the simplest Pay flow.

## Prerequisites

- A private key (generate one or use an existing wallet)
- Testnet USDC (we'll mint some below)
- The Pay API URL and router address

## 1. Setup

Get the contract addresses from the API:

```bash
curl https://testnet.pay-skill.com/api/v1/contracts
```

Note the `router` address from the response.

## 2. Mint Testnet USDC

::: code-group

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

```bash [CLI]
pay --api-url https://testnet.pay-skill.com/api/v1 mint 100.00
```

:::

## 3. Send a Direct Payment

::: code-group

```typescript [TypeScript]
import { Wallet } from "@pay-skill/sdk";

const wallet = new Wallet({
  privateKey: process.env.PAYSKILL_KEY!,
  chain: "base-sepolia",
  apiUrl: "https://testnet.pay-skill.com/api/v1",
  routerAddress: "0x24F26eCb1f46451994c59585817e87896749935D",
});

const result = await wallet.payDirect(
  "0xProviderAddress",  // recipient
  5,                    // $5.00
  "invoice-42",         // memo
);
console.log("tx:", result.tx_hash);
```

```python [Python]
from payskill import PayClient

client = PayClient(
    api_url="https://testnet.pay-skill.com/api/v1",
    signer="raw",
    private_key="0xYOUR_KEY",
    chain_id=84532,
    router_address="0x24F26eCb1f46451994c59585817e87896749935D",
)

result = client.pay_direct(
    to="0xProviderAddress",
    amount=5_000_000,       # $5.00 in micro-USDC
    memo="invoice-42",
)
print("tx:", result.tx_hash)
```

```bash [CLI]
pay direct 0xProviderAddress 5.00 --memo "invoice-42"
# => tx_hash: 0xabc...
```

:::

## 4. Verify

Check the on-chain balance changed:

```bash
pay status
```

## What Happened

1. The SDK signed an EIP-2612 **permit** granting the PayDirect contract approval to transfer USDC
2. The server submitted the permit on-chain, then called `payDirectFor`
3. PayDirect transferred `$5.00 * 0.99 = $4.95` to the provider and `$0.05` to the fee wallet
4. The server returned the transaction hash

## Next Steps

- [Tab Lifecycle](./tab) — pre-funded metered billing
- [x402 Direct Settlement](./x402-direct) — automatic HTTP paywall payments
