---
title: "Going to Production — Ᵽay"
description: "Pre-launch checklist for a Ᵽay-enabled service. Wallet funding, secrets, spending caps, webhooks, error paths, monitoring, graceful shutdown. Plus the latency numbers to design against."
---

# Going to Production

The four previous pages in this guide each cover one concern in depth. This page is the checklist that ties them together: the things to verify before your service touches real USDC in production. None of these steps are new — they are the outputs of the earlier pages, ordered so that nothing slips through the gap.

For each item there is a one-sentence "why" and a link to the page with the real detail. The goal of this page is **one scan tells you what is left to do**, not to re-teach material you already read.

## The Checklist

```
[ ] Wallet funded with real USDC on mainnet
[ ] PAYSKILL_KEY set in every production environment
[ ] Spending caps configured on every createPayFetch / middleware instance
[ ] Webhooks registered for critical events
[ ] Error handling tested against simulated failure modes
[ ] Monitoring and alerting wired up
[ ] Graceful shutdown decided for open tabs
```

Seven items. Every line has a deep-dive page behind it.

## 1. Wallet Funded With Real USDC on Mainnet

Mainnet is the default in every example across this guide. Testnet exists for internal development and is not something we advertise for production — the SDK, CLI, and middleware all pick mainnet unless you explicitly opt in with `testnet: true` or `PAYSKILL_TESTNET=1`.

To fund a production wallet:

```bash
pay fund          # opens Coinbase Onramp in a browser, zero fee
pay status        # confirm the balance before launch
```

`pay fund` uses Coinbase Onramp with no platform fee on the onramp side. The alternative is a direct USDC transfer on Base from any wallet that already holds USDC — same asset, same contract, same network.

**Sizing:** fund enough that an incident-day spike does not drain you before the next top-up. A sensible floor is 7 days of your expected average daily spend. Alert loudly before you get within 2 days of empty (see item 6 below).

**Deep dive:** [Wallet Key Management](/guides/build-with-pay/key-management) — the same key that the CLI funded is the one your service uses at runtime. One key, one source of truth.

## 2. `PAYSKILL_KEY` Set in Every Production Environment

Production runs in containers, CI runners, and serverless platforms that have no OS keychain. Set `PAYSKILL_KEY` once in the platform's secrets manager and read it with the env-var form of the wallet constructor. Never commit it to a `.env` file. Never bake it into a Docker layer.

::: code-group

```typescript [TypeScript]
import { Wallet } from "@pay-skill/sdk";

const wallet = Wallet.fromEnv();             // fail loud if PAYSKILL_KEY is unset
```

```python [Python]
from payskill import Wallet

wallet = Wallet.from_env()                   # fail loud if PAYSKILL_KEY is unset
```

:::

`fromEnv()` / `from_env()` raises on boot if the variable is missing — that is the behavior you want. A silent fallback to a zero-balance wallet is worse than a crash.

**Deep dive:** [Wallet Key Management — Docker and CI](/guides/build-with-pay/key-management#docker-and-ci), [Kubernetes](/guides/build-with-pay/key-management#kubernetes), [Serverless](/guides/build-with-pay/key-management#serverless-vercel-lambda-cloud-run).

## 3. Spending Caps Configured on Every Instance

Every `createPayFetch` call and every middleware instance takes `maxPerRequest` and `maxTotal`. Set both on every instance in every production code path. A default-off cap is a production incident waiting for the right LLM retry loop.

::: code-group

```typescript [TypeScript]
const payFetch = createPayFetch(wallet, {
  maxPerRequest: 1.00,                       // largest single call you expect
  maxTotal: 100.00,                          // total per process lifetime
});
```

```python [Python]
pay_fetch = create_pay_fetch(
    wallet,
    max_per_request=1.00,                    # largest single call you expect
    max_total=100.00,                        # total per process lifetime
)
```

:::

`maxPerRequest` should be sized to the **largest single payment you legitimately expect**, not to a comfortable round number. `maxTotal` is a process-lifetime counter, not a daily budget — if you need daily limits, combine it with persistent per-provider tracking.

**Deep dive:** [Spending Controls & Budgeting](/guides/build-with-pay/spending-controls). The per-provider caps section is where most production services end up for finer-grained control.

## 4. Webhooks Registered for Critical Events

Two webhooks cover the production-operations needs most services have:

- **`tab.low_balance`** — auto top-up or page someone. Fires when a tab drops below 20% of its funded balance.
- **`payment.completed`** — append to the audit log. Fires once a direct (non-tab) payment lands on-chain.

Register once at deploy time. The dashboard and the API both accept the same payload.

```bash
pay webhook register \
  --url "https://your-service.example.com/webhooks/pay" \
  --events "tab.low_balance,payment.completed"
```

Your webhook handler must verify the HMAC signature before trusting the payload. See [Webhooks](/webhooks) for the signature scheme, payload formats, and retry semantics. For the tab-management side of `tab.low_balance`, see [Tab Lifecycle — `tab.low_balance`](/guides/build-with-pay/tab-lifecycle#tab-low-balance-top-up-or-close).

If your service runs multiple instances, register the webhook against a shared URL (load balancer or queue) — webhook deliveries are at-least-once and your handler should be idempotent on retries.

## 5. Error Handling Tested Against Simulated Failure Modes

Every error class in the SDK has a recovery pattern, and every pattern needs at least one test that triggers it. Three failure modes are worth explicit simulation before launch:

- **Insufficient balance.** Point your test harness at a freshly-created empty wallet. Verify that your service alerts, degrades to a visible error, and does not return default data as if the paid call had succeeded.
- **Facilitator timeout.** Block outbound traffic to `pay-skill.com` in the test environment. Verify that `PayNetworkError` bubbles up, retry-with-backoff triggers the expected number of attempts, and the final failure surfaces to the user.
- **Upstream 5xx.** Point at a local mock that returns 503 after verifying payment. Verify that your `PayServerError` handler reads `statusCode`, backs off briefly, and either recovers or fails loud.

The goal is not 100% coverage of the taxonomy — it is coverage of the three paths where a silent failure would be most expensive. The rest follows the same pattern from the catch-all handler.

**Deep dive:** [Error Handling for x402](/guides/build-with-pay/error-handling). The catch-all `safePay` / `safe_pay` function at the bottom of that page is designed to be unit-tested against stubs of each error class.

## 6. Monitoring and Alerting Wired Up

Three things to watch, three complementary tools.

**`onPayment` callback — the audit trail.** Fires once per successful settlement with `{ url, amount, settlement }`. Pipe it into your structured logger. This is where daily-spend aggregates, per-endpoint spend, and anomaly detection come from. Log every event; compute the aggregates downstream in your metrics pipeline.

```typescript
const payFetch = createPayFetch(wallet, {
  maxPerRequest: 1.00,
  maxTotal: 100.00,
  onPayment: (event) => logger.info("pay.settled", event),
});
```

**`wallet.status()` — point-in-time balance.** Run on a cadence (once a minute from a background task is a sensible default), publish `balance.total`, `balance.available`, and `openTabs` as gauges in your metrics system. Graph them. Alert when `available` drops below the 2-day-spike threshold from item 1.

**Alerts on `PayInsufficientFundsError`.** This error should page on-call immediately. It is the single most expensive error to handle with a delay — every minute it persists is a minute of paid upstream calls failing. Wire it to your existing pager rotation, not just to a log sink.

**Deep dive:** [Spending Controls & Budgeting — Monitoring Spend](/guides/build-with-pay/spending-controls#monitoring-spend), [Error Handling — PayInsufficientFundsError](/guides/build-with-pay/error-handling#payinsufficientfundserror-alert-and-pause).

## 7. Graceful Shutdown Decided for Open Tabs

Two reasonable choices, one bad one.

**Option A — close tabs on shutdown.** Recovers any remaining balance immediately. Good if deploys are frequent or the same wallet runs other workloads that could use the balance.

```typescript
process.on("SIGTERM", async () => {
  for (const tabId of openTabs) {
    await wallet.closeTab(tabId);
  }
  process.exit(0);
});
```

**Option B — leave tabs open.** Reuses on next startup, no new activation fee. Good if the service has consistent uptime and redeploys in-place.

**The bad option** is to do nothing in either direction — orphaned tab IDs in a closed process still lock balance until the 30-day auto-close fires. Pick explicitly.

**Deep dive:** [Tab Lifecycle — Shutdown: Close or Leave](/guides/build-with-pay/tab-lifecycle#shutdown-close-or-leave).

## Latency Expectations

Budget for these numbers when you design timeouts, SLOs, and retry windows. All measured on the warm path against the production facilitator on Base mainnet.

| Path | Overhead per request |
|------|----------------------|
| Tab-backed x402, warm tab | roughly 80 ms |
| Direct x402 (on-chain settlement) | roughly 200 ms |
| Tab auto-open (first request to a new provider) | roughly 500 ms (one-time) |

"Warm" means the tab is already open, the wallet is in-memory, and the facilitator is healthy. Cold-starts (Lambda, Cloud Run scaling from zero) add whatever the platform's own cold-start cost is on top of these numbers. Tabs amortize: every subsequent request after the first warm one pays the 80 ms overhead, not the 500 ms.

**Budget implication:** if a paid upstream has a p95 of 400 ms on the unpaid version, budget roughly 480 ms p95 for the paid version through a warm tab, and roughly 600 ms p95 for a direct-settled version. The tab-vs-direct decision is covered in detail on the next page in this guide.

## A Pre-Launch Dry Run

Before cutting the production deploy, run the full end-to-end path against a real wallet in a staging environment:

1. **Fund a staging wallet** with a small amount of real USDC (a few dollars is enough).
2. **Deploy the service** with `PAYSKILL_KEY` pointing at that staging wallet.
3. **Hit a paid upstream** and verify one successful call end-to-end — check the `onPayment` log line, check `pay status` for the new balance, and check the webhook handler received a `tab.opened` (or `payment.completed` for direct).
4. **Kill the service ungracefully** (`kill -9`, not SIGTERM) and restart it. Verify the restart recovers cleanly and the next call works.
5. **Drain the staging wallet** below the cost of a single call and repeat the same request. Verify `PayInsufficientFundsError` fires, alerts trip, and your degraded response reaches the user.
6. **Fund the wallet again**, verify the service recovers on the next call or on the next health check.

A staging run that walks these six steps catches almost every issue that tends to surface on day one of real traffic.

## Further Reading

- [Choosing Your Integration](/guides/build-with-pay/choosing)
- [Wallet Key Management](/guides/build-with-pay/key-management)
- [Tab Lifecycle](/guides/build-with-pay/tab-lifecycle)
- [Spending Controls & Budgeting](/guides/build-with-pay/spending-controls)
- [Error Handling for x402](/guides/build-with-pay/error-handling)
- [Application Middleware overview](/middleware/)
- [Webhooks](/webhooks)
- [Troubleshooting](/troubleshooting)
