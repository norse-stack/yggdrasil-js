# Rendering System Deep Dive

> *How Yggdrasil turns state into pixels*

This document explains the rendering system in detail: Munin templates, layers, progressive rendering levels, and the critical borrow-vs-clone semantics. Read [Architecture Overview](../00-overview.md) first for context.

---

## Philosophy: DOM as Side-Effect

Yggdrasil treats **DOM as a pure side-effect of state**. This is inspired by game engine architecture:

```
State Changes → Dirty Flag → Scheduled Render → DOM Update
      ↑                                              │
      └──────────── No Feedback Loop ───────────────┘
```

**Key insight**: State drives everything. DOM is just an output.

This means:
- State is the single source of truth
- Rendering happens at fixed intervals (game loop style)
- We check what changed, update only that
- DOM never feeds back into state

---

## The Rendering Pipeline

```
┌──────────────┐     ┌─────────────┐     ┌─────────────────┐     ┌────────┐
│TilingManager │────▶│    Munin    │────▶│ RenderingEngine │────▶│  DOM   │
│ (when?)      │     │  (what?)    │     │    (how?)       │     │        │
└──────────────┘     └─────────────┘     └─────────────────┘     └────────┘
       │                    │                     │
       │                    │                     │
   Schedules            Generates             Surgical
   60fps loop           component             updates
   Staggered            trees                 Focus-aware
   per tile                                   Branch pruning
```

---

## Munin: The Template Engine

Munin ("Odin's all-seeing raven") is a tagged template literal engine that:
- Generates real DOM (not virtual DOM)
- Hashes interpolated values into cache keys as it renders — the diff input is a byproduct, not a parallel structure
- Supports conditional rendering with lazy evaluation
- Composes layers with z-ordering

### Basic Syntax

```typescript
// Simple template
munin`<div class="container">${content}</div>`

// With event handlers
munin`<button onclick=${handleClick}>Click me</button>`

// Nested templates
munin`
  <div class="list">
    ${items.map(item => munin`<span>${item.name}</span>`)}
  </div>
`
```

### Conditional Rendering (Lazy)

```typescript
// .when() / .else() - only executes the winning branch
munin`<div>Loading spinner</div>`
  .when(isLoading)
  .else(munin`<div>Content ready</div>`)

// .match() - switch-case style
munin.match(viewMode)
  .case('grid', () => GridView())
  .case('list', () => ListView())
  .default(() => DefaultView())
```

**Why lazy?** The losing branches are never executed. If `isLoading` is false, the loading spinner template never runs.

### Layer Composition

```typescript
munin.registerLayers('myTile', {
  10:  { name: 'background', layer_type: 'static' },
  50:  { name: 'content',    layer_type: 'reactive' },
  100: { name: 'overlay',    layer_type: 'reactive' }
});

const result = munin
  .inTile('myTile')
  .layer('background', BackgroundTemplate())
  .layer('content', ContentTemplate())
  .layer('overlay', OverlayTemplate())
  .collectComponents();
```

### Flow + Overlay Layers

Layers can participate in **document flow** (stacking vertically like header/content/footer) or be **overlays** (floating above with absolute positioning).

**Layer Registration with Flow:**

```typescript
// App uses flow layers for header → content → footer stacking
munin.registerLayers('app', {
  10:  { name: 'background', layer_type: 'reactive' },         // Overlay (no flow)
  30:  { name: 'header',     layer_type: 'reactive', flow: 'y' }, // Flow: stacks vertically
  50:  { name: 'content',    layer_type: 'static',   flow: 'y' }, // Flow: takes remaining space
  70:  { name: 'footer',     layer_type: 'reactive', flow: 'y' }, // Flow: stacks at bottom
  200: { name: 'overlay',    layer_type: 'reactive' },         // Overlay: floats above all
});

// PDFTile uses flow for header + content, overlay for controls
munin.registerLayers('pdfTile', {
  10:  { name: 'background', layer_type: 'reactive' },
  30:  { name: 'header',     layer_type: 'reactive', flow: 'y' },
  50:  { name: 'content',    layer_type: 'reactive', flow: 'y' },
  70:  { name: 'controls',   layer_type: 'reactive' },  // Overlay: floating page controls
  100: { name: 'overlay',    layer_type: 'static' },    // Overlay: loading states
});
```

**How Flow Works:**

1. `munin.createLayerContainers()` returns flow metadata:
   ```typescript
   const { containers, flowDirection, flowLayers } = munin.createLayerContainers(TILE_ID);
   ```

2. `RenderingEngine` sets up the container with flow attributes:
   ```html
   <div class="munin-layered-container" data-has-flow data-flow-direction="z">
     <div class="munin-layer munin-layer-header" data-flow="y">...</div>
     <div class="munin-layer munin-layer-content" data-flow="y">...</div>
     <div class="munin-layer munin-layer-overlay">...</div>
   </div>
   ```

3. CSS handles the layout (see [CSS Architecture](./09-css-architecture.md)):
   - Flow layers (`data-flow="y"`) use `position: relative` and participate in CSS Grid
   - Overlay layers use `position: absolute` and float above the grid

**When to Use Flow vs Overlay:**

| Use Flow (`flow: 'y'`) | Use Overlay (no flow) |
|------------------------|----------------------|
| Headers, footers | Loading spinners |
| Main content areas | Modals, dialogs |
| Toolbars that push content | Floating controls |
| Sequential layout | HUD elements |

---

## Borrow vs Clone Semantics

This is perhaps the most important concept for writing correct Munin templates.

### The Problem: Stale Snapshots

```typescript
// ❌ CLONE SEMANTICS - Creates stale snapshot
performRender() {
  const theme = this.immediateState.app.getCurrentTheme(); // Captured: "dark"

  // Somewhere state changes to "light"...

  return munin`
    <select value=${theme}>...</select>  // Still uses "dark" ❌
  `;
}
```

The variable `theme` is a **clone** (snapshot) of the value when captured. If state changes between capture and template execution, you get stale data.

### The Solution: Borrow Directly

```typescript
// ✅ BORROW SEMANTICS - Always fresh
performRender() {
  return munin`
    <select value=${this.immediateState.app.getCurrentTheme()}>
      ...
    </select>
  `;
}
```

By accessing state **directly in the template**, you get a fresh "borrow" every time the template is collected. The fresh value lands in the leaf's cache key, which is how the change is detected — and the changed leaf swapped — on the next render.

### Rust Analogy

| Rust Pattern | Munin Pattern | Behavior |
|--------------|---------------|----------|
| `let x = value.clone()` | `const credits = getCredits()` | Owned copy, can become stale |
| `&value` | `${this.ImmediateState.app.getCredits()}` | Immutable borrow, always fresh |
| `&mut value` | `ref=${(el) => ...}` | Mutable borrow of DOM element |

### When to Use Each

**Use BORROW (inline reads) for:**
- Reactive state that changes between renders
- UI values that must stay in sync with state
- Event handlers (read state when clicked, not when rendered)

```typescript
// ✅ Borrow in template
munin`<span>${this.state.getCredits()}</span>`

// ✅ Borrow in event handler
munin`
  <button onclick=${() => {
    const current = this.state.getPage();
    this.state.setPage(current + 1);
  }}>Next</button>
`
```

**Use CLONE (cached variables) for:**
- True constants (`TILE_ID`, config values)
- Values used multiple times where consistency within one render matters
- Expensive computations you want to memoize

```typescript
// ✅ Clone for constants
const TILE_ID = 'pdfTile';

// ✅ Clone for consistency within one render
const isOpen = this.state.isModalOpen();
munin`
  <div class="${isOpen ? 'modal-open' : ''}">
    <button disabled=${!isOpen}>...</button>
  </div>
`
```

### The `ref` Pattern for Imperative DOM

Some DOM properties (like `<select>.value`) don't work well with attributes. Use refs for imperative control:

```typescript
munin`
  <select ref=${(el: HTMLSelectElement) => {
    el.value = this.immediateState.app.getCurrentTheme(); // Imperative set
  }}>
    <option value="dark">Dark</option>
    <option value="light">Light</option>
  </select>
`
```

---

## Layers: Z-Indexed Rendering Containers

Layers are the fundamental spatial organization primitive.

### Why Layers?

1. **Overlays should be simple** - Adding a modal shouldn't require restructuring your entire DOM
2. **Independent update rates** - Static backgrounds don't need to re-render when content changes
3. **Persistent DOM** - D3 graphs and canvas elements can survive re-renders
4. **Z-index management** - Explicit ordering, no CSS z-index wars

### Layer Types

| Type | Update Behavior | Use Case |
|------|-----------------|----------|
| `static` | Rarely updates (interval-based) | Backgrounds, chrome, logos |
| `reactive` | Updates on every state change | Content, controls, forms |
| `persistent` | Manages its own DOM lifecycle | Canvas, D3, third-party widgets |

```typescript
munin.registerLayers('graph', {
  10:  { name: 'background', layer_type: 'static' },
  50:  { name: 'd3Canvas',   layer_type: 'persistent' },  // D3 manages this
  100: { name: 'controls',   layer_type: 'reactive' },
  200: { name: 'overlay',    layer_type: 'reactive' }
});
```

### Persistent Layers (Escape Hatch)

For complex resources that manage their own DOM:

```typescript
interface PersistentLayerStrategy {
  name: string;

  // Called when layer first appears in DOM
  onMount(container: HTMLElement, eventualState, immediateState): LayerHandle;

  // Called when state changes (update without remounting)
  onUpdate(handle: LayerHandle, eventualState, immediateState): void;

  // Called when layer is removed from DOM
  onUnmount(handle: LayerHandle): void;
}
```

This lets D3, WebGL, PDF.js, etc. maintain their own DOM while participating in the layer system.

---

## Progressive Rendering: Three Levels

Yggdrasil's rendering API rewards natural refactoring with performance gains. Start simple, upgrade when needed.

```
Level 1: collect()           → Full replacement (simple)
Level 2: collectLayers()     → Layer-level granularity
Level 3: collectComponents() → Surgical component updates
```

### Level 1: Simple Full Replacement

**When to use:** Starting out, prototyping, simple UIs.

```typescript
// One template, full container replacement
const fragment = munin`
  <div class="tile">
    <header>...</header>
    <main>${content}</main>
  </div>
`.collect();

// Use renderingEngine to handle cleanup properly!
renderingEngine.renderFragment(fragment);
```

**Important:** Always use `renderingEngine.renderFragment()` instead of `container.replaceChildren()` directly. The RenderingEngine handles Munin cleanup (event listeners, observers, timers) to prevent memory leaks.

**What happens:** Entire container is replaced. Simple, predictable.

**Upgrade signal:** "I have sections that update at different rates..."

### Level 2: Layer-Level Granularity

**When to use:** Distinct sections with different update frequencies.

**Setup required:** Before using layers, you must initialize the layer infrastructure:

```typescript
// In your tile/app constructor:

// 1. Register layer definitions (with optional flow)
munin.registerLayers('myTile', {
  10:  { name: 'background', layer_type: 'static' },
  30:  { name: 'header',     layer_type: 'reactive', flow: 'y' },  // Optional: flow
  50:  { name: 'content',    layer_type: 'reactive', flow: 'y' },
  100: { name: 'overlay',    layer_type: 'reactive' }
});

// 2. Create layer containers (returns flow metadata if any layers have flow)
const { containers, flowDirection, flowLayers } = munin.createLayerContainers('myTile');

// 3. Create RenderingEngine with layer support and flow metadata
this.renderingEngine = new RenderingEngine(
  container,
  containers,
  this.eventualState,
  this.immediateState,
  'myTile',
  { flowDirection, flowLayers }  // Pass flow metadata
);
```

**Then in your render method:**

```typescript
const { fragments } = munin
  .inTile('myTile')
  .layer('background', BackgroundTemplate())  // Static
  .layer('content', ContentTemplate())        // Changes often
  .layer('overlay', OverlayTemplate())        // Sometimes
  .collectLayers();

// Only update content layer, skip background!
renderingEngine.renderLayers(fragments, ['content']);
```

**What happens:** Each layer is a separate DOM container. Update only dirty layers.

**Performance win:** Static layers never re-render.

**Upgrade signal:** "My layers have many nested components..."

### Level 3: Surgical Component Updates

**When to use:** Large lists, tables, complex nested UIs.

```typescript
const { fragments, tree } = munin
  .inTile('myTile')
  .layer('content', munin`
    <div class="list">
      ${items.map(item => munin`
        <div class="item">${item.name}: ${item.value}</div>
      `)}
    </div>
  `)
  .collectComponents();

// Surgical updates with tree diffing
renderingEngine.renderComponents(fragments, tree, ['content']);
```

**What happens:**
1. Munin builds a component tree with stable IDs and cache keys
2. RenderingEngine diffs old tree vs new tree
3. Only components with changed cache keys are swapped
4. Branch pruning: if parent was swapped, skip children
5. Focus preservation: don't touch focused elements

**Performance win:** In a 1000-row table, changing one cell only swaps that one cell.

---

## Component Granularity: You Control the Size

A key insight: **each `munin\`...\`` template is the smallest reactive unit**. You decide how large or small that piece is.

### The Developer's Choice

```typescript
// Coarse granularity - entire list is one reactive unit
munin`
  <div class="list">
    ${items.map(item => `<div>${item.name}</div>`)}
  </div>
`

// Fine granularity - each item is its own reactive unit
munin`
  <div class="list">
    ${items.map(item => munin`<div>${item.name}</div>`)}
  </div>
`
```

You can experiment to find the sweet spot between:
- **DOM optimization** (fewer, larger chunks = less overhead)
- **Reactive granularity** (smaller chunks = more precise updates)

### Caveat: Cache Keys and Nested State

Cache keys are calculated from variables **inside** a munin template, not from nested munin templates.

**Problem pattern:**

```typescript
// ❌ If this.someVar changes, the ENTIRE outer template re-renders
munin`
  <div class="modal">
    ${this.someVar}
    ${Component1()}
    ${Component2()}
  </div>
`
```

If `this.someVar` changes, the whole modal re-renders - even though Component1 and Component2 haven't changed.

**Solution: Wrap the variable**

```typescript
// ✅ Only the inner munin re-renders when this.someVar changes
munin`
  <div class="modal">
    ${munin`${this.someVar}`}
    ${Component1()}
    ${Component2()}
  </div>
`
```

Now:
- The outer munin contains only munin refs (other munin templates)
- Munin refs don't affect the cache key of the parent
- The outer munin acts as a static container
- Only the tiny `munin\`${this.someVar}\`` re-renders when the variable changes

**Rule of thumb:** If your outer container should be stable, wrap reactive variables in their own `munin\`...\`` to isolate them. If they get large, then refactor them out to new components.

---

### The Upgrade Path

**Level 1 → Level 2:**

First, set up layer infrastructure in your constructor (see Level 2 setup above), then change your render method:

```diff
- const fragment = munin`...`.collect();
- renderingEngine.renderFragment(fragment);

+ const { fragments } = munin
+   .inTile('myTile')
+   .layer('header', HeaderTemplate())
+   .layer('content', ContentTemplate())
+   .collectLayers();
+
+ renderingEngine.renderLayers(fragments, ['content']);
```

**Level 2 → Level 3:**

```diff
  const { fragments } = munin
    .inTile('myTile')
    .layer('content', ContentTemplate())
-   .collectLayers();
+   .collectComponents();

- renderingEngine.renderLayers(fragments, ['content']);
+ renderingEngine.renderComponents(fragments, tree, ['content']);
```

One method name change unlocks surgical updates.

---

## RenderingEngine: Surgical DOM Updates

The RenderingEngine performs intelligent DOM updates:

### Phase 1: Change Detection

```typescript
// Compare old component tree to new
const { removed, added, changed } = detectComponentChanges(oldTree, newTree);
```

Each component has:
- **Munin ID**: Stable identifier based on position in tree
- **Cache Key**: Hash of the component's rendered output

If the cache key changed, the component needs updating.

### Phase 2: Surgical Swapping

```typescript
for (const componentId of changed) {
  // Branch pruning: if parent was already swapped, skip
  if (parentWasSwapped(componentId)) continue;

  // Focus preservation: if user is editing this, skip
  if (isFocused(componentId)) continue;

  // Swap the DOM element
  swapComponent(componentId, newFragment);
}
```

### Why This Is Fast

Consider a 1000-row table where one cell changes:

| Approach | DOM Operations |
|----------|----------------|
| Full replacement | 1000+ elements replaced |
| Level 2 (layer) | Entire layer replaced |
| Level 3 (surgical) | 1 element swapped |

**Cache hit rate:** If 999 cells are unchanged, that's 99.9% cache hits.

### Focus Preservation

The RenderingEngine skips components the user is actively editing:

```
User typing in cell A
State changes affect cells B, C, D

A: SKIP (focused, don't steal input)
B: SWAP (update this component)
C: SWAP (update this component)
D: SWAP (update this component)
```

No lost input, no cursor jumping.

---

## TilingManager: Render Scheduling

The TilingManager coordinates when tiles render:

```typescript
tilingManager.registerTile('pdfTile', container, tile, {
  fps: 60,              // Target frame rate
  offset: 0,            // Stagger offset in ms
  pauseWhenHidden: true // Don't render if off-screen
});

tilingManager.registerTile('graphTile', container, tile, {
  fps: 60,
  offset: 8,            // Staggered by 8ms to avoid simultaneous renders
  pauseWhenHidden: true
});
```

### Why Staggered Rendering?

- **Distributes work** across frames (no jank)
- **Prioritizes visible** tiles
- **Saves CPU** for hidden tiles
- **Game-loop style:** If one frame misses something, the next catches it

### The Render Loop

```typescript
// Game-loop style rendering
setInterval(() => {
  for (const tile of registeredTiles) {
    if (tile.isDirty && tile.isVisible && shouldRenderThisFrame(tile)) {
      tile.performRender();
      tile.isDirty = false;
    }
  }
}, 1000 / 60); // ~16ms
```

---

## Complete Example: Data Flow

**Scenario:** User changes theme in settings modal.

```
1. USER ACTION
   └── Clicks theme dropdown, selects "light"

2. EVENT HANDLER (in SettingsModal component)
   └── const handleTheme = (e) => {
         this.immediateState.app.setCurrentTheme(e.target.value);
       }

3. IMMEDIATE STATE
   └── setCurrentTheme('light')
       └── Sets value
       └── Sets dirty flag
       └── Notifies subscribers

4. TILING MANAGER
   └── Subscription fires
       └── Schedules render for affected tiles

5. TILE.performRender()
   └── Munin templates execute
       └── ${this.immediateState.app.getCurrentTheme()} → borrows "light"

6. COLLECT
   └── .collectComponents() returns:
       └── fragments: { background: ..., content: ..., overlay: ... }
       └── tree: { componentId → cacheKey }

7. RENDERING ENGINE
   └── Compares old tree to new tree
       └── Theme dropdown: cache key changed → SWAP
       └── Other components: unchanged → SKIP

8. DOM
   └── Only theme dropdown element replaced
       └── User sees: theme switched to light
```

---

## Best Practices Summary

### Templates

```typescript
// ✅ Borrow state directly in templates
munin`<span>${this.state.getTheme()}</span>`

// ✅ Borrow in event handlers
munin`<button onclick=${() => this.state.setPage(this.state.getPage() + 1)}>`

// ✅ Use refs for imperative DOM
munin`<select ref=${(el) => el.value = this.state.getTheme()}>`

// ❌ Don't capture state in variables (stale clones)
const theme = this.state.getTheme();
munin`<span>${theme}</span>`
```

### Layers

```typescript
// ✅ Use static for rarely-changing content
{ name: 'background', layer_type: 'static' }

// ✅ Use reactive for dynamic content
{ name: 'controls', layer_type: 'reactive' }

// ✅ Use persistent for third-party DOM (D3, canvas)
{ name: 'd3Layer', layer_type: 'persistent' }
```

### Progressive Optimization

```typescript
// ✅ Start with Level 1 (simple)
munin`...`.collect()

// ✅ Upgrade to Level 2 when you have distinct sections
munin.inTile('x').layer(...).collectLayers()

// ✅ Upgrade to Level 3 for large lists/tables
munin.inTile('x').layer(...).collectComponents()
```

---

## Summary

| Component | Role | Key Feature |
|-----------|------|-------------|
| **Munin** | Template engine | Lazy conditionals, layer composition |
| **Layers** | Z-indexed containers | Independent update rates |
| **RenderingEngine** | DOM updater | Surgical swaps, focus preservation |
| **TilingManager** | Scheduler | Staggered 60fps loop |

**Core insight:** Natural refactoring (splitting UI into layers, extracting lists) automatically unlocks performance benefits. The code you'd write for maintainability is also the fastest code.

---

## Next Steps

- [Tiling System](./04-tiling-system.md) — Flow-based layouts and TilingManager integration
- [CSS Architecture](./09-css-architecture.md) — Layer order, flow/overlay CSS, theme system
- [State System](./01-state-system.md) — ImmediateState, EventualState, and ownership
- [Component Patterns](../02-patterns/01-component-patterns.md) — Registration, lifecycle, CDN distribution
