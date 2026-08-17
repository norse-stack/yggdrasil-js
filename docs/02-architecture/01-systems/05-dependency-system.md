# Dependency System

> *Tiles own their dependencies*

The Dependency System enables tiles to declare and manage their third-party dependencies independently. This follows Yggdrasil's core principle that tiles should be self-contained, independently deployable units.

---

## Philosophy

### The Old Way (Centralized)

```
App loads → App initializes ALL libraries → App creates tiles → Tiles render
```

**Problems:**
- App must know what every tile needs
- Tiles can't be independently deployed
- Blank state while libraries load (solved by seed rendering)
- Tight coupling between App and tile implementation details

### The Yggdrasil Way (Tile-Owned)

```
App loads → App creates tiles → Tiles load their own deps → Tiles render
                                     ↓
                              (show "Initializing..." immediately)
```

**Benefits:**
- Tiles are truly self-contained
- App doesn't need to know tile implementation details
- Users see immediate feedback ("Initializing...")
- Works naturally with CDN tile distribution
- Framework handles deduplication automatically

---

## Core Concepts

### DependencyRegistry

The framework provides a singleton registry that:
- **Tracks** all third-party dependencies
- **Deduplicates** - if two tiles need D3, it loads once
- **Orchestrates** loading with proper status tracking
- **Validates** that libraries loaded correctly
- **Provides** security infrastructure (ready for future SRI, CSP)

### Dependency Definition

Tiles declare dependencies at module level:

```typescript
// In tile's dependencies.ts file
import { DependencyRegistry } from "../../../yggdrasil/dependencies/index.js";

DependencyRegistry.register({
  id: 'pdfjs',           // Unique identifier
  name: 'PDF.js',        // Human-readable name
  version: '3.11.174',   // For tracking/debugging

  // Loading source
  cdnUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  workerUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',

  // Security (minimal for now, expandable)
  security: {
    globalName: 'pdfjsLib',  // Expected window.* property
    // Future: integrity, allowedOrigins, sandboxed
  },

  // Lifecycle hooks
  onLoad: (pdfjsLib) => {
    // Library-specific setup
    pdfjsLib.GlobalWorkerOptions.workerSrc = '...';
  },

  validate: (pdfjsLib) => {
    // Verify library loaded correctly
    return typeof pdfjsLib?.getDocument === 'function';
  },
});

export const PDF_DEPENDENCIES = {
  PDFJS: 'pdfjs',
} as const;
```

### Dependency States

```
pending  → Not yet requested
loading  → Script loading in progress
ready    → Loaded, validated, onLoad complete
failed   → Loading or validation failed
```

---

## Implementation Pattern

### 1. Create dependencies.ts for your tile

```typescript
// src/app/tiles/MyTile/dependencies.ts
import { DependencyRegistry } from "../../../yggdrasil/dependencies/index.js";

DependencyRegistry.register({
  id: 'my-library',
  name: 'MyLibrary',
  version: '1.0.0',
  cdnUrl: 'https://cdn.example.com/my-library.min.js',
  security: {
    globalName: 'MyLib',
  },
  validate: (lib) => typeof lib?.init === 'function',
});

export const MY_DEPENDENCIES = {
  MY_LIB: 'my-library',
} as const;
```

### 2. Import dependencies FIRST in your tile

```typescript
// src/app/tiles/MyTile/Tile.ts

// Dependencies MUST be imported first (registers at module load)
import { MY_DEPENDENCIES } from "./dependencies.js";
import { DependencyRegistry } from "../../../yggdrasil/dependencies/index.js";
// ... other imports
```

### 3. Add dependency state to your tile

```typescript
export class MyTile implements TileInterface {
  // Dependency state
  private dependencyReady = false;
  private dependencyError: string | null = null;

  constructor(...) {
    // ... setup code ...

    // Start loading dependencies (non-blocking)
    this.initializeDependencies();

    // First render shows "Initializing..." overlay
    this.tilingManager.scheduleRender(TILE_ID);
  }

  private async initializeDependencies(): Promise<void> {
    try {
      await DependencyRegistry.require(MY_DEPENDENCIES.MY_LIB);
      this.dependencyReady = true;
      this.dependencyError = null;
      this.tilingManager.scheduleRender(TILE_ID);
    } catch (error) {
      this.dependencyReady = false;
      this.dependencyError = error instanceof Error ? error.message : String(error);
      this.tilingManager.scheduleRender(TILE_ID);
    }
  }
}
```

### 4. Add derived state for conditional rendering

```typescript
// Derived state getters
private isInitializing = () => !this.dependencyReady && !this.dependencyError;
private hasInitError = () => !!this.dependencyError;

// Overlay state for match statement
private getOverlayState = (): 'error' | 'initializing' | 'loading' | null => {
  if (this.hasInitError()) return 'error';
  if (this.isInitializing()) return 'initializing';
  if (this.isLoading()) return 'loading';
  return null;
};
```

### 5. Render with overlay layer

```typescript
performRender(layersToUpdate?: string[]) {
  const { fragments } = munin
    .inTile(TILE_ID)
    .layer("content", /* ... */)
    .layer("overlay", munin
      .match(this.getOverlayState())
      .case('error', () => this.ErrorOverlay())
      .case('initializing', () => this.InitializingOverlay())
      .case('loading', () => this.LoadingOverlay())
    )
    .collectLayers();

  this.renderingEngine.renderLayers(fragments, layersToUpdate);
}
```

### 6. Add overlay components

```typescript
private InitializingOverlay() {
  return munin`
    <div class="loading-overlay loading-overlay--init">
      <div class="loading-spinner">...</div>
      <h4>My Tile</h4>
      <p>Initializing...</p>
    </div>
  `;
}

private ErrorOverlay() {
  return munin`
    <div class="loading-overlay loading-overlay--error">
      <h4>Failed to Initialize</h4>
      <p>${this.dependencyError || 'Unknown error'}</p>
      <button onclick=${() => this.retryInitialization()}>Retry</button>
    </div>
  `;
}

private retryInitialization() {
  this.dependencyError = null;
  this.initializeDependencies();
}
```

---

## API Reference

### DependencyRegistry

```typescript
// Register a dependency (call at module level)
DependencyRegistry.register(definition: DependencyDefinition): void

// Request a dependency be loaded (async, deduplicates)
await DependencyRegistry.require(id: string): Promise<void>

// Check if ready (sync, for conditional rendering)
DependencyRegistry.isReady(id: string): boolean

// Get the global object (throws if not ready)
DependencyRegistry.get<T>(id: string): T

// Subscribe to status changes
const unsubscribe = DependencyRegistry.subscribe(id: string, callback): () => void

// Get all registered dependencies (for debugging/auditing)
DependencyRegistry.getAll(): Map<string, DependencyState>
```

### DependencyDefinition

```typescript
interface DependencyDefinition {
  id: string;              // Unique identifier
  name: string;            // Human-readable name
  version: string;         // Version for tracking

  // Loading (one required)
  cdnUrl?: string;         // CDN script URL
  workerUrl?: string;      // Additional worker script (e.g., PDF.js)
  bundled?: boolean;       // Load from bundle instead
  bundledImport?: string;  // Import path if bundled

  // Security
  security: {
    globalName: string;    // Expected window.* property
    // Future: integrity, allowedOrigins, sandboxed
  };

  // Lifecycle
  onLoad?: (global: any) => void | Promise<void>;
  validate?: (global: any) => boolean;
}
```

---

## File Structure

```
src/app/tiles/PDFTile/
├── dependencies.ts    ← Dependency declarations (imported first)
├── Tile.ts           ← Tile implementation
├── meta.ts           ← Tile identity
└── ...

src/yggdrasil/dependencies/
├── DependencyRegistry.ts  ← Framework infrastructure
└── index.ts               ← Public exports
```

---

## Security Considerations

The dependency system is designed with security in mind, though some features are placeholders for future implementation:

### Current
- **Global name validation** - Verifies expected property exists after load
- **Custom validation** - Tiles can verify library API exists
- **Audit trail** - All dependencies tracked in registry

### Future (TODO)
- **SRI (Subresource Integrity)** - Hash verification for CDN scripts
- **CSP (Content Security Policy)** - Automatic directive generation
- **Origin validation** - Allowlist of trusted CDN origins
- **Sandbox isolation** - iframe isolation for untrusted code

---

## Best Practices

### DO
- Declare dependencies at module level (top of dependencies.ts)
- Import dependencies.ts FIRST in your tile
- Provide validation functions to verify libraries loaded correctly
- Handle both success and error states in your tile
- Use meaningful error messages for users

### DON'T
- Load dependencies in the App (tiles own their deps)
- Block tile construction on dependency loading
- Assume dependencies are ready in constructor
- Forget to re-render after dependency state changes

---

## Examples

### PDFTile (PDF.js)

```typescript
// dependencies.ts
DependencyRegistry.register({
  id: 'pdfjs',
  name: 'PDF.js',
  version: '3.11.174',
  cdnUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  workerUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  security: { globalName: 'pdfjsLib' },
  onLoad: (pdfjsLib) => {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  },
  validate: (pdfjsLib) => typeof pdfjsLib?.getDocument === 'function',
});
```

### GraphTile (D3.js)

```typescript
// dependencies.ts
DependencyRegistry.register({
  id: 'd3',
  name: 'D3.js',
  version: '7',
  cdnUrl: 'https://d3js.org/d3.v7.min.js',
  security: { globalName: 'd3' },
  validate: (d3) =>
    typeof d3?.select === 'function' &&
    typeof d3?.forceSimulation === 'function',
});
```

---

## Related Documentation

- [Design Principles](../../01-philosophy/01-design-principles.md) - Core Yggdrasil philosophy
- [Tiling System](./04-tiling-system.md) - How tiles register and render
- [Rendering System](./02-rendering-system.md) - Munin layers and overlays
