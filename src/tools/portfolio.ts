import { Tool } from "@langchain/core/tools";
import type { SuwappuClient } from "@suwappu/sdk";

export class SuwappuPortfolioTool extends Tool {
  name = "suwappu_get_portfolio";
  description =
    "Check wallet token balances across chains. Input: optional chain name (e.g. \"arbitrum\"). Leave empty for all chains.";

  private client: SuwappuClient;

  constructor(client: SuwappuClient) {
    super();
    this.client = client;
  }

  async _call(input: string): Promise<string> {
    try {
      const chain = input.trim() || undefined;
      const portfolio = await this.client.getPortfolio(chain);
      return JSON.stringify(portfolio);
    } catch (error) {
      return JSON.stringify({
        error: `Failed to get portfolio: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
