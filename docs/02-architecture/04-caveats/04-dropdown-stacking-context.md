# Caveat 04: Dropdown Stacking Context in Layered Architecture

## The Problem

When using dropdowns (or any absolutely-positioned elements that extend beyond their parent) inside Munin layers, the dropdown content can be visually clipped or hidden behind sibling layers.

### Root Cause

Munin layers use CSS properties that create new **stacking contexts**:
- `container-type: inline-size` (for container queries)
- `position: relative` with `z-index`

When a dropdown is inside a layer (e.g., the header layer), its `z-index` is relative to that layer's stacking context, not the document root. A sibling layer (e.g., the content layer) that comes later in DOM order will paint on top of the dropdown, even if the dropdown has a high `z-index`.

### Visual Example

```
┌─────────────────────────────────────┐
│ Header Layer (z-index: 30)          │
│   ┌─────────┐                       │
│   │ Avatar ▼│                       │
│   └─────────┘                       │
│       ┌──────────────┐              │
│       │ Dropdown     │ ← Only header visible
│       │ ┈┈┈┈┈┈┈┈┈┈┈┈ │   (items hidden)
├───────│─Settings─────│──────────────┤
│ Content│─Usage───────│              │
│ Layer  │─Logout──────│ ← Covered by content layer!
│        └──────────────┘              │
└─────────────────────────────────────┘
```

## The Solution (App-Level)

For ExampleApp, we applied these fixes in `styles/app/layout.css`:

```css
.munin-layer-header {
  container-type: inline-size;
  container-name: app-header;
  overflow: visible;    /* Allow dropdown to extend beyond layer bounds */
  position: relative;
  z-index: 100;         /* Higher than content layer */
}
```

And in `styles/app/ui/dropdown.css`:

```css
.dropdown-menu {
  /* ... other styles ... */
  z-index: 1000;        /* High enough within the header's stacking context */
}
```

### Key Points

1. **`overflow: visible`** on the layer allows child elements to visually extend beyond the layer's bounds
2. **Higher `z-index` on the layer** ensures the entire header (including dropdowns) paints above sibling layers
3. **High `z-index` on the dropdown** ensures it paints above other elements within the header

## Framework Considerations

This is currently an app-level fix. In future Yggdrasil versions, we might want to:

1. **Provide a `--layer-z-index` CSS variable** that Yapps can configure per-layer
2. **Add a `overflow` option to layer configuration** in the TilingManager
3. **Consider a portal pattern** where dropdowns render at the document root (outside layers entirely)
4. **Document recommended z-index ranges** for different layer types:
   - Background layers: 0-10
   - Content layers: 10-50
   - Header/toolbar layers: 50-100
   - Dropdown/popover layers: 100-500
   - Modal/overlay layers: 500-1000

## When You'll Hit This

You'll encounter this issue when:
- Adding dropdowns to header/toolbar components
- Using tooltips that extend beyond layer boundaries
- Any absolutely-positioned popup that needs to overflow its container layer

## Related

- CSS Stacking Context: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_context
- Container queries and stacking: `container-type` creates a new stacking context
