import { AgentExecutor, createReactAgent } from "langchain/agents";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import { PromptTemplate } from "@langchain/core/prompts";
import { SuwappuToolkit } from "./toolkit.js";

export function validateUserInput(input: string): string {
  if (input.length > 500) throw new Error("Input too long (max 500 chars)");
  return input;
}

export interface CreateSuwappuAgentConfig {
  apiKey: string;
  model: BaseLanguageModel;
  baseUrl?: string;
  /**
   * Exposes a managed-wallet tool that can broadcast transactions.
   * Defaults to false. Prompt text is not an approval boundary: only enable
   * this after the host application has implemented human/policy approval.
   */
  enableManagedExecution?: boolean;
}

const SYSTEM_PROMPT = `You are a Suwappu assistant for quotes, prices, portfolios, supported assets, simulations, and transaction preparation.

Safety and tool semantics:
- Get a fresh quote before preparing, simulating, or executing a swap.
- suwappu_simulate_swap never moves funds.
- suwappu_prepare_swap returns an unsigned self-custody transaction; never claim it was signed or broadcast.
- suwappu_execute_swap is a live managed-wallet action that can move funds. It is absent by default and only appears when the host application explicitly enables it.
- Human approval must be enforced by the host application, not inferred from this prompt.
- Never fabricate balances, routes, transaction hashes, or execution status.
- If a chain, token, wallet address, or quote id is missing, ask for it or use the discovery tools.`;

const REACT_PROMPT = PromptTemplate.fromTemplate(`${SYSTEM_PROMPT}

You have access to the following tools:
{tools}

Use this format:
Question: the user's request
Thought: reason about the next safe action
Action: one of [{tool_names}]
Action Input: the exact tool input
Observation: the tool result
... repeat Thought/Action/Action Input/Observation as needed
Thought: I know the final answer
Final Answer: answer the user accurately and state whether anything was merely quoted, simulated, prepared, or actually submitted

Question: {input}
Thought:{agent_scratchpad}`);

export async function createSuwappuAgent({
  apiKey,
  model,
  baseUrl,
  enableManagedExecution = false,
}: CreateSuwappuAgentConfig): Promise<AgentExecutor> {
  const toolkit = new SuwappuToolkit({
    apiKey,
    baseUrl,
    enableManagedExecution,
  });
  const tools = toolkit.getTools();

  const agent = await createReactAgent({
    llm: model,
    tools,
    prompt: REACT_PROMPT,
  });

  return new AgentExecutor({
    agent,
    tools,
    verbose: false,
    handleParsingErrors: true,
    maxIterations: 10,
  });
}
