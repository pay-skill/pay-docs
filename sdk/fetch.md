---
title: "fetch() Wrapper — Automatic x402 for Any SDK"
description: "Make any fetch() call pay for itself. Drop-in x402 support for OpenAI, Anthropic, Vercel AI SDK, LangChain, and raw fetch."
---

# fetch() Wrapper

Make any `fetch()` call handle x402 payments automatically.

## The 30-Second Version

::: code-group
```typescript [TypeScript]
import { Wallet, createPayFetch } from "@pay-skill/sdk";
import OpenAI from "openai";

const wallet = await Wallet.create();
const payFetch = createPayFetch(wallet);

const openai = new OpenAI({ fetch: payFetch });
// Every API call through this client auto-pays via x402
```

```python [Python]
from payskill import Wallet, create_pay_fetch
import httpx

wallet = Wallet.create()
pay = create_pay_fetch(wallet)

# Direct call
response = pay("https://api.example.com/data")

# Or inject into any httpx-based client
client = httpx.Client(transport=pay.transport())
response = client.get("https://api.example.com/data")
```
:::

That's it. Non-402 responses pass through untouched. When a server returns 402 Payment Required, the wallet settles the payment (via tab or direct) and retries the request. Your code never sees the 402.

---

## Two Ways to Use It

### 1. Named wrapper (recommended)

Create a pay-enabled HTTP callable and use it directly or inject into other SDKs:

::: code-group
```typescript [TypeScript]
import { Wallet, createPayFetch } from "@pay-skill/sdk";

const wallet = await Wallet.create();
const payFetch = createPayFetch(wallet);

// Use directly
const resp = await payFetch("https://api.example.com/data");
const data = await resp.json();
```

```python [Python]
from payskill import Wallet, create_pay_fetch

wallet = Wallet.create()
pay = create_pay_fetch(wallet)

# Use directly
resp = pay("https://api.example.com/data")
data = resp.json()
```
:::

### 2. Global patch (TypeScript) / Transport injection (Python)

::: code-group
```typescript [TypeScript — global patch]
import { Wallet, register } from "@pay-skill/sdk";

const wallet = await Wallet.create();
const unregister = register(wallet);

// Now every fetch() handles 402 automatically
const resp = await fetch("https://api.example.com/data");

// Restore original fetch when done
unregister();
```

```python [Python — httpx transport]
import httpx
from payskill import Wallet, create_pay_fetch

wallet = Wallet.create()
pay = create_pay_fetch(wallet)

# Inject into httpx.Client -- all requests auto-pay
client = httpx.Client(transport=pay.transport())
resp = client.get("https://api.example.com/data")
```
:::

---

## SDK Injection Examples

### TypeScript

Every major AI SDK accepts a custom `fetch`. One line to wire it up.

```typescript
// OpenAI
import OpenAI from "openai";
const openai = new OpenAI({ fetch: payFetch });

// Anthropic
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ fetch: payFetch });

// Vercel AI SDK
import { createOpenAI } from "@ai-sdk/openai";
const provider = createOpenAI({ fetch: payFetch });

// LangChain.js
import { ChatOpenAI } from "@langchain/openai";
const model = new ChatOpenAI({ configuration: { fetch: payFetch } });
```

### Python

Python SDKs that accept a custom `httpx.Client` can be wired up via `.transport()`:

```python
import httpx
from payskill import Wallet, create_pay_fetch

wallet = Wallet.create()
pay = create_pay_fetch(wallet)
pay_client = httpx.Client(transport=pay.transport())

# Anthropic
import anthropic
client = anthropic.Anthropic(http_client=pay_client)

# OpenAI
import openai
client = openai.OpenAI(http_client=pay_client)
```

For Python libraries that use `requests` instead of `httpx`, use the wrapper directly:

```python
pay = create_pay_fetch(wallet)
resp = pay("https://api.example.com/data", method="POST", body={"query": "..."})
```

---

## Budget Controls

Agents shouldn't have unlimited spending. Set hard limits:

::: code-group
```typescript [TypeScript]
const payFetch = createPayFetch(wallet, {
  maxPerRequest: 1.00,   // reject any single payment over $1
  maxTotal: 50.00,       // reject once $50 total has been spent
  onPayment: ({ url, amount, settlement }) => {
    console.log(`Paid $${amount.toFixed(2)} (${settlement}) for ${url}`);
  },
});
```

```python [Python]
pay = create_pay_fetch(
    wallet,
    max_per_request=1.00,   # reject any single payment over $1
    max_total=50.00,        # reject once $50 total has been spent
    on_payment=lambda e: print(f"Paid ${e.amount:.2f} ({e.settlement}) for {e.url}"),
)
```
:::

When a limit is hit, `PayBudgetExceededError` is thrown:

::: code-group
```typescript [TypeScript]
import { PayBudgetExceededError } from "@pay-skill/sdk";

try {
  const resp = await payFetch("https://expensive-api.example.com/generate");
} catch (err) {
  if (err instanceof PayBudgetExceededError) {
    console.log(err.limitType);  // "perRequest" or "total"
    console.log(err.spent);      // dollars spent so far
    console.log(err.requested);  // dollars this request wanted
  }
}
```

```python [Python]
from payskill import PayBudgetExceededError

try:
    resp = pay("https://expensive-api.example.com/generate")
except PayBudgetExceededError as e:
    print(e.limit_type)   # "per_request" or "total"
    print(e.spent)        # dollars spent so far
    print(e.requested)    # dollars this request wanted
```
:::

### Options

| Option (TS / Python) | Type | Default | Description |
|--------|------|---------|-------------|
| `maxPerRequest` / `max_per_request` | `number` / `float` | none | Max dollars for a single 402 settlement |
| `maxTotal` / `max_total` | `number` / `float` | none | Max total dollars across all settlements |
| `onPayment` / `on_payment` | `function` / `Callable` | none | Called after each successful payment |

### PaymentEvent

::: code-group
```typescript [TypeScript]
interface PaymentEvent {
  url: string;                          // URL that required payment
  amount: number;                       // Dollars paid
  settlement: "direct" | "tab" | string; // How it was settled
}
```

```python [Python]
@dataclass
class PaymentEvent:
    url: str          # URL that required payment
    amount: float     # Dollars paid
    settlement: str   # "direct" or "tab"
```
:::

### Tracking Spend

::: code-group
```typescript [TypeScript]
// Not available as a property in TS — track via onPayment callback
```

```python [Python]
pay = create_pay_fetch(wallet)
pay("https://api.example.com/data")
print(pay.total_spent)   # cumulative dollars spent
```
:::

---

## How It Works

```
Your code          createPayFetch         Server
   |                    |                    |
   |--- fetch(url) ---->|                    |
   |                    |--- GET url ------->|
   |                    |<-- 402 + headers --|
   |                    |                    |
   |                [check budget]           |
   |                [wallet.settle()]        |
   |                    |                    |
   |                    |--- GET url ------->|
   |                    |   + PAYMENT-SIG    |
   |                    |<-- 200 + data -----|
   |<--- Response ------|                    |
```

1. Your `fetch()` call goes to the server.
2. Server returns 402 with payment requirements in the `PAYMENT-REQUIRED` header.
3. Budget limits are checked. If exceeded, `PayBudgetExceededError` is thrown.
4. The wallet settles via **tab** (pre-funded, for micropayments) or **direct** (on-chain USDC transfer).
5. The request is retried with a `PAYMENT-SIGNATURE` header containing the payment proof.
6. The final response is returned to your code.

Tab settlement is preferred when available. It costs a fraction of a cent per call instead of an on-chain transaction per call.

---

## When to Use What

| You want to... | TypeScript | Python |
|----------------|------------|--------|
| Call a paid API from your code | `createPayFetch(wallet)` | `create_pay_fetch(wallet)` |
| Inject into OpenAI/Anthropic | `new OpenAI({ fetch: payFetch })` | `OpenAI(http_client=httpx.Client(transport=pay.transport()))` |
| Patch all HTTP calls globally | `register(wallet)` | N/A (use `.transport()` per-client) |
| Make a one-off paid request | `wallet.request(url)` | `wallet.request(url)` |
| Call from CLI or shell scripts | `pay request <url>` | `pay request <url>` |
