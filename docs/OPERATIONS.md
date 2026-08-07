# Operating the LangChain Adapter in Production

This document is the deployment contract for teams running `@suwappu/langchain-suwappu` as part of a customer-facing service. The adapter is a library, not a hosted control plane: your application owns tenancy, secrets, approvals, persistence, queues, customer billing, alerting, and incident response.

The operating principle is simple: model reasoning may propose an action, but deterministic application state decides whether money can move.

## Service boundary

Treat these as separate layers:

| Layer | Owns | Must not own |
|---|---|---|
| Model / LangChain | Intent interpretation, explanations, tool selection | Approval truth, durable idempotency, accounting truth |
| This adapter | Typed tool schemas, Agent API transport, safe default tool allowlist | Customer identity, secrets persistence, auto-retry policy |
| Your control plane | Tenancy, approvals, policy state, intent ledger, queues, billing | Private keys it does not need |
| Suwappu Agent API | Quotes, simulation, managed execution, managed-swap records | Your customer-revenue ledger |
| Wallet / signer | Self-custody signing when used | Model-generated approval state |

For a multi-tenant product, scope an Agent API credential to the appropriate service/customer boundary. Never put a Suwappu key in prompts, tool descriptions, browser bundles, analytics properties, or model-visible state.

## Runtime configuration

The toolkit exposes explicit transport controls:

```ts
import { SuwappuToolkit } from "@suwappu/langchain-suwappu";

const toolkit = new SuwappuToolkit({
  apiKey: process.env.SUWAPPU_API_KEY!,
  requestTimeoutMs: 15_000,
  onApiEvent(event) {
    metrics.histogram("suwappu_api_duration_ms", event.durationMs, {
      method: event.method,
      path: event.path,
      outcome: event.outcome,
      status: String(event.status ?? "transport"),
    });
  },
});
```

Defaults and invariants:

- request timeout defaults to 30 seconds;
- the telemetry hook receives method/path/status/outcome/duration/request id only, with dynamic route ids normalized (for example `/swap/status/:id`);
- authorization headers and request bodies are never included in telemetry events;
- a broken telemetry callback cannot fail the business request;
- a custom `fetch` implementation can be supplied for a service mesh, egress proxy, tracing wrapper, or deterministic test;
- the adapter performs **no automatic request retries**.

Keep the timeout below the timeout imposed by your outer worker/load balancer so the application receives enough time to classify and persist the result.

## Error contract

Catch errors by type, not by parsing message text:

```ts
import {
  SuwappuApiError,
  SuwappuProtocolError,
  SuwappuTransportError,
} from "@suwappu/langchain-suwappu";

try {
  // invoke a tool or the low-level bridge
} catch (error) {
  if (error instanceof SuwappuApiError) {
    // error.status, error.code, error.requestId, error.retryAfterMs
  } else if (error instanceof SuwappuTransportError) {
    // error.kind is "timeout" or "network_error"
  } else if (error instanceof SuwappuProtocolError) {
    // successful HTTP response did not satisfy the JSON transport contract
  }
}
```

`requestId` is copied from `x-request-id` or `x-correlation-id` when the API supplies one. Preserve it in structured logs and support tickets. HTTP error bodies are bounded before entering error messages so an unexpected upstream body cannot flood logs.

For HTTP `429`, `retryAfterMs` is derived from `Retry-After` when the header is present. A retry is still a host policy decision.

Critical lifecycle responses (quote, simulation, managed execution, status, and history) also enforce their minimal required fields at runtime. A JSON-shaped HTTP 200 that is missing those fields raises `SuwappuProtocolError`; it is not counted as a successful request. A malformed response from managed execution is outcome-unknown because the side effect may already have occurred.

## Retry matrix

Do not apply one generic retry wrapper around the toolset.

| Operation | Money moves? | Retry policy |
|---|---:|---|
| chains / tokens / prices / portfolio | No | Retry transient failures with capped exponential backoff + jitter |
| quote | No | A new quote is acceptable; respect rate limits and quote freshness |
| simulate | No | Retry only while the referenced quote remains valid; otherwise re-quote |
| prepare unsigned swap | No broadcast | Re-prepare from a fresh quote when necessary; the caller still owns signing |
| managed execute | **Yes** | **Never blindly retry timeout/network/5xx**; mark outcome unknown and reconcile first |
| status / history | No | Safe to retry transient failures with backoff |

For managed execution, persist the business intent and its idempotency key before submission. If the outcome is unknown, search status/history or consume your signed webhook ledger. Reuse the same key only if reconciliation shows a retry is actually required.

## Minimum persistent state

For each live managed intent, store at least:

- tenant/customer id;
- immutable intent id (also the idempotency identity);
- strategy/workflow version;
- quote id + expiry;
- simulation result and timestamp;
- policy/approval result and actor/source;
- submission attempt timestamps;
- returned `swap_id` / transaction hash when known;
- `outcome_unknown` state when applicable;
- reconciled terminal state;
- realized costs used by your accounting ledger.

Do not reconstruct approval or idempotency from a chat transcript after a restart.

## Observability

The API hook is intentionally small so it can feed OpenTelemetry, Datadog, Prometheus, or your existing metrics layer without a product-specific dependency.

At minimum, dashboard:

- Agent API request count/latency/error outcome by stable route;
- HTTP 401/403 separately from 429 and 5xx;
- tool invocation + validation failure counts;
- quote-to-simulation and simulation-to-approved conversion;
- managed executions submitted / rejected / outcome-unknown;
- reconciliation lag and terminal success/failure;
- stale quote / policy denial counts;
- per-customer Suwappu + model + infrastructure cost;
- deployed adapter version and application commit.

Do not use wallet addresses, quote ids, transaction hashes, or customer ids as unbounded metric labels. Keep those in access-controlled structured logs or traces.

## SLOs and alerts

Set SLOs from the customer promise, not from a demo. Useful indicators include:

- read/quote availability;
- p50/p95/p99 Agent API latency;
- percentage of live intents reaching a reconciled terminal state;
- time spent in `outcome_unknown`;
- approval-to-submission delay versus quote expiry;
- percentage of runs that required operator intervention.

Page an operator for stuck or outcome-unknown money-moving intents. A read-only portfolio refresh failure can generally be a lower-severity retry/queue event.

## Capacity and rate limits

Never turn the published per-minute tier limit into your own concurrency setting. Your workload has bursts, model fan-out, retries, and multiple tools per customer action.

Use a tenant-aware queue or limiter:

1. reserve budget for reconciliation/status calls;
2. bound model parallelism so it cannot fan out unbounded tool calls;
3. honor `429` and `retryAfterMs`;
4. prioritize safety/reconciliation traffic over background analytics;
5. meter your own per-customer usage so one tenant cannot consume the whole Agent API budget.

Read current Suwappu billing/rate-limit documentation rather than hardcoding an old tier into the product.

## Model and tool evaluations

Unit tests are necessary but insufficient for an agent product. Before changing the model, prompt, or exposed tools, keep a regression set that verifies at least:

- ambiguous financial requests ask for missing chain/token/wallet inputs;
- read-only requests never call the managed execution tool;
- self-custody preparation is never described as broadcast;
- managed execution is absent unless the host enabled it;
- prompt text cannot manufacture application approval;
- malformed tool arguments are rejected by schemas;
- an execution transport/5xx failure produces reconciliation behavior, not a fresh intent;
- tool output is not treated as trusted prompt instruction.

Run these evaluations against every model/provider version you promote. Keep live-capital evaluation separate from offline model benchmarking.

## Secrets and tenancy

- Store Agent API credentials in your server-side secret manager.
- Rotate on suspected exposure and audit where the old credential was used.
- Never forward credentials to the model provider or client browser.
- Separate development/staging/production credentials.
- Apply least-privilege service identity to the database holding approvals and intent state.
- Redact authorization headers and sensitive customer state before logs leave the service boundary.

The adapter's `onApiEvent` hook cannot see request bodies or authorization headers by design.

## Deployment and release discipline

- Pin an intentional package range in your application lockfile.
- Run the application evaluation suite before dependency promotion.
- Record adapter and LangChain versions with each deployment.
- Deploy schema/tool-surface changes behind a staged rollout when agents are already in production.
- Keep one-step rollback to the previous package/application artifact.
- Do not enable managed execution as part of an unrelated dependency upgrade.

This repository's CI verifies Node 20 and 24, behavioral tests, TypeScript declarations, and the exact packed npm artifact in a clean consumer. Publishing is gated by the same verification path and provenance-capable GitHub Actions workflow.

## Incident runbook

If a production incident might involve money movement:

1. disable new managed-execution admission in your application;
2. preserve reconciliation/status traffic;
3. identify all intents in submitted/outcome-unknown/non-terminal states;
4. reconcile each against Suwappu records and, where applicable, chain state;
5. do not create replacement intents until the prior outcome is known;
6. preserve request ids, application intent ids, approvals, and deploy versions for the incident record;
7. rotate credentials if compromise is plausible;
8. communicate only reconciled facts to customers;
9. write the corrective test/control before restoring full live authority.

For account-level policy, audit, webhook, key-management, and kill-switch controls, use the main Suwappu SDK/REST surface documented at [suwappu.bot/docs](https://suwappu.bot/docs).

## Enterprise readiness is not certification

These controls make the integration operable as a production component; they do not themselves provide SOC 2, ISO 27001, PCI, broker/dealer, investment-adviser, custody, money-transmission, or other legal/compliance status. A customer-facing financial product must assess the obligations created by its specific users, jurisdictions, custody model, and promises.
