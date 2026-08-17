# Seed Rendering System

> *Unified loading states for SSR and Client - no blank flash, ever*

---

## Overview

The Seed Rendering System ensures users never see a blank tile during initialization. It provides a unified approach that works identically for both server-side rendering (SSR) and client-side rendering.

**The core insight:** From Yggdrasil's perspective, SSR and client-side seed rendering are the same problem - "there's HTML in the container, render over it when ready."

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        APP TEMPLATE                                  │
│  (ExampleApp.performRender)                                      │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  <div id="pdf-tile" class="tile">                           │    │
│  │    <div class="tile-content">                               │    │
│  │      ${this.PDFTileSeedContent()}  ← Seed inline            │    │
│  │    </div>                                                   │    │
│  │  </div>                                                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   Browser Paints      │
                    │   (User sees seed)    │
                    └───────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     TILE INITIALIZATION                              │
│                                                                      │
│  new PDFTile(coordinator, container, tilingManager)                 │
│       │                                                              │
│       ├─ Creates RenderingEngine                                    │
│       ├─ Sets up state & subscriptions                              │
│       ├─ initializeDependencies() (async, non-blocking)             │
│       └─ scheduleRender(TILE_ID)                                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     RENDERING ENGINE                                 │
│                                                                      │
│  renderLayers() / renderFragment() / renderComponents()             │
│       │                                                              │
│       ├─ clearSeedIfNeeded()  ← Clears seed on first render         │
│       │       │                                                      │
│       │       └─ container.innerHTML = ""                           │
│       │                                                              │
│       └─ Mount tile's own layers (identical visual!)                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. Seed Definition (`PDFTile/ssrSeed.ts`)

Each tile defines its seed - the loading state users see before the tile is ready:

```typescript
import { munin } from "yggdrasil-js/munin";
import type { SeedDefinition } from "yggdrasil-js/munin";

export const PDFTileSeed: SeedDefinition<PDFSeedState> = {
  seedState: () => ({
    title: "PDF Viewer",
    message: "Initializing viewer...",
  }),

  layers: (seed) => ({
    background: munin``,
    header: munin`<div class="tile-header"><h3>${seed.title}</h3></div>`,
    content: munin`<div class="tile-content"></div>`,
    controls: munin``,
    // MUST match tile's InitializingOverlay exactly!
    overlay: munin`
      <div class="pdf-loading-overlay pdf-loading-overlay--init">
        <div class="pdf-loading-content">
          <div class="pdf-loading-spinner">
            <div class="pdf-spinner-ring"></div>
          </div>
          <div class="pdf-loading-text">
            <h4>${seed.title}</h4>
            <p>${seed.message}</p>
          </div>
        </div>
      </div>
    `,
  }),
};
```

### 2. App Integration (`ExampleApp.ts`)

The App renders seed content inline in its template:

```typescript
// Import seed definition
import { PDFTileSeed } from "./tiles/PDFTile/ssrSeed.js";

class ExampleApp {
  // Helper to render seed content
  private PDFTileSeedContent() {
    const seed = PDFTileSeed.seedState();
    return PDFTileSeed.layers(seed).overlay;
  }

  performRender() {
    return munin
      .inTile(APP_INTERFACE)
      .layer("content", munin`
        <main class="tiles-container">
          <div id="${PDF_TILE_ID}" class="tile">
            <div class="tile-content">
              ${this.PDFTileSeedContent()}  <!-- Seed inline! -->
            </div>
          </div>
        </main>
      `)
      // ... other layers
  }
}
```

### 3. Tile Declaration (`PDFTile/Tile.ts`)

Tiles declare their seed as a static property:

```typescript
import { PDFTileSeed } from "./ssrSeed.js";

export class PDFTile implements TileInterface {
  // Framework can use this for SSR
  static seed = PDFTileSeed;

  constructor(appCoordinator, container, tilingManager) {
    // NOTE: Seed content will be cleared by RenderingEngine.setupContainer()

    // Setup layers, state, subscriptions...
    this.initializeDependencies();  // async, non-blocking
    this.tilingManager.scheduleRender(TILE_ID);
  }
}
```

### 4. RenderingEngine Handoff (`RenderingEngine.ts`)

The RenderingEngine clears seed content on first render:

```typescript
class RenderingEngine {
  private seedCleared = false;

  private clearSeedIfNeeded(): void {
    if (!this.seedCleared) {
      this.container.innerHTML = "";
      this.seedCleared = true;
    }
  }

  // All three render methods call clearSeedIfNeeded()
  renderFragment(fragment) {
    this.clearSeedIfNeeded();
    // ... render logic
  }

  renderLayers(fragments, layersToUpdate?) {
    this.clearSeedIfNeeded();
    // ... render logic
  }

  renderComponents(fragments, tree, layersToUpdate?) {
    this.clearSeedIfNeeded();
    // ... render logic
  }
}
```

---

## The Flow

```
Time ─────────────────────────────────────────────────────────────────▶

t=0ms     App.performRender()
          │
          └─ Seed HTML rendered into tile container
             (loading spinner with "Initializing viewer...")

─── JavaScript execution continues (synchronous) ───

t=1ms     new PDFTile() constructor
          │
          ├─ RenderingEngine created (seed NOT cleared yet)
          ├─ State & subscriptions setup
          ├─ initializeDependencies() started (async)
          └─ scheduleRender() queued

─── JavaScript yields to browser ───

t=2ms     BROWSER PAINTS
          │
          └─ USER SEES: Loading spinner! (seed)

─── Render timer fires ───

t=16ms    performRender() called
          │
          ├─ renderLayers()
          │   └─ clearSeedIfNeeded() ← Seed cleared HERE
          │
          └─ Tile's InitializingOverlay mounted
             (IDENTICAL to seed - no visual change!)

          USER SEES: Same spinner (seamless!)

─── Dependencies loading from CDN ───

t=200ms   PDF.js loaded
          │
          ├─ dependencyReady = true
          └─ scheduleRender()

t=216ms   performRender() called
          │
          └─ Tile renders with real content
             (overlay removed, canvas shown)

          USER SEES: Live PDF tile!
```

---

## Why It Works

### The Browser Paint Window

The critical insight is **JavaScript runs synchronously until it yields**. By waiting to clear the seed until `renderLayers()` (which happens via a timer), we give the browser a chance to paint the seed first.

```
Synchronous execution (no paint):
  App.render() → new PDFTile() → scheduleRender()

Browser paints seed here! ← The magic moment

Timer fires:
  performRender() → clearSeed() → mount layers
```

### Visual Continuity

The seed's overlay is **identical** to the tile's `InitializingOverlay()`. When the seed is cleared and the tile renders its own overlay, users see no change - the spinner just keeps spinning.

```typescript
// Seed overlay
overlay: munin`
  <div class="pdf-loading-overlay pdf-loading-overlay--init">
    ...spinner HTML...
  </div>
`

// Tile's InitializingOverlay (IDENTICAL)
private InitializingOverlay() {
  return munin`
    <div class="pdf-loading-overlay pdf-loading-overlay--init">
      ...spinner HTML...
    </div>
  `;
}
```

---

## SSR Compatibility

The same seed definition works for SSR:

```typescript
// Server-side (Astro, Node.js with JSDOM)
import { renderSeedToHTML } from "yggdrasil-js/ssr";
import { PDFTileSeed } from "./tiles/PDFTile/ssrSeed.js";

const seedHTML = renderSeedToHTML(PDFTileSeed);
// → HTML string ready to embed in page
```

For SSR, the seed HTML is sent as part of the initial page response. When Yggdrasil initializes on the client, `clearSeedIfNeeded()` clears the SSR seed just as it would clear a client-rendered seed.

---

## File Structure

```
src/
├── yggdrasil/
│   ├── munin/
│   │   ├── seedRendering/
│   │   │   ├── index.ts          # Exports
│   │   │   ├── types.ts          # SeedDefinition interface
│   │   │   └── renderer.ts       # renderSeed(), renderSeedToHTML()
│   │   │
│   │   └── layer/
│   │       └── RenderingEngine.ts  # clearSeedIfNeeded() in all render methods
│   │
│   └── ssr.ts                    # Re-exports seed rendering utilities
│
└── app/
    ├── ExampleApp.ts        # PDFTileSeedContent() helper
    │
    └── tiles/
        └── PDFTile/
            ├── ssrSeed.ts      # PDFTileSeed definition
            └── Tile.ts         # static seed = PDFTileSeed
```

---

## Best Practices

### DO

- Keep seed visually identical to tile's loading state
- Use the same CSS classes in seed and tile overlays
- Define seed in a separate file for clarity
- Test seed rendering in isolation

### DON'T

- Clear seed in tile constructor (let RenderingEngine handle it)
- Add complex logic to seed definitions (keep them static)
- Forget to update seed when changing tile's loading UI

---

## Related Documentation

- [Dependency System](./05-dependency-system.md) - Tile-owned dependency loading
- [RenderingEngine Architecture](./02-rendering-system.md) - Layer lifecycle management
