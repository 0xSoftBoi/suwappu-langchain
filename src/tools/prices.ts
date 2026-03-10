import { Tool } from "@langchain/core/tools";
import type { SuwappuClient } from "@suwappu/sdk";

export class SuwappuPricesTool extends Tool {
  name = "suwappu_get_prices";
  description =
    "Get current token prices in USD. Input: token symbol (e.g. \"ETH\", \"USDC\"). Optionally include chain as JSON: {\"token\": \"ETH\", \"chain\": \"arbitrum\"}.";

  private client: SuwappuClient;

  constructor(client: SuwappuClient) {
    super();
    this.client = client;
  }

  async _call(input: string): Promise<string> {
    try {
      let token: string;
      let chain: string | undefined;

      try {
        const parsed = JSON.parse(input);
        token = parsed.token;
        chain = parsed.chain;
      } catch {
        token = input.trim();
      }

      if (!token) {
        return JSON.stringify({ error: "Missing token symbol." });
      }

      const prices = await this.client.getPrices(token, chain);
      return JSON.stringify(prices);
    } catch (error) {
      return JSON.stringify({
        error: `Failed to get prices: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
