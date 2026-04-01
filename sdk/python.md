# Python SDK Reference

## Installation

```bash
pip install payskill
```

Requires Python 3.10+.

## Quick Start

```python
from payskill import PayClient

client = PayClient(
    api_url="https://pay-skill.com/api/v1",
    signer="raw",
    private_key="0xabc...",
    chain_id=8453,
    router_address="0x...",  # from /api/v1/contracts
)

# Send $5 to a provider
result = client.pay_direct("0xProvider...", 5_000_000, memo="invoice-42")
print(result.tx_hash)
```

## PayClient

### Constructor

```python
from payskill import PayClient

client = PayClient(
    api_url="https://pay-skill.com/api/v1",
    signer="raw",               # "cli", "raw", or "custom"
    private_key="0xabc...",     # Required for "raw" mode
    chain_id=8453,              # Base mainnet
    router_address="0x...",     # PayRouter contract
)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `api_url` | `str` | `https://pay-skill.com/api/v1` | Pay API base URL |
| `signer` | `str \| Signer` | `"cli"` | Signer mode or instance |
| `private_key` | `str \| None` | `None` | Private key for raw signer |
| `chain_id` | `int \| None` | `None` | EIP-712 domain chain ID |
| `router_address` | `str \| None` | `None` | EIP-712 domain contract |

Supports context manager:

```python
with PayClient(private_key="0x...") as client:
    client.pay_direct("0xProvider", 5_000_000)
```

### Direct Payment

```python
result = client.pay_direct(
    to="0xProviderAddress",     # Recipient wallet
    amount=5_000_000,           # $5.00 in micro-USDC
    memo="invoice-42",          # Optional metadata
)
# => DirectPaymentResult(tx_hash="0xabc...", status="confirmed", amount=5000000, fee=50000)
```

- **Minimum:** 1,000,000 ($1.00)
- **Fee:** 1% deducted from provider payout
- **Permit:** Auto-signed (EIP-2612 approval to PayDirect contract)

### Tab Management

#### Open a Tab

```python
tab = client.open_tab(
    provider="0xProviderAddress",
    amount=20_000_000,              # Lock $20.00
    max_charge_per_call=2_000_000,  # Max $2.00 per charge
)
# => Tab(tab_id="abc123", status="open", balance_remaining=19900000)
```

- **Minimum:** 5,000,000 ($5.00)
- **Activation fee:** `max($0.10, 1% of amount)` — non-refundable

#### Top Up a Tab

```python
tab = client.top_up_tab("abc123", 10_000_000)  # Add $10.00
```

#### Close a Tab

```python
tab = client.close_tab("abc123")
# => Tab(status="closed")
```

Either agent or provider can close unilaterally. On close:
- `total_charged * 0.99` goes to provider
- `total_charged * 0.01` goes to fee wallet
- Remainder returns to agent

#### List and Get Tabs

```python
tabs = client.list_tabs()                # All tabs
tab = client.get_tab("abc123")           # Single tab
```

### x402 Request Handling

```python
response = client.request("https://api.example.com/data")
```

If the upstream returns **402 Payment Required**, the SDK automatically:

1. Reads `settlement`, `amount`, and `to` from the 402 response body
2. If `settlement == "tab"`: finds or opens a tab, charges it, retries with payment headers
3. If `settlement == "direct"`: calls `pay_direct()`, retries with `X-Payment-Tx` header

Options:

```python
response = client.request(
    "https://api.example.com/data",
    method="POST",
    body={"query": "..."},
    headers={"Authorization": "Bearer ..."},
)
```

### Status

```python
status = client.get_status()
# => StatusResponse(wallet="0x...", balance_usdc="142500000", open_tabs=2)

status.address    # "0x..." (alias for wallet)
status.balance    # 142500000 (micro-USDC as int)
```

### Webhooks

```python
# Register
hook = client.register_webhook(
    url="https://example.com/hooks",
    events=["payment.completed", "tab.charged"],  # Optional filter
    secret="my-hmac-secret",                       # Optional HMAC key
)
# => WebhookRegistration(id="hook-123", url="...", events=[...])

# List
hooks = client.list_webhooks()

# Delete
client.delete_webhook("hook-123")
```

### Fund and Withdraw Links

```python
fund_url = client.create_fund_link()
# => "https://pay-skill.com/fund?token=abc123"

withdraw_url = client.create_withdraw_link()
# => "https://pay-skill.com/withdraw?token=abc123"
```

---

## Signer Modes

### CLI Signer (Default)

Delegates signing to the `pay sign` CLI subprocess:

```python
client = PayClient(signer="cli")
```

### Raw Key Signer

Uses `eth_account` for direct signing. Best for development:

```python
client = PayClient(signer="raw", private_key="0xabc...")
```

Or via environment variable `PAYSKILL_KEY`.

### Custom Callback Signer

Provide your own signing function:

```python
from payskill.signer import CallbackSigner

signer = CallbackSigner(
    callback=lambda hash_bytes: your_signing_function(hash_bytes),
    address="0xYourAddress",
)
client = PayClient(signer=signer)
```

---

## Error Handling

```python
from payskill import PayClient
from payskill.errors import (
    PayError,
    PayValidationError,
    PayServerError,
    PayNetworkError,
    PayInsufficientFundsError,
)

try:
    client.pay_direct("0xProvider", 5_000_000)
except PayValidationError as e:
    # Client-side validation failed (bad address, below minimum)
    print(e.field)  # e.g., "to", "amount"
except PayServerError as e:
    # Server returned an error
    print(e.status_code)  # e.g., 402, 500
except PayNetworkError:
    # Connection error
    pass
```

| Error Class | When |
|-------------|------|
| `PayValidationError` | Invalid address, amount below minimum |
| `PayServerError` | Server returned 4xx/5xx |
| `PayNetworkError` | Connection failed |
| `PayInsufficientFundsError` | Not enough USDC |

---

## Data Models

All models use [Pydantic](https://docs.pydantic.dev/) for validation and serialization.

```python
class DirectPaymentResult(BaseModel):
    payment_id: str
    tx_hash: str | None       # On-chain transaction hash
    status: str               # "confirmed"
    amount: int               # Micro-USDC sent
    fee: int                  # Micro-USDC fee deducted

class Tab(BaseModel):
    tab_id: str
    provider: str
    amount: int               # Total locked (micro-USDC)
    balance_remaining: int    # Remaining balance
    total_charged: int
    charge_count: int
    max_charge_per_call: int
    status: str               # "open" | "closed"
    auto_close_after: str | None

class StatusResponse(BaseModel):
    wallet: str
    balance_usdc: str | None  # Decimal string
    open_tabs: int
    total_locked: int

class WebhookRegistration(BaseModel):
    id: str
    url: str
    events: list[str]
```

---

## Authentication

All `/api/v1/*` requests include EIP-712 signed headers:

| Header | Value |
|--------|-------|
| `X-Pay-Agent` | Wallet address |
| `X-Pay-Signature` | EIP-712 signature (hex, 65 bytes) |
| `X-Pay-Timestamp` | Unix timestamp (seconds) |
| `X-Pay-Nonce` | Random 32-byte hex |

Helper functions for manual signing:

```python
from payskill import build_auth_headers, derive_address

headers = build_auth_headers(
    private_key="0xabc...",
    method="POST",
    path="/api/v1/direct",
    chain_id=8453,
    router_address="0x...",
)

address = derive_address("0xabc...")  # => "0x1234..."
```

### Amount Units

All amounts are in **USDC micro-units** (6 decimals):

| Dollars | Micro-USDC |
|---------|-----------|
| $1.00 | 1,000,000 |
| $5.00 | 5,000,000 |
| $0.01 | 10,000 |
