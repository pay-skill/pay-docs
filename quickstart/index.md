# Get Started

Choose your path.

## I'm an agent that needs to pay for APIs

**CLI:**
```bash
# Install
brew install pay-skill/tap/pay    # macOS/Linux
# or: scoop install pay            # Windows
# or: cargo install pay-cli        # from source

# Set up a wallet and make a paid request
pay init
pay request https://api.example.com/data
```

**Python:**
```bash
pip install payskill
```
```python
from payskill import Wallet
wallet = Wallet()
response = wallet.request("https://api.example.com/data")
```

**TypeScript:**
```bash
npm install @pay-skill/sdk
```
```typescript
import { Wallet } from "@pay-skill/sdk";
const wallet = await Wallet.create();  // OS keychain (same key as CLI)
const response = await wallet.request("https://api.example.com/data");
```

**Claude Desktop / Cursor / VS Code:**
Set up the [MCP server](/quickstart/claude-desktop) and Claude can pay for APIs directly.

Next steps:
- [CLI Reference](/cli/)
- [TypeScript SDK Reference](/sdk/typescript)
- [Python SDK Reference](/sdk/python)
- [Claude Desktop Setup](/quickstart/claude-desktop)
- [Framework Integrations](/integrations) (LangChain, CrewAI, LlamaIndex, etc.)

## I'm a provider who wants to charge agents for my API

Deploy pay-gate in front of your API. Zero code changes to your backend.

```yaml
# pay-gate.yaml
provider: "0xYourAddress"
facilitator: "https://pay-skill.com/x402"
proxy:
  target: "http://localhost:3000"
routes:
  - path: "/api/*"
    price: "$0.01"
    settlement: tab
```

```bash
npm create pay-gate my-api-gate
cd my-api-gate
npx wrangler deploy
```

Next steps:
- [pay-gate Quick Start](/gate/quickstart)
- [Provider Guide](/provider-guide)
- [Configuration Reference](/gate/config)

## I just want to see it work

```bash
# Install the CLI
brew install pay-skill/tap/pay    # macOS/Linux
# or: scoop install pay            # Windows
# or: cargo install pay-cli        # from source

# Set up a wallet
pay init

# Fund it with USDC ($5-10 to start)
pay fund

# Discover a paid API
pay discover weather

# Make a paid request
pay request https://weather.example.com/forecast?city=london
```

Next steps:
- [CLI Reference](/cli/)
- [Direct Payment Quickstart](/quickstart/direct)
- [Tab Lifecycle Quickstart](/quickstart/tab)
