// ==================================================================================
// RENDERING ENGINE - Framework Infrastructure for Layer Lifecycle & DOM Updates
// ==================================================================================
// The central rendering coordinator for Yggdrasil applications.
// Handles layer lifecycle, surgical DOM updates, and persistent layer delegation.
//
// Progressive Enhancement API:
// - Level 1: munin`...`.collect()                    → renderFragment(fragment)
// - Level 2: munin.inTile().layer().collectLayers()  → renderLayers(fragments, layersToUpdate?)
// - Level 3: munin.inTile().layer().collectComponents() → renderComponents(fragments, tree, layersToUpdate?)
//
// Each level adds capability while rewarding the developer with performance gains.
// See: /docs/frontend/refactoring/RenderingEngine-Architecture.md

import type { EventualState } from "../state/EventualState.js";
import type { ImmediateState } from "../state/ImmediateState.js";
import { PersistentLayerManager } from "./PersistentLayerManager.js";
import { hugin } from "../hugin/index.js";
import { sortChangedIds } from "../munin/sort-strategies.js";
import { isChildOfSwapped, getDepth } from "../munin/munin-utils.js";

/**
 * Tree entry structure from Munin - includes cache key and optional CSS variables
 */
type TreeEntry = { cacheKey: string; cssVars?: Record<string, string> };
// TODO: Add these rendering metrics to hugin
// import { incrementRenderCount } from "../../../lib/metrics.js";

// ==================================================================================
// RENDERING ENGINE
// ==================================================================================

export class RenderingEngine {
  // ==================================================================================
  // HUGIN REGISTRATION - Register this component for debugging
  // ==================================================================================
  private static readonly COMPONENT_NAME = "RenderingEngine";
  static {
    hugin.debug.registerComponent(RenderingEngine.COMPONENT_NAME, true);
  }

  private persistentLayerManager: PersistentLayerManager;
  private immediateState: ImmediateState;

  // PHASE 2 STEP 4: Store old tree for change detection
  // Now includes CSS variables for style-only updates
  private oldTree: Record<string, Record<string, TreeEntry>> = {};

  // SEED HANDOFF: Track if we've cleared seed content yet
  private seedCleared = false;

  /**
   * Flow metadata for grid-based layout
   */
  private flowDirection?: "x" | "y";
  private flowLayers: string[] = [];

  constructor(
    private container: HTMLElement,
    private layerContainers: Record<string, HTMLElement>,
    eventualState: EventualState,
    immediateState: ImmediateState,
    private tileId: string,
    flowConfig?: { flowDirection?: "x" | "y"; flowLayers: string[] },
  ) {
    // Store immediateState for focus-aware rendering
    this.immediateState = immediateState;

    // Initialize persistent layer manager for lifecycle delegation
    this.persistentLayerManager = new PersistentLayerManager(
      eventualState,
      immediateState,
    );

    // Store flow configuration
    if (flowConfig) {
      this.flowDirection = flowConfig.flowDirection;
      this.flowLayers = flowConfig.flowLayers;
    }

    // Setup container for Munin layer management
    this.setupContainer();

    // hugin.debug.log(RenderingEngine.COMPONENT_NAME, "Initialized for tile", {
    //   tileId,
    //   layerCount: Object.keys(layerContainers).length,
    //   layers: Object.keys(layerContainers),
    // });
  }

  /**
   * Setup container with Munin classes and flow attributes
   *
   * NOTE: Seed content is NOT cleared here - we wait until first render
   * so the browser has a chance to paint the seed first.
   *
   * See: /docs/yggdrasil/02-architecture/01-systems/07-seed-rendering.md
   */
  private setupContainer(): void {
    // Add Munin container class
    this.container.classList.add("munin-layered-container");

    // Add flow attributes if flow layers are present
    if (this.flowDirection && this.flowLayers.length > 0) {
      this.container.dataset.hasFlow = "true";
      // Container uses "z" to indicate it has flow layers but delegates direction to individual layers
      this.container.dataset.flowDirection = "z";

      hugin.debug.log(
        RenderingEngine.COMPONENT_NAME,
        "Container configured with flow",
        {
          tileId: this.tileId,
          flowDirection: this.flowDirection,
          flowLayers: this.flowLayers,
        },
      );
    }
  }

  /**
   * Clear seed content on first render
   *
   * SEED HANDOFF: Called once on first render to clear any pre-rendered
   * seed content. By waiting until first render, we give the browser
   * a chance to paint the seed before the tile takes over.
   *
   * See: /docs/yggdrasil/02-architecture/01-systems/07-seed-rendering.md
   */
  private clearSeedIfNeeded(): void {
    if (!this.seedCleared) {
      this.container.innerHTML = "";
      this.seedCleared = true;
      hugin.debug.log(
        RenderingEngine.COMPONENT_NAME,
        "Seed cleared on first render",
        {
          tileId: this.tileId,
        },
      );
    }
  }

  // ==================================================================================
  // PUBLIC API - Progressive Enhancement Pattern
  // ==================================================================================
  // Level 1: renderFragment()    - Simple full replacement
  // Level 2: renderLayers()      - Layer-level granularity
  // Level 3: renderComponents()  - Surgical component updates
  // ==================================================================================

  /**
   * LEVEL 1: Simple full replacement
   *
   * Use with: munin`...`.collect()
   *
   * Replaces entire container content. Simplest API, good starting point.
   * Upgrade path: When you need layers, switch to renderLayers()
   *
   * @param fragment - Fragment from munin`...`.collect()
   */
  renderFragment(fragment: DocumentFragment): void {
    // 🎯 SEED HANDOFF: Clear seed on first render
    this.clearSeedIfNeeded();

    hugin.debug.log(RenderingEngine.COMPONENT_NAME, "renderFragment", {
      tileId: this.tileId,
      hasContent: fragment.hasChildNodes(),
    });

    // Cleanup old resources
    const oldCleanup = (this.container as any).__muninCleanup;
    if (oldCleanup) {
      oldCleanup.clearAll();
    }

    // Full replacement
    // incrementRenderCount();
    this.container.replaceChildren(...fragment.childNodes);

    // Transfer cleanup info
    const newCleanup = (fragment as any).__muninCleanup;
    if (newCleanup) {
      (this.container as any).__muninCleanup = newCleanup;
    }
  }

  /**
   * LEVEL 2: Layer-level granularity
   *
   * Use with: munin.inTile('x').layer(...).collectLayers()
   *
   * Updates layers independently. Layers not in layersToUpdate are skipped.
   * Upgrade path: When layers have many components, switch to renderComponents()
   *
   * @param fragments - Fragments from collectLayers().fragments
   * @param layersToUpdate - Optional subset of layers to update
   */
  renderLayers(
    fragments: Record<string, DocumentFragment>,
    layersToUpdate?: string[],
  ): void {
    // 🎯 SEED HANDOFF: Clear seed on first render
    this.clearSeedIfNeeded();

    const toUpdate = layersToUpdate || Object.keys(fragments);

    hugin.debug.log(RenderingEngine.COMPONENT_NAME, "renderLayers", {
      tileId: this.tileId,
      layersToUpdate: toUpdate,
      totalFragments: Object.keys(fragments).length,
    });

    toUpdate.forEach((layerName) => {
      const fragment = fragments[layerName];
      const container = this.layerContainers[layerName];

      if (!fragment || !container) {
        return;
      }

      const hasContent = fragment.hasChildNodes();

      if (hasContent) {
        this.updateLayer(layerName, fragment, container);
      } else {
        this.unmountLayer(layerName, container);
      }
    });
  }

  /**
   * LEVEL 3: Surgical component updates
   *
   * Use with: munin.inTile('x').layer(...).collectComponents()
   *
   * Diffs component trees, only swaps what changed. Branch pruning,
   * focus preservation, maximum efficiency.
   *
   * CSS Variable Support: When cache keys match but CSS variables differ,
   * only the style is updated (no DOM replacement). This enables CSS
   * transitions while maintaining stable element identity.
   *
   * @param fragments - Fragments from collectComponents().fragments
   * @param tree - Component trees from collectComponents().tree
   * @param layersToUpdate - Optional subset of layers to update
   */
  renderComponents(
    fragments: Record<string, DocumentFragment>,
    tree: Record<string, Record<string, TreeEntry>>,
    layersToUpdate?: string[],
  ): void {
    // 🎯 SEED HANDOFF: Clear seed on first render
    this.clearSeedIfNeeded();

    const toUpdate = layersToUpdate || Object.keys(fragments);

    hugin.debug.log(RenderingEngine.COMPONENT_NAME, "renderComponents", {
      tileId: this.tileId,
      layersToUpdate: toUpdate,
      totalFragments: Object.keys(fragments).length,
    });

    toUpdate.forEach((layerName) => {
      const fragment = fragments[layerName];
      const container = this.layerContainers[layerName];

      if (!fragment || !container) {
        return;
      }

      const hasContent = fragment.hasChildNodes();

      if (hasContent) {
        if (tree[layerName]) {
          this.updateLayerSurgical(
            layerName,
            fragment,
            container,
            tree[layerName],
          );
        } else {
          // Fallback to layer-level update if no tree for this layer
          this.updateLayer(layerName, fragment, container);
        }
      } else {
        this.unmountLayer(layerName, container);
      }
    });
  }

  /**
   * Set up reactive updates for a specific persistent layer
   *
   * @param layerName - Name of the layer to set up subscriptions for
   * @param config - State paths and debounce configuration
   */
  setupPersistentLayerSubscriptions(
    layerName: string,
    config: {
      eventualPaths?: string[];
      immediatePaths?: string[];
      debounceMs?: number;
    },
  ): boolean {
    const container = this.layerContainers[layerName];

    if (!container) {
      // hugin.debug.log(
      //   RenderingEngine.COMPONENT_NAME,
      //   "Layer container not found",
      //   {
      //     tileId: this.tileId,
      //     layerName,
      //   },
      // );
      return false;
    }

    const success = this.persistentLayerManager.setupReactiveUpdates(
      container,
      config,
    );

    // if (success) {
    //   hugin.debug.log(
    //     RenderingEngine.COMPONENT_NAME,
    //     "Persistent layer subscriptions configured",
    //     {
    //       tileId: this.tileId,
    //       layerName,
    //       eventualPaths: config.eventualPaths,
    //       immediatePaths: config.immediatePaths,
    //     },
    //   );
    // }

    return success;
  }

  /**
   * Cleanup all resources
   * Call this in tile.cleanup()
   */
  cleanup(): void {
    // hugin.debug.log(RenderingEngine.COMPONENT_NAME, "Cleaning up resources", {
    //   tileId: this.tileId,
    // });

    this.persistentLayerManager.cleanup();

    // hugin.debug.log(RenderingEngine.COMPONENT_NAME, "Cleanup complete", {
    //   tileId: this.tileId,
    // });
  }

  // ==================================================================================
  // PRIVATE LAYER UPDATE LOGIC
  // ==================================================================================

  /**
   * PHASE 3: Detect component changes using set operations
   * Categorizes changes into removed, added, changed, and styleOnly components
   *
   * @param oldTree - Previous tree (muninId -> TreeEntry mapping)
   * @param newTree - New tree (muninId -> TreeEntry mapping)
   * @returns Object with removed, added, changed, and styleOnly component IDs
   */
  private detectComponentChanges(
    oldTree: Record<string, TreeEntry>,
    newTree: Record<string, TreeEntry>,
  ): {
    removed: string[];
    added: string[];
    changed: string[];
    styleOnly: string[]; // Components where only CSS variables changed
  } {
    const oldIds = new Set(Object.keys(oldTree));
    const newIds = new Set(Object.keys(newTree));

    // Components that disappeared
    const removed = [...oldIds].filter((id) => !newIds.has(id));

    // Components that appeared
    const added = [...newIds].filter((id) => !oldIds.has(id));

    // Components that exist in both - check what changed
    const changed: string[] = [];
    const styleOnly: string[] = [];

    for (const id of newIds) {
      if (!oldIds.has(id)) continue; // Already in 'added'

      const oldEntry = oldTree[id];
      const newEntry = newTree[id];

      if (oldEntry.cacheKey !== newEntry.cacheKey) {
        // Cache key changed - full swap needed
        changed.push(id);
      } else if (this.cssVarsChanged(oldEntry.cssVars, newEntry.cssVars)) {
        // Cache key same but CSS vars changed - style-only update!
        styleOnly.push(id);
      }
      // Else: nothing changed, skip
    }

    // hugin.debug.log(
    //   RenderingEngine.COMPONENT_NAME,
    //   "Component change detection",
    //   {
    //     tileId: this.tileId,
    //     removed: removed.length,
    //     added: added.length,
    //     changed: changed.length,
    //     styleOnly: styleOnly.length,
    //     total: newIds.size,
    //   },
    // );

    return { removed, added, changed, styleOnly };
  }

  /**
   * Check if CSS variables changed between two entries
   */
  private cssVarsChanged(
    oldVars?: Record<string, string>,
    newVars?: Record<string, string>,
  ): boolean {
    // Both undefined = no change
    if (!oldVars && !newVars) return false;
    // One undefined, other not = change
    if (!oldVars || !newVars) return true;
    // Compare values
    const oldKeys = Object.keys(oldVars);
    const newKeys = Object.keys(newVars);
    if (oldKeys.length !== newKeys.length) return true;
    return oldKeys.some((key) => oldVars[key] !== newVars[key]);
  }

  /**
   * Apply CSS variables to a DOM element via style.setProperty
   * This is the key to enabling CSS transitions with reactive state!
   *
   * @param element - DOM element to update
   * @param cssVars - CSS custom properties to apply
   */
  private applyCssVars(
    element: HTMLElement,
    cssVars: Record<string, string>,
  ): void {
    for (const [varName, value] of Object.entries(cssVars)) {
      element.style.setProperty(varName, value);
    }
  }

  /**
   * Update CSS variables on components without DOM replacement
   * The element stays in place, only style changes → CSS transitions work!
   *
   * @param muninIds - Component IDs that need style-only updates
   * @param newTree - New tree with updated CSS variable values
   * @param layerContainer - Layer container for root component lookup
   */
  private updateCssVarsOnly(
    muninIds: string[],
    newTree: Record<string, TreeEntry>,
    layerContainer: HTMLElement,
  ): void {
    muninIds.forEach((muninId) => {
      const entry = newTree[muninId];
      if (!entry?.cssVars) return;

      const depth = getDepth(muninId);
      const isRootComponent = depth === 0;

      // Get the CSS variable names we're looking for
      const cssVarNames = Object.keys(entry.cssVars);

      // Find the DOM element that has these CSS variables in its style
      let domNode: HTMLElement | null = null;

      if (isRootComponent && layerContainer) {
        // Root component: search within layer container
        domNode = this.findElementWithCssVars(layerContainer, cssVarNames);
      } else {
        // Find the wrapper element with data-munin-component
        const wrapper = this.container.querySelector(
          `[data-munin-component="${muninId}"]`,
        ) as HTMLElement;

        if (wrapper) {
          // Search within the wrapper for the element with CSS vars
          domNode = this.findElementWithCssVars(wrapper, cssVarNames);
        }
      }

      if (domNode) {
        this.applyCssVars(domNode, entry.cssVars);
        hugin.debug.log(
          RenderingEngine.COMPONENT_NAME,
          "🎨 Style-only update (CSS vars)",
          {
            tileId: this.tileId,
            muninId,
            cssVars: entry.cssVars,
            targetElement: domNode.className,
          },
        );
      } else {
        hugin.debug.log(
          RenderingEngine.COMPONENT_NAME,
          "⚠️ Could not find element for CSS vars update",
          {
            tileId: this.tileId,
            muninId,
            cssVars: entry.cssVars,
          },
        );
      }
    });
  }

  /**
   * Find an element within a container that has specific CSS variables in its style attribute
   * This is needed because Munin wraps components in display:contents divs, so the actual
   * element with CSS vars is a child of the wrapper.
   */
  private findElementWithCssVars(
    container: HTMLElement,
    cssVarNames: string[],
  ): HTMLElement | null {
    // Build a selector that matches elements with any of the CSS vars in their style
    // e.g., [style*="--panel-open"]
    for (const varName of cssVarNames) {
      const selector = `[style*="${varName}"]`;
      const element = container.querySelector(selector) as HTMLElement;
      if (element) {
        return element;
      }
    }

    // Fallback: check the container itself
    const containerStyle = container.getAttribute("style") || "";
    for (const varName of cssVarNames) {
      if (containerStyle.includes(varName)) {
        return container;
      }
    }

    return null;
  }

  /**
   * PHASE 3: Remove components from DOM with cleanup
   *
   * @param muninIds - Array of muninIds to remove
   */
  private removeComponents(muninIds: string[]): void {
    muninIds.forEach((muninId) => {
      const domNode = this.container.querySelector(
        `[data-munin-component="${muninId}"]`,
      ) as HTMLElement;

      if (domNode) {
        // Cleanup resources
        const cleanup = (domNode as any).__muninCleanup;
        if (cleanup) {
          cleanup.clearAll();
        }

        // Remove from DOM
        domNode.remove();

        // hugin.debug.log(RenderingEngine.COMPONENT_NAME, "Removed component", {
        //   tileId: this.tileId,
        //   muninId,
        // });
      }
    });
  }

  /**
   * PHASE 3: Add components to DOM at correct positions
   * Uses muninId structure to determine insertion point
   *
   * @param muninIds - Array of muninIds to add
   * @param freshFragment - Fragment containing new components
   */
  private addComponents(
    muninIds: string[],
    freshFragment: DocumentFragment,
  ): void {
    muninIds.forEach((muninId) => {
      // Parse position from muninId
      // Structure: branch-{layerName}-{hash}-0-1-2
      // Last number is position, everything before is parent
      // For first-level children: branch-controls-abc123-0 → parent is branch-controls-abc123
      const parts = muninId.split("-");
      const position = parseInt(parts[parts.length - 1]);
      const parentId = parts.slice(0, -1).join("-");

      // Find parent in DOM
      const parentNode = this.container.querySelector(
        `[data-munin-component="${parentId}"]`,
      ) as HTMLElement;

      if (!parentNode) {
        hugin.debug.log(
          RenderingEngine.COMPONENT_NAME,
          "Parent not found for new component",
          {
            tileId: this.tileId,
            muninId,
            parentId,
          },
        );
        return;
      }

      // Find new component in fresh fragment
      const freshNode = freshFragment.querySelector(
        `[data-munin-component="${muninId}"]`,
      ) as HTMLElement;

      if (!freshNode) {
        hugin.debug.log(
          RenderingEngine.COMPONENT_NAME,
          "New component not found in fragment",
          {
            tileId: this.tileId,
            muninId,
          },
        );
        return;
      }

      // Find insertion point
      // Components with display:contents don't affect layout, but we need to
      // maintain correct DOM order for subsequent surgical updates
      const siblings = Array.from(parentNode.children);
      const insertBefore = siblings[position];

      if (insertBefore) {
        parentNode.insertBefore(freshNode, insertBefore);
      } else {
        parentNode.appendChild(freshNode);
      }

      // Transfer cleanup info
      const cleanup = (freshNode as any).__muninCleanup;
      if (cleanup) {
        (freshNode as any).__muninCleanup = cleanup;
      }

      // hugin.debug.log(RenderingEngine.COMPONENT_NAME, "Added component", {
      //   tileId: this.tileId,
      //   muninId,
      //   parentId,
      //   position,
      // });
    });
  }

  /**
   * PHASE 2 STEP 7: Update layer with strategy based on layer type
   *
   * Routes to appropriate update strategy based on layer_type:
   * - persistent: Delegates to PersistentLayerManager lifecycle
   * - reactive: Uses surgical component swapping
   * - static: Simple replace (rarely updates)
   *
   * @param layerName - Name of the layer
   * @param fragment - Fresh fragment with new content
   * @param container - Layer container DOM element
   * @param newLayerTree - Component tree for this layer (muninId -> TreeEntry)
   */
  private updateLayerSurgical(
    layerName: string,
    fragment: DocumentFragment,
    container: HTMLElement,
    newLayerTree: Record<string, TreeEntry>,
  ): void {
    // Mount if not mounted
    if (!container.parentElement) {
      this.mountLayerInOrder(layerName, container);
      // hugin.debug.log(
      //   RenderingEngine.COMPONENT_NAME,
      //   "Mounted layer (first render)",
      //   {
      //     tileId: this.tileId,
      //     layerName,
      //   },
      // );

      const layerType = container.dataset.layer_type;

      // Route based on layer type for first mount
      if (layerType === "persistent") {
        // Persistent layers: updatePersistentLayer handles both content mounting and onMount()
        this.updatePersistentLayer(layerName, fragment, container);
      } else {
        // Reactive/static layers: Just mount the content
        // incrementRenderCount();
        container.replaceChildren(...fragment.childNodes);

        // Transfer cleanup info
        const cleanup = (fragment as any).__muninCleanup;
        if (cleanup) {
          (container as any).__muninCleanup = cleanup;
        }

        // BRANCH NODE: Mark layer container as the branch point for this layer's tree
        // This allows addComponents() to find the parent for children like branch-{layerName}-{hash}-0
        const branchMuninId = this.findBranchMuninId(layerName, newLayerTree);
        if (branchMuninId) {
          container.setAttribute("data-munin-component", branchMuninId);
        }
      }

      // Store tree for next comparison (for reactive layers)
      if (!this.oldTree[layerName]) {
        this.oldTree[layerName] = {};
      }
      this.oldTree[layerName] = newLayerTree;

      return;
    }

    // Route based on layer type
    const layerType = container.dataset.layer_type;

    switch (layerType) {
      case "persistent":
        // Persistent layers manage their own DOM - delegate to lifecycle methods
        this.updatePersistentLayer(layerName, fragment, container);
        break;

      case "reactive":
        // Reactive layers use surgical component swapping
        this.performSurgicalUpdate(
          layerName,
          fragment,
          container,
          newLayerTree,
        );
        break;

      case "static":
        // Static layers also use surgical updates to avoid unnecessary render counts
        // They rarely change, so cache hits are common
        this.performSurgicalUpdate(
          layerName,
          fragment,
          container,
          newLayerTree,
        );
        break;

      default:
        // Fallback to reactive behavior for unknown types
        this.performSurgicalUpdate(
          layerName,
          fragment,
          container,
          newLayerTree,
        );
    }
  }

  /**
   * Perform surgical component swapping for reactive layers
   * Extracted from updateLayerSurgical to separate concerns
   *
   * Now supports style-only updates for CSS variables!
   * When cache key matches but CSS vars differ, only style is updated.
   *
   * @param layerName - Name of the layer
   * @param fragment - Fresh fragment with new content
   * @param container - Layer container DOM element
   * @param newLayerTree - Component tree for this layer (muninId -> TreeEntry)
   */
  private performSurgicalUpdate(
    layerName: string,
    fragment: DocumentFragment,
    container: HTMLElement,
    newLayerTree: Record<string, TreeEntry>,
  ): void {
    // Get old tree for comparison
    const oldLayerTree = this.oldTree[layerName] || {};

    // PHASE 3: Detect all types of changes (now including styleOnly!)
    const { removed, added, changed, styleOnly } = this.detectComponentChanges(
      oldLayerTree,
      newLayerTree,
    );

    if (
      removed.length === 0 &&
      added.length === 0 &&
      changed.length === 0 &&
      styleOnly.length === 0
    ) {
      // Perfect cache hit! No changes needed
      hugin.debug.log(
        RenderingEngine.COMPONENT_NAME,
        "🎯 CACHE HIT - No changes",
        {
          tileId: this.tileId,
          layerName,
          componentCount: Object.keys(newLayerTree).length,
        },
      );
      return;
    }

    // Calculate cache hit rate (styleOnly doesn't count as "missed")
    const totalComponents = Object.keys(newLayerTree).length;
    const totalChanges = removed.length + added.length + changed.length;
    const cacheHitRate = (
      ((totalComponents - totalChanges) / totalComponents) *
      100
    ).toFixed(1);

    hugin.debug.log(
      RenderingEngine.COMPONENT_NAME,
      "🔄 Surgical update needed",
      {
        tileId: this.tileId,
        layerName,
        totalComponents,
        removed: removed.length,
        added: added.length,
        changed: changed.length,
        styleOnly: styleOnly.length, // NEW: Track style-only updates
        cacheHitRate: `${cacheHitRate}%`,
      },
    );

    // PHASE 3: Handle all types of changes in order
    this.removeComponents(removed); // Remove first
    this.swapComponents(changed, fragment, layerName); // Swap existing (Phase 2)
    this.addComponents(added, fragment); // Add last
    // NEW: Apply CSS variable updates without DOM replacement!
    this.updateCssVarsOnly(styleOnly, newLayerTree, container);

    // Store new tree for next comparison
    this.oldTree[layerName] = newLayerTree;
  }

  /**
   * Update a single layer (mount if needed, update content)
   */
  private updateLayer(
    layerName: string,
    fragment: DocumentFragment,
    container: HTMLElement,
  ): void {
    // Mount if not mounted
    if (!container.parentElement) {
      this.mountLayerInOrder(layerName, container);
      // hugin.debug.log(RenderingEngine.COMPONENT_NAME, "Mounted layer", {
      //   tileId: this.tileId,
      //   layerName,
      // });
    }

    // Check layer type
    const isPersistent = container.dataset.layer_type === "persistent";

    if (isPersistent) {
      this.updatePersistentLayer(layerName, fragment, container);
    } else {
      this.updateReactiveLayer(layerName, fragment, container);
    }
  }

  /**
   * Update a persistent layer
   * Delegates lifecycle to PersistentLayerManager
   *
   * 🎯 KEY INSIGHT: Persistent layers own their DOM!
   * - First mount: Render template content, then call onMount()
   * - Subsequent updates: Just call onUpdate() - DON'T replace DOM
   *
   * This is the whole point of persistent layers - the strategy controls
   * the DOM lifecycle, not the template re-rendering.
   */
  private async updatePersistentLayer(
    _layerName: string,
    fragment: DocumentFragment,
    container: HTMLElement,
  ): Promise<void> {
    // Check if this is first mount (no handle yet)
    const isFirstMount = !(container as any).__persistentHandle;

    if (isFirstMount) {
      // 🎯 FIRST MOUNT ONLY: Add template content so strategy can query for shell
      // This happens once - strategy creates its persistent DOM inside the shell
      container.replaceChildren(...fragment.childNodes);

      // Initialize strategy with template content available
      try {
        await this.persistentLayerManager.mountLayer(container);
      } catch (error: any) {
        hugin.debug.log(
          RenderingEngine.COMPONENT_NAME,
          "Persistent layer mount failed",
          {
            tileId: this.tileId,
            error: error.message,
          },
        );
      }
    }

    // 🎯 SUBSEQUENT UPDATES: Just call onUpdate() - don't touch DOM!
    // The strategy owns the DOM and will update it as needed
    try {
      this.persistentLayerManager.updateLayer(container);
    } catch (error: any) {
      hugin.debug.log(
        RenderingEngine.COMPONENT_NAME,
        "Persistent layer update failed",
        {
          tileId: this.tileId,
          error: error.message,
        },
      );
    }
  }

  /**
   * PHASE 2 STEP 6: Surgical component swapping with branch pruning
   *
   * @param changedIds - Array of muninIds that changed
   * @param freshFragment - Fragment with new content (has event listeners)
   * @param layerName - Name of the layer being updated
   */
  private swapComponents(
    changedIds: string[],
    freshFragment: DocumentFragment,
    layerName: string,
  ): void {
    // Sort by depth (shallow first) using pluggable strategy
    const sorted = sortChangedIds(changedIds);

    const swapped = new Set<string>();
    let skipCount = 0;

    // Get the layer container for root component swaps
    const layerContainer = this.layerContainers[layerName];

    // Track focus-skipped components separately
    let focusSkipCount = 0;

    sorted.forEach((muninId: string) => {
      // Branch pruning: Check if parent was already swapped
      if (isChildOfSwapped(muninId, swapped)) {
        skipCount++;
        // hugin.debug.log(
        //   RenderingEngine.COMPONENT_NAME,
        //   "Skipped (parent swapped)",
        //   {
        //     tileId: this.tileId,
        //     layerName,
        //     muninId,
        //     depth: getDepth(muninId),
        //   },
        // );
        return;
      }

      // FOCUS PRESERVATION: Skip components that user is actively interacting with
      // This prevents focus loss when typing in inputs or editing content
      const focusedMuninId = this.immediateState.focus.muninId;
      if (focusedMuninId && muninId === focusedMuninId) {
        focusSkipCount++;
        hugin.debug.log(
          RenderingEngine.COMPONENT_NAME,
          "🎯 Skipped (user has focus)",
          {
            tileId: this.tileId,
            layerName,
            muninId,
          },
        );
        return;
      }

      const depth = getDepth(muninId);
      const isRootComponent = depth === 0;

      // For root components, use the layer container as the DOM target
      // For nested components, find by data-munin-component attribute
      let domNode: HTMLElement | null;

      if (isRootComponent && layerContainer) {
        // Root component: the layer container IS the DOM node
        domNode = layerContainer;
        // hugin.debug.log(
        //   RenderingEngine.COMPONENT_NAME,
        //   "Swapping root component via layer container",
        //   {
        //     tileId: this.tileId,
        //     layerName,
        //     muninId,
        //   },
        // );
      } else {
        // Nested component: find by attribute
        domNode = this.container.querySelector(
          `[data-munin-component="${muninId}"]`,
        ) as HTMLElement;
      }

      if (!domNode) {
        // hugin.debug.log(
        //   RenderingEngine.COMPONENT_NAME,
        //   "Component not found in DOM",
        //   {
        //     tileId: this.tileId,
        //     layerName,
        //     muninId,
        //   },
        // );
        return;
      }

      // For root components, the fresh content is the fragment itself (no wrapper)
      // For nested components, find by data-munin-component attribute
      let nodesToMove: Node[];
      let newCleanup: any;

      if (isRootComponent) {
        // Root component: move all nodes from the fresh fragment
        nodesToMove = Array.from(freshFragment.childNodes);
        newCleanup = (freshFragment as any).__muninCleanup;
      } else {
        // Nested component: find the specific component wrapper
        const freshNode = freshFragment.querySelector(
          `[data-munin-component="${muninId}"]`,
        ) as HTMLElement;

        if (!freshNode) {
          // hugin.debug.log(
          //   RenderingEngine.COMPONENT_NAME,
          //   "Component not found in fragment",
          //   {
          //     tileId: this.tileId,
          //     layerName,
          //     muninId,
          //   },
          // );
          return;
        }

        nodesToMove = Array.from(freshNode.childNodes);
        newCleanup = (freshNode as any).__muninCleanup;
      }

      // Clean up old resources
      const oldCleanup = (domNode as any).__muninCleanup;
      if (oldCleanup) {
        oldCleanup.clearAll();
      }

      // MOVE (not clone!) nodes from fresh fragment to DOM
      // This preserves event listeners!
      // incrementRenderCount();
      domNode.replaceChildren(...nodesToMove);

      // Transfer cleanup info
      if (newCleanup) {
        (domNode as any).__muninCleanup = newCleanup;
      }

      // Mark as swapped (and implicitly all children)
      swapped.add(muninId);

      // hugin.debug.log(RenderingEngine.COMPONENT_NAME, "Swapped component", {
      //   tileId: this.tileId,
      //   layerName,
      //   muninId,
      //   depth,
      //   nodeCount: nodesToMove.length,
      //   isRootComponent,
      // });
    });

    hugin.debug.log(RenderingEngine.COMPONENT_NAME, "Swap summary", {
      tileId: this.tileId,
      layerName,
      attempted: changedIds.length,
      swapped: swapped.size,
      skippedBranch: skipCount,
      skippedFocus: focusSkipCount,
      efficiency:
        skipCount > 0 || focusSkipCount > 0
          ? `${skipCount} branch pruned, ${focusSkipCount} focus preserved`
          : "No optimizations needed",
    });
  }

  /**
   * Update a reactive layer (Munin-managed)
   * Handles Munin cleanup orchestration
   */
  private updateReactiveLayer(
    _layerName: string,
    fragment: DocumentFragment,
    container: HTMLElement,
  ): void {
    // hugin.debug.log(RenderingEngine.COMPONENT_NAME, "Updating reactive layer", {
    //   tileId: this.tileId,
    //   layerName,
    // });

    // Cleanup old Munin resources before replacing content
    const oldCleanup = (container as any).__muninCleanup;
    if (oldCleanup) {
      oldCleanup.clearAll();
      // hugin.debug.log(
      //   RenderingEngine.COMPONENT_NAME,
      //   "Cleaned up old Munin resources",
      //   {
      //     tileId: this.tileId,
      //     layerName,
      //   },
      // );
    }

    // hugin.debug.log(RenderingEngine.COMPONENT_NAME, "Before replaceChildren", {
    //   tileId: this.tileId,
    //   layerName,
    //   fragmentChildCount: fragment.childNodes.length,
    //   fragmentCleanup:
    //     (fragment as any).__muninCleanup?.eventHandlers.length || 0,
    // });

    // Update content
    // incrementRenderCount();
    container.replaceChildren(...fragment.childNodes);

    // hugin.debug.log(RenderingEngine.COMPONENT_NAME, "After replaceChildren", {
    //   tileId: this.tileId,
    //   layerName,
    //   containerChildCount: container.childNodes.length,
    // });

    // Attach cleanup info from fragment to container
    const newCleanup = (fragment as any).__muninCleanup;
    if (newCleanup) {
      (container as any).__muninCleanup = newCleanup;
      // hugin.debug.log(
      //   RenderingEngine.COMPONENT_NAME,
      //   "Attached new Munin cleanup tracking",
      //   {
      //     tileId: this.tileId,
      //     layerName,
      //   },
      // );
    }
  }

  // ==================================================================================
  // MOUNTING & UNMOUNTING
  // ==================================================================================

  /**
   * Mount a layer container in the correct z-order relative to other mounted layers
   */
  private mountLayerInOrder(_layerName: string, container: HTMLElement): void {
    const layerZIndex = parseInt(container.dataset.zIndex || "0");

    // Find the correct position to insert this layer based on z-index
    const mountedLayers = Array.from(this.container.children) as HTMLElement[];
    let insertIndex = mountedLayers.length; // Default: append at end

    for (let i = 0; i < mountedLayers.length; i++) {
      const mountedZIndex = parseInt(mountedLayers[i].dataset.zIndex || "0");
      if (layerZIndex < mountedZIndex) {
        insertIndex = i;
        break;
      }
    }

    // Insert at correct position
    if (insertIndex < mountedLayers.length) {
      this.container.insertBefore(container, mountedLayers[insertIndex]);
    } else {
      this.container.appendChild(container);
    }

    // hugin.debug.log(
    //   RenderingEngine.COMPONENT_NAME,
    //   "Layer mounted in z-order",
    //   {
    //     tileId: this.tileId,
    //     layerName,
    //     zIndex: layerZIndex,
    //     insertIndex,
    //     totalMounted: mountedLayers.length + 1,
    //   },
    // );
  }

  /**
   * Unmount a layer with comprehensive cleanup
   */
  private async unmountLayer(
    _layerName: string,
    container: HTMLElement,
  ): Promise<void> {
    if (!container.parentElement) {
      // hugin.debug.log(
      //   RenderingEngine.COMPONENT_NAME,
      //   "Layer already unmounted, skipping",
      //   {
      //     tileId: this.tileId,
      //     layerName,
      //   },
      // );
      return;
    }

    // hugin.debug.log(RenderingEngine.COMPONENT_NAME, "Unmounting layer", {
    //   tileId: this.tileId,
    //   layerName,
    // });

    // Step 1: Cleanup persistent layer if applicable
    try {
      await this.persistentLayerManager.unmountLayer(container);
      // if (unmounted) {
      //   hugin.debug.log(
      //     RenderingEngine.COMPONENT_NAME,
      //     "Persistent layer cleaned up",
      //     {
      //       tileId: this.tileId,
      //       layerName,
      //     },
      //   );
      // }
    } catch (error: any) {
      // hugin.debug.log(
      //   RenderingEngine.COMPONENT_NAME,
      //   "Persistent layer cleanup failed",
      //   {
      //     tileId: this.tileId,
      //     layerName,
      //     error: error.message,
      //   },
      // );
    }

    // Step 2: Cleanup Munin resources
    const muninCleanup = (container as any).__muninCleanup;
    if (muninCleanup) {
      muninCleanup.clearAll();
      // hugin.debug.log(
      //   RenderingEngine.COMPONENT_NAME,
      //   "Cleaned up Munin resources",
      //   {
      //     tileId: this.tileId,
      //     layerName,
      //   },
      // );
    }

    // Step 3: Remove from DOM
    container.parentElement.removeChild(container);
    // hugin.debug.log(RenderingEngine.COMPONENT_NAME, "Layer removed from DOM", {
    //   tileId: this.tileId,
    //   layerName,
    // });
  }

  // ==================================================================================
  // BRANCH NODE HELPERS
  // ==================================================================================

  /**
   * Find the branch muninId for a layer from its component tree
   *
   * Branch nodes follow the pattern: branch-{layerName}-{hash}
   * This is the root component of a layer's content tree.
   *
   * @param layerName - Name of the layer
   * @param tree - Component tree for the layer (muninId -> TreeEntry)
   * @returns The branch muninId or undefined if not found
   */
  private findBranchMuninId(
    layerName: string,
    tree: Record<string, TreeEntry>,
  ): string | undefined {
    // Try tile-scoped prefix first: branch-{tileId}-{layerName}-
    const tileScopedPrefix = `branch-${this.tileId}-${layerName}-`;
    // Fallback to legacy prefix: branch-{layerName}-
    const legacyPrefix = `branch-${layerName}-`;

    // Find the muninId that starts with the prefix and has no more dashes after the hash
    // branch-app-controls-abc123 ✓ (branch root, tile-scoped)
    // branch-controls-abc123 ✓ (branch root, legacy)
    // branch-app-controls-abc123-0 ✗ (child of branch)
    for (const muninId of Object.keys(tree)) {
      const prefix = muninId.startsWith(tileScopedPrefix)
        ? tileScopedPrefix
        : muninId.startsWith(legacyPrefix)
          ? legacyPrefix
          : null;

      if (prefix) {
        // Check if this is the root (no position suffix after the hash)
        const afterPrefix = muninId.slice(prefix.length);
        // If afterPrefix has no dashes, this is the branch root
        if (!afterPrefix.includes("-")) {
          return muninId;
        }
      }
    }

    return undefined;
  }
}
