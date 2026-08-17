# Yggdrasil Architecture Overview

> *How the pieces fit together*

This document provides a map of Yggdrasil's architecture. It shows the main actors, their relationships, and how data flows through the system. Read [Design Principles](../01-philosophy/01-design-principles.md) first to understand the *why* behind these choices.

---

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            YGGDRASIL APP                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐      ┌─────────────────────────────────────────────┐  │
│  │   Adapters   │─────▶│              EventualState                  │  │
│  │ (platform IO)│      │   (backend authority, async operations)     │  │
│  └──────────────┘      └─────────────────────────────────────────────┘  │
│                                         │                               │
│                                         │ coordinates                   │
│                                         ▼                               │
│                        ┌─────────────────────────────────────────────┐  │
│                        │            AppCoordinator                   │  │
│                        │    (owns all state, coordinates flows)      │  │
│                        └─────────────────────────────────────────────┘  │
│                                         │                               │
│                                         │ owns                          │
│                                         ▼                               │
│                        ┌─────────────────────────────────────────────┐  │
│                        │            ImmediateState                   │  │
│                        │   (frontend authority, instant updates)     │  │
│                        └─────────────────────────────────────────────┘  │
│                                         │                               │
│                                         │ borrowed by                   │
│                                         ▼                               │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                            TILES                                  │  │
│  │   ┌──────────┐    ┌──────────┐    ┌──────────┐                   │  │
│  │   │ PDF Tile │    │Graph Tile│    │   ...    │                   │  │
│  │   └──────────┘    └──────────┘    └──────────┘                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                         │                               │
│                                         │ renders via                   │
│                                         ▼                               │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                       RENDERING SYSTEM                            │  │
│  │   TilingManager ──▶ Munin ──▶ RenderingEngine ──▶ Layers ──▶ DOM │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## GUI Abstraction Hierarchy

Yggdrasil uses a four-tier abstraction for UI:

```
App              ─── Tile with special responsibilities (routing, auth, global concerns)
 │
 ├── Tile        ─── Reusable unit that owns its state, registers with the system
 │    │
 │    ├── Component   ─── Tile-bound function, accesses tile state via `this`
 │    │
 │    └── UI Element  ─── Pure function with props, fully reusable
 │
 └── Tile
      └── ...
```

### App

An App is essentially a special Tile with additional responsibilities:
- Global state coordination
- Routing and navigation
- Authentication flows
- Theme management

```typescript
// App is just a Tile with extras
class ExampleApp extends Tile {
  // App-level concerns
  private router: Router;
  private authService: AuthService;

  // Contains other tiles
  private pdfTile: PDFTile;
  private graphTile: GraphTile;
}
```

### Tile

The core unit of composition. Tiles:
- Own their state (registered with ImmediateState/EventualState)
- Register with TilingManager for render scheduling
- Are independently deployable (CDN distribution)
- Adapt to their container size (CSS container queries)

```typescript
class PDFTile {
  constructor(coordinator: AppCoordinator, container: HTMLElement) {
    // Register state
    coordinator.eventualState.registerTile('pdfTile', [...]);
    coordinator.immediateState.registerTile('pdfTile', [...]);

    // Register for render scheduling
    tilingManager.registerTile('pdfTile', container, this);
  }
}
```

### Component

Components are functions bound to a Tile via `this`. They:
- Access tile state directly (no prop drilling)
- Are NOT meant to be reusable across tiles
- Can be overridden via inheritance
- Define their own event handlers

```typescript
// Component bound to PDFTile
export function PdfToolbar(this: PDFTile) {
  // Handler defined locally, accesses state when called
  const handleNext = () => {
    const current = this.immediateState.pdfTile.getCurrentPage();
    this.immediateState.pdfTile.setCurrentPage(current + 1);
  };

  // IMPORTANT: Access state directly in template, not via variable!
  // Inline reads are evaluated when the template is collected, so the
  // value is fresh at render time — a variable is a snapshot.
  return munin`
    <div class="toolbar">
      <span>Page ${this.immediateState.pdfTile.getCurrentPage()}</span>
      <button onclick=${handleNext}>Next</button>
    </div>
  `;
}
```

**Why direct access?** Binding time. A variable (`const page = getPage()`) is bound once, when the component function runs. An inline read is evaluated each time Munin *collects* the template — and collection happens on its own schedule (lazy branches, static layers on intervals), not only at construction — so the value is fresh at render time. There is no per-access dependency graph: reactivity is coarse (any write to the tile's own state marks the whole tile dirty), and the fresh inline value entering the leaf's cache key is what turns "tile is dirty" into "this leaf changed, swap it".

### UI Element

Pure functions with explicit props. These ARE meant to be reusable:

```typescript
// Pure UI element - reusable anywhere
export function Button({ label, onClick, variant = "primary" }: ButtonProps) {
  return munin`
    <button class="btn btn--${variant}" onclick=${onClick}>
      ${label}
    </button>
  `;
}
```

**Decision Matrix:**

| Question | Answer | Use |
|----------|--------|-----|
| Accesses tile state? | Yes | Component |
| Reusable across tiles? | Yes | UI Element |
| Needs inheritance? | Yes | Component |
| Generic button/input/modal? | Yes | UI Element |

---

## The State System

### Three Actors, Clear Roles

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AppCoordinator                               │
│                     (owns everything)                                │
│                                                                     │
│   ┌─────────────────────────┐   ┌─────────────────────────┐        │
│   │     EventualState       │   │    ImmediateState       │        │
│   │   (backend authority)   │   │  (frontend authority)   │        │
│   │                         │   │                         │        │
│   │  - Async operations     │   │  - Sync operations      │        │
│   │  - May fail             │   │  - Always succeeds      │        │
│   │  - Needs confirmation   │   │  - Instant feedback     │        │
│   │  - API calls, file I/O  │   │  - UI state, selections │        │
│   └─────────────────────────┘   └─────────────────────────┘        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### ImmediateState (Frontend Authority)

State that the frontend controls directly. Updates are instant and always succeed.

**Examples:**
- Current page in PDF viewer
- Selected node in graph
- Panel open/closed
- Zoom level
- Focus state

```typescript
// Instant, synchronous, never fails
immediateState.pdfTile.setCurrentPage(5);
immediateState.graphTile.setSelectedNode('node-123');
immediateState.app.setSidePanelOpen(true);
```

### EventualState (Backend Authority)

State that requires external confirmation. May be async, may fail.

**Examples:**
- Loaded PDF document
- Graph data from API
- User profile from database
- Credit balance

```typescript
// Async, may fail, may take time
await eventualState.pdfTile.loadPdf(file);
await eventualState.app.fetchUserCredits();
```

### AppCoordinator (The Owner)

Owns both state systems. Handles complex flows that touch multiple states:

```typescript
// Coordinator handles multi-step flows
async coordinateNodeSelection(nodeId: string) {
  // 1. Update immediate state (instant)
  this.immediateState.graphTile.setSelectedNode(nodeId);

  // 2. Get node data from eventual state (may be cached)
  const node = this.eventualState.graphTile.getNode(nodeId);

  // 3. Coordinate with PDF tile
  this.immediateState.pdfTile.setCurrentPage(node.page);

  // 4. Open side panel
  this.immediateState.app.setSidePanelOpen(true);
}
```

---

## The Rendering System

### Four Actors, Pipeline Flow

```
User Event
    │
    ▼
┌──────────────┐     ┌─────────────┐     ┌─────────────────┐     ┌────────┐
│TilingManager │────▶│    Munin    │────▶│ RenderingEngine │────▶│ Layers │
│ (scheduling) │     │ (templates) │     │ (surgical DOM)  │     │  (DOM) │
└──────────────┘     └─────────────┘     └─────────────────┘     └────────┘
```

### TilingManager

Schedules renders across tiles with staggered timing:

```typescript
// Register tile for render scheduling
tilingManager.registerTile('pdfTile', container, tile, {
  fps: 60,
  offset: 0,           // Stagger offset
  pauseWhenHidden: true
});

// When state changes, schedule a render
immediateState.subscribe('pdfTile.currentPage', () => {
  tilingManager.scheduleRender('pdfTile');
});
```

**Why staggered rendering?**
- Distributes work across frames
- Prevents jank from simultaneous heavy renders
- Allows prioritization (visible tiles first)

### Munin (Template Engine)

The "all-seeing raven" that generates component trees:

```typescript
// Basic template
munin`<div class="viewer">${content}</div>`

// Conditional rendering (lazy)
munin`<div>Loading...</div>`.when(isLoading).else(munin`<div>Ready</div>`)

// Layer composition
munin
  .inTile('pdfTile')
  .layer('background', CanvasTemplate())
  .layer('controls', ToolbarTemplate())
  .layer('overlay', ModalTemplate())
  .collectComponents()
```

**Key feature**: as Munin assembles the HTML, it hashes each leaf's interpolated primitive values into a cache key. The diff input is a free byproduct of rendering — there is no virtual DOM or signal graph to keep consistent; a leaf whose cache key is unchanged is a cache hit and its DOM is never touched.

### RenderingEngine

Performs surgical DOM updates:

1. **Detects changes** - Compares old component tree to new
2. **Prunes branches** - Skips children if parent was swapped
3. **Preserves focus** - Skips components user is actively editing
4. **Swaps surgically** - Only touches changed components

```typescript
// Perfect cache hit = zero DOM operations
// Partial changes = only changed components updated
// Focus preservation = no lost input state
```

### Layers (Z-Indexed DOM)

Apps are composed of layers, not a single DOM tree:

```typescript
// Layer registration
munin.registerLayers('app', {
  10:  { name: 'background',  layer_type: 'static' },
  50:  { name: 'content',     layer_type: 'reactive' },
  100: { name: 'controls',    layer_type: 'reactive' },
  200: { name: 'overlay',     layer_type: 'static' }
});
```

**Layer types:**

| Type | Behavior | Use Case |
|------|----------|----------|
| `reactive` | Updates on every state change | Dynamic UI, buttons, forms |
| `static` | Updates at intervals (5s default) | Rarely-changing content |
| `persistent` | Preserves expensive DOM | D3 graphs, canvas elements |

**Why layers?**
- Adding a modal overlay should be simple, not require DOM restructuring
- Different update strategies per layer (performance)
- Clean z-index management
- Persistent layers preserve expensive DOM (D3 graphs don't re-mount)

---

## The Adapter System

Adapters abstract platform-specific I/O, enabling cross-platform tiles:

```
┌───────────────────────────────────────────────────────────────┐
│                      EventualState                            │
│                                                               │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐        │
│   │ __fileAdapter│   │ __apiAdapter│   │__storageAdapter│     │
│   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘        │
└──────────┼─────────────────┼─────────────────┼────────────────┘
           │                 │                 │
           ▼                 ▼                 ▼
    ┌─────────────────────────────────────────────────────┐
    │              PLATFORM (compile-time choice)          │
    ├─────────────────────────────────────────────────────┤
    │  Web:     File API      fetch        localStorage   │
    │  Desktop: Tauri fs      Tauri http   Tauri store    │
    │  Mobile:  Capacitor fs  Capacitor http  Device storage│
    └─────────────────────────────────────────────────────┘
```

**Key insight**: Tiles use adapters indirectly through EventualState's curated API. They never need to know which platform they're running on.

```typescript
// Tile code - works on web, desktop, mobile
async loadPDF(file: File) {
  // EventualState handles platform differences
  const arrayBuffer = await this.eventualState.__fileAdapter.readFile(file);
  // ... PDF-specific logic
}
```

---

## Tile Registration & Communication

### Self-Registration Pattern

Tiles register themselves when loaded, enabling CDN distribution:

```typescript
export class PDFTile {
  static register(coordinator: AppCoordinator) {
    // Register eventual state
    coordinator.eventualState.registerTile('pdfTile', [
      { name: 'currentPdfDocument', initialValue: null },
      { name: 'loadPdf', action: async (file) => { /* ... */ } }
    ]);

    // Register immediate state
    coordinator.immediateState.registerTile('pdfTile', [
      { name: 'currentPage', initialValue: 1 },
      { name: 'zoom', initialValue: 1.0 }
    ]);

    return new PDFTile(coordinator);
  }
}

// CDN loading triggers registration
const pdfModule = await import('https://tiles-cdn.com/pdf-viewer@1.2.3.js');
const pdfTile = pdfModule.PDFTile.register(appCoordinator);
```

### Cross-Tile Communication

*This is an active design area.* The challenge: how do tiles communicate when they might be loaded from different CDNs and can't assume what other tiles exist?

Current thinking:
- Tiles should be as independent as possible
- Communication happens through AppCoordinator
- The exact patterns are still being refined

More details will be added as the design solidifies.

---

## Data Flow: Complete Example

**Scenario**: User clicks a node in the graph, PDF should navigate to that page.

```
1. DOM EVENT
   └── User clicks graph node
       └── onclick handler fires

2. IMMEDIATE STATE (instant)
   └── graphTile.setSelectedNode('node-123')
       └── Notifies listeners
           └── TilingManager schedules graph re-render

3. APP COORDINATOR (coordination)
   └── coordinateNodeSelection('node-123')
       ├── Gets node data from EventualState (may be cached)
       ├── Sets pdfTile.currentPage (ImmediateState)
       └── Opens side panel (ImmediateState)

4. TILING MANAGER (scheduling)
   └── Schedules renders for affected tiles
       ├── graphTile: highlight selected node
       ├── pdfTile: navigate to page
       └── sidePanel: show node info

5. MUNIN (templating)
   └── Each tile's performRender() generates new component tree
       └── Borrows current state values

6. RENDERING ENGINE (surgical DOM)
   └── Compares old tree to new tree
       ├── Detects changed components
       ├── Skips unchanged (cache hit)
       ├── Preserves focused elements
       └── Swaps only what changed

7. LAYERS (DOM)
   └── Updated DOM reflects new state
       └── User sees: selected node, correct PDF page, node info panel
```

---

## SSR: Seed Rendering

Yggdrasil supports server-side rendering through a "seed" approach:

```
Server                          Client
   │                               │
   │  1. Render HTML seed          │
   │     (same templates, seed     │
   │      state)                   │
   │                               │
   ├──────── HTML ────────────────▶│
   │                               │
   │                               │  2. Client renders normally
   │                               │     (produces identical HTML)
   │                               │
   │                               │  3. Framework takes over
   │                               │     (event listeners attached)
   │                               │
```

**Key insight**: Server and client render the *same* templates with the *same* seed state. The HTML is identical, so there's no visual flash. No complex hydration needed.

```typescript
// Seed definition - any tile can provide
interface SeedDefinition<TSeed> {
  seedState(): TSeed;                    // Initial state for rendering
  layers(seed: TSeed): SeedLayers;       // Layer templates
}
```

---

## CSS: Container Query Responsiveness

Tiles adapt to their *allocated space*, not viewport size:

```css
.munin-layered-container {
  container-type: size;
  container-name: tile;
}

/* Tile adapts based on its container, not viewport */
@container tile (max-width: 400px) {
  .pdf-controls {
    flex-direction: column;
  }
}

@container tile (min-width: 600px) {
  .pdf-controls {
    justify-content: space-between;
  }
}
```

**Why this matters**: A PDFTile works correctly whether it's:
- Full screen
- Half of a split view
- In a narrow sidebar
- In a modal

The tile doesn't know or care about its context - it just adapts to available space.

---

## Summary: The Actors

| Actor | Role | Key Responsibility |
|-------|------|-------------------|
| **App** | Special tile | Global concerns, routing, auth |
| **Tile** | Composable unit | Owns state, self-contained |
| **Component** | Tile-bound function | UI with direct state access |
| **UI Element** | Pure function | Reusable UI primitives |
| **AppCoordinator** | State owner | Owns and coordinates all state |
| **ImmediateState** | Frontend authority | Instant, synchronous state |
| **EventualState** | Backend authority | Async, may-fail state |
| **Adapters** | Platform abstraction | File, API, storage operations |
| **TilingManager** | Layout & render scheduler | Flow-based layouts, staggered rendering |
| **Munin** | Template engine | Component trees, lazy evaluation |
| **RenderingEngine** | DOM updater | Surgical, focus-aware updates |
| **Layers** | Z-indexed containers | Overlays, modals, backgrounds |

---

## Next Steps

With the architecture understood, dive deeper into each system:

- [State System](./01-systems/01-state-system.md) — ImmediateState, EventualState, and AppCoordinator in detail
- [Rendering System](./01-systems/02-rendering-system.md) — Munin, layers, and surgical updates
- [Tiling System](./01-systems/04-tiling-system.md) — Flow-based layouts and render scheduling
- [Theme System](./01-systems/08-theme-system.md) — Framework-level theming for standalone tiles
- [CSS Architecture](./01-systems/09-css-architecture.md) — Layer ordering, flow/overlay CSS, theme variables
- [Component Patterns](./02-patterns/01-component-patterns.md) — App, Tile, Component, UI Element organization
- [Adapter System](./01-systems/06-adapter-system.md) — Cross-platform abstractions
