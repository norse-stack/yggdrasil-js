# Cache Key Destabilization Anti-Pattern

## The Problem

When building components that need CSS transitions, it's tempting to include the transition state directly in the template:

```typescript
// ANTI-PATTERN: Don't do this!
export function Panel(this: SomeTile) {
  const isOpen = this.immediateState.tile.isPanelOpen();

  return munin`
    <div class="panel ${isOpen ? "panel--open" : ""}">
      <!-- Panel content -->
    </div>
  `;
}
```

This looks clean but **breaks CSS transitions**. Why?

### How Munin Cache Keys Work

Munin generates a **cache key** for each template based on:
1. The template string structure
2. Dynamic values interpolated into the template

When `isOpen` changes from `false` to `true`:
- The cache key changes (different class string)
- Munin sees a "new" element (different cache key)
- The old element is removed, new element inserted
- **No transition** - the new element appears with `--open` class already applied

### The Deceptive Symptom

You'll see intermittent transitions:
- **First open:** No transition (new element)
- **Close:** Transition works (class removed from same element)
- **Second open:** Transition works! (element persisted)
- **Click something that triggers re-render:** Back to no transition

This inconsistency makes debugging frustrating because it "sometimes works."

## The Root Cause

The issue is putting **transition state** in the **outer template** where it affects the cache key.

```typescript
// Cache key includes "panel--open" or ""
return munin`
  <div class="panel ${isOpen ? "panel--open" : ""}">
```

Every time `isOpen` changes, the cache key changes, triggering element replacement.

## The Solution: Separate Concerns

Keep transition state **out of the template**, manage it via DOM manipulation.

### Step 1: Render with stable cache key

```typescript
export function Panel(this: SomeTile) {
  // NOTE: --open class managed via DOM manipulation, NOT here!
  return munin`
    <div class="panel">
      <!-- Content that CAN use state - inner cache keys are fine -->
      ${this.PanelContent()}
    </div>
  `;
}
```

### Step 2: Toggle class via subscription

```typescript
// In tile setupSubscriptions()
this.immediateState.subscribe(`${TILE_ID}.isPanelOpen`, () => {
  const isOpen = this.immediateState.tile.isPanelOpen();
  const panel = this.container.querySelector(".panel");
  if (panel) {
    panel.classList.toggle("panel--open", isOpen);
  }
});
```

## Inner State Is Fine

The anti-pattern only applies to the **outermost munin template** of a component. Inner state that affects content (not the root element's class) is perfectly fine:

```typescript
export function Panel(this: SomeTile) {
  // OK: Inner content can use state - doesn't affect outer cache key
  const activeTab = this.immediateState.tile.getActiveTab();

  return munin`
    <div class="panel">
      <!-- Inner munin templates can have dynamic state -->
      <div class="panel__tabs">
        <button class="${activeTab === "info" ? "active" : ""}">Info</button>
        <button class="${activeTab === "stats" ? "active" : ""}">Stats</button>
      </div>
      ${munin
        .match(activeTab)
        .case("info", () => this.InfoView())
        .case("stats", () => this.StatsView())}
    </div>
  `;
}
```

The tab buttons changing their `active` class doesn't break the panel transition because:
1. The outer `<div class="panel">` cache key is stable
2. Inner elements can change without affecting the parent's persistence

## Summary: What Goes Where

| State Type | Location | Example |
|------------|----------|---------|
| Transition classes (`--open`, `--active`) | DOM manipulation | `panel.classList.toggle()` |
| Content state (tabs, view mode) | Inner template | `${activeTab === "info" ? "active" : ""}` |
| Conditional content | munin.match or munin.cond | `munin.match(view).case(...)` |

## The Mental Model

Think of it like this:

```
┌─────────────────────────────────────┐
│  Outer Template (STABLE cache key)  │
│  - No transition state here!        │
│  ┌─────────────────────────────────┐│
│  │  Inner Templates (can vary)     ││
│  │  - Tabs, content, etc.          ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
         ↑
    DOM manipulation for --open class
```

The outer shell is stable. Content inside can change. Transitions are applied to the stable outer element via DOM manipulation.

## Real Example: NodeInfoPanel

```typescript
// components/NodeInfoPanel.ts
export function NodeInfoPanel(this: GraphTile) {
  const handleClose = () => this.immediateState.graphTile.closePanel();

  // NOTE: The --open class is managed via DOM manipulation in Tile.ts
  // Do NOT add isPanelOpen() here - it would destabilize the cache key!

  return munin`
    <div class="node-info-panel">
      <!-- Inner state for tabs is fine -->
      <div class="node-info-panel__tabs">
        <button
          class="${this.immediateState.graphTile.getPanelView() === "node" ? "active" : ""}"
        >Node</button>
        <button
          class="${this.immediateState.graphTile.getPanelView() === "stats" ? "active" : ""}"
        >Stats</button>
      </div>
      <button class="node-info-panel__close" onclick=${handleClose}>×</button>

      <!-- Content switches based on tab -->
      ${munin
        .match(this.immediateState.graphTile.getPanelView())
        .case("node", () => this.NodeInfoView())
        .case("stats", () => this.GraphStatsView())}
    </div>
  `;
}
```

The outer `<div class="node-info-panel">` has a stable cache key. The `--open` class is added/removed via DOM manipulation in the Tile's subscription. Inner content (tabs, views) can change without breaking the slide-in transition.

## Related Documentation

- [CSS Transitions Require DOM Persistence](./02-css-transitions-require-dom-persistence.md) - Full patterns for managing transitions
- [Refs vs Clones](./01-refs-vs-clones.md) - When evaluation timing matters
