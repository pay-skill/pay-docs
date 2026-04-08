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
      text: CLI Reference
      link: /cli/
    - theme: alt
      text: Provider Guide
      link: /provider-guide

features:
  - title: Direct Payments
    details: One-shot USDC transfers. Agent sends, provider receives. $1 minimum, 1% provider fee.
  - title: Tabs
    details: Pre-funded metered accounts. Open a tab, charge per use, close when done. Charges batched at near-zero gas cost.
  - title: x402 Paywalls
    details: HTTP 402 payment protocol. Provider returns 402, agent pays automatically. Direct or tab settlement.
---

## Install

### CLI

```bash
# Homebrew (macOS/Linux)
brew install pay-skill/tap/pay

# Scoop (Windows)
scoop bucket add pay-skill https://github.com/pay-skill/scoop-pay
scoop install pay

# From source
cargo install pay-cli
```

```bash
# First-time setup
pay init

# Send $5 to a provider
pay direct 0xprovider... 5.00

# Make a paid API call (auto-handles x402)
pay request https://api.example.com/data
```

### TypeScript

```bash
npm install @pay-skill/sdk
```

### Python

```bash
pip install payskill
```

## Three Primitives

| Primitive | Use Case | Minimum | Settlement |
|-----------|----------|---------|------------|
| **Direct** | One-off payments | $1.00 | Immediate, on-chain |
| **Tab** | Metered billing | $5.00 to open | Charges batched off-chain, settled on close |
| **x402** | HTTP paywalls | Provider-set | Routes through direct or tab |

## Links

- [CLI Reference](/cli/)
- [Quickstart: Direct Payment](/quickstart/direct)
- [Quickstart: Tab Lifecycle](/quickstart/tab)
- [Provider Guide](/provider-guide)
- [Contracts & Networks](/contracts)
- [API Reference](/api-reference)
- [Spec (pay.md)](https://pay-skill.com/)
