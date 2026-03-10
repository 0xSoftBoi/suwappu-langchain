# @suwappu/langchain-suwappu

**LangChain toolkit for the [Suwappu](https://suwappu.bot) cross-chain DEX.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org)
[![LangChain](https://img.shields.io/badge/LangChain-0.3-green.svg)](https://js.langchain.com)

Drop-in LangChain toolkit with 6 DeFi tools for building AI trading agents. Works with any LangChain agent, LangGraph workflow, or custom chain. Swap tokens, check prices, view portfolios — across 15 chains.

---

## Features

- **6 LangChain tools** — Quote, swap, portfolio, prices, chains, tokens
- **SuwappuToolkit** — Single constructor returns all tools ready-to-use
- **Pre-built agent** — `createSuwappuAgent()` gives you a working ReAct agent out of the box
- **LangGraph ready** — Tools work with stateful LangGraph workflows
- **15 chains** — Ethereum, Arbitrum, Base, Solana, and 11 more

---

## Install

```bash
npm install @suwappu/langchain-suwappu
# or
bun add @suwappu/langchain-suwappu
```

---

## Quick Start

### Use the Toolkit

```typescript
import { SuwappuToolkit } from "@suwappu/langchain-suwappu";

const toolkit = new SuwappuToolkit({
  apiKey: process.env.SUWAPPU_API_KEY!,
});

// Get all 6 tools as LangChain Tool instances
const tools = toolkit.getTools();

// Use with any LangChain agent
const agent = createOpenAIFunctionsAgent({ llm, tools, prompt });
```

### Use the Pre-Built Agent

```typescript
import { createSuwappuAgent } from "@suwappu/langchain-suwappu";
import { ChatOpenAI } from "@langchain/openai";

const agent = await createSuwappuAgent({
  apiKey: process.env.SUWAPPU_API_KEY!,
  model: new ChatOpenAI({ modelName: "gpt-4" }),
});

const result = await agent.invoke({
  input: "Get a quote for swapping 1 ETH to USDC on Arbitrum",
});
```

### Use Individual Tools

```typescript
import { SuwappuGetQuoteTool, SuwappuPortfolioTool } from "@suwappu/langchain-suwappu";
import { createClient } from "@suwappu/sdk";

const client = createClient({ apiKey: process.env.SUWAPPU_API_KEY! });

const quoteTool = new SuwappuGetQuoteTool(client);
const portfolioTool = new SuwappuPortfolioTool(client);
```

---

## Tools Reference

| Tool | Name | Input | Output |
|------|------|-------|--------|
| `SuwappuGetQuoteTool` | `suwappu_get_quote` | JSON: `{ from_token, to_token, amount, chain }` | Quote with price, route, gas, fees |
| `SuwappuExecuteSwapTool` | `suwappu_execute_swap` | `quote_id` string | Transaction hash and status |
| `SuwappuPortfolioTool` | `suwappu_get_portfolio` | Optional `chain` string | Token balances with USD values |
| `SuwappuPricesTool` | `suwappu_get_prices` | `token` string | USD price and 24h change |
| `SuwappuChainsTool` | `suwappu_list_chains` | — | Supported chains and status |
| `SuwappuTokensTool` | `suwappu_list_tokens` | `chain` string | Tokens with addresses and decimals |

---

## Architecture

```
@suwappu/langchain-suwappu
├── SuwappuToolkit          → Returns all 6 tools
├── createSuwappuAgent()    → Pre-built ReAct agent
└── Individual Tools
    ├── SuwappuGetQuoteTool
    ├── SuwappuExecuteSwapTool
    ├── SuwappuPortfolioTool
    ├── SuwappuPricesTool
    ├── SuwappuChainsTool
    └── SuwappuTokensTool
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUWAPPU_API_KEY` | Yes | Your Suwappu API key |
| `OPENAI_API_KEY` | For agent | Required if using `createSuwappuAgent()` |

---

## Get an API Key

```bash
curl -X POST https://api.suwappu.bot/v1/agent/register \
  -H "Content-Type: application/json" \
  -d '{"name": "my-langchain-agent"}'
```

Free. No credit card. Returns `suwappu_sk_...` immediately.

---

## License

[MIT](LICENSE)
