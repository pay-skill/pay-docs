---
title: "Error Handling for x402 — Ᵽay"
description: "Every error the Ᵽay SDK raises, what causes it, how to recover, and why no silent fallback is the rule. Full TypeScript and Python handler patterns."
---

# Error Handling for x402

Payment code has two failure modes that business code does not: money can be missing, and calls can half-succeed. Both can hurt you. A silent fallback that swallows a payment error and returns default data is the worst outcome — you lose money **and** you lie to your users. The rule for every pay-related exception is the same: **catch it, decide deliberately, make the outcome visible.**

This page walks through every error class the SDK raises, what causes each one, and the recovery pattern that actually fits. It closes with a full try/except catch-all and the usual anti-patterns.

For the budget-cap side of the story (where `PayBudgetExceededError` and `PayInsufficientFundsError` come from in the first place), see [Spending Controls & Budgeting](/guides/build-with-pay/spending-controls).

## The Error Taxonomy

Both SDKs ship the same six classes. All inherit from `PayError`, so a catch on the base class catches everything.

| Class | `code` | Typical cause | Default response |
|-------|--------|---------------|------------------|
| `PayValidationError` | `validation_error` | Bad input — invalid address, amount below minimum, malformed data | Bug in your code. Fix it. Never retry. |
| `PayInsufficientFundsError` | `insufficient_funds` | Wallet balance too low to settle the request | Alert operator, pause the service, do not retry. |
| `PayBudgetExceededError` | `budget_exceeded` | `maxPerRequest` or `maxTotal` hit | Log, degrade gracefully, return a user-visible error. Do not silently continue. |
| `PayNetworkError` | `network_error` | Facilitator / API / origin unreachable | Retry with backoff (max 3). Persistent failure: alert. |
| `PayServerError` | `server_error` | Server returned 4xx/5xx after the request reached it | Inspect `statusCode`. Handle per status. |
| `PayError` | `pay_error` | Base class — catch-all for anything the SDK could not classify | Log full detail and alert. |

Fields on each class (same in both languages, just camelCase vs snake_case):

| Class | Extra fields |
|-------|--------------|
| `PayValidationError` | `field` — which input failed validation |
| `PayInsufficientFundsError` | `balance`, `required` — current balance and amount needed |
| `PayBudgetExceededError` | `spent`, `requested`, `limitType` / `limit_type` (`"perRequest"` / `"per_request"` or `"total"`) |
| `PayServerError` | `statusCode` / `status_code` |

## `PayValidationError` — A Bug in Your Code

`PayValidationError` means the inputs you passed to the SDK are wrong: an invalid address, an amount below the `$1` direct minimum or the `$5` tab minimum, a malformed payload. This is never a retry situation. Fix the code and ship again.

::: code-group

```typescript [TypeScript]
import { PayValidationError } from "@pay-skill/sdk";

try {
  await wallet.openTab("not-an-address", 20, 0.50);
} catch (err) {
  if (err instanceof PayValidationError) {
    logger.error("pay.validation", { field: err.field, message: err.message });
    throw err;                               // never retry — it will fail identically
  }
  throw err;
}
```

```python [Python]
from payskill import PayValidationError

try:
    wallet.open_tab("not-an-address", 20.0, max_charge_per_call=0.50)
except PayValidationError as err:
    log.error("pay.validation", extra={"field": err.field, "message": str(err)})
    raise                                    # never retry -- it will fail identically
```

:::

The `field` attribute tells you which input the SDK rejected. Use it in your own validation layer: if you catch `PayValidationError` in a route handler, return a 400 with the field name so the caller can fix their request too.

## `PayInsufficientFundsError` — Alert and Pause

`PayInsufficientFundsError` means the wallet is under-funded for the payment the SDK just tried to make. This is the one error you never silently continue from — the production incident that starts with "we returned default data for three hours while the wallet was empty" always traces back to a swallowed insufficient-funds error.

The correct response is to degrade loudly: alert on-call, pause the service, and stop making paid requests until someone funds the wallet.

::: code-group

```typescript [TypeScript]
import { PayInsufficientFundsError } from "@pay-skill/sdk";

try {
  const resp = await payFetch("https://api.example.com/expensive");
  return await resp.json();
} catch (err) {
  if (err instanceof PayInsufficientFundsError) {
    logger.error("pay.insufficient_funds", {
      balance: err.balance,
      required: err.required,
    });
    await alerts.page("pay wallet under-funded", {
      balance: err.balance,
      required: err.required,
    });
    // Return a user-visible error, not stale data
    throw new ServiceUnavailableError("paid upstream temporarily unavailable");
  }
  throw err;
}
```

```python [Python]
from payskill import PayInsufficientFundsError
from .alerts import page
from .errors import ServiceUnavailable

try:
    resp = pay_fetch("https://api.example.com/expensive")
    return resp.json()
except PayInsufficientFundsError as err:
    log.error(
        "pay.insufficient_funds",
        extra={"balance": err.balance, "required": err.required},
    )
    page("pay wallet under-funded", balance=err.balance, required=err.required)
    # Return a user-visible error, not stale data
    raise ServiceUnavailable("paid upstream temporarily unavailable")
```

:::

**Recovery loop:** fund the wallet via `pay fund` (Coinbase Onramp) or a direct USDC transfer on Base, then restart the service or wait for the next healthcheck to pick up the new balance. See [Wallet Key Management](/guides/build-with-pay/key-management) for funding commands.

## `PayBudgetExceededError` — The Caps Are Working

This error is the one you hope to see in logs. It means the budget caps from [Spending Controls](/guides/build-with-pay/spending-controls) are holding, and you are not burning money through a runaway loop.

Unlike `PayInsufficientFundsError`, you do not page anyone for this — the outcome is already deliberate. Log it, inspect `limitType` to understand which cap fired, and return a user-visible degraded response.

::: code-group

```typescript [TypeScript]
import { PayBudgetExceededError } from "@pay-skill/sdk";

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
    return cached ?? { error: "budget_exceeded", retry_after_seconds: 3600 };
  }
  throw err;
}
```

```python [Python]
from payskill import PayBudgetExceededError

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
    return cached or {"error": "budget_exceeded", "retry_after_seconds": 3600}
```

:::

**`limitType = "perRequest"`:** the individual call exceeded `maxPerRequest`. Likely the upstream price changed, or the call was routed to a more expensive endpoint than expected. Investigate, adjust the cap if the new price is legitimate, and retry after the fix ships.

**`limitType = "total"`:** the cumulative spend for this `createPayFetch` instance has crossed `maxTotal`. This usually means your budget is sized too small for the traffic you are seeing. The cap is doing its job — the follow-up is a capacity decision, not an incident response.

## `PayNetworkError` — Retry With Backoff

`PayNetworkError` fires when the SDK cannot reach whatever it was talking to: the Ᵽay facilitator, the origin server, the RPC endpoint. This is the one error class where retry is the correct first response.

Use exponential backoff with a small cap (3 attempts is plenty). Never retry forever — persistent network errors need a human.

::: code-group

```typescript [TypeScript]
import { PayNetworkError } from "@pay-skill/sdk";

async function payWithRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof PayNetworkError && i < attempts - 1) {
        const backoff = 200 * 2 ** i;        // 200ms, 400ms, 800ms
        logger.warn("pay.network_retry", { attempt: i + 1, backoff });
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

const data = await payWithRetry(() => payFetch("https://api.example.com/data"));
```

```python [Python]
import asyncio
import time
from payskill import PayNetworkError

def pay_with_retry(fn, attempts: int = 3):
    for i in range(attempts):
        try:
            return fn()
        except PayNetworkError:
            if i == attempts - 1:
                raise
            backoff = 0.2 * (2 ** i)         # 200ms, 400ms, 800ms
            log.warning("pay.network_retry", extra={"attempt": i + 1, "backoff": backoff})
            time.sleep(backoff)

data = pay_with_retry(lambda: pay_fetch("https://api.example.com/data"))
```

:::

**Idempotency matters.** On a retry, the SDK reuses the same nonce and payment signature if the previous attempt reached the facilitator. That means retrying does not double-charge you in the common case — but your **application-layer** request must also be idempotent, or you will reach the origin twice. Most paid GETs are idempotent; paid POSTs are not unless you designed them that way.

If your retry hits the attempt cap, bubble the error up. A persistent `PayNetworkError` is a symptom, not something to absorb silently.

## `PayServerError` — Inspect the Status Code

`PayServerError` fires when the remote side returned an HTTP error response that the SDK classified as "not something I should retry blindly." The `statusCode` field tells you what the server actually said, and the response depends on what that was.

::: code-group

```typescript [TypeScript]
import { PayServerError } from "@pay-skill/sdk";

try {
  const resp = await payFetch("https://api.example.com/data");
  return await resp.json();
} catch (err) {
  if (err instanceof PayServerError) {
    if (err.statusCode === 429) {
      // Rate limited -- back off and retry
      await new Promise((r) => setTimeout(r, 5000));
      return payFetch("https://api.example.com/data");
    }
    if (err.statusCode === 401 || err.statusCode === 403) {
      // Auth failure -- not a retry situation, check credentials/tab state
      logger.error("pay.server_auth", { status: err.statusCode, message: err.message });
      throw err;
    }
    if (err.statusCode >= 500) {
      // Origin is unhealthy -- retry once, then give up
      logger.warn("pay.server_5xx", { status: err.statusCode });
      await new Promise((r) => setTimeout(r, 1000));
      return payFetch("https://api.example.com/data");
    }
    logger.error("pay.server_4xx", { status: err.statusCode, message: err.message });
    throw err;
  }
  throw err;
}
```

```python [Python]
import time
from payskill import PayServerError

try:
    resp = pay_fetch("https://api.example.com/data")
    return resp.json()
except PayServerError as err:
    if err.status_code == 429:
        # Rate limited -- back off and retry
        time.sleep(5)
        return pay_fetch("https://api.example.com/data")
    if err.status_code in (401, 403):
        # Auth failure -- not a retry situation, check credentials/tab state
        log.error("pay.server_auth", extra={"status": err.status_code, "message": str(err)})
        raise
    if err.status_code >= 500:
        # Origin is unhealthy -- retry once, then give up
        log.warning("pay.server_5xx", extra={"status": err.status_code})
        time.sleep(1)
        return pay_fetch("https://api.example.com/data")
    log.error("pay.server_4xx", extra={"status": err.status_code, "message": str(err)})
    raise
```

:::

Three common sub-cases:

- **`429 Too Many Requests`:** the origin's rate limiter kicked in. Back off and retry a small number of times. Consider smoothing your outbound call rate.
- **`401` / `403`:** authentication or authorization failed. Check that `PAYSKILL_KEY` is loaded correctly, that the wallet holds the tab you think it does, and that the provider's address has not changed.
- **`5xx`:** the origin is unhealthy. One retry is reasonable; more than one is cargo-culting. If it keeps happening, the origin has a problem that your code can't fix.

## The Catch-All Handler

For the routes where one path handles every error class, here is the full shape. Copy it, prune the cases that do not apply to your context, and keep the `throw` at the bottom so nothing unknown gets swallowed.

::: code-group

```typescript [TypeScript]
import {
  PayValidationError,
  PayInsufficientFundsError,
  PayBudgetExceededError,
  PayNetworkError,
  PayServerError,
  PayError,
} from "@pay-skill/sdk";

async function safePay<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PayValidationError) {
      logger.error("pay.validation", { field: err.field });
      throw err;                             // bug -- never retry
    }
    if (err instanceof PayInsufficientFundsError) {
      logger.error("pay.insufficient_funds", { balance: err.balance });
      await alerts.page("pay wallet under-funded");
      throw err;                             // loud failure, not stale data
    }
    if (err instanceof PayBudgetExceededError) {
      logger.warn("pay.budget_exceeded", {
        limit_type: err.limitType,
        spent: err.spent,
      });
      return null;                           // caller returns degraded response
    }
    if (err instanceof PayNetworkError) {
      logger.warn("pay.network", { message: err.message });
      throw err;                             // let outer retry layer handle
    }
    if (err instanceof PayServerError) {
      logger.error("pay.server", {
        status: err.statusCode,
        message: err.message,
      });
      throw err;                             // route handler decides
    }
    if (err instanceof PayError) {
      logger.error("pay.unknown", { code: err.code, message: err.message });
      throw err;
    }
    throw err;                               // not a pay error at all
  }
}
```

```python [Python]
from payskill import (
    PayValidationError,
    PayInsufficientFundsError,
    PayBudgetExceededError,
    PayNetworkError,
    PayServerError,
    PayError,
)

def safe_pay(fn):
    try:
        return fn()
    except PayValidationError as err:
        log.error("pay.validation", extra={"field": err.field})
        raise                                # bug -- never retry
    except PayInsufficientFundsError as err:
        log.error("pay.insufficient_funds", extra={"balance": err.balance})
        page("pay wallet under-funded")
        raise                                # loud failure, not stale data
    except PayBudgetExceededError as err:
        log.warning(
            "pay.budget_exceeded",
            extra={"limit_type": err.limit_type, "spent": err.spent},
        )
        return None                          # caller returns degraded response
    except PayNetworkError as err:
        log.warning("pay.network", extra={"message": str(err)})
        raise                                # let outer retry layer handle
    except PayServerError as err:
        log.error("pay.server", extra={"status": err.status_code, "message": str(err)})
        raise                                # route handler decides
    except PayError as err:
        log.error("pay.unknown", extra={"code": err.code, "message": str(err)})
        raise
```

:::

## Anti-Patterns

**Never return default data on a payment error without telling the user.** A paid API returned an error, and your response is "here is some data that looks normal"? That is the worst-case silent fallback — the user trusts the answer, and you trust that the answer is right, and nobody finds out until the bill comes. Return a visible error. Cached data is fine if the cache is marked stale; pretending the paid call succeeded is not.

**Never retry `PayInsufficientFundsError`.** The balance does not refill on its own between retries. Retry is 0% successful here. Alert and pause.

**Never retry `PayValidationError`.** The input is wrong. It will be wrong next time too. Fix the code.

**Never blind-retry `PayServerError`.** Inspect `statusCode`. A 4xx retry is almost always wrong; a 5xx retry should have a tiny cap and a backoff.

**Never absorb `PayNetworkError` silently.** Retry is the correct first move, but "retry forever, never tell anyone" is not retry — it is a hidden outage. Cap the attempts, log the retries, and bubble the error up when the cap is hit.

**Never catch `Error` when you mean to catch `PayError`.** A bare `catch (err)` or `except Exception:` swallows `TypeError`, `ReferenceError`, unrelated runtime bugs, and SDK errors alike. Catch by class — `PayError` to cover the whole family, or the specific subclass you have a plan for.

**Never log the private key in an error payload.** SDK errors do not include it. Custom error wrappers that serialize the wallet object do. Check your own error handlers, especially the ones that ship errors to a third-party service.

## Further Reading

- [Choosing Your Integration](/guides/build-with-pay/choosing) — higher-level integration decision
- [Wallet Key Management](/guides/build-with-pay/key-management) — what funding `PayInsufficientFundsError` actually looks like
- [Tab Lifecycle](/guides/build-with-pay/tab-lifecycle) — tab events and the `tab.low_balance` webhook that helps prevent insufficient-funds situations
- [Spending Controls & Budgeting](/guides/build-with-pay/spending-controls) — how `PayBudgetExceededError` gets thrown in the first place
- [Application Middleware overview](/middleware/) — framework-specific error middleware patterns
- [Troubleshooting](/troubleshooting) — per-symptom recipes
