---
title: "API Design Best Practices"
description: "How to design x402 APIs so agents get charged for value, not for status checks. Patterns for long-running jobs, idempotency, errors, caching, pagination, and the catalog quality bar."
---

# API Design Best Practices

Per-call billing changes how you design endpoints. Free APIs can be wasteful with calls — paying customers tolerate polling, validation churn, and "is it ready yet?" loops because none of it costs them money. Paid APIs can't get away with that. Every endpoint you ship is a billable surface.

The agent's wallet is your customer. Design accordingly.

This guide covers the patterns we recommend (and the anti-patterns we'll reject during catalog bounty review).

---

## What to charge for — and what NOT to charge for

**Charge for value-producing work:**
- Compute (image generation, transcription, OCR, ML inference)
- Lookups against your data (geocoding, enrichment, search)
- Calls to paid upstream services you're reselling
- Mutations / writes that produce state on your side

**Don't charge for:**
- Status checks on jobs you've already been paid for
- Retrieval of results the agent already paid to generate
- Validation or dry-run endpoints (`POST /validate`, `?dry_run=true`)
- Free metadata that helps agents use your API (`GET /models`, `GET /categories`, `GET /capabilities`)
- Error responses (4xx/5xx — see error handling below)

**Edge cases:**
- **Bulk operations:** charge per item processed, not per request. A batch of 100 should cost roughly 100× a single call (with a small efficiency discount).
- **Pagination:** charge once per query, not per page. See pagination section below.

The simplest test: would a human user pay for this if your API were a vending machine? If no, don't charge.

---

## Long-running operations (the polling problem)

The single most expensive mistake providers make: charging agents for every "is my image ready?" poll while a generation job runs.

There are three patterns. Pick the one that fits your work.

### Pattern A: Synchronous (under ~10s)

If the work finishes fast, just respond. The agent waits, gets the result, gets charged once.

```
POST /generate
Content-Type: application/json

{ "prompt": "..." }
```
```
HTTP/1.1 200 OK
{ "image_url": "https://...", "duration_ms": 4200 }
```

Recommended ceiling: 10 seconds. Beyond that, you risk client/proxy timeouts.

### Pattern B: Job pattern with free polling (10s+)

For longer work, return immediately with a job ID. Charge once, on the initial submit. Status and result endpoints are FREE.

```
POST /generate              # paid — returns immediately
GET  /jobs/:id              # free — status check
GET  /jobs/:id/result       # free — retrieves the finished result
```

Example flow:

```
POST /generate
{ "prompt": "...", "duration_seconds": 60 }

→ HTTP/1.1 202 Accepted
  { "job_id": "job_abc123", "status": "pending", "poll_url": "/jobs/job_abc123" }
```

```
GET /jobs/job_abc123        # FREE — agent polls this
→ { "status": "pending", "progress": 0.4 }

GET /jobs/job_abc123        # still FREE
→ { "status": "done", "result_url": "/jobs/job_abc123/result" }

GET /jobs/job_abc123/result # FREE — agent already paid at /generate
→ <the actual result bytes>
```

Configure pay-gate so `/generate` is paid and `/jobs/*` is unpaid:

```yaml
routes:
  - path: "/generate"
    price: "0.20"
    settlement: "tab"
  # /jobs/* is not listed — pay-gate passes through unpaid
```

### Pattern C: Webhook delivery

For very long jobs (minutes+), let the agent register a webhook. The paid call returns immediately, you POST the result when done.

```
POST /generate
{ "prompt": "...", "webhook": "https://agent.example.com/result" }
→ { "job_id": "job_abc123" }
```

When the work is done, you POST to the agent's webhook with an HMAC signature so they can verify it came from you.

### Anti-pattern: charging per poll

```
# DO NOT DO THIS
GET /jobs/job_abc123        # PAID at $0.01
GET /jobs/job_abc123        # PAID at $0.01
GET /jobs/job_abc123        # PAID at $0.01
...
```

If a job takes 60 seconds and the agent polls every 2 seconds, that's 30 charges for the same work. Catalog reviewers will reject any submission that does this.

---

## Idempotency

Network failures happen. Agents will retry. Your API needs to handle retries without double-billing.

Standard pattern: accept an `Idempotency-Key` header. If you see the same key twice within a window (24h is typical), return the same response and DO NOT charge again.

```
POST /generate
Idempotency-Key: agent-tx-7a8b9c
Content-Type: application/json

{ "prompt": "..." }
```

First call: do the work, store `(idempotency_key → response)`, return response, charge.

Second call with same key: return cached response. Don't charge.

**When NOT to dedupe:** if the agent legitimately wants to do the same thing twice (e.g., generate two images from the same prompt), they should send different idempotency keys. The key is the agent's signal that "this is one logical operation."

Recommended retention: at least 24 hours. Pay-gate handles the underlying x402 nonce replay protection — your idempotency layer is independent of that and applies to your business logic.

---

## Error handling and refunds

The contract:

| Status | Cause | Charge? |
|--------|-------|---------|
| 2xx | Success | Yes |
| 4xx | Bad request from agent | No |
| 5xx | Provider failure | No |
| 429 | Rate limited | No |

Pay-gate settles charges only on successful responses. If your origin returns 4xx or 5xx, no charge happens. **You don't need to issue refunds for failed responses — they were never billed.**

**Validate before billing.** If a request is malformed or the agent provided invalid input, return 400 fast. Don't:
- Accept the request
- Do partial work
- Discover the input was bad halfway through
- Return 200 with `{"error": "bad input"}` (this LOOKS successful and gets charged)

If validation can be done synchronously and cheaply, do it before any billable work starts.

**When to actually issue a refund:** if you returned 200 but the result was garbage due to a bug on your side, refund manually via `pay direct` to the agent's address. This should be rare. Track it.

**Don't return 200 with an error body to "be helpful."** That's a billable success. Return the appropriate non-2xx code.

---

## Streaming and WebSocket

For real-time data feeds, the per-request pricing model breaks down. Use connection-time pricing instead.

**Pattern:** charge per connection-hour, not per message.

```yaml
routes:
  - path: "/stream"
    price: "0.20"        # per hour of connection
    pricing_unit: "hour"
    settlement: "tab"
```

The agent opens a tab, connects, and receives messages. Charges accrue based on connection duration. When the agent disconnects, billing stops.

**Practical rules:**
- Send heartbeats every 15-30s so dead connections close
- Document reconnect behavior — does the client resume from a cursor, or replay missed events?
- Provide a polling fallback for clients that can't WebSocket (price it competitively per-call)

**When to use polling instead of WebSocket:** if updates are infrequent (>1 minute apart), polling is simpler and often cheaper. Reserve WebSocket for actual real-time use cases (sub-second updates).

---

## Caching

Help agents avoid paying twice for the same data.

**Set Cache-Control headers** on responses that are safely cacheable:

```
HTTP/1.1 200 OK
Cache-Control: public, max-age=3600
ETag: "abc123"

{ "weather": "..." }
```

The agent's SDK can cache the response. If they request again within the TTL, they hit their local cache and don't pay you.

**Use ETag + If-None-Match for revalidation:**

```
GET /weather/london
If-None-Match: "abc123"

→ HTTP/1.1 304 Not Modified
```

Per the error-handling section, 304 is not 2xx — pay-gate doesn't charge for it. The agent confirmed cache validity for free.

**When NOT to cache:**
- Real-time data (current price, live score)
- Personalized results (per-agent context)
- Anything where staleness causes harm

If your data updates every 60 seconds, set `max-age=60`. If it never updates, set `max-age=86400`. Don't be conservative just because — agents WILL repeat the same call, and not setting cache headers means they pay every time.

---

## Rate limiting

pay-gate provides edge rate limiting per agent. You don't need to build it again at the origin.

**If your origin returns 429:** that's not 2xx, so pay-gate doesn't charge. Include `Retry-After` in the response so the agent knows when to retry.

**Don't double-throttle.** The price IS your rate limit. If you charge $0.05 per call, an agent burning through your service is paying you to do so. Aggressive throttling on top of pricing means you're rejecting paying customers.

If you need spike protection (origin can't handle the load even with paying customers), use pay-gate's built-in rate limit. Configure it conservatively — most providers should leave it on default.

---

## Pagination

Charge per query, not per page.

**Recommended pattern:** small fixed cost for the query + small incremental cost per page.

```yaml
routes:
  - path: "/search"
    price: "0.01"           # base query cost
    settlement: "tab"
  - path: "/search/page"
    price: "0.005"          # per-page cost
    settlement: "tab"
```

Or simpler: include a reasonable page size in the base query, charge once.

**Use cursors over offsets.** Cursor pagination is stateless and resumable. Offset pagination breaks under concurrent writes and forces clients to count pages they've already paid for.

**Anti-pattern: free first page + paid rest.** Looks generous, behaves badly. Agents that hit your API once never pay. Agents who actually use your API pay disproportionately. Either it's all paid or it's all free.

---

## Versioning

When your API changes incompatibly, agents need a stable target.

**Use URL versioning:** `/v1/weather`, `/v2/weather`. Easy for agents to pin, easy for pay-gate to route, easy for caches.

**Don't version with headers.** Header-based versioning is invisible in URLs, harder to cache, harder for agents to discover.

**Honor existing tabs when shipping a breaking change.** If an agent has an open tab with you against `/v1`, don't suddenly redirect to `/v2`. Run both in parallel for at least one auto-close cycle (30 days). Communicate the deprecation timeline via your discovery metadata.

**Deprecation steps:**
1. Announce: add `Deprecation: <date>` and `Sunset: <date>` headers to v1 responses
2. Wait: at least 90 days
3. Cut off: return 410 Gone for the deprecated version

---

## The info block (Bazaar extension)

Every catalog API must fill out the `info` block in pay-gate config. This is what agents see when they discover your API. Take it seriously — vague info blocks lose to specific ones in `pay discover` rankings.

```yaml
routes:
  - path: "/weather"
    price: "0.01"
    settlement: "tab"
    description: "Current weather and 7-day forecast by city or coordinates"
    info:
      input:
        type: "http"
        method: "GET"
        queryParams:
          city:
            type: "string"
            description: "City name (English or local)"
          units:
            type: "string"
            enum: ["metric", "imperial"]
            description: "Temperature units"
      output:
        type: "json"
        example:
          city: "London"
          country: "GB"
          temperature: 15
          conditions: "partly cloudy"
          forecast: [ ... ]
```

Good info blocks have:
- Real example values (not "string" or "TODO")
- Parameter descriptions in plain English
- Honest enum values for accepted parameters
- Output examples that show the actual shape

Bad info blocks have:
- Empty descriptions
- Generic placeholder examples
- Missing required parameters
- Output examples that don't match what the API returns

---

## Quality bar (the catalog rules)

Submissions to the catalog bounty must pass these. They're non-negotiable.

**Different inputs produce different outputs.** An API that returns the same response regardless of input is not an API — it's a static page. Reviewers will test with multiple inputs and reject if the output doesn't change.

**No placeholder or random data.** "Hello world" responses, lorem ipsum, hard-coded sample data, and random values that look real but aren't will fail review.

**Honest errors with actionable messages.** When something goes wrong, return a clear error message that tells the agent what to fix:

```
HTTP/1.1 400 Bad Request
{
  "error": "invalid_city",
  "message": "City 'Atlntis' not found. Did you mean 'Atlantis, Greece'?",
  "documentation": "https://your-api.com/docs/cities"
}
```

Not:

```
HTTP/1.1 400 Bad Request
{ "error": "error" }
```

**Reproducible.** Same input → same output, within reason. Non-deterministic APIs (LLM generation, random sampling) should accept a `seed` parameter so agents can reproduce results.

**Honest about your data.** Disclose coverage gaps, update cadence, source attribution, and confidence scores where applicable. Reviewers will check claimed accuracy against actual responses on representative inputs.

---

## Quick reference

| Don't | Do |
|-------|-----|
| Charge per status poll | Free `/jobs/:id` after paid `/generate` |
| Return 200 with error body | Return appropriate 4xx/5xx |
| Skip validation | Validate before billable work |
| Header-version your API | URL-version (`/v1/...`) |
| Free first page, paid rest | All free or all paid |
| Vague `info` blocks | Real examples, real descriptions |
| Charge for `/models`, `/health` | Free metadata endpoints |
| Throttle paying customers | Price IS the rate limit |
| Same response for any input | Different inputs → different outputs |
| Skip Cache-Control | Set sensible TTLs |

---

## Further reading

- [Provider Guide](/provider-guide) — how to accept payments
- [pay-gate Configuration](/gate/config) — full config reference
- [pay-gate Guide](/gate/guide) — end-to-end deployment
- [Webhooks](/webhooks) — webhook delivery and signing
- [Earn from AI Agents](/earn) — the catalog bounty program
