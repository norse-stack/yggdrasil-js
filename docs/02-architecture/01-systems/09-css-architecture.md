# CSS Architecture

> *How Yggdrasil styles tiles, components, and apps*

This document describes the implemented CSS architecture: layer ordering, folder structure, theme system, and the flow/overlay spatial system.

---

## Core Principles

### 1. CSS Ownership Mirrors Code Ownership

```
Yapp (AppCoordinator)
  └── Tiles (EventualState + ImmediateState)
        └── Components (bound to tile, access `this`)
              └── UI Elements (pure, props only)
```

CSS follows the same hierarchy:

```
App-level styles (layout, composition)
  └── Tile-level styles (tile-specific, self-contained)
        └── Component-level styles (scoped to tile)
              └── UI Element styles (reusable, context-free)
```

> **See also:** [CSS-Component Mirroring](./11-css-component-mirroring.md) for the file structure convention.

### 2. Variables Flow Down, Never Up

Theme variables cascade from Yapp to tiles to components. Tiles can shadow variables locally but never modify parent variables.

```css
/* Framework provides */
:root {
  --color-bg-secondary: rgba(0, 0, 0, 0.2);
}

/* Tile can shadow locally */
.pdf-tile {
  --color-bg-secondary: rgba(0, 0, 0, 0.3);
}
```

### 3. Tiles Are Standalone by Default

A tile must work without Yapp. This means:
- Has CSS defaults that work independently
- Uses CSS variables for theming (can be themed, but has fallbacks)
- Never depends on parent selectors like `.yapp .tile-header`

### 4. No CSS-in-JS

Munin generates DOM and toggles classes. CSS files handle all styling. This is a strong convention.

```typescript
// Munin DOES
munin`<button class="btn ${isActive ? 'btn--active' : ''}">Toggle</button>`

// Munin NEVER
// - Generates <style> tags
// - Uses inline styles (except canvas positioning and CSS variables)
// - Computes CSS values
```

> **Exception:** CSS variables in `style` attributes are used for transitions. See [CSS Variable Transitions](../02-patterns/03-css-variable-transitions.md).

---

## CSS Layer Architecture

### Layer Order Declaration

The layer order is declared first in `index.css`. Later layers have higher priority:

```css
@layer
  ygg.reset,           /* Browser normalization */
  ygg.theme,           /* CSS variables only */
  ygg.forms,           /* Framework form elements */
  ygg.tiles.base,      /* Base tile structure + Munin layers */
  ygg.ui.states,       /* Framework UI states (loading, error, empty) */
  ygg.ui.container,    /* Container query adaptations */
  app.ui,              /* App's branded UI (buttons, etc.) */
  app.tiles,           /* Tile-specific styles */
  app.components;      /* App-level components */
```

**Benefits:**
- **Predictable cascade** - no specificity wars
- **Clear ownership** - each layer has one owner
- **Standalone tiles** - work without app layers

### Layer Responsibilities

| Layer | Owner | Purpose |
|-------|-------|---------|
| `ygg.reset` | Framework | Browser normalization |
| `ygg.theme` | Framework | CSS variables (colors, spacing, etc.) |
| `ygg.forms` | Framework | Form inputs, selects (hard things) |
| `ygg.tiles.base` | Framework | Munin spatial layers + flow system |
| `ygg.ui.states` | Framework | Loading, error, empty states |
| `ygg.ui.container` | Framework | Container query adaptations |
| `app.ui` | Yapp | Branded UI elements (buttons) |
| `app.tiles` | Each Tile | Tile-specific styles |
| `app.components` | Yapp | App-level components & layout |

### Framework vs App Split

| Concern | Framework (`yggdrasil/`) | App (`app/`, `tiles/`) |
|---------|--------------------------|------------------------|
| Reset/normalize | Yes | |
| Theme variables | Yes | Can shadow locally |
| Form elements | Yes (hard things) | |
| UI states | Yes (loading, error) | Can override |
| Buttons | | Yes (branded) |
| Munin spatial layers | Yes | |
| Specific tile styles | | Yes |
| App layout | | Yes |

> **Principle:** Framework provides what's hard to get right. App provides what's branded. See [CSS-Component Mirroring](./11-css-component-mirroring.md).

---

## Folder Structure

```
styles/
├── index.css                         # Entry point + layer order declaration
│
├── yggdrasil/                        # Framework core (reusable across Yapps)
│   ├── reset.css                     # Browser normalization (ygg.reset)
│   ├── themes/
│   │   └── theme.css                 # All themes via data-theme (ygg.theme)
│   ├── forms/
│   │   └── inputs.css                # Inputs, selects (ygg.forms)
│   ├── ui/
│   │   ├── states.css                # Loading, error, empty (ygg.ui.states)
│   │   ├── spinner.css               # Loading spinners
│   │   ├── controls.css              # Form controls
│   │   ├── display.css               # Display utilities
│   │   └── container-queries.css     # UI responsive adaptations (ygg.ui.container)
│   ├── tiles/
│   │   ├── _base.css                 # Munin spatial layers (ygg.tiles.base)
│   │   └── tiling.css                # Tiling/window manager (ygg.tiles.base)
│   └── debug/
│       └── layers.css                # Debug overlays (unlayered)
│
├── app/                              # App-level styles
│   ├── ui/
│   │   └── buttons.css               # Branded buttons (app.ui)
│   ├── components/
│   │   ├── app-header.css            # App header (app.components)
│   │   ├── app-toolbar.css           # App toolbar (app.components)
│   │   └── stripe-modal.css          # Payment modal (app.components)
│   └── layout.css                    # App layout & modals (app.components)
│
├── tiles/                            # Tile-specific styles
│   ├── PDFTile/
│   │   └── tile.css                  # PDF tile styles (app.tiles)
│   └── GraphTile/
│       └── tile.css                  # Graph tile styles (app.tiles)
│
└── index.css                         # Import orchestration
```

---

## Munin Spatial Layer System

The `_base.css` file defines the spatial layer system that Munin uses for z-indexed composition within tiles.

### Base Container

```css
.munin-layered-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  isolation: isolate;
  container-type: size;
  container-name: tile;
}
```

### Default Layer Styles (Overlay Mode)

By default, layers are absolutely positioned and span the full container:

```css
.munin-layer {
  position: absolute;
  top: var(--layer-top, 0);
  right: var(--layer-right, 0);
  bottom: var(--layer-bottom, 0);
  left: var(--layer-left, 0);
  pointer-events: none;  /* Click-through by default */
  contain: layout style;
}

.munin-layer * {
  pointer-events: var(--munin-layer-pointer-events, auto);
}
```

### Flow Mode: Document Flow Layout

When layers declare `flow: "y"` or `flow: "x"`, the container switches to CSS Grid and layers participate in document flow:

```css
/* Flow container uses CSS Grid */
.munin-layered-container[data-has-flow] {
  display: grid;
  overflow: visible;
}

/* Flow layers participate in document flow */
.munin-layered-container[data-has-flow] > .munin-layer[data-flow="y"],
.munin-layered-container[data-has-flow] > .munin-layer[data-flow="x"] {
  position: relative;
  inset: unset;
  width: unset;
  height: unset;
  pointer-events: auto;
  min-height: 0;
  min-width: 0;
  z-index: 1;
}
```

### Dynamic Flow Direction

The container's `data-flow-direction` attribute controls how flow layers are arranged:

| Value | Meaning | Grid Layout |
|-------|---------|-------------|
| `"y"` | Explicit vertical | Rows (header/content/footer) |
| `"z"` | Legacy default (vertical) | Rows (header/content/footer) |
| `"x"` | Horizontal | Columns (side-by-side) |
| not set | Default vertical | Rows (header/content/footer) |

```css
/* VERTICAL FLOW (default): Stack layers as rows */
.munin-layered-container[data-has-flow][data-flow-direction="y"],
.munin-layered-container[data-has-flow][data-flow-direction="z"],
.munin-layered-container[data-has-flow]:not([data-flow-direction]) {
  grid-template-rows: var(--munin-flow-rows, auto 1fr auto);
  grid-template-columns: 1fr;
}

/* HORIZONTAL FLOW: Stack layers as columns (side-by-side) */
.munin-layered-container[data-has-flow][data-flow-direction="x"] {
  grid-template-columns: var(--munin-flow-cols, 1fr 1fr);
  grid-template-rows: 1fr;
}
```

### Named Layer Classes

Each layer type has semantic styling:

| Class | Z-Index | Purpose |
|-------|---------|---------|
| `.munin-layer-background` | 10 | Content background, canvas |
| `.munin-layer-d3Layer` | 20 | D3.js visualizations |
| `.munin-layer-controls` | 50 | HUD-style controls |
| `.munin-layer-overlay` | 100 | Modals, loading states |

### HUD Pattern for Controls

The controls layer uses a "click-through" pattern where the layer itself doesn't capture clicks, but interactive elements do:

```css
.munin-layer-controls {
  pointer-events: none;  /* Layer is click-through */
}

.munin-layer-controls button,
.munin-layer-controls .interactive,
.munin-layer-controls input {
  pointer-events: auto;  /* But elements receive clicks */
}
```

---

## Theme System

Theming in Yggdrasil has two parts:
1. **CSS variables** - Defined in theme files, respond to `data-theme` attribute
2. **Theme state** - Framework-level state that manages runtime theme switching

### Runtime Theme Switching

Themes are switched at runtime via a `data-theme` attribute on `<html>`:

```html
<html data-theme="dark">   <!-- or "light" or "high-contrast" -->
```

The framework's `ThemeState` manages this attribute. Users interact via:

```typescript
this.immediateState.theme.setTheme('light');
this.immediateState.theme.cycleTheme();
```

### Theme Variables

All themes live in one CSS file (`theme.css`) using attribute selectors:

```css
/* yggdrasil/themes/theme.css */
@layer ygg.theme {
  /* Default/dark theme values */
  :root {
    --color-bg: #09090b;
    --color-bg-secondary: rgba(0, 0, 0, 0.2);
    --color-text: #fafafa;
    --color-primary: #f97316;
    /* ... */
  }

  /* Light theme overrides */
  [data-theme="light"] {
    --color-bg: #ffffff;
    --color-text: #213547;
    /* ... */
  }
}
```

> **See also:** [Semantic Color Definition Convention](../03-conventions/07-semantic-color-definition.md) for how to define and apply semantic colors.

### Adding a New Theme

1. Add the theme name to `AVAILABLE_THEMES` in `ThemeState.ts`
2. Add a `[data-theme="your-theme"]` block in the theme CSS file
3. The theme is immediately available via `setTheme('your-theme')`

---

## Container Queries

Container queries respond to **the tile's size**, not the viewport. This aligns with standalone tiles that can be placed in any context.

```css
/* UI elements adapt to container size */
@container tile (max-width: 400px) {
  .btn { font-size: 0.8em; padding: 0 var(--spacing-sm); }
}

@container tile (min-width: 600px) {
  .btn { padding: 0 var(--spacing-xl); }
}
```

The container is defined on `.munin-layered-container`:

```css
.munin-layered-container {
  container-type: size;
  container-name: tile;
}
```

---

## Import Order

The full import order in `index.css`:

```css
/* 1. Layer order declaration (MUST be first) */
@layer
  ygg.reset, ygg.theme, ygg.forms, ygg.tiles.base,
  ygg.ui.states, ygg.ui.container,
  app.ui, app.tiles, app.components;

/* YGGDRASIL FRAMEWORK */
@import url("./yggdrasil/reset.css");                    /* ygg.reset */
@import url("./yggdrasil/themes/theme.css");             /* ygg.theme */
@import url("./yggdrasil/forms/inputs.css");             /* ygg.forms */
@import url("./yggdrasil/tiles/_base.css");              /* ygg.tiles.base */
@import url("./yggdrasil/tiles/tiling.css");             /* ygg.tiles.base */
@import url("./yggdrasil/ui/states.css");                /* ygg.ui.states */
@import url("./yggdrasil/ui/spinner.css");               /* ygg.ui.states */
@import url("./yggdrasil/ui/display.css");               /* ygg.ui.states */
@import url("./yggdrasil/ui/controls.css");              /* ygg.ui.states */
@import url("./yggdrasil/ui/container-queries.css");     /* ygg.ui.container */

/* APP */
@import url("./app/ui/buttons.css");                     /* app.ui */
@import url("./tiles/PDFTile/tile.css");                 /* app.tiles */
@import url("./tiles/GraphTile/tile.css");               /* app.tiles */
@import url("./app/components/stripe-modal.css");        /* app.components */
@import url("./app/components/app-header.css");          /* app.components */
@import url("./app/components/app-toolbar.css");         /* app.components */
@import url("./app/layout.css");                         /* app.components */

/* DEBUG (unlayered - highest priority) */
@import url("./yggdrasil/debug/layers.css");
```

---

## Summary

| Aspect | Implementation |
|--------|----------------|
| Cascade control | CSS Layers with explicit order |
| Spatial layers | Munin flow + overlay system in `_base.css` |
| Theming | CSS variables + `data-theme` attribute |
| Responsiveness | Container queries (tile-sized) |
| Tile isolation | Standalone by default |
| State → CSS | Visual state via class toggles + CSS variables |
| CSS-in-JS | Not supported (strong convention) |
| Folder structure | Mirrors TypeScript app structure |

---

## Related Documents

- [CSS-Component Mirroring](./11-css-component-mirroring.md) - File structure and framework/app split
- [Semantic Color Definition](../03-conventions/07-semantic-color-definition.md) - Define at top, apply below
- [CSS Variable Transitions](../02-patterns/03-css-variable-transitions.md) - Enabling transitions in Munin
- [CSS View Mode Transitions](../03-conventions/08-css-view-mode-transitions.md) - GPU-accelerated tile sliding
