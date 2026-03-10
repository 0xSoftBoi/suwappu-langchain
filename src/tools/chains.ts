import { Tool } from "@langchain/core/tools";
import type { SuwappuClient } from "@suwappu/sdk";

export class SuwappuChainsTool extends Tool {
  name = "suwappu_list_chains";
  description =
    "List all supported blockchain chains. No input required.";

  private client: SuwappuClient;

  constructor(client: SuwappuClient) {
    super();
    this.client = client;
  }

  async _call(_input: string): Promise<string> {
    try {
      const chains = await this.client.listChains();
      return JSON.stringify(chains);
    } catch (error) {
      return JSON.stringify({
        error: `Failed to list chains: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}

export class SuwappuTokensTool extends Tool {
  name = "suwappu_list_tokens";
  description =
    "List available tokens for trading. Input: optional chain name to filter tokens (e.g. \"arbitrum\"). Leave empty for all tokens.";

  private client: SuwappuClient;

  constructor(client: SuwappuClient) {
    super();
    this.client = client;
  }

  async _call(input: string): Promise<string> {
    try {
      const chain = input.trim() || undefined;
      const tokens = await this.client.listTokens(chain);
      return JSON.stringify(tokens);
    } catch (error) {
      return JSON.stringify({
        error: `Failed to list tokens: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
