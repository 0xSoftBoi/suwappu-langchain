import { Tool } from "@langchain/core/tools";
import type { SuwappuClient } from "@suwappu/sdk";
import { SuwappuApi } from "../api.js";

function parseQuoteAndWallet(input: string): { quoteId: string; walletAddress: string } | { error: string } {
  try {
    const parsed = JSON.parse(input) as {
      quote_id?: string;
      quoteId?: string;
      wallet_address?: string;
      walletAddress?: string;
    };
    const quoteId = parsed.quote_id ?? parsed.quoteId ?? "";
    const walletAddress = parsed.wallet_address ?? parsed.walletAddress ?? "";
    if (!quoteId || !walletAddress) {
      return { error: "Provide quote_id and wallet_address." };
    }
    return { quoteId, walletAddress };
  } catch {
    return { error: 'Expected JSON: {"quote_id":"...","wallet_address":"0x..."}.' };
  }
}

export class SuwappuGetQuoteTool extends Tool {
  name = "suwappu_get_quote";
  description =
    'Get a swap quote. Input JSON: {"from_token":"ETH","to_token":"USDC","amount":1,"chain":"arbitrum"}. This only quotes; it never moves funds.';

  constructor(private readonly client: SuwappuClient) {
    super();
  }

  async _call(input: string): Promise<string> {
    try {
      const parsed = JSON.parse(input) as {
        from_token?: string;
        to_token?: string;
        amount?: string | number;
        chain?: string;
      };
      const amount = Number(parsed.amount);

      if (
        !parsed.from_token ||
        !parsed.to_token ||
        !parsed.chain ||
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return JSON.stringify({
          error: "Provide from_token, to_token, a positive amount, and chain.",
        });
      }

      // This is a raw token-unit guard, not a USD risk limit. Enforce financial
      // limits with Suwappu wallet policies at the execution boundary.
      const configuredMax = Number(process.env.SUWAPPU_MAX_INPUT_AMOUNT ?? "1000000");
      const maxInputAmount =
        Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : 1_000_000;
      if (amount > maxInputAmount) {
        return JSON.stringify({
          error: `Input amount ${amount} exceeds SUWAPPU_MAX_INPUT_AMOUNT (${maxInputAmount}) in from-token units.`,
        });
      }

      const quote = await this.client.getQuote(
        parsed.from_token,
        parsed.to_token,
        amount,
        parsed.chain,
      );
      return JSON.stringify(quote);
    } catch (error) {
      return JSON.stringify({
        error: `Failed to get quote: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}

/**
 * Prepare a self-custody swap. The returned transaction is unsigned and must be
 * reviewed and signed by the caller's wallet; this tool never broadcasts it.
 */
export class SuwappuPrepareSwapTool extends Tool {
  name = "suwappu_prepare_swap";
  description =
    'Prepare an unsigned self-custody transaction. Input JSON: {"quote_id":"...","wallet_address":"0x..."}. Does not sign or broadcast.';

  constructor(private readonly api = new SuwappuApi()) {
    super();
  }

  async _call(input: string): Promise<string> {
    const parsed = parseQuoteAndWallet(input);
    if ("error" in parsed) return JSON.stringify(parsed);

    try {
      return JSON.stringify(await this.api.prepareSwap(parsed.quoteId, parsed.walletAddress));
    } catch (error) {
      return JSON.stringify({
        error: `Failed to prepare swap: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}

/** Dry-run a quote against balances, allowances, gas and call simulation. */
export class SuwappuSimulateSwapTool extends Tool {
  name = "suwappu_simulate_swap";
  description =
    'Simulate a swap without moving funds. Input JSON: {"quote_id":"...","wallet_address":"0x..."}.';

  constructor(private readonly api = new SuwappuApi()) {
    super();
  }

  async _call(input: string): Promise<string> {
    const parsed = parseQuoteAndWallet(input);
    if ("error" in parsed) return JSON.stringify(parsed);

    try {
      return JSON.stringify(await this.api.simulateSwap(parsed.quoteId, parsed.walletAddress));
    } catch (error) {
      return JSON.stringify({
        error: `Failed to simulate swap: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}

/**
 * Destructive managed-wallet tool. SuwappuToolkit excludes this by default.
 * Applications must explicitly opt in after implementing their own approval UI.
 */
export class SuwappuExecuteSwapTool extends Tool {
  name = "suwappu_execute_swap";
  description =
    "LIVE managed-wallet execution. Broadcasts a previously quoted swap and can move funds. Input: quote_id. Hosts should expose this tool only after application-level approval.";

  private readonly api: SuwappuApi;

  constructor(_client: SuwappuClient, api = new SuwappuApi()) {
    super();
    this.api = api;
  }

  async _call(input: string): Promise<string> {
    const quoteId = input.trim();
    if (!quoteId) return JSON.stringify({ error: "Missing quote_id." });

    try {
      return JSON.stringify(await this.api.executeManagedSwap(quoteId));
    } catch (error) {
      return JSON.stringify({
        error: `Failed to execute managed swap: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
