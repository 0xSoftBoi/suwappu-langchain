import { AgentExecutor, createReactAgent } from "langchain/agents";
import { pull } from "langchain/hub";
import type { BaseLanguageModel } from "@langchain/core/language_models/base";
import type { BasePromptTemplate } from "@langchain/core/prompts";
import { SuwappuToolkit } from "./toolkit.js";

export interface CreateSuwappuAgentConfig {
  apiKey: string;
  model: BaseLanguageModel;
}

const SYSTEM_PROMPT = `You are a cross-chain DEX assistant powered by Suwappu. You help users swap tokens, check prices, view portfolio balances, and explore supported chains and tokens.

Guidelines:
- Always get a quote before executing a swap.
- Present quotes clearly with amounts, prices, and fees before asking for confirmation.
- When users ask about balances, use the portfolio tool.
- When users ask about token prices, use the prices tool.
- If a chain or token is not specified, ask the user or list available options.
- Format large numbers with commas and appropriate decimal places.
- Always confirm with the user before executing a swap.`;

export async function createSuwappuAgent({
  apiKey,
  model,
}: CreateSuwappuAgentConfig): Promise<AgentExecutor> {
  const toolkit = new SuwappuToolkit({ apiKey });
  const tools = toolkit.getTools();

  const prompt = (await pull<BasePromptTemplate>("hwchase17/react")) as BasePromptTemplate;

  const agent = await createReactAgent({
    llm: model,
    tools,
    prompt,
  });

  return new AgentExecutor({
    agent,
    tools,
    verbose: false,
    handleParsingErrors: true,
    maxIterations: 10,
  });
}
