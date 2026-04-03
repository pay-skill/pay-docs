"""
Runnable example: Direct Payment

Usage:
    PAYSKILL_KEY=0x... python direct_payment.py

Requires testnet USDC (auto-mints if balance is low).
"""

import os
import httpx
from payskill import PayClient

API_URL = "https://testnet.pay-skill.com/api/v1"
ROUTER = "0x24F26eCb1f46451994c59585817e87896749935D"


def main() -> None:
    key = os.environ.get("PAYSKILL_KEY")
    if not key:
        raise RuntimeError("Set PAYSKILL_KEY env var")

    client = PayClient(
        api_url=API_URL,
        signer="raw",
        private_key=key,
        chain_id=84532,
        router_address=ROUTER,
    )

    # Mint if needed
    status = client.get_status()
    print(f"Agent: {status.address}")
    print(f"Balance: {status.balance / 1_000_000:.2f} USDC")

    if status.balance < 2_000_000:
        print("Minting 100 USDC...")
        httpx.post(f"{API_URL}/mint", json={"wallet": status.address, "amount": 100}, timeout=60)
        import time
        time.sleep(5)

    # Send $1 to a test address
    provider = "0x000000000000000000000000000000000000dEaD"
    print(f"\nSending $1.00 to {provider}...")

    result = client.pay_direct(provider, 1_000_000, memo="example-direct")
    print(f"tx_hash: {result.tx_hash}")
    print(f"status: {result.status}")


if __name__ == "__main__":
    main()
