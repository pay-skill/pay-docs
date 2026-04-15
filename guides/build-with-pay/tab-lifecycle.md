---
title: "Tab Lifecycle in Long-Running Services — Ᵽay"
description: "How to manage pre-funded tabs across restarts, deploys, and multi-day uptimes. Auto-open vs. persistent tab management, top-up on low-balance webhooks, tab sizing by call volume."
---

# Tab Lifecycle in Long-Running Services

Tabs are pre-funded metered accounts tied to one provider. A tab activates on-chain once, absorbs many small charges off-chain, and settles at close. For any app that calls a paid API more than a few times per day, tabs are the difference between paying on-chain gas for every request and paying once.

This is also the part of the integration that most often catches people off guard. Tabs auto-close after 30 days of inactivity. Balances deplete. Restarts lose the in-memory tab ID. A middleware package can hide most of this, but not all of it — at some point your production ops loop needs to know what a low-balance webhook is and what to do with it.

This page covers two patterns for tab management, tab sizing by call volume, and the webhooks and commands that keep the whole thing running across deploys. For the layer above (which integration to use in the first place) see [Choosing Your Integration](/guides/build-with-pay/choosing). For the layer below (the wallet behind every tab) see [Wallet Key Management](/guides/build-with-pay/key-management).

## Recap: What a Tab Is

Before the patterns, a quick refresher on the state machine:

| State | How to reach it | Cost |
|-------|-----------------|------|
| **Open** | `wallet.openTab(provider, amount, maxCharge)` or automatic on first 402 | Activation fee: `max($0.10, 1% of tab amount)`, non-refundable |
| **Charged** | Each request from the provider's middleware or pay-gate issues a charge | Tracked off-chain until rectification |
| **Topped up** | `wallet.topUpTab(tabId, amount)` or automatic on `tab.low_balance` | None (no new activation) |
| **Closed** | `wallet.closeTab(tabId)` by agent or provider, or automatic at 30 days inactivity | Provider receives 99% of `totalCharged`, 1% goes to fee wallet, remainder returns to agent |

Two details that matter for production code:

1. **`maxChargePerCall` is contract-enforced.** You set it at open. The provider cannot charge above it. If your provider legitimately needs to raise a single-call price, they should tell you ahead of time so you can close and reopen with a new cap.
2. **Auto-close is 30 days of no activity**, not 30 days since open. A tab that sees one charge every two weeks stays open forever. A tab that sees zero charges for 30 days closes and settles automatically.

## Pattern 1: Let the SDK Handle It (Recommended for Most Apps)

Both SDKs auto-open tabs when you make an x402 call to a provider that declares `settlement: "tab"`. The tab ID is cached in-memory for the lifetime of the process. You do not need to open, top up, or close anything yourself.

::: code-group

```typescript [TypeScript]
import { Wallet, createPayFetch } from "@pay-skill/sdk";

const wallet = await Wallet.create();        // OS keychain, mainnet
const payFetch = createPayFetch(wallet, {
  maxPerRequest: 1.00,
  maxTotal: 100.00,
});

// First call: SDK sees 402 + settlement=tab, opens a tab for you
const first = await payFetch("https://api.example.com/data");

// Subsequent calls: SDK reuses the cached tab ID, no new activation fee
const second = await payFetch("https://api.example.com/data");
const third = await payFetch("https://api.example.com/other");
```

```python [Python]
from payskill import Wallet, create_pay_fetch

wallet = Wallet.create()                     # OS keychain, mainnet
pay_fetch = create_pay_fetch(
    wallet,
    max_per_request=1.00,
    max_total=100.00,
)

# First call: SDK sees 402 + settlement=tab, opens a tab for you
first = pay_fetch("https://api.example.com/data")

# Subsequent calls: SDK reuses the cached tab ID, no new activation fee
second = pay_fetch("https://api.example.com/data")
third = pay_fetch("https://api.example.com/other")
```

:::

**When this is enough:**

- Your app is stateless enough that losing the tab ID on restart is not a problem (a new tab opens on the next 402 after boot; the old one auto-closes when its inactivity window runs out)
- You do not need to monitor or react to the tab's balance yourself — budget caps and `PayInsufficientFundsError` are your backstop
- You are happy to pay one activation fee per (process, provider) pair — typically `$0.10` to a dollar each time

The middleware packages are all built on this pattern. `payMiddleware`, `PayMiddleware`, and `withPay` share one `createPayFetch` instance across the whole app, so one tab per provider serves every handler in the process.

## Pattern 2: Persistent Tab Management

If your service runs for days, the in-memory cache isn't enough by itself. A rolling deploy every afternoon means a new activation fee every afternoon. A low-balance incident at 3am is easier to handle if you already know which tab ID to top up.

Persistent tab management is the same tab API, called explicitly and saved to a database.

### The Full Loop

```
Startup
  |
  |-- Load saved tab IDs from DB (keyed by provider address)
  |-- For each: wallet.getTab(tabId) to verify it's still open
  |-- Discard any that are closed or expired
  |
First call to a provider with no active tab
  |
  |-- wallet.openTab(provider, amount, maxChargePerCall)
  |-- Save (provider, tab_id, opened_at) to DB
  |-- Use tab for subsequent calls to that provider
  |
On tab.low_balance webhook
  |
  |-- Option A: wallet.topUpTab(tab_id, amount)  — keep it alive
  |-- Option B: wallet.closeTab(tab_id)          — let auto-open create a new one
  |
Graceful shutdown (optional)
  |
  |-- wallet.closeTab(tab_id) for each open tab  — recovers remaining balance
  |-- Or leave open — reuses on next startup
```

### Startup: Hydrate From the Database

::: code-group

```typescript [TypeScript]
import { Wallet } from "@pay-skill/sdk";
import { db } from "./db";

const wallet = await Wallet.create();

interface TabRow {
  provider: string;
  tab_id: string;
  opened_at: Date;
}

async function hydrateTabs(): Promise<Map<string, string>> {
  const rows = await db.query<TabRow>("SELECT provider, tab_id, opened_at FROM tabs");
  const live = new Map<string, string>();

  for (const row of rows) {
    const tab = await wallet.getTab(row.tab_id);
    if (tab.status === "open") {
      live.set(row.provider, row.tab_id);
    } else {
      await db.query("DELETE FROM tabs WHERE tab_id = $1", [row.tab_id]);
    }
  }

  return live;
}

const tabsByProvider = await hydrateTabs();
```

```python [Python]
from payskill import Wallet
from .db import db

wallet = Wallet.create()

def hydrate_tabs() -> dict[str, str]:
    """Load saved tabs from DB, drop any that are no longer open."""
    live: dict[str, str] = {}
    for row in db.query("SELECT provider, tab_id, opened_at FROM tabs"):
        tab = wallet.get_tab(row["tab_id"])
        if tab.status == "open":
            live[row["provider"]] = row["tab_id"]
        else:
            db.query("DELETE FROM tabs WHERE tab_id = %s", (row["tab_id"],))
    return live

tabs_by_provider = hydrate_tabs()
```

:::

### First Call to a Provider: Explicit Open

::: code-group

```typescript [TypeScript]
async function ensureTab(provider: string): Promise<string> {
  const existing = tabsByProvider.get(provider);
  if (existing) return existing;

  // Size the tab for medium-volume workloads; see "Tab Sizing" below
  const tab = await wallet.openTab(provider, 20.00, 0.50);
  await db.query(
    "INSERT INTO tabs (provider, tab_id, opened_at) VALUES ($1, $2, NOW())",
    [provider, tab.id],
  );
  tabsByProvider.set(provider, tab.id);
  return tab.id;
}
```

```python [Python]
def ensure_tab(provider: str) -> str:
    existing = tabs_by_provider.get(provider)
    if existing:
        return existing

    # Size the tab for medium-volume workloads; see "Tab Sizing" below
    tab = wallet.open_tab(provider, 20.00, max_charge_per_call=0.50)
    db.query(
        "INSERT INTO tabs (provider, tab_id, opened_at) VALUES (%s, %s, NOW())",
        (provider, tab.id),
    )
    tabs_by_provider[provider] = tab.id
    return tab.id
```

:::

Once the tab is open, your middleware or your `createPayFetch` call uses it automatically — no extra wiring. The explicit open exists so you can set the size and cap, and so you can save the tab ID before anyone needs it.

### `tab.low_balance`: Top Up or Close

The `tab.low_balance` webhook fires when a tab's remaining balance drops below 20% of what it was funded with. Register once at deploy time; handle the event in your existing webhook handler.

```typescript
// POST /webhooks/pay handler
app.post("/webhooks/pay", async (req, res) => {
  // Verify HMAC signature first — see /webhooks
  const event = req.body;

  if (event.event === "tab.low_balance") {
    // Option A: top up and keep the tab alive (no new activation fee)
    await wallet.topUpTab(event.tab_id, 20.00);
  }

  res.status(200).end();
});
```

Topping up is cheaper than closing and reopening — no new activation fee, and the existing `maxChargePerCall` cap is preserved. Choose closing only if the provider has changed pricing or you want a smaller tab going forward. See [Webhooks](/webhooks) for the full payload shape and HMAC verification.

### Shutdown: Close or Leave

On graceful shutdown you have two reasonable options:

1. **Close the tabs.** Recovers any remaining balance immediately. Good if deploys are frequent and the same wallet runs other workloads.
2. **Leave them open.** Reuses on next startup, no new activation fee. Good if uptime is the norm and you redeploy the same service in-place.

The third, bad option is to do nothing in either direction — orphaned tab IDs in a closed process still count against your wallet's locked balance until the 30-day auto-close fires.

## Tab Sizing by Call Volume

A rule of thumb by expected daily call volume at the tab's price per call:

| Volume | Recommended tab size | Why |
|--------|----------------------|-----|
| Under 100 calls/day | Let auto-open handle it, or open the minimum ($5) | Activation fee dominates for small tabs, but the minimum still buys hundreds of calls at typical prices |
| 100–10,000 calls/day | Open a $20–50 tab manually, top up on `tab.low_balance` | Manual sizing pays back the activation-fee planning within a day |
| 10,000+ calls/day | Open a $100+ tab, monitor balance proactively via `tab.low_balance` and `tab.settled` | Activation fee becomes negligible; what matters is never running out |

Three things to check when sizing:

1. **Total balance should cover at least 10x the per-call price.** Below 10 expected charges, you are just paying an activation fee to move money on-chain. Below 5 expected charges, direct settlement is cheaper.
2. **`maxChargePerCall` should be the largest single price the provider can legitimately charge**, not more. A tab with `maxChargePerCall = $100` blocks nothing if the provider's real prices are cents. A tight cap is a blast-radius control, not a feature flag.
3. **Round up, not down.** Activation fees are `max($0.10, 1% of tab amount)`, so a $5 tab pays the same fee as a $10 tab. Tight rounding buys nothing and loses flexibility.

## Anti-Patterns

A short list of mistakes we see, in rough order of how expensive they are to recover from.

**Never open a new tab per request.** This is the fail mode people land in when they copy a "quick start" into a middleware handler. One tab per request means one activation fee per request, which is one to two orders of magnitude more expensive than direct settlement for the same call. If you find yourself calling `wallet.openTab()` inside a per-request handler, you probably wanted `createPayFetch` with an auto-opened tab instead.

**Never hardcode a tab ID.** Tab IDs are short-lived. They expire, they close, they change when you redeploy. A hardcoded tab ID is a bug waiting for an auto-close to trigger it. Store tab IDs in a database keyed by provider address and re-verify on startup.

**Never ignore `tab.low_balance` in production.** A tab that runs out of balance will reject new charges, and the provider's server will return 402 with `insufficient_balance`. Your middleware will bubble this up as `PayInsufficientFundsError`. By the time your on-call sees the alert, you have already dropped requests. Register the webhook, handle it, and either top up or close-and-reopen before the tab empties.

**Never cache tab IDs across wallets.** If you rotate keys (see [Wallet Key Management](/guides/build-with-pay/key-management)) you retire the old wallet and the tab IDs tied to it. The new wallet needs new tabs. Tab-ID caches keyed by provider-only, rather than by `(wallet_address, provider)`, are a source of quiet data loss on rotation day.

**Never leave stale tabs open indefinitely.** The auto-close safety net covers abandoned tabs, but it is a safety net, not a plan. If your service has shut down permanently, close its tabs and recover the balance.

## Further Reading

- [Choosing Your Integration](/guides/build-with-pay/choosing) — higher-level integration decision
- [Wallet Key Management](/guides/build-with-pay/key-management) — what backs every tab
- [Application Middleware overview](/middleware/) — the `payMiddleware` / `PayMiddleware` / `withPay` forms that wrap Pattern 1
- [Tab Lifecycle quickstart](/quickstart/tab) — end-to-end example against a live wallet
- [TypeScript SDK — Tabs](/sdk/typescript) — full `openTab`, `getTab`, `topUpTab`, `closeTab` reference
- [Python SDK — Tabs](/sdk/python) — `open_tab`, `get_tab`, `top_up_tab`, `close_tab`
- [Webhooks](/webhooks) — `tab.opened`, `tab.low_balance`, `tab.closing_soon`, `tab.closed`, `tab.topped_up` payloads and HMAC verification
