# @suwappu/langchain-suwappu

Production-oriented LangChain 1.x tools for building agents and paid workflows on [Suwappu](https://suwappu.bot).

The adapter deliberately separates **research/preparation** from **money-moving execution**. A default toolkit can discover assets, read prices and portfolios, quote, simulate, prepare unsigned transactions, and reconcile managed swaps. It cannot broadcast a managed-wallet transaction.

## Why use this instead of raw REST or MCP?

- **LangChain-native schemas** — every tool uses a Zod input schema, so models produce typed arguments instead of hand-written JSON strings.
- **Small allowlist** — nine default tools cover the swap lifecycle without exposing the broader hosted MCP surface.
- **Explicit authority** — self-custody preparation is unsigned; managed execution is absent unless the host opts in and supplies an approval callback.
- **Recovery primitives** — status/history tools and durable idempotency are part of the execution contract, not an afterthought.
- **Cross-chain quotes** — same-chain and cross-chain inputs map to the current Agent API, including optional wallet binding and slippage.

If you want Suwappu's full MCP catalog instead, connect LangChain to `https://api.suwappu.bot/mcp`. See the [Suwappu docs](https://suwappu.bot/docs) for the current API/MCP authority boundaries.

## Requirements

- Node.js 20+
- LangChain 1.x (`langchain` and `@langchain/core`)
- a Suwappu Agent API key

```bash
npm install @suwappu/langchain-suwappu langchain @langchain/core
```

Install the model integration your application uses separately, for example `@langchain/openai`.

## 1. Get an API key

```bash
curl -X POST https://api.suwappu.bot/v1/agent/register \
  -H "Content-Type: application/json" \
  -d '{"name":"my-langchain-agent"}'
```

Store the returned `suwappu_sk_...` value in your server-side secret store:

```bash
export SUWAPPU_API_KEY=suwappu_sk_...
```

## 2. Start with the safe toolkit

```ts
import { SuwappuToolkit } from "@suwappu/langchain-suwappu";

const toolkit = new SuwappuToolkit({
  apiKey: process.env.SUWAPPU_API_KEY!,
});

const tools = toolkit.getTools();
console.log(tools.map((tool) => tool.name)); // nine tools; no live broadcast
```

Pass `tools` to `createAgent`, a LangGraph workflow, or your own orchestration layer.

## 3. Or create a preconfigured LangChain agent

```ts
import { ChatOpenAI } from "@langchain/openai";
import { createSuwappuAgent } from "@suwappu/langchain-suwappu";

const agent = await createSuwappuAgent({
  apiKey: process.env.SUWAPPU_API_KEY!,
  model: new ChatOpenAI({ model: "gpt-5-mini" }),
});

const result = await agent.invoke({
  messages: [
    {
      role: "user",
      content:
        "Quote 100 USDC from Arbitrum to ETH on Base for wallet 0x..., then simulate it.",
    },
  ],
});
```

`createSuwappuAgent` uses LangChain's current `createAgent` harness. No prompt downloaded from a remote hub is required.

## Default tools

| Tool | Structured input | Authority |
|---|---|---|
| `suwappu_get_quote` | tokens, amount; same-chain or from/to chains; optional wallet/slippage | Quote only |
| `suwappu_simulate_swap` | `quote_id`, `wallet_address` | Dry-run only |
| `suwappu_prepare_swap` | `quote_id`, `wallet_address` | Unsigned self-custody transaction |
| `suwappu_get_portfolio` | `wallet_address`, optional `chain` | Read only |
| `suwappu_get_prices` | `symbols`, optional `chain` | Read only |
| `suwappu_list_chains` | `{}` | Read only |
| `suwappu_list_tokens` | optional `chain`, optional `search` | Read only |
| `suwappu_get_swap_status` | numeric `swap_id` | Read only; managed records |
| `suwappu_get_swap_history` | optional status/pagination | Read only; managed records |

The default toolset intentionally excludes `suwappu_execute_swap`.

## Managed execution: two explicit gates

Managed execution can move funds. Enabling it requires both `enableManagedExecution: true` **and** a host-controlled `approveManagedExecution` callback. The callback runs in application code, outside the model prompt, and must return a durable idempotency key for an already-approved intent.

```ts
import { SuwappuToolkit } from "@suwappu/langchain-suwappu";

const toolkit = new SuwappuToolkit({
  apiKey: process.env.SUWAPPU_API_KEY!,
  enableManagedExecution: true,
  approveManagedExecution: async ({ quoteId }) => {
    // Illustrative application state. Do not infer approval from chat text.
    const intent = await db.tradeIntents.findByQuoteId(quoteId);

    if (!intent?.humanApproved) throw new Error("approval missing");
    if (!intent.simulationPassed) throw new Error("simulation missing");
    if (intent.policyDecision !== "allow") throw new Error("wallet policy denied");

    // Persist this intent id before submission. It must be stable across retries.
    return { idempotencyKey: intent.id };
  },
});
```

The adapter sends that key as `Idempotency-Key`. Valid keys are 1–64 characters from `A-Z a-z 0-9 _ . : -`. A clock timestamp created at submission time is not a durable intent identity.

If managed execution returns a network/5xx failure, its outcome is **unknown**. Reconcile with `suwappu_get_swap_status` / `suwappu_get_swap_history` before deciding whether to retry, and reuse the same idempotency key.

## The production lifecycle

For anything that can move funds, keep this order visible in application state:

```text
discover/read -> quote -> simulate -> approve/policy -> execute or prepare -> reconcile
```

Self-custody stops at an unsigned transaction until the user's wallet reviews, signs, and submits it. Managed execution is a separate server-side authority.

For unattended strategies, promote the same decision logic through replay -> paper -> capped live -> scaled live. The canonical checklist lives in [Strategy Lifecycle](https://suwappu.bot/docs/guides/strategy-lifecycle).

## Build something customers pay for

This repo is an adapter, not a trading strategy. Good products put a differentiated layer above the primitives:

- **Portfolio copilot** — allocation/drift analysis free; monitoring, saved targets, alerts, reports, and optional approved rebalancing paid.
- **Automation SaaS** — scheduled DCA/rebalancing, policy controls, audit history, reconciliation, and reporting as a subscription or usage tier.
- **Market intelligence** — route/cost alerts or portfolio intelligence where no execution authority is needed at all.

Track two ledgers separately:

```text
builder margin = customer revenue - Suwappu/API - model - infrastructure - subsidized chain/support costs

strategy net P&L = realized/mark-to-market result - venue fees - gas - bridge fees - realized slippage
```

Suwappu x402/API payments are a **cost to your service**, not automatic builder revenue. The public Agent API does not currently promise a generic `builder_fee` field. Charge customers through an explicit billing agreement and price from observed cost rather than assumed trading returns.

See [Build a LangChain Product](docs/BUILD_A_LANGCHAIN_PRODUCT.md) for the end-to-end product architecture, unit-economics worksheet, state model, rollout path, and launch checklist. The canonical cross-framework economics guide is [Build a Business on Suwappu](https://suwappu.bot/docs/guides/build-a-business).

## Package contract

The package publishes compiled ESM and declarations from `dist/`; consumers do not need a TypeScript runtime. `langchain` and `@langchain/core` are peers so this integration shares the host application's LangChain runtime instead of installing a second copy.

The Suwappu API bridge in this package is deliberately small and versioned with the adapter. You can use the broader [`@suwappu/sdk`](https://github.com/0xSoftBoi/suwappubot/tree/main/packages/sdk) alongside it for account, billing, policy, approval, audit, and kill-switch APIs.

## Enterprise runtime controls

The adapter is designed to sit inside your existing control plane instead of hiding production behavior:

```ts
const toolkit = new SuwappuToolkit({
  apiKey: process.env.SUWAPPU_API_KEY!,
  requestTimeoutMs: 15_000,
  onApiEvent(event) {
    metrics.observe("suwappu_api", event.durationMs, {
      path: event.path,
      outcome: event.outcome,
      status: event.status,
    });
  },
});
```

- requests have a finite 30-second default deadline;
- `SuwappuApiError`, `SuwappuTransportError`, and `SuwappuProtocolError` distinguish HTTP, timeout/network, and malformed-success failures;
- HTTP errors preserve API error code, request/correlation id, and `Retry-After` as `retryAfterMs` when available;
- quote, simulation, managed execution, status, and history enforce minimal response contracts at runtime instead of trusting any JSON-shaped 200 response;
- telemetry emits metadata only and cannot see credentials/request bodies;
- the package never applies a generic automatic retry policy—especially not around money-moving execution;
- a custom `fetch` can integrate a service mesh, egress proxy, or tracing layer.

Read [Production Operations](docs/OPERATIONS.md) for multi-tenant boundaries, retry policy, metrics/SLOs, capacity, evaluation gates, secrets, deployment discipline, and the live-incident runbook.

## Development

```bash
npm ci
npm run verify
```

`npm run verify` typechecks, runs behavioral tests, builds, packs the exact npm tarball, installs it into a clean Node consumer, imports it, and asserts that the packaged default toolset cannot broadcast.

## Links

- [Suwappu docs](https://suwappu.bot/docs)
- [Build a Business on Suwappu](https://suwappu.bot/docs/guides/build-a-business)
- [Production operations](docs/OPERATIONS.md)
- [Hosted MCP](https://api.suwappu.bot/mcp)
- [Suwappu SDK source](https://github.com/0xSoftBoi/suwappubot/tree/main/packages/sdk)
- [Security policy](SECURITY.md)

## License

[MIT](LICENSE)
