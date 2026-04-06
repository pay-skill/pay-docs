# Contracts & Networks

Pay deploys a set of smart contracts on Base. Contract addresses differ between testnet and mainnet. **Always fetch them at runtime** from the `/api/v1/contracts` endpoint — never hardcode them.

## Fetch Contract Addresses

```bash
# Testnet (Base Sepolia)
curl https://testnet.pay-skill.com/api/v1/contracts

# Mainnet (Base)
curl https://pay-skill.com/api/v1/contracts
```

Response:

```json
{
  "chain_id": 84532,
  "router": "0x...",
  "direct": "0x...",
  "tab": "0x...",
  "tab_v2": "0x...",
  "usdc": "0x..."
}
```

## Networks

| Network | Chain | Chain ID | API URL |
|---------|-------|----------|---------|
| **Mainnet** | Base | 8453 | `https://pay-skill.com/api/v1` |
| **Testnet** | Base Sepolia | 84532 | `https://testnet.pay-skill.com/api/v1` |

The CLI defaults to mainnet. Use `--testnet` for development:

```bash
pay network              # show current network
pay network testnet      # switch to Base Sepolia
pay network mainnet      # switch back
```

SDKs accept `apiUrl` / `api_url` and `chainId` / `chain_id` in their constructors.

## Contract Roles

| Contract | Role |
|----------|------|
| **PayRouter** (`router`) | Entry point for x402 settlement. Receives EIP-3009 authorizations, splits payment between provider and fee wallet. |
| **PayDirect** (`direct`) | One-shot USDC transfers. Agent permits, server calls `payDirectFor`. |
| **PayTab** (`tab`) | Pre-funded metered accounts (v1). Agent locks USDC, provider charges per use. |
| **PayTabV2** (`tab_v2`) | Metered accounts with batch settlement. Charges are buffered off-chain, settled in batches. |
| **PayFee** | Fee calculation and volume tracking. Cliff-based tiers: 1% below $50k/month, 0.75% at/above. Not returned by `/contracts` — called internally by other contracts. |
| **USDC** (`usdc`) | Circle's USDC stablecoin on Base. ERC-20 with EIP-2612 permit and EIP-3009 transferWithAuthorization. |

## Using Contracts in Code

### TypeScript

```typescript
const contracts = await fetch("https://testnet.pay-skill.com/api/v1/contracts")
  .then(r => r.json());

const wallet = new Wallet({
  privateKey: process.env.PAYSKILL_KEY!,
  chain: "base-sepolia",
  apiUrl: "https://testnet.pay-skill.com/api/v1",
  routerAddress: contracts.router,
});
```

### Python

```python
import httpx

contracts = httpx.get("https://testnet.pay-skill.com/api/v1/contracts").json()

client = PayClient(
    api_url="https://testnet.pay-skill.com/api/v1",
    signer="raw",
    private_key="0x...",
    chain_id=contracts["chain_id"],
    router_address=contracts["router"],
)
```

### CLI

The CLI fetches contract addresses automatically during `pay init`. No manual configuration needed.

## x402 Provider Setup

When building x402 payment requirements, use the addresses from `/contracts`:

```javascript
const contracts = await fetch("https://pay-skill.com/api/v1/contracts")
  .then(r => r.json());

const paymentRequired = {
  x402Version: 2,
  accepts: [{
    scheme: "exact",
    network: `eip155:${contracts.chain_id}`,
    amount: "1000000",
    asset: contracts.usdc,        // USDC address from /contracts
    payTo: "0xYourProviderWallet",
    maxTimeoutSeconds: 60,
    extra: {
      name: "USDC",
      version: "2",
      facilitator: "https://pay-skill.com/x402",
      settlement: "direct",
    },
  }],
};
```
