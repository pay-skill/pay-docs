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
      { text: "pay-gate", link: "/gate/" },
      { text: "TypeScript SDK", link: "/sdk/typescript" },
      { text: "Python SDK", link: "/sdk/python" },
      { text: "CLI", link: "/cli/" },
      {
        text: "GitHub",
        items: [
          {
            text: "Protocol",
            link: "https://github.com/remit-md/pay-protocol",
          },
          { text: "SDK", link: "https://github.com/remit-md/pay-sdk" },
          { text: "CLI", link: "https://github.com/remit-md/pay-cli" },
          { text: "Gate", link: "https://github.com/remit-md/gate" },
        ],
      },
    ],

    sidebar: [
      {
        text: "Getting Started",
        items: [{ text: "Introduction", link: "/" }],
      },
      {
        text: "SDK Reference",
        items: [
          { text: "TypeScript", link: "/sdk/typescript" },
          { text: "Python", link: "/sdk/python" },
        ],
      },
      {
        text: "CLI Reference",
        items: [{ text: "Commands", link: "/cli/" }],
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
        text: "Guides",
        items: [
          { text: "Provider Guide", link: "/provider-guide" },
          { text: "Webhooks", link: "/webhooks" },
        ],
      },
      {
        text: "Quickstarts",
        items: [
          { text: "Direct Payment", link: "/quickstart/direct" },
          { text: "Tab Lifecycle", link: "/quickstart/tab" },
          { text: "x402 Direct Settlement", link: "/quickstart/x402-direct" },
          { text: "x402 Tab Settlement", link: "/quickstart/x402-tab" },
          { text: "A2A + Direct", link: "/quickstart/a2a-direct" },
          { text: "A2A + Tab", link: "/quickstart/a2a-tab" },
          { text: "AP2 Mandate", link: "/quickstart/ap2" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/remit-md" },
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
