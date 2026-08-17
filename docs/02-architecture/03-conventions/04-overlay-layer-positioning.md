# Overlay Layer Positioning Convention

## Overview

In the Munin layer system, overlay layers (z-flow) can be positioned within their container using CSS custom properties. This provides a flexible, declarative way to place floating UI elements like controls, tooltips, and HUD components.

## The CSS Custom Properties

```css
.munin-layer {
  --layer-top: 0;      /* Distance from top (default: 0) */
  --layer-right: 0;    /* Distance from right (default: 0) */
  --layer-bottom: 0;   /* Distance from bottom (default: 0) */
  --layer-left: 0;     /* Distance from left (default: 0) */
}
```

By default, overlay layers cover the entire container (`inset: 0`). Override these properties to position layers at specific locations.

## Common Patterns

### Position Below Header
```css
.munin-layer-controls {
  --layer-top: 10%;      /* Start 10% from top */
  --layer-bottom: auto;  /* Let content determine height */
}
```

### Bottom-Right Corner
```css
.munin-layer-actions {
  --layer-top: auto;
  --layer-bottom: 5%;
  --layer-left: auto;
  --layer-right: 5%;
}
```

### Centered Horizontal Strip
```css
.munin-layer-toolbar {
  --layer-top: 50%;
  --layer-bottom: auto;
  --layer-left: 10%;
  --layer-right: 10%;
}
```

### Full Width at Bottom
```css
.munin-layer-footer {
  --layer-top: auto;
  --layer-bottom: 0;
  --layer-left: 0;
  --layer-right: 0;
}
```

## Mental Model

Think of it as defining a **bounding box** within the container:

```
Container (100% x 100%)
+----------------------------------------+
|  --layer-top: 10%                      |
|  +----------------------------------+  |
|  |                                  |  |
|  |  Layer content area              |  |
|  |  (auto-sized or stretched)       |  |
|  |                                  |  |
|  +----------------------------------+  |
|  --layer-bottom: auto                  |
|                                        |
+----------------------------------------+
```

- Use **percentages** for responsive positioning relative to container
- Use **`auto`** to let the layer size to its content
- Use **`0`** to pin to an edge

## When to Use

| Use Case | Properties |
|----------|------------|
| Controls below header | `--layer-top: N%`, `--layer-bottom: auto` |
| Floating action button | `--layer-top/left: auto`, `--layer-bottom/right: N%` |
| Tooltip near element | Calculate position dynamically via JS |
| Full overlay (modal) | Keep defaults (`inset: 0`) |

## Flow vs Overlay Layers

This convention applies to **overlay layers** (z-flow) only:

| Layer Type | Flow Property | Positioning |
|------------|---------------|-------------|
| **Flow layers** | `flow: "y"` or `flow: "x"` | Participates in CSS Grid, no custom positioning |
| **Overlay layers** | No `flow` property | Uses `--layer-*` custom properties |

## Example: PDFTile Controls

```css
/* Position the controls layer below the header area */
.munin-layer-controls {
  --layer-top: 10%;      /* Clear the header */
  --layer-bottom: auto;  /* Size to content */
}
```

```typescript
// In Tile.ts - controls is an overlay layer (no flow property)
munin.registerLayers(TILE_ID, {
  10: { name: "background", layer_type: "reactive" },
  50: { name: "content", layer_type: "static" },
  70: { name: "controls", layer_type: "reactive" },  // Overlay layer
  200: { name: "overlay", layer_type: "reactive" },
});
```

## Best Practices

1. **Use percentages** for responsive layouts that scale with container size
2. **Set `auto` for dynamic sizing** - let content determine the dimension
3. **Keep positioning in CSS** - not in JavaScript unless truly dynamic
4. **Use semantic layer names** - makes CSS targeting clear (`.munin-layer-controls`)
5. **Consider container queries** - adjust positioning at different tile sizes

```css
/* Responsive positioning with container queries */
@container tile (max-width: 400px) {
  .munin-layer-controls {
    --layer-top: 15%;  /* More space on small tiles */
  }
}
```
