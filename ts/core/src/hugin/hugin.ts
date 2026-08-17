// ==================================================================================
// HUGIN INTELLIGENCE LAYER - MAIN IMPLEMENTATION
// ==================================================================================
// The All-Knowing Raven: Zero-Bloat Observability for Yggdrasil Applications
//
// "Where Munin sees all state changes, Hugin understands what they mean"
//
// ZERO-COST ABSTRACTION: Expressive development code that compiles to nothing
// in production builds.
// ==================================================================================

import type {
  HuginAPI,
  HuginConfig,
  DebugAPI,
  DebugConfig,
  FrameworkComponent,
  RegisteredComponent,
  ErrorContext,
  TimingMetadata,
} from "./types.js";

// ==================================================================================
// DEFAULT CONFIGURATION
// ==================================================================================

const DEFAULT_DEBUG_CONFIG: DebugConfig = {
  // Core Yggdrasil framework components (conservative defaults)
  EVENTUAL_STATE: true,
  APP_COORDINATOR: true,
  IMMEDIATE_STATE: true,
  MUNIN: true,
  TILING_MANAGER: true, // Often helpful for debugging render issues
  RENDERING_ENGINE: true,
  FLOW_ENGINE: false,

  // Temporary debug (easy cleanup target)
  DEBUG: true,
};

const DEFAULT_CONFIG: HuginConfig = {
  features: {
    debug: true,
    performance: false,
    behavior: false,
    structure: false,
  },
  debug: DEFAULT_DEBUG_CONFIG,
  output: {
    console: false,
    storage: false,
  },
  isDevelopment:
    typeof __DEV__ !== "undefined"
      ? __DEV__
      : ((typeof import.meta !== "undefined" && import.meta.env?.DEV) ?? true),
};

// ==================================================================================
// FULL DEBUG IMPLEMENTATION (Development Builds)
// ==================================================================================

class DebugImplementation implements DebugAPI {
  private config: DebugConfig;
  private registeredComponents = new Map<string, RegisteredComponent>();
  private timings = new Map<string, { start: number; label: string }>();

  constructor(config: Partial<DebugConfig> = {}) {
    this.config = { ...DEFAULT_DEBUG_CONFIG, ...config };
  }

  // Dynamic component registration
  registerComponent(componentName: string, enabled: boolean = true): void {
    this.registeredComponents.set(componentName, {
      name: componentName,
      enabled,
      registeredAt: Date.now(),
    });

    if (this.isDebugEnabled()) {
      console.log(
        `🐦 [Hugin] Registered component: ${componentName} (enabled: ${enabled})`,
      );
    }
  }

  unregisterComponent(componentName: string): void {
    const wasRegistered = this.registeredComponents.delete(componentName);

    if (wasRegistered && this.isDebugEnabled()) {
      console.log(`🐦 [Hugin] Unregistered component: ${componentName}`);
    }
  }

  // Component-level logging with framework + registered component support
  log(
    component: FrameworkComponent | string,
    message: string,
    data?: any,
  ): void {
    if (!this.isComponentEnabled(component)) return;

    const componentTag = this.getComponentTag(component);

    // Clean formatting: Bird + Component (padded to 18 chars) + Message
    const paddedComponent = componentTag.padEnd(18);
    const logMessage = `🐦 ${paddedComponent} ${message}`;

    // Simple direct call - let's see if this helps with source mapping
    if (data !== undefined) {
      console.log(logMessage, data);
    } else {
      console.log(logMessage);
    }
  }

  // Configuration management
  enable(component: FrameworkComponent | string): void {
    if (this.isFrameworkComponent(component)) {
      this.config[component as FrameworkComponent] = true;
    } else {
      const registered = this.registeredComponents.get(component);
      if (registered) {
        registered.enabled = true;
      }
    }
  }

  disable(component: FrameworkComponent | string): void {
    if (this.isFrameworkComponent(component)) {
      this.config[component as FrameworkComponent] = false;
    } else {
      const registered = this.registeredComponents.get(component);
      if (registered) {
        registered.enabled = false;
      }
    }
  }

  isEnabled(component: FrameworkComponent | string): boolean {
    return this.isComponentEnabled(component);
  }

  // State change tracking with path context
  stateSnapshot(path: string, value: any, reason: string): void {
    if (!this.isDebugEnabled()) return;

    console.log(`🐦 🔍 [STATE] ${path}: ${reason}`, {
      path,
      value: this.sanitizeValue(value),
      reason,
      timestamp: Date.now(),
    });
  }

  // Flow and sequence tracking
  flowTrace(flowId: string, step: string, data?: any): void {
    if (!this.isDebugEnabled()) return;

    console.log(`🐦 🌊 [FLOW] ${flowId} → ${step}`, data || "");
  }

  // Error context capture
  errorContext(error: Error, context: ErrorContext): void {
    console.group(`🐦 🚨 [ERROR] ${error.message}`);
    console.error(error);
    console.log("Context:", {
      ...context,
      timestamp: context.timestamp || Date.now(),
      userAgent: context.userAgent || navigator.userAgent,
    });
    console.groupEnd();
  }

  // Basic timing functionality
  timing = {
    start: (label: string): string => {
      if (!this.isDebugEnabled()) return "";

      const timingId = `${label}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.timings.set(timingId, {
        start: performance.now(),
        label,
      });
      return timingId;
    },

    end: (timingId: string, metadata?: TimingMetadata): void => {
      if (!this.isDebugEnabled()) return;

      const timing = this.timings.get(timingId);
      if (!timing) return;

      const duration = performance.now() - timing.start;
      this.timings.delete(timingId);

      console.log(
        `🐦 ⏱️ [TIMING] ${timing.label}: ${duration.toFixed(2)}ms`,
        metadata || "",
      );
    },
  };

  // Temporary debug (easy to find and clean up)
  temp(message: string, data?: any): void {
    if (!this.config.DEBUG) return;

    console.log(`🐦 🐛 [TEMP] ${message}`, data || "");
  }

  // Helper methods

  private isComponentEnabled(component: FrameworkComponent | string): boolean {
    if (this.isFrameworkComponent(component)) {
      return this.config[component as FrameworkComponent];
    } else {
      const registered = this.registeredComponents.get(component);
      return registered?.enabled ?? false;
    }
  }

  private isFrameworkComponent(
    component: string,
  ): component is FrameworkComponent {
    return component in this.config;
  }

  private getComponentTag(component: FrameworkComponent | string): string {
    // Framework component tags - shorter and cleaner
    const frameworkTags: Record<FrameworkComponent, string> = {
      EVENTUAL_STATE: "[EventualState]",
      APP_COORDINATOR: "[AppCoordinator]",
      IMMEDIATE_STATE: "[ImmediateState]",
      MUNIN: "[Munin]",
      TILING_MANAGER: "[TilingManager]",
      RENDERING_ENGINE: "[RenderingEngine]",
      FLOW_ENGINE: "[FlowEngine]",
      DEBUG: "[DEBUG]",
    };

    if (this.isFrameworkComponent(component)) {
      return frameworkTags[component];
    } else {
      // Dynamic component - clean tag from name
      return `[${component}]`;
    }
  }

  private isDebugEnabled(): boolean {
    return (
      this.config.DEBUG ||
      Object.values(this.config).some(Boolean) ||
      this.registeredComponents.size > 0
    );
  }

  private sanitizeValue(value: any): any {
    // Prevent circular references and limit size
    try {
      const str = JSON.stringify(value);
      return str.length > 500 ? `${str.substring(0, 500)}...` : value;
    } catch {
      return `[Object: ${typeof value}]`;
    }
  }

  // Configuration management
  updateConfig(newConfig: Partial<DebugConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log("🐦 [Hugin] Debug configuration updated:", this.config);
  }

  getConfig(): DebugConfig {
    return { ...this.config };
  }
}

// ==================================================================================
// ZERO-OVERHEAD STUBS (Production Builds)
// ==================================================================================

class DebugStub implements DebugAPI {
  registerComponent(): void {}
  unregisterComponent(): void {}
  log(): void {}
  stateSnapshot(): void {}
  flowTrace(): void {}
  errorContext(): void {}

  timing = {
    start: (): string => "",
    end: (): void => {},
  };

  temp(): void {}
  enable(): void {}
  disable(): void {}
  isEnabled(): boolean {
    return false;
  }

  // Even config methods are no-ops in production
  updateConfig(): void {}
  getConfig(): DebugConfig {
    return {} as DebugConfig;
  }
}

// ==================================================================================
// MAIN HUGIN API IMPLEMENTATION
// ==================================================================================

class HuginImplementation implements HuginAPI {
  public debug: DebugAPI;

  constructor(config: Partial<HuginConfig> = {}) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    // Initialize debug API based on feature flags
    this.debug =
      mergedConfig.features.debug && mergedConfig.isDevelopment
        ? new DebugImplementation(mergedConfig.debug)
        : new DebugStub();
  }

  // Method to update configuration at runtime (development only)
  updateConfig(config: Partial<HuginConfig>): void {
    if (this.debug instanceof DebugImplementation) {
      if (config.debug) {
        this.debug.updateConfig(config.debug);
      }
    }
  }
}

// ==================================================================================
// HUGIN STUB (Complete No-Op for Production)
// ==================================================================================

class HuginStub implements HuginAPI {
  debug = new DebugStub();
  updateConfig(): void {}
}

// ==================================================================================
// COMPILE-TIME SELECTION & EXPORT
// ==================================================================================
// The magic happens here: full implementation in development, complete elimination in production

// 🔧 MANUAL TOGGLE: Set to true for local development, false for production builds
// When false, HuginStub is used and all logging code is eliminated by the bundler
const HUGIN_ENABLED = false;

export const hugin: HuginAPI = HUGIN_ENABLED
  ? new HuginImplementation()
  : new HuginStub();

// ==================================================================================
// DEVELOPMENT UTILITIES
// ==================================================================================
// Global access for debugging (development only)

if (HUGIN_ENABLED && typeof window !== "undefined") {
  // Create a direct logging function that preserves call site
  const directLog = function (
    component: FrameworkComponent | string,
    message: string,
    data?: any,
  ) {
    if (hugin.debug.isEnabled(component)) {
      const componentTag =
        hugin.debug instanceof DebugImplementation
          ? (hugin.debug as any).getComponentTag(component)
          : `[${component}]`;
      const paddedComponent = componentTag.padEnd(18);
      const logMessage = `🐦 ${paddedComponent} ${message}`;

      if (data !== undefined) {
        console.log(logMessage, data);
      } else {
        console.log(logMessage);
      }
    }
  };

  (window as any).__hugin = {
    // Quick access to the main API
    ...hugin,

    // Direct logging function that may preserve source location better
    log: directLog,

    // Configuration helpers
    enable: (component: FrameworkComponent | string) => {
      hugin.debug.enable(component);
    },

    disable: (component: FrameworkComponent | string) => {
      hugin.debug.disable(component);
    },

    enableAll: () => {
      if (hugin.debug instanceof DebugImplementation) {
        // Enable all framework components
        Object.keys(DEFAULT_DEBUG_CONFIG).forEach((key) => {
          hugin.debug.enable(key as FrameworkComponent);
        });
        // Enable all registered components
        if (hugin.debug instanceof DebugImplementation) {
          (hugin.debug as any).registeredComponents.forEach(
            (_comp: any, name: string) => {
              hugin.debug.enable(name);
            },
          );
        }
      }
    },

    disableAll: () => {
      if (hugin.debug instanceof DebugImplementation) {
        // Disable all framework components
        Object.keys(DEFAULT_DEBUG_CONFIG).forEach((key) => {
          hugin.debug.disable(key as FrameworkComponent);
        });
        // Disable all registered components
        if (hugin.debug instanceof DebugImplementation) {
          (hugin.debug as any).registeredComponents.forEach(
            (_comp: any, name: string) => {
              hugin.debug.disable(name);
            },
          );
        }
      }
    },

    // Component registration helpers
    register: (componentName: string, enabled: boolean = true) => {
      hugin.debug.registerComponent(componentName, enabled);
    },

    unregister: (componentName: string) => {
      hugin.debug.unregisterComponent(componentName);
    },

    listComponents: () => {
      if (hugin.debug instanceof DebugImplementation) {
        console.group("🐦 Hugin Components");
        console.log("Framework Components:", DEFAULT_DEBUG_CONFIG);
        console.log(
          "Registered Components:",
          Array.from((hugin.debug as any).registeredComponents.values()),
        );
        console.groupEnd();
      }
    },

    showConfig: () => {
      if (hugin.debug instanceof DebugImplementation) {
        console.table(hugin.debug.getConfig());
      }
    },
  };

  console.log("🐦 Hugin Intelligence Layer loaded");
  console.log("💡 Access configuration via window.__hugin");
}

// ==================================================================================
// EXPORTS
// ==================================================================================

export type { HuginAPI, DebugAPI, FrameworkComponent } from "./types.js";
export { DEFAULT_DEBUG_CONFIG };
