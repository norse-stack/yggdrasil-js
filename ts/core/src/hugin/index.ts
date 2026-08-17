// ==================================================================================
// HUGIN INTELLIGENCE LAYER - MAIN EXPORT
// ==================================================================================
// The All-Knowing Raven: Zero-Bloat Observability for Yggdrasil Applications
//
// Simple imports:
//   import { hugin, TILING_MANAGER, MUNIN } from '../hugin';
//
// Usage:
//   // Framework components (type-safe constants)
//   hugin.debug.log(TILING_MANAGER, 'Render scheduled');
//   hugin.debug.log(MUNIN, 'Fragment created');
//
//   // Tiles (dynamic registration)
//   hugin.debug.registerComponent(this.name);
//   hugin.debug.log(this.name, 'Component started');
//
// ==================================================================================

export {
  hugin,
  DEFAULT_DEBUG_CONFIG
} from './hugin.js';

export {
  EVENTUAL_STATE,
  APP_COORDINATOR,
  IMMEDIATE_STATE,
  MUNIN,
  TILING_MANAGER,
  FLOW_ENGINE,
  DEBUG
} from './types.js';

export type {
  HuginAPI,
  DebugAPI,
  FrameworkComponent,
  HuginConfig,
  DebugConfig,
  ErrorContext,
  TimingMetadata,
  RegisteredComponent,
} from './types.js';