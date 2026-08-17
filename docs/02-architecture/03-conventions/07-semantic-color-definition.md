# Semantic Color Definition Convention

> *Define at the top, apply where it makes sense*

**Status:** Active

---

## The Pattern

Semantic color variables are the **interface** between theming and components. Define them in `theme.css`, apply them in component stylesheets.

```
theme.css (DEFINE)                    →    component.css (APPLY)
────────────────────                       ─────────────────────
--color-state-frozen: #3b82f6;             .btn--freeze {
--color-state-frozen-subtle: rgba(...);      background: var(--color-state-frozen-subtle);
                                             color: var(--color-state-frozen);
                                           }
```

---

## Why This Works

### 1. Single Source of Truth
All semantic meanings visible in one place. Open `theme.css` and you see the complete vocabulary of your design system.

### 2. Theme-Aware by Default
Light/dark variants defined together. When you add a new semantic color, you naturally consider both themes:

```css
[data-theme="dark"] {
  --color-state-frozen: #3b82f6;
  --color-state-frozen-subtle: rgba(59, 130, 246, 0.15);
}

[data-theme="light"] {
  --color-state-frozen: #2563eb;
  --color-state-frozen-subtle: rgba(37, 99, 235, 0.1);
}
```

### 3. Explicit Intent
Variable names communicate meaning. In DevTools, you see `--color-state-frozen` not `rgba(59, 130, 246, 0.15)`. This makes debugging and auditing significantly easier.

### 4. Debuggability at a Glance
When reviewing code or debugging, semantic names tell you *why* a color is used, not just *what* the color is.

---

## Variable Taxonomy

### Base Theme Variables
Fundamental colors that define the palette:

```css
--color-primary: #f97316;
--color-bg: #09090b;
--color-text: #fafafa;
--color-border: rgba(255, 255, 255, 0.08);
```

### Semantic State Variables
Colors that communicate application state:

```css
/* Action states */
--color-state-frozen: #3b82f6;           /* Blue - frozen/paused */
--color-state-active: #22c55e;           /* Green - active/running */
--color-state-error: #ef4444;            /* Red - error/danger */

/* Mode indicators */
--color-mode-hierarchical: #8b5cf6;      /* Purple - hierarchical view */
--color-mode-force: #3b82f6;             /* Blue - force layout */
```

### Component Token Variables
Compositions of base colors for specific components:

```css
/* Button tokens */
--btn-primary-bg: linear-gradient(135deg, #f97316, #ea580c);
--btn-primary-text: #fff;
--btn-secondary-bg: rgba(255, 255, 255, 0.06);
```

---

## The Escape Hatch: Scale Considerations

**Default behavior:** Define all semantic colors in `theme.css`.

**Exception:** For very large codebases where `theme.css` becomes unwieldy (hundreds of component-specific tokens), you may move highly specific tokens closer to their components in the cascade.

### When to Consider This

- `theme.css` exceeds ~500 lines of variable definitions
- Component tokens are used by only one component
- The cognitive load of scrolling through tokens outweighs the benefit of centralization

### How to Do It Safely

If you must move definitions down the cascade:

```css
/* In tile.css, not theme.css */
@layer app.tiles {
  :root {
    /* Highly specific tokens only used by this tile */
    --graph-node-document: #f97316;
    --graph-node-section: #8b5cf6;
    --graph-edge-default: rgba(255, 255, 255, 0.3);
  }

  .graph-viewer .node { ... }
}
```

### The Tradeoff

Moving tokens down the cascade creates **decoupling** between theme and component. This might be exactly what you want for a self-contained widget, but consider:

- **Coherence risk:** The component may drift from the design system
- **Theme switching:** Local variables may not respond to theme changes correctly
- **Discoverability:** Future developers won't find these in the expected place

**Recommendation:** Only use this escape hatch when centralization genuinely hurts maintainability. For most Yapps, keeping everything in `theme.css` is the right choice.

---

## Anti-Patterns

### ❌ Inline Magic Numbers
```css
/* Bad: What does this blue mean? */
.btn--freeze {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}
```

### ❌ Defining in Component Files (without justification)
```css
/* Bad: Hidden definition, not theme-aware */
.graph-tile {
  --my-special-blue: #3b82f6;
}
```

### ✅ Define and Apply
```css
/* theme.css */
--color-state-frozen: #3b82f6;
--color-state-frozen-subtle: rgba(59, 130, 246, 0.15);

/* component.css */
.btn--freeze {
  background: var(--color-state-frozen-subtle);
  color: var(--color-state-frozen);
}
```

---

## Summary

| Aspect | Convention |
|--------|------------|
| **Where to define** | `theme.css` (default) |
| **Where to apply** | Component stylesheets |
| **Naming** | `--color-{category}-{name}` |
| **Escape hatch** | Move to component only at scale |
| **Key benefit** | Single source of truth for design vocabulary |

**Core principle:** Semantic colors are design decisions. Keep design decisions visible at the top of the cascade where they can be reviewed, audited, and maintained as a coherent system.
