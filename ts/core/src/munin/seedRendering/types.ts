// ==================================================================================
// SEED TYPES - Unified Seed rendering for SSR and Client
// ==================================================================================
// Seeds provide immediate visual feedback while tiles initialize.
// The same Seed definition works for both:
// - SSR: Server renders Seed to HTML string
// - Client: TilingManager renders Seed into container before tile construction
//
// See: /docs/frontend/yggdrasil/04-future/unified-Seed-rendering.md
// ==================================================================================

import type { MuninTemplate } from "../../munin/munin.js";

/**
 * Seed state for Seed rendering
 * Should be static, deterministic values - no async, no side effects
 */
export interface SeedState {
  [key: string]: string | number | boolean | null;
}

/**
 * Layer templates produced by Seed
 * Keys are layer names, values are Munin templates
 */
export interface SeedLayers {
  [layerName: string]: MuninTemplate;
}

/**
 * Seed definition for a tile
 *
 * @example
 * ```typescript
 * export const PDFTileSeed: SeedDefinition = {
 *   seedState: () => ({
 *     title: "PDF Viewer",
 *     message: "Initializing viewer...",
 *   }),
 *   layers: (seed) => ({
 *     header: munin`<div class="tile-header"><h3>${seed.title}</h3></div>`,
 *     content: munin`<div class="tile-content"></div>`,
 *     overlay: munin`<div class="loading-overlay">${seed.message}</div>`,
 *   }),
 * };
 * ```
 */
export interface SeedDefinition<TSeed extends SeedState = SeedState> {
  /**
   * Generate seed state for Seed rendering
   * Must be synchronous and deterministic
   */
  seedState: () => TSeed;

  /**
   * Generate layer templates from seed state
   * Returns a map of layer name -> Munin template
   */
  layers: (seed: TSeed) => SeedLayers;
}

/**
 * Tile class with optional Seed support
 * If a tile has a static `Seed` property, the framework will render it
 * before the tile constructor runs
 */
export interface SeedAwareTile {
  SeedDef?: SeedDefinition;
}
