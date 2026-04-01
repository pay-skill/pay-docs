# CLI Reference

## Installation

```bash
# Homebrew (macOS/Linux)
brew install pay-skill/tap/pay

# Scoop (Windows)
scoop bucket add pay-skill https://github.com/remit-md/scoop-pay
scoop install pay

# From source
cargo install pay-cli
```

## Getting Started

```bash
# Initialize wallet (generates keypair, stores encrypted key)
pay init

# Mint testnet USDC (testnet only)
pay mint 100.00

# Check balance
pay status

# Send $5 to a provider
pay direct 0xProvider... 5.00
```

## Global Flags

| Flag | Env Var | Default | Description |
|------|---------|---------|-------------|
| `--json` | — | `false` | Output as JSON |
| `--api-url <URL>` | `PAYSKILL_API_URL` | `https://pay-skill.com/api/v1` | API base URL |
| `--chain-id <ID>` | `PAYSKILL_CHAIN_ID` | `8453` | Chain ID (8453=Base, 84532=Sepolia) |
| `--router-address <ADDR>` | `PAYSKILL_ROUTER_ADDRESS` | — | PayRouter contract address |

## Commands

### init

First-time wallet setup. Generates a secp256k1 keypair and stores it encrypted.

```bash
pay init
```

If `PAYSKILL_SIGNER_KEY` is set, uses that key instead of generating a new one.

### address

Show the wallet's Ethereum address.

```bash
pay address
# => 0x1234567890abcdef1234567890abcdef12345678
```

### status

Display wallet balance and tab info.

```bash
pay status
# => Balance: $142.50 | Tabs: 2 open | Locked: $30.00

pay status --wallet 0xOtherAddress
```

| Flag | Description |
|------|-------------|
| `--wallet <ADDR>` | Check another wallet's status |

### direct

Send a one-shot USDC payment.

```bash
pay direct 0xProviderAddress 5.00
pay direct 0xProviderAddress 5.00 --memo "invoice-42"
```

| Argument | Description |
|----------|-------------|
| `to` | Recipient address (0x...) |
| `amount` | Amount in USDC (e.g., "5.00" for $5) |
| `--memo <TEXT>` | Optional metadata |

- **Minimum:** $1.00
- **Fee:** 1% deducted from provider payout
- Auto-signs EIP-2612 permit for the PayDirect contract

### tab

Manage metered payment tabs.

#### tab open

```bash
pay tab open 0xProviderAddress 20.00 --max-charge 2.00
```

| Argument | Description |
|----------|-------------|
| `provider` | Provider wallet address |
| `amount` | Amount to lock (e.g., "20.00") |
| `--max-charge <AMOUNT>` | Maximum charge per call |

- **Minimum:** $5.00
- **Activation fee:** max($0.10, 1% of amount)

#### tab charge

Charge an open tab (provider-side).

```bash
pay tab charge <TAB_ID> 1.00
```

#### tab topup

Add funds to an existing tab.

```bash
pay tab topup <TAB_ID> 10.00
```

#### tab close

Close a tab and distribute funds.

```bash
pay tab close <TAB_ID>
```

Either agent or provider can close. On close: 99% of charged amount goes to provider, 1% fee, remainder returns to agent.

#### tab list

List all tabs.

```bash
pay tab list
# => Tab abc123 | Provider: 0x... | Balance: $15.00 | Status: open
```

### request

Make an HTTP request with automatic 402 payment handling.

```bash
pay request https://api.example.com/data
```

If the server returns 402 Payment Required:
- **Direct settlement:** signs EIP-3009 TransferWithAuthorization, retries with `X-Payment` header
- **Tab settlement:** finds or opens a tab, charges it, retries with `X-Payment-Tab` and `X-Payment-Charge` headers

### webhook

Manage webhook registrations.

#### webhook register

```bash
pay webhook register https://example.com/hooks
pay webhook register https://example.com/hooks --events "payment.completed,tab.charged" --secret "my-secret"
```

| Flag | Default | Description |
|------|---------|-------------|
| `--events <LIST>` | All events | Comma-separated event filter |
| `--secret <SECRET>` | `whsec_default` | HMAC signing secret |

#### webhook list

```bash
pay webhook list
```

#### webhook delete

```bash
pay webhook delete <WEBHOOK_ID>
```

### sign

Subprocess signer protocol for SDKs. Reads a 32-byte hex hash from stdin, writes a 65-byte signature to stdout.

```bash
echo "0xabcdef..." | pay sign
```

Used internally by SDK CLI signers. Requires `PAYSKILL_SIGNER_KEY` env var.

### mint

Mint testnet USDC (testnet only).

```bash
pay mint 100.00
```

Rate limited to 1 mint per wallet per hour.

### fund

Open funding page to add USDC.

```bash
pay fund
# => https://pay-skill.com/fund?token=abc123
```

### withdraw

Withdraw USDC to an external address.

```bash
pay withdraw 0xRecipient 10.00
# => https://pay-skill.com/withdraw?token=abc123
```

---

## Signer Modes

The CLI supports three key management modes:

| Mode | How | When |
|------|-----|------|
| **OS Keychain** | Stored via platform keyring | Default (after `pay init`) |
| **Encrypted file** | AES-256-GCM encrypted `.pay` file | Fallback if keychain unavailable |
| **Environment variable** | `PAYSKILL_SIGNER_KEY=0x...` | CI/CD, testing |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | User error (invalid input, missing init) |
| 2 | System error (network failure, server error) |

---

## JSON Output

Pass `--json` for machine-readable output:

```bash
pay --json status
# => {"wallet":"0x...","balance_usdc":"142500000","open_tabs":2,"total_locked":30000000}

pay --json direct 0xProvider 5.00
# => {"tx_hash":"0xabc...","status":"confirmed"}
```
