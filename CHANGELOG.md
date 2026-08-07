# Changelog

## 0.2.0

- Move the adapter to LangChain 1.x `createAgent` and schema-defined tools.
- Add cross-chain/wallet-bound quote inputs and managed swap status/history tools.
- Keep managed execution absent by default and require a host approval callback plus durable idempotency key when enabled.
- Distinguish outcome-unknown execution failures and direct callers to reconcile before retrying.
- Publish compiled ESM/declarations and verify the tarball in a clean Node consumer.
- Add a builder-focused product/economics guide and canonical `suwappu.bot/docs` links.
