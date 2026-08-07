import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { SuwappuApi } from "../api.js";

const portfolioSchema = z.object({
  wallet_address: z.string().trim().min(1).describe("Wallet address to inspect"),
  chain: z.string().trim().min(1).optional().describe("Optional chain filter"),
});

export class SuwappuPortfolioTool extends StructuredTool<typeof portfolioSchema> {
  name = "suwappu_get_portfolio";
  description =
    "Read balances and USD values for a wallet. Read-only; chain is optional.";
  schema = portfolioSchema;

  private readonly api: SuwappuApi;

  constructor(api = new SuwappuApi()) {
    super();
    this.api = api;
  }

  async _call(input: z.output<typeof portfolioSchema>): Promise<string> {
    try {
      return JSON.stringify(await this.api.getPortfolio(input.wallet_address, input.chain));
    } catch (error) {
      return JSON.stringify({
        error: `Failed to get portfolio: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
