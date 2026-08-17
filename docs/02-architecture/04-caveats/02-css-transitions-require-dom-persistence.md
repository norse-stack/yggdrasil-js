# CSS Transitions Require DOM Persistence

## The Problem

CSS transitions don't work when Munin re-renders a component, because re-rendering **replaces** the DOM element. A new element has no "from" state to transition from.

```typescript
// This WON'T animate - element is replaced on each render
export function Panel(this: SomeTile) {
  const isOpen = this.immediateState.tile.isPanelOpen();
  return munin`
    <div class="panel ${isOpen ? "panel--open" : ""}">
      ...
    </div>
  `;
}
```

When `isPanelOpen()` changes:
1. Subscription triggers `scheduleRender()`
2. `performRender()` rebuilds the template
3. Munin diffs and **replaces** the element
4. New element appears with `panel--open` class already applied
5. No transition occurs - there was no "before" state

## The Solution: Direct DOM Manipulation

For CSS transitions to work, the element must **persist** in the DOM while only its class changes. Use direct DOM manipulation instead of re-rendering:

### Step 1: Always render the element (no conditional)

```typescript
// In performRender() - always include the panel
.layer(
  "controls",
  munin`
    ${this.Panel()}
  `,
)
```

### Step 2: Render without the active class

```typescript
// Panel starts closed - class will be added via DOM manipulation
export function Panel(this: SomeTile) {
  return munin`
    <div class="panel">
      ...
    </div>
  `;
}
```

### Step 3: Toggle class via subscription (not re-render)

```typescript
// In setupSubscriptions()
this.immediateState.subscribe(`${TILE_ID}.isPanelOpen`, () => {
  const isOpen = this.immediateState.tile.isPanelOpen();

  // Direct DOM manipulation - element persists, class changes
  const panel = this.container.querySelector(".panel");
  if (panel) {
    if (isOpen) {
      panel.classList.add("panel--open");
    } else {
      panel.classList.remove("panel--open");
    }
  }
});
```

## Why This Works

1. The element is rendered once and stays in the DOM
2. The subscription only toggles the class - no re-render
3. CSS sees the class change on the **same element**
4. Transition fires from current state to new state

## Existing Examples

### View Mode Transitions (ExampleApp.ts)

The tiling system uses this exact pattern for smooth tile sliding:

```typescript
// Direct DOM manipulation for view mode changes
this.immediateState.subscribe("app.getViewMode", (event) => {
  const tilesContainer = document.querySelector(".tiles-container");
  if (tilesContainer) {
    tilesContainer.classList.remove(
      "tiles-container--pdf",
      "tiles-container--split",
      "tiles-container--graph",
    );
    tilesContainer.classList.add(`tiles-container--${mode}`);
  }
});
```

The content layer is `static` (never re-renders), so the container persists and class toggles work.

### NodeInfoPanel (GraphTile)

The slide-in panel uses this pattern:

```typescript
// Subscription toggles class directly
this.immediateState.subscribe(`${TILE_ID}.isPanelOpen`, () => {
  const panel = this.container.querySelector(".node-info-panel");
  if (panel) {
    panel.classList.toggle("node-info-panel--open", isOpen);
  }
});
```

## When to Use This Pattern

Use direct DOM manipulation when:
- You need CSS transitions (slide, fade, scale, etc.)
- The animation is purely visual (no structural DOM changes)
- The element should always exist in the DOM

Use normal Munin re-rendering when:
- Content changes (not just visibility)
- No animation needed
- Element should be conditionally rendered (truly removed from DOM)

## The Reactive Layer Challenge

The solution above works perfectly when your element is in a **static layer** (layer that never re-renders). But what if your transitioning element is in a **reactive layer**?

**The problem:** In a reactive layer, other state changes can trigger re-renders that replace your element, breaking transitions mid-animation or losing your class state.

**Example:** NodeInfoPanel lives in the `controls` layer (reactive). When the user:
1. Opens the panel → DOM manipulation adds `--open` class → transition plays ✓
2. Clicks a node → Munin re-renders the controls layer → element replaced → `--open` class lost!

### Solution Options

#### Option A: Static Layer Approach (Recommended for simple cases)

Move the transitioning element to its own **static layer**:

```typescript
munin.registerLayers(TILE_ID, {
  70: { name: "controls", layer_type: "reactive" },
  75: { name: "panel", layer_type: "static" },  // Dedicated static layer!
  100: { name: "overlay", layer_type: "static" },
});
```

The element only renders once, DOM manipulation always works, no re-render interference.

**Pros:** Clean, no workarounds needed
**Cons:** Requires layer restructuring, panel content can't be reactive

#### Option B: Split Container/Content (Recommended for complex panels)

Keep the **outer container** in a static layer (for transitions), but render **inner content** in a reactive layer:

```typescript
// Static layer - container persists, transitions work
.layer("panel-container", munin`
  <div class="panel">
    <slot name="panel-content"></slot>
  </div>
`)
// Reactive layer - content updates
.layer("panel-content", munin`
  ${this.PanelContent()}
`)
```

**Pros:** Best of both worlds - transitions work AND content is reactive
**Cons:** More complex layer structure, requires slot/portal mechanism

#### Option C: Post-Render Sync Pattern (Pragmatic solution)

Accept that re-renders happen and **re-apply the class after each render**:

```typescript
// In performRender() - after all layers are rendered
performRender(layersToUpdate: string[]) {
  // ... normal render logic ...

  // POST-RENDER: Re-sync transition classes
  this.syncPanelOpenClass();
}

private syncPanelOpenClass() {
  const isOpen = this.immediateState.tile.isPanelOpen();
  const panel = this.container.querySelector(".panel");
  if (panel) {
    if (isOpen) {
      panel.classList.add("panel--open");
    } else {
      panel.classList.remove("panel--open");
    }
  }
}
```

**The tradeoff:** When a re-render happens while the panel is open:
- The element is replaced (losing `--open` class)
- `syncPanelOpenClass()` immediately re-applies it
- No visible flash because it happens in the same frame
- BUT: no transition plays (element snaps to open state)

**Pros:** Works with existing architecture, minimal changes
**Cons:** Transitions don't play on re-render (acceptable if re-renders are rare while panel is open)

### Choosing the Right Option

| Scenario | Recommended Option |
|----------|-------------------|
| Simple toggle (no content updates) | Option A: Static Layer |
| Panel with reactive content (tabs, search) | Option B: Split Container/Content |
| Quick fix, rare re-renders | Option C: Post-Render Sync |

### Current Implementation: NodeInfoPanel

NodeInfoPanel uses **Option C** because:
1. The panel has tabbed content (Node Info vs Graph Stats) - needs reactivity
2. Re-renders while panel is open are relatively rare
3. The slight loss of transition on re-render is acceptable

```typescript
// In GraphTile.ts

// 1. DOM manipulation subscription for normal open/close
this.immediateState.subscribe(`${TILE_ID}.isPanelOpen`, () => {
  const isOpen = this.immediateState.graphTile.isPanelOpen();
  const panel = this.container.querySelector(".node-info-panel");
  if (panel) {
    panel.classList.toggle("node-info-panel--open", isOpen);
  }
});

// 2. Post-render sync to restore class after re-renders
private syncPanelOpenClass() {
  const isOpen = this.immediateState.graphTile.isPanelOpen();
  const panel = this.container.querySelector(".node-info-panel");
  if (panel) {
    panel.classList.toggle("node-info-panel--open", isOpen);
  }
}
```

## Future Considerations

This is a known limitation of the current reactive system. Potential solutions:

1. **Munin-level transition support** - Detect class-only changes and preserve elements
2. **Transition components** - Special wrapper that handles DOM persistence
3. **Animation hooks** - Lifecycle hooks for enter/exit animations
4. **Layer portals** - Render content in reactive layer, mount in static layer

For now, the patterns above are the recommended approaches.

## Related Documentation

- [CSS View Mode Transitions](../03-conventions/08-css-view-mode-transitions.md) - GPU-accelerated transition patterns
- [Refs vs Clones](./01-refs-vs-clones.md) - State reading patterns in templates
