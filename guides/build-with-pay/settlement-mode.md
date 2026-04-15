---
title: "Choosing Settlement Mode — Tab vs Direct | Ᵽay"
description: "Tab-backed x402 or direct settlement? The consumer doesn't usually choose — the provider does. How to pick for your own endpoint, with worked cost comparisons."
---

# Choosing Settlement Mode

x402 on Ᵽay has two settlement modes. **Tab** is pre-funded and metered — one on-chain activation, many off-chain charges, one close. **Direct** is atomic — one on-chain transfer per request. Everything downstream is the same: the same facilitator, the same middleware, the same error taxonomy. The difference is purely in how the money moves.

Most consumers never pick a mode. The provider declares it in the 402 response and the SDK handles both transparently. The place this decision matters is **when you are the provider**, sitting in front of a middleware package (`requirePayment`, `withPaywall`, `require_payment`) or a pay-gate config, deciding what to put in the `settlement` field.

This page is the settlement version of [Choosing Your Integration](/guides/build-with-pay/choosing) — same question at a different layer. For the broader integration decision, start there. For the economics underneath this page, see [Tab Lifecycle](/guides/build-with-pay/tab-lifecycle).

## The Short Version

| You are... | What to do |
|------------|-----------|
| A consumer (calling paid APIs) | You don't choose. The SDK reads the provider's 402 and settles either way. Just set spending caps. |
| A provider charging under $1/call | Use `tab`. Direct has a $1 minimum per call. |
| A provider charging $1 or more, low frequency (< 10 calls/day) | Use `direct`. The activation fee is noise compared to the call price, but you skip the tab state entirely. |
| A provider charging $1 or more, high frequency (10+ calls/day) | Use `tab` for the latency win. Warm tabs are substantially faster than direct. |
| A provider charging a mix (free health check + paid data + premium report) | Mix modes per route — nothing forces one choice across your whole API. |

The rest of the page fills in why each row reads the way it does.

## The Consumer View: You Don't Usually Pick

When your code calls a paid API, the provider's 402 response carries `settlement: "direct"` or `settlement: "tab"` in the `PAYMENT-REQUIRED` header. The SDK reads it, picks the matching path (open-or-reuse a tab, or sign an atomic transfer), settles, and retries the request. From inside your handler there is nothing to do.

::: code-group

```typescript [TypeScript]
import { Wallet, createPayFetch } from "@pay-skill/sdk";

const wallet = await Wallet.create();
const payFetch = createPayFetch(wallet, {
  maxPerRequest: 5.00,
  maxTotal: 100.00,
});

// The provider's 402 decides settlement. You don't specify it.
const data = await payFetch("https://tab-backed.example.com/api/data");
const report = await payFetch("https://direct-backed.example.com/api/report");
```

```python [Python]
from payskill import Wallet, create_pay_fetch

wallet = Wallet.create()
pay_fetch = create_pay_fetch(
    wallet,
    max_per_request=5.00,
    max_total=100.00,
)

# The provider's 402 decides settlement. You don't specify it.
data = pay_fetch("https://tab-backed.example.com/api/data")
report = pay_fetch("https://direct-backed.example.com/api/report")
```

:::

Three things the consumer still needs to know even though they don't pick:

1. **Tabs open automatically on the first tab-settled call.** That first call pays the activation fee and takes a bit longer than subsequent ones. Budget for it once per (process, provider) pair. See [Tab Lifecycle](/guides/build-with-pay/tab-lifecycle) for the details.
2. **Direct payments have a $1 minimum.** If a provider tries to charge less than $1 with `settlement: "direct"`, the call will fail validation before any signature happens. In practice, under-$1 providers always declare `tab`.
3. **Both modes surface the same errors.** `PayInsufficientFundsError`, `PayBudgetExceededError`, `PayNetworkError` — nothing in your error handling depends on which path was taken. See [Error Handling for x402](/guides/build-with-pay/error-handling).

## The Provider View: You Pick

As a provider, the `settlement` field is your main economic lever. Set it per route, not per server — a mixed API is totally normal (free health check, tab-settled data endpoints, direct-settled expensive reports).

The decision has three inputs: **price per call**, **call frequency**, and **latency tolerance**. The minimums and the fee structure do the rest.

### Tab settlement — use when

- **Per-call price is under $1.** Direct has a $1 hard minimum per call. Under that price, tab is your only option.
- **Calls are frequent (10+ per day per consumer, or much higher).** The activation fee amortizes across every subsequent charge. The more charges, the less the fee matters as a fraction of spend.
- **Latency matters.** Once a tab is warm, settlement is a fraction of the direct-mode latency because nothing waits on an on-chain transaction. See the latency budget on [Going to Production](/guides/build-with-pay/production#latency-expectations).
- **Your API is stateful enough that consumers are likely to stay around.** Tabs require a returning consumer to be worth the activation fee.

**Provider cost per call:** 1% processing fee deducted from payout, same as direct. You receive 99% of `totalCharged` at close (or at scheduled rectification), with 1% going to the Ᵽay fee wallet. The volume discount applies: if your monthly volume crosses $50k, the fee drops to 0.75%.

### Direct settlement — use when

- **Per-call price is $1 or more.** The $1 minimum is a hard floor. Anything under that must be tab.
- **Calls are infrequent.** A consumer who calls once a week has no reason to pay an activation fee.
- **The payment is a one-off** — a report, a task completion, a task-payment under A2A. Tab state for a single call is overhead.
- **You do not need low-latency settlement.** Direct waits on chain confirmation; tab does not.

**Provider cost per call:** 1% processing fee, same as tab. You receive 99% of the call price on each settled request.

### Mix modes per route

A single API can declare different settlement modes on different routes. This is the usual shape for a service with both micropayment data endpoints and a heavyweight report endpoint.

```typescript
// Express — requirePayment per route
import { requirePayment } from "@pay-skill/express";

// Tab — cheap, high-volume, latency-sensitive
app.get("/api/data",
  requirePayment({ price: 0.01, settlement: "tab", providerAddress }),
  handler);

// Direct — expensive, one-off, latency-tolerant
app.post("/api/report",
  requirePayment({ price: 5.00, settlement: "direct", providerAddress }),
  reportHandler);

// Free — no middleware
app.get("/api/health", (req, res) => res.json({ ok: true }));
```

The equivalent pattern exists for `withPaywall` (Next.js) and `Depends(require_payment(...))` (FastAPI) — see the [middleware overview](/middleware/) for the exact shapes. For a zero-code alternative, declare per-route prices and settlement modes in a [pay-gate](/gate/) config file.

## Worked Cost Comparisons

Concrete numbers to make the trade-offs visible. All prices in USDC on Base mainnet. The 1% processing fee is the same in both modes and is deducted from the provider's payout, not charged on top of what the consumer paid.

### Example 1: $0.01 per call, 1000 calls

A typical micropayment data API. Tab is the only viable mode — direct has a $1 minimum.

| Line | Amount |
|------|--------|
| Tab activation fee (agent pays, `max($0.10, 1% of tab amount)`) | $0.10 on a $10 tab |
| Total charged to consumer across 1000 calls | $10.00 |
| Provider payout (99%) | $9.90 |
| Ᵽay fee (1%) | $0.10 |
| **Consumer total out-of-pocket** | **$10.10** |
| **Direct alternative** | **Not possible — below $1 minimum** |

### Example 2: $5.00 per call, 10 calls

A high-value, low-frequency endpoint. Both modes work. Which is cheaper for the consumer?

| Line | Tab | Direct |
|------|-----|--------|
| Activation fee (1% of $50 = $0.50) | $0.50 | — |
| Total charged across 10 calls | $50.00 | $50.00 |
| Provider payout (99%) | $49.50 | $49.50 |
| Ᵽay fee (1%) | $0.50 | $0.50 |
| **Consumer total out-of-pocket** | **$50.50** | **$50.00** |

Direct is 50 cents cheaper for the consumer and skips the tab state entirely. Over ten calls spread across a month, there is no latency incentive to prefer tab either. **Verdict: direct.**

### Example 3: $0.50 per call, 100 calls

A medium-micropayment API. Under the $1 minimum, so still tab-only.

| Line | Amount |
|------|--------|
| Activation fee (1% of $50 = $0.50) | $0.50 |
| Total charged across 100 calls | $50.00 |
| Provider payout (99%) | $49.50 |
| Ᵽay fee (1%) | $0.50 |
| **Consumer total out-of-pocket** | **$50.50** |

The activation fee is 1% of what the consumer pays. On a very small tab (under $10), the `$0.10` floor kicks in and the fee becomes a bigger fraction — which is why tabs are not the right answer for "one call, see if I come back."

## Anti-Patterns

**Never pick settlement mode based on "which is cheaper per call" alone.** The per-call economics are almost identical — both modes take 1% processing from the provider. The real differences are the activation fee (paid once by the consumer for tab), the $1 minimum (hard floor for direct), and the latency (tab wins on warm calls). Pick on the combination, not on one axis.

**Never use direct settlement for sub-$1 routes.** It will not work — the SDK rejects amounts below $1 as a `PayValidationError` before any network call. If you want sub-dollar pricing, you need tab.

**Never change a route's settlement mode in production without a plan.** Consumers with open tabs against the old mode will hit mismatches on their next call. If you must change, either route the new price to a new URL (so consumers hit a fresh 402) or accept that the transition will briefly show as 402 loops while old tabs close.

**Never charge for a single call through a fresh tab.** If the consumer is going to make exactly one call and leave, the activation fee is pure loss. For one-shot charges use direct (if the price is $1+) or rethink whether this is the right endpoint at all.

**Never assume the consumer can opt in or out.** The consumer's SDK reads your 402 and does what it says. There is no consumer-side override of settlement mode. If a consumer wants direct for a route you declared as tab, the only path is for you (the provider) to change it.

**Never bundle settlement mode with authentication or business logic.** The settlement field belongs next to price and provider address, not next to anything that depends on the authenticated user. A/B testing settlement mode based on request shape is a fast way to break caching, metrics, and consumer trust.

## Further Reading

- [Choosing Your Integration](/guides/build-with-pay/choosing) — higher-level integration decision
- [Tab Lifecycle](/guides/build-with-pay/tab-lifecycle) — tab economics, sizing, `maxChargePerCall`
- [Spending Controls & Budgeting](/guides/build-with-pay/spending-controls) — the consumer-side caps that apply to both modes
- [Error Handling for x402](/guides/build-with-pay/error-handling) — `PayValidationError` for below-minimum prices
- [Going to Production](/guides/build-with-pay/production) — latency budgets for tab and direct settlement
- [Application Middleware overview](/middleware/) — `requirePayment` / `withPaywall` / `require_payment` per-route settlement
- [pay-gate](/gate/) — declarative per-route settlement in a config file
- [Provider Guide](/provider-guide) — end-to-end provider setup across both modes
