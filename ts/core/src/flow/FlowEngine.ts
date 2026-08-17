import type { FlowStep } from "../types.js";
import { hugin, FLOW_ENGINE } from "../hugin/index.js";

export class FlowEngine {
  async execute(
    tile: any,
    steps: FlowStep[],
    context: any,
    dependencies?: any,
  ): Promise<void> {
    for (const step of steps) {
      try {
        // Apply delay before action (if specified)
        if (step.delay) {
          await this.delay(step.delay);
        }

        // Execute the action on the tile
        const method = tile[step.action];
        if (typeof method === "function") {
          // Pass dependencies if provided, otherwise use legacy signature
          await method.call(tile, context, dependencies || step.params);
        } else {
          hugin.debug.log(FLOW_ENGINE, "Method not found on tile", {
            action: step.action,
            tileConstructorName: tile.constructor.name,
          });
        }
      } catch (error) {
        hugin.debug.log(FLOW_ENGINE, "Error executing step", {
          action: step.action,
          error: error instanceof Error ? error.message : error,
        });
        // Continue with next step - flows should be resilient
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Convenience method for single-action flows
  async executeAction(
    tile: any,
    action: string,
    context: any,
    delay?: number,
  ): Promise<void> {
    await this.execute(tile, [{ action, delay }], context);
  }
}
