import { Tool } from "@langchain/core/tools";
import { createClient, type SuwappuClient } from "@suwappu/sdk";
import { SuwappuGetQuoteTool, SuwappuExecuteSwapTool } from "./tools/swap.js";
import { SuwappuPortfolioTool } from "./tools/portfolio.js";
import { SuwappuPricesTool } from "./tools/prices.js";
import { SuwappuChainsTool, SuwappuTokensTool } from "./tools/chains.js";

export interface SuwappuToolkitConfig {
  apiKey: string;
}

export class SuwappuToolkit {
  private client: SuwappuClient;

  constructor({ apiKey }: SuwappuToolkitConfig) {
    this.client = createClient({ apiKey });
  }

  getTools(): Tool[] {
    return [
      new SuwappuGetQuoteTool(this.client),
      new SuwappuExecuteSwapTool(this.client),
      new SuwappuPortfolioTool(this.client),
      new SuwappuPricesTool(this.client),
      new SuwappuChainsTool(this.client),
      new SuwappuTokensTool(this.client),
    ];
  }
}
