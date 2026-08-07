import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SuwappuApi } from "../src/api.js";
import {
  SuwappuExecuteSwapTool,
  SuwappuGetQuoteTool,
} from "../src/tools/swap.js";
import { SuwappuSwapHistoryTool, SuwappuSwapStatusTool } from "../src/tools/status.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("structured LangChain tools", () => {
  it("sends a cross-chain, wallet-bound quote with structured arguments", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return jsonResponse({ quote_id: "quote_1", estimated_gas_usd: "$0.04" });
    }) as typeof globalThis.fetch;
    const api = new SuwappuApi({ apiKey: "suwappu_sk_test", fetch: fetchImpl });
    const tool = new SuwappuGetQuoteTool(api);

    const result = JSON.parse(
      await tool.invoke({
        from_token: "USDC",
        to_token: "ETH",
        amount: 100,
        from_chain: "arbitrum",
        to_chain: "base",
        wallet_address: "0x1234",
        slippage: 0.02,
      }),
    );

    assert.equal(result.quote_id, "quote_1");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.suwappu.bot/v1/agent/quote");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      from_token: "USDC",
      to_token: "ETH",
      amount: "100",
      from_chain: "arbitrum",
      to_chain: "base",
      wallet_address: "0x1234",
      slippage: 0.02,
    });
  });

  it("rejects invalid quote arguments before making a request", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse({});
    }) as typeof globalThis.fetch;
    const tool = new SuwappuGetQuoteTool(
      new SuwappuApi({ apiKey: "suwappu_sk_test", fetch: fetchImpl }),
    );

    await assert.rejects(
      tool.invoke({ from_token: "ETH", to_token: "USDC", amount: -1 }),
    );
    assert.equal(called, false);
  });
});

describe("managed execution contract", () => {
  it("gets host approval and sends its durable idempotency key", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const approved: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return jsonResponse({ swap_id: 4812, status: "pending" });
    }) as typeof globalThis.fetch;
    const api = new SuwappuApi({ apiKey: "suwappu_sk_test", fetch: fetchImpl });
    const tool = new SuwappuExecuteSwapTool(api, async ({ quoteId }) => {
      approved.push(quoteId);
      return { idempotencyKey: "rebalance:account-7:2026-08-06" };
    });

    const result = JSON.parse(await tool.invoke({ quote_id: "quote_approved" }));

    assert.equal(result.swap_id, 4812);
    assert.deepEqual(approved, ["quote_approved"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.suwappu.bot/v1/agent/swap/execute");
    assert.equal(
      new Headers(calls[0].init?.headers).get("Idempotency-Key"),
      "rebalance:account-7:2026-08-06",
    );
  });

  it("fails closed when approval rejects", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse({});
    }) as typeof globalThis.fetch;
    const tool = new SuwappuExecuteSwapTool(
      new SuwappuApi({ apiKey: "suwappu_sk_test", fetch: fetchImpl }),
      async () => {
        throw new Error("human approval missing");
      },
    );

    const result = JSON.parse(await tool.invoke({ quote_id: "quote_denied" }));

    assert.equal(result.outcome, "rejected");
    assert.match(result.error, /human approval missing/);
    assert.equal(called, false);
  });

  it("fails closed on an invalid idempotency key", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse({});
    }) as typeof globalThis.fetch;
    const tool = new SuwappuExecuteSwapTool(
      new SuwappuApi({ apiKey: "suwappu_sk_test", fetch: fetchImpl }),
      async () => ({ idempotencyKey: "contains spaces" }),
    );

    const result = JSON.parse(await tool.invoke({ quote_id: "quote_bad_key" }));

    assert.equal(result.outcome, "rejected");
    assert.match(result.error, /invalid idempotency key/i);
    assert.equal(called, false);
  });

  it("marks network and 5xx execution failures outcome-unknown", async () => {
    const fetchImpl = (async () => jsonResponse({ error: "upstream" }, 503)) as typeof globalThis.fetch;
    const tool = new SuwappuExecuteSwapTool(
      new SuwappuApi({ apiKey: "suwappu_sk_test", fetch: fetchImpl }),
      async () => ({ idempotencyKey: "intent:42" }),
    );

    const result = JSON.parse(await tool.invoke({ quote_id: "quote_42" }));

    assert.equal(result.outcome, "unknown");
    assert.match(result.next_step, /reconcile/i);
    assert.match(result.next_step, /same durable idempotency key/i);
  });
});

describe("managed swap reconciliation", () => {
  it("maps status and history tools to read-only endpoints", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse({ success: true });
    }) as typeof globalThis.fetch;
    const api = new SuwappuApi({ apiKey: "suwappu_sk_test", fetch: fetchImpl });

    await new SuwappuSwapStatusTool(api).invoke({ swap_id: 4812 });
    await new SuwappuSwapHistoryTool(api).invoke({ status: "pending", limit: 10, offset: 0 });

    assert.deepEqual(calls, [
      "https://api.suwappu.bot/v1/agent/swap/status/4812",
      "https://api.suwappu.bot/v1/agent/swaps?status=pending&limit=10&offset=0",
    ]);
  });
});
