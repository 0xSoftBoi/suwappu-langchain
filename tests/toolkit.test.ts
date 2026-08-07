import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SuwappuToolkit } from "../src/toolkit.js";

const DEFAULT_TOOL_NAMES = [
  "suwappu_get_quote",
  "suwappu_simulate_swap",
  "suwappu_prepare_swap",
  "suwappu_get_portfolio",
  "suwappu_get_prices",
  "suwappu_list_chains",
  "suwappu_list_tokens",
  "suwappu_get_swap_status",
  "suwappu_get_swap_history",
];

describe("SuwappuToolkit execution boundary", () => {
  it("exposes nine schema-defined, non-broadcast tools by default", () => {
    const tools = new SuwappuToolkit({ apiKey: "suwappu_sk_test" }).getTools();

    assert.deepEqual(
      tools.map((tool) => tool.name),
      DEFAULT_TOOL_NAMES,
    );
    for (const tool of tools) {
      assert.ok(tool.schema, `${tool.name} should expose an input schema`);
    }
    assert.ok(!tools.some((tool) => tool.name === "suwappu_execute_swap"));
  });

  it("refuses to expose live execution without a host approval callback", () => {
    assert.throws(
      () =>
        new SuwappuToolkit({
          apiKey: "suwappu_sk_test",
          enableManagedExecution: true,
        }),
      /approveManagedExecution is required/,
    );
  });

  it("adds live execution only when both opt-in and approval callback are present", () => {
    const tools = new SuwappuToolkit({
      apiKey: "suwappu_sk_test",
      enableManagedExecution: true,
      approveManagedExecution: async () => ({ idempotencyKey: "intent:approved" }),
    }).getTools();

    assert.deepEqual(tools.map((tool) => tool.name), [
      ...DEFAULT_TOOL_NAMES,
      "suwappu_execute_swap",
    ]);
  });
});
