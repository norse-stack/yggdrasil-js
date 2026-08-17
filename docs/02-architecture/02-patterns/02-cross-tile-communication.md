# Cross-Tile Communication

> *From reactive wiring to controlled coupling*

This document describes how tiles communicate in Yggdrasil. The design follows a progression: start simple, add complexity only when needed.

---

## The Core Principle

**Tiles stay focused on their own state. The App layer handles coordination.**

A PDFTile manages PDF viewing. A GraphTile manages graph visualization. Neither knows the other exists. The App knows both exist and defines their relationship.

---

## The Geometry of Tile Composition

Before diving into patterns, it helps to understand *why* we care about keeping tiles independent.

### Pure Tiles = Orthogonal Basis Vectors

Think of each pure tile as a basis vector in "app space":

```
TileA = (1, 0)
TileB = (0, 1)
```

They're orthogonal: `TileA · TileB = 0`

The composition space is the full Cartesian product. You can move freely in the A dimension without affecting B, and vice versa:

```
Orthogonal (pure):

    TileB
      ↑
      │
      │
      │
      └──────→ TileA

Area = |TileA| × |TileB|
```

Full rectangular space. Maximum flexibility.

### Mixed Tiles = Coupled Vectors

When TileA reads TileB's state directly, they're no longer orthogonal. TileA now has a component in TileB's direction:

```
TileA' = (1, ε)    // ε is the coupling strength
TileB  = (0, 1)
```

The dot product: `TileA' · TileB = ε ≠ 0`

The angle θ between them is no longer 90°:

```
cos(θ) = ε / |TileA'| ≈ ε  (for small coupling)
```

### The Geometric Consequence

Two orthogonal vectors span a **rectangle**.
Two coupled vectors span a **parallelogram**.

```
Orthogonal (pure):          Coupled (mixed):

    TileB                       TileB
      ↑                           ↑
      │                          ╱
      │                         ╱
      │                        ╱  θ < 90°
      └──────→ TileA          └──────→ TileA'

Area = |A| × |B|            Area = |A| × |B| × sin(θ)
```

The `sin(θ)` factor is what you lose to coupling.

### The Coupling Coefficient

Define coupling as:

```
κ = cos(θ)

where:
  κ = 0  → orthogonal (pure tiles)
  κ = 1  → fully aligned (maximally coupled)
```

The "independence factor" - how much free composition space remains:

```
independence = sin(θ) = √(1 - κ²)
```

Effective composition space:

```
Pure:   |TileA| × |TileB|
Mixed:  |TileA| × |TileB| × √(1 - κ²)
```

### What This Means Practically

| Coupling (κ) | Independence | What it feels like |
|--------------|--------------|-------------------|
| 0 | 100% | Tiles compose freely, any combination works |
| 0.3 | 95% | Light coordination, mostly independent |
| 0.7 | 71% | Significant coupling, must consider interactions |
| 0.9 | 44% | Heavy coupling, tiles behave differently in combination |
| 1.0 | 0% | Fully entangled, effectively one tile |

### The Design Implication

Pure tiles maximize your composition space. Every bit of coupling costs you some of that space - not linearly, but by `√(1 - κ²)`.

The first bits of coupling are cheap: going from κ=0 to κ=0.3 only costs you 5% of your space.

But coupling compounds: going from κ=0.7 to κ=0.9 costs you another 27%.

This matches intuition - a little coordination is fine, but heavy coupling makes tiles hard to reason about independently.

**The progression below is designed to let you add coupling intentionally, in controlled locations, so you always know what you're trading away.**

---

## Progression Overview

| Level | Pattern | Coupling Cost | Use When |
|-------|---------|---------------|----------|
| **1** | AppCoordinator subscription | Low (κ ≈ 0.1-0.3) | Tile A changes → trigger action in Tile B |
| **2** | Tile extension (override) | Medium (κ ≈ 0.3-0.7) | Render depends on combined state from multiple tiles |

Start at Level 1. Move to Level 2 only when Level 1 becomes awkward.

---

## Level 1: AppCoordinator Subscriptions

### The Pattern

1. Tile updates its own state
2. App subscribes to that state
3. AppCoordinator triggers actions in other tiles

This keeps tiles orthogonal - they don't know about each other. The coupling exists only in the App layer, isolated and explicit.

### Example: Node Selection → PDF Navigation

**GraphTile just manages its own state:**

```typescript
// In GraphTile click handler
const handleNodeClick = (nodeId: string) => {
  this.immediateState.graphTile.setSelectedNode(nodeId);
  // Done. GraphTile's job is complete.
};
```

**App subscribes and coordinates:**

```typescript
// In ExampleApp initialization
this.immediateState.subscribe('graphTile.getSelectedNode', (event) => {
  const nodeId = event.data;
  if (nodeId) {
    this.appCoordinator.app.coordinateNodeSelection(nodeId);
  }
});
```

**AppCoordinator handles cross-tile logic:**

```typescript
// In app/AppCoordinator.ts
coordinateNodeSelection: async (nodeId: string) => {
  const node = coordinator.eventualState.graphTile.getNode(nodeId);
  
  if (node?.page) {
    coordinator.immediateState.pdfTile.setCurrentPage(node.page);
    coordinator.immediateState.pdfTile.setHighlightedBbox(node.bbox);
  }
}
```

### Example: Bidirectional Coordination

The pattern works the same in both directions:

**Graph → PDF:**
```typescript
// Subscribe to graph selection
this.immediateState.subscribe('graphTile.getSelectedNode', (event) => {
  if (event.data) {
    this.appCoordinator.app.coordinateNodeSelection(event.data);
  }
});
```

**PDF → Graph:**
```typescript
// Subscribe to bbox clicks
this.immediateState.subscribe('pdfTile.getClickedBbox', (event) => {
  if (event.data) {
    this.appCoordinator.app.coordinateBboxSelection(event.data);
  }
});
```

Each tile only updates its own state. The App handles the cross-talk.

### When Level 1 Works Well

- **Reactive flows**: "When A happens, do B"
- **Sequential coordination**: Update tile A, then tile B, then tile C
- **Event-driven**: User action triggers a chain of state changes
- **One-to-many**: Single state change affects multiple tiles

### When Level 1 Gets Awkward

```typescript
// This feels wrong in AppCoordinator:
coordinateSomething: async () => {
  // Complex conditional based on multiple tile states
  if (
    coordinator.immediateState.graphTile.isFrozen() &&
    !coordinator.immediateState.pdfTile.isProcessing() &&
    coordinator.eventualState.searchTile.hasResults()
  ) {
    // Do something specific to this combination
  }
}
```

When your coordination logic is really about **how a tile renders based on combined state**, not about **triggering actions**, you've outgrown Level 1.

---

## Level 2: Tile Extension (Override)

### The Pattern

Extend a tile class to add cross-tile awareness in rendering or handlers.

This introduces real coupling - the extended tile now has a component in another tile's direction. But the coupling is explicit, contained in override files, and intentional.

### Example: Render Conditional on Another Tile's State

**Base tile (pure, κ = 0):**

```typescript
export class PDFTile implements TileInterface {
  performRender(layersToUpdate?: string[]) {
    const pdf = this.eventualState.pdfTile.getCurrentPdfDocument();
    
    munin
      .inTile(TILE_ID)
      .layer('content', munin.cond(this.PdfCanvas()).when(!!pdf))
      .collectLayers();
  }
}
```

**Extended tile (coupled, κ > 0):**

```typescript
// PDFTile.overrides.ts
import { PDFTile as BasePDFTile } from './PDFTile';

export class PDFTile extends BasePDFTile {
  performRender(layersToUpdate?: string[]) {
    const pdf = this.eventualState.pdfTile.getCurrentPdfDocument();
    const graphFrozen = this.immediateState.graphTile?.isFrozen() ?? false;
    
    munin
      .inTile(TILE_ID)
      .layer('content', munin
        .cond(this.PdfCanvas())
        .when(!!pdf && !graphFrozen)  // Now considers GraphTile state
      )
      .collectLayers();
  }
}
```

### Example: Handler That Triggers Cross-Tile Flow

```typescript
// GraphTile.overrides.ts
import { GraphTile as BaseGraphTile } from './GraphTile';

export class GraphTile extends BaseGraphTile {
  protected handleNodeClick(nodeId: string) {
    super.handleNodeClick(nodeId);  // Base behavior (updates own state)
    
    // Cross-tile coordination via AppCoordinator
    this.appCoordinator.app.coordinateNodeSelection(nodeId);
  }
}
```

Note: Level 2 still uses AppCoordinator for the actual coordination. The override provides the call site.

### When Level 2 Is Needed

- **Render-time conditionals**: "Show X only if TileB.state is Y"
- **Combined state styling**: CSS classes based on multiple tiles
- **Complex visibility logic**: Layer shown/hidden based on app-wide state
- **Handler augmentation**: "Do the base thing, plus coordinate with other tiles"

### The Key Distinction

| Level 1 (Subscription) | Level 2 (Override) |
|------------------------|-------------------|
| "When X changes, do Y" | "Render differently based on X and Y" |
| Reactive, event-driven | Declarative, state-driven |
| Logic in AppCoordinator | Logic in tile override |
| Tiles stay untouched | Tiles are extended |
| Low coupling (κ ≈ 0.1-0.3) | Medium coupling (κ ≈ 0.3-0.7) |

---

## Combining Both Levels

Most apps use both patterns together:

```typescript
// Level 2: Override adds cross-tile call site
class GraphTile extends BaseGraphTile {
  protected handleNodeClick(nodeId: string) {
    super.handleNodeClick(nodeId);
    this.appCoordinator.app.coordinateNodeSelection(nodeId);  // Level 1: AppCoordinator does the work
  }
}

// Level 1: AppCoordinator handles the coordination logic
coordinateNodeSelection: async (nodeId: string) => {
  const node = coordinator.eventualState.graphTile.getNode(nodeId);
  if (node?.page) {
    coordinator.immediateState.pdfTile.setCurrentPage(node.page);
  }
}
```

Level 2 provides the *call site*. Level 1 provides the *coordination logic*.

---

## Decision Guide

```
Need cross-tile communication?
│
├─ Is it "when A changes, update B"?
│   └─ YES → Level 1: AppCoordinator subscription
│
├─ Is it "render X based on state from A and B"?
│   └─ YES → Level 2: Tile override
│
└─ Is it "on user action in A, trigger flow involving B"?
    └─ Use BOTH: Override provides call site, AppCoordinator does coordination
```

---

## Summary

| Aspect | Level 1 | Level 2 |
|--------|---------|---------|
| Pattern | Subscribe + coordinate | Extend + override |
| Coupling location | AppCoordinator | Override file |
| Tile modification | None | Inheritance |
| Best for | Reactive flows | Render conditionals |
| Coupling cost | Low (κ ≈ 0.1-0.3) | Medium (κ ≈ 0.3-0.7) |
| Independence preserved | ~95% | ~70-90% |

**Start with Level 1.** It handles most cases. **Move to Level 2** when you need render-time decisions based on combined state, or when you need a clean call site for cross-tile coordination.

The geometry tells the story: pure tiles give you the full rectangle of composition possibilities. Each bit of coupling costs you area in that rectangle. Add coupling intentionally, know what you're trading, and keep it in controlled locations.

---

## Related Documents

- [State System](../01-systems/01-state-system.md) — ImmediateState, EventualState, AppCoordinator
