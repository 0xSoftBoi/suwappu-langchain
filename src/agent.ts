import { createAgent } from "langchain";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ManagedExecutionApproval } from "./tools/swap.js";
import { SuwappuToolkit } from "./toolkit.js";

export interface CreateSuwappuAgentConfig {
  apiKey: string;
  model: string | BaseChatModel;
  baseUrl?: string;
  /**
   * Exposes a managed-wallet tool that can broadcast transactions.
   * Defaults to false. Prompt text is not an approval boundary: only enable
   * this after the host application has implemented human/policy approval.
   */
  enableManagedExecution?: boolean;
  approveManagedExecution?: ManagedExecutionApproval;
}

const SYSTEM_PROMPT = `You are a Suwappu assistant for quotes, prices, portfolios, supported assets, simulations, and transaction preparation.

Safety and tool semantics:
- Get a fresh quote before preparing, simulating, or executing a swap.
- Use structured tool arguments; never pack JSON into a string argument.
- suwappu_simulate_swap never moves funds.
- suwappu_prepare_swap returns an unsigned self-custody transaction; never claim it was signed or broadcast.
- suwappu_execute_swap is a live managed-wallet action that can move funds. It is absent by default and only appears when the host explicitly enables it and supplies an approval callback.
- Human/policy approval and the durable idempotency key come from host application state, never from this prompt or a model-created timestamp.
- If managed execution has an outcome-unknown network/5xx failure, reconcile with swap status/history before any retry.
- Never fabricate balances, routes, transaction hashes, or execution status.
- If a chain, token, wallet address, or quote id is missing, ask for it or use the discovery tools.`;

export async function createSuwappuAgent({
  apiKey,
  model,
  baseUrl,
  enableManagedExecution = false,
  approveManagedExecution,
}: CreateSuwappuAgentConfig) {
  const toolkit = new SuwappuToolkit({
    apiKey,
    baseUrl,
    enableManagedExecution,
    approveManagedExecution,
  });
  const tools = toolkit.getTools();

  return createAgent({
    model,
    tools,
    systemPrompt: SYSTEM_PROMPT,
  });
}
