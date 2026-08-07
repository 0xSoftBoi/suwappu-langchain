import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SuwappuApi,
  SuwappuApiError,
  SuwappuProtocolError,
  SuwappuTransportError,
  type SuwappuApiEvent,
} from "../src/api.js";
import {
  SuwappuExecuteSwapTool,
  SuwappuGetQuoteTool,
} from "../src/tools/swap.js";
import { SuwappuSwapHistoryTool, SuwappuSwapStatusTool } from "../src/tools/status.js";

function jsonResponse(
  body: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("enterprise transport contract", () => {
  it("emits metadata-only success telemetry with request correlation", async () => {
    const events: SuwappuApiEvent[] = [];
    const fetchImpl = (async () =>
      jsonResponse(
        { chains: [] },
        200,
        { "x-request-id": "req_123" },
      )) as typeof globalThis.fetch;
    const api = new SuwappuApi({
      apiKey: "suwappu_sk_do_not_emit",
      fetch: fetchImpl,
      onEvent: (event) => events.push(event),
    });

    await api.listChains();

    assert.equal(events.length, 1);
    assert.equal(events[0].method, "GET");
    assert.equal(events[0].path, "/v1/agent/chains");
    assert.equal(events[0].outcome, "success");
    assert.equal(events[0].status, 200);
    assert.equal(events[0].requestId, "req_123");
    assert.ok(events[0].durationMs >= 0);
    assert.ok(!JSON.stringify(events[0]).includes("suwappu_sk_do_not_emit"));
  });

  it("surfaces typed HTTP error metadata and does not let telemetry sinks break requests", async () => {
    const fetchImpl = (async () =>
      jsonResponse(
        { error: "rate limited", error_code: "RATE_LIMITED" },
        429,
        { "x-correlation-id": "corr_456", "retry-after": "2" },
      )) as typeof globalThis.fetch;
    const api = new SuwappuApi({
      apiKey: "suwappu_sk_test",
      fetch: fetchImpl,
      onEvent: () => {
        throw new Error("broken metrics backend");
      },
    });

    await assert.rejects(api.listChains(), (error) => {
      assert.ok(error instanceof SuwappuApiError);
      assert.equal(error.status, 429);
      assert.equal(error.code, "RATE_LIMITED");
      assert.equal(error.requestId, "corr_456");
      assert.equal(error.retryAfterMs, 2_000);
      return true;
    });
  });

  it("turns request deadlines into typed timeout errors", async () => {
    const events: SuwappuApiEvent[] = [];
    const fetchImpl = ((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      })) as typeof globalThis.fetch;
    const api = new SuwappuApi({
      apiKey: "suwappu_sk_test",
      fetch: fetchImpl,
      timeoutMs: 5,
      onEvent: (event) => events.push(event),
    });

    await assert.rejects(api.listChains(), (error) => {
      assert.ok(error instanceof SuwappuTransportError);
      assert.equal(error.kind, "timeout");
      return true;
    });
    assert.equal(events.at(-1)?.outcome, "timeout");
  });

  it("distinguishes network transport failure from HTTP failure", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("socket closed");
    }) as typeof globalThis.fetch;
    const api = new SuwappuApi({ apiKey: "suwappu_sk_test", fetch: fetchImpl });

    await assert.rejects(api.listChains(), (error) => {
      assert.ok(error instanceof SuwappuTransportError);
      assert.equal(error.kind, "network_error");
      return true;
    });
  });

  it("fails closed on malformed success payloads", async () => {
    const events: SuwappuApiEvent[] = [];
    const fetchImpl = (async () =>
      new Response("not-json", {
        status: 200,
        headers: { "x-request-id": "req_bad_json" },
      })) as typeof globalThis.fetch;
    const api = new SuwappuApi({
      apiKey: "suwappu_sk_test",
      fetch: fetchImpl,
      onEvent: (event) => events.push(event),
    });

    await assert.rejects(api.listChains(), (error) => {
      assert.ok(error instanceof SuwappuProtocolError);
      assert.equal(error.requestId, "req_bad_json");
      return true;
    });
    assert.equal(events.at(-1)?.outcome, "protocol_error");
    assert.ok(!events.some((event) => event.outcome === "success"));
  });

  it("normalizes dynamic status paths before emitting metric labels", async () => {
    const events: SuwappuApiEvent[] = [];
    const fetchImpl = (async () =>
      jsonResponse({ swap_id: 4812, status: "pending" })) as typeof globalThis.fetch;
    const api = new SuwappuApi({
      apiKey: "suwappu_sk_test",
      fetch: fetchImpl,
      onEvent: (event) => events.push(event),
    });

    await api.getSwapStatus(4812);

    assert.equal(events[0].path, "/v1/agent/swap/status/:id");
    assert.ok(!JSON.stringify(events[0]).includes("4812"));
  });
});

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
      tool.invoke({ from_token: "ETH", to_token: "USDC", amount: -1, chain: "base" }),
    );
    assert.equal(called, false);
  });

  it("requires explicit same-chain or complete cross-chain routing context", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return jsonResponse({});
    }) as typeof globalThis.fetch;
    const tool = new SuwappuGetQuoteTool(
      new SuwappuApi({ apiKey: "suwappu_sk_test", fetch: fetchImpl }),
    );

    await assert.rejects(
      tool.invoke({ from_token: "ETH", to_token: "USDC", amount: 1 }),
      /Provide chain/,
    );
    await assert.rejects(
      tool.invoke({
        from_token: "USDC",
        to_token: "ETH",
        amount: 100,
        from_chain: "arbitrum",
      }),
      /both from_chain and to_chain/,
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

  it("treats HTTP 408 execution timeout as outcome-unknown", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ error: "request timeout" }, 408)) as typeof globalThis.fetch;
    const tool = new SuwappuExecuteSwapTool(
      new SuwappuApi({ apiKey: "suwappu_sk_test", fetch: fetchImpl }),
      async () => ({ idempotencyKey: "intent:408" }),
    );

    const result = JSON.parse(await tool.invoke({ quote_id: "quote_408" }));

    assert.equal(result.outcome, "unknown");
    assert.match(result.next_step, /reconcile/i);
  });

  it("treats a malformed managed-execution success payload as outcome-unknown", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ success: true })) as typeof globalThis.fetch;
    const tool = new SuwappuExecuteSwapTool(
      new SuwappuApi({ apiKey: "suwappu_sk_test", fetch: fetchImpl }),
      async () => ({ idempotencyKey: "intent:bad-response" }),
    );

    const result = JSON.parse(await tool.invoke({ quote_id: "quote_bad_response" }));

    assert.equal(result.outcome, "unknown");
    assert.match(result.error, /response contract failed/i);
    assert.match(result.next_step, /reconcile/i);
  });
});

describe("managed swap reconciliation", () => {
  it("maps status and history tools to read-only endpoints", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/swap/status/")) {
        return jsonResponse({ success: true, swap_id: 4812, status: "completed" });
      }
      return jsonResponse({ success: true, swaps: [] });
    }) as typeof globalThis.fetch;
    const api = new SuwappuApi({ apiKey: "suwappu_sk_test", fetch: fetchImpl });

    const status = JSON.parse(await new SuwappuSwapStatusTool(api).invoke({ swap_id: 4812 }));
    const history = JSON.parse(
      await new SuwappuSwapHistoryTool(api).invoke({ status: "pending", limit: 10, offset: 0 }),
    );

    assert.deepEqual(calls, [
      "https://api.suwappu.bot/v1/agent/swap/status/4812",
      "https://api.suwappu.bot/v1/agent/swaps?status=pending&limit=10&offset=0",
    ]);
    assert.equal(status.status, "completed");
    assert.deepEqual(history.swaps, []);
  });
});
