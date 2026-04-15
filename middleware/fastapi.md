---
title: "FastAPI Middleware — payskill-fastapi"
description: "x402 payments for FastAPI. PayMiddleware attaches a pay-enabled fetch to request.state.pay; require_payment gates routes via Depends()."
---

# FastAPI Middleware

`payskill-fastapi` wraps the [Python SDK](/sdk/python) for FastAPI and Starlette. Two exports:

- **`PayMiddleware`** — consumer. A Starlette `BaseHTTPMiddleware` that attaches `request.state.pay.fetch` and `request.state.pay.wallet` to every request.
- **`require_payment(...)`** — provider. A factory that returns a FastAPI dependency; use it with `Depends()` to gate a route behind x402 payment verification.

Start at the [middleware overview](/middleware/) if you haven't picked a package yet.

## Install

```bash
pip install pay-skill payskill-fastapi fastapi uvicorn
```

Dependencies:

| Package | Range |
|---------|-------|
| `pay-skill` | `>=0.1.14` |
| `fastapi` | `>=0.100` |
| `starlette` | inherited via `fastapi` |
| Python | `>=3.10` |

The package imports from `payskill_fastapi` (underscore) even though the PyPI name is `payskill-fastapi` (hyphen). This matches the `payskill` / `pay-skill` convention in the rest of the Python ecosystem.

## Consumer — `PayMiddleware`

Attach the middleware at app startup and call `request.state.pay.fetch(url)` from any route handler. The middleware shares a single `create_pay_fetch` instance across requests, so budget limits accumulate across the app's lifetime.

```python
# app/main.py
from fastapi import FastAPI, Request
from payskill import Wallet
from payskill_fastapi import PayMiddleware

wallet = Wallet.create()          # OS keychain, mainnet
app = FastAPI()

app.add_middleware(
    PayMiddleware,
    wallet=wallet,
    max_per_request=1.00,         # reject any single payment over $1
    max_total=100.00,             # stop after $100 total
    on_payment=lambda e: print(f"[pay] ${e.amount:.2f} ({e.settlement}) -> {e.url}"),
)

@app.get("/forecast/{city}")
async def forecast(city: str, request: Request):
    upstream = request.state.pay.fetch(
        f"https://weather.example.com/v1/forecast?city={city}"
    )
    if upstream.status_code != 200:
        return {"error": upstream.reason_phrase}
    return upstream.json()
```

::: warning
`PayMiddleware` is a Starlette `BaseHTTPMiddleware`, not an ASGI middleware. Use `app.add_middleware(PayMiddleware, ...)`, **not** `app.add_middleware(BaseHTTPMiddleware, dispatch=...)`. The package handles the dispatch internally.
:::

### What the middleware attaches

```python
request.state.pay.fetch    # PayFetch callable — auto-settles x402
request.state.pay.wallet   # Wallet instance — for direct payments, tabs
```

`request.state` is a per-request bag — `pay` is reset for every incoming request, but the underlying `PayFetch` instance and wallet are shared across the entire app.

### Options

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `wallet` | `Wallet` | **required** | A configured Ᵽay wallet |
| `max_per_request` | `float` | `None` | Max dollars for a single 402 settlement |
| `max_total` | `float` | `None` | Max total dollars across the middleware's lifetime |
| `on_payment` | `Callable[[PaymentEvent], None]` | `None` | Called after each successful payment |

See [`create_pay_fetch`](/sdk/fetch#budget-controls) for the underlying options — `PayMiddleware` passes them straight through.

### Handling budget-exceeded errors

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from payskill import PayBudgetExceededError

@app.exception_handler(PayBudgetExceededError)
async def budget_handler(request: Request, exc: PayBudgetExceededError):
    return JSONResponse(
        status_code=503,
        content={
            "error": "budget_exceeded",
            "limit_type": exc.limit_type,   # "per_request" or "total"
            "spent": exc.spent,
            "requested": exc.requested,
        },
    )
```

Handlers registered via `@app.exception_handler` run before FastAPI's default error path, so the response is clean JSON the client can parse.

## Provider — `require_payment`

Gate individual routes by declaring a dependency built with `require_payment(...)`. FastAPI calls the dependency before the route handler; if payment is invalid, the dependency raises an `HTTPException` and the handler never runs.

```python
from fastapi import FastAPI, Depends
from payskill_fastapi import require_payment, PaymentInfo

app = FastAPI()

PROVIDER = "0xYourProviderWallet0000000000000000000000"

# Free route
@app.get("/api/health")
async def health():
    return {"ok": True}

# Micropayment -- tab settlement, $0.01 per call
@app.get("/api/quote")
async def get_quote(
    payment: PaymentInfo = Depends(
        require_payment(
            price=0.01,
            settlement="tab",
            provider_address=PROVIDER,
        ),
    ),
):
    return {
        "quote": "The best way out is always through.",
        "author": "Robert Frost",
        "paid_by": payment.from_address,
    }

# One-shot -- direct settlement, $2.00 per call
@app.post("/api/report")
async def generate_report(
    body: dict,
    payment: PaymentInfo = Depends(
        require_payment(
            price=2.00,
            settlement="direct",
            provider_address=PROVIDER,
        ),
    ),
):
    return {"report": build_report(body), "paid_by": payment.from_address}
```

::: warning Why `Depends`, not a decorator
FastAPI's route decorators (`@app.get`, `@app.post`) wrap the endpoint in a way that breaks layered decorators — `@require_payment` above `@app.get` does not propagate correctly. `require_payment` is therefore shaped as a FastAPI dependency, not a decorator. Use it with `Depends(...)` on a keyword argument.
:::

### Options

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `price` | `float` | **required** | Dollar amount charged per request |
| `settlement` | `"tab" \| "direct"` | **required** | `tab` for micropayments, `direct` for $1+ one-shot |
| `provider_address` | `str` | **required** | Your provider wallet (`0x...`) |
| `facilitator_url` | `str \| None` | `https://pay-skill.com/x402` | Facilitator base URL |
| `fail_mode` | `"closed" \| "open"` | `"closed"` | Behavior when the facilitator is unreachable |
| `asset` | `str \| None` | auto | USDC address; auto-detected from `facilitator_url` |

See the [overview](/middleware/#the-two-primitives) for the full facilitator `/verify` flow.

### Reading `payment` in your handler

```python
@app.get("/api/premium")
async def premium(
    payment: PaymentInfo = Depends(require_payment(
        price=0.05,
        settlement="tab",
        provider_address=PROVIDER,
    )),
):
    payment.from_address   # "0xAgentWallet..." - verified payer
    payment.amount         # 50000 - micro-USDC
    payment.settlement     # "tab"
    payment.tab_id         # None or the tab id, if tab-backed
    payment.verified       # always True
    return {"ok": True, "paid_by": payment.from_address}
```

::: tip
Use `payment.from_address`, not `payment.from`. `from` is a Python keyword, so the `PaymentInfo` dataclass field is `from_address` in Python while the TypeScript equivalent is `payment.from`. This is the only intentional asymmetry between the two SDKs.
:::

### Reusing the dependency across routes

Pre-build the dependency once and inject it into multiple routes:

```python
require_quote_payment = require_payment(
    price=0.01,
    settlement="tab",
    provider_address=PROVIDER,
)

@app.get("/api/quote/today")
async def quote_today(payment: PaymentInfo = Depends(require_quote_payment)):
    return {"quote": quote_of_the_day(), "paid_by": payment.from_address}

@app.get("/api/quote/random")
async def quote_random(payment: PaymentInfo = Depends(require_quote_payment)):
    return {"quote": random_quote(), "paid_by": payment.from_address}
```

This avoids re-resolving the facilitator URL and rebuilding the offer on every call.

### Fail modes

| `fail_mode` | Behavior when facilitator is unreachable |
|-------------|-----------------------------------------|
| `"closed"` (default) | 503 response, handler never runs. Safe default. |
| `"open"` | Handler runs with an empty `payment.from_address`. Use only for non-financial routes. |

## Consumer and Provider in One App

A single FastAPI app can expose paid endpoints and consume paid upstream APIs with the same wallet.

```python
from fastapi import FastAPI, Request, Depends
from payskill import Wallet
from payskill_fastapi import PayMiddleware, require_payment, PaymentInfo

wallet = Wallet.create()
app = FastAPI()

app.add_middleware(PayMiddleware, wallet=wallet, max_per_request=0.50)

# Your API charges $0.05 per /api/summary,
# funded by calling a paid upstream LLM under $0.50 per call.
@app.post("/api/summary")
async def summarize(
    body: dict,
    request: Request,
    payment: PaymentInfo = Depends(require_payment(
        price=0.05,
        settlement="tab",
        provider_address=wallet.address,
    )),
):
    resp = request.state.pay.fetch(
        "https://llm.example.com/summarize",
        method="POST",
        body={"text": body["text"]},
    )
    return {"summary": resp.json()["summary"], "paid_by": payment.from_address}
```

The consumer middleware and the provider dependency use the same wallet; tabs opened for upstream calls and inbound payments both settle through the same balance.

## Production Setup

### Environment variables

In Docker, Kubernetes, Render, Fly, or any Python hosting platform that injects env vars at runtime, construct the wallet from `PAYSKILL_KEY`:

```python
from payskill import Wallet

wallet = Wallet.from_env()   # reads PAYSKILL_KEY
```

Never hardcode keys. Never commit `.env` files containing real keys.

### Uvicorn / Gunicorn

`PayMiddleware` is thread-safe across a single event loop but shares state (budget counters, tab ids) across requests. Under multi-worker deployments (`uvicorn --workers 4`, `gunicorn -w 4`), each worker has its own `PayMiddleware` instance and its own budget tracking. If you need a single shared budget across workers, enforce it at the application layer (Redis counter, database check) rather than relying on `max_total`.

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Mainnet default

All examples on this page target mainnet (`https://pay-skill.com/x402`). For Base Sepolia:

```python
wallet = Wallet(testnet=True)   # or PAYSKILL_TESTNET=1
```

Point `require_payment` at the testnet facilitator:

```python
Depends(require_payment(
    price=0.01,
    settlement="tab",
    provider_address=PROVIDER,
    facilitator_url="https://testnet.pay-skill.com/x402",
))
```

Fund the wallet with `pay fund` from your laptop before starting the server.

## Troubleshooting

### "Invalid PAYMENT-SIGNATURE header: base64/JSON decode failed"

The client sent a `PAYMENT-SIGNATURE` header that is not a valid base64-encoded JSON payload. This is always a client-side bug. Confirm the client uses a current x402 V2 SDK and sets the header on the retry, not the initial request.

### 503 `facilitator_unavailable` on every request

The dependency cannot reach `https://pay-skill.com/x402/verify` within 5 seconds. Check outbound network access from your host, verify the facilitator URL, and confirm DNS resolves. Never switch to `fail_mode="open"` to work around this on a paid route.

### `request.state.pay` is `AttributeError`

`PayMiddleware` was not added, or it was added after routing was dispatched. Make sure `app.add_middleware(PayMiddleware, ...)` runs before the first request. In FastAPI, middleware added after startup does not retroactively apply.

### `@require_payment` above `@app.get` does nothing

`require_payment` is a dependency factory, not a decorator. Use it with `Depends()` on a function parameter:

```python
# wrong
@require_payment(price=0.01, settlement="tab", provider_address="0x...")
@app.get("/api/data")
async def get_data(): ...

# correct
@app.get("/api/data")
async def get_data(
    payment: PaymentInfo = Depends(require_payment(
        price=0.01, settlement="tab", provider_address="0x..."
    )),
): ...
```

### `PaymentInfo.from` is a syntax error

Use `payment.from_address`. `from` is a reserved Python keyword.

### Budget limits reset unexpectedly

Under `uvicorn --workers N`, each worker has its own `max_total` counter. A $100 cap with 4 workers effectively allows $400 of total spend. Cap at the application layer using a shared store (Redis, database) if you need a strict global budget.

## What's Not Covered

- **WSGI frameworks (Flask, Django).** Use the [Python SDK](/sdk/python) directly with `create_pay_fetch`, or deploy [pay-gate](/gate/) as a sidecar for provider-side gating.
- **Async-only FastAPI features in Starlette.** `PayMiddleware` inherits from `BaseHTTPMiddleware`, which is documented to have performance caveats under very high concurrency. For high-RPS provider workloads, consider `pay-gate` in front of a plain ASGI app.
- **Per-user wallet custody.** Single server-side wallet per process. Multi-tenant wallet management is application-layer.
- **Browser x402.** No browser support; use [OWS](https://openwalletstandard.org/) for browser signing.

## Next Steps

- [Middleware overview](/middleware/) — decision tree and primitives reference.
- [Express guide](/middleware/express) — if you also run a Node.js API alongside FastAPI.
- [Next.js guide](/middleware/next) — App Router route handlers.
- [fetch() Wrapper](/sdk/fetch) — underlying `create_pay_fetch` that backs `PayMiddleware`.
- [Python SDK](/sdk/python) — `Wallet` API for direct payments, tabs, webhook registration.
