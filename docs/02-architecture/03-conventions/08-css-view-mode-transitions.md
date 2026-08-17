# CSS View Mode Transitions Convention

> *GPU-accelerated smooth tile sliding for view mode changes*

**Status:** Active

---

## Overview

When switching between view modes (PDF only, Split, Graph only), tiles should slide smoothly in/out rather than abruptly appearing/disappearing. This convention documents the CSS patterns that achieve buttery-smooth 60fps animations.

> **Related:** This convention builds on the [CSS Variable Transitions Pattern](../02-patterns/03-css-variable-transitions.md), which explains how to achieve smooth transitions in Munin's cache-key driven rendering system.

---

## The Problem

Naive implementations use `display: none` to hide tiles:

```css
/* BAD: Not animatable */
.tiles-container--pdf > .tile:last-child {
  display: none;
}
```

This causes tiles to instantly vanish - no animation possible since `display` is not an animatable property.

---

## The Solution: GPU-Accelerated Transforms

Use `transform: translateX()` combined with `opacity` for smooth, GPU-accelerated animations:

```css
/* Tiles use GPU-accelerated transforms for smooth sliding */
.tiles-container > .tile {
  transition:
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  min-width: 0;
  overflow: hidden;
  will-change: transform, opacity;
}
```

### Why This Works

1. **`transform` is GPU-accelerated** - Runs on compositor thread, doesn't block main thread
2. **`opacity` is GPU-accelerated** - Same benefit as transform
3. **`will-change` hint** - Tells browser to prepare GPU layers in advance
4. **`cubic-bezier(0.4, 0, 0.2, 1)`** - Material Design's standard easing curve, feels natural

---

## View Mode Patterns

### Split View (Default)
Both tiles visible, no transform:

```css
.tiles-container--split {
  grid-template-columns: 1fr 1fr;
}

.tiles-container--split > .tile {
  transform: translateX(0);
  opacity: 1;
  pointer-events: auto;
}
```

### PDF Only View
PDF expands, Graph slides right and fades:

```css
.tiles-container--pdf {
  grid-template-columns: 1fr 0fr;
}

.tiles-container--pdf > .tile:first-child {
  transform: translateX(0);
  opacity: 1;
}

.tiles-container--pdf > .tile:last-child {
  transform: translateX(100%);  /* Slide right */
  opacity: 0;
  pointer-events: none;
}
```

### Graph Only View
Graph expands, PDF slides left and fades:

```css
.tiles-container--graph {
  grid-template-columns: 0fr 1fr;
}

.tiles-container--graph > .tile:first-child {
  transform: translateX(-100%);  /* Slide left */
  opacity: 0;
  pointer-events: none;
}

.tiles-container--graph > .tile:last-child {
  transform: translateX(0);
  opacity: 1;
}
```

---

## Key Implementation Details

### Grid Column Collapse with `0fr`

Using `0fr` instead of removing columns allows the grid to animate:

```css
/* This allows smooth width transitions */
grid-template-columns: 1fr 0fr;  /* Second column collapses to 0 */
```

The container also needs the grid transition:

```css
.tiles-container {
  transition: grid-template-columns 0.3s ease-in-out;
}
```

### Prevent Content Spill

Collapsing tiles need `overflow: hidden` to prevent content from spilling out during the animation:

```css
.tiles-container > .tile {
  overflow: hidden;
  min-width: 0;  /* Allow shrinking to 0 */
}
```

### Disable Interaction During Collapse

Collapsed tiles should not receive clicks:

```css
.tiles-container--pdf > .tile:last-child {
  pointer-events: none;
}
```

---

## Performance Considerations

### Heavy Content (D3, Canvas, etc.)

If tiles contain heavy content like D3 force simulations, the animation may stutter because the main thread is busy. Solutions:

1. **Pause simulations during transitions** - Listen for view mode changes and freeze/unfreeze
2. **Use `content-visibility: auto`** - Browser skips rendering off-screen content
3. **Reduce tick rate** - Lower simulation activity during transitions

### The Freeze Pattern

For tiles with expensive rendering (D3, WebGL), pause computation during transitions:

```typescript
// In your view mode subscription
this.immediateState.subscribe("app.getViewMode", (event) => {
  // Freeze tile during transition
  this.immediateState.graphTile.setFrozen(true);

  // Unfreeze after animation completes (match CSS duration)
  setTimeout(() => {
    this.immediateState.graphTile.setFrozen(false);
  }, 300);
});
```

---

## Timing & Easing

### Recommended Values

| Property | Value | Rationale |
|----------|-------|-----------|
| Duration | `0.3s` | Fast enough to feel responsive, slow enough to see |
| Easing | `cubic-bezier(0.4, 0, 0.2, 1)` | Material Design standard, natural deceleration |
| Opacity duration | Same as transform | Synchronized fade with slide |

### Easing Curve Explained

`cubic-bezier(0.4, 0, 0.2, 1)`:
- Starts at 40% speed (quick start)
- Ends at full speed with 20% control point (smooth landing)
- Standard "ease-out" feel from Material Design

---

## Browser Compatibility

All modern browsers support these properties:
- `transform` - Universal support
- `opacity` - Universal support
- `will-change` - Chrome 36+, Firefox 36+, Safari 9.1+
- `grid-template-columns` transition - Chrome 107+, Firefox 66+, Safari 16+

For older browsers, the layout still works - just without animation (graceful degradation).

---

## Summary

| Technique | Purpose |
|-----------|---------|
| `transform: translateX()` | GPU-accelerated sliding |
| `opacity` | Smooth fade in/out |
| `grid-template-columns: 0fr` | Animatable column collapse |
| `will-change` | GPU layer preparation |
| `pointer-events: none` | Disable collapsed tile interaction |
| `overflow: hidden` | Prevent content spill |
| Freeze pattern | Pause heavy computation during transition |

---

## Related Documentation

- [CSS Variable Transitions Pattern](../02-patterns/03-css-variable-transitions.md) - How to enable transitions in Munin's cache-key system
- [CSS Architecture](../01-systems/09-css-architecture.md) - Layer ordering and themes
- [CSS-Component Mirroring](../01-systems/11-css-component-mirroring.md) - File structure conventions
