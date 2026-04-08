# API Reference

Complete reference for the Pay server REST API. All endpoints are served from `https://pay-skill.com` (mainnet) or `https://testnet.pay-skill.com` (testnet).

All monetary amounts are in **micro-USDC** (6 decimals). `$1.00 = 1,000,000`.

## Base URLs

| Environment | Base URL |
|-------------|----------|
| Mainnet | `https://pay-skill.com` |
| Testnet | `https://testnet.pay-skill.com` |

## Authentication

Most endpoints require **EIP-712 signed headers**. Some dual-auth endpoints also accept **Bearer tokens** (obtained via pay links).

### EIP-712 Headers

| Header | Description |
|--------|-------------|
| `X-Pay-Agent` | Wallet address of the caller (checksummed) |
| `X-Pay-Signature` | EIP-712 signature over the request body |
| `X-Pay-Timestamp` | Unix timestamp (seconds). Must be within 5 minutes of server time. |
| `X-Pay-Nonce` | Unique nonce to prevent replay attacks |

### Bearer Token

```
Authorization: Bearer <token>
```

Tokens are obtained from pay links (`POST /api/v1/links/fund` or `POST /api/v1/links/withdraw`). Dual-auth endpoints accept either EIP-712 headers or a Bearer token.

---

## Error Format

All errors return a JSON body:

```json
{
  "error": "insufficient_balance",
  "message": "Wallet balance is below the required amount"
}
```

### Status Codes

| Code | Meaning |
|------|---------|
| `200` | OK |
| `201` | Created |
| `204` | No Content |
| `400` | Bad Request — invalid parameters or missing fields |
| `402` | Payment Required — insufficient funds |
| `403` | Forbidden — invalid signature or unauthorized |
| `404` | Not Found |
| `410` | Gone — resource expired |
| `429` | Too Many Requests — rate limit exceeded |
| `500` | Internal Server Error |
| `502` | Bad Gateway — upstream chain RPC failure |

---

## Public Endpoints

No authentication required.

### GET /health

Server health check.

**Response**

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

---

### GET /api/v1/contracts

Returns deployed contract addresses for the current network. Never hardcode these — always fetch at startup.

**Response**

| Field | Type | Description |
|-------|------|-------------|
| `chain_id` | `number` | Chain ID (8453 mainnet, 84532 testnet) |
| `router` | `string` | PayRouter contract address |
| `tab` | `string` | PayTab V1 contract address |
| `tab_v2` | `string?` | PayTab V2 contract address (if deployed) |
| `direct` | `string` | DirectPay contract address |
| `usdc` | `string` | USDC token contract address |

```json
{
  "chain_id": 84532,
  "router": "0x...",
  "tab": "0x...",
  "tab_v2": "0x...",
  "direct": "0x...",
  "usdc": "0x..."
}
```

---

### POST /api/v1/mint

Mint testnet USDC to a wallet. **Testnet only.**

**Rate limit:** 1 request per hour per wallet.

**Request**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `wallet` | `string` | Yes | Recipient wallet address |
| `amount` | `number` | No | Amount in micro-USDC (defaults to server-defined amount) |

**Response**

```json
{
  "tx_hash": "0xabc...",
  "amount": 100000000,
  "to": "0x..."
}
```

---

## Authenticated Endpoints

Require EIP-712 signed headers.

### POST /api/v1/direct

Send a direct USDC payment.

**Rate limit:** 120 requests per minute per wallet.

**Request**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | `string` | Yes | Recipient wallet address |
| `amount` | `number` | Yes | Amount in micro-USDC. Minimum `1000000` ($1.00). |
| `memo` | `string` | No | Payment memo (shown in activity) |
| `permit` | `object` | Yes | EIP-2612 permit signature for USDC spend |

**Response**

```json
{
  "payment_id": "pay_abc123",
  "tx_hash": "0x...",
  "status": "confirmed"
}
```

---

### POST /api/v1/permit/prepare

Prepare a USDC permit for signing. Returns the typed-data hash the caller signs with their wallet.

**Request**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | `number` | Yes | Amount in micro-USDC to approve |
| `spender` | `string` | Yes | Contract address that will spend the tokens |

**Response**

| Field | Type | Description |
|-------|------|-------------|
| `hash` | `string` | Typed-data hash to sign |
| `nonce` | `number` | Current permit nonce for the wallet |
| `deadline` | `number` | Unix timestamp. Permit expires 30 minutes from now. |
| `spender` | `string` | Spender address (echoed back) |
| `amount` | `string` | Amount (echoed back) |

---

### POST /api/v1/tabs

Open a new tab (pre-funded spending account).

**Rate limit:** 10 requests per minute per wallet.

**Request**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | `string` | Yes | Provider wallet address |
| `amount` | `number` | Yes | Funding amount in micro-USDC. Minimum `5000000` ($5.00). |
| `max_charge_per_call` | `number` | Yes | Maximum per-charge amount in micro-USDC |
| `permit` | `object` | Yes | EIP-2612 permit for the funding amount |
| `auto_close_after` | `number` | No | Auto-close after this many seconds |

**Response**

```json
{
  "tab_id": "tab_abc123",
  "activation_fee": 100000,
  "balance": 4900000,
  "tx_hash": "0x...",
  "status": "active"
}
```

---

### GET /api/v1/tabs

List tabs for the authenticated wallet.

**Query Parameters**

| Param | Type | Description |
|-------|------|-------------|
| `status` | `string` | Filter by status: `active`, `closed`, `expired` |

Returns up to 100 tabs.

**Response:** `Tab[]`

---

### GET /api/v1/tabs/:id

Get a single tab by ID.

**Response:** `Tab` object.

**Tab Object**

| Field | Type | Description |
|-------|------|-------------|
| `tab_id` | `string` | Tab identifier |
| `agent` | `string` | Agent wallet address |
| `provider` | `string` | Provider wallet address |
| `amount` | `number` | Total funded amount |
| `balance` | `number` | Remaining balance |
| `max_charge_per_call` | `number` | Per-charge limit |
| `charge_count` | `number` | Total charges made |
| `total_charged` | `number` | Sum of all charges |
| `status` | `string` | `active`, `closed`, or `expired` |
| `tx_hash` | `string` | On-chain transaction hash |
| `created_at` | `string` | ISO 8601 timestamp |

---

### POST /api/v1/tabs/:id/charge

Charge an open tab. Only the tab's provider can call this.

**Request**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | `number` | Yes | Charge amount in micro-USDC. Must not exceed `max_charge_per_call`. |

**Response**

```json
{
  "charge_id": "chg_abc123",
  "tab_id": "tab_abc123",
  "amount": 1000000,
  "balance_remaining": 3500000,
  "status": "charged"
}
```

---

### POST /api/v1/tabs/:id/close

Close a tab and settle remaining funds on-chain. Either the agent or provider can close.

**Response**

```json
{
  "tab_id": "tab_abc123",
  "total_charged": 3000000,
  "charge_count": 5,
  "tx_hash": "0x...",
  "status": "closed"
}
```

---

### POST /api/v1/tabs/:id/topup

Add funds to an existing open tab.

**Request**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | `number` | Yes | Top-up amount in micro-USDC |
| `permit` | `object` | Yes | EIP-2612 permit for the top-up amount |

**Response**

```json
{
  "tab_id": "tab_abc123",
  "amount": 5000000,
  "new_balance": 8500000,
  "tx_hash": "0x...",
  "status": "topped_up"
}
```

---

### GET /api/v1/tabs/:id/charges

List charges for a tab.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | `number` | 50 | Max results per page |
| `offset` | `number` | 0 | Pagination offset |

**Response**

```json
{
  "tab_id": "tab_abc123",
  "data": [
    {
      "charge_id": "chg_abc123",
      "amount": 1000000,
      "created_at": "2026-04-01T12:05:00Z"
    }
  ],
  "total": 5,
  "limit": 50,
  "offset": 0
}
```

---

## Dual-Auth Endpoints

Accept either EIP-712 signed headers or Bearer token.

### GET /api/v1/status

Get the authenticated wallet's status.

**Response**

```json
{
  "wallet": "0x...",
  "balance_usdc": 50000000,
  "open_tabs": 2,
  "total_locked": 10000000
}
```

`balance_usdc` may be `null` if the balance lookup fails.

---

### GET /api/v1/status/:wallet

Get status for a specific wallet. Returns the same shape as `GET /api/v1/status`.

---

### POST /api/v1/webhooks

Register a webhook endpoint.

**Rate limit:** 10 requests per hour per wallet.

**Request**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | `string` | Yes | HTTPS callback URL |
| `events` | `string[]` | Yes | Event types to subscribe to (see [Webhooks](/webhooks)) |
| `secret` | `string` | No | HMAC signing secret. Auto-generated if omitted. |

**Response**

```json
{
  "id": "wh_abc123",
  "wallet": "0x...",
  "url": "https://example.com/hooks",
  "events": ["payment.completed", "tab.opened"],
  "active": true
}
```

---

### GET /api/v1/webhooks

List all webhooks for the authenticated wallet.

**Response:** `Webhook[]`

---

### DELETE /api/v1/webhooks/:id

Delete a webhook. Returns `204 No Content`.

---

### GET /api/v1/events

Query the activity feed for the authenticated wallet.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | `number` | 50 | Max results per page |
| `offset` | `number` | 0 | Pagination offset |
| `period` | `string` | `30d` | Time window: `7d`, `30d`, or `90d` |
| `direction` | `string` | — | Filter by direction: `inbound` or `outbound` |

**Response**

```json
{
  "data": [
    {
      "event": "payment.completed",
      "timestamp": "2026-04-01T12:00:00Z",
      "amount": 5000000,
      "from": "0x...",
      "to": "0x...",
      "tx_hash": "0x..."
    }
  ],
  "total": 42,
  "limit": 50,
  "offset": 0,
  "summary": {
    "total_inbound": 25000000,
    "total_outbound": 15000000,
    "count": 42
  }
}
```

---

### GET /api/v1/events/export

Export activity as CSV.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `period` | `string` | `30d` | Time window: `7d`, `30d`, or `90d` |

**Response:** `text/csv` content type.

---

### GET /api/v1/wallet/settings

Get wallet display settings.

**Response**

```json
{
  "display_name": "My Agent"
}
```

---

### PATCH /api/v1/wallet/settings

Update wallet display settings.

**Request**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `display_name` | `string` | No | Display name. Max 64 characters. |

**Response:** Same as `GET /api/v1/wallet/settings`.

---

### POST /api/v1/links/fund

Generate a one-time fund link. The link opens the dashboard fund page for the wallet.

**Request**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messages` | `string[]` | No | Messages to display on the fund page |
| `agent_name` | `string` | No | Agent name shown on the fund page |

**Response**

```json
{
  "url": "https://pay-skill.com/fund?token=abc...",
  "token": "abc...",
  "expires_at": "2026-04-02T12:00:00Z",
  "wallet_address": "0x..."
}
```

---

### POST /api/v1/links/withdraw

Generate a one-time withdraw link. Same response shape as fund links.

**Response**

```json
{
  "url": "https://pay-skill.com/withdraw?token=abc...",
  "token": "abc...",
  "expires_at": "2026-04-02T12:00:00Z",
  "wallet_address": "0x..."
}
```

---

### GET /api/v1/link/:token

Resolve a pay link token. No authentication required for this endpoint.

**Response**

```json
{
  "type": "fund",
  "wallet_address": "0x...",
  "balance": 50000000,
  "providers": ["0x...", "0x..."],
  "expires_at": "2026-04-02T12:00:00Z",
  "messages": ["Please fund my agent"],
  "agent_name": "My Agent"
}
```

Returns `410 Gone` if the link has expired.

---

## x402 Facilitator

These endpoints implement the [x402 protocol](https://www.x402.org/) for HTTP-native payments.

### POST /x402/verify

Verify an x402 payment payload without settling.

**Request**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `x402Version` | `number` | Yes | Protocol version |
| `paymentPayload` | `string` | Yes | Base64-encoded payment payload |
| `paymentRequirements` | `object` | Yes | Payment requirements from the 402 response |

**Response**

```json
{
  "isValid": true,
  "payer": "0x..."
}
```

On failure:

```json
{
  "isValid": false,
  "invalidReason": "Signature does not match payer"
}
```

---

### POST /x402/settle

Verify and settle an x402 payment on-chain. Returns `201 Created`.

**Request:** Same as `/x402/verify`.

**Response**

```json
{
  "success": true,
  "transaction": "0x...",
  "network": "base",
  "payer": "0x...",
  "extensions": {}
}
```

On failure:

```json
{
  "success": false,
  "errorReason": "Insufficient funds"
}
```

---

### GET /x402/supported

List supported x402 payment kinds and capabilities.

**Response**

```json
{
  "kinds": ["exact"],
  "extensions": [],
  "signers": ["eip-712"]
}
```

---

## A2A (Agent-to-Agent)

Implements the [A2A protocol](https://google.github.io/A2A/) over JSON-RPC 2.0. Requires EIP-712 authentication.

### POST /a2a

All A2A communication goes through a single endpoint using JSON-RPC 2.0.

**Supported Methods**

| Method | Description |
|--------|-------------|
| `message/send` | Send a message to initiate or continue a task |
| `tasks/get` | Get the current state of a task |
| `tasks/cancel` | Cancel a running task |

**Request**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [
        { "type": "text", "text": "Translate this to French: Hello" }
      ]
    }
  }
}
```

**Response**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "id": "task_abc123",
    "status": {
      "state": "completed"
    },
    "artifacts": [
      {
        "parts": [
          { "type": "text", "text": "Bonjour" }
        ]
      }
    ]
  }
}
```

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `POST /api/v1/direct` | 120/min per wallet |
| `POST /api/v1/tabs` | 10/min per wallet |
| `POST /api/v1/mint` | 1/hr per wallet |
| `POST /api/v1/webhooks` | 10/hr per wallet |

When rate limited, the server returns `429 Too Many Requests` with a `Retry-After` header.

---

## Quick Example

Open a tab, charge it, then close it:

::: code-group

```bash [curl]
# 1. Fetch contracts
curl https://pay-skill.com/api/v1/contracts

# 2. Open a tab (requires EIP-712 auth headers)
curl -X POST https://pay-skill.com/api/v1/tabs \
  -H "Content-Type: application/json" \
  -H "X-Pay-Agent: 0xYourWallet" \
  -H "X-Pay-Signature: 0x..." \
  -H "X-Pay-Timestamp: 1712000000" \
  -H "X-Pay-Nonce: abc123" \
  -d '{
    "provider": "0xProviderWallet",
    "amount": 10000000,
    "max_charge_per_call": 2000000,
    "permit": { "v": 28, "r": "0x...", "s": "0x..." }
  }'

# 3. Charge the tab (provider calls this)
curl -X POST https://pay-skill.com/api/v1/tabs/tab_abc123/charge \
  -H "Content-Type: application/json" \
  -H "X-Pay-Agent: 0xProviderWallet" \
  -H "X-Pay-Signature: 0x..." \
  -H "X-Pay-Timestamp: 1712000000" \
  -H "X-Pay-Nonce: def456" \
  -d '{ "amount": 1000000 }'

# 4. Close the tab
curl -X POST https://pay-skill.com/api/v1/tabs/tab_abc123/close \
  -H "X-Pay-Agent: 0xYourWallet" \
  -H "X-Pay-Signature: 0x..." \
  -H "X-Pay-Timestamp: 1712000000" \
  -H "X-Pay-Nonce: ghi789"
```

```bash [CLI]
# Open a tab
pay tab open 0xProviderWallet --amount 10.00 --max-charge 2.00

# Charge (provider side)
pay tab charge tab_abc123 --amount 1.00

# Close
pay tab close tab_abc123
```

:::
