# Persistent Layers

> *When the strategy owns the DOM*

Persistent layers are an escape hatch from Yggdrasil's reactive rendering model. They allow complex, stateful DOM structures (canvas elements, D3 visualizations, WebGL contexts) to survive tile re-renders while still participating in the layer system.

---

## Philosophy

Yggdrasil's core principle is **DOM as a side-effect of state**. Templates re-render, RenderingEngine performs surgical updates, and the DOM reflects current state. This works beautifully for most UI.

But some resources don't fit this model:

- **Canvas elements** that maintain expensive rendering contexts
- **D3 visualizations** that manage their own DOM lifecycle
- **WebGL contexts** that require careful initialization
- **Third-party widgets** that don't play well with replacement

For these cases, we need an **inversion of control**: instead of the template owning the DOM, the **strategy owns the DOM**.

```
Reactive Layer:          Persistent Layer:
Template → DOM           Template → Shell → Strategy → DOM
         ↓                        ↓              ↓
    RenderingEngine          (untouched)    Strategy.onUpdate()
         ↓
       Updates
```

---

## The Core Insight

**Persistent layers treat the template as a static container.**

The template provides a "shell" element. The strategy queries for the shell and creates its persistent structure inside. After first mount, the RenderingEngine **never touches** the persistent layer's DOM - it only calls `onUpdate()` to let the strategy react to state changes.

This means:
- Template renders once, providing the shell
- Strategy creates and owns all DOM inside the shell
- State subscriptions trigger `onUpdate()`, not template re-renders
- Strategy is responsible for its own cleanup in `onUnmount()`

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           LAYER REGISTRATION                              │
│                                                                          │
│   munin.registerLayers(TILE_ID, {                                        │
│     50: {                                                                │
│       name: "content",                                                   │
│       layer_type: "persistent",      ← Tells RenderingEngine to delegate │
│       persistentLayer: new Strategy(), ← Strategy instance               │
│       flow: "y"                                                          │
│     }                                                                    │
│   });                                                                    │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                              TEMPLATE                                     │
│                                                                          │
│   .layer("content", munin`                                               │
│     <div class="container" data-my-persistent="true">                    │
│       <!-- Strategy creates DOM here -->                                 │
│     </div>                                                               │
│   `)                                                                     │
│                                                                          │
│   Shell provides:                                                        │
│   - CSS-based sizing (container queries, flow participation)             │
│   - Data attribute for strategy to query                                 │
│   - Stable mount point that survives re-renders                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         RENDERING ENGINE                                  │
│                                                                          │
│   updatePersistentLayer():                                               │
│                                                                          │
│   if (isFirstMount) {                                                    │
│     container.replaceChildren(...fragment);  ← Render shell ONCE         │
│     persistentLayerManager.mountLayer();     ← Strategy.onMount()        │
│   }                                                                      │
│                                                                          │
│   // Subsequent updates: DON'T touch DOM!                                │
│   persistentLayerManager.updateLayer();      ← Strategy.onUpdate()       │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                              STRATEGY                                     │
│                                                                          │
│   onMount(container):                                                    │
│     - Query for shell element                                            │
│     - Create persistent DOM structure inside shell                       │
│     - Set up observers/listeners                                         │
│     - Return handle with references                                      │
│                                                                          │
│   onUpdate(handle, eventualState, immediateState):                       │
│     - Read current state                                                 │
│     - Compare with last render state (smart update detection)            │
│     - Update DOM if needed                                               │
│                                                                          │
│   onUnmount(handle):                                                     │
│     - Clean up observers/listeners                                       │
│     - Release resources (canvas contexts, etc.)                          │
│     - Clear DOM references                                               │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Strategy Interface

```typescript
interface PersistentLayerStrategy {
  name: string;

  onMount(
    container: HTMLElement,
    eventualState: EventualState,
    immediateState: ImmediateState
  ): LayerResult<PersistentLayerHandle>;

  onUpdate(
    handle: PersistentLayerHandle,
    eventualState: EventualState,
    immediateState: ImmediateState
  ): void;

  onUnmount(handle: PersistentLayerHandle): void;
}

interface PersistentLayerHandle {
  strategyName: string;
  // Strategy-specific state...
}
```

---

## The Shell Pattern

The template provides a "shell" - a container element with a data attribute that the strategy queries for.

### Why a Shell?

1. **CSS Integration**: Shell participates in flow layout, container queries, and tile sizing
2. **Stable Mount Point**: Shell survives because RenderingEngine doesn't replace persistent layer DOM
3. **Clear Boundary**: Data attribute makes ownership explicit
4. **Flexibility**: Strategy creates whatever DOM structure it needs inside

### Shell Examples

**PDFTile Canvas Shell**:
```typescript
private PdfCanvas() {
  return munin`
    <div class="tile-viewport tile-viewport--pdf" data-persistent="true">
      <!-- PDFCanvasStrategy creates canvas structure here -->
    </div>
  `;
}
```

**GraphTile D3 Shell**:
```typescript
private GraphContainer() {
  return munin`
    <div class="tile-viewport tile-viewport--graph" data-persistent="true">
      <svg data-d3-svg="true"></svg>
    </div>
  `;
}
```

### Critical Rule: Unconditional Shells

**The shell must always be rendered - never wrap it in conditionals.**

```typescript
// WRONG: Shell disappears when condition is false
.layer("content", munin`
  ${munin.cond(() => this.PdfCanvas()).when(this.isReady())}
`)

// CORRECT: Shell always present, strategy handles visibility
.layer("content", munin`
  ${this.PdfCanvas()}
  ${munin.cond(() => this.EmptyState()).when(this.isEmpty())}
`)
```

Why? Persistent layers don't re-render the template. If the shell isn't present on first mount, it will never appear!

---

## CSS Convention: Tile Viewport

Persistent layer shells follow a consistent CSS naming convention that separates concerns:

### The Convention

```html
<div class="tile-viewport tile-viewport--{tile}" data-persistent="true">
  <!-- Strategy-managed content -->
</div>
```

**Three parts:**
1. **`.tile-viewport`** - Base class for shared viewport styles (optional)
2. **`.tile-viewport--{tile}`** - BEM modifier for tile-specific styling
3. **`data-persistent="true"`** - Attribute for strategy querying

### Why This Separation?

| Concern | Mechanism | Example |
|---------|-----------|---------|
| **Styling** | CSS class | `.tile-viewport--pdf { background: ... }` |
| **Behavior** | Data attribute | `container.querySelector('[data-persistent="true"]')` |
| **Tile identity** | BEM modifier | `--pdf`, `--graph` |

This follows the principle: **CSS cares about appearance, strategies care about behavior.**

### CSS Examples

**PDF Viewport** (checkerboard background for alignment context):
```css
.tile-viewport--pdf {
    position: absolute;
    inset: 0;
    overflow: auto;
    background:
        linear-gradient(45deg, /* checkerboard pattern */);
    background-color: var(--pdf-bg);
}

.tile-viewport--pdf canvas {
    filter: var(--pdf-canvas-filter);
    box-shadow: var(--pdf-canvas-shadow);
}
```

**Graph Viewport** (solid warm background):
```css
.tile-viewport--graph {
    width: 100%;
    height: 100%;
    background-color: var(--graph-bg);
    overflow: hidden;
}

.tile-viewport--graph svg {
    cursor: grab;
}
```

### Strategy Querying

Strategies query by the data attribute, not the class:

```typescript
// CORRECT: Query by behavior attribute
const shell = container.querySelector('[data-persistent="true"]');

// WRONG: Query by CSS class (couples strategy to styling)
const shell = container.querySelector('.tile-viewport--pdf');
```

This allows CSS classes to change without breaking strategy code.

### Theme Integration

Background colors use theme variables defined in `theme.css`:

```css
/* In theme.css */
--pdf-bg: #1c1917;    /* Warm dark gray */
--graph-bg: #1c1917;  /* Matching warm tone */

/* Light theme overrides */
[data-theme="light"] {
    --pdf-bg: var(--gray-100);
    --graph-bg: var(--gray-100);
}
```

This ensures persistent layer backgrounds respect theme switching.

---

## State Subscriptions

Persistent layers need to know when to update. The tile sets up subscriptions that trigger `onUpdate()`:

```typescript
// In tile constructor, after renderingEngine setup
this.renderingEngine.setupPersistentLayerSubscriptions("content", {
  eventualPaths: ["pdfTile.getCurrentPdfDocument"],
  immediatePaths: [
    "pdfTile.getCurrentPage",
    "pdfTile.getZoom",
    "pdfTile.isBboxVisible",
    "pdfTile.getClickedBbox"
  ],
  debounceMs: 50  // Prevent rapid-fire updates
});
```

When any subscribed state changes:
1. Subscription fires
2. RenderingEngine calls `updatePersistentLayer()`
3. PersistentLayerManager calls `strategy.onUpdate(handle, eventualState, immediateState)`
4. Strategy reads state and updates DOM as needed

---

## Smart Update Detection

Since strategies control their own rendering, they should implement change detection:

```typescript
onUpdate(handle: MyHandle, eventualState, immediateState): void {
  const currentState = {
    page: immediateState.myTile.getCurrentPage(),
    zoom: immediateState.myTile.getZoom(),
    documentId: eventualState.myTile.getDocument()?.id
  };

  // Compare with last render
  if (!this.shouldRender(handle.lastRenderState, currentState)) {
    // Cache hit - no work needed
    return;
  }

  // Perform expensive render...
  this.render(handle, ...);

  // Remember what we rendered
  handle.lastRenderState = currentState;
}

private shouldRender(last, current): boolean {
  return (
    last.page !== current.page ||
    last.zoom !== current.zoom ||
    last.documentId !== current.documentId
  );
}
```

This prevents unnecessary work when subscriptions fire but relevant state hasn't changed.

---

## Deferred Initialization

The strategy must handle cases where the shell isn't ready on first mount:

```typescript
onMount(container, eventualState, immediateState): LayerResult<MyHandle> {
  const shell = container.querySelector('[data-persistent="true"]');

  if (!shell) {
    // Shell not ready - return minimal handle
    // We'll initialize in onUpdate when shell appears
    return Ok({
      strategyName: this.name,
      canvas: null,
      container: container  // Keep layer container for later queries
    });
  }

  // Shell exists - create structure
  // ...
}

onUpdate(handle, eventualState, immediateState): void {
  // Guard: Initialize if not ready
  if (!handle.canvas) {
    const shell = handle.container.querySelector('[data-persistent="true"]');
    if (shell && !shell.querySelector('canvas')) {
      // Deferred initialization
      handle.canvas = this.createCanvas(shell);
      handle.container = shell;  // Switch to shell for dimensions
    } else {
      return;  // Still not ready
    }
  }

  // Guard: Check dimensions
  const rect = handle.container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    requestAnimationFrame(() => this.onUpdate(handle, eventualState, immediateState));
    return;
  }

  // Proceed with rendering...
}
```

---

## Resource Cleanup

Strategies are responsible for cleaning up their resources:

```typescript
onUnmount(handle: MyHandle): void {
  // Clean up observers
  if (handle.resizeObserver) {
    handle.resizeObserver.disconnect();
    handle.resizeObserver = null;
  }

  // Clean up canvas context
  if (handle.canvas) {
    const ctx = handle.canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, handle.canvas.width, handle.canvas.height);
    }
  }

  // Clear DOM references (helps GC)
  handle.canvas = null;
  handle.container = null;
}
```

---

## Real-World Examples

### PDFCanvasStrategy

Manages PDF.js canvas rendering with expensive viewport calculations:

```typescript
// Layer registration
munin.registerLayers(PDF_TILE_ID, {
  50: {
    name: "content",
    layer_type: "persistent",
    persistentLayer: new PDFCanvasStrategy(),
    flow: "y"
  }
});

// Handle stores canvas references and render state
interface PDFCanvasHandle extends PersistentLayerHandle {
  canvas: HTMLCanvasElement;
  pageBackground: HTMLElement;
  isRendering: boolean;
  resizeObserver: ResizeObserver | null;
  lastRenderState: {
    page: number;
    zoom: number;
    bboxVisible: boolean;
    documentId: string | null;
  };
}
```

### D3PersistentLayer

Manages D3.js force-directed graph visualization:

```typescript
// Layer registration
munin.registerLayers(GRAPH_TILE_ID, {
  50: {
    name: "d3Layer",
    layer_type: "persistent",
    persistentLayer: new D3PersistentLayer()
  }
});

// Handle stores D3 simulation and selections
interface D3Handle extends PersistentLayerHandle {
  svg: SVGSVGElement;
  simulation: d3.Simulation;
  nodeSelection: d3.Selection;
  linkSelection: d3.Selection;
}
```

---

## Implementation Checklist

When creating a new persistent layer:

### 1. Create the Strategy

```typescript
export class MyStrategy implements PersistentLayerStrategy {
  readonly name = "MyStrategy";

  onMount(container, eventualState, immediateState): LayerResult<MyHandle> {
    // Query for shell, create structure, return handle
  }

  onUpdate(handle, eventualState, immediateState): void {
    // Deferred init guard, dimension guard, smart update, render
  }

  onUnmount(handle): void {
    // Clean up observers, contexts, references
  }
}
```

### 2. Register the Layer

```typescript
munin.registerLayers(TILE_ID, {
  50: {
    name: "content",
    layer_type: "persistent",
    persistentLayer: new MyStrategy(),
    flow: "y"  // Optional: participate in flow layout
  }
});
```

### 3. Provide Unconditional Shell

```typescript
private MyContainer() {
  return munin`
    <div class="tile-viewport tile-viewport--mytile" data-persistent="true">
      <!-- Strategy creates structure here -->
    </div>
  `;
}

// In performRender - NO conditional wrapper!
.layer("content", munin`
  <div class="tile-content">
    ${this.MyContainer()}
  </div>
`)
```

### 3b. Add Viewport CSS

```css
/* In styles/tiles/MyTile/tile.css */
.tile-viewport--mytile {
    width: 100%;
    height: 100%;
    background-color: var(--mytile-bg);
    overflow: hidden;
}
```

### 4. Setup Subscriptions

```typescript
// In tile constructor
this.renderingEngine.setupPersistentLayerSubscriptions("content", {
  eventualPaths: ["myTile.getData"],
  immediatePaths: ["myTile.getZoom", "myTile.getSelection"],
  debounceMs: 50
});
```

### 5. Remove Direct Rendering

```typescript
// REMOVE from performRender():
// if (this.isReady()) {
//   this.renderExpensiveThing();
// }

// Strategy handles all rendering now via onUpdate()
```

---

## Common Pitfalls

| Pitfall | Problem | Solution |
|---------|---------|----------|
| Conditional shell | Shell not in DOM on first mount | Always render shell unconditionally |
| Missing dimension guard | Render with 0x0 container | Check `getBoundingClientRect()` before rendering |
| No deferred init | Assumes shell exists on mount | Handle missing shell, initialize in `onUpdate()` |
| Forgetting cleanup | Memory leaks, zombie observers | Implement `onUnmount()` properly |
| No smart updates | Renders on every subscription fire | Compare state, skip if unchanged |

---

## When to Use Persistent Layers

**Good candidates:**
- Canvas-based rendering (PDF.js, charts, games)
- D3 or other libraries that manage their own DOM
- WebGL contexts
- Third-party widgets with internal state
- Any expensive DOM that shouldn't be recreated

**Not needed for:**
- Regular reactive UI (buttons, forms, lists)
- Content that benefits from surgical updates
- Simple static content

**Rule of thumb**: If recreating the DOM on every render causes visible performance issues or breaks functionality, consider a persistent layer.

---

## Summary

| Aspect | Reactive Layer | Persistent Layer |
|--------|---------------|------------------|
| Template role | Creates DOM | Provides shell |
| DOM ownership | RenderingEngine | Strategy |
| Updates | Template re-render → surgical swap | State subscription → onUpdate() |
| Lifecycle | Automatic | Strategy-managed |
| Use case | Most UI | Canvas, D3, WebGL |
| CSS convention | Component-specific classes | `.tile-viewport.tile-viewport--{tile}` |
| Querying | N/A | `[data-persistent="true"]` |

**Key insight**: Persistent layers invert the normal Yggdrasil model. Instead of templates creating DOM that gets surgically updated, templates provide stable shells that strategies populate and manage independently.

**CSS insight**: The `.tile-viewport` convention separates styling (CSS classes) from behavior (data attributes). Strategies query by `[data-persistent="true"]`, allowing CSS to evolve independently.

---

## Related Documents

- [Rendering System](./02-rendering-system.md) - How reactive layers work
- [State System](./01-state-system.md) - Subscriptions and state flow
- [Component Patterns](../02-patterns/01-component-patterns.md) - Tile and component organization
