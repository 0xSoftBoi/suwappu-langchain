import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { isValidIdempotencyKey, SuwappuApi, SuwappuApiError } from "../api.js";

const quoteSchema = z
  .object({
    from_token: z.string().trim().min(1).describe("Source token symbol or address"),
    to_token: z.string().trim().min(1).describe("Destination token symbol or address"),
    amount: z.number().positive().describe("Amount in source-token units"),
    chain: z.string().trim().min(1).optional().describe("Same-chain key, for example base or solana"),
    from_chain: z.string().trim().min(1).optional().describe("Cross-chain source chain"),
    to_chain: z.string().trim().min(1).optional().describe("Cross-chain destination chain"),
    wallet_address: z.string().trim().min(1).optional().describe("Wallet to bind transaction data to"),
    slippage: z.number().min(0).max(0.5).optional().describe("Slippage tolerance as a decimal"),
  })
  .superRefine((input, context) => {
    const hasSameChain = Boolean(input.chain);
    const hasFromChain = Boolean(input.from_chain);
    const hasToChain = Boolean(input.to_chain);
    const hasCrossChain = hasFromChain || hasToChain;

    if (!hasSameChain && !(hasFromChain && hasToChain)) {
      context.addIssue({
        code: "custom",
        message: "Provide chain for a same-chain quote, or both from_chain and to_chain for a cross-chain quote.",
      });
    }
    if (hasCrossChain && !(hasFromChain && hasToChain)) {
      context.addIssue({
        code: "custom",
        message: "Cross-chain quotes require both from_chain and to_chain.",
      });
    }
    if (hasSameChain && hasCrossChain) {
      context.addIssue({
        code: "custom",
        message: "Use either chain or the from_chain/to_chain pair, not both.",
      });
    }
  });

const quoteAndWalletSchema = z.object({
  quote_id: z.string().trim().min(1).describe("Fresh Suwappu quote id"),
  wallet_address: z.string().trim().min(1).describe("Wallet used for simulation/preparation"),
});

const executeSchema = z.object({
  quote_id: z.string().trim().min(1).describe("Fresh Suwappu quote id to execute"),
});

export interface ManagedExecutionRequest {
  quoteId: string;
}

export interface ManagedExecutionAuthorization {
  /** Stable application intent id. Never derive this from the current time. */
  idempotencyKey: string;
}

export type ManagedExecutionApproval = (
  request: ManagedExecutionRequest,
) => ManagedExecutionAuthorization | Promise<ManagedExecutionAuthorization>;

export class SuwappuGetQuoteTool extends StructuredTool<typeof quoteSchema> {
  name = "suwappu_get_quote";
  description =
    "Get a fresh swap quote. Read-only: this never moves funds. Use the returned quote_id for simulation before any live action.";
  schema = quoteSchema;

  constructor(private readonly api = new SuwappuApi()) {
    super();
  }

  async _call(input: z.output<typeof quoteSchema>): Promise<string> {
    try {
      // This is a human-readable source-token amount guard, not a USD risk limit. Enforce financial
      // limits with Suwappu wallet policies at the execution boundary.
      const configuredMax = Number(process.env.SUWAPPU_MAX_INPUT_AMOUNT ?? "1000000");
      const maxInputAmount =
        Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : 1_000_000;
      if (input.amount > maxInputAmount) {
        return JSON.stringify({
          error: `Input amount ${input.amount} exceeds SUWAPPU_MAX_INPUT_AMOUNT (${maxInputAmount}) in source-token units.`,
        });
      }

      const quote = await this.api.getQuote({
        fromToken: input.from_token,
        toToken: input.to_token,
        amount: input.amount,
        chain: input.chain,
        fromChain: input.from_chain,
        toChain: input.to_chain,
        walletAddress: input.wallet_address,
        slippage: input.slippage,
      });
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
export class SuwappuPrepareSwapTool extends StructuredTool<typeof quoteAndWalletSchema> {
  name = "suwappu_prepare_swap";
  description =
    "Prepare an unsigned self-custody transaction from a fresh quote. Does not sign or broadcast.";
  schema = quoteAndWalletSchema;

  constructor(private readonly api = new SuwappuApi()) {
    super();
  }

  async _call(input: z.output<typeof quoteAndWalletSchema>): Promise<string> {
    try {
      return JSON.stringify(await this.api.prepareSwap(input.quote_id, input.wallet_address));
    } catch (error) {
      return JSON.stringify({
        error: `Failed to prepare swap: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}

/** Dry-run a quote against balances, allowances, gas and call simulation. */
export class SuwappuSimulateSwapTool extends StructuredTool<typeof quoteAndWalletSchema> {
  name = "suwappu_simulate_swap";
  description =
    "Dry-run a fresh quote against balances, allowances, gas, and call simulation. Never moves funds.";
  schema = quoteAndWalletSchema;

  constructor(private readonly api = new SuwappuApi()) {
    super();
  }

  async _call(input: z.output<typeof quoteAndWalletSchema>): Promise<string> {
    try {
      return JSON.stringify(await this.api.simulateSwap(input.quote_id, input.wallet_address));
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
export class SuwappuExecuteSwapTool extends StructuredTool<typeof executeSchema> {
  name = "suwappu_execute_swap";
  description =
    "LIVE managed-wallet execution. Can move funds. The host application must approve every call and supplies a durable idempotency key; simulate and enforce wallet policy first.";
  schema = executeSchema;

  constructor(
    private readonly api: SuwappuApi,
    private readonly approve: ManagedExecutionApproval,
  ) {
    super();
  }

  async _call(input: z.output<typeof executeSchema>): Promise<string> {
    let authorization: ManagedExecutionAuthorization;
    try {
      // This callback runs outside the model prompt. It is where the host checks
      // durable application state, human approval, wallet policy, and intent id.
      authorization = await this.approve({ quoteId: input.quote_id });
    } catch (error) {
      return JSON.stringify({
        error: `Managed execution was not approved: ${error instanceof Error ? error.message : String(error)}`,
        outcome: "rejected",
      });
    }

    if (
      !authorization ||
      typeof authorization.idempotencyKey !== "string" ||
      !isValidIdempotencyKey(authorization.idempotencyKey)
    ) {
      return JSON.stringify({
        error:
          "Managed execution approval returned an invalid idempotency key; expected 1-64 characters using A-Z, a-z, 0-9, _, ., :, or -",
        outcome: "rejected",
      });
    }

    try {
      return JSON.stringify(
        await this.api.executeManagedSwap(input.quote_id, authorization.idempotencyKey),
      );
    } catch (error) {
      const outcomeUnknown =
        !(error instanceof SuwappuApiError) || error.status === 408 || error.status >= 500;
      return JSON.stringify({
        error: `Failed to execute managed swap: ${error instanceof Error ? error.message : String(error)}`,
        outcome: outcomeUnknown ? "unknown" : "rejected",
        ...(outcomeUnknown
          ? {
              next_step:
                "Reconcile managed swap status/history before retrying; if a retry is needed, reuse the same durable idempotency key.",
            }
          : {}),
      });
    }
  }
}
