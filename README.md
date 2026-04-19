# pay-docs

Documentation site for Pay -- the complete x402 payment stack for AI agents. Served at [pay-skill.com/docs/](https://pay-skill.com/docs/).

## Development

VitePress site. The `base` is set to `/docs/` in `.vitepress/config.ts`.

```bash
npm install
npm run dev
```

## Structure

```
docs/
  index.md              -- landing page
  api-design.md         -- API design principles
  api-reference.md      -- REST API reference
  contracts.md          -- network addresses
  earn.md               -- how providers earn
  integrations.md       -- framework integration guide
  provider-guide.md     -- provider onboarding
  troubleshooting.md    -- common errors + debugging
  webhooks.md           -- event notifications
  cli/                  -- CLI command reference
  examples/             -- runnable example integrations
  gate/                 -- pay-gate docs (overview, quickstart, config, guide)
  guides/               -- "Build with Pay" production guide
  middleware/           -- per-framework middleware reference
  quickstart/           -- scenario-specific quickstarts
  sdk/                  -- TypeScript + Python SDK reference
  skills/               -- Claude Code skill references
```

## Part of Pay

Pay is the complete x402 payment stack -- gateway, facilitator, SDKs, CLI, and MCP server -- that lets AI agents pay for APIs with USDC on Base.

- [SDK](https://github.com/pay-skill/pay-sdk) -- Python + TypeScript
- [CLI](https://github.com/pay-skill/pay-cli) -- Command-line tool
- [pay-gate](https://github.com/pay-skill/gate) -- x402 payment gateway
- [MCP Server](https://github.com/pay-skill/mcp) -- Claude Desktop / Cursor / VS Code
- [Protocol](https://github.com/pay-skill/pay-protocol) -- Smart contracts
