---
name: suwappu-langchain
description: Safe-by-default LangChain 1.x toolkit for Suwappu discovery, quotes, simulation, unsigned preparation, portfolio data, and managed-swap reconciliation
user-invocable: true
tools:
  - suwappu_get_quote
  - suwappu_simulate_swap
  - suwappu_prepare_swap
  - suwappu_get_portfolio
  - suwappu_get_prices
  - suwappu_list_chains
  - suwappu_list_tokens
  - suwappu_get_swap_status
  - suwappu_get_swap_history
metadata:
  openclaw.requires.env: ["SUWAPPU_API_KEY"]
  openclaw.primaryEnv: SUWAPPU_API_KEY
  openclaw.emoji: "🦜"
  openclaw.category: defi
  openclaw.tags: ["langchain", "agent", "defi", "tools", "suwappu"]
  openclaw.install:
    - type: npm
      package: "@suwappu/langchain-suwappu"
---

# Suwappu LangChain Toolkit

Use this integration when a LangChain/LangGraph application needs a deliberately small Suwappu tool surface.

## Setup

```bash
npm install @suwappu/langchain-suwappu langchain @langchain/core
export SUWAPPU_API_KEY=suwappu_sk_...
```

```ts
import { SuwappuToolkit } from "@suwappu/langchain-suwappu";

const tools = new SuwappuToolkit({
  apiKey: process.env.SUWAPPU_API_KEY!,
}).getTools();
```

## Authority boundary

The nine default tools are read, quote, simulate, unsigned-prepare, or reconciliation operations. None broadcasts a managed-wallet transaction.

| Tool | Authority |
|---|---|
| `suwappu_get_quote` | Quote only |
| `suwappu_simulate_swap` | Dry-run only |
| `suwappu_prepare_swap` | Unsigned self-custody transaction |
| `suwappu_get_portfolio` | Read only |
| `suwappu_get_prices` | Read only |
| `suwappu_list_chains` | Read only |
| `suwappu_list_tokens` | Read only |
| `suwappu_get_swap_status` | Read managed record |
| `suwappu_get_swap_history` | Read managed records |

`suwappu_execute_swap` is intentionally not part of this default skill surface. A host application can construct it only by setting `enableManagedExecution: true` and providing `approveManagedExecution`, which must validate application approval/policy state and return a durable idempotency key.

Prompt text is never proof of financial approval.

## Recommended flow

```text
discover/read -> quote -> simulate -> approve/policy -> execute or prepare -> reconcile
```

After an outcome-unknown managed execution request, reconcile status/history before retrying and reuse the same durable intent key.

Current docs: https://suwappu.bot/docs
