---
title: "Wallet Key Management in Production — Ᵽay"
description: "How to load, store, and rotate a Ᵽay wallet key across local development, Docker, CI, Kubernetes, and serverless. OS keychain, environment variables, and secrets managers."
---

# Wallet Key Management in Production

A Ᵽay wallet is a single secp256k1 private key. It signs USDC permits, x402 payments, tab opens and top-ups, and tab closes. If it leaks, the balance can be drained. If it is lost, funds can still be withdrawn via the dashboard with a recovery phrase, but tabs tied to the old address are orphaned until auto-close or manual settle.

This page covers how to load that key in each environment you are likely to ship into: local dev, Docker, CI, Kubernetes, serverless. Every example below defaults to **Base mainnet**. The same patterns work for the testnet toggle via `PAYSKILL_TESTNET=1`, but we do not advertise testnet to production users — testnet is for internal development only.

For the higher-level question of whether you need middleware at all, see [Choosing Your Integration](/guides/build-with-pay/choosing).

## The Wallet Loader: One API, Three Sources

Both SDKs (`@pay-skill/sdk` and `pay-skill`) expose the same three ways to load a wallet. You pick one per environment and never mix them.

::: code-group

```typescript [TypeScript]
import { Wallet } from "@pay-skill/sdk";

// 1. OS keychain (recommended for local dev)
const wallet = await Wallet.create();

// 2. Environment variable (recommended for Docker / CI / serverless)
const wallet = new Wallet();                // reads PAYSKILL_KEY

// 3. Explicit env-only helper (same as #2, clearer intent)
const wallet = Wallet.fromEnv();
```

```python [Python]
from payskill import Wallet

# 1. OS keychain (recommended for local dev)
wallet = Wallet.create()

# 2. Environment variable (recommended for Docker / CI / serverless)
wallet = Wallet()                            # reads PAYSKILL_KEY

# 3. Explicit env-only helper (same as #2, clearer intent)
wallet = Wallet.from_env()
```

:::

`Wallet.create()` talks to the OS keychain (macOS Keychain, Windows Credential Manager, libsecret on Linux). On first call it prompts for OS authentication and reads the same key that `pay init` stored, so the CLI and any process running as the same user share a wallet without any wiring.

`new Wallet()` / `Wallet()` reads `PAYSKILL_KEY` from the environment. This is the only form that works inside a container or a serverless function, where no keychain exists.

`Wallet.fromEnv()` / `Wallet.from_env()` is the same as the env-var form but signals intent loudly — good for production boot code where a silent fallback to keychain would be a bug.

## Local Development

On your laptop, use the OS keychain via `pay init`. The CLI generates a new wallet, stores the private key behind OS authentication, and prints the address. Every subsequent `pay` command and every process that calls `Wallet.create()` reads the same key.

```bash
pay init             # generates key, stores in OS keychain
pay fund             # top up via Coinbase Onramp (mainnet USDC on Base)
pay status           # confirm balance
```

Once that is done, your code loads the same wallet with no secrets in source:

::: code-group

```typescript [TypeScript]
import { Wallet, createPayFetch } from "@pay-skill/sdk";

const wallet = await Wallet.create();        // same key as `pay` CLI
const payFetch = createPayFetch(wallet, { maxPerRequest: 1.00 });
```

```python [Python]
from payskill import Wallet, create_pay_fetch

wallet = Wallet.create()                     # same key as `pay` CLI
pay_fetch = create_pay_fetch(wallet, max_per_request=1.00)
```

:::

**Why keychain and not `.env`:** A `.env` file with a real private key is a `git` leak waiting to happen. The OS keychain is gated behind OS auth and encrypted at rest. `Wallet.create()` is also the form the CLI, the MCP server, and every quickstart use — one key, one source of truth.

## Docker and CI

Containers have no keychain. CI runners do not have interactive OS auth. In both environments the wallet comes from `PAYSKILL_KEY`, injected by the platform's secrets manager and never stored on disk.

```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY dist ./dist
CMD ["node", "dist/server.js"]
# No keys in the image. PAYSKILL_KEY is provided at runtime.
```

```yaml
# docker-compose.yml (local development against a real mainnet wallet)
services:
  api:
    build: .
    environment:
      PAYSKILL_KEY: ${PAYSKILL_KEY}          # from the shell, not committed
    ports:
      - "3000:3000"
```

```yaml
# GitHub Actions (acceptance tests)
- name: Run acceptance tests
  env:
    PAYSKILL_KEY: ${{ secrets.PAYSKILL_KEY }}
  run: npm test
```

Inside the container, your boot code reads the variable:

::: code-group

```typescript [TypeScript]
import { Wallet } from "@pay-skill/sdk";

const wallet = Wallet.fromEnv();             // throws if PAYSKILL_KEY is unset
```

```python [Python]
from payskill import Wallet

wallet = Wallet.from_env()                   # raises if PAYSKILL_KEY is unset
```

:::

Use `fromEnv()` / `from_env()` (not `new Wallet()` / `Wallet()`) so a missing variable fails loudly at boot instead of falling through to a zero-balance or default wallet.

## Kubernetes

Kubernetes is the same story with a different secret store. Create the secret once:

```bash
kubectl create secret generic pay-wallet --from-literal=key=0x...
```

Mount it as an environment variable on the pod spec:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  template:
    spec:
      containers:
        - name: api
          image: your-registry/api:v1
          env:
            - name: PAYSKILL_KEY
              valueFrom:
                secretKeyRef:
                  name: pay-wallet
                  key: key
```

Your container boot code is unchanged from the Docker example above — `Wallet.fromEnv()` reads `PAYSKILL_KEY` and carries on. If you use a secrets operator (External Secrets, Sealed Secrets, HashiCorp Vault with the injector), treat the wallet key like any other database password: central store, short-lived pod-level mounts, audit logs on access.

## Serverless — Vercel, Lambda, Cloud Run

Serverless platforms all expose environment variables through their dashboard, CLI, or API. The code is the same env-var form; only the configuration step differs.

**Vercel (Next.js):**

```bash
vercel env add PAYSKILL_KEY production
# Paste the private key at the prompt. Encrypted at rest, never logged.
```

Then in any route handler:

```typescript
// app/api/forecast/route.ts
import { withPay } from "@pay-skill/next";
import { Wallet } from "@pay-skill/sdk";

export const dynamic = "force-dynamic";      // required for wallet state

const wallet = Wallet.fromEnv();             // reads PAYSKILL_KEY

export const GET = withPay(wallet, async (req, pay) => {
  const resp = await pay.fetch("https://api.example.com/forecast");
  return Response.json(await resp.json());
});
```

See the [Next.js middleware guide](/middleware/next) for the `force-dynamic` requirement and the full Vercel setup.

**AWS Lambda:** set `PAYSKILL_KEY` in the function's environment via the console, CLI (`aws lambda update-function-configuration --environment`), or IaC (Terraform, SAM, CDK). Use AWS Secrets Manager or Parameter Store if you want rotation decoupled from function deploys.

**Cloud Run / Cloud Functions:** use Google Secret Manager and reference the secret as an environment variable on the service. The private key never touches the deployment package.

## Key Rotation

The protocol does not support rotating a private key in place. One wallet address is tied to one key forever. To "rotate" you create a second wallet, move funds, and retire the first:

```bash
# 1. Create a new wallet (on a different machine or keychain slot)
pay init --keychain-label pay-new

# 2. Fund it
pay fund --keychain-label pay-new

# 3. Close any open tabs on the old wallet so balances return
pay tab list                                  # see what's still open
pay tab close <tab-id>                        # repeat for each

# 4. Drain the old wallet into the new one
pay withdraw --to 0xNewWalletAddress

# 5. Update PAYSKILL_KEY in every environment to the new key
# 6. Redeploy
```

The gap between steps 4 and 6 is the only time you can drop requests, so plan rotations during a quiet window. Open tabs on the old address keep working until they are closed or auto-close (30 days of inactivity), but new tabs should only open against the new wallet.

**Webhooks:** if you registered webhook URLs against the old address, re-register them against the new address via the dashboard or the API before retiring the old key. See [Webhooks](/webhooks) for the re-registration flow.

## Anti-Patterns

A short list of things that look reasonable and turn into incidents.

**Never hardcode a key in source.** A `const PAYSKILL_KEY = "0x..."` in a TypeScript file ends up in every build artifact, every Docker layer, every stack trace, and eventually a public git history. There is no recovery from this. Treat a leaked key as a total loss: move funds out, create a new wallet, and start over.

**Never commit a `.env` with a real key.** Keep `.env` in `.gitignore`, commit a `.env.example` with the variable name and no value, and put the real key in the platform's secrets manager. If you need local development against a funded wallet, use the OS keychain via `Wallet.create()` — no `.env` required.

**Never share one wallet across unrelated apps.** Each service gets its own wallet. Per-service wallets keep budget caps, spend attribution, and blast radius scoped. If one app misbehaves — runaway budget, stuck tab, compromised container — the rest are unaffected. Per-service wallets also make `onPayment` logs actually useful: you can tell which service spent the money.

**Never store a key in browser localStorage or a cookie.** The middleware packages and the SDK are server-side only. Browser wallets need a different trust model and a different signing surface — see [OWS (Open Wallet Standard)](https://openwalletstandard.org/) for that territory. If you catch yourself wanting a "client-side wallet", stop and design it as a server-side proxy instead.

**Never log the private key.** Not in structured logs, not in error messages, not in debug traces, not in Sentry breadcrumbs. The SDKs redact the key from their own error messages; make sure your own error handlers do the same. The address is safe to log; the key is never safe to log.

**Never store the key in a shared secret that multiple humans can read.** If three engineers can read the key in a Vault UI or a 1Password vault, you have three attack surfaces instead of one. The secrets manager should hold it; humans should never see it again after initial provisioning.

## Further Reading

- [Choosing Your Integration](/guides/build-with-pay/choosing) — the five scenarios that decide which integration layer to load the wallet into
- [Application Middleware overview](/middleware/) — wallet setup for Express, Next.js, and FastAPI
- [CLI reference](/cli/) — `pay init`, `pay fund`, `pay withdraw`, `pay tab close`
- [TypeScript SDK](/sdk/typescript) — full `Wallet` API reference
- [Python SDK](/sdk/python) — full `Wallet` API reference
- [Webhooks](/webhooks) — re-registration after a key rotation
