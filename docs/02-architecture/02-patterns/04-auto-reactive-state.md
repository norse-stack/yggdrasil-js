# Auto-Reactive Tile State

> *The "Small Worlds" Pattern: Internal state is opt-OUT, external state is opt-IN*

This document describes the auto-reactive state pattern in Yggdrasil - a pattern enforced by code that eliminates boilerplate for internal tile state management while keeping cross-tile communication explicit.

---

## The Core Insight

**Tiles almost always need to re-render when their own state changes.**

This is the "Small Worlds" observation: a tile's internal state and its render are tightly coupled by nature. When `currentPage` changes, the PDF tile needs to re-render. When `selectedNode` changes, the graph tile needs to re-render.

Manually subscribing to every internal state property is pure boilerplate:

```typescript
// Before: Manual subscription boilerplate (~10-20 lines per tile)
this.immediateState.subscribe('pdfTile.getCurrentPage', () => {
  this.tilingManager.scheduleRender(TILE_ID);
});
this.immediateState.subscribe('pdfTile.getZoom', () => {
  this.tilingManager.scheduleRender(TILE_ID);
});
this.immediateState.subscribe('pdfTile.isBboxVisible', () => {
  this.tilingManager.scheduleRender(TILE_ID);
});
// ... repeat for every state property
```

The auto-reactive pattern eliminates this boilerplate through two mechanisms:
1. **createReactiveState()** - Auto-notifies on property changes
2. **autoSubscribeTile()** - Auto-subscribes to all internal getters

---

## The Two-Phase Pattern

### Phase 1: createReactiveState()

Wraps state in a Proxy that auto-notifies on property changes:

```typescript
import { createReactiveState } from '../../../yggdrasil/state/ImmediateState.js';

const state = createReactiveState(
  {
    currentPage: 1,
    zoom: 1.0,
    bboxVisible: true,
    dropdownOpen: false,
  },
  {
    namespace: TILE_ID,  // e.g., "pdfTile"
    notify: (query) => immediateState.notifyListeners(query),
    exclude: ['cachedLayout'],  // Optional: properties that shouldn't notify
  }
);

// Setters become trivial:
setCurrentPage: (page: number) => {
  state.currentPage = page;  // Auto-notifies "pdfTile.getCurrentPage"
}
```

**What it eliminates:** Manual `notifyListeners()` calls in every setter.

### Phase 2: autoSubscribeTile()

Auto-subscribes a tile to all its registered state getters:

```typescript
import { autoSubscribeTile } from '../../../yggdrasil/state/ImmediateState.js';

// In tile constructor, AFTER tilingManager is initialized:
autoSubscribeTile(this.immediateState, {
  tileId: TILE_ID,
  scheduleRender: (id) => this.tilingManager.scheduleRender(id),
  excludeFromRender: ['getZoom'],  // Optional: getters that shouldn't trigger render
});
```

**What it eliminates:** Manual subscription boilerplate for internal state.

---

## The Boolean Naming Convention

The auto-reactive system needs to derive getter names from property names. It uses a convention:

| Property Name | Getter Name | Pattern |
|--------------|-------------|---------|
| `currentPage` | `getCurrentPage` | `get` prefix (default) |
| `zoom` | `getZoom` | `get` prefix (default) |
| `dropdownOpen` | `isDropdownOpen` | `is` prefix (boolean pattern) |
| `bboxVisible` | `isBboxVisible` | `is` prefix (boolean pattern) |
| `processing` | `isProcessing` | `is` prefix (boolean pattern) |

### The Boolean Patterns List

Properties are detected as boolean if they end with any of these suffixes:

```typescript
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
```

**Important:** If you add a new boolean state property, ensure it ends with one of these patterns. Otherwise it will be mapped to `get{Property}` instead of `is{Property}`.

Example mapping:
- `dropdownOpen` → `isDropdownOpen` (ends with "Open")
- `nodeSelected` → `isNodeSelected` (ends with "Selected")
- `panelCollapsed` → `isPanelCollapsed` (ends with "Collapsed")
- `myBooleanFlag` → `getMyBooleanFlag` (no pattern match - uses `get`)

### Extending the Boolean List

If you need a new boolean suffix pattern, add it to `deriveGetterName()` in `ImmediateState.ts`:

```typescript
// In /yggdrasil/state/ImmediateState.ts
function deriveGetterName(propName: string): string {
  const booleanPatterns = [
    // ... existing patterns ...
    "YourNewPattern",  // Add new patterns here
  ];
  // ...
}
```

---

## Internal vs External State

The pattern distinguishes between two types of state subscriptions:

### Internal State (Opt-OUT)

State within a tile's own namespace. Auto-subscribed by default.

```typescript
// These are auto-subscribed - no manual code needed:
// pdfTile.getCurrentPage
// pdfTile.getZoom
// pdfTile.isBboxVisible

// To exclude from auto-render (e.g., D3 handles zoom separately):
autoSubscribeTile(this.immediateState, {
  tileId: TILE_ID,
  scheduleRender: (id) => this.tilingManager.scheduleRender(id),
  excludeFromRender: ['getZoom'],  // Won't trigger re-render
});
```

### External State (Opt-IN) - EXPERIMENTAL

Cross-tile dependencies require explicit subscriptions. This is intentional - cross-tile coupling should be visible and controlled.

```typescript
// In GraphTile, subscribing to PDF state:
this.immediateState.subscribe('pdfTile.getCurrentPage', (event) => {
  // React to PDF page changes
  this.highlightNodesOnPage(event.data);
});
```

**Note:** The cross-tile subscription pattern is still being refined. See [02-cross-tile-communication.md](./02-cross-tile-communication.md) for current guidance on AppCoordinator-based coordination.

---

## Implementation Checklist

When migrating a tile to auto-reactive state:

### 1. Update ImmediateState Registration

```typescript
// Before: Manual notification in every setter
setCurrentPage: (page: number) => {
  state.currentPage = page;
  immediateState.notifyListeners('pdfTile.getCurrentPage');  // Remove this
}

// After: Use createReactiveState
const state = createReactiveState(
  { currentPage: 1 },
  { namespace: TILE_ID, notify: (q) => immediateState.notifyListeners(q) }
);

setCurrentPage: (page: number) => {
  state.currentPage = page;  // Notification is automatic
}
```

### 2. Add autoSubscribeTile to Tile Constructor

```typescript
constructor(appCoordinator: AppCoordinator) {
  // ... initialization ...

  // Initialize tilingManager FIRST
  this.tilingManager = new TilingManager(container, this.immediateState);

  // THEN auto-subscribe (requires tilingManager)
  autoSubscribeTile(this.immediateState, {
    tileId: TILE_ID,
    scheduleRender: (id) => this.tilingManager.scheduleRender(id),
  });
}
```

**Critical:** `autoSubscribeTile` must be called AFTER `tilingManager` is initialized. The callback captures `this.tilingManager` in a closure.

### 3. Remove Internal Subscription Boilerplate

Delete manual subscriptions for internal state:

```typescript
// DELETE these lines from setupSubscriptions():
this.immediateState.subscribe('pdfTile.getCurrentPage', () => {
  this.tilingManager.scheduleRender(TILE_ID);
});
// ... and all other internal state subscriptions
```

### 4. Keep External Subscriptions

Explicit subscriptions for cross-tile or framework state stay:

```typescript
// KEEP: External state subscriptions
this.immediateState.subscribe('theme.getTheme', () => {
  this.tilingManager.scheduleRender(TILE_ID);
});

// KEEP: Cross-tile subscriptions (if needed)
this.immediateState.subscribe('graphTile.getSelectedNode', () => {
  // React to external tile state
});
```

---

## Why This Pattern Works

### Yggdrasil's Game-Loop Renderer

Unlike React's batch-and-reconcile model, Yggdrasil uses a game-loop renderer. Notifications fire immediately, but the render loop runs at 60fps and batches naturally.

This means:
- No need for manual batching of state updates
- No performance concerns from multiple rapid notifications
- The renderer's dirty-tracking handles efficiency

### The "Small Worlds" Optimization

The observation that tiles are "small worlds" - most state changes are internal - makes opt-OUT the right default. The boilerplate savings compound:

| Without Auto-Reactive | With Auto-Reactive |
|----------------------|-------------------|
| ~10-20 manual subscriptions per tile | 1 `autoSubscribeTile()` call |
| Manual `notifyListeners()` in every setter | Automatic via Proxy |
| Easy to forget subscriptions | Complete by default |
| Coupling visible everywhere | Coupling visible only for external deps |

---

## Summary

| Aspect | Internal State | External State |
|--------|----------------|----------------|
| Default | Auto-subscribed | Not subscribed |
| Opt behavior | Opt-OUT (exclude) | Opt-IN (explicit) |
| Boilerplate | None | Manual subscription |
| Coupling visibility | Hidden (expected) | Explicit (intentional) |

**The pattern enforces good architecture:** internal state is managed automatically, cross-tile coupling is always visible.

---

## Related Documents

- [02-cross-tile-communication.md](./02-cross-tile-communication.md) - AppCoordinator patterns for cross-tile coordination
- [State System](../01-systems/01-state-system.md) - ImmediateState, EventualState, AppCoordinator overview
