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


def main() -> None:
    agent_key = os.environ.get("AGENT_KEY")
    provider_key = os.environ.get("PROVIDER_KEY")
    if not agent_key or not provider_key:
        raise RuntimeError("Set AGENT_KEY and PROVIDER_KEY env vars")

    # Fetch contract addresses — never hardcode these
    contracts = httpx.get(f"{API_URL}/contracts").json()

    agent = PayClient(
        api_url=API_URL, signer="raw", private_key=agent_key,
        chain_id=contracts["chain_id"], router_address=contracts["router"],
    )
    provider = PayClient(
        api_url=API_URL, signer="raw", private_key=provider_key,
        chain_id=contracts["chain_id"], router_address=contracts["router"],
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

    # 2. Charge (provider side — via REST API with auth)
    print("\n2. Charging $1.00...")
    from payskill import build_auth_headers
    charge_path = f"/api/v1/tabs/{tab.tab_id}/charge"
    headers = build_auth_headers(
        private_key=provider_key, method="POST", path=charge_path,
        chain_id=contracts["chain_id"], router_address=contracts["router"],
    )
    charge = httpx.post(
        f"{API_URL}/tabs/{tab.tab_id}/charge",
        json={"amount": 1_000_000}, headers=headers, timeout=60,
    ).json()
    print(f"charge status: {charge.get('status', 'ok')}")

    # 3. Close (agent side)
    print("\n3. Closing tab...")
    closed = agent.close_tab(tab.tab_id)
    print(f"close status: {closed.status}")


if __name__ == "__main__":
    main()
