# CSS Variable Transitions Pattern

> *Enabling CSS transitions in a cache-key driven rendering system*

This document explains how to achieve smooth CSS transitions in Yggdrasil, where Munin's cache-key diffing would normally replace DOM elements and break transitions.

---

## The Problem

Yggdrasil's rendering engine uses cache keys to determine what changed. When a cache key differs, the DOM element is replaced. This is efficient for content updates but breaks CSS transitions:

```typescript
// This BREAKS transitions - class change affects cache key
munin`<div class="panel ${isOpen ? 'panel--open' : ''}">...</div>`
```

When `isOpen` changes:
1. Cache key changes (because class string changed)
2. RenderingEngine replaces the DOM element
3. New element starts in final state - no transition

---

## The Solution: CSS Variables

CSS custom properties (variables) are **excluded from Munin's cache key by convention**. This means:

```typescript
// This ENABLES transitions - CSS variable excluded from cache key
munin`<div class="panel" style="--panel-open: ${isOpen ? 1 : 0}">...</div>`
```

When `isOpen` changes:
1. Cache key stays the same (CSS variable not included)
2. RenderingEngine detects `cssVars` changed
3. Calls `element.style.setProperty('--panel-open', value)` on existing element
4. Same element, style updates in place → **transitions work!**

---

## Implementation

### Step 1: Use CSS Variable in Template

```typescript
// Component
export function SlidePanel(this: MyTile) {
  const isOpen = this.immediateState.myTile.isPanelOpen();

  return munin`
    <div class="slide-panel" style="--panel-open: ${isOpen ? 1 : 0}">
      ${this.PanelContent()}
    </div>
  `;
}
```

### Step 2: CSS Uses the Variable

```css
.slide-panel {
  /* Default state */
  --panel-open: 0;

  /* Transform based on CSS variable */
  transform: translateX(calc(100% * (1 - var(--panel-open))));
  opacity: var(--panel-open);

  /* Transitions work because element identity is preserved */
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  /* Prevent interaction when closed */
  pointer-events: none;
}

/* Enable interaction when open */
.slide-panel[style*="--panel-open: 1"] {
  pointer-events: auto;
}
```

---

## How It Works Internally

### Munin's Cache Key Calculation

When Munin processes a template, it:

1. **Detects** if interpolation is inside a `style` attribute
2. **Checks** if the style contains CSS custom properties (`--*`)
3. **Excludes** CSS variable values from the cache key
4. **Tracks** CSS variables separately in `cssVars` field

```typescript
// Internal tracking
{
  cacheKey: "panel-abc123",        // Same regardless of --panel-open value
  cssVars: { "--panel-open": "1" } // Tracked separately
}
```

### RenderingEngine's Diff Logic

When comparing old and new trees:

| Cache Key | CSS Vars | Action |
|-----------|----------|--------|
| Different | - | Replace DOM element |
| Same | Same | No action needed |
| Same | Different | **Style-only update** |

Style-only update calls `element.style.setProperty()` for each changed variable, preserving element identity.

---

## The Convention

**CSS variables are presentation, not identity.**

This is a deliberate design choice:
- **Content** (text, structure, attributes) → affects cache key → DOM replacement
- **Style** (CSS variables) → excluded from cache key → in-place update

This maps to the semantic distinction between *what* something is versus *how* it looks.

---

## Common Patterns

### Binary State (Open/Closed)

```typescript
style="--is-open: ${isOpen ? 1 : 0}"
```

```css
.element {
  --is-open: 0;
  opacity: var(--is-open);
  transform: scale(calc(0.95 + 0.05 * var(--is-open)));
}
```

### Progress/Percentage

```typescript
style="--progress: ${progress}"
```

```css
.progress-bar {
  --progress: 0;
  width: calc(var(--progress) * 100%);
  transition: width 0.3s ease-out;
}
```

### Position

```typescript
style="--x: ${x}; --y: ${y}"
```

```css
.draggable {
  transform: translate(var(--x, 0), var(--y, 0));
  transition: transform 0.15s ease-out;
}
```

### Multiple States

```typescript
style="--state: ${state === 'loading' ? 0 : state === 'success' ? 1 : 2}"
```

---

## Best Practices

### DO

- Use numeric values (0/1) for boolean states - easier CSS math
- Set default values in CSS: `--panel-open: 0;`
- Use `calc()` for transformations based on the variable
- Keep transition declarations in CSS, not inline

### DON'T

- Don't use CSS variables for content that affects layout identity
- Don't mix CSS variable transitions with class-based state changes
- Don't forget `pointer-events: none` for hidden interactive elements

---

## Debugging

If transitions aren't working:

1. **Check the DOM** - Is `style="--var: value"` present and updating?
2. **Check the value** - Is it `0`/`1` or empty? (Watch for falsy value bugs)
3. **Check cache keys** - Use Hugin debug logging to see if keys are changing
4. **Check CSS** - Is the transition property defined? Is the variable used?

---

## Summary

| Approach | Cache Key | DOM | Transitions |
|----------|-----------|-----|-------------|
| Class toggle | Changes | Replaced | Broken |
| CSS Variable | Stable | Preserved | Works |

The CSS Variable pattern gives you smooth transitions while maintaining Yggdrasil's efficient cache-key based rendering. It's the recommended approach for any visual state that should animate.
