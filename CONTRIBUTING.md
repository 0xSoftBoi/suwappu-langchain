# Contributing

Thanks for improving the Suwappu LangChain adapter. This package is a financial-tool boundary, so behavioral safety is part of the public API.

## Local release gate

Use Node.js 20 or 24 and a clean install:

```bash
npm ci
npm run verify
npm audit --audit-level=high
```

`npm run verify` must keep typecheck, behavioral tests, the compiled ESM/declaration build, and the packed clean-consumer test green.

## Authority invariants

Changes must preserve these rules:

- The default toolset must not expose managed execution.
- Managed execution requires both `enableManagedExecution: true` and a host-controlled `approveManagedExecution` callback. Model or prompt text cannot grant that authority.
- The approval callback returns a durable idempotency key for an already-approved economic intent. Do not generate a fresh timestamp/key when retrying.
- A transport failure, HTTP 5xx, or otherwise ambiguous managed-execution response is outcome-unknown. Reconcile with swap status/history before retrying the same intent with the same key.
- Self-custody preparation remains unsigned; signing and submission stay in the caller's wallet boundary.
- Do not remove request deadlines, critical response validation, typed transport/protocol failures, or metadata-only telemetry without replacing the protection explicitly.

A new Suwappu tool needs a structured schema, documented authority class, failure semantics, behavioral tests, and README/operations coverage in the same change.

## Pull requests

Keep changes narrow and include:

- the customer/developer behavior being changed;
- tests for success and relevant failure/authority paths;
- migration notes when schemas, exports, defaults, or authority change;
- changelog updates for externally meaningful behavior; and
- no credentials, wallet material, customer prompts, raw response bodies, or production identifiers in fixtures/logs.

CI is the release evidence: Node 20/24 verification, dependency audit, packed-consumer verification, and CodeQL must pass before merge.

Security-sensitive findings should follow [SECURITY.md](SECURITY.md), not a public issue.
