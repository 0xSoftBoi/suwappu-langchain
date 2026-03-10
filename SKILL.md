---
name: suwappu-langchain
description: LangChain toolkit for Suwappu — 6 DeFi tools for building AI trading agents with LangChain and LangGraph
user-invocable: true
tools:
  - suwappu_get_quote
  - suwappu_execute_swap
  - suwappu_get_portfolio
  - suwappu_get_prices
  - suwappu_list_chains
  - suwappu_list_tokens
metadata:
  openclaw.requires.env: ["SUWAPPU_API_KEY"]
  openclaw.primaryEnv: SUWAPPU_API_KEY
  openclaw.emoji: "🦜"
  openclaw.category: defi
  openclaw.tags: ["langchain", "agent", "defi", "trading", "toolkit"]
  openclaw.install:
    - type: npm
      package: "@suwappu/langchain-suwappu"
---

# Suwappu LangChain Toolkit

Drop-in LangChain toolkit with 6 tools for cross-chain DeFi. Works with any LangChain agent, LangGraph workflow, or custom chain.

## Setup

```bash
npm install @suwappu/langchain-suwappu
export SUWAPPU_API_KEY=suwappu_sk_...
```

## Quick Start

```typescript
import { SuwappuToolkit } from "@suwappu/langchain-suwappu";

const toolkit = new SuwappuToolkit({ apiKey: process.env.SUWAPPU_API_KEY! });
const tools = toolkit.getTools(); // 6 LangChain Tool instances
```

## Tools

| Tool | Input | Output |
|------|-------|--------|
| `suwappu_get_quote` | `{ from_token, to_token, amount, chain }` | Quote with price, route, gas, fees |
| `suwappu_execute_swap` | `quote_id` | Transaction hash and status |
| `suwappu_get_portfolio` | `chain?` | Token balances with USD values |
| `suwappu_get_prices` | `token` | USD price and 24h change |
| `suwappu_list_chains` | — | Supported chains and status |
| `suwappu_list_tokens` | `chain` | Tokens with addresses and decimals |
