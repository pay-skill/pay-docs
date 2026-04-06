/**
 * Runnable example: Direct Payment
 *
 * Usage:
 *   PAYSKILL_KEY=0x... npx tsx direct-payment.ts
 *
 * Requires testnet USDC (mint first via the API).
 */

import { Wallet } from "@pay-skill/sdk";

const API_URL = "https://testnet.pay-skill.com/api/v1";

async function main() {
  const key = process.env.PAYSKILL_KEY;
  if (!key) throw new Error("Set PAYSKILL_KEY env var");

  // Fetch contract addresses — never hardcode these
  const contracts = await fetch(`${API_URL}/contracts`).then((r) => r.json());

  const wallet = new Wallet({
    privateKey: key,
    chain: "base-sepolia",
    apiUrl: API_URL,
    routerAddress: contracts.router,
  });

  console.log("Agent:", wallet.address);

  // Check balance
  const balance = await wallet.balance();
  console.log("Balance:", balance, "USDC");

  if (balance < 2) {
    console.log("Minting 100 USDC...");
    await fetch(`${API_URL}/mint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: wallet.address, amount: 100 }),
    });
    // Wait for on-chain confirmation
    await new Promise((r) => setTimeout(r, 5000));
  }

  // Send $1 to a test address
  const provider = "0x000000000000000000000000000000000000dEaD";
  console.log(`Sending $1.00 to ${provider}...`);

  const result = await wallet.payDirect(provider, 1, "example-direct");
  console.log("tx_hash:", result.tx_hash);
  console.log("status:", result.status);
}

main().catch(console.error);
