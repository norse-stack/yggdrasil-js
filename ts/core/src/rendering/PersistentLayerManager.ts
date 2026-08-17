// ==================================================================================
// PERSISTENT LAYER MANAGER - Infrastructure for Persistent Layer Lifecycle
// ==================================================================================
// Generic infrastructure for managing persistent layer mounting, updating, and cleanup.
// Extracted from GraphTile for reusability across any tile that needs persistent layers.

import type { EventualState } from "../state/EventualState.js";
import type { ImmediateState } from "../state/ImmediateState.js";
import type {
  PersistentLayerStrategy,
  PersistentLayerHandle,
} from "../types.js";
import { isOk, isErr } from "../types.js";

// ==================================================================================
// CONFIGURATION INTERFACES
// ==================================================================================

/**
 * Configuration for reactive state updates to persistent layers
 */
export interface StateUpdateConfig {
  eventualPaths?: string[]; // e.g., ["graphTile.getCurrentGraph"]
  immediatePaths?: string[]; // e.g., ["graphTile.getForceMode", "graphTile.isFrozen"]
  debounceMs?: number; // Default: 50ms
}

/**
 * Information about a discovered persistent layer
 */
interface PersistentLayerInfo {
  layer: PersistentLayerStrategy;
  handle?: PersistentLayerHandle;
}

// ==================================================================================
// PERSISTENT LAYER MANAGER
// ==================================================================================

export class PersistentLayerManager {
  private activeSubscriptions: Array<() => void> = [];

  constructor(
    private eventualState: EventualState,
    private immediateState: ImmediateState,
  ) {}

  // ==================================================================================
  // CORE LIFECYCLE METHODS - Pure Infrastructure
  // ==================================================================================

  /**
   * Mount a persistent layer on a container
   * Returns true if a persistent layer was mounted, false if none exists
   */
  async mountLayer(container: HTMLElement): Promise<boolean> {
    const layerInfo = this.getPersistentLayerInfo(container);
    if (!layerInfo) return false;

    try {
      const result = layerInfo.layer.onMount?.(
        container,
        this.eventualState,
        this.immediateState,
      );

      if (result) {
        if (isOk(result)) {
          (container as any).__persistentHandle = result.data;
          return true;
        } else if (isErr(result)) {
          // Error handling - let the caller decide how to log/handle
          throw new Error(result.error);
        }
      }
    } catch (error) {
      // Re-throw for caller to handle
      throw error;
    }

    return false;
  }

  /**
   * Update a persistent layer with current state
   * Returns true if a persistent layer was updated, false if none exists
   */
  updateLayer(container: HTMLElement): boolean {
    const layerInfo = this.getPersistentLayerInfo(container);
    if (!layerInfo?.layer || !layerInfo?.handle) return false;

    try {
      layerInfo.layer.onUpdate?.(
        layerInfo.handle,
        this.eventualState,
        this.immediateState,
      );
      return true;
    } catch (error) {
      // Re-throw for caller to handle
      throw error;
    }
  }

  /**
   * Unmount and cleanup a persistent layer
   * Returns true if a persistent layer was unmounted, false if none exists
   */
  async unmountLayer(container: HTMLElement): Promise<boolean> {
    const layerInfo = this.getPersistentLayerInfo(container);
    if (!layerInfo?.layer || !layerInfo?.handle) return false;

    try {
      await layerInfo.layer.onUnmount?.(layerInfo.handle);

      // Clear the handle
      (container as any).__persistentHandle = null;
      return true;
    } catch (error) {
      // Re-throw for caller to handle
      throw error;
    }
  }

  /**
   * Update all persistent layers in a set of containers
   */
  updateAllLayers(containers: Record<string, HTMLElement>): number {
    let updatedCount = 0;

    Object.values(containers).forEach((container) => {
      try {
        if (this.updateLayer(container)) {
          updatedCount++;
        }
      } catch (error) {
        // Re-throw for caller to handle - they know the context better
        throw error;
      }
    });

    return updatedCount;
  }

  // ==================================================================================
  // REACTIVE UPDATE SYSTEM
  // ==================================================================================

  /**
   * Set up reactive updates for a persistent layer based on state changes
   * Generic infrastructure - caller provides the state paths and container
   */
  setupReactiveUpdates(
    container: HTMLElement,
    config: StateUpdateConfig,
  ): boolean {
    const layerInfo = this.getPersistentLayerInfo(container);
    if (!layerInfo) return false;

    const debounceMs = config.debounceMs ?? 50;
    let debounceTimer: number | null = null;

    const triggerUpdate = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        try {
          this.updateLayer(container);
        } catch (error) {
          // Re-throw for caller to handle
          throw error;
        }
        debounceTimer = null;
      }, debounceMs) as any;
    };

    // Subscribe to eventual state paths
    config.eventualPaths?.forEach((path) => {
      const unsubscribe = this.eventualState.subscribe(path, triggerUpdate);
      this.activeSubscriptions.push(() => unsubscribe());
    });

    // Subscribe to immediate state paths
    config.immediatePaths?.forEach((path) => {
      const unsubscribe = this.immediateState.subscribe(path, triggerUpdate);
      this.activeSubscriptions.push(() => unsubscribe());
    });

    return true;
  }

  // ==================================================================================
  // CLEANUP
  // ==================================================================================

  /**
   * Clean up all active subscriptions
   */
  cleanup(): void {
    this.activeSubscriptions.forEach((unsubscribe) => unsubscribe());
    this.activeSubscriptions = [];
  }

  // ==================================================================================
  // PRIVATE UTILITIES
  // ==================================================================================

  /**
   * Get persistent layer info from container, if it exists
   */
  private getPersistentLayerInfo(
    container: HTMLElement,
  ): PersistentLayerInfo | null {
    const layer = (container as any).__persistentLayer;
    if (!layer || !this.isPersistentLayer(container)) {
      return null;
    }

    const handle = (container as any).__persistentHandle;
    return { layer, handle };
  }

  /**
   * Check if container is configured for persistent layer behavior
   */
  private isPersistentLayer(container: HTMLElement): boolean {
    return container.dataset.layer_type === "persistent";
  }
}
