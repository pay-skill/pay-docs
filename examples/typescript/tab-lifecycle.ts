/**
 * Runnable example: Tab Lifecycle
 *
 * Usage:
 *   AGENT_KEY=0x... PROVIDER_KEY=0x... npx tsx tab-lifecycle.ts
 */

import { Wallet } from "@pay-skill/sdk";

const API_URL = "https://testnet.pay-skill.com/api/v1";

async function main() {
  const agentKey = process.env.AGENT_KEY;
  const providerKey = process.env.PROVIDER_KEY;
  if (!agentKey || !providerKey) throw new Error("Set AGENT_KEY and PROVIDER_KEY");

  // Fetch contract addresses — never hardcode these
  const contracts = await fetch(`${API_URL}/contracts`).then((r) => r.json());

  const agent = new Wallet({
    privateKey: agentKey,
    chain: "base-sepolia",
    apiUrl: API_URL,
    routerAddress: contracts.router,
  });

  const provider = new Wallet({
    privateKey: providerKey,
    chain: "base-sepolia",
    apiUrl: API_URL,
    routerAddress: contracts.router,
  });

  console.log("Agent:", agent.address);
  console.log("Provider:", provider.address);

  // Mint if needed
  const balance = await agent.balance();
  if (balance < 10) {
    console.log("Minting 100 USDC...");
    await fetch(`${API_URL}/mint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: agent.address, amount: 100 }),
    });
    await new Promise((r) => setTimeout(r, 5000));
  }

  // 1. Open tab
  console.log("\n1. Opening tab ($10, max $2/charge)...");
  const tab = await agent.openTab(provider.address, 10, 2);
  console.log("tab_id:", tab.tab_id);

  // Wait for on-chain
  await new Promise((r) => setTimeout(r, 5000));

  // 2. Charge (provider side)
  console.log("\n2. Charging $1.00...");
  const charge = await provider.chargeTab(tab.tab_id, 1);
  console.log("charge status:", charge.status);

  // 3. Close (agent side)
  console.log("\n3. Closing tab...");
  const close = await agent.closeTab(tab.tab_id);
  console.log("close status:", close.status);
}

main().catch(console.error);
