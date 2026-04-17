# Pay — Service Discovery

Agents search for paid API services behind pay-gate.

## CLI

```
pay discover [QUERY]              Search for services
pay discover --category data      Filter by category
pay discover --settlement tab     Filter by settlement mode
pay discover --sort newest        Sort: volume (default), newest, price_asc, price_desc
```

Output is JSON by default. Use `--plain` for table format (columns: NAME, BASE URL, PRICE, SETTLEMENT).

## How it works

1. **Automatic registration.** When a provider deploys pay-gate with
   `discovery.discoverable: true` (default), the gate heartbeats the
   facilitator on startup and every 24 hours with service metadata:
   domain, routes, pricing, settlement mode, description, keywords,
   category, docs URL.

2. **Facilitator indexes services.** Searchable catalog of active
   pay-gate deployments. Services are also auto-cataloged from the
   payment flow (when `base_url` is present in x402 settle requests).
   Services excluded from search after 48 hours without heartbeat.
   Hard-deleted after 7 days.

3. **Agents query.** CLI (`pay discover`) or API
   (`GET /api/v1/discover?q=...`).

4. **Opt-out.** Providers set `discoverable: false` in pay-gate.yaml.

This is a registry, not a marketplace. No ratings, reviews, or curation.
Deploy pay-gate → appear in the catalog. Stop pinging → removed.

## Provider configuration (pay-gate.yaml)

```yaml
discovery:
  discoverable: true
  base_url: "https://api.example.com"
  name: "My API"                    # max 60 chars
  description: "Short description"  # max 200 chars
  keywords: ["weather", "forecast"] # max 10, each max 30 chars
  category: "data"
  docs_url: "https://api.example.com/docs"  # optional
```

## API endpoint

`GET /api/v1/discover` — public, no auth, rate-limited 60 req/min per IP.

Query parameters:
- `q` — search term (keyword exact match + description substring)
- `sort` — volume (default), newest, price_asc, price_desc
- `category` — exact match filter
- `settlement` — "direct" or "tab"
- `offset` (default 0), `limit` (default 50, max 100)

Returns: name, description, base_url, category, keywords, routes (path,
method, price, settlement), docs_url. Route summaries do not include
full info blocks -- agents should hit `GET <base_url>/.well-known/x402`
for detailed input/output descriptions.

## Volume tracking

Each successful x402 verify increments daily call count per domain.
Services with higher volume rank higher in default sort. Volume data
rolls over 30 days.

## Manifest

Each pay-gate instance exposes `GET /__pay/manifest` — a public
descriptor of routes, pricing, settlement modes, and discovery metadata.
No secrets. Useful for agents to inspect a known endpoint before paying.

## .well-known/x402 (IETF Draft)

Each pay-gate instance serves `GET /.well-known/x402` -- the standard
x402 descriptor defined in the IETF internet-draft
(`draft-jeftovic-x402-dns-discovery-00`). This returns a JSON object
with full x402 v2 payment requirements for every paid route, including
Bazaar info blocks when configured:

```json
{
  "x402Version": 2,
  "payTo": "0xprovider...",
  "network": "eip155:8453",
  "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "endpoints": [
    {
      "path": "/api/v1/forecast",
      "method": "GET",
      "description": "Weather forecast data",
      "mimeType": "application/json",
      "paymentRequirements": {
        "scheme": "exact",
        "network": "eip155:8453",
        "amount": "10000",
        "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "payTo": "0xprovider...",
        "maxTimeoutSeconds": 60,
        "extra": { "settlement": "tab", "facilitator": "https://pay-skill.com/x402" }
      },
      "info": {
        "input": {
          "type": "http",
          "method": "GET",
          "queryParams": {
            "q": { "type": "string", "required": true, "description": "City name" }
          }
        },
        "output": { "type": "json", "example": { "city": "London", "temperature": 15 } }
      },
      "routeTemplate": "/api/v1/forecast"
    }
  ]
}
```

Agents should fetch this before making requests to understand pricing,
available endpoints, and required parameters without triggering a 402.
The `info` block describes what the endpoint accepts (query params,
body schema, path params) and what it returns. `routeTemplate` shows
the URL pattern when path parameters are used (e.g. `/users/:id`).

## DNS TXT Discovery (Recommended)

For maximum discoverability, providers should add a DNS TXT record
pointing to their `.well-known/x402` descriptor:

```
_x402.api.example.com. 300 IN TXT "v=x4021;descriptor=api;url=https://api.example.com/.well-known/x402"
```

This lets x402-aware agents discover payment capabilities via DNS
lookup before making any HTTP requests. Key rules from the IETF draft:

- Record lives at `_x402.<hostname>` (no parent-domain inheritance)
- HTTPS only for the descriptor URL
- DNSSEC recommended

pay-gate serves the descriptor automatically at `/.well-known/x402`.
Providers only need to add the DNS TXT record.

## When discovery doesn't find what you need

1. Try `pay request <url>` on a known URL — if it returns 402 with
   the Pay facilitator, it's a Pay service.
2. Fetch `/.well-known/x402` from a known domain to see its routes.
3. Look up `_x402.<hostname>` DNS TXT for the descriptor URL.
4. Get the endpoint from the operator or documentation.
5. Suggest the provider adopt pay-gate — see `references/adoption.md`.
