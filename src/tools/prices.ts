import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { SuwappuApi } from "../api.js";

const pricesSchema = z.object({
  symbols: z.string().trim().min(1).describe('Comma-separated symbols, for example "ETH,SOL"'),
  chain: z.string().trim().min(1).optional().describe("Optional chain filter"),
});

export class SuwappuPricesTool extends StructuredTool<typeof pricesSchema> {
  name = "suwappu_get_prices";
  description =
    "Read current USD prices and 24h changes for one or more symbols.";
  schema = pricesSchema;

  private readonly api: SuwappuApi;

  constructor(api = new SuwappuApi()) {
    super();
    this.api = api;
  }

  async _call(input: z.output<typeof pricesSchema>): Promise<string> {
    try {
      return JSON.stringify(await this.api.getPrices(input.symbols, input.chain));
    } catch (error) {
      return JSON.stringify({
        error: `Failed to get prices: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
