// Framework imports
import type { EventualState } from "./EventualState.js";
import type { ImmediateState } from "./ImmediateState.js";
import { hugin, APP_COORDINATOR } from "../hugin/index.js";
// Application imports
import type { CoordinationDefinition } from "../types.js";
// ==================================================================================
// @SECTION: App Coordinator
// APP COORDINATOR - Generic Coordination Orchestrator
// ==================================================================================

export class AppCoordinator {
  private registeredCoordinations = new Map<string, any>();

  constructor(
    public eventualState: EventualState, // Full access - can mutate
    public immediateState: ImmediateState, // Public access for clean authority pattern
  ) {
    // Initialize immediate state from storage
    this.immediateState.initializeFromStorage();
  }

  // ==================================================================================
  // COORDINATION REGISTRATION SYSTEM - Dynamic coordination registration
  // ==================================================================================

  registerCoordination(
    tileName: string,
    definitions: CoordinationDefinition[],
  ): void {
    const coordinationObject: any = {};

    // Process each coordination definition
    definitions.forEach((def) => {
      // Bind coordination function to maintain context access
      coordinationObject[def.name] = async (...args: any[]) => {
        try {
          return await def.coordination.apply(this, args);
        } catch (error) {
          hugin.debug.log(APP_COORDINATOR, "Coordination failed", {
            tileName,
            coordinationName: def.name,
            error: error instanceof Error ? error.message : error,
          });
          throw error;
        }
      };
    });

    // Register the coordination object
    this.registeredCoordinations.set(tileName, coordinationObject);

    // Expose coordination on AppCoordinator for direct access
    (this as any)[tileName] = coordinationObject;

    hugin.debug.log(APP_COORDINATOR, "Registered coordination", {
      tileName,
      coordinationMethodsCount: definitions.length,
    });
  }

  // ==================================================================================
  // DEBUG & INTROSPECTION - Dynamic debugging based on registered tiles
  // ==================================================================================

  getDebugInfo() {
    const eventualStateInfo: any = {};
    const immediateStateInfo: any = {};

    // Dynamically build debug info from registered tiles
    for (const [tileName, tile] of (this.eventualState as any)
      .registeredTiles) {
      eventualStateInfo[tileName] = {};

      // Get state values from registered tile properties
      for (const key in tile) {
        if (typeof tile[key] !== "function") {
          eventualStateInfo[tileName][key] = tile[key];
        }
      }
    }

    // Get immediate state info (this would need to be updated to be dynamic too)
    try {
      immediateStateInfo.loadingStatus =
        this.immediateState.getLoadingStatus?.() || "unknown";
      immediateStateInfo.focusedTile =
        this.immediateState.getFocusedTile?.() || "unknown";
      immediateStateInfo.tileLayout =
        this.immediateState.getTileLayout?.() || "unknown";
    } catch (error) {
      immediateStateInfo.error = "Failed to get immediate state info";
    }

    return {
      eventualState: eventualStateInfo,
      immediateState: immediateStateInfo,
      registeredCoordinations: Array.from(this.registeredCoordinations.keys()),
      registeredTiles: Array.from(
        (this.eventualState as any).registeredTiles.keys(),
      ),
    };
  }
}
