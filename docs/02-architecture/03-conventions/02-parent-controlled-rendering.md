# Parent-Controlled Rendering Convention

## Overview

In Yggdrasil, the decision of **whether** to render a component should be made by the parent, not the component itself. Components should focus on **what** to render, assuming their preconditions are met.

## The Hierarchy Principle

This convention applies at every level of the rendering hierarchy:

```
Framework → decides if App can render
    App → decides if Tile can render
        Tile → decides if Layer/Component can render
```

**The parent always gates the child.** Loading states, readiness checks, and visibility conditions live on the parent, not the child.

---

## State Flows Down, Readiness Aggregates Up

### The Core Rule

> **Loading/readiness state is owned by the level that DOES the work.**
> **Children can READ parent state to aggregate readiness, but never WRITE parent state.**

Each level in the hierarchy:
1. **Owns** its own readiness state (for work it performs)
2. **Reads** parent readiness state (to know if prerequisites are met)
3. **Exposes** an aggregated `isReady()` for its children to use

```
┌─────────────────────────────────────────────────────────────────┐
│  App Level                                                       │
│  Owns: pdfjsReady, d3jsReady, etc. (framework/lib initialization)│
│  Exposes: app.isReady() = pdfjsReady && d3jsReady && ...        │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Tile Level                                                │  │
│  │  Owns: documentLoaded, isProcessing (tile-specific work)   │  │
│  │  Reads: app.isReady() (parent prerequisite)                │  │
│  │  Exposes: tile.isReady() = app.isReady() && documentLoaded │  │
│  │                                                            │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  Component Level                                     │  │  │
│  │  │  Reads: tile.isReady() (parent prerequisite)        │  │  │
│  │  │  Exposes: component-specific readiness if needed    │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Pattern?

1. **No upward state mutation** - Children never set parent state
2. **Clean aggregation** - Each level exposes one `isReady()` that encapsulates the full chain
3. **No shadowing** - No need for parent coordinators to wrap child coordinators
4. **Composable chains** - Long conditional chains become simple single checks

### Ownership Examples

| Work Being Done | Who Owns the State | State Location |
|-----------------|-------------------|----------------|
| PDF.js library loading | App | `app.isPdfjsReady()` |
| D3.js library loading | App | `app.isD3jsReady()` |
| PDF document loading | PDFTile | `pdfTile.isDocumentLoaded()` |
| Graph data loading | GraphTile | `graphTile.isGraphLoaded()` |
| PDF page rendering | PDFTile | `pdfTile.isProcessing()` |

### Aggregated Readiness Chains

Instead of long conditional chains at every usage site:

```typescript
// BAD: Every component repeats the full chain
const canRender =
  this.immediateState.app.isPdfjsReady() &&
  this.immediateState.app.isD3jsReady() &&
  this.immediateState.pdfTile.isDocumentLoaded() &&
  !this.immediateState.pdfTile.isProcessing();
```

Each level exposes an aggregated `isReady()`:

```typescript
// App ImmediateState
app.isReady(): boolean {
  return this.isPdfjsReady() && this.isD3jsReady();
}

// PDFTile ImmediateState
pdfTile.isReady(): boolean {
  return immediateState.app.isReady() &&      // Borrow from parent
         this.isDocumentLoaded() &&
         !this.isProcessing();
}

// Component just uses the tile's aggregated state
const canRender = this.immediateState.pdfTile.isReady();
```

### Nested Component Chains

This pattern scales elegantly for deeply nested components:

```typescript
// Tile level
pdfTile.isReady(): boolean {
  return app.isReady() && this.isDocumentLoaded();
}

// More specific readiness for certain components
pdfTile.isReadyForBboxOverlay(): boolean {
  return this.isReady() &&
         graphTile.isGraphLoaded() &&  // Cross-tile dependency
         this.isBboxVisible();
}

// Component uses the most specific readiness it needs
munin.cond(this.BboxOverlay()).when(this.immediateState.pdfTile.isReadyForBboxOverlay())
```

---

## The Pattern

### Wrong: Component guards itself

```typescript
export function PdfPageControls(this: PDFTile) {
  // BAD: Component decides if it should render
  if (
    !this.eventualState.pdfTile.getCurrentPdfDocument() ||
    this.immediateState.getLoadingStatus() === "loading"
  ) {
    return munin``;
  }

  return munin`<div class="controls">...</div>`;
}
```

### Correct: Parent guards the component

```typescript
// In Tile.ts (parent)
.layer(
  "controls",
  munin.cond(this.PdfPageControls())
    .when(this.immediateState.pdfTile.isReady()),
)

// In PdfPageControls.ts (component)
export function PdfPageControls(this: PDFTile) {
  // NOTE: Parent guards this component with .when() conditional
  // This component assumes PDF is loaded and tile is ready

  return munin`<div class="controls">...</div>`;
}
```

---

## Anti-Pattern: Child Writing Parent State

This is the key anti-pattern to avoid:

```typescript
// BAD: Tile coordinator sets APP state
coordinateLoadingFile: async (file: File) => {
  // WRONG - child is writing to parent's namespace!
  coordinator.immediateState.app.setPdfTileLoadingStatus("loading");
  await coordinator.eventualState.pdfTile.setCurrentPdfDocumentAction(file);
  coordinator.immediateState.app.setPdfTileLoadingStatus("idle");
}
```

Instead, each level owns its own state:

```typescript
// GOOD: Tile coordinator sets TILE state
coordinateLoadPdf: async (file: File) => {
  // Tile owns its own processing state
  coordinator.immediateState.pdfTile.setProcessing(true);
  await coordinator.eventualState.pdfTile.setCurrentPdfDocumentAction(file);
  coordinator.immediateState.pdfTile.setProcessing(false);
}

// App coordinator only sets APP state (for things app does)
coordinateAppInit: async () => {
  await initializePDFJS();
  coordinator.immediateState.app.setPdfjsReady(true);  // App owns this
}
```

---

## Why This Matters

### 1. Visibility

When reading the parent's render method, you can see at a glance which components are conditional and what their conditions are. The layer composition becomes a declarative description of the UI structure.

### 2. Single Responsibility

- **Parent**: Decides *whether* to render children based on state
- **Component**: Decides *what* to render, assuming preconditions are met

### 3. No Coordinator Shadowing

Without this pattern, you end up with app coordinators that just wrap tile coordinators:

```typescript
// BAD: App coordinator exists just to call tile coordinator
coordinateLoadDefaultPDF: async () => {
  await coordinator.pdfTile.coordinateLoadingFile(file);  // Why does this exist?
}
```

With proper state ownership, each coordinator only handles its own concerns.

### 4. State Borrowing Consistency

Early return guards that check state create a subtle issue: the guard reads state, but then the component might read it again in the template. By moving the guard to the parent's `.when()`, all state reads happen in the declarative template composition.

### 5. Simpler Components

Components become simpler when they don't need to handle "not ready" states. They can use non-null assertions (`!`) safely because the parent guarantees preconditions.

---

## When to Use

**Use parent-controlled rendering when:**
- Component requires certain state to exist (e.g., loaded document)
- Component should only appear in certain states (e.g., not loading)
- Multiple components share the same visibility condition

**Acceptable to keep in component:**
- Very complex conditions that would clutter the parent
- Conditions specific to internal component logic (not "should I render at all?")

---

## Implementation

Use Munin's `munin.cond().when()` pattern:

```typescript
// Basic conditional - renders nothing if condition is false
munin.cond(this.MyComponent())
  .when(condition)

// With explicit fallback content
munin.cond(this.MyComponent())
  .when(this.immediateState.pdfTile.isReady())
  .else(munin`<div class="empty-state">No data</div>`)

// Using aggregated readiness (preferred)
munin.cond(this.PdfPageControls())
  .when(this.immediateState.pdfTile.isReady())
```

The `.else()` is optional - if omitted, defaults to empty (renders nothing).

### Why `munin.cond()` over direct `.when()`

The explicit `munin.cond()` wrapper reads naturally as:

```
DO THIS → IF THIS
```

Compared to ternary thinking (`condition ? a : b`), this pattern:
- Forces you to think "happy path first"
- Makes the conditional intent explicit
- Reads top-to-bottom in logical order

---

## Component Documentation

When a component assumes its preconditions are met, document it:

```typescript
/**
 * PdfPageControls - Navigation and zoom controls
 *
 * NOTE: Parent guards this component - assumes tile.isReady() is true
 */
export function PdfPageControls(this: PDFTile) {
  // Component implementation...
}
```

---

## Summary

| Aspect | Old Pattern | New Pattern |
|--------|-------------|-------------|
| State ownership | Parent owns child's loading state | Each level owns its own state |
| State mutation | Child writes parent state | Children only read parent state |
| Readiness checks | Long chains at every usage | Aggregated `isReady()` per level |
| Coordinator design | App wraps tile (shadowing) | Each coordinator handles own concerns |
| Visibility of conditions | Hidden in component | Visible in layer composition |
| Component complexity | Higher (handles empty state) | Lower (assumes ready) |

**Key principles:**
1. **State flows down** - Children read parent state, never write it
2. **Readiness aggregates up** - Each level exposes `isReady()` that includes parent readiness
3. **Parent controls rendering** - Use `munin.cond().when()` in parent, not guards in child
4. **Own what you do** - If you do the work, you own the loading state for it

---

## Related Documents

- [State Borrowing Convention](./01-state-borrowing.md) - How to read state in templates
- [Specificity Over Reusability](./03-specificity-over-reusability.md) - Component vs UI Element
