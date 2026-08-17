// Extracted from the original application monolith
export interface StateEvent {
  id: string;
  type: string;
  timestamp: number;
  stateId: "eventual-state" | "immediate-state";
  data: any;
  previousData?: any;
}

export type LoadingStatus = "idle" | "loading" | "complete" | "error";
export type TileLayout =
  | "split-horizontal"
  | "split-vertical"
  | "tabs"
  | "overlay";

export interface TileCoordinates {
  // Tile boundaries in viewport coordinates
  left: number;
  top: number;
  width: number;
  height: number;

  // Coordinate conversion methods
  viewportToTile(
    viewportX: number,
    viewportY: number,
  ): { x: number; y: number };
  tileToViewport(tileX: number, tileY: number): { x: number; y: number };

  // Constraint helpers for positioning within tile bounds
  constrainToTile(
    x: number,
    y: number,
    elementWidth: number,
    elementHeight: number,
  ): { x: number; y: number };
}

// ==================================================================================
// DOCUMENT LOADER - Tile Registration System
// ==================================================================================

/**
 * Eventual action definition for tile registration
 */
export interface EventualActionDefinition {
  name: string;
  initialValue?: any;
  action?: (...args: any[]) => Promise<any>;
  type?: string; // Optional type hint for declaration generation (e.g., "PDFDocument | null")
}

/**
 * Coordination definition for tile registration
 */
export interface CoordinationDefinition {
  name: string;
  coordination: (...args: any[]) => Promise<any>;
}

// ==================================================================================
// FLOW ENGINE - Temporal Sequence Orchestration
// ==================================================================================

export interface FlowStep {
  action: string;
  delay?: number;
  params?: any;
}

// ==================================================================================
// @SECTION: Distributed Rendering System Interfaces
// ==================================================================================

export interface RenderConfig {
  fps: 15 | 30 | 60;
  offset?: number; // Stagger timing (auto-calculated if not provided)
  pauseWhenHidden?: boolean;
}

export interface RenderSchedule {
  config: RenderConfig;
  needsRender: boolean;
  lastRender: number;
  timer: ReturnType<typeof setInterval> | null;
}

// ==================================================================================
//
// ==================================================================================
// SHARED TYPE DEFINITIONS
// ==================================================================================
// This file contains type definitions used across multiple parts of the frontend
// to ensure consistency and type safety.

// ==================================================================================
// RESULT TYPE PATTERN
// ==================================================================================
// Rust-inspired Result type for explicit error handling without exceptions

/**
 * Result type for operations that can succeed or fail
 * Provides explicit error handling without throwing exceptions
 */
export type Result<T = void, E = string> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Helper to create successful results
 * @param data - Optional data to include with success
 */
export function Ok<T>(data: T): Result<T, never>;
export function Ok(): Result<void, never>;
export function Ok<T>(data?: T): Result<T | void, never> {
  return data !== undefined
    ? { success: true, data }
    : { success: true, data: undefined as void };
}

/**
 * Helper to create error results
 * @param error - Error message or error object
 */
export function Err<E = string>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Type guard to check if result is successful
 */
export function isOk<T, E>(
  result: Result<T, E>,
): result is { success: true; data: T } {
  return result.success;
}

/**
 * Type guard to check if result is an error
 */
export function isErr<T, E>(
  result: Result<T, E>,
): result is { success: false; error: E } {
  return !result.success;
}

// ==================================================================================
// PERSISTENT LAYER STRATEGY TYPES
// ==================================================================================

/**
 * Result type specifically for persistent layer operations
 * Uses string errors for simplicity in UI contexts
 */
export type LayerResult<T = void> = Result<T, string>;

/**
 * Handle returned by persistent layer strategies for lifecycle management
 * Simplified - no cleanup function needed with instance state pattern
 */
export interface PersistentLayerHandle {
  // Future: Could add strategy metadata, debugging info, etc.
  strategyName: string;
}

/**
 * Interface for persistent layer strategies
 * Updated to use Result pattern instead of cleanup functions
 */
export interface PersistentLayerStrategy {
  /** Strategy name for debugging and identification */
  readonly name: string;

  /**
   * Called when layer DOM is mounted and strategy should initialize
   * @param container - The DOM container element for this layer
   * @param eventualState - App state that requires external confirmation
   * @param immediateState - App state that can be resolved immediately
   * @returns Result indicating success or failure with error details
   */
  onMount(
    container: HTMLElement,
    eventualState: any,
    immediateState: any,
  ): LayerResult<PersistentLayerHandle>;

  /**
   * Called when app state changes and strategy should sync
   * @param handle - Handle returned from successful onMount
   * @param eventualState - App state that requires external confirmation
   * @param immediateState - App state that can be resolved immediately
   */
  onUpdate(
    handle: PersistentLayerHandle,
    eventualState: any,
    immediateState: any,
  ): void;

  /**
   * Called when layer is being unmounted and strategy should cleanup
   * @param handle - Handle returned from successful onMount
   */
  onUnmount(handle: PersistentLayerHandle): void;
}

// ==================================================================================
// EXAMPLE USAGE
// ==================================================================================

/*
// Success case:
const result = Ok({ initialized: true });
if (isOk(result)) {
  console.log(result.data.initialized); // TypeScript knows this is safe
}

// Error case:
const errorResult = Err("D3 library not found");
if (isErr(errorResult)) {
  console.error(errorResult.error); // TypeScript knows this exists
}

// Strategy usage:
onMount(container: HTMLElement, eventualState: any, immediateState: any): LayerResult<PersistentLayerHandle> {
  try {
    // ... setup logic with access to app state
    const graph = eventualState.view.graphViewerTile.getGraph();
    this.initializeWithData(graph);
    return Ok({ strategyName: this.name });
  } catch (error) {
    return Err(`Failed to initialize: ${error.message}`);
  }
}
*/

// New interfaces
//
export interface TileInterface {
  // Public API - what TilingManager and other framework code calls
  performRender(layersToUpdate?: string[]): void;
  update(): void;
}

/**
 * Extended interface for the special App Tile
 * App tiles have additional responsibilities beyond regular tiles:
 * - Managing global application coordination
 * - Controlling tile layout and positioning
 * - Managing themes and global UI state
 * - Coordinating cross-tile communication
 */
export interface AppInterface extends TileInterface {
  /** Central coordinator for cross-tile communication and state */
  readonly appCoordinator: any; // TODO: Import proper AppCoordinator type

  /** Manager for tile rendering scheduling and lifecycle */
  readonly tilingManager: any; // TODO: Import proper TilingManager type

  // Note: Theme is now framework-level via ImmediateState.theme
  // Access via: immediateState.theme.getCurrentTheme() / setTheme() / cycleTheme()

  // TODO: Add LayoutManager when implemented
  // readonly layoutManager: any; // For tile positioning and window management
}
