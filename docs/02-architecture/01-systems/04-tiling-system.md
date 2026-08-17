# Tiling System

> *Layout management through Munin's flow layers*

This document explains how Yggdrasil handles tile arrangement and layout through the TilingManager and Munin's flow/overlay layer system.

---

## The Core Insight

Yggdrasil unifies two layout problems with one solution:

| Problem | Traditional Solution | Yggdrasil Solution |
|---------|---------------------|-------------------|
| App layout (header/content/footer) | CSS hacks, flexbox | Munin flow layers (`flow: "y"`) |
| Tile arrangement (side-by-side, stacked) | Custom tiling code | Dynamic flow direction |

**The insight:** Tiles are simply flow layers with dynamic direction. The TilingManager just updates the flow registration.

```
┌─────────────────────────────────────────────────────────────┐
│  Munin Flow System                                          │
│                                                             │
│  flow: "y" (vertical)         flow: "x" (horizontal)        │
│  ┌─────────────────┐          ┌─────────┬─────────┐        │
│  │     header      │          │         │         │        │
│  ├─────────────────┤          │  tile   │  tile   │        │
│  │     content     │          │   A     │   B     │        │
│  ├─────────────────┤          │         │         │        │
│  │     footer      │          └─────────┴─────────┘        │
│  └─────────────────┘                                        │
│                                                             │
│  Overlay layers float above flow layers (z-index stacking)  │
└─────────────────────────────────────────────────────────────┘
```

---

## Flow vs Overlay Layers

Munin layers come in two types, declared at registration time:

### Flow Layers

Participate in CSS Grid layout. Stack vertically (`flow: "y"`) or horizontally (`flow: "x"`).

```typescript
munin.registerLayers(TILE_ID, {
  30: { name: "header", layer_type: "reactive", flow: "y" },   // Stacks vertically
  50: { name: "content", layer_type: "reactive", flow: "y" },  // Takes remaining space
});
```

**CSS behavior:**
- `position: relative`
- Participates in grid rows/columns
- Respects sibling heights/widths

### Overlay Layers

Float above using absolute positioning + z-index. No `flow` property.

```typescript
munin.registerLayers(TILE_ID, {
  70: { name: "controls", layer_type: "reactive" },   // Floats above
  100: { name: "overlay", layer_type: "static" },     // Modals, loading states
});
```

**CSS behavior:**
- `position: absolute`
- Spans all grid cells
- Uses z-index for stacking order

---

## Layer Registration

### App-Level (Header/Content/Footer)

```typescript
munin.registerLayers(APP_ID, {
  10: { name: "background", layer_type: "reactive" },          // Overlay
  30: { name: "header", layer_type: "reactive", flow: "y" },   // Flow
  50: { name: "content", layer_type: "static", flow: "y" },    // Flow
  70: { name: "footer", layer_type: "reactive", flow: "y" },   // Flow
  200: { name: "overlay", layer_type: "reactive" },            // Overlay
});
```

### Tile-Level (Content + Controls)

```typescript
munin.registerLayers(PDF_TILE_ID, {
  10: { name: "background", layer_type: "reactive" },          // Overlay
  30: { name: "header", layer_type: "reactive", flow: "y" },   // Flow
  50: { name: "content", layer_type: "reactive", flow: "y" },  // Flow
  70: { name: "controls", layer_type: "reactive" },            // Overlay (HUD)
  100: { name: "overlay", layer_type: "static" },              // Overlay (modals)
});
```

---

## DOM Structure

When flow layers are present, Munin sets up the container with appropriate attributes:

```html
<div class="munin-layered-container"
     data-has-flow="true"
     data-flow-direction="y">

  <!-- Overlay: sits behind flow layers -->
  <div class="munin-layer munin-layer-background" data-z-index="10">...</div>

  <!-- Flow: participates in CSS Grid -->
  <div class="munin-layer munin-layer-header" data-flow="y" data-z-index="30">...</div>
  <div class="munin-layer munin-layer-content" data-flow="y" data-z-index="50">...</div>

  <!-- Overlay: floats above flow layers -->
  <div class="munin-layer munin-layer-controls" data-z-index="70">...</div>
</div>
```

---

## TilingManager

The TilingManager coordinates tile rendering and layout.

### Responsibilities

1. **Render scheduling** - Staggered 60fps render loop across tiles
2. **Layout management** - Dynamic flow direction updates
3. **Tile registration** - Track tiles and their containers

### Layout API

```typescript
// Set layout for the tile container
tilingManager.setLayout("split-horizontal");  // flow: "x"
tilingManager.setLayout("split-vertical");    // flow: "y"

// Get current flow configuration
const config = tilingManager.getFlowConfig();
// Returns: { flowDirection: "x" | "y", flowLayers: ["header", "content"] }
```

### How Layout Changes Work

When `setLayout()` is called:

1. **Check if container uses flow** - via `munin.getFlowConfig(tileId)`
2. **If flow-based:** Call `munin.updateFlowDirection()` to update:
   - The Munin registry
   - DOM `data-flow` attributes on layers
   - Container's `data-flow-direction` attribute
3. **If legacy:** Apply CSS classes (fallback)

```typescript
// Inside TilingManager
private applyFlowLayout(layout: TileLayout, tileName: string): void {
  switch (layout) {
    case "split-horizontal":
      munin.updateFlowDirection(tileName, "x", this.container);
      break;
    case "split-vertical":
      munin.updateFlowDirection(tileName, "y", this.container);
      break;
  }
}
```

---

## CSS Integration

The flow system relies on CSS Grid. See [CSS Architecture](./09-css-architecture.md) for full details.

### Key CSS Rules

```css
/* Container becomes a grid when it has flow layers */
.munin-layered-container[data-has-flow] {
  display: grid;
  overflow: visible;
}

/* Vertical flow (default) */
.munin-layered-container[data-has-flow][data-flow-direction="y"] {
  grid-template-rows: var(--munin-flow-rows, auto 1fr auto);
  grid-template-columns: 1fr;
}

/* Horizontal flow */
.munin-layered-container[data-has-flow][data-flow-direction="x"] {
  grid-template-columns: var(--munin-flow-cols, 1fr 1fr);
  grid-template-rows: 1fr;
}

/* Flow layers participate in grid */
.munin-layer[data-flow="y"],
.munin-layer[data-flow="x"] {
  position: relative;
  inset: unset;
  pointer-events: auto;
}

/* Overlay layers use absolute positioning */
.munin-layer-background,
.munin-layer-overlay {
  position: absolute;
  inset: 0;
}
```

---

## Render Scheduling

TilingManager implements a game-loop style render system:

### Registration

```typescript
tilingManager.registerTile(TILE_ID, container, tileInstance, {
  fps: 60,              // Target frame rate
  offset: 0,            // Stagger offset in ms (auto-calculated if omitted)
  pauseWhenHidden: false
});
```

### Scheduling

```typescript
// Mark a tile as needing render
tilingManager.scheduleRender(TILE_ID);
```

### Render Loop

The TilingManager maintains individual timers per tile with staggered offsets:

1. **Check if tile needs render** - `needsRender` flag
2. **Determine which layers to update** - Based on layer strategies
3. **Call tile's `performRender(layersToUpdate)`** - Tile renders specified layers
4. **Clear dirty flag** - `needsRender = false`

### Layer Update Strategy

Different layer types update at different rates:

| Strategy | Update Behavior |
|----------|-----------------|
| `reactive` | Every render cycle |
| `static` | Every 5 seconds (max age) |
| `persistent` | When explicitly invalidated |

---

## Usage Example

### Setting Up a Tile with Flow

```typescript
class PDFTile {
  constructor(container: HTMLElement, coordinator: AppCoordinator) {
    // 1. Register layers with flow
    munin.registerLayers(PDF_TILE_ID, {
      10: { name: "background", layer_type: "reactive" },
      30: { name: "header", layer_type: "reactive", flow: "y" },
      50: { name: "content", layer_type: "reactive", flow: "y" },
      70: { name: "controls", layer_type: "reactive" },
    });

    // 2. Create layer containers (returns flow metadata)
    const { containers, flowDirection, flowLayers } = munin.createLayerContainers(PDF_TILE_ID);

    // 3. Create RenderingEngine with flow metadata
    this.renderingEngine = new RenderingEngine(
      container,
      containers,
      coordinator.eventualState,
      coordinator.immediateState,
      PDF_TILE_ID,
      { flowDirection, flowLayers }
    );

    // 4. Register with TilingManager
    tilingManager.registerTile(PDF_TILE_ID, container, this);
  }

  performRender(layersToUpdate?: string[]) {
    const { fragments, tree } = munin
      .inTile(PDF_TILE_ID)
      .layer("header", this.HeaderContent())
      .layer("content", this.MainContent())
      .layer("controls", this.ControlsOverlay())
      .collectComponents();

    this.renderingEngine.renderComponents(fragments, tree, layersToUpdate);
  }
}
```

### Changing Layout Dynamically

```typescript
// From app state subscription
immediateState.subscribe("getTileLayout", (event) => {
  const layout = event.data as TileLayout;
  tilingManager.setLayout(layout, "tiles-container");
});

// Or directly
tilingManager.setLayout("split-horizontal");
```

---

## Open Design Questions

### Layout Control: Framework vs App Level

Currently, layout is controlled via `immediateState.app.getTileLayout()`. This raises a question:

**Framework-level layouts:**
- Pro: Framework provides the tools, ensures consistency
- Con: Locks Yapps to predefined options

**App-level layouts:**
- Pro: Maximum flexibility per app
- Con: Complex layouts may need TilingManager enhancements

**Current decision:** Keep simple layouts (`split-horizontal`, `split-vertical`) framework-level. Leave room for app-specific complex layouts as the system matures.

### Nested Layouts

The flow system should support nested containers for complex arrangements:

```
┌───────────────────┬───────────────────┐
│                   │   tile-graph      │
│    tile-pdf       ├───────────────────┤
│                   │ tile-properties   │
└───────────────────┴───────────────────┘
```

This would require the right-side column to be its own Munin container with vertical flow. The architecture supports this, but it hasn't been extensively tested.

---

## Summary

| Component | Role |
|-----------|------|
| **Munin Flow Layers** | Declare layout participation at registration |
| **TilingManager** | Orchestrates renders and layout changes |
| **CSS Grid** | Handles actual layout (rows/columns) |
| **`data-flow` attribute** | Marks layers as flow participants |
| **`updateFlowDirection()`** | Dynamic layout switching |

**Key insight:** By unifying app layout and tile arrangement under Munin's flow system, we get:
- No special tiling code
- CSS Grid does the heavy lifting
- Dynamic updates are cheap (just attribute changes)
- Consistent mental model (everything is flow or overlay)

---

## Related Documents

- [CSS Architecture](./09-css-architecture.md) - Flow/overlay CSS rules
- [Rendering System](./02-rendering-system.md) - Layers and progressive rendering
- [State System](./01-state-system.md) - Layout state management
