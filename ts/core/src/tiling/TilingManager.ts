// Framework imports
import type {
  TileLayout,
  TileCoordinates,
  RenderConfig,
  TileInterface,
  RenderSchedule,
} from "../types.js";
import { ImmediateState } from "../state/ImmediateState.js";
import { hugin, TILING_MANAGER } from "../hugin/index.js";
import { munin } from "../munin/munin.js";
// import { EventualState } from "../state/EventualState.js";
// Application imports
import type {} from "../types.js";

// ==================================================================================
// @SECTION: Tiling Manager
// TILING MANAGER - Layout & Tile Management
// ==================================================================================

export class TilingManager {
  private container: HTMLElement;
  private tiles = new Map<
    string,
    { element: HTMLElement; tileInstance: TileInterface }
  >();

  // ==================================================================================
  // @SECTION: Distributed Rendering System
  // ==================================================================================

  private renderScheduler = new Map<string, RenderSchedule>();
  private renderTimers = new Map<string, ReturnType<typeof setInterval>>();
  private isRenderLoopActive = false;
  // NEW: Track layer update history for strategy decisions
  private layerUpdateHistory = new Map<
    string,
    { [layerName: string]: number }
  >();

  constructor(container: HTMLElement, _immediateState: ImmediateState) {
    this.container = container;

    // TODO: Re-enable when TilingManager is integrated with Munin flow system
    // Layout is now handled by Munin flow layers at the app level
    // immediateState.subscribe("getTileLayout", (event: StateEvent) => {
    //   this.applyLayout(event.data as TileLayout);
    // });
  }

  registerTile(
    className: string,
    element: HTMLElement,
    tileInstance: TileInterface,
    renderConfig?: RenderConfig,
  ) {
    this.tiles.set(className, { element, tileInstance });

    // Initialize render scheduling for this tile
    const defaultConfig: RenderConfig = {
      fps: 60,
      offset: this.calculateOptimalOffset(className),
      pauseWhenHidden: false,
    };

    const finalConfig = { ...defaultConfig, ...renderConfig };

    this.renderScheduler.set(className, {
      config: finalConfig,
      needsRender: false,
      lastRender: 0,
      timer: null,
    });

    // Start render loop on first tile, then add individual timers for subsequent tiles
    if (!this.isRenderLoopActive) {
      this.isRenderLoopActive = true;
      hugin.debug.log(TILING_MANAGER, "Starting distributed render loop");
    }

    // Set up timer for this specific tile
    this.startTileTimer(className, finalConfig);

    hugin.debug.log(TILING_MANAGER, "Registered tile", {
      className,
      fps: finalConfig.fps,
      offset: finalConfig.offset,
    });
  }

  // ==================================================================================
  // @SECTION: Render Scheduling Methods
  // ==================================================================================

  scheduleRender(tileId: string): void {
    const schedule = this.renderScheduler.get(tileId);
    if (schedule) {
      schedule.needsRender = true;
      hugin.debug.log(TILING_MANAGER, "Scheduled render for tile", { tileId });
    } else {
      hugin.debug.log(
        TILING_MANAGER,
        "Cannot schedule render for unregistered tile",
        { tileId },
      );
    }
  }

  private calculateOptimalOffset(_tileId: string): number {
    // Auto-calculate stagger timing based on registration order
    const tileCount = this.renderScheduler.size;
    const maxOffset = 16; // Spread across one frame (16ms)
    return (tileCount * (maxOffset / 4)) % maxOffset; // Distribute 4 tiles across 16ms
  }

  private startTileTimer(tileId: string, config: RenderConfig): void {
    const schedule = this.renderScheduler.get(tileId);
    if (!schedule) return;

    const interval = 1000 / config.fps;
    const offset = config.offset || 0;

    hugin.debug.log(TILING_MANAGER, "Setting up timer for tile", {
      tileId,
      fps: config.fps,
      offset,
    });

    // Start this tile's render cycle with its configured offset
    setTimeout(() => {
      const timer = setInterval(() => {
        const currentSchedule = this.renderScheduler.get(tileId);
        if (
          currentSchedule &&
          currentSchedule.needsRender &&
          this.shouldRender(tileId)
        ) {
          const tile = this.tiles.get(tileId);

          // NEW: Determine which layers need updating
          const layersToUpdate = this.getLayersNeedingUpdate(tileId);

          if (
            layersToUpdate.length > 0 &&
            tile?.tileInstance &&
            typeof (tile.tileInstance as any).performRender === "function"
          ) {
            try {
              // CLEAN: Synchronous render pipeline (no blocking)
              (tile.tileInstance as any).performRender(layersToUpdate);
              currentSchedule.needsRender = false;
              currentSchedule.lastRender = Date.now();
            } catch (error) {
              hugin.debug.log(TILING_MANAGER, "Error rendering tile", {
                tileId,
                error: error instanceof Error ? error.message : error,
              });
            }
          }
        }
      }, interval);

      schedule.timer = timer;
      this.renderTimers.set(tileId, timer);
    }, offset);
  }

  private shouldRender(tileId: string): boolean {
    const schedule = this.renderScheduler.get(tileId);
    if (!schedule) return false;

    // For now, always render if needed (visibility checks can be added later)
    // TODO: Add visibility checks if pauseWhenHidden is true
    return true;
  }

  // GENERIC: Determine which layers need updating based on strategies
  private getLayersNeedingUpdate(tileId: string): string[] {
    const layersToUpdate: string[] = [];
    const now = Date.now();

    try {
      // UNIFIED APPROACH: tileId IS the tileName - no more hard-coded mapping!
      const strategies = munin.getAllLayerStrategies(tileId);

      Object.entries(strategies).forEach(([layerName, strategy]) => {
        switch (strategy) {
          case "reactive":
            // Always update reactive layers (controls)
            layersToUpdate.push(layerName);
            break;

          case "persistent":
            // Only update persistent layers when explicitly needed (for now, always include them)
            // TODO: Add smart detection for when data actually changes
            layersToUpdate.push(layerName);
            break;

          case "static":
            // Update static layers occasionally or when invalidated
            const lastUpdate =
              this.layerUpdateHistory.get(tileId)?.[layerName] || 0;
            if (now - lastUpdate > 5000) {
              // 5 second max age for static layers
              layersToUpdate.push(layerName);
            }
            break;
        }
      });

      // Update history for processed layers
      if (!this.layerUpdateHistory.has(tileId)) {
        this.layerUpdateHistory.set(tileId, {});
      }
      const history = this.layerUpdateHistory.get(tileId)!;
      layersToUpdate.forEach((layerName) => {
        history[layerName] = now;
      });
    } catch (error) {
      // Fallback: If tile not registered in Munin, update all common layers
      hugin.debug.log(
        TILING_MANAGER,
        "Tile not found in Munin registry, using fallback",
        {
          tileId,
          error: error instanceof Error ? error.message : error,
        },
      );
      layersToUpdate.push("background", "controls", "overlay");
    }

    hugin.debug.log(TILING_MANAGER, "Layers to update for tile", {
      tileId,
      layersToUpdate,
    });
    return layersToUpdate;
  }

  getTileCoordinates(className: string): TileCoordinates {
    const tileData = this.tiles.get(className);
    if (!tileData) {
      throw new Error(`Tile '${className}' not registered with TilingManager`);
    }

    const element = tileData.element;
    const rect = element.getBoundingClientRect();

    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,

      viewportToTile: (viewportX: number, viewportY: number) => ({
        x: viewportX - rect.left,
        y: viewportY - rect.top,
      }),

      tileToViewport: (tileX: number, tileY: number) => ({
        x: tileX + rect.left,
        y: tileY + rect.top,
      }),

      constrainToTile: (
        x: number,
        y: number,
        elementWidth: number,
        elementHeight: number,
      ) => {
        const margin = 10;
        const constrainedX = Math.max(
          margin,
          Math.min(x, rect.width - elementWidth - margin),
        );
        const constrainedY = Math.max(
          margin,
          Math.min(y, rect.height - elementHeight - margin),
        );
        return { x: constrainedX, y: constrainedY };
      },
    };
  }

  // ==================================================================================
  // @SECTION: Layout Management via Munin Flow
  // ==================================================================================

  /**
   * Set the layout for a specific tile container
   *
   * Uses Munin's flow system to dynamically switch between layouts.
   * For flow-based tiles (registered with flow: "x" or "y"), this updates
   * the flow direction. For non-flow tiles, falls back to CSS classes.
   *
   * @param layout - The layout to apply
   * @param tileName - Optional tile name (defaults to container's tile name)
   */
  setLayout(layout: TileLayout, tileName?: string): void {
    const tileId = tileName || this.container.dataset.tileName;

    // Check if this container uses Munin flow
    const flowConfig = tileId ? munin.getFlowConfig(tileId) : undefined;

    if (flowConfig) {
      // Flow-based layout: use Munin's flow direction system
      this.applyFlowLayout(layout, tileId!);
    } else {
      // Legacy layout: use CSS classes
      this.applyLayout(layout);
    }
  }

  /**
   * Apply layout using Munin's flow direction system
   *
   * Maps TileLayout to flow direction:
   * - "split-horizontal" → flow: "x" (side by side)
   * - "split-vertical" → flow: "y" (stacked)
   * - "tabs" / "overlay" → handled separately
   */
  private applyFlowLayout(layout: TileLayout, tileName: string): void {
    switch (layout) {
      case "split-horizontal":
        munin.updateFlowDirection(tileName, "x", this.container);
        hugin.debug.log(TILING_MANAGER, "Applied horizontal flow layout", {
          tileName,
          layout,
        });
        break;

      case "split-vertical":
        munin.updateFlowDirection(tileName, "y", this.container);
        hugin.debug.log(TILING_MANAGER, "Applied vertical flow layout", {
          tileName,
          layout,
        });
        break;

      case "tabs":
      case "overlay":
        // These don't use flow - they use visibility/z-index instead
        hugin.debug.log(TILING_MANAGER, "Tabs/overlay not using flow", {
          tileName,
          layout,
        });
        break;
    }
  }

  private applyLayout(layout: TileLayout) {
    // Skip layout modifications for flow containers - flow mode handles layout via CSS Grid
    // The app container uses Munin flow layers for header/content/footer stacking
    if (this.container.dataset.hasFlow) {
      return;
    }

    // Remove existing layout classes
    this.container.classList.remove(
      "split-horizontal",
      "split-vertical",
      "tabs",
      "overlay",
    );

    // Apply new layout
    this.container.classList.add(layout);

    // Update tile visibility/arrangement based on layout
    this.updateTileArrangement(layout);
  }

  private updateTileArrangement(layout: TileLayout) {
    // Skip for flow containers
    if (this.container.dataset.hasFlow) {
      return;
    }

    switch (layout) {
      case "split-horizontal":
        this.container.style.gridTemplateColumns = "1fr 1fr";
        this.container.style.gridTemplateRows = "1fr";
        break;
      case "split-vertical":
        this.container.style.gridTemplateColumns = "1fr";
        this.container.style.gridTemplateRows = "1fr 1fr";
        break;
      case "tabs":
        // Tab switching handled by existing tile layout system
        break;
      case "overlay":
        // Overlay positioning handled by existing tile layout system
        break;
    }
  }

  /**
   * Get the current flow configuration for a tile
   */
  getFlowConfig(
    tileName?: string,
  ): { flowDirection: "x" | "y"; flowLayers: string[] } | undefined {
    const tileId = tileName || this.container.dataset.tileName;
    return tileId ? munin.getFlowConfig(tileId) : undefined;
  }

  // Tiles update reactively via subscriptions - no manual update needed
}
