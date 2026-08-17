// Munin - Template Engine

// Core template functionality
export {
  munin,
  Munin,
  MuninTemplate,
  ConditionalTemplate,
  conditional,
} from "./munin.js";

// Types
export type {
  MuninContext,
  MuninComponent,
  MuninCleanupInfo,
} from "./types.js";

// Utilities
export * from "./munin-utils.js";
export * from "./sort-strategies.js";

// Seed rendering system (replaces old SSR contract)
export * from "./seedRendering/index.js";
