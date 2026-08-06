import { Tool } from "@langchain/core/tools";
import type { SuwappuClient } from "@suwappu/sdk";

export class SuwappuChainsTool extends Tool {
  name = "suwappu_list_chains";
  description = "List all supported blockchain chains. No input required.";

  constructor(private readonly client: SuwappuClient) {
    super();
  }

  async _call(_input: string): Promise<string> {
    try {
      return JSON.stringify(await this.client.listChains());
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
    'List available tokens for a chain. Input: chain name, for example "base" or "solana". The published SDK requires a chain.';

  constructor(private readonly client: SuwappuClient) {
    super();
  }

  async _call(input: string): Promise<string> {
    const chain = input.trim();
    if (!chain) {
      return JSON.stringify({
        error: 'Missing chain. Pass a chain name such as "base" or call suwappu_list_chains first.',
      });
    }

    try {
      return JSON.stringify(await this.client.listTokens(chain));
    } catch (error) {
      return JSON.stringify({
        error: `Failed to list tokens: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
