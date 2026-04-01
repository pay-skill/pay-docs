---
layout: home

hero:
  name: Pay
  text: Payments for AI Agents
  tagline: Direct payments, tabs, and x402 paywalls. USDC on Base.
  actions:
    - theme: brand
      text: Get Started
      link: /quickstart/direct
    - theme: alt
      text: TypeScript SDK
      link: /sdk/typescript
    - theme: alt
      text: Python SDK
      link: /sdk/python

features:
  - title: Direct Payments
    details: One-shot USDC transfers. Agent sends, provider receives. $1 minimum, 1% provider fee.
  - title: Tabs
    details: Pre-funded metered accounts. Open a tab, charge per use, close when done. Charges cost ~$0.000004 each.
  - title: x402 Paywalls
    details: HTTP 402 payment protocol. Provider returns 402, agent pays automatically. Direct or tab settlement.
---

## Install

### TypeScript

```bash
npm install @pay-skill/sdk
```

```typescript
import { PayClient } from "@pay-skill/sdk";

const client = new PayClient({ signer: "cli" });
await client.payDirect("0xprovider...", 5_000_000, { memo: "task-42" });
```

### Python

```bash
pip install pay-sdk
```

```python
from pay import PayClient

client = PayClient(signer="cli")
client.pay_direct("0xprovider...", 5_000_000, memo="task-42")
```

### CLI

```bash
# Install via cargo
cargo install pay-cli

# First-time setup
pay init

# Send $5 to a provider
pay direct 0xprovider... 5.00
```

## Three Primitives

| Primitive | Use Case | Minimum | Settlement |
|-----------|----------|---------|------------|
| **Direct** | One-off payments | $1.00 | Immediate, on-chain |
| **Tab** | Metered billing | $5.00 to open | Charges on-chain, transfers at close |
| **x402** | HTTP paywalls | Provider-set | Routes through direct or tab |

## Links

- [TypeScript SDK Reference](/sdk/typescript)
- [Python SDK Reference](/sdk/python)
- [CLI Reference](/cli/)
- [Quickstart: Direct Payment](/quickstart/direct)
- [Quickstart: Tab Lifecycle](/quickstart/tab)
- [Spec (pay.md)](https://pay-skill.com/)
