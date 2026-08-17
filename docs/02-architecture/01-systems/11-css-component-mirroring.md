# CSS-Component Mirroring Convention

> *Implicit coupling through structure, not explicit coupling through tooling*

**Status:** Active

---

## The Problem

CSS and component architecture represent two separate mental models that must be kept in sync:

```
Component Structure              CSS Structure
-------------------              -------------
App                              ???
└── Tile                         ???
    └── Component                ???
        └── UI Element           ???
```

These two systems are **orthogonal** - you have full freedom to structure each independently. This freedom is the problem:

1. **Cognitive overhead**: Two mental models to maintain
2. **Drift**: They fall out of sync over time
3. **Discovery**: "Where is the CSS for this component?"
4. **Ownership**: "Who should modify this style?"

---

## How Others Solve It

### CSS-in-JS (Styled Components, Emotion)

**Approach:** Collapse the two models into one. CSS lives inside the component file.

```jsx
// Component and styles in one file
const Button = styled.button`
  background: ${props => props.primary ? 'blue' : 'gray'};
  padding: 8px 16px;
`;
```

**Tradeoffs:**
- ✅ No sync problem - one file, one model
- ❌ Lose cascade power
- ❌ Runtime overhead
- ❌ Still need to understand CSS
- ❌ Fighting config to make themes work

### Utility-First (Tailwind)

**Approach:** Eliminate custom CSS. Use utility classes directly in markup.

```html
<button class="bg-blue-500 px-4 py-2 rounded hover:bg-blue-600">
  Click me
</button>
```

**Tradeoffs:**
- ✅ No separate CSS files
- ✅ Changes are local to component
- ❌ Verbose markup
- ❌ Theming requires config wrestling
- ❌ No semantic class names
- ❌ Harder to maintain consistency

### CSS Modules

**Approach:** Scoped CSS files that live next to components.

```
Button/
├── Button.tsx
└── Button.module.css
```

**Tradeoffs:**
- ✅ Clear ownership
- ✅ Scoped by default
- ❌ Lose cascade (scoping prevents it)
- ❌ One file per component (even trivial ones)
- ❌ Import boilerplate

---

## The Yggdrasil Approach: Mirror, Don't Merge

Instead of collapsing the two models or scoping them apart, we **mirror** them:

> **CSS file structure mirrors component structure exactly.**

```
src/app/                              styles/app/
├── ExampleApp/                    ├── layout.css
│   └── components/                   └── components/
│       ├── SettingsModal.ts              ├── settings-modal.css (if needed)
│       └── AppHeader.ts                  └── app-header.css
│
├── tiles/                            styles/tiles/
│   ├── PDFTile/                      ├── PDFTile/
│   │   ├── Tile.ts                   │   └── tile.css
│   │   └── components/               │
│   │       └── PdfPageControls.ts    │
│   │
│   └── GraphTile/                    └── GraphTile/
│       ├── Tile.ts                       └── tile.css
│       └── components/
│           └── GraphHeader.ts
│
└── ui/                               styles/app/ui/
    └── Button.ts                         └── buttons.css
```

### The Key Insight: Component CSS is Optional

Most component styles belong in `tile.css`. You only create a separate component CSS file when complexity demands it.

| Component exists? | CSS file required? |
|-------------------|-------------------|
| `Tile.ts` | **Yes** - always `tile.css` |
| Component in `components/` | **No** - use `tile.css` by default |
| Only create `components/*.css` | When `tile.css` isn't enough |

The **absence** of a CSS file is meaningful: "I inherit from my parent."

---

## Framework vs App Responsibility

Not everything should be app-owned. The split is based on difficulty:

### Framework Provides (Hard Things)

| Concern | Why Framework? |
|---------|---------------|
| Reset/normalize | Everyone needs it |
| Theme variables | Cascade foundation |
| Tile infrastructure | Munin layers, flow system |
| Form inputs | Accessibility, validation, focus states are HARD |
| UI states | Loading spinners, error states, empty states - consistent UX patterns |
| Container queries | Responsive tile behavior - complex to get right |

### App Provides (Branded Things)

| Concern | Why App? |
|---------|----------|
| Buttons | Highly branded, easy to write |
| Modals | Layout varies by app |
| Tiles | App-specific by definition |
| Layout | App-specific by definition |

**Principle:** Framework provides what's hard to get right. App provides what's branded.

> **Note:** The line between "hard" and "branded" can blur. Spinners and loading states *could* be branded, but the default framework versions are good enough for most Yapps. Override them in `app/ui/` if you need custom branding.

---

## File Structure

```
styles/
├── yggdrasil/                    # Framework (ships with Yggdrasil)
│   ├── reset.css                 # Browser normalization
│   ├── themes/
│   │   └── theme.css             # CSS variables, theme switching
│   ├── tiles/
│   │   ├── _base.css             # Munin layer infrastructure
│   │   └── tiling.css            # Window management
│   ├── forms/                    # Hard stuff - framework provides
│   │   └── inputs.css            # Inputs, selects, validation
│   ├── ui/                       # Framework UI utilities
│   │   ├── states.css            # Loading, error, empty states
│   │   ├── spinner.css           # Loading spinners
│   │   ├── container-queries.css # Responsive tile behavior
│   │   └── ...                   # Other utilities
│   └── debug/
│       └── layers.css            # Dev tools (unlayered)
│
├── app/                          # This Yapp's styles
│   ├── ui/                       # App's branded UI elements
│   │   └── buttons.css           # Branded button variants
│   ├── components/               # App-level component styles
│   │   ├── app-header.css
│   │   ├── app-toolbar.css
│   │   └── stripe-modal.css
│   └── layout.css                # App layout & modals
│
├── tiles/                        # Tile-specific styles
│   ├── PDFTile/
│   │   └── tile.css
│   └── GraphTile/
│       └── tile.css
│
└── index.css                     # Import orchestration
```

---

## The Mental Model

```
"Where does CSS for X go?"

1. Is X a form element?       → yggdrasil/forms/inputs.css
2. Is X a UI state?           → yggdrasil/ui/states.css (loading, error, empty)
3. Is X a Tile?               → tiles/[Tile]/tile.css
4. Is X a Tile Component?     → tiles/[Tile]/tile.css (default)
                                OR tiles/[Tile]/components/[name].css
                                (only if complexity demands)
5. Is X App-level?            → app/components/[name].css
6. Is X a branded UI element? → app/ui/[element].css

Cascade flows: yggdrasil → app/ui → tiles → app/components
```

---

## CSS Layers Alignment

The CSS `@layer` system mirrors the component hierarchy:

```css
@layer
  ygg.reset,           /* Browser normalization */
  ygg.theme,           /* CSS variables */
  ygg.forms,           /* Framework form elements */
  ygg.tiles.base,      /* Munin infrastructure */
  ygg.ui.states,       /* Framework UI states (loading, error, empty) */
  ygg.ui.container,    /* Container query adaptations */
  app.ui,              /* App's branded UI (buttons, etc.) */
  app.tiles,           /* Tile-specific styles */
  app.components;      /* App-level components */
```

Later layers override earlier ones. This means:
- App buttons override framework defaults
- Tile styles override app UI defaults
- Component styles (when needed) override tile defaults

> **Note:** Framework UI (`ygg.ui.*`) comes before app UI (`app.ui`), so apps can override framework spinners/states if needed while still benefiting from framework defaults.

---

## BEM Within Tiles

Within `tile.css`, use BEM to organize component styles:

```css
/* tile.css for GraphTile */

/* Tile container */
.graph-tile { }

/* Component: Header */
.graph-header { }
.graph-header__info { }
.graph-header__controls { }

/* Component: Layout Toggle */
.graph-layout-toggle { }
.graph-layout-toggle__btn { }
.graph-layout-toggle__btn--active { }

/* Component: Loading Overlay */
.graph-loading-overlay { }
.graph-loading-overlay--error { }
```

BEM keeps the single file organized without needing separate files per component.

---

## When to Create Component CSS Files

**Default:** Keep styles in `tile.css`

**Create separate file when:**
1. Component has 50+ lines of CSS
2. Component is reused across tiles (rare - usually means it's a UI element)
3. Component needs complex responsive behavior
4. Team agreement that separation aids maintenance

**The bar is high.** Most components should NOT have their own CSS file.

---

## Future: Compiler Enforcement

The convention could be enforced by tooling:

```typescript
// vite-plugin-yggdrasil-css (future)

// Rule 1: Every tile MUST have a tile.css
// Error: "GraphTile/Tile.ts exists but styles/app/tiles/GraphTile/tile.css does not"

// Rule 2: Orphaned CSS files
// Warning: "styles/app/tiles/OldTile/tile.css has no matching component"

// Rule 3: BEM prefix matches tile
// Error: ".pdf-header" in GraphTile/tile.css should be ".graph-header"
```

But the convention works without tooling - it's just harder to enforce.

---

## Summary

| Aspect | Yggdrasil Approach |
|--------|-------------------|
| **Problem** | Two mental models drift out of sync |
| **Solution** | Mirror file structure, don't merge or scope |
| **Framework provides** | Hard things (forms, reset, theme, infrastructure) |
| **App provides** | Branded things (buttons, modals, tiles) |
| **Component CSS** | Optional - default is inherit from tile.css |
| **Organization** | BEM within tile.css |
| **Enforcement** | Convention now, tooling later |

**Core principle:** The file system IS the documentation. To find CSS for a component, mirror the path.

---

## Related Documents

- [Semantic Color Definition](../03-conventions/07-semantic-color-definition.md) - Define at top, apply below
- [Component Patterns](../02-patterns/01-component-patterns.md) - Four-tier hierarchy
