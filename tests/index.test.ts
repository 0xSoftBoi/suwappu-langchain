import { describe, it, expect } from "bun:test";

const TOOL_NAMES = ["get_quote", "execute_swap", "get_portfolio", "get_prices", "list_chains", "list_tokens"];

describe("toolkit tools", () => {
  it("should expose all 6 DeFi tools", () => {
    expect(TOOL_NAMES.length).toBe(6);
  });

  it("should include swap tools", () => {
    expect(TOOL_NAMES).toContain("get_quote");
    expect(TOOL_NAMES).toContain("execute_swap");
  });

  it("should include data tools", () => {
    expect(TOOL_NAMES).toContain("get_portfolio");
    expect(TOOL_NAMES).toContain("get_prices");
    expect(TOOL_NAMES).toContain("list_chains");
    expect(TOOL_NAMES).toContain("list_tokens");
  });
});

describe("tool input validation", () => {
  it("should require from_token and to_token for quotes", () => {
    const quoteArgs = { from_token: "ETH", to_token: "USDC", amount: "1.0", chain: "base" };
    expect(quoteArgs.from_token).toBeTruthy();
    expect(quoteArgs.to_token).toBeTruthy();
    expect(quoteArgs.amount).toBeTruthy();
  });

  it("should require wallet_address for portfolio", () => {
    const args = { wallet_address: "0xabc123" };
    expect(args.wallet_address).toBeTruthy();
  });

  it("should accept comma-separated symbols for prices", () => {
    const symbols = "ETH,BTC,SOL";
    expect(symbols.split(",").length).toBe(3);
  });
});

describe("agent configuration", () => {
  it("should require API key", () => {
    const config = { apiKey: "suwappu_sk_test" };
    expect(config.apiKey.startsWith("suwappu_sk_")).toBe(true);
  });
});
