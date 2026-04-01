"""
Runnable example: Tab Lifecycle

Usage:
    AGENT_KEY=0x... PROVIDER_KEY=0x... python tab_lifecycle.py
"""

import os
import time
import httpx
from payskill import PayClient

API_URL = "https://testnet.pay-skill.com/api/v1"
ROUTER = "0xE0Aa45e6937F3b9Fc0BEe457361885Cb9bfC067F"


def main() -> None:
    agent_key = os.environ.get("AGENT_KEY")
    provider_key = os.environ.get("PROVIDER_KEY")
    if not agent_key or not provider_key:
        raise RuntimeError("Set AGENT_KEY and PROVIDER_KEY env vars")

    agent = PayClient(
        api_url=API_URL, signer="raw", private_key=agent_key,
        chain_id=84532, router_address=ROUTER,
    )
    provider = PayClient(
        api_url=API_URL, signer="raw", private_key=provider_key,
        chain_id=84532, router_address=ROUTER,
    )

    agent_status = agent.get_status()
    provider_status = provider.get_status()
    print(f"Agent: {agent_status.address}")
    print(f"Provider: {provider_status.address}")

    # Mint if needed
    if agent_status.balance < 10_000_000:
        print("Minting 100 USDC...")
        httpx.post(f"{API_URL}/mint", json={"wallet": agent_status.address, "amount": 100}, timeout=60)
        time.sleep(5)

    # 1. Open tab
    print("\n1. Opening tab ($10, max $2/charge)...")
    tab = agent.open_tab(provider_status.address, 10_000_000, 2_000_000)
    print(f"tab_id: {tab.tab_id}")

    time.sleep(5)  # wait for on-chain

    # 2. Charge (provider side)
    print("\n2. Charging $1.00...")
    charge = provider._post(f"/tabs/{tab.tab_id}/charge", {"amount": 1_000_000})
    print(f"charge status: {charge.get('status', 'ok')}")

    # 3. Close (agent side)
    print("\n3. Closing tab...")
    closed = agent.close_tab(tab.tab_id)
    print(f"close status: {closed.status}")


if __name__ == "__main__":
    main()
