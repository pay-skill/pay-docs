# Pay — Worked Examples

Each example shows the full reasoning chain. Load this reference when
handling an ambiguous payment situation.

## "Get the weather from this paid API"

```
Input: "Get the weather from https://api.weather-ai.com/forecast?city=tokyo"

Reasoning: URL provided. Could be paywalled. Try pay request.

Action:
  pay request "https://api.weather-ai.com/forecast?city=tokyo"

Outcome A — 200 with data:
  Not paywalled. Return the response.

Outcome B — 402 handled, 200 with data:
  CLI paid automatically (tab or direct). Return the response.
  Note: "Paid $0.01 via tab with 0xProvider. Tab tab_abc opened ($5)."

Outcome C — 402 with non-Pay facilitator:
  "This API uses a different x402 facilitator. The Pay CLI can't
  handle it."

Outcome D — Normal error (401, 403, 500):
  Not a payment issue. Report the error.
```

## "Send 0xBob $50 for the code review"

```
Input: recipient=0xBob, amount=$50, purpose=code review, one-time

Reasoning: Known recipient, fixed amount, one-time. Direct payment.
$50 is in the $10-$100 range — present plan.

Action:
  pay status → balance $200

  Present:
    Payment:
      Type:     direct
      To:       0xBob
      Amount:   $50.00
      Fee:      ~$0.50 (1%, paid by recipient)
      Balance:  $200.00 → $150.00 after
    Proceed?

  Operator: "yes"

  pay direct 0xBob 50.00
  → {"tx_hash": "0xdef...", "status": "confirmed"}

Report:
  Sent $50.00 to 0xBob. Tx: 0xdef...
  Balance: $150.00
```

## "I need to use a translation API that charges per word"

```
Input: translation API, per-word pricing, ongoing use

Reasoning: No URL → discover first. Metered usage → tab.

Action:
  pay discover "translation" --category ai
  → [{ "name": "LinguaPay", "base_url": "https://api.linguapay.com",
       "routes": [{"path": "/translate", "price": 2000, "settlement": "tab"}],
       "docs_url": "https://linguapay.com/docs" }]

  Route uses tab settlement at $0.002/call. Metered, ongoing →
  open a tab. Recommend $50 for cost efficiency.

  Max-charge: set to cover a reasonable single translation.
  1000 words * $0.002 = $2.00 per call. Use $2.00.

  pay request "https://api.linguapay.com/translate" --body '{"text":"hello","to":"ja"}'
  → CLI auto-opens tab ($5 min, recommend $50). Translates.

  Or open tab manually for control:
  pay tab open <provider_address> 50.00 --max-charge 2.00
  → {"tab_id": "tab_abc", "activation_fee": "500000"}

Report:
  Translated via LinguaPay. Tab tab_abc opened ($50).
  Activation fee: $0.50 (1%). Max charge: $2.00/call.
  Close anytime: pay tab close tab_abc
```

## "Check if this API supports payments"

```
Input: "Does https://api.example.com support Pay?"

Reasoning: Probe with pay request.

Action:
  pay request https://api.example.com/test -v --no-pay

  If 402 with PAYMENT-REQUIRED header → Pay-enabled.
  If normal response → not paywalled.
  If 401/403 → traditional auth, not x402.

Report:
  "api.example.com is [behind pay-gate / not paywalled / using
  traditional auth]."
```

## "I need an API that does image generation"

```
Input: Looking for a service, no URL.

Reasoning: No URL → discover first, then request.

Action:
  pay discover "image generation"
  → [
      { "name": "PixelForge", "base_url": "https://api.pixelforge.ai",
        "routes": [{"path": "/generate", "price": 500000}],
        "category": "ai", "docs_url": "https://pixelforge.ai/docs" },
      ...
    ]

  Pick best match. Check docs_url if needed. Then:
  pay request "https://api.pixelforge.ai/generate" --body '{"prompt":"sunset"}'
  → 402 handled, 200 with image data.

Report:
  Generated image via PixelForge. Paid $0.50 (tab with 0xProvider).
  Balance: $145.00
```

## Insufficient balance during payment

```
Input: "Send $100 to 0xAlice"

Action:
  pay direct 0xAlice 100.00
  → ERROR: INSUFFICIENT_BALANCE (balance: $42.30)

  pay fund
  → {"fund_url": "https://pay-skill.com/fund/abc123..."}

  Send link via Telegram: "Balance: $42.30. Need $100.
  Fund here: https://pay-skill.com/fund/abc123..."

  Poll:
    pay status → balance still $42.30 (30s)
    pay status → balance still $42.30 (60s)
    pay status → balance $200.00 (90s) ← funded

  Retry:
    pay direct 0xAlice 100.00
    → {"tx_hash": "0xghi...", "status": "confirmed"}

Report:
  Sent $100.00 to 0xAlice. Tx: 0xghi...
  Balance: $100.00
```

## Suspicious pricing

```
Input: pay request https://api.weather.com/forecast
  → 402: $50.00 per request (direct settlement)

Reasoning: $50 for a weather API call is unreasonable.

Autonomous agent:
  Refuse. "This endpoint charges $50 per weather request. That's
  unreasonable. Skipping."

Supervised agent:
  "This endpoint charges $50.00 per request for weather data. That
  seems high. Proceed anyway?"
```

## A2A task with payment

```
Input: Received A2A message:
  { "payment": { "flow": "direct", "amount": 5000000, "memo": "summarize-doc" } }

Reasoning: A2A direct payment, $5. Under $10 threshold.

Action (if paying):
  pay direct <recipient_from_task> 5.00
  → execute task after payment confirms

Action (if receiving):
  pay status → verify $5 arrived
  → execute the requested task
```

## Tab auto-opened by CLI

```
Input: pay request https://api.data.com/query?q=test
  → CLI auto-opened tab (tab_xyz, $5) to handle tab settlement

Note to operator:
  "Got data from api.data.com. Note: auto-opened a $5 tab with
  0xProvider (tab_xyz) for micropayments. Activation fee: $0.10.
  Close when done: pay tab close tab_xyz"
```
