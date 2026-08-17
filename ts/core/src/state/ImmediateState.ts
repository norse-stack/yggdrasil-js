// Framework imports
import type { StateEvent, TileLayout, LoadingStatus } from "../types.js";
import { hugin, IMMEDIATE_STATE } from "../hugin/index.js";
import { registerThemeState } from "../theme/ThemeState.js";
// Application imports
import type {} from "../types.js";

// ==================================================================================
// @SECTION: Auto-Reactive State Utilities
// AUTO-REACTIVE TILE STATE - "Small Worlds" Pattern
// See: /docs/frontend/yggdrasil/roadmap/auto-reactive-tile-state.md
// ==================================================================================

/**
 * Configuration for createReactiveState
 */
export interface ReactiveStateConfig {
  /** Namespace for notifications (e.g., "graphTile") */
  namespace: string;
  /** Function to call when state changes - typically notifyListeners */
  notify: (query: string) => void;
  /** Property names that should NOT trigger notifications (e.g., cached/derived values) */
  exclude?: string[];
}

/**
 * Creates a reactive state object that auto-notifies on property changes.
 *
 * PHASE 1 of Auto-Reactive Tile State upgrade.
 *
 * Wraps a plain state object in a Proxy that:
 * - Intercepts all property assignments
 * - Calls notify() when a property changes (unless excluded)
 * - Uses shallow equality check to avoid spurious notifications
 *
 * @example
 * ```typescript
 * const state = createReactiveState(
 *   { zoom: 1.0, frozen: false },
 *   {
 *     namespace: "graphTile",
 *     notify: (query) => immediateState.notifyListeners(query),
 *     exclude: ["cachedLayout"]  // Won't trigger notifications
 *   }
 * );
 *
 * // Now setters become simple:
 * state.zoom = 1.5;  // Auto-notifies "graphTile.zoom"
 * ```
 */
export function createReactiveState<T extends object>(
  initialState: T,
  config: ReactiveStateConfig,
): T {
  const { namespace, notify, exclude = [] } = config;

  return new Proxy(initialState, {
    set(target, prop, value) {
      const propName = String(prop);
      const oldValue = (target as Record<string, unknown>)[propName];

      // Always set the value
      (target as Record<string, unknown>)[propName] = value;

      // Only notify if:
      // 1. Value actually changed (shallow equality)
      // 2. Property is not excluded
      if (oldValue !== value && !exclude.includes(propName)) {
        // Derive the getter name from property name
        // Convention: property "zoom" → getter "getZoom", property "frozen" → getter "isFrozen"
        const getterName = deriveGetterName(propName);
        const query = `${namespace}.${getterName}`;

        hugin.debug.log(IMMEDIATE_STATE, `[Auto-Reactive] ${query}`, {
          oldValue,
          newValue: value,
        });

        notify(query);
      }

      return true;
    },
  });
}

/**
 * Derives the getter name from a property name following Yggdrasil conventions:
 * - Boolean properties starting with "is" or ending with common patterns → "is{Property}"
 * - Other properties → "get{Property}"
 *
 * Examples:
 *   "zoom" → "getZoom"
 *   "frozen" → "isFrozen"
 *   "panelOpen" → "isPanelOpen"
 *   "currentPage" → "getCurrentPage"
 *   "bboxVisible" → "isBboxVisible"
 */
function deriveGetterName(propName: string): string {
  // Common boolean suffixes/patterns
  const booleanPatterns = [
    "Open",
    "Visible",
    "Frozen",
    "Ready",
    "Loading",
    "Processing",
    "Enabled",
    "Disabled",
    "Active",
    "Selected",
    "Expanded",
    "Collapsed",
  ];

  // Check if property looks like a boolean (ends with common boolean suffix)
  const looksLikeBoolean = booleanPatterns.some(
    (pattern) =>
      propName.endsWith(pattern) ||
      propName.toLowerCase().endsWith(pattern.toLowerCase()),
  );

  // Capitalize first letter
  const capitalized = propName.charAt(0).toUpperCase() + propName.slice(1);

  return looksLikeBoolean ? `is${capitalized}` : `get${capitalized}`;
}

/**
 * Configuration for auto-subscribing a tile to its own state
 */
export interface AutoSubscribeConfig {
  /** The tile ID that owns this state */
  tileId: string;
  /** Function to schedule render for the tile */
  scheduleRender: (tileId: string) => void;
  /** Getter names that should NOT trigger re-renders (e.g., debug getters) */
  excludeFromRender?: string[];
}

/**
 * Auto-subscribes a tile to all its registered state getters.
 *
 * PHASE 2 of Auto-Reactive Tile State upgrade.
 *
 * The "Small Worlds" insight: tiles almost always need to re-render when
 * their own state changes. This function eliminates the boilerplate of
 * manually subscribing to each getter.
 *
 * Internal state: Opt-OUT (auto-subscribe by default)
 * External state: Opt-IN (explicit subscriptions for cross-tile deps)
 *
 * @example
 * ```typescript
 * // In tile constructor, after registering state:
 * autoSubscribeTile(immediateState, {
 *   tileId: TILE_ID,
 *   scheduleRender: (id) => tilingManager.scheduleRender(id),
 *   excludeFromRender: ["getDebugInfo"]  // Won't trigger re-render
 * });
 * ```
 */
export function autoSubscribeTile(
  immediateState: ImmediateState,
  config: AutoSubscribeConfig,
): void {
  const { tileId, scheduleRender, excludeFromRender = [] } = config;

  // Get the registered tile state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tileState = (immediateState as any)[tileId];
  if (!tileState || typeof tileState !== "object") {
    hugin.debug.log(
      IMMEDIATE_STATE,
      `[Auto-Subscribe] No state found for tile: ${tileId}`,
    );
    return;
  }

  // Find all getter methods (functions starting with "get" or "is")
  const getterNames = Object.keys(tileState).filter((key) => {
    const value = (tileState as Record<string, unknown>)[key];
    return (
      typeof value === "function" &&
      (key.startsWith("get") || key.startsWith("is"))
    );
  });

  // Subscribe to each getter
  for (const getterName of getterNames) {
    if (excludeFromRender.includes(getterName)) {
      hugin.debug.log(
        IMMEDIATE_STATE,
        `[Auto-Subscribe] Excluding ${tileId}.${getterName} from auto-render`,
      );
      continue;
    }

    const query = `${tileId}.${getterName}`;

    immediateState.subscribe(query, () => {
      hugin.debug.log(
        IMMEDIATE_STATE,
        `[Auto-Subscribe] ${query} → scheduleRender(${tileId})`,
      );
      scheduleRender(tileId);
    });

    hugin.debug.log(
      IMMEDIATE_STATE,
      `[Auto-Subscribe] Registered: ${query} → render`,
    );
  }

  hugin.debug.log(
    IMMEDIATE_STATE,
    `[Auto-Subscribe] ${tileId}: ${getterNames.length} getters auto-subscribed`,
  );
}

// ==================================================================================
// @SECTION: Immediate State
// IMMEDIATE STATE - Frontend Authority
// ==================================================================================

export class ImmediateState {
  // Clean framework state - no tile-specific code!
  private focusedTile: string | null = null;
  private tileLayout: TileLayout = "split-horizontal";
  private loadingStatus: LoadingStatus = "idle";
  private errorMessage: string | null = null;

  constructor() {
    // Register framework-level state namespaces
    // Theme is framework-level - available to all tiles
    registerThemeState(this, (query: string) => this.notifyListeners(query));
  }

  // ==================================================================================
  // BROWSER FOCUS STATE
  // ==================================================================================
  // This is intentionally NON-REACTIVE. Focus state is used by the RenderingEngine
  // to skip swapping components that the user is actively interacting with.
  // We don't want focus changes to trigger re-renders - that would cause focus loss!
  readonly focus = {
    /** The muninId of the component containing the focused element */
    muninId: null as string | null,

    /**
     * Set focus from an element - finds the closest munin component and stores its muninId.
     * Does NOT trigger re-render.
     * @param element - The focused element (e.g., from e.target in onfocus)
     */
    setFromElement: (element: HTMLElement | null) => {
      if (!element) {
        this.focus.muninId = null;
        return;
      }
      const muninComponent = element.closest("[data-munin-component]");
      this.focus.muninId =
        muninComponent?.getAttribute("data-munin-component") || null;
    },

    /** Clear focus tracking */
    clear: () => {
      this.focus.muninId = null;
    },
  };

  private listeners = new Map<string, Function[]>();
  private eventHistory: StateEvent[] = [];

  // NEW: Registration system for tiles
  registerTile(interfaceName: string, tileState: any): void {
    // Dynamically add tile state to this object
    (this as any)[interfaceName] = tileState;
    hugin.debug.log("ImmediateState", `Registered tile: ${interfaceName}`);
  }

  // Public method for tiles to trigger notifications
  notifyListeners(targetQuery?: keyof typeof this.queries | string): void {
    if (targetQuery) {
      // Targeted notification - only notify listeners for specific query
      const callbacks = this.listeners.get(targetQuery as string);
      if (callbacks) {
        const event = this.createEvent(targetQuery as string);
        this.eventHistory.push(event);
        hugin.debug.log(IMMEDIATE_STATE, "Notifying listeners for query", {
          targetQuery,
          listenerCount: callbacks.length,
        });
        callbacks.forEach((cb) => cb(event));
      }
    } else {
      // Broadcast notification - notify all listeners (used for initialization)
      hugin.debug.log(IMMEDIATE_STATE, "Broadcasting to all listeners", {
        queryTypesCount: this.listeners.size,
      });

      for (const [queryKey, callbacks] of this.listeners) {
        const event = this.createEvent(queryKey);
        this.eventHistory.push(event);
        hugin.debug.log(IMMEDIATE_STATE, "Notifying listeners for query", {
          queryKey,
          listenerCount: callbacks.length,
        });
        callbacks.forEach((cb) => cb(event));
      }
    }
  }

  // Framework-only methods (no tile-specific knowledge)
  getFocusedTile(): string | null {
    return this.focusedTile;
  }

  getTileLayout(): TileLayout {
    return this.tileLayout;
  }

  getLoadingStatus(): LoadingStatus {
    return this.loadingStatus;
  }

  getErrorMessage(): string | null {
    return this.errorMessage;
  }

  // Framework queries (no tile-specific knowledge)
  readonly queries = {
    getFocusedTile: () => this.focusedTile,
    getTileLayout: () => this.tileLayout,
    getLoadingStatus: () => this.loadingStatus,
  };

  setFocusedTile(tileId: string) {
    this.focusedTile = tileId;
    this.persistToLocal();
    this.notifyListeners("getFocusedTile");
  }

  setTileLayout(layout: TileLayout) {
    this.tileLayout = layout;
    this.persistToLocal();
    this.notifyListeners("getTileLayout");
  }

  setLoadingStatus(status: LoadingStatus, errorMessage?: string) {
    this.loadingStatus = status;
    this.errorMessage = errorMessage || null;

    // Don't persist loading states - they're ephemeral
    this.notifyListeners("getLoadingStatus");
  }

  // Subscription system for reactive updates
  subscribe(
    query: keyof typeof this.queries | string,
    callback: (event: StateEvent) => void,
  ): () => void {
    const queryKey = query as string;

    if (!this.listeners.has(queryKey)) {
      this.listeners.set(queryKey, []);
    }

    this.listeners.get(queryKey)!.push(callback);

    // Call immediately with current value as event
    const currentEvent = this.createEvent(query as string);
    this.eventHistory.push(currentEvent); // Log the immediate event
    callback(currentEvent);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(queryKey);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  private createEvent(query: string): StateEvent {
    let data: any = null;

    // Handle framework queries
    if (query in this.queries) {
      data = this.queries[query as keyof typeof this.queries]();
    } else {
      // Handle tile queries (e.g., "pdfTile.getCurrentPage")
      const [tileName, methodName] = query.split(".");
      if (tileName && methodName && (this as any)[tileName]) {
        const tileState = (this as any)[tileName];
        if (typeof tileState[methodName] === "function") {
          data = tileState[methodName]();
        }
      }
    }

    return {
      id: crypto.randomUUID(),
      type: query,
      timestamp: Date.now(),
      stateId: "immediate-state",
      data,
    };
  }

  // Debugging methods - available in console
  getEventHistory(): StateEvent[] {
    return [...this.eventHistory];
  }

  getEventsAfter(timestamp: number): StateEvent[] {
    return this.eventHistory.filter((e) => e.timestamp > timestamp);
  }

  getRecentEvents(milliseconds: number = 1000): StateEvent[] {
    const cutoff = Date.now() - milliseconds;
    return this.eventHistory.filter((e) => e.timestamp > cutoff);
  }

  // Local persistence (Framework state only - tiles handle their own persistence)
  persistToLocal() {
    const immediateData = {
      // Global framework state only
      focusedTile: this.focusedTile,
      tileLayout: this.tileLayout,
    };

    localStorage.setItem(
      "yggdrasil-immediate-state",
      JSON.stringify(immediateData),
    );
  }

  // Initialize framework state from local storage
  initializeFromStorage() {
    try {
      const stored = localStorage.getItem("yggdrasil-immediate-state");
      if (stored) {
        const immediateData = JSON.parse(stored);

        // Global framework state only
        this.focusedTile = immediateData.focusedTile || null;
        this.tileLayout = immediateData.tileLayout || "split-horizontal";

        this.notifyListeners();
      }
    } catch (error) {
      hugin.debug.log(IMMEDIATE_STATE, "Failed to load from localStorage", {
        error: error instanceof Error ? error.message : error,
      });
    }
  }
}
