// ==================================================================================
// HUGIN INTELLIGENCE LAYER - TYPE DEFINITIONS
// ==================================================================================
// The All-Knowing Raven: Zero-Bloat Observability for Yggdrasil Applications
//
// "Hugin thinks about and analyzes everything that Munin observes"
//
// Core Design Principle: High-level expressiveness that compiles to zero overhead
// in production builds.
// ==================================================================================

// ==================================================================================
// COMPILE-TIME FEATURE CONFIGURATION
// ==================================================================================

export interface HuginFeatures {
  debug: boolean;        // Component-level logging and state inspection
  performance: boolean;  // Render metrics and cache analysis (future)
  behavior: boolean;     // User analytics and journey mapping (future)
  structure: boolean;    // Tree visualization and flow analysis (future)
}

// Framework-level logging configuration (Yggdrasil components only)
export interface DebugConfig {
  // Core Yggdrasil framework components
  EVENTUAL_STATE: boolean;
  APP_COORDINATOR: boolean;
  IMMEDIATE_STATE: boolean;
  MUNIN: boolean;
  TILING_MANAGER: boolean;
  RENDERING_ENGINE: boolean;
  FLOW_ENGINE: boolean;

  // Temporary debug (easy cleanup target)
  DEBUG: boolean;
}

// ==================================================================================
// DEBUG API - Phase 1 Implementation
// ==================================================================================

export interface DebugAPI {
  // Dynamic component registration (for tiles and strategies)
  registerComponent: (componentName: string, enabled?: boolean) => void;
  unregisterComponent: (componentName: string) => void;

  // Component-level logging (framework + registered components)
  log: (component: FrameworkComponent | string, message: string, data?: any) => void;

  // State change tracking
  stateSnapshot: (path: string, value: any, reason: string) => void;

  // Flow and sequence tracking
  flowTrace: (flowId: string, step: string, data?: any) => void;

  // Error context capture
  errorContext: (error: Error, context: ErrorContext) => void;

  // Timing and performance (basic)
  timing: {
    start: (label: string) => string; // returns timingId
    end: (timingId: string, metadata?: TimingMetadata) => void;
  };

  // Temporary debug helpers (easy to clean up)
  temp: (message: string, data?: any) => void;

  // Configuration management
  enable: (component: FrameworkComponent | string) => void;
  disable: (component: FrameworkComponent | string) => void;
  isEnabled: (component: FrameworkComponent | string) => boolean;
}

// ==================================================================================
// SUPPORTING TYPES
// ==================================================================================

export interface ErrorContext {
  component?: string;
  action?: string;
  state?: any;
  timestamp?: number;
  userAgent?: string;
  [key: string]: any;
}

export interface TimingMetadata {
  category?: string;
  tags?: string[];
  data?: any;
}

// ==================================================================================
// MAIN HUGIN API INTERFACE
// ==================================================================================
// Starting with debug only, designed to grow into full intelligence layer

export interface HuginAPI {
  debug: DebugAPI;

  // Future pillars (stubbed for now)
  performance?: any; // Future: PerformanceAPI
  behavior?: any;    // Future: BehaviorAPI
  structure?: any;   // Future: StructureAPI
}

// ==================================================================================
// CONFIGURATION TYPES
// ==================================================================================

export interface HuginConfig {
  features: Partial<HuginFeatures>;
  debug: Partial<DebugConfig>;

  // Output configuration
  output?: {
    console?: boolean;
    storage?: boolean;
    endpoint?: string;
  };

  // Environment detection
  isDevelopment?: boolean;
  enabledInProduction?: boolean;
}

// ==================================================================================
// FRAMEWORK COMPONENT CONSTANTS
// ==================================================================================
// Import these for type-safe framework logging

export const EVENTUAL_STATE = 'EVENTUAL_STATE' as const;
export const APP_COORDINATOR = 'APP_COORDINATOR' as const;
export const IMMEDIATE_STATE = 'IMMEDIATE_STATE' as const;
export const MUNIN = 'MUNIN' as const;
export const TILING_MANAGER = 'TILING_MANAGER' as const;
export const RENDERING_ENGINE = 'RENDERING_ENGINE' as const;
export const FLOW_ENGINE = 'FLOW_ENGINE' as const;
export const DEBUG = 'DEBUG' as const;

// ==================================================================================
// UTILITY TYPES
// ==================================================================================

// Framework component names (statically known)
export type FrameworkComponent = keyof DebugConfig;

// Log level for future expansion
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

// Component registration info
export interface RegisteredComponent {
  name: string;
  enabled: boolean;
  registeredAt: number;
}

// ==================================================================================
// COMPILE-TIME DECLARATIONS
// ==================================================================================
// These will be replaced by Vite define plugin

declare global {
  const __HUGIN_ENABLED__: boolean;
  const __HUGIN_DEBUG__: boolean;
  const __DEV__: boolean;
}
