# Build a LangChain Product on Suwappu

The LangChain adapter is most valuable when it becomes a narrow action layer inside a product customers understand and pay for. The model is not the product by itself: your product owns the workflow, state, approvals, customer experience, and economics.

This guide uses a portfolio copilot as the running example, but the same structure works for DCA, rebalancing, reporting, or market-intelligence products.

## Start with the customer promise

Pick a promise you can measure without promising investment returns.

Good examples:

- "Tell me when my allocation leaves my target bands and explain the cheapest route back."
- "Run my approved DCA schedule and give me a reconciled monthly report."
- "Watch these wallets and send a portfolio/risk summary when exposure changes."

Avoid a promise such as "this agent will make 8% a month." Strategy performance is uncertain; operational value, time saved, controls, and reporting are things you can actually deliver.

## Choose the minimum authority

| Product | Suwappu authority needed | Sensible first paid feature |
|---|---|---|
| Portfolio copilot | Read + quote | Monitoring, custom bands, alerts, saved reports |
| Rebalance assistant | Read + quote + simulate + unsigned prepare | Approved rebalance plans and wallet handoff |
| Managed automation | Read + quote + simulate + managed execution + reconciliation | Scheduled, policy-capped execution and reporting |
| Market intelligence | Read/quote only | Custom rules, lower-latency alerts, exports/webhooks |

If a customer will pay for the read-only product, do not add custody just to make the demo look impressive.

## Use one explicit lifecycle

Anything that can lead to a transaction should move through application state in this order:

```text
observe -> decide -> quote -> simulate -> approve/policy -> act -> reconcile
```

The LangChain model can help with `decide`, but the irreversible boundary should be deterministic application code.

For managed execution, `approveManagedExecution` is that boundary:

```ts
const tools = new SuwappuToolkit({
  apiKey: customer.agentKey,
  enableManagedExecution: true,
  approveManagedExecution: async ({ quoteId }) => {
    const intent = await intents.loadByQuoteId(quoteId);

    if (!intent) throw new Error("unknown intent");
    if (intent.mode !== "live") throw new Error("not a live intent");
    if (!intent.simulationPassed) throw new Error("simulation not recorded");
    if (!intent.approvedAt) throw new Error("approval missing");
    if (intent.policyDecision !== "allow") throw new Error("policy denied");

    return { idempotencyKey: intent.id };
  },
}).getTools();
```

The model cannot manufacture `intent.approvedAt` by saying the user approved in chat. Your database/UI/policy system owns that fact.

## Persist intent before side effects

A useful intent record is boring and durable:

```ts
type TradeIntent = {
  id: string;                 // stable idempotency identity
  customerId: string;
  strategyVersion: string;
  mode: "paper" | "live";
  decisionAt: string;
  quoteId: string;
  quoteExpiresAt: string;
  expectedOutput: string;
  minimumOutput: string;
  estimatedGasUsd: string;
  estimatedBridgeFeeUsd: string;
  simulationPassed: boolean;
  approvedAt: string | null;
  policyDecision: "allow" | "deny";
  swapId: number | null;
  txHash: string | null;
  finalStatus: string | null;
};
```

Do not generate a new idempotency key from `Date.now()` when calling execute. If a timeout occurs, that turns one intended trade into two different economic actions.

## Treat outcome-unknown as a state

Reads can usually retry with backoff. A money-moving timeout is different.

When the execute request fails due to a network error or 5xx:

1. mark the intent `outcome_unknown`;
2. do not create a replacement intent;
3. inspect managed swap status/history (or your webhook ledger);
4. if a retry is actually needed, reuse the intent's same idempotency key;
5. update customer-visible state only from reconciled results.

The adapter's execution tool reports this distinction and the default toolset includes `suwappu_get_swap_status` and `suwappu_get_swap_history` so an agent can assist with reconciliation without receiving new execution authority.

## Keep the agent small

Current LangChain favors schema-defined tools. Use those schemas as an allowlist, not as a reason to expose every API operation to every agent.

For a portfolio copilot, start with the nine default tools. If the user only wants intelligence, you may narrow that list further:

```ts
const researchTools = new SuwappuToolkit({ apiKey }).getTools().filter((tool) =>
  [
    "suwappu_get_portfolio",
    "suwappu_get_prices",
    "suwappu_list_chains",
    "suwappu_list_tokens",
    "suwappu_get_quote",
  ].includes(tool.name),
);
```

This reduces accidental tool use, simplifies evaluations, and makes the authority story easy to explain to a customer.

## Build the paid portfolio-copilot loop

### Free / acquisition loop

1. User supplies a wallet address.
2. Read the portfolio.
3. Compute allocation and concentration deterministically.
4. Let the model explain the report.
5. Offer saved target bands and monitoring as the paid upgrade.

The model should not calculate accounting values that application code can calculate exactly.

### Paid monitoring loop

1. Scheduler loads the saved target policy.
2. Fetch portfolio/prices.
3. Compute drift.
4. If inside the band, persist `hold` and stop.
5. If outside, request a fresh quote for the smallest useful rebalance.
6. Show expected output, minimum output, route, gas/bridge estimates, and warnings.
7. Notify the customer and save the decision trail.

That product can be valuable without ever moving a customer's funds.

### Optional execution tier

Add execution only after customers ask for it and your paper path has operated reliably:

1. quote against current state;
2. simulate;
3. run spend/policy checks;
4. collect the required approval;
5. persist intent;
6. execute with the intent id as idempotency key;
7. reconcile status/webhook;
8. update the ledger from the realized result.

## Price from observed unit economics

Keep customer revenue separate from trading performance.

```text
monthly builder margin per customer
  = subscription + usage revenue + verified referral revenue
  - Suwappu/API usage
  - model calls
  - scheduler/database/queue/monitoring
  - chain costs you subsidize
  - support/refunds/credits
```

Suwappu's Agent API has independent rate-limit, metering, and route-fee dimensions. Do not hardcode a subscription tier or fee into your business model: read your current billing state and use each live quote as the execution-cost source of truth. See [Pricing](https://suwappu.bot/docs/billing/pricing).

Suwappu x402/API payments are an input cost. They are not automatically your revenue. The public Agent API also does not promise a generic builder-fee parameter. If you charge a subscription or usage fee, keep your own customer billing agreement and revenue ledger.

## Measure two scoreboards

Never use a good strategy month to hide a bad SaaS margin, or a good SaaS margin to imply a profitable strategy.

### Builder scoreboard

- active paid customers;
- revenue per customer;
- Suwappu/model/infra cost per customer;
- gross margin;
- support/refund rate;
- useful automation runs per customer;
- retention/churn.

### Customer/strategy scoreboard

- realized and unrealized P&L separately;
- execution costs and realized slippage;
- drawdown/exposure where relevant;
- rejected/skipped intents;
- simulation and execution failure rate;
- time to reconciliation.

Expected output from a quote is neither revenue nor realized P&L.

## Promote automation with evidence

Use the same decision code across four stages:

| Stage | Money moves? | Promotion evidence |
|---|---:|---|
| Historical replay | No | Reproducible inputs; cost-aware results; no look-ahead |
| Live paper | No | Real quotes/simulations; restart-safe scheduler; good decision/audit trail |
| Capped live | Yes, limited | Explicit live flag; approvals/policies; idempotency; reconciliation |
| Scaled live | Yes | Enough observed live reliability and outcome data; caps remain |

Read the cross-framework [Strategy Lifecycle](https://suwappu.bot/docs/guides/strategy-lifecycle) before unattended capital.

## Production checklist

Before taking money for the product, verify:

- every model tool has a structured schema and a deliberate allowlist;
- the default experience has no managed broadcast authority;
- quotes are fresh and wallet-bound where needed;
- simulations happen before live execution;
- application state—not prompt text—records approvals/policies;
- each intended trade has one durable idempotency key;
- network/5xx execution errors become outcome-unknown, not automatic retries;
- status/history or signed webhooks reconcile final state;
- paper/live use the same decision path;
- customer revenue and strategy P&L are separate ledgers;
- package and Agent API versions are observable in deployments;
- you have a way to stop unattended execution quickly.

For policy, audit, billing, key management, webhooks, and kill-switch APIs beyond this deliberately small adapter, use the main [`@suwappu/sdk`](https://github.com/0xSoftBoi/suwappubot/tree/main/packages/sdk) or REST API. The full documentation starts at [suwappu.bot/docs](https://suwappu.bot/docs).

> This is product/engineering guidance, not a guarantee of returns or legal/compliance advice. Financial-advice, custody, or regulated-user products may create obligations beyond the technical controls described here.
