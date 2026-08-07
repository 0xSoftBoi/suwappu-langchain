import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { SuwappuApi } from "../api.js";

const swapStatusSchema = z.object({
  swap_id: z.number().int().positive().describe("Managed swap id returned by execution"),
});

const swapHistorySchema = z.object({
  status: z.string().trim().min(1).optional().describe("Optional managed-swap status filter"),
  limit: z.number().int().min(1).max(100).optional().describe("Page size, 1-100"),
  offset: z.number().int().min(0).optional().describe("Records to skip"),
});

export class SuwappuSwapStatusTool extends StructuredTool<typeof swapStatusSchema> {
  name = "suwappu_get_swap_status";
  description =
    "Read the latest status of a managed swap. Use this to reconcile after submission or an outcome-unknown request.";
  schema = swapStatusSchema;

  constructor(private readonly api = new SuwappuApi()) {
    super();
  }

  async _call(input: z.output<typeof swapStatusSchema>): Promise<string> {
    try {
      return JSON.stringify(await this.api.getSwapStatus(input.swap_id));
    } catch (error) {
      return JSON.stringify({
        error: `Failed to get swap status: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}

export class SuwappuSwapHistoryTool extends StructuredTool<typeof swapHistorySchema> {
  name = "suwappu_get_swap_history";
  description =
    "List the authenticated agent's managed swaps newest-first. Read-only; useful for reconciliation when an execution response was lost.";
  schema = swapHistorySchema;

  constructor(private readonly api = new SuwappuApi()) {
    super();
  }

  async _call(input: z.output<typeof swapHistorySchema>): Promise<string> {
    try {
      return JSON.stringify(await this.api.getSwapHistory(input));
    } catch (error) {
      return JSON.stringify({
        error: `Failed to get swap history: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
