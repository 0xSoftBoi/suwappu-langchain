# Changelog

## Unreleased

- Add a blocking high/critical dependency audit to CI.
- Add CodeQL analysis for the JavaScript/TypeScript adapter.
- Document contributor release gates and non-negotiable authority/idempotency invariants.

## 0.2.0

- Move the adapter to LangChain 1.x `createAgent` and schema-defined tools.
- Add cross-chain/wallet-bound quote inputs and managed swap status/history tools.
- Keep managed execution absent by default and require a host approval callback plus durable idempotency key when enabled.
- Distinguish outcome-unknown execution failures and direct callers to reconcile before retrying.
- Publish compiled ESM/declarations and verify the tarball in a clean Node consumer.
- Add a builder-focused product/economics guide and canonical `suwappu.bot/docs` links.
- Add bounded Agent API request deadlines, typed transport/protocol errors, critical response validation, correlation metadata, and `Retry-After` parsing.
- Add a metadata-only API telemetry hook plus custom transport configuration for production control planes.
- Add an enterprise operations guide covering tenancy, retries, observability/SLOs, capacity, evaluation gates, deployment, and incident response.
