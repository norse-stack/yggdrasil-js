# Remote Element Ownership Convention

## Overview

In Yggdrasil, UI elements can be placed anywhere in the DOM while their **behavior** is owned by a specific tile. This enables flexible UI composition where the App controls layout/styling but Tiles control functionality.

## The Pattern

### Convention: `TILE_ID-element-name`

Elements with IDs following the pattern `{TILE_ID}-{element-name}` are **owned by that tile**.

```typescript
// In AppToolbar (App owns placement/styling)
<button
  id="${PDF_TILE_ID}-upload-btn"  // Owned by PDF Tile
  class="btn btn--upload"
  type="button"
>
  Upload PDF
</button>

// The PDF Tile finds and wires this button via getElementById
```

### Ownership Responsibilities

| Concern | Owner |
|---------|-------|
| DOM placement | App/Component where element is rendered |
| CSS styling | App/Component (via class names) |
| Event handlers | Tile (via ID lookup) |
| Business logic | Tile |

## When to Use

**Good use cases (escape hatch):**
- Buttons in a global toolbar that trigger tile-specific actions
- Controls that need to live outside a tile's visual boundary
- Shared UI areas (header, footer) with tile-specific functionality

**Prefer instead:**
- Tiles creating their own buttons inside their boundaries
- Direct state/coordinator calls for cross-tile communication

## Tradeoffs

### Benefits
- **Flexible UI composition** - Move buttons anywhere without changing tile code
- **Clear ownership semantics** - ID tells you who owns behavior
- **Separation of concerns** - App handles UX, Tiles handle logic

### Caveats
- **Implicit coupling** - Connection between button and behavior is invisible in code
- **Requires documentation** - Developers must know the convention
- **Timing dependency** - Tile must find element after it renders

## Open Questions

> **TODO: Verify re-render behavior**
>
> If the toolbar is in a reactive layer that re-renders, does the tile need to re-attach event listeners? Need to verify munin's behavior here.

## Example Implementation

### App Side (AppToolbar.ts)
```typescript
import { TILE_ID as PDF_TILE_ID } from "../../../tiles/PDFTile/meta.js";

export function AppToolbar(this: ExampleApp) {
  // No onclick handler - tile owns behavior
  return munin`
    <button
      id="${PDF_TILE_ID}-upload-btn"
      class="btn btn--upload"
      type="button"
    >
      Upload PDF
    </button>
  `;
}
```

### Tile Side (PDFTile setup)
```typescript
// In tile initialization or event setup
const uploadBtn = document.getElementById(`${TILE_ID}-upload-btn`);
if (uploadBtn) {
  uploadBtn.addEventListener('click', () => {
    // Tile-owned behavior
    this.handleUpload();
  });
}
```

## Guidelines

1. **Document the convention** - Add comments explaining ownership
2. **Use for escape hatches** - Not the default pattern
3. **Keep behavior in tiles** - Don't leak tile logic into App components
4. **Verify element exists** - Always null-check getElementById results
