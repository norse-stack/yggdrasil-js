// ==================================================================================
// YGGDRASIL SSR - Server-Side Rendering Utilities
// ==================================================================================
// This module is ONLY for server-side use (Node.js / Astro SSR).
// Import from 'yggdrasil-js/ssr' in your Astro pages.
//
// The old SSR system (renderApp, SSRContract) has been removed.
// Use the seed rendering system instead: renderSeedToHTML from munin/seedRendering
// ==================================================================================

// Re-export seed rendering utilities for SSR
export {
  renderSeed,
  renderSeedToHTML,
  renderSeedWithTree,
} from "./munin/seedRendering/index.js";

export type {
  SeedDefinition,
  SeedState,
  SeedLayers,
  SeedAwareTile,
} from "./munin/seedRendering/index.js";
