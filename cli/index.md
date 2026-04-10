# CLI Reference

## Installation

```bash
# Homebrew (macOS/Linux)
brew install pay-skill/tap/pay

# Scoop (Windows)
scoop bucket add pay-skill https://github.com/pay-skill/scoop-bucket
scoop install pay

# From source
cargo install pay-cli
```

## Getting Started

```bash
# Initialize wallet (generates keypair, stores in OS keychain)
pay init

# Show current network
pay network

# Switch to testnet for development
pay network testnet

# Mint testnet USDC (testnet only)
pay mint 100.00

# Check balance
pay status

# Show wallet address
pay address

# Send $5 to a provider
pay direct 0xProvider... 5.00
```

Fresh installs default to **Base mainnet**. Use `pay network testnet` to switch to Base Sepolia for development.

## Global Flags

These flags apply to all commands:

| Flag | Description |
|------|-------------|
| `--plain` | Human-readable output (default: JSON) |
| `--testnet` | Use Base Sepolia testnet for this command |
| `--api-url <URL>` | Override API URL (advanced) |
| `--chain-id <ID>` | Override chain ID (advanced) |
| `--router-address <ADDR>` | Override router contract address (advanced) |

## Output

Output is **JSON by default**. Use `--plain` for human-readable format:

```bash
pay status
# => {"wallet":"0x...","balance_usdc":"142.50","open_tabs":2,"total_locked":30000000,"network":"mainnet"}

pay --plain status
# =>   Network: Base (mainnet)
# =>   Balance: 142.50 USDC
# =>   Open tabs: 2
# =>   Locked: $30.00
```

## Commands

### network

Show or switch between mainnet and testnet.

```bash
pay network                 # Show current network, chain ID, API URL, router
pay network testnet         # Switch to Base Sepolia testnet
pay network mainnet         # Switch to Base mainnet
```

Switching re-fetches the router contract address from the server automatically.

### init

First-time wallet setup. Generates a secp256k1 keypair and stores it in the OS keychain (falls back to AES-256-GCM encrypted file if keychain is unavailable).

```bash
pay init
pay init --no-keychain      # Force encrypted file storage
```

During init, the CLI fetches contract addresses from the server's `/contracts` endpoint and writes them to `~/.pay/config.toml`.

### address

Show the wallet's Ethereum address.

```bash
pay address
# => {"address":"0x1234567890abcdef1234567890abcdef12345678"}
```

### status

Display wallet balance, tab info, and current network.

```bash
pay status
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
```

### request

Make an HTTP request with automatic x402 payment handling. Supports all standard HTTP methods, custom headers, and request bodies — like curl, but with built-in x402 payments.

```bash
# Simple GET (default)
pay request https://api.example.com/data

# POST with JSON body
pay request -X POST -d '{"query":"test"}' https://api.example.com/search

# Custom headers
pay request -H "Authorization: Bearer tok123" https://api.example.com/data

# Body from file, output to file, silent mode
pay request -X PUT -d @payload.json -o response.json -s https://api.example.com/item/1

# Debug: show request/response headers
pay request -v https://api.example.com/data

# Skip x402 payment (raw request)
pay request --no-pay https://api.example.com/data
```

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--request` | `-X` | HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD) | GET (POST if `-d`) |
| `--header` | `-H` | Add header, repeatable: `"Key: Value"` | — |
| `--data` | `-d` | Request body; prefix with `@` to read from file | — |
| `--output` | `-o` | Write response body to file | stdout |
| `--verbose` | `-v` | Print request/response headers to stderr | off |
| `--silent` | `-s` | Suppress status messages, output body only | off |
| `--no-location` | — | Disable following redirects | redirects on |
| `--connect-timeout` | — | Connection timeout in seconds | 10 |
| `--max-time` | — | Max total request time in seconds | 30 |
| `--no-pay` | — | Skip x402 payment handling | off |

**Method inference:** `-d` without `-X` implies POST (curl convention). Explicit `-X` always wins.

**Auto Content-Type:** when `-d` is used and no `Content-Type` header is set, defaults to `application/json`.

If the server returns 402 Payment Required:
- **Direct settlement:** signs EIP-3009, constructs v2 PaymentPayload with `payload.signature` + `payload.authorization`, retries with `PAYMENT-SIGNATURE: base64(PaymentPayload)`
- **Tab settlement:** finds or opens a tab, charges it, retries with `PAYMENT-SIGNATURE: base64(PaymentPayload)` containing `extensions.pay.tabId`

The retry uses the same method, headers, and body as the original request.

### webhook

Manage webhook registrations.

#### webhook register

```bash
pay webhook register https://example.com/hooks --events payment.completed,tab.opened
pay webhook register https://example.com/hooks --events all --secret "my-secret"
```

| Flag | Description |
|------|-------------|
| `--events <LIST>` | Comma-separated event filter (default: `tab.opened,tab.closed,tab.topped_up,payment.completed`) |
| `--secret <SECRET>` | HMAC signing secret. **Always set a unique value** — the default is insecure |

Available events: `tab.opened`, `tab.low_balance`, `tab.closing_soon`, `tab.closed`, `tab.topped_up`, `payment.completed`, `x402.settled`

#### webhook list

```bash
pay webhook list
```

#### webhook delete

```bash
pay webhook delete <WEBHOOK_ID>
```

### sign (internal)

Subprocess signer protocol for SDKs. Hidden from `--help` but functional. Reads a 32-byte hex hash from stdin, writes a 65-byte signature to stdout.

```bash
echo "0xabcdef..." | pay sign
```

Used internally by SDK CLI signers. Key resolution: `PAYSKILL_SIGNER_KEY` env var → OS keychain → encrypted `.enc` file.

### mint

Mint testnet USDC (testnet only).

```bash
pay mint 100.00
```

Rate limited to 1 mint per wallet per hour.

### fund

Generate a funding link. The operator opens the link in a browser to deposit USDC via Coinbase Onramp or direct transfer. Link expires in 1 hour.

```bash
pay fund
pay fund -m "Need $50 for weather API calls"
pay fund -m "Task will complete in ~5 min" --name "Claude Code"
```

| Flag | Short | Description |
|------|-------|-------------|
| `--message` | `-m` | Message shown to the operator (repeatable) |
| `--name` | — | Agent display name on the funding page |

### withdraw

Generate a withdrawal link. The operator opens the link in a browser to complete the withdrawal.

```bash
pay withdraw 0xRecipient 10.00
```

---

### ows

OWS (Open Wallet Standard) wallet management. Requires the `ows` CLI to be installed.

#### ows init

Create an OWS wallet with chain-lock policy and API key.

```bash
pay ows init
pay ows init --name my-agent --chain base-sepolia
```

| Flag | Default | Description |
|------|---------|-------------|
| `--name <NAME>` | `pay-{hostname}` | Wallet name |
| `--chain <CHAIN>` | `base` | Chain: `base` or `base-sepolia` |

Creates a wallet in the OWS vault (`~/.ows/`), a chain-lock policy, and an API key. Outputs the API key (shown once) and MCP config.

If OWS is not installed, attempts to install via `npm install -g @open-wallet-standard/core`.

#### ows list

List all OWS wallets.

```bash
pay ows list
```

#### ows fund

Generate a fund link for an OWS wallet.

```bash
pay ows fund --wallet my-agent
```

| Flag | Description |
|------|-------------|
| `--wallet <NAME>` | Wallet name or ID (default: `OWS_WALLET_ID` env) |
| `--amount <USDC>` | Pre-fill amount |

#### ows set-policy

Set spending policy on an OWS wallet.

```bash
pay ows set-policy --max-tx 500 --daily-limit 5000
pay ows set-policy --chain base-sepolia
```

| Flag | Description |
|------|-------------|
| `--chain <CHAIN>` | Chain to lock to (default: `base`) |
| `--max-tx <USDC>` | Per-transaction spending cap |
| `--daily-limit <USDC>` | Daily spending cap |

Without `--max-tx` or `--daily-limit`, creates a chain-lock-only policy.

### signer

Advanced wallet management.

#### signer init

Create a named wallet.

```bash
pay signer init                    # Default wallet
pay signer init --name trading     # Named wallet
pay signer init --no-keychain      # Force encrypted file
```

#### signer import

Import an existing private key.

```bash
pay signer import --key 0xYOUR_KEY
pay signer import --key 0xYOUR_KEY --name secondary
```

#### signer export

Export a private key (interactive confirmation required).

```bash
pay signer export
pay signer export --name trading
```

### key

Plain private key management. For dev/testing only.

#### key init

Generate a raw secp256k1 private key.

```bash
pay key init
pay key init --write-env
```

| Flag | Description |
|------|-------------|
| `--write-env` | Write `PAYSKILL_KEY` to `.env` file |

Outputs the private key in hex. For production, use `pay init` instead.

### update

Self-update the CLI binary. Checks GitHub Releases for the latest version, downloads the matching platform binary, and replaces the current executable.

```bash
pay update                  # Check and install latest version
pay update --check          # Check only (exit 0 = up-to-date, exit 1 = outdated)
pay update -y               # Skip confirmation prompt
```

| Flag | Short | Description |
|------|-------|-------------|
| `--check` | — | Only check, don't install |
| `--yes` | `-y` | Skip confirmation (auto-yes in non-TTY) |

Auto-detects package managers (brew, scoop, choco, snap) and delegates to them if the CLI was installed via one.

### completions

Generate shell completion scripts.

```bash
pay completions bash > ~/.bash_completion.d/pay
pay completions zsh > ~/.zfunc/_pay
pay completions fish > ~/.config/fish/completions/pay.fish
pay completions powershell > pay.ps1
```

Supported shells: `bash`, `zsh`, `fish`, `powershell`, `elvish`.

---

## Command Aliases

| Alias | Command |
|-------|---------|
| `pay send` | `pay direct` |
| `pay balance` | `pay status` |
| `pay req` | `pay request` |

---

## Signer Modes

Three signer initialization commands, in priority order:

| Command | Mode | When |
|---------|------|------|
| `pay init` | **Pay signer (default)** — OS keychain, AES-256-GCM encrypted fallback | Production agents |
| `pay ows init` | **OWS** — Open Wallet Standard vault, policy-gated signing | Agents using OWS ecosystem |
| `pay key init` | **Plain key** — raw private key, no encryption | Dev/testing only |

The Pay signer is always priority #1. OWS only activates when the `ows` CLI is installed and `OWS_WALLET_ID` is set. Plain key is for development only.

### Environment variables

| Variable | Description |
|----------|-------------|
| `PAYSKILL_SIGNER_KEY` | Raw hex private key (highest priority signer) |
| `OWS_WALLET_ID` | OWS wallet name for SDK auto-detection |
| `OWS_API_KEY` | OWS API key for policy-gated signing |
| `PAYSKILL_KEY` | Raw private key (dev/testing only) |

---

## Configuration

Config file: `~/.pay/config.toml` (created by `pay init`, updated by `pay network`)

```toml
chain_id = 8453
router_address = "0x..."
api_url = "https://pay-skill.com/api/v1"
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | User error (invalid input, missing init) |
| 2 | System error (network failure, server error) |
