# State System Deep Dive

> *Ownership, authority, and deterministic flows*

This document explains Yggdrasil's state management system in detail: ImmediateState, EventualState, AppCoordinator, and the patterns that tie them together. Read [Design Principles](../../01-philosophy/01-design-principles.md) first to understand the ownership model.

---

## Philosophy Recap

From the design principles:

1. **Frontend as Distributed Systems** - State management is a consistency problem
2. **State Orthogonal to DOM** - State exists independently, DOM is just a projection
3. **Ownership & Borrowing** - One owner, many borrowers, live references

The state system implements these principles through a three-layer architecture.

---

## The Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      AppCoordinator                             │
│                (Orchestration & Ownership)                      │
│                                                                 │
│   - Owns both state layers                                      │
│   - Coordinates complex multi-step flows                        │
│   - Handles cross-tile communication                            │
└─────────────────────────────────────────────────────────────────┘
                              │
               ┌──────────────┴──────────────┐
               │                             │
┌──────────────▼──────────────┐ ┌────────────▼─────────────────┐
│      ImmediateState         │ │       EventualState          │
│   (Frontend Authority)      │ │    (Backend Authority)       │
│                             │ │                              │
│ - Synchronous operations    │ │ - Asynchronous operations    │
│ - Instant UI feedback       │ │ - May fail, needs handling   │
│ - localStorage persistence  │ │ - Platform adapters          │
│                             │ │                              │
│ Examples:                   │ │ Examples:                    │
│ - Current page              │ │ - Loaded PDF document        │
│ - Zoom level                │ │ - User credits from API      │
│ - Panel open/closed         │ │ - Graph data from file       │
│ - Theme preference          │ │ - Backend responses          │
└─────────────────────────────┘ └──────────────────────────────┘
```

---

## ImmediateState: Frontend Authority

ImmediateState manages ephemeral UI state. Operations are **synchronous** and **always succeed**.

### When to Use

- UI state (zoom, pan, scroll position)
- User selections (current page, selected node)
- Transient state (loading indicators, validation errors)
- Preferences (theme, layout mode)
- Anything that resets on page refresh is fine

### Characteristics

| Property | Value |
|----------|-------|
| Operations | Synchronous |
| Failure | Never fails |
| Persistence | localStorage (optional) |
| Reactivity | Subscription-based |

### API Pattern

```typescript
class ImmediateState {
  // Subscription
  subscribe(query: string, callback: (event: StateEvent) => void): () => void;
  notifyListeners(targetQuery?: string): void;

  // Tile registration
  registerTile(tileName: string, tileState: TileStateDefinition): void;

  // Built-in framework state
  readonly queries: {
    getFocusedTile: () => string | null;
    getLoadingStatus: () => LoadingStatus;
  };
}
```

### Tile Registration Pattern

Each tile registers its immediate state, creating a namespaced API:

```typescript
// Define the interface
export interface GraphTileImmediateState {
  getZoom(): number;
  setZoom(zoom: number): void;
  getSelectedNode(): string | null;
  setSelectedNode(nodeId: string | null): void;
}

// TypeScript module augmentation for type safety
declare module "../../../yggdrasil/state/ImmediateState" {
  interface ImmediateState {
    graphTile: GraphTileImmediateState;
  }
}

// Registration function
export function registerGraphImmediateState(coordinator: AppCoordinator): void {
  // Internal state (private)
  const state = {
    zoom: 1.0,
    selectedNode: null as string | null,
  };

  // Public interface
  const tileState: GraphTileImmediateState = {
    getZoom: () => state.zoom,
    setZoom: (zoom: number) => {
      state.zoom = zoom;
      coordinator.immediateState.notifyListeners("graphTile.getZoom");
    },
    getSelectedNode: () => state.selectedNode,
    setSelectedNode: (nodeId: string | null) => {
      state.selectedNode = nodeId;
      coordinator.immediateState.notifyListeners("graphTile.getSelectedNode");
    },
  };

  coordinator.immediateState.registerTile("graphTile", tileState);
}
```

### Usage

```typescript
// Read state (borrow)
const zoom = coordinator.immediateState.graphTile.getZoom();

// Write state (only owner should do this)
coordinator.immediateState.graphTile.setZoom(1.5);

// Subscribe to changes
const unsubscribe = coordinator.immediateState.subscribe(
  "graphTile.getZoom",
  (event) => {
    console.log("Zoom changed:", event.data);
    this.scheduleRender();
  }
);
```

---

## EventualState: Backend Authority

EventualState manages asynchronous operations and external interactions. Operations **may fail** and **require error handling**.

### When to Use

- Data from files (PDF documents, graph JSON)
- API responses (user profile, credits)
- Storage operations (save/load)
- Any operation that could fail or take time

### Characteristics

| Property | Value |
|----------|-------|
| Operations | Asynchronous |
| Failure | May fail, errors must be handled |
| Persistence | Via adapters (API, storage) |
| Reactivity | Subscription-based |

### Platform Adapters

EventualState uses adapters to abstract platform-specific operations:

```typescript
class EventualState {
  // Platform adapters (__ prefix = "available but prefer wrapping")
  public __fileAdapter: FileAdapter;      // File I/O
  public __apiAdapter: ApiAdapter;        // HTTP requests
  public __storageAdapter: StorageAdapter; // Persistent storage

  // Convenience methods
  async readFile(file: File): Promise<ArrayBuffer>;
  async fetchData(url: string): Promise<any>;
  async postData(url: string, data: any): Promise<any>;
  async saveToStorage(key: string, data: any): Promise<void>;
}
```

The adapters can be swapped at build time for different platforms (web, desktop, mobile).

### Tile Registration Pattern

```typescript
// Define the interface
export interface GraphTileEventualState {
  currentGraph: GraphDocument | null;
  getCurrentGraph(): GraphDocument | null;
  loadGraphAction(file: File): Promise<GraphDocument>;
}

// TypeScript module augmentation
declare module "../../../yggdrasil/state/EventualState" {
  interface EventualState {
    graphTile: GraphTileEventualState;
  }
}

// Registration function
export function registerGraphEventualState(coordinator: AppCoordinator): void {
  coordinator.eventualState.registerTile("graphTile", [
    // State property (reactive getter/setter)
    {
      name: "currentGraph",
      initialValue: null,
      type: "GraphDocument | null",
    },
    // Async action
    {
      name: "loadGraphAction",
      action: async (file: File) => {
        const arrayBuffer = await coordinator.eventualState.readFile(file);
        const text = new TextDecoder().decode(arrayBuffer);
        const data = JSON.parse(text);

        return {
          file,
          data: {
            nodes: data.nodes || [],
            edges: data.edges || [],
          },
        };
      },
    },
  ]);
}
```

### Usage

```typescript
// Read state
const graph = coordinator.eventualState.graphTile.getCurrentGraph();

// Call async action
const graphDoc = await coordinator.eventualState.graphTile.loadGraphAction(file);

// Set state (triggers reactive updates)
coordinator.eventualState.graphTile.currentGraph = graphDoc;

// Subscribe to changes
coordinator.eventualState.subscribe(
  "graphTile.getCurrentGraph",
  (event) => {
    console.log("Graph loaded:", event.data);
  }
);
```

---

## AppCoordinator: Orchestration Layer

The AppCoordinator owns both state layers and coordinates complex flows.

### When to Use

- Multi-step operations (load file → parse → update UI)
- Cross-tile coordination (graph selection → PDF navigation)
- Error handling with recovery
- Any flow touching multiple state pieces

### Characteristics

| Property | Value |
|----------|-------|
| Ownership | Owns ImmediateState and EventualState |
| Purpose | Complex flow orchestration |
| Access | Full read/write to both layers |

### API Pattern

```typescript
class AppCoordinator {
  public eventualState: EventualState;
  public immediateState: ImmediateState;

  // Coordination registration
  registerCoordination(tileName: string, definitions: CoordinationDefinition[]): void;
}

interface CoordinationDefinition {
  name: string;
  coordination: (...args: any[]) => Promise<any>;
}
```

### Coordination Pattern

```typescript
// Define the interface
export interface GraphTileCoordination {
  coordinateLoadGraph(file: File): Promise<void>;
}

// TypeScript module augmentation
declare module "../../../yggdrasil/state/AppCoordinator" {
  interface AppCoordinator {
    graphTile: GraphTileCoordination;
  }
}

// Registration function
export function registerGraphCoordinator(coordinator: AppCoordinator): void {
  coordinator.registerCoordination("graphTile", [
    {
      name: "coordinateLoadGraph",
      coordination: async (file: File) => {
        // 1. Set loading state (immediate)
        coordinator.immediateState.setLoadingStatus("loading");

        try {
          // 2. Load and parse file (eventual)
          const graphDoc = await coordinator.eventualState.graphTile.loadGraphAction(file);

          // 3. Update document state (eventual)
          coordinator.eventualState.graphTile.currentGraph = graphDoc;

          // 4. Reset UI state (immediate)
          coordinator.immediateState.graphTile.setSelectedNode(null);
          coordinator.immediateState.graphTile.setZoom(1.0);

          // 5. Success
          coordinator.immediateState.setLoadingStatus("idle");
        } catch (error) {
          // 6. Error handling
          coordinator.immediateState.setLoadingStatus("error", error.message);
        }
      },
    },
  ]);
}
```

### Usage

```typescript
// Call coordination method
await coordinator.graphTile.coordinateLoadGraph(file);
```

---

## The Registration Pattern

Every tile registers three pieces during initialization:

```typescript
function initializeApp() {
  const eventualState = new EventualState(adapters);
  const immediateState = new ImmediateState();
  const coordinator = new AppCoordinator(eventualState, immediateState);

  // Register each tile's state
  registerGraphEventualState(coordinator);
  registerGraphImmediateState(coordinator);
  registerGraphCoordinator(coordinator);

  registerPdfEventualState(coordinator);
  registerPdfImmediateState(coordinator);
  registerPdfCoordinator(coordinator);

  return coordinator;
}
```

### Beautiful Namespaces

The result is clean, type-safe access:

```typescript
// Each tile owns its namespace
coordinator.eventualState.graphTile.getCurrentGraph()
coordinator.eventualState.pdfTile.getCurrentPdfDocument()

coordinator.immediateState.graphTile.getZoom()
coordinator.immediateState.pdfTile.getCurrentPage()

coordinator.graphTile.coordinateLoadGraph(file)
coordinator.pdfTile.coordinateLoadPdf(file)
```

Benefits:
- **Compile-time safety** - TypeScript validates all state access
- **Autocomplete** - IDE knows all available methods
- **No naming conflicts** - Each tile owns its namespace
- **Clear ownership** - Obvious which tile manages which state

---

## Reactive Subscription System

Both state layers support reactive subscriptions.

### StateEvent Structure

```typescript
interface StateEvent {
  id: string;           // Unique event ID
  type: string;         // Query identifier (e.g., "graphTile.getZoom")
  timestamp: number;    // Event timestamp
  stateId: string;      // "immediate-state" or "eventual-state"
  data: any;            // Current value from query
}
```

### Subscription Behavior

1. **Immediate callback** - Fires immediately with current value on subscribe
2. **Targeted notifications** - Only subscribers to changed query are notified
3. **Unsubscribe function** - Returns cleanup function for memory management

```typescript
// Subscribe
const unsubscribe = coordinator.immediateState.subscribe(
  "graphTile.getZoom",
  (event) => this.handleZoomChange(event.data)
);

// Later: unsubscribe
unsubscribe();
```

---

## State Flow Patterns

### Pattern 1: Simple UI Interaction

```
User clicks zoom button
  → Component reads current zoom
  → Component calls setZoom(newValue)
  → ImmediateState notifies listeners
  → Subscribed components re-render
```

```typescript
const handleZoomIn = () => {
  const current = this.immediateState.graphTile.getZoom();
  this.immediateState.graphTile.setZoom(current * 1.2);
};
```

### Pattern 2: Async Operation

```
User uploads file
  → Component calls coordinator method
  → Coordinator sets loading state (immediate)
  → Coordinator calls action (eventual)
  → Coordinator updates document state (eventual)
  → Coordinator clears loading state (immediate)
  → Subscribers re-render with new data
```

```typescript
await coordinator.graphTile.coordinateLoadGraph(file);
```

### Pattern 3: Cross-Tile Coordination

```
User clicks graph node
  → GraphTile updates selectedNode (immediate)
  → Coordinator receives notification
  → Coordinator looks up node's page location
  → Coordinator updates pdfTile.currentPage (immediate)
  → Both tiles re-render
```

---

## State as Contract

A powerful insight: **state registration IS the contract**.

When a tile registers its state, it declares:
- What state it needs to exist
- What actions it provides
- What other tiles can depend on

```typescript
// PDFTile declares this contract via registration
coordinator.eventualState.registerTile('pdfTile', [
  { name: 'currentPdfDocument', initialValue: null },
  { name: 'loadPdfAction', action: async (file) => {...} }
]);
```

This means:
- Pure tiles depend on **contracts** (state interfaces), not implementations
- Yapp services can **fulfill contracts** by providing implementations
- Mocks can be auto-generated from contracts for development

### Three Layers of Services

```
Framework Services (ship with Yggdrasil)
  → __fileAdapter, __apiAdapter, __storageAdapter
  → Platform abstractions, no business logic

Pure Tiles (CDN-distributed)
  → Use only framework services
  → Declare state contracts via registration
  → Self-contained, reusable

Yapp Services (app-specific)
  → Implement tile contracts with backends
  → Third-party integrations (Stripe, auth)
  → App-specific business logic
```

---

## Conventions Summary

### Naming

| Type | Convention | Example |
|------|------------|---------|
| Tile ID | camelCase | `graphTile` |
| Getter | get + Property | `getZoom()` |
| Setter | set + Property | `setZoom()` |
| Action | verb + Action | `loadGraphAction()` |
| Coordination | coordinate + Flow | `coordinateLoadGraph()` |
| Query | tileId.getProperty | `graphTile.getZoom` |

### File Organization

```
tiles/
└── GraphTile/
    ├── meta.ts              # TILE_ID constant
    ├── EventualState.ts     # Eventual state registration
    ├── ImmediateState.ts    # Immediate state registration
    ├── AppCoordinator.ts    # Coordination registration
    ├── Tile.ts              # Tile class
    └── components/          # UI components
```

### Decision Matrix

| Question | ImmediateState | EventualState | Coordinator |
|----------|---------------|---------------|-------------|
| Is it synchronous? | ✅ | ❌ | ❌ |
| Can it fail? | ❌ | ✅ | ✅ |
| Is it UI state? | ✅ | ❌ | ❌ |
| Is it from an API/file? | ❌ | ✅ | ❌ |
| Does it touch multiple states? | ❌ | ❌ | ✅ |
| Does it need error handling? | ❌ | ✅ | ✅ |

---

## Debugging

Both state layers provide debugging tools:

```typescript
// Get all events
coordinator.immediateState.getEventHistory()
coordinator.eventualState.getEventHistory()

// Get recent events (last 1 second)
coordinator.immediateState.getRecentEvents(1000)

// Full debug info
coordinator.getDebugInfo()
// Returns: { eventualState, immediateState, registeredTiles, registeredCoordinations }
```

---

## Summary

| Layer | Purpose | Operations | Failure |
|-------|---------|------------|---------|
| **ImmediateState** | Frontend UI state | Sync | Never |
| **EventualState** | Backend/async data | Async | May fail |
| **AppCoordinator** | Orchestration | Mixed | Handles errors |

**Key patterns:**
1. Register state during initialization
2. Use namespaced access (`coordinator.tileName.method()`)
3. Subscribe for reactive updates
4. Use coordinator for complex flows
5. Let state registration define the contract

---

## Vision: Closure-Based Flows

*Status: Experimental - being validated*

The current subscription system works well, but hides dependencies:

```typescript
// What does this subscription actually depend on?
coordinator.immediateState.subscribe("graphTile.getZoom", () => {
  this.render(); // Hidden: accesses multiple state pieces, DOM, etc.
});
```

The **closure-based flow architecture** makes every dependency explicit:

```typescript
// Every dependency is visible and typed
coordinator.immediateState.subscribe("graphTile.getZoom", () => {
  this.flowEngine.execute(this, [
    { action: "rerenderFlow", delay: 0 }
  ], {}, {
    views: {
      getDocument: () => this.eventualState.pdfTile.getCurrentPdfDocument(),
      getCurrentPage: () => this.immediateState.pdfTile.getCurrentPage(),
      getZoom: () => this.immediateState.graphTile.getZoom(),
    }
  });
});
```

### Flow Method Signatures

```typescript
private async rerenderFlow(
  context: any,
  deps: {
    views: {
      getDocument: () => PDFDocument | null;
      getCurrentPage: () => number;
      getZoom: () => number;
    };
    mutations?: {
      setCurrentPage: (page: number) => void;
    };
  }
): Promise<void> {
  // All dependencies are explicit and typed
  const pdf = deps.views.getDocument();
  const page = deps.views.getCurrentPage();
  const zoom = deps.views.getZoom();

  this.render();
}
```

### Why Explicit Dependencies?

**Compile-time benefits:**
- Missing dependencies become TypeScript errors
- Refactoring state breaks dependent flows at compile time
- IntelliSense shows available dependencies

**Architecture benefits:**
- Static race condition analysis possible
- Dependency graph can be generated automatically
- Clear coupling boundaries between tiles

**Debugging benefits:**
- Self-documenting flows
- Trace exact dependencies used
- Mock dependencies easily for testing

### Race Condition Detection

With explicit dependencies, we can analyze patterns:

**Safe pattern:**
```typescript
// All dependencies within same tile
views: {
  getPage: () => this.immediateState.pdfTile.getCurrentPage(),
  getZoom: () => this.immediateState.pdfTile.getZoom(),
}
```

**Dangerous pattern:**
```typescript
// Flow triggers other tile, then reads its state - RACE!
mutations: {
  triggerGraph: () => this.immediateState.graphTile.setSelectedNode(nodeId),
},
views: {
  getGraphZoom: () => this.immediateState.graphTile.getZoom(), // Race condition!
}
```

### Multi-Step Flows

Complex interactions can be explicit sequences:

```typescript
this.flowEngine.execute(this, [
  { action: "navigateToNodePageFlow", delay: 0 },
  { action: "highlightNodeBboxFlow", delay: 100 }  // Staggered
], { nodeId }, {
  views: {
    getGraph: () => this.eventualState.graphTile.getCurrentGraph(),
    getCurrentPage: () => this.immediateState.pdfTile.getCurrentPage(),
  },
  mutations: {
    setCurrentPage: (page) => this.immediateState.pdfTile.setCurrentPage(page),
  }
});
```

### The Goal

This architecture enables **compile-time concurrent programming** for frontend:
1. Static analysis of race conditions
2. Compile-time verification of flow correctness
3. Dependency graph generation for visualization
4. Ties into the Markov Tree vision for complete flow tracing

*This is experimental - we're validating that the patterns hold in practice.*

---

## Next Steps

- [Rendering System](./02-rendering-system.md) — How state becomes DOM
- [Adapter System](./06-adapter-system.md) — Cross-platform abstractions
