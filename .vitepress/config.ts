import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Ᵽay",
  description:
    "USDC payments for AI agents. x402 payment gateway, facilitator, SDKs, CLI, and MCP server. Base network.",
  base: "/docs/",
  cleanUrls: true,
  srcExclude: ["skills/**"],

  head: [
    ["link", { rel: "icon", href: "/favicon.ico" }],
    [
      "meta",
      {
        property: "og:title",
        content: "Ᵽay — USDC Payments for AI Agents | x402 Payment Stack",
      },
    ],
    [
      "meta",
      {
        property: "og:description",
        content:
          "x402 payment gateway, facilitator, Python and TypeScript SDKs, CLI, and MCP server. AI agents pay for any API with USDC on Base.",
      },
    ],
  ],

  themeConfig: {
    nav: [
      { text: "Getting Started", link: "/" },
      { text: "CLI", link: "/cli/" },
      { text: "pay-gate", link: "/gate/" },
      { text: "API Reference", link: "/api-reference" },
      {
        text: "GitHub",
        items: [
          {
            text: "Protocol",
            link: "https://github.com/pay-skill/pay-protocol",
          },
          { text: "SDK", link: "https://github.com/pay-skill/pay-sdk" },
          { text: "CLI", link: "https://github.com/pay-skill/pay-cli" },
          { text: "Gate", link: "https://github.com/pay-skill/gate" },
          { text: "MCP", link: "https://github.com/pay-skill/mcp" },
        ],
      },
    ],

    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Introduction", link: "/" },
          { text: "Contracts & Networks", link: "/contracts" },
          { text: "Framework Integrations", link: "/integrations" },
        ],
      },
      {
        text: "For Agents",
        items: [
          { text: "Get Started", link: "/quickstart/" },
          { text: "Claude Desktop", link: "/quickstart/claude-desktop" },
          { text: "CLI Reference", link: "/cli/" },
          { text: "TypeScript SDK", link: "/sdk/typescript" },
          { text: "fetch() Wrapper", link: "/sdk/fetch" },
          { text: "Python SDK", link: "/sdk/python" },
        ],
      },
      {
        text: "For Providers",
        items: [
          { text: "Provider Guide", link: "/provider-guide" },
          { text: "pay-gate Overview", link: "/gate/" },
          { text: "pay-gate Quick Start", link: "/gate/quickstart" },
          { text: "pay-gate Configuration", link: "/gate/config" },
          { text: "pay-gate Guide", link: "/gate/guide" },
          { text: "Upgrading pay-gate", link: "/gate/upgrade" },
          { text: "Webhooks", link: "/webhooks" },
        ],
      },
      {
        text: "Application Middleware",
        items: [
          { text: "Overview", link: "/middleware/" },
          { text: "Express", link: "/middleware/express" },
          { text: "Next.js", link: "/middleware/next" },
          // Per-framework guides added as they land (P27-18):
          //   { text: "FastAPI", link: "/middleware/fastapi" },
        ],
      },
      {
        text: "Quickstarts",
        items: [
          { text: "Full Stack Tutorial", link: "/quickstart/end-to-end" },
          { text: "Direct Payment", link: "/quickstart/direct" },
          { text: "Tab Lifecycle", link: "/quickstart/tab" },
          { text: "x402 Direct", link: "/quickstart/x402-direct" },
          { text: "x402 Tab", link: "/quickstart/x402-tab" },
          { text: "A2A + Direct", link: "/quickstart/a2a-direct" },
          { text: "A2A + Tab", link: "/quickstart/a2a-tab" },
          { text: "AP2 Mandate", link: "/quickstart/ap2" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "API Reference", link: "/api-reference" },
          { text: "Troubleshooting", link: "/troubleshooting" },
        ],
      },
    ],

    footer: {
      message:
        "Ᵽay — USDC payments for AI agents on Base.",
      copyright:
        "Copyright &copy; 2026 Agent Payment Protocol Infrastructure Inc.",
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/pay-skill" },
    ],

    search: {
      provider: "local",
    },
  },

  markdown: {
    theme: {
      light: "github-light",
      dark: "github-dark",
    },
  },
});
