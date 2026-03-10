import { Tool } from "@langchain/core/tools";
import type { SuwappuClient } from "@suwappu/sdk";

export class SuwappuGetQuoteTool extends Tool {
  name = "suwappu_get_quote";
  description =
    "Get a swap quote for trading tokens. Input: JSON with from_token, to_token, amount, chain. Example: {\"from_token\": \"ETH\", \"to_token\": \"USDC\", \"amount\": 1.0, \"chain\": \"arbitrum\"}";

  private client: SuwappuClient;

  constructor(client: SuwappuClient) {
    super();
    this.client = client;
  }

  async _call(input: string): Promise<string> {
    try {
      const { from_token, to_token, amount, chain } = JSON.parse(input);

      if (!from_token || !to_token || !amount || !chain) {
        return JSON.stringify({
          error:
            "Missing required fields. Provide from_token, to_token, amount, and chain.",
        });
      }

      const quote = await this.client.getQuote(
        from_token,
        to_token,
        Number(amount),
        chain,
      );
      return JSON.stringify(quote);
    } catch (error) {
      return JSON.stringify({
        error: `Failed to get quote: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}

export class SuwappuExecuteSwapTool extends Tool {
  name = "suwappu_execute_swap";
  description =
    "Execute a previously quoted swap. Input: quote_id string (the ID returned from suwappu_get_quote).";

  private client: SuwappuClient;

  constructor(client: SuwappuClient) {
    super();
    this.client = client;
  }

  async _call(input: string): Promise<string> {
    try {
      const quoteId = input.trim();
      if (!quoteId) {
        return JSON.stringify({ error: "Missing quote_id." });
      }

      const result = await this.client.executeSwap(quoteId);
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({
        error: `Failed to execute swap: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
