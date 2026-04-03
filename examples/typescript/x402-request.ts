/**
 * Runnable example: x402 Request (direct + tab settlement)
 *
 * Usage:
 *   PAYSKILL_KEY=0x... npx tsx x402-request.ts
 *
 * This demo starts a local 402 test server, then uses PayClient.request()
 * to auto-pay and retry.
 */

import { createServer } from "node:http";
import { PayClient } from "@pay-skill/sdk";

const API_URL = "https://testnet.pay-skill.com/api/v1";
const ROUTER = "0x24F26eCb1f46451994c59585817e87896749935D";

async function main() {
  const key = process.env.PAYSKILL_KEY;
  if (!key) throw new Error("Set PAYSKILL_KEY env var");

  // Start a local test server that returns 402
  const server = createServer((req, res) => {
    const tx = req.headers["x-payment-tx"];
    if (tx && typeof tx === "string" && tx.length > 0) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ content: "premium data", paid: true }));
    } else {
      res.writeHead(402, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        scheme: "exact",
        amount: 1_000_000,  // $1.00
        to: "0x000000000000000000000000000000000000dEaD",
        settlement: "direct",
      }));
    }
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  console.log(`Test server on http://127.0.0.1:${port}`);

  try {
    const client = new PayClient({
      apiUrl: API_URL,
      privateKey: key,
      chainId: 84532,
      routerAddress: ROUTER,
    });

    console.log("Requesting (will auto-pay on 402)...");
    const resp = await client.request(`http://127.0.0.1:${port}/data`);
    const body = await resp.json();
    console.log("Status:", resp.status);
    console.log("Body:", body);
  } finally {
    server.close();
  }
}

main().catch(console.error);
