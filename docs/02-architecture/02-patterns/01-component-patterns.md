# Component Patterns Deep Dive

> *App, Tile, Component, and UI Element organization*

This document explains how to structure components in Yggdrasil: the four-tier hierarchy, folder organization, event handlers, and the patterns that keep everything maintainable.

---

## The Four Tiers

```
App                    → Special tile, owns global concerns
  │
  ├── Tile             → Reusable unit, owns its state
  │     │
  │     ├── Component  → Tile-bound function, accesses tile state via `this`
  │     │
  │     └── UI Element → Pure function with props, fully reusable
  │
  └── Tile
        └── ...
```

### Quick Decision Matrix

| Question | Answer | Use |
|----------|--------|-----|
| Accesses app state? | Yes | **App Component** |
| Accesses tile state? | Yes | **Tile Component** |
| Reusable across tiles? | Yes | **UI Element** |
| Needs inheritance/override? | Yes | **Component** |
| Generic button/modal/input? | Yes | **UI Element** |

---

## Tier 1: App

**Location:** `/src/app/ExampleApp/`

The App is a special Tile with additional responsibilities:
- Global state coordination
- Routing and navigation
- Authentication
- Theme management
- Tile composition

### Folder Structure

```
/src/app/ExampleApp/
├── ExampleApp.ts       # Main app class
├── meta.ts                # APP_ID constant
├── EventualState.ts       # App eventual state registration
├── ImmediateState.ts      # App immediate state registration
├── AppCoordinator.ts      # App coordination methods
└── components/
    ├── SettingsModal.ts   # App-level component
    ├── StripeModal.ts
    ├── AppHeader.ts
    └── index.ts           # Optional barrel export
```

### App Class

```typescript
// ExampleApp.ts
import { SettingsModal } from "./components/SettingsModal.js";
import { AppHeader } from "./components/AppHeader.js";

export class ExampleApp {
  // Bind components as methods
  private SettingsModal = SettingsModal;
  private AppHeader = AppHeader;

  // State references
  private immediateState: ImmediateState;
  private eventualState: EventualState;

  performRender() {
    const { fragments, tree } = munin
      .inTile(APP_ID)
      .layer('content', this.MainContent())
      .layer('overlay', this.OverlayContent())
      .collectComponents();

    this.renderingEngine.renderComponents(fragments, tree);
  }

  private OverlayContent() {
    const settingsOpen = this.immediateState.app.isSettingsModalOpen();

    return settingsOpen
      ? this.SettingsModal()
      : munin``;  // Empty munin for nothing
  }
}
```

---

## Tier 2: Tile

**Location:** `/src/app/tiles/PDFTile/`

Tiles are reusable units that own their state. They register with the system and can be distributed via CDN.

### Folder Structure

```
/src/app/tiles/PDFTile/
├── Tile.ts                # Main tile class
├── meta.ts                # TILE_ID constant
├── EventualState.ts       # Tile eventual state registration
├── ImmediateState.ts      # Tile immediate state registration
├── AppCoordinator.ts      # Tile coordination methods
├── components/
│   ├── PdfToolbar.ts      # Tile-level component
│   ├── PdfSidebar.ts
│   ├── PdfPageControls.ts
│   └── index.ts
└── strategies/            # Optional: persistent layer strategies
    └── PdfCanvasStrategy.ts
```

### meta.ts

Every tile has a meta file with its ID:

```typescript
// meta.ts
export const TILE_ID = "pdfTile";
export const TILE_INTERFACE = "pdfTile";
```

### State Registration Files

```typescript
// ImmediateState.ts
export interface PDFTileImmediateState {
  getCurrentPage(): number;
  setCurrentPage(page: number): void;
  getZoom(): number;
  setZoom(zoom: number): void;
}

declare module "../../../yggdrasil/state/ImmediateState" {
  interface ImmediateState {
    pdfTile: PDFTileImmediateState;
  }
}

export function registerPdfImmediateState(coordinator: AppCoordinator): void {
  const state = {
    currentPage: 1,
    zoom: 1.0,
  };

  coordinator.immediateState.registerTile("pdfTile", {
    getCurrentPage: () => state.currentPage,
    setCurrentPage: (page: number) => {
      state.currentPage = page;
      coordinator.immediateState.notifyListeners("pdfTile.getCurrentPage");
    },
    getZoom: () => state.zoom,
    setZoom: (zoom: number) => {
      state.zoom = zoom;
      coordinator.immediateState.notifyListeners("pdfTile.getZoom");
    },
  });
}
```

### Tile Class

```typescript
// Tile.ts
import { TILE_ID } from "./meta.js";
import { PdfToolbar } from "./components/PdfToolbar.js";
import { PdfSidebar } from "./components/PdfSidebar.js";

export class PDFTile {
  // Bind components as methods
  private PdfToolbar = PdfToolbar;
  private PdfSidebar = PdfSidebar;

  performRender(layersToUpdate?: string[]) {
    const { fragments, tree } = munin
      .inTile(TILE_ID)
      .layer('background', this.CanvasLayer())
      .layer('controls', this.ControlsLayer())
      .collectComponents();

    this.renderingEngine.renderComponents(fragments, tree, layersToUpdate);
  }

  private ControlsLayer() {
    return munin`
      <div class="pdf-controls">
        ${this.PdfToolbar()}
        ${this.PdfSidebar()}
      </div>
    `;
  }
}
```

---

## Tier 3: Component

**Location:** `/src/app/tiles/[TileName]/components/`

Components are functions bound to their parent via `this`. They have direct access to tile state without prop drilling.

### Key Characteristics

- Defined as standalone functions with `this` type annotation
- Imported and bound as methods on the tile class
- Direct access to `this.immediateState`, `this.eventualState`
- NOT meant to be reusable across tiles
- Perfect for inheritance - override specific components in subclasses

### Component Pattern

```typescript
// /src/app/tiles/PDFTile/components/PdfToolbar.ts
import type { PDFTile } from "../Tile.js";
import { munin } from "../../../../yggdrasil/munin/munin.js";

export function PdfToolbar(this: PDFTile) {
  // Define handlers locally
  const handleZoomIn = () => {
    const current = this.immediateState.pdfTile.getZoom();
    this.immediateState.pdfTile.setZoom(current * 1.2);
  };

  const handleZoomOut = () => {
    const current = this.immediateState.pdfTile.getZoom();
    this.immediateState.pdfTile.setZoom(current / 1.2);
  };

  // Access state DIRECTLY in template (borrow, don't clone!)
  return munin`
    <div class="pdf-toolbar">
      <span>Page ${this.immediateState.pdfTile.getCurrentPage()}</span>
      <span>Zoom: ${Math.round(this.immediateState.pdfTile.getZoom() * 100)}%</span>
      <button onclick=${handleZoomIn}>+</button>
      <button onclick=${handleZoomOut}>-</button>
    </div>
  `;
}
```

### Why Direct State Access?

```typescript
// ❌ BAD - Clone creates stale snapshot
export function PdfToolbar(this: PDFTile) {
  const page = this.immediateState.pdfTile.getCurrentPage();  // Clone!
  return munin`<span>Page ${page}</span>`;  // Stale value
}

// ✅ GOOD - Borrow keeps it fresh
export function PdfToolbar(this: PDFTile) {
  return munin`<span>Page ${this.immediateState.pdfTile.getCurrentPage()}</span>`;
}
```

### Inheritance Power

Components can be overridden in subclasses:

```typescript
// CustomPDFTile.ts
export class CustomPDFTile extends PDFTile {
  // Override just the toolbar!
  private PdfToolbar() {
    return munin`
      <div class="custom-toolbar">
        <h3>My Custom Toolbar</h3>
        ${super.PdfToolbar()}  <!-- Include original if desired -->
      </div>
    `;
  }
  // Everything else inherited unchanged
}
```

---

## Tier 4: UI Element

**Location:** `/src/app/ui/`

UI Elements are pure functions with explicit props. They have NO state access and are fully reusable.

### Folder Structure

```
/src/app/ui/
├── buttons/
│   ├── Button.ts
│   ├── IconButton.ts
│   └── index.ts
├── modals/
│   └── Modal.ts
├── forms/
│   ├── Input.ts
│   └── Select.ts
└── index.ts
```

### UI Element Pattern

```typescript
// /src/app/ui/buttons/Button.ts
import { munin } from "../../yggdrasil/munin/munin.js";

export interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}

export function Button({
  label,
  onClick,
  variant = "primary",
  disabled = false,
}: ButtonProps) {
  return munin`
    <button
      class="btn btn--${variant}"
      onclick=${onClick}
      disabled=${disabled}>
      ${label}
    </button>
  `;
}
```

### Usage in Components

```typescript
// In a tile component
import { Button } from "../../../../ui/buttons/Button.js";

export function PdfToolbar(this: PDFTile) {
  const handleSave = () => {
    this.appCoordinator.pdfTile.coordinateSave();
  };

  return munin`
    <div class="toolbar">
      ${Button({
        label: "Save",
        onClick: handleSave,
        variant: "primary"
      })}
    </div>
  `;
}
```

---

## Event Handler Pattern

### Handlers Live in Components

Event handlers are defined **inside** component functions:

```typescript
export function SettingsModal(this: ExampleApp) {
  // Define handlers locally
  const handleThemeChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    this.immediateState.app.setCurrentTheme(target.value);
  };

  const handleClose = () => {
    this.immediateState.app.closeSettingsModal();
  };

  const handleBuyCredits = async () => {
    await this.appCoordinator.app.coordinatePurchaseCredits(100);
  };

  return munin`
    <div class="modal">
      <select onchange=${handleThemeChange}>...</select>
      <button onclick=${handleBuyCredits}>Buy Credits</button>
      <button onclick=${handleClose}>Close</button>
    </div>
  `;
}
```

### Why Local Handlers?

- **Component self-containment** - Everything in one file
- **Scales better** - Avoid handler explosion in main tile file
- **Clear ownership** - Handler belongs to the component that uses it
- **Closure access** - Handlers have access to `this`

### Handler Naming Convention

```typescript
// ✅ GOOD - Clear, descriptive names
const handleThemeChange = (e: Event) => { ... };
const handleBuyCredits = async () => { ... };
const handleClose = () => { ... };
const handleBackdropClick = (e: MouseEvent) => { ... };

// ❌ BAD - Too generic
const onChange = (e: Event) => { ... };
const onClick = () => { ... };
```

### Named vs Inline Handlers

```typescript
// ✅ GOOD - Named handler (preferred)
const handleClose = () => {
  this.immediateState.app.closeSettingsModal();
};
return munin`<button onclick=${handleClose}>Close</button>`;

// ⚠️ OK - Inline for very simple cases
return munin`
  <button onclick=${() => this.immediateState.app.closeSettingsModal()}>
    Close
  </button>
`;

// ❌ BAD - Inline complex logic
return munin`
  <button onclick=${(e: MouseEvent) => {
    const target = e.currentTarget as HTMLElement;
    const theme = target.dataset.theme;
    if (theme && this.validateTheme(theme)) {
      this.immediateState.app.setCurrentTheme(theme);
      this.analytics.trackThemeChange(theme);
    }
  }}>
    Change Theme
  </button>
`;
```

### Complex Logic Goes in Coordinators

```typescript
// ❌ BAD - Complex logic in handler
const handleThemeChange = async (e: Event) => {
  const theme = (e.target as HTMLSelectElement).value;
  this.immediateState.app.setCurrentTheme(theme);
  await this.saveToBackend(theme);
  this.analytics.track("theme_changed", { theme });
  this.toast.show("Theme updated!");
};

// ✅ GOOD - Handler calls coordinator
const handleThemeChange = async (e: Event) => {
  const theme = (e.target as HTMLSelectElement).value;
  await this.appCoordinator.app.coordinateThemeChange(theme);
};

// In AppCoordinator.ts - complex logic lives here
coordination: async (theme: Theme) => {
  coordinator.immediateState.app.setCurrentTheme(theme);
  await coordinator.eventualState.app.saveThemeAction(theme);
  // Analytics, toasts, etc.
}
```

---

## Folder Structure Summary

```
/src/
├── app/
│   ├── ExampleApp/          # App (special tile)
│   │   ├── ExampleApp.ts
│   │   ├── meta.ts
│   │   ├── EventualState.ts
│   │   ├── ImmediateState.ts
│   │   ├── AppCoordinator.ts
│   │   └── components/
│   │       ├── SettingsModal.ts
│   │       └── AppHeader.ts
│   │
│   ├── tiles/                  # Tiles
│   │   ├── PDFTile/
│   │   │   ├── Tile.ts
│   │   │   ├── meta.ts
│   │   │   ├── EventualState.ts
│   │   │   ├── ImmediateState.ts
│   │   │   ├── AppCoordinator.ts
│   │   │   └── components/
│   │   │       ├── PdfToolbar.ts
│   │   │       └── PdfSidebar.ts
│   │   │
│   │   └── GraphTile/
│   │       ├── Tile.ts
│   │       ├── meta.ts
│   │       ├── EventualState.ts
│   │       ├── ImmediateState.ts
│   │       ├── AppCoordinator.ts
│   │       ├── components/
│   │       │   └── GraphToolbar.ts
│   │       └── strategies/
│   │           └── D3PersistentLayer.ts
│   │
│   └── ui/                     # UI Elements (pure)
│       ├── buttons/
│       │   └── Button.ts
│       ├── modals/
│       │   └── Modal.ts
│       └── forms/
│           └── Input.ts
│
└── yggdrasil/                  # Framework
    ├── state/
    ├── munin/
    ├── layer/
    └── tiling/
```

---

## File Organization Guidelines

### Keep It Flat Until You Need Nesting

```
✅ Good (start here):
/components/
├── SettingsModal.ts
├── StripeModal.ts
└── AppHeader.ts

❌ Premature nesting:
/components/
├── modals/
│   ├── settings/
│   │   └── SettingsModal.ts
```

### Add Nesting When It Provides Value

```
✅ Good (many related components):
/components/
├── modals/
│   ├── SettingsModal.ts
│   ├── StripeModal.ts
│   ├── ConfirmModal.ts
│   └── AlertModal.ts
├── headers/
│   ├── AppHeader.ts
│   └── MobileHeader.ts
```

---

## Anti-Patterns to Avoid

### Don't Mix Tiers

```typescript
// ❌ BAD - Pure UI accessing app state
export function Button() {
  const theme = window.appCoordinator.immediateState.app.getCurrentTheme();
  // Theme should be a parameter!
}

// ✅ GOOD - Pure UI accepts parameters
export function Button({ theme, onClick }: ButtonProps) {
  // Theme passed as parameter
}
```

### Don't Overuse Pure UI

```typescript
// ❌ BAD - Parameter explosion
function SettingsModalContent({
  theme,
  credits,
  onThemeChange,
  onClose,
  onBuyCredits,
  version,
  framework
}: SettingsModalProps) {
  // Too many parameters = should be a component!
}

// ✅ GOOD - Component grabs what it needs
function SettingsModal(this: ExampleApp) {
  const theme = this.immediateState.app.getCurrentTheme();
  const credits = this.eventualState.app.getUserCredits();
  // Direct access, no parameter explosion
}
```

### Don't Prop Drill

```typescript
// ❌ BAD - React-style prop drilling
<SettingsModal
  theme={theme}
  credits={credits}
  onThemeChange={handleThemeChange}
  onClose={closeModal}
/>

// ✅ GOOD - Yggdrasil-style direct access
this.SettingsModal()  // Component grabs what it needs
```

---

## Summary

| Tier | Location | State Access | Reusable | `this` |
|------|----------|--------------|----------|--------|
| **App** | `/app/ExampleApp/` | Yes (app) | No | Yes |
| **Tile** | `/app/tiles/[Name]/` | Yes (tile) | CDN distributable | Yes |
| **Component** | `/tiles/[Name]/components/` | Yes (via `this`) | Within tile | Yes |
| **UI Element** | `/app/ui/` | No (props only) | Everywhere | No |

**Key patterns:**
1. Components are bound as methods: `private MyComponent = MyComponent;`
2. Handlers are defined inside components
3. Access state directly in templates (borrow, don't clone)
4. Complex logic goes in coordinators
5. Keep folder structure flat until nesting provides value

---

## Next Steps

- [State System](../01-systems/01-state-system.md) — How state registration works
- [Rendering System](../01-systems/02-rendering-system.md) — How components become DOM
