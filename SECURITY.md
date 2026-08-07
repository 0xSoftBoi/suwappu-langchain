# Security Policy

This repository is the standalone LangChain integration for the
[Suwappu Agent API](https://github.com/0xSoftBoi/suwappubot). Its default toolset
cannot broadcast managed-wallet transactions. Hosts can explicitly enable a
money-moving execution tool, so treat the package, API keys, approval state,
and application configuration as security-sensitive.

## Reporting a vulnerability

**Do not open a public issue for security reports.** Instead:

- Use **GitHub Private Vulnerability Reporting** when it is enabled for this repository, or
- Email **security@suwappu.bot**.

Please include the affected file, version or commit, reproduction steps, and an
impact assessment.

**Scope note:** issues in this repository's own code, SDK usage, dependencies,
or CI belong here. Vulnerabilities in the Suwappu API, core bot, smart
contracts, custody/key-management layer, or shared SDK should be reported
upstream through the
[core security policy](https://github.com/0xSoftBoi/suwappubot/security/policy).

## Custody and execution model

The default toolkit exposes read, quote, simulation, unsigned self-custody
preparation, and managed-swap reconciliation only. `suwappu_execute_swap` is
added only when the host sets `enableManagedExecution: true` and supplies an
`approveManagedExecution` callback. That callback executes in host application
code and must return a durable idempotency key.

Prompt text is not an approval boundary. A model must not be able to create or
modify the database state that the approval callback trusts without a separate
authorization control.

For a transport/timeout/5xx failure during managed execution, treat the outcome
as unknown and reconcile managed swap records before any retry. Do not place a
generic retry wrapper around the execution tool.

## Secret and telemetry boundary

- Never expose `SUWAPPU_API_KEY` in model-visible state, prompts, client-side bundles, logs, or analytics.
- The `onApiEvent` callback receives request metadata only; the adapter does not put authorization headers or request bodies in those events.
- A custom `fetch` implementation is part of the trusted computing base. Review any proxy/tracing wrapper for header/body logging before production use.
- Keep development, staging, and production credentials separate and rotate on suspected exposure.

See [Production Operations](docs/OPERATIONS.md) for tenancy, observability,
rate-limit, deployment, and incident-response guidance.

## Our commitment

- **Acknowledge** reports within 3 business days.
- **Triage and severity** within 7 business days.
- **Coordinate disclosure** with the reporter and provide credit unless
  anonymity is requested.

## Safe harbor

Good-faith research conducted under this policy, without privacy violations,
data destruction, or service degradation, will not result in legal action from
us. If in doubt, contact us before testing.
