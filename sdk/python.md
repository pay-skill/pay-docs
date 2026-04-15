---
title: "Python SDK — USDC Payments for Python Agents"
description: "Python SDK for Ᵽay. Wallet management, direct payments, tabs, x402 requests, and webhook registration. pip install payskill."
---

# Python SDK Reference

## Installation

```bash
pip install pay-skill
```

Optional keychain support (reads key stored by `pay` CLI):

```bash
pip install pay-skill[keychain]
```

Requires Python 3.10+.

## Quick Start

```python
from payskill import Wallet

wallet = Wallet.create()  # OS keychain (same key as CLI)

# Send $5 to a provider
result = wallet.send("0xProvider...", 5.0, memo="invoice-42")
print(result.tx_hash)

# Open a metered tab
tab = wallet.open_tab("0xProvider...", 20.0, max_charge_per_call=2.0)

# Paid HTTP (x402 handled automatically)
response = wallet.request("https://api.example.com/data")
```

## Wallet Initialization

```python
from payskill import Wallet

# OS keychain (recommended -- same key as CLI)
wallet = Wallet.create()

# Environment variable (CI/containers -- reads PAYSKILL_KEY)
wallet = Wallet()

# Explicit key (testing only)
wallet = Wallet(private_key="0xabc...")

# Env var only
wallet = Wallet.from_env()

# Testnet (Base Sepolia)
wallet = Wallet(testnet=True)
# or set PAYSKILL_TESTNET=1

# OWS (Open Wallet Standard)
wallet = Wallet.from_ows(wallet_id="my-agent")
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `private_key` | `str` | `PAYSKILL_KEY` env | Agent's secp256k1 private key |
| `testnet` | `bool` | `False` | Use Base Sepolia testnet |
| `timeout` | `float` | `30.0` | Request timeout in seconds |

Supports context manager:

```python
with Wallet(private_key="0x...") as wallet:
    wallet.send("0xProvider", 5.0)
```

### Properties

```python
wallet.address  # "0x1234..." (derived from private key, read-only)
```

## Amounts

Dollar amounts by default. Use `{"micro": int}` for micro-USDC precision:

```python
wallet.send("0x...", 5.0)                    # $5.00
wallet.send("0x...", 0.01)                   # $0.01
wallet.send("0x...", {"micro": 5_000_000})   # $5.00 (exact micro-USDC)
```

| Dollars | Micro-USDC |
|---------|-----------|
| $1.00 | 1,000,000 |
| $5.00 | 5,000,000 |
| $0.01 | 10,000 |

---

## Direct Payment

```python
result = wallet.send(
    "0xProviderAddress",   # Recipient
    5.0,                   # Amount ($5.00)
    memo="invoice-42",     # Optional
)
# => SendResult(tx_hash="0xabc...", status="confirmed", amount=5.0, fee=0.05)
```

- **Minimum:** $1.00
- **Fee:** 1% deducted from provider payout (0.75% above $50k/month)
- **Permit:** Auto-signed internally (EIP-2612)

## Tab Management

### Open a Tab

```python
tab = wallet.open_tab(
    "0xProviderAddress",     # Provider wallet
    20.0,                    # Lock $20.00
    max_charge_per_call=2.0, # Max $2.00 per charge
)
# => Tab(id="abc123", amount=20.0, status="open", ...)
```

- **Minimum:** $5.00
- **Activation fee:** `max($0.10, 1% of amount)` -- non-refundable

### Charge a Tab (Provider-Side)

```python
charge = provider_wallet.charge_tab(tab_id, 1.0)  # Charge $1.00
# => ChargeResult(charge_id="chg-1", status="buffered")
```

### Top Up

```python
tab = wallet.top_up_tab(tab_id, 10.0)  # Add $10.00
```

### Close

```python
tab = wallet.close_tab(tab_id)
# => Tab(status="closed", ...)
```

Either agent or provider can close. On close:
- `total_charged x 0.99` goes to provider
- `total_charged x 0.01` goes to fee wallet
- Remainder returns to agent

### List and Get

```python
tabs = wallet.list_tabs()
tab = wallet.get_tab("abc123")
```

## x402 Payments

```python
response = wallet.request("https://api.example.com/data")
```

If the upstream returns **402 Payment Required**, the SDK automatically:

1. Parses the `PAYMENT-REQUIRED` header or response body
2. Routes by settlement mode:
   - **direct:** signs EIP-3009 TransferWithAuthorization, retries with `PAYMENT-SIGNATURE`
   - **tab:** finds or auto-opens a tab, charges it, retries with tab proof
3. Returns the final response (httpx.Response)

Options:

```python
response = wallet.request(
    "https://api.example.com/data",
    method="POST",
    body={"query": "..."},
    headers={"Authorization": "Bearer ..."},
)
```

## fetch() Wrapper

For automatic x402 handling on any HTTP call, use `create_pay_fetch`:

```python
from payskill import Wallet, create_pay_fetch

wallet = Wallet.create()
pay = create_pay_fetch(wallet, max_per_request=1.00, max_total=50.00)

# Direct call -- auto-pays any 402
resp = pay("https://api.example.com/data")

# With httpx.Client -- inject into any SDK
import httpx
client = httpx.Client(transport=pay.transport())
resp = client.get("https://api.example.com/data")
```

Budget limits throw `PayBudgetExceededError`. Track cumulative spend via `pay.total_spent`.

See the [fetch() wrapper guide](/sdk/fetch) for SDK injection examples and full API.

## Balance and Status

```python
bal = wallet.balance()
# => Balance(total=142.50, locked=20.0, available=122.50)

status = wallet.status()
# => Status(address="0x...", balance=Balance(...), open_tabs=2)
```

## Discovery

```python
# Instance method
services = wallet.discover("weather")

# Standalone (no wallet needed)
from payskill import discover
services = discover("weather", testnet=True)
```

## Fund and Withdraw Links

```python
fund_url = wallet.create_fund_link(message="Need funds")
withdraw_url = wallet.create_withdraw_link()
```

Links expire after 1 hour.

## Webhooks

```python
hook = wallet.register_webhook(
    "https://example.com/hooks",
    events=["payment.completed", "tab.opened"],
    secret="my-hmac-secret",
)
# => WebhookRegistration(id="hook-123", url="...", events=[...])

hooks = wallet.list_webhooks()
wallet.delete_webhook("hook-123")
```

## Testnet Minting

```python
result = wallet.mint(100)  # Mint $100 testnet USDC
# => MintResult(tx_hash="0x...", amount=100.0)
```

Only works when `testnet=True` or `PAYSKILL_TESTNET=1`.

---

## Error Handling

```python
from payskill import (
    PayError,
    PayValidationError,
    PayServerError,
    PayNetworkError,
    PayInsufficientFundsError,
    PayBudgetExceededError,
)

try:
    wallet.send("0xProvider", 5.0)
except PayInsufficientFundsError as e:
    print(e.balance, e.required)
    url = wallet.create_fund_link(message="Need funds")
except PayBudgetExceededError as e:
    print(e.limit_type, e.spent, e.requested)
except PayValidationError as e:
    print(e.field)
except PayServerError as e:
    print(e.status_code)
except PayNetworkError:
    print("Server unreachable")
```

| Error Class | Code | When |
|-------------|------|------|
| `PayValidationError` | `validation_error` | Invalid address, amount below minimum |
| `PayServerError` | `server_error` | Server returned 4xx/5xx |
| `PayNetworkError` | `network_error` | Connection failed |
| `PayInsufficientFundsError` | `insufficient_funds` | Not enough USDC |
| `PayBudgetExceededError` | `budget_exceeded` | Payment exceeds spending limit (fetch wrapper) |

---

## Types

```python
@dataclass
class SendResult:
    tx_hash: str
    status: str
    amount: float    # Dollars
    fee: float       # Dollars

@dataclass
class Tab:
    id: str
    provider: str
    amount: float              # Dollars
    balance_remaining: float
    total_charged: float
    charge_count: int
    max_charge_per_call: float
    total_withdrawn: float
    status: str                # "open" | "closed"
    pending_charge_count: int
    pending_charge_total: float
    effective_balance: float

@dataclass
class Balance:
    total: float       # Dollars
    locked: float
    available: float

@dataclass
class Status:
    address: str
    balance: Balance
    open_tabs: int

@dataclass
class WebhookRegistration:
    id: str
    url: str
    events: list[str]

@dataclass
class MintResult:
    tx_hash: str
    amount: float    # Dollars

@dataclass
class PaymentEvent:
    url: str          # URL that required payment
    amount: float     # Dollars paid
    settlement: str   # "direct" or "tab"
```

---

## Authentication

All API requests are automatically signed with EIP-712 auth headers. No manual signing needed.

For advanced use, auth headers include:

| Header | Value |
|--------|-------|
| `X-Pay-Agent` | Wallet address (checksummed) |
| `X-Pay-Signature` | EIP-712 signature (hex, 65 bytes) |
| `X-Pay-Timestamp` | Unix timestamp (seconds) |
| `X-Pay-Nonce` | Random 32-byte hex |

Low-level helpers are still available:

```python
from payskill.auth import build_auth_headers, derive_address

headers = build_auth_headers("0xabc...", "POST", "/api/v1/direct", 8453, "0xRouter...")
address = derive_address("0xabc...")
```
