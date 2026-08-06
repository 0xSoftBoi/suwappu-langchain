import { Tool } from "@langchain/core/tools";
import type { SuwappuClient } from "@suwappu/sdk";
import { SuwappuApi } from "../api.js";

export class SuwappuPortfolioTool extends Tool {
  name = "suwappu_get_portfolio";
  description =
    'Get balances for a wallet. Preferred input JSON: {"wallet_address":"0x...","chain":"base"}. chain is optional; wallet_address is required.';

  private readonly api: SuwappuApi;

  constructor(_client: SuwappuClient, api = new SuwappuApi()) {
    super();
    this.api = api;
  }

  async _call(input: string): Promise<string> {
    try {
      let walletAddress = "";
      let chain: string | undefined;

      try {
        const parsed = JSON.parse(input) as {
          wallet_address?: string;
          walletAddress?: string;
          chain?: string;
        };
        walletAddress = parsed.wallet_address ?? parsed.walletAddress ?? "";
        chain = parsed.chain;
      } catch {
        // Backwards compatibility for the old plain-chain input: callers may
        // supply the wallet through an environment variable.
        chain = input.trim() || undefined;
        walletAddress = process.env.SUWAPPU_WALLET_ADDRESS ?? "";
      }

      if (!walletAddress) {
        return JSON.stringify({
          error:
            "wallet_address is required. Pass it in JSON or set SUWAPPU_WALLET_ADDRESS for legacy plain-chain calls.",
        });
      }

      return JSON.stringify(await this.api.getPortfolio(walletAddress, chain));
    } catch (error) {
      return JSON.stringify({
        error: `Failed to get portfolio: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
