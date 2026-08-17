// ==================================================================================
// DEPENDENCY REGISTRY - Framework Infrastructure for Third-Party Dependencies
// ==================================================================================
// Provides tile-owned dependency management with framework-level orchestration.
// Tiles declare their dependencies, framework handles loading and deduplication.
//
// Key Features:
// - Tiles own their dependencies (self-contained, CDN-distributable)
// - Framework provides deduplication (same dep loaded once)
// - Security tracking infrastructure (ready for future SRI, CSP, auditing)
// - Status subscriptions for reactive UI updates
//
// Usage:
//   // At module level in tile
//   DependencyRegistry.register({ id: 'pdfjs', ... });
//
//   // In tile constructor
//   await DependencyRegistry.require('pdfjs');
//
// See: /docs/frontend/yggdrasil/02-architecture/dependency-system.md

import { hugin } from "../hugin/index.js";

// ==================================================================================
// HUGIN REGISTRATION
// ==================================================================================

const COMPONENT_NAME = "DependencyRegistry";
hugin.debug.registerComponent(COMPONENT_NAME, true);

// ==================================================================================
// TYPES
// ==================================================================================

/**
 * Security metadata for third-party dependencies
 *
 * TODO: Expand this interface when implementing security features:
 * - SRI (Subresource Integrity) hash verification
 * - CSP (Content Security Policy) directive generation
 * - Origin validation and allowlisting
 * - Sandbox isolation for untrusted code
 */
export interface DependencySecurityInfo {
  /** Expected global variable name (for validation) */
  globalName: string;

  // Future security fields (placeholder for now)
  // integrity?: string;           // SRI hash
  // allowedOrigins?: string[];    // Trusted CDN origins
  // sandboxed?: boolean;          // iframe isolation
}

/**
 * Definition of a third-party dependency
 *
 * Tiles register these at module level to declare their requirements.
 * The framework handles loading, deduplication, and lifecycle.
 */
export interface DependencyDefinition {
  /** Unique identifier for this dependency */
  id: string;

  /** Human-readable name */
  name: string;

  /** Version string for tracking/debugging */
  version: string;

  // ==================================================================================
  // Loading Configuration
  // ==================================================================================

  /** CDN URL for script (mutually exclusive with bundled) */
  cdnUrl?: string;

  /** Additional script URL (e.g., worker script for PDF.js) */
  workerUrl?: string;

  /** Whether to load from bundled source instead of CDN */
  bundled?: boolean;

  /** Import path if bundled (for dynamic import) */
  bundledImport?: string;

  // ==================================================================================
  // Security (placeholder for future implementation)
  // ==================================================================================

  /** Security metadata - required but can be minimal for now */
  security: DependencySecurityInfo;

  // ==================================================================================
  // Lifecycle Hooks
  // ==================================================================================

  /**
   * Called after script loads to perform library-specific setup
   * Receives the global object (e.g., window.pdfjsLib)
   */
  onLoad?: (global: any) => void | Promise<void>;

  /**
   * Called to validate the library loaded correctly
   * Return true if valid, false if something is wrong
   */
  validate?: (global: any) => boolean;
}

/**
 * Loading status of a dependency
 */
export type DependencyStatus = "pending" | "loading" | "ready" | "failed";

/**
 * Internal state for a registered dependency
 */
export interface DependencyState {
  definition: DependencyDefinition;
  status: DependencyStatus;
  error?: string;
  loadedAt?: number;
  loadDuration?: number;
}

/**
 * Callback type for dependency status subscriptions
 */
type DependencySubscriber = (state: DependencyState) => void;

// ==================================================================================
// DEPENDENCY REGISTRY IMPLEMENTATION
// ==================================================================================

/**
 * Framework-level registry for third-party dependencies
 *
 * Singleton pattern - all tiles share the same registry.
 * This enables deduplication and centralized tracking.
 */
class DependencyRegistryImpl {
  /** Registered dependencies and their states */
  private dependencies = new Map<string, DependencyState>();

  /** In-flight loading promises (for deduplication) */
  private loadPromises = new Map<string, Promise<void>>();

  /** Subscribers per dependency */
  private subscribers = new Map<string, Set<DependencySubscriber>>();

  // ==================================================================================
  // PUBLIC API
  // ==================================================================================

  /**
   * Register a dependency definition
   *
   * Call this at module level in your tile to declare dependencies.
   * Does not load - just declares that this dependency exists.
   *
   * @param definition - The dependency definition
   */
  register(definition: DependencyDefinition): void {
    if (this.dependencies.has(definition.id)) {
      // Already registered - check if it's the same version
      const existing = this.dependencies.get(definition.id)!;
      if (existing.definition.version !== definition.version) {
        hugin.debug.log(COMPONENT_NAME, "Version mismatch for dependency", {
          id: definition.id,
          existingVersion: existing.definition.version,
          newVersion: definition.version,
        });
        // For now, keep the first registration (future: version resolution)
      }
      return;
    }

    const state: DependencyState = {
      definition,
      status: "pending",
    };

    this.dependencies.set(definition.id, state);

    hugin.debug.log(COMPONENT_NAME, "Dependency registered", {
      id: definition.id,
      name: definition.name,
      version: definition.version,
      source: definition.bundled ? "bundled" : "cdn",
    });
  }

  /**
   * Request a dependency be loaded
   *
   * Returns immediately if already loaded.
   * Deduplicates concurrent requests for the same dependency.
   *
   * @param id - Dependency ID
   * @returns Promise that resolves when dependency is ready
   * @throws Error if dependency is not registered or fails to load
   */
  async require(id: string): Promise<void> {
    const state = this.dependencies.get(id);

    if (!state) {
      throw new Error(
        `Dependency '${id}' not registered. ` +
          `Call DependencyRegistry.register() at module level first.`,
      );
    }

    // Already loaded
    if (state.status === "ready") {
      return;
    }

    // Already failed
    if (state.status === "failed") {
      throw new Error(`Dependency '${id}' failed to load: ${state.error}`);
    }

    // Already loading - return existing promise
    if (this.loadPromises.has(id)) {
      return this.loadPromises.get(id)!;
    }

    // Start loading
    const loadPromise = this.loadDependency(id, state);
    this.loadPromises.set(id, loadPromise);

    try {
      await loadPromise;
    } finally {
      // Clean up promise reference (success or failure)
      this.loadPromises.delete(id);
    }
  }

  /**
   * Check if a dependency is ready (synchronous)
   *
   * Use this for conditional rendering without awaiting.
   *
   * @param id - Dependency ID
   * @returns true if dependency is loaded and ready
   */
  isReady(id: string): boolean {
    const state = this.dependencies.get(id);
    return state?.status === "ready";
  }

  /**
   * Get the status of a dependency
   *
   * @param id - Dependency ID
   * @returns The current status, or undefined if not registered
   */
  getStatus(id: string): DependencyStatus | undefined {
    return this.dependencies.get(id)?.status;
  }

  /**
   * Get the global object for a loaded dependency
   *
   * @param id - Dependency ID
   * @returns The global object (e.g., window.pdfjsLib)
   * @throws Error if not ready - use isReady() first or await require()
   */
  get<T = any>(id: string): T {
    const state = this.dependencies.get(id);

    if (!state) {
      throw new Error(`Dependency '${id}' not registered`);
    }

    if (state.status !== "ready") {
      throw new Error(
        `Dependency '${id}' not ready (status: ${state.status}). ` +
          `Use isReady() or await require() first.`,
      );
    }

    const globalName = state.definition.security.globalName;
    return (window as any)[globalName] as T;
  }

  /**
   * Subscribe to dependency status changes
   *
   * Useful for reactive UI updates when dependencies load.
   *
   * @param id - Dependency ID
   * @param callback - Called when status changes
   * @returns Unsubscribe function
   */
  subscribe(id: string, callback: DependencySubscriber): () => void {
    if (!this.subscribers.has(id)) {
      this.subscribers.set(id, new Set());
    }

    this.subscribers.get(id)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(id)?.delete(callback);
    };
  }

  /**
   * Get all registered dependencies (for debugging/auditing)
   */
  getAll(): Map<string, DependencyState> {
    return new Map(this.dependencies);
  }

  // ==================================================================================
  // PRIVATE IMPLEMENTATION
  // ==================================================================================

  /**
   * Load a dependency from CDN or bundled source
   */
  private async loadDependency(
    id: string,
    state: DependencyState,
  ): Promise<void> {
    const { definition } = state;
    const startTime = performance.now();

    // Update status to loading
    this.updateStatus(id, "loading");

    hugin.debug.log(COMPONENT_NAME, "Loading dependency", {
      id,
      name: definition.name,
      version: definition.version,
      source: definition.bundled ? "bundled" : definition.cdnUrl,
    });

    try {
      if (definition.bundled && definition.bundledImport) {
        // Dynamic import for bundled dependencies
        // @vite-ignore - intentional dynamic import path
        await import(/* @vite-ignore */ definition.bundledImport);
      } else if (definition.cdnUrl) {
        // Load from CDN
        await this.loadScript(definition.cdnUrl);
      } else {
        throw new Error(`No loading source specified for '${id}'`);
      }

      // Get the global object
      const globalName = definition.security.globalName;
      const global = (window as any)[globalName];

      if (!global) {
        throw new Error(
          `Global '${globalName}' not found after loading '${id}'`,
        );
      }

      // Run validation if provided
      if (definition.validate && !definition.validate(global)) {
        throw new Error(`Validation failed for '${id}'`);
      }

      // Run onLoad hook if provided
      if (definition.onLoad) {
        await definition.onLoad(global);
      }

      // Calculate load duration
      const loadDuration = performance.now() - startTime;

      // Update state to ready
      state.status = "ready";
      state.loadedAt = Date.now();
      state.loadDuration = loadDuration;
      this.notifySubscribers(id, state);

      hugin.debug.log(COMPONENT_NAME, "Dependency loaded successfully", {
        id,
        name: definition.name,
        version: definition.version,
        loadDuration: `${loadDuration.toFixed(0)}ms`,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      state.status = "failed";
      state.error = errorMessage;
      this.notifySubscribers(id, state);

      hugin.debug.log(COMPONENT_NAME, "Dependency load failed", {
        id,
        name: definition.name,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Load a script from URL
   */
  private loadScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;

      // TODO: Add SRI integrity attribute when security info is populated
      // if (integrity) {
      //   script.integrity = integrity;
      //   script.crossOrigin = 'anonymous';
      // }

      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${url}`));

      document.head.appendChild(script);
    });
  }

  /**
   * Update dependency status and notify subscribers
   */
  private updateStatus(id: string, status: DependencyStatus): void {
    const state = this.dependencies.get(id);
    if (state) {
      state.status = status;
      this.notifySubscribers(id, state);
    }
  }

  /**
   * Notify all subscribers of a dependency state change
   */
  private notifySubscribers(id: string, state: DependencyState): void {
    const subs = this.subscribers.get(id);
    if (subs) {
      subs.forEach((callback) => {
        try {
          callback(state);
        } catch (error) {
          hugin.debug.log(COMPONENT_NAME, "Subscriber callback error", {
            id,
            error: error instanceof Error ? error.message : error,
          });
        }
      });
    }
  }
}

// ==================================================================================
// SINGLETON EXPORT
// ==================================================================================

/**
 * Global dependency registry instance
 *
 * Import and use directly:
 *   import { DependencyRegistry } from "../yggdrasil/dependencies/DependencyRegistry.js";
 *   DependencyRegistry.register({ ... });
 *   await DependencyRegistry.require('pdfjs');
 */
export const DependencyRegistry = new DependencyRegistryImpl();
