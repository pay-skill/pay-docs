---
title: "Spending Controls & Budgeting — Ᵽay"
description: "Per-request caps, total budgets, application-level per-provider limits, and how to log and monitor spend across a production service. Fail loud, never silently continue."
---

# Spending Controls & Budgeting

A wallet with a funded balance is a wallet that can drain. Runaway loops, upstream providers that quietly raise prices, an LLM that decides to retry the same call 40 times — every production incident in this category looks the same from the outside: the balance dropped faster than expected, nobody noticed until someone got paged. The fix is prevention at three layers.

This page walks through the three layers the SDK and the middleware packages give you, then fills in the one layer neither ships by default (per-provider caps) and closes with an audit/monitoring section and the usual anti-patterns list.

For the layer above (which integration to use at all) see [Choosing Your Integration](/guides/build-with-pay/choosing). For the layer below (the tabs and the wallet the budget applies to) see [Tab Lifecycle](/guides/build-with-pay/tab-lifecycle) and [Wallet Key Management](/guides/build-with-pay/key-management).

## The Three Layers

| Layer | What it protects against | How to set it |
|-------|--------------------------|--------------|
| **Per-request cap** | A single payment that is unexpectedly large (price tier change, mis-parsed 402, wrong endpoint) | `maxPerRequest` on `createPayFetch` or middleware options |
| **Total budget** | A slow drain over many requests (loop, cron, retry storm) | `maxTotal` on `createPayFetch` or middleware options |
| **Per-provider cap** | One upstream going rogue while others stay healthy | Application code — not built into the SDK |

All three are hard limits. When any of them is hit, the SDK raises `PayBudgetExceededError`. There is no silent-continue path — failing loud is the rule in financial code, and your handler is responsible for turning the error into something your users see.

## Per-Request Cap

The cheapest safety net to set. `maxPerRequest` rejects any single settlement above the specified dollar amount before any USDC moves. Set it to the largest single payment you legitimately expect to make, not to some comfortable round number.

::: code-group

```typescript [TypeScript]
import { Wallet, createPayFetch } from "@pay-skill/sdk";

const wallet = await Wallet.create();

const payFetch = createPayFetch(wallet, {
  maxPerRequest: 1.00,                       // reject any single payment over $1
});

// Succeeds if upstream asks for $0.50
const resp = await payFetch("https://api.example.com/data");

// Throws PayBudgetExceededError if upstream asks for $2.00
// — no USDC moves, no tab charge, the handler sees the error
```

```python [Python]
from payskill import Wallet, create_pay_fetch

wallet = Wallet.create()

pay_fetch = create_pay_fetch(
    wallet,
    max_per_request=1.00,                    # reject any single payment over $1
)

# Succeeds if upstream asks for $0.50
resp = pay_fetch("https://api.example.com/data")

# Raises PayBudgetExceededError if upstream asks for $2.00
# -- no USDC moves, no tab charge, the handler sees the error
```

:::

The same option is available on every middleware package via the identical name:

| Package | Option |
|---------|--------|
| `@pay-skill/express` | `payMiddleware(wallet, { maxPerRequest: 1.00 })` |
| `@pay-skill/next` | `withPay(wallet, handler, { maxPerRequest: 1.00 })` |
| `payskill-fastapi` | `add_middleware(PayMiddleware, wallet=wallet, max_per_request=1.00)` |

## Total Budget

Where per-request guards against one bad call, `maxTotal` guards against a slow drain. It tracks cumulative spend across every successful payment the `createPayFetch` instance (or the middleware) has made, and raises `PayBudgetExceededError` once the total crosses the cap.

::: code-group

```typescript [TypeScript]
const payFetch = createPayFetch(wallet, {
  maxPerRequest: 1.00,
  maxTotal: 50.00,                           // stop after $50 total
});

// After $50 has been spent, every subsequent call throws
```

```python [Python]
pay_fetch = create_pay_fetch(
    wallet,
    max_per_request=1.00,
    max_total=50.00,                         # stop after $50 total
)

# After $50 has been spent, every subsequent call raises
```

:::

Two details that catch people out:

1. **Total is per-instance, not per-wallet.** A fresh `createPayFetch` call starts at zero. Two instances against the same wallet track independently and will collectively spend `2 * maxTotal`. If you want a hard ceiling across the whole process, create one instance at startup and share it — which is exactly what the middleware packages do.

2. **`maxTotal` resets on process restart.** It is a runtime counter, not a persisted ledger. For a daily or monthly budget, you need to combine it with application-level tracking (next section) or with an external metric that alerts when the wallet's on-chain balance crosses a threshold.

## Per-Provider Caps

The SDK does not ship per-provider spend tracking, and that is deliberate — which address counts as which "provider" is an application concern. What you want is a small map keyed by provider address with a spent counter and a limit, checked on every payment event.

The `onPayment` callback on `createPayFetch` and every middleware package is designed for exactly this. It fires synchronously after a successful settlement and receives `{ url, amount, settlement }` — enough to look up which provider you just paid and update a counter.

::: code-group

```typescript [TypeScript]
interface ProviderLimit {
  spent: number;      // dollars, resets at window start
  limit: number;      // dollars per window
  windowStart: Date;  // when the current window began
}

const providers = new Map<string, ProviderLimit>();
const WINDOW_MS = 24 * 60 * 60 * 1000;       // 24 hours

function bumpSpend(providerUrl: string, amount: number): void {
  const host = new URL(providerUrl).host;
  const row = providers.get(host);
  if (!row) return;

  // Reset window if we've crossed midnight
  if (Date.now() - row.windowStart.getTime() > WINDOW_MS) {
    row.spent = 0;
    row.windowStart = new Date();
  }

  row.spent += amount;
  if (row.spent > row.limit) {
    // Loud enough to page someone: log, alert, pause requests to this host
    console.error(`[pay] per-provider cap exceeded for ${host}: $${row.spent.toFixed(2)}`);
    throw new Error(`Provider ${host} exceeded daily limit`);
  }
}

const payFetch = createPayFetch(wallet, {
  maxPerRequest: 1.00,
  maxTotal: 100.00,
  onPayment: ({ url, amount }) => bumpSpend(url, amount),
});
```

```python [Python]
from datetime import datetime, timedelta
from urllib.parse import urlparse

WINDOW = timedelta(hours=24)

providers: dict[str, dict] = {}              # host -> {spent, limit, window_start}

def bump_spend(provider_url: str, amount: float) -> None:
    host = urlparse(provider_url).netloc
    row = providers.get(host)
    if row is None:
        return

    # Reset window if we've crossed midnight
    if datetime.utcnow() - row["window_start"] > WINDOW:
        row["spent"] = 0.0
        row["window_start"] = datetime.utcnow()

    row["spent"] += amount
    if row["spent"] > row["limit"]:
        # Loud enough to page someone: log, alert, pause requests to this host
        raise RuntimeError(
            f"Provider {host} exceeded daily limit: ${row['spent']:.2f}"
        )

pay_fetch = create_pay_fetch(
    wallet,
    max_per_request=1.00,
    max_total=100.00,
    on_payment=lambda e: bump_spend(e.url, e.amount),
)
```

:::

Three things to keep in mind when you build this:

1. **Keying by host is the crude version.** Multiple providers can share a host (shared platforms), and one provider can expose multiple hosts. The precise key is the **provider wallet address** from the 402 payload. If you need that granularity, inspect `req.payment.from` in provider middleware or parse the `PAYMENT-REQUIRED` header before the settlement on the consumer side.
2. **Persist the state if a process restart should not zero the counter.** An in-memory map vanishes on deploy. If you need per-provider limits that survive deploys, the counter belongs in the same database as your tab IDs.
3. **Throwing from `onPayment` aborts the containing request.** The error propagates out of the `fetch` call as a plain exception. This is the intended path — your handler catches it and returns a proper error to the caller.

## Monitoring Spend

A cap without a log is a cap you will never debug. Two hooks cover the common needs.

### The `onPayment` audit trail

Every successful payment fires `onPayment` before the wrapped `fetch()` returns. Log the entire event with your existing structured logger — the three fields are all you need to reconstruct spend per day, per provider, or per endpoint.

::: code-group

```typescript [TypeScript]
const payFetch = createPayFetch(wallet, {
  onPayment: (event) => {
    logger.info("pay.settled", {
      url: event.url,
      amount: event.amount,
      settlement: event.settlement,          // "direct" or "tab"
      ts: new Date().toISOString(),
    });
  },
});
```

```python [Python]
import logging

log = logging.getLogger("pay")

pay_fetch = create_pay_fetch(
    wallet,
    on_payment=lambda e: log.info(
        "pay.settled",
        extra={
            "url": e.url,
            "amount": e.amount,
            "settlement": e.settlement,      # "direct" or "tab"
        },
    ),
)
```

:::

This is an append-only log. Do not expect structure from it beyond the three fields. If you need aggregates (daily total, spend per endpoint) compute them from the logs in your telemetry pipeline, not in the hot path.

### Point-in-time balance via `wallet.status()`

For a snapshot of where the wallet stands right now — total balance, locked-in-tabs, available — call `wallet.status()` directly. It hits the API, not just local state, so it is authoritative but not free. Schedule it on a cadence, not per-request.

::: code-group

```typescript [TypeScript]
const status = await wallet.status();
logger.info("pay.status", {
  address: status.address,
  balance_total: status.balance.total,
  balance_available: status.balance.available,
  open_tabs: status.openTabs,
});
```

```python [Python]
status = wallet.status()
log.info(
    "pay.status",
    extra={
        "address": status.address,
        "balance_total": status.balance.total,
        "balance_available": status.balance.available,
        "open_tabs": status.open_tabs,
    },
)
```

:::

A sensible production cadence is once a minute from a background task that also publishes the numbers as gauges to your metrics system. That gives you a real-time balance graph without pounding the API on every request.

### Webhooks for settlement-adjacent events

For events that happen between your `onPayment` log lines — tabs topping up automatically, closing, reaching low balance — register webhooks instead of polling:

- `tab.low_balance` — a tab has dropped below 20% of its funded amount (top up or alert)
- `tab.closed` — a tab has finished settling, the payout hit your wallet, and the balance number just changed
- `tab.topped_up` — another process topped up the same tab
- `x402.settled` — an on-chain x402 settlement landed

See [Webhooks](/webhooks) for registration and HMAC verification. For how tab events fit into a full tab-management loop, see [Tab Lifecycle](/guides/build-with-pay/tab-lifecycle).

## Handling `PayBudgetExceededError` and `PayInsufficientFundsError`

Budget caps only catch money you would have spent. The other half of the story is the money you do not have. `PayInsufficientFundsError` fires when the wallet balance is too low to settle the request — different cause, different response.

::: code-group

```typescript [TypeScript]
import { PayBudgetExceededError, PayInsufficientFundsError } from "@pay-skill/sdk";

try {
  const resp = await payFetch("https://api.example.com/expensive");
  return await resp.json();
} catch (err) {
  if (err instanceof PayBudgetExceededError) {
    logger.warn("pay.budget_exceeded", {
      limit_type: err.limitType,             // "perRequest" or "total"
      spent: err.spent,
      requested: err.requested,
    });
    // Degrade gracefully -- cached value, partial response, user-visible error
    return cached ?? { error: "budget_exceeded" };
  }
  if (err instanceof PayInsufficientFundsError) {
    logger.error("pay.insufficient_funds", { message: err.message });
    // Alert, page, and pause the service -- do not retry blindly
    await alerts.page("pay wallet underfunded");
    throw err;
  }
  throw err;                                 // anything else: bubble up
}
```

```python [Python]
from payskill import PayBudgetExceededError, PayInsufficientFundsError

try:
    resp = pay_fetch("https://api.example.com/expensive")
    return resp.json()
except PayBudgetExceededError as err:
    log.warning(
        "pay.budget_exceeded",
        extra={
            "limit_type": err.limit_type,    # "per_request" or "total"
            "spent": err.spent,
            "requested": err.requested,
        },
    )
    # Degrade gracefully -- cached value, partial response, user-visible error
    return cached or {"error": "budget_exceeded"}
except PayInsufficientFundsError as err:
    log.error("pay.insufficient_funds", extra={"message": str(err)})
    # Alert, page, and pause the service -- do not retry blindly
    alerts.page("pay wallet underfunded")
    raise
```

:::

The distinction matters because the recovery plays are different. A budget-exceeded error is a sign that your caps are working — log it and fall through to whatever degraded state you designed. An insufficient-funds error is a sign that your wallet needs money — page someone and stop making paid requests until the situation is resolved.

For the full error taxonomy and richer recovery patterns (network errors, server errors, validation errors), see the next page in this guide: error handling for x402.

## Anti-Patterns

**Never run without spending caps in production.** The default is no cap, and the default will eventually bite you. Set `maxPerRequest` and `maxTotal` on every `createPayFetch` or middleware instance, even if the numbers are generous. "We will add limits before launch" is how production wallets drain.

**Never set `maxPerRequest` higher than your most expensive legitimate call.** A cap of `$1000` does not protect against anything — by the time a single request can legitimately cost $1000, your wallet is already deep enough in the money flow to need real controls, not a comfortable round number. Size caps to actual prices, not to hypotheticals.

**Never catch `PayInsufficientFundsError` and keep going.** Silent continue on an underfunded wallet is exactly the anti-pattern the spec means when it says "no silent fallbacks in financial paths". Alert, pause, wait for a human to top up the wallet, and resume. Degrade the user experience loudly.

**Never share a `createPayFetch` across isolation boundaries.** A single instance is a single budget. If two tenants or two teams share one instance, one tenant's usage counts against the other's cap. Create one instance per logical unit of spend (per-tenant, per-service, per-background-job), and fund each one's caps to its own scale.

**Never log the private key as part of the `onPayment` trail.** The key is not in the event payload, but a careless `JSON.stringify(wallet)` ends up in logs and then in error-tracking platforms. Log the event fields, not the wallet.

**Never assume a tight `maxTotal` is a monthly budget.** It is a process-lifetime counter. If the process restarts at midnight, the counter restarts at midnight. For real monthly budgets, track spend in persistent storage keyed by month.

## Further Reading

- [Choosing Your Integration](/guides/build-with-pay/choosing) — higher-level integration decision
- [Wallet Key Management](/guides/build-with-pay/key-management) — the wallet the budget applies to
- [Tab Lifecycle](/guides/build-with-pay/tab-lifecycle) — tab economics that interact with per-provider caps
- [fetch() Wrapper](/sdk/fetch#budget-controls) — underlying `createPayFetch` budget options reference
- [Application Middleware overview](/middleware/) — middleware packages inherit the same options
- [Webhooks](/webhooks) — `tab.low_balance`, `tab.closed`, `tab.topped_up`, `x402.settled` payloads
