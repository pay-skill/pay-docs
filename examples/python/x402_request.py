"""
Runnable example: x402 Request (v2 wire format)

Usage:
    PAYSKILL_KEY=0x... python x402_request.py

Starts a local 402 test server, then auto-pays via PayClient.request().
"""

import os
import json
import base64
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from payskill import PayClient

API_URL = "https://testnet.pay-skill.com/api/v1"

# Fetch contract addresses at module level — never hardcode these
import httpx as _httpx
contracts = _httpx.get(f"{API_URL}/contracts").json()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        sig = self.headers.get("Payment-Signature", "")
        if sig:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"content": "premium data", "paid": True}).encode())
        else:
            # v2 PaymentRequired
            payment_required = {
                "x402Version": 2,
                "resource": {"url": "/data", "mimeType": "application/json"},
                "accepts": [{
                    "scheme": "exact",
                    "network": "eip155:84532",
                    "amount": "1000000",
                    "asset": contracts["usdc"],
                    "payTo": "0x000000000000000000000000000000000000dEaD",
                    "maxTimeoutSeconds": 60,
                    "extra": {
                        "name": "USDC",
                        "version": "2",
                        "facilitator": "https://testnet.pay-skill.com/x402",
                        "settlement": "direct",
                    },
                }],
                "extensions": {},
            }
            encoded = base64.b64encode(json.dumps(payment_required).encode()).decode()
            self.send_response(402)
            self.send_header("Content-Type", "application/json")
            self.send_header("PAYMENT-REQUIRED", encoded)
            self.end_headers()
            self.wfile.write(json.dumps(payment_required).encode())

    def log_message(self, fmt: str, *args: object) -> None:
        pass  # suppress logs


def main() -> None:
    key = os.environ.get("PAYSKILL_KEY")
    if not key:
        raise RuntimeError("Set PAYSKILL_KEY env var")

    server = HTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"Test server on http://127.0.0.1:{port}")

    try:
        client = PayClient(
            api_url=API_URL, signer="raw", private_key=key,
            chain_id=contracts["chain_id"], router_address=contracts["router"],
        )

        print("Requesting (will auto-pay on 402)...")
        resp = client.request(f"http://127.0.0.1:{port}/data")
        print(f"Status: {resp.status_code}")
        print(f"Body: {resp.json()}")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
