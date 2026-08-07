import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { SuwappuApi } from "../api.js";

const noInputSchema = z.object({});
const tokensSchema = z.object({
  chain: z.string().trim().min(1).optional().describe('Optional chain, for example "base" or "solana"'),
  search: z.string().trim().min(1).optional().describe('Optional symbol substring, for example "USD"'),
});

export class SuwappuChainsTool extends StructuredTool<typeof noInputSchema> {
  name = "suwappu_list_chains";
  description = "List all supported blockchain chains. No input required.";
  schema = noInputSchema;

  constructor(private readonly api = new SuwappuApi()) {
    super();
  }

  async _call(_input: z.output<typeof noInputSchema>): Promise<string> {
    try {
      return JSON.stringify(await this.api.listChains());
    } catch (error) {
      return JSON.stringify({
        error: `Failed to list chains: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}

export class SuwappuTokensTool extends StructuredTool<typeof tokensSchema> {
  name = "suwappu_list_tokens";
  description =
    "List recognized tokens, optionally filtered by chain and/or symbol substring.";
  schema = tokensSchema;

  constructor(private readonly api = new SuwappuApi()) {
    super();
  }

  async _call(input: z.output<typeof tokensSchema>): Promise<string> {
    try {
      return JSON.stringify(await this.api.listTokens(input));
    } catch (error) {
      return JSON.stringify({
        error: `Failed to list tokens: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
