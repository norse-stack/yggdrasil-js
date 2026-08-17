// ==================================================================================
// MUNIN-SPECIFIC TYPES
// ==================================================================================
// Types specific to the Munin template engine.
// Core framework types (Result, StateEvent, etc.) are in src/types.ts

// Re-export core types that Munin uses (for convenience)
export type {
  PersistentLayerStrategy,
  PersistentLayerHandle,
  LayerResult,
} from '../types.js';

// ==================================================================================
// MUNIN EXECUTION CONTEXT
// ==================================================================================

/**
 * Context passed to templates during collection
 * Enables proper parent-child relationship tracking
 */
export interface MuninContext {
  parentId: string | null;
  position: number;
  /** Layer name - used for branch naming when parentId is null */
  layerName?: string;
}

/**
 * MuninComponent - Metadata for component tree structure
 */
export interface MuninComponent {
  muninId: string;
  fragment: DocumentFragment;
  cacheKey: string;
  children: MuninComponent[];
  placeholder: HTMLElement | null;
  cleanup?: MuninCleanupInfo;
  contentNodes?: Node[];
  /**
   * CSS custom property values for style-only updates
   * When cache key matches but cssVars differ, only style is updated (no DOM replacement)
   * This enables CSS transitions while maintaining stable element identity
   */
  cssVars?: Record<string, string>;
}

/**
 * Cleanup tracking for Munin templates
 */
export interface MuninCleanupInfo {
  eventHandlers: Array<{ element: Element; type: string; handler: Function }>;
  refs: Function[];
  timers: number[];
  observers: Array<MutationObserver | IntersectionObserver>;
  clearAll(): void;
}
