import { Tool } from "@langchain/core/tools";
import type { SuwappuClient } from "@suwappu/sdk";
import { SuwappuApi } from "../api.js";

export class SuwappuPricesTool extends Tool {
  name = "suwappu_get_prices";
  description =
    'Get current USD prices and 24h changes. Input: a symbol or comma-separated symbols (for example "ETH,SOL"), or JSON {"symbols":"ETH,SOL","chain":"base"}.';

  private readonly api: SuwappuApi;

  constructor(_client: SuwappuClient, api = new SuwappuApi()) {
    super();
    this.api = api;
  }

  async _call(input: string): Promise<string> {
    try {
      let symbols = "";
      let chain: string | undefined;

      try {
        const parsed = JSON.parse(input) as {
          symbols?: string;
          token?: string;
          chain?: string;
        };
        symbols = parsed.symbols ?? parsed.token ?? "";
        chain = parsed.chain;
      } catch {
        symbols = input.trim();
      }

      if (!symbols) return JSON.stringify({ error: "Missing token symbol(s)." });

      return JSON.stringify(await this.api.getPrices(symbols, chain));
    } catch (error) {
      return JSON.stringify({
        error: `Failed to get prices: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
