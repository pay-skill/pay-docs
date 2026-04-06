/**
 * Runnable example: x402 Request (direct settlement, v2 wire format)
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

async function main() {
  const key = process.env.PAYSKILL_KEY;
  if (!key) throw new Error("Set PAYSKILL_KEY env var");

  // Fetch contract addresses — never hardcode these
  const contracts = await fetch(`${API_URL}/contracts`).then((r) => r.json());

  // Start a local test server that returns v2 402
  const server = createServer((req, res) => {
    const sig = req.headers["payment-signature"];
    if (sig && typeof sig === "string" && sig.length > 0) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ content: "premium data", paid: true }));
    } else {
      // v2 PaymentRequired
      const paymentRequired = {
        x402Version: 2,
        resource: { url: "/data", mimeType: "application/json" },
        accepts: [{
          scheme: "exact",
          network: `eip155:${contracts.chain_id}`,
          amount: "1000000",
          asset: contracts.usdc,
          payTo: "0x000000000000000000000000000000000000dEaD",
          maxTimeoutSeconds: 60,
          extra: { name: "USDC", version: "2", facilitator: "https://testnet.pay-skill.com/x402", settlement: "direct" },
        }],
        extensions: {},
      };
      const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");
      res.writeHead(402, {
        "Content-Type": "application/json",
        "PAYMENT-REQUIRED": encoded,
      });
      res.end(JSON.stringify(paymentRequired));
    }
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  console.log(`Test server on http://127.0.0.1:${port}`);

  try {
    const client = new PayClient({
      apiUrl: API_URL,
      privateKey: key,
      chainId: contracts.chain_id,
      routerAddress: contracts.router,
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
