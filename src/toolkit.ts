import type { StructuredToolInterface } from "@langchain/core/tools";
import { SuwappuApi, type SuwappuApiEventHandler } from "./api.js";
import {
  type ManagedExecutionApproval,
  SuwappuGetQuoteTool,
  SuwappuExecuteSwapTool,
  SuwappuPrepareSwapTool,
  SuwappuSimulateSwapTool,
} from "./tools/swap.js";
import { SuwappuPortfolioTool } from "./tools/portfolio.js";
import { SuwappuPricesTool } from "./tools/prices.js";
import { SuwappuChainsTool, SuwappuTokensTool } from "./tools/chains.js";
import { SuwappuSwapHistoryTool, SuwappuSwapStatusTool } from "./tools/status.js";

export interface SuwappuToolkitConfig {
  apiKey: string;
  baseUrl?: string;
  /** Per-request timeout. Defaults to 30 seconds. */
  requestTimeoutMs?: number;
  /** Optional custom fetch implementation for proxies, service meshes, or deterministic tests. */
  fetch?: typeof globalThis.fetch;
  /** Metadata-only hook for metrics/tracing. Never receives auth headers or request bodies. */
  onApiEvent?: SuwappuApiEventHandler;
  /**
   * Adds the destructive managed-wallet execution tool.
   * Defaults to false. Only enable after your application has its own
   * human/policy approval boundary.
   */
  enableManagedExecution?: boolean;
  /**
   * Host-controlled authorization boundary for each managed execution.
   * Required when enableManagedExecution is true. Return a durable intent key
   * persisted by your application; never derive it from the current time.
   */
  approveManagedExecution?: ManagedExecutionApproval;
}

export class SuwappuToolkit {
  private readonly api: SuwappuApi;
  private readonly enableManagedExecution: boolean;
  private readonly approveManagedExecution?: ManagedExecutionApproval;

  constructor({
    apiKey,
    baseUrl,
    requestTimeoutMs,
    fetch,
    onApiEvent,
    enableManagedExecution = false,
    approveManagedExecution,
  }: SuwappuToolkitConfig) {
    if (enableManagedExecution && !approveManagedExecution) {
      throw new Error(
        "approveManagedExecution is required when enableManagedExecution is true",
      );
    }
    this.api = new SuwappuApi({
      apiKey,
      baseUrl,
      timeoutMs: requestTimeoutMs,
      fetch,
      onEvent: onApiEvent,
    });
    this.enableManagedExecution = enableManagedExecution;
    this.approveManagedExecution = approveManagedExecution;
  }

  getTools(): StructuredToolInterface[] {
    const tools: StructuredToolInterface[] = [
      new SuwappuGetQuoteTool(this.api),
      new SuwappuSimulateSwapTool(this.api),
      new SuwappuPrepareSwapTool(this.api),
      new SuwappuPortfolioTool(this.api),
      new SuwappuPricesTool(this.api),
      new SuwappuChainsTool(this.api),
      new SuwappuTokensTool(this.api),
      new SuwappuSwapStatusTool(this.api),
      new SuwappuSwapHistoryTool(this.api),
    ];

    if (this.enableManagedExecution && this.approveManagedExecution) {
      tools.push(new SuwappuExecuteSwapTool(this.api, this.approveManagedExecution));
    }

    return tools;
  }
}
