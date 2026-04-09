# Claude Desktop

Add Pay to Claude Desktop so Claude can make USDC payments, discover paid APIs, and handle x402 paywalls.

## Config

Add to your Claude Desktop config file:

::: code-group

```json [macOS ~/Library/Application Support/Claude/claude_desktop_config.json]
{
  "mcpServers": {
    "pay": {
      "command": "npx",
      "args": ["-y", "@pay-skill/mcp"]
    }
  }
}
```

```json [Windows %APPDATA%\Claude\claude_desktop_config.json]
{
  "mcpServers": {
    "pay": {
      "command": "npx",
      "args": ["-y", "@pay-skill/mcp"]
    }
  }
}
```

:::

Restart Claude Desktop after saving. A wallet is auto-generated and stored in the OS keychain on first run.

## Testnet

To use Base Sepolia testnet instead of mainnet:

```json
{
  "mcpServers": {
    "pay": {
      "command": "npx",
      "args": ["-y", "@pay-skill/mcp"],
      "env": {
        "PAY_NETWORK": "testnet"
      }
    }
  }
}
```

## Import existing wallet

To use an existing private key instead of generating a new one:

```json
{
  "mcpServers": {
    "pay": {
      "command": "npx",
      "args": ["-y", "@pay-skill/mcp"],
      "env": {
        "PAYSKILL_SIGNER_KEY": "your-64-char-hex-private-key"
      }
    }
  }
}
```

## Available tools

Once configured, Claude has access to 15 tools:

| Tool | Description |
|------|-------------|
| `pay_status` | Check wallet balance and open tabs |
| `pay_direct` | Send USDC to an address ($1 min) |
| `pay_request` | Hit a paywalled API (handles x402 automatically) |
| `pay_discover` | Search for paid services by keyword |
| `pay_tab_open` | Open a pre-funded metered tab |
| `pay_tab_charge` | Charge against an open tab |
| `pay_tab_close` | Close a tab and settle funds |
| `pay_tab_topup` | Add funds to an open tab |
| `pay_tab_list` | List all open tabs |
| `pay_send` | Send a one-shot payment to an address |
| `pay_fund` | Generate a funding link |
| `pay_withdraw` | Generate a withdrawal link |
| `pay_mint` | Mint testnet USDC (testnet only) |
| `pay_webhook_register` | Register a webhook |
| `pay_webhook_list` | List registered webhooks |

## Try it

After setup, ask Claude:

- "Check my pay balance"
- "Find me a weather API"
- "Send $5 to 0x..."
- "Open a $50 tab with 0x..."

## Other clients

The MCP server works with any client that supports stdio transport:

**Cursor:**
```json
// .cursor/mcp.json
{
  "mcpServers": {
    "pay": {
      "command": "npx",
      "args": ["-y", "@pay-skill/mcp"]
    }
  }
}
```

**Claude Code:**
```json
// .claude/settings.json
{
  "mcpServers": {
    "pay": {
      "command": "npx",
      "args": ["-y", "@pay-skill/mcp"]
    }
  }
}
```
