import { describe, expect, test } from "bun:test";
import { SuwappuToolkit } from "../src/toolkit.js";

describe("SuwappuToolkit execution boundary", () => {
  test("managed execution is absent by default", () => {
    const names = new SuwappuToolkit({ apiKey: "suwappu_sk_test" })
      .getTools()
      .map((tool) => tool.name);

    expect(names).toContain("suwappu_get_quote");
    expect(names).toContain("suwappu_simulate_swap");
    expect(names).toContain("suwappu_prepare_swap");
    expect(names).not.toContain("suwappu_execute_swap");
  });

  test("managed execution requires explicit opt-in", () => {
    const names = new SuwappuToolkit({
      apiKey: "suwappu_sk_test",
      enableManagedExecution: true,
    })
      .getTools()
      .map((tool) => tool.name);

    expect(names).toContain("suwappu_execute_swap");
  });
});
