import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Pay",
  description: "Payment infrastructure for AI agents. USDC on Base.",
  base: "/docs/",
  cleanUrls: true,

  head: [
    ["meta", { property: "og:title", content: "Pay — Payments for AI Agents" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Payment infrastructure for AI agents. Direct payments, tabs, and x402 paywalls on USDC and Base.",
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
        ],
      },
    ],

    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Introduction", link: "/" },
          { text: "Contracts & Networks", link: "/contracts" },
        ],
      },
      {
        text: "For Providers",
        items: [
          { text: "Provider Guide", link: "/provider-guide" },
          { text: "Webhooks", link: "/webhooks" },
          { text: "pay-gate", link: "/gate/" },
        ],
      },
      {
        text: "pay-gate",
        items: [
          { text: "Overview", link: "/gate/" },
          { text: "Quick Start", link: "/gate/quickstart" },
          { text: "Configuration", link: "/gate/config" },
        ],
      },
      {
        text: "CLI Reference",
        items: [{ text: "Commands", link: "/cli/" }],
      },
      {
        text: "API Reference",
        items: [{ text: "REST API", link: "/api-reference" }],
      },
      {
        text: "SDK Reference",
        items: [
          { text: "TypeScript", link: "/sdk/typescript" },
          { text: "Python", link: "/sdk/python" },
        ],
      },
      {
        text: "Quickstarts",
        items: [
          { text: "Direct Payment", link: "/quickstart/direct" },
          { text: "Tab Lifecycle", link: "/quickstart/tab" },
          { text: "x402 Direct", link: "/quickstart/x402-direct" },
          { text: "x402 Tab", link: "/quickstart/x402-tab" },
          { text: "A2A + Direct", link: "/quickstart/a2a-direct" },
          { text: "A2A + Tab", link: "/quickstart/a2a-tab" },
          { text: "AP2 Mandate", link: "/quickstart/ap2" },
        ],
      },
    ],

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
