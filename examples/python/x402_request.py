"""
Runnable example: x402 Request

Usage:
    PAYSKILL_KEY=0x... python x402_request.py

Starts a local 402 test server, then auto-pays via PayClient.request().
"""

import os
import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from payskill import PayClient

API_URL = "https://testnet.pay-skill.com/api/v1"
ROUTER = "0xE0Aa45e6937F3b9Fc0BEe457361885Cb9bfC067F"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        tx = self.headers.get("X-Payment-Tx", "")
        if tx:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"content": "premium data", "paid": True}).encode())
        else:
            body = json.dumps({
                "scheme": "exact",
                "amount": 1_000_000,
                "to": "0x000000000000000000000000000000000000dEaD",
                "settlement": "direct",
            })
            self.send_response(402)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body.encode())

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
            chain_id=84532, router_address=ROUTER,
        )

        print("Requesting (will auto-pay on 402)...")
        resp = client.request(f"http://127.0.0.1:{port}/data")
        print(f"Status: {resp.status_code}")
        print(f"Body: {resp.json()}")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
