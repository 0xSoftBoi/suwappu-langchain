# @suwappu/langchain-suwappu

A safe-by-default LangChain toolkit for building agents on [Suwappu](https://suwappu.bot).

The toolkit gives LangChain and ReAct/LangGraph applications a small, explicit Suwappu tool surface for quotes, simulation, self-custody transaction preparation, portfolio/prices, and discovery. **Managed-wallet execution is excluded by default.**

> Source status: this branch prepares the 0.2.x toolkit. npm currently serves 0.1.0 until the next package release.

## Why the execution boundary is explicit

Prompt text is not a human-approval system. The default toolkit therefore cannot broadcast a managed-wallet swap.

- `suwappu_get_quote` only gets a quote.
- `suwappu_simulate_swap` dry-runs a quote and moves no funds.
- `suwappu_prepare_swap` returns an unsigned self-custody transaction for the caller to review and sign.
- `suwappu_execute_swap` can move funds through a Suwappu-managed wallet and only appears when the host sets `enableManagedExecution: true`.

Use Suwappu wallet policies and an application-level approval flow in addition to model instructions.

## Install

After the 0.2 package is published:

```bash
npm install @suwappu/langchain-suwappu
# or
bun add @suwappu/langchain-suwappu
```

For the pre-built OpenAI example, also install the model integration used by your app:

```bash
npm install @langchain/openai
```

## Get a Suwappu API key

```bash
curl -X POST https://api.suwappu.bot/v1/agent/register \
  -H "Content-Type: application/json" \
  -d '{"name":"my-langchain-agent"}'
```

Store the returned `suwappu_sk_...` key securely:

```bash
export SUWAPPU_API_KEY=suwappu_sk_...
```

## Safe default toolkit

```ts
import { SuwappuToolkit } from "@suwappu/langchain-suwappu";

const toolkit = new SuwappuToolkit({
  apiKey: process.env.SUWAPPU_API_KEY!,
});

const tools = toolkit.getTools();
// Seven tools. No managed-wallet broadcast tool is present.
console.log(tools.map((tool) => tool.name));
```

You can pass `tools` to a LangChain agent, a LangGraph node, or your own orchestration layer.

## Pre-built ReAct agent

```ts
import { ChatOpenAI } from "@langchain/openai";
import { createSuwappuAgent } from "@suwappu/langchain-suwappu";

const agent = await createSuwappuAgent({
  apiKey: process.env.SUWAPPU_API_KEY!,
  model: new ChatOpenAI({ model: "gpt-4.1-mini" }),
});

const result = await agent.invoke({
  input: "Quote 1 ETH to USDC on Arbitrum, then simulate it for wallet 0x...",
});
```

The ReAct prompt is bundled locally, so creating an agent no longer depends on downloading `hwchase17/react` from LangChain Hub at runtime.

## Tools

| Tool | Input | Default | Moves funds? |
|---|---|---:|---:|
| `suwappu_get_quote` | `{"from_token","to_token","amount","chain"}` | Yes | No |
| `suwappu_simulate_swap` | `{"quote_id","wallet_address"}` | Yes | No |
| `suwappu_prepare_swap` | `{"quote_id","wallet_address"}` | Yes | No — unsigned |
| `suwappu_get_portfolio` | `{"wallet_address","chain"?}` | Yes | No |
| `suwappu_get_prices` | `"ETH,SOL"` or JSON | Yes | No |
| `suwappu_list_chains` | empty string | Yes | No |
| `suwappu_list_tokens` | chain name | Yes | No |
| `suwappu_execute_swap` | `quote_id` | **No** | **Yes — managed wallet** |

### Enable managed execution only after approval

```ts
import { SuwappuToolkit } from "@suwappu/langchain-suwappu";

// Construct this toolset only inside your application's approved execution path.
const approvedToolkit = new SuwappuToolkit({
  apiKey: process.env.SUWAPPU_API_KEY!,
  enableManagedExecution: true,
});

const liveTools = approvedToolkit.getTools();
```

Setting this flag is intentionally conspicuous. Do not flip it merely because the model says the user approved a trade; enforce approval in application state or a human-in-the-loop workflow.

## Individual tools

```ts
import {
  SuwappuGetQuoteTool,
  SuwappuSimulateSwapTool,
  SuwappuPrepareSwapTool,
} from "@suwappu/langchain-suwappu";
import { createClient } from "@suwappu/sdk";

const client = createClient({ apiKey: process.env.SUWAPPU_API_KEY! });
const quoteTool = new SuwappuGetQuoteTool(client);
const simulateTool = new SuwappuSimulateSwapTool();
const prepareTool = new SuwappuPrepareSwapTool();
```

## SDK compatibility

The installable toolkit still depends on the published `@suwappu/sdk@0.4.x` for APIs whose stable contract matches production, such as quotes and chain/token discovery.

The `suwappubot` monorepo already contains newer 0.6.x SDK source for `swap()`, `prepareSwap()`, `simulateSwap()`, current prices/portfolio shapes, wallet lifecycle, policies, approvals, audit, and kill switches. Because 0.6.x is not yet published to npm, this toolkit uses a small `src/api.ts` bridge for those current production contracts instead of pretending npm users can import unpublished methods.

Once the matching SDK is released, that bridge can collapse back into SDK calls without changing the LangChain tool semantics.

## Hosted MCP alternative

If your LangChain stack already speaks MCP and you want Suwappu's broader tool surface (predictions, perps, lending, swap status/history, wallet policies, and more), connect to the hosted endpoint:

```text
https://api.suwappu.bot/mcp
```

The dedicated LangChain toolkit remains useful when you want a deliberately smaller tool allowlist and an explicit execution gate.

## Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `SUWAPPU_API_KEY` | Yes | Suwappu agent API key |
| `SUWAPPU_WALLET_ADDRESS` | No | Compatibility fallback for legacy plain-chain portfolio input |
| `SUWAPPU_MAX_INPUT_AMOUNT` | No | Quote-only raw input-unit ceiling; default 1,000,000 |
| `OPENAI_API_KEY` | Model-specific | Needed only when your chosen model integration requires it |

`SUWAPPU_MAX_INPUT_AMOUNT` is **not a USD risk control** because quote input units depend on the source token. Use wallet policies for real execution limits.

## Development

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
```

CI treats typecheck and tests as blocking quality gates.

## Links

- [Suwappu docs](https://docs.suwappu.bot)
- [Hosted MCP endpoint](https://api.suwappu.bot/mcp)
- [Suwappu SDK source](https://github.com/0xSoftBoi/suwappubot/tree/main/packages/sdk)

## License

[MIT](LICENSE)
