import { Tool } from "@langchain/core/tools";
import { createClient, type SuwappuClient } from "@suwappu/sdk";
import { SuwappuApi } from "./api.js";
import {
  SuwappuGetQuoteTool,
  SuwappuExecuteSwapTool,
  SuwappuPrepareSwapTool,
  SuwappuSimulateSwapTool,
} from "./tools/swap.js";
import { SuwappuPortfolioTool } from "./tools/portfolio.js";
import { SuwappuPricesTool } from "./tools/prices.js";
import { SuwappuChainsTool, SuwappuTokensTool } from "./tools/chains.js";

export interface SuwappuToolkitConfig {
  apiKey: string;
  baseUrl?: string;
  /**
   * Adds the destructive managed-wallet execution tool.
   * Defaults to false. Only enable after your application has its own
   * human/policy approval boundary.
   */
  enableManagedExecution?: boolean;
}

export class SuwappuToolkit {
  private readonly client: SuwappuClient;
  private readonly api: SuwappuApi;
  private readonly enableManagedExecution: boolean;

  constructor({
    apiKey,
    baseUrl,
    enableManagedExecution = false,
  }: SuwappuToolkitConfig) {
    this.client = createClient({ apiKey, baseUrl });
    this.api = new SuwappuApi({ apiKey, baseUrl });
    this.enableManagedExecution = enableManagedExecution;
  }

  getTools(): Tool[] {
    const tools: Tool[] = [
      new SuwappuGetQuoteTool(this.client),
      new SuwappuSimulateSwapTool(this.api),
      new SuwappuPrepareSwapTool(this.api),
      new SuwappuPortfolioTool(this.client, this.api),
      new SuwappuPricesTool(this.client, this.api),
      new SuwappuChainsTool(this.client),
      new SuwappuTokensTool(this.client),
    ];

    if (this.enableManagedExecution) {
      tools.push(new SuwappuExecuteSwapTool(this.client, this.api));
    }

    return tools;
  }
}
