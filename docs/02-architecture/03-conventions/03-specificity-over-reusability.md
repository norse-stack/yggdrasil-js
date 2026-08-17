# Specificity Over Reusability Convention

## Overview

In Yggdrasil, **specificity is a feature, not a bug**. Components are designed to be specific to their owner. UI Elements are designed to be generic and reusable. The distinction is intentional.

## The Core Question

When deciding between Component and UI Element, ask:

> **Is this general behavior or specific behavior?**

That's it. Not "could this be reused?" but "should this be reused?"

## The Two Tiers

### Components (Tier 3) - Embrace Specificity

- **Tailored** to their tile's exact needs
- **Full access** to tile state via `this`
- **All the complexity they need** to do exactly what's required
- **Not meant to be reusable** - that's the point

```typescript
// PdfHeader.ts - Specific to PDFTile
export function PdfHeader(this: PDFTile) {
  // Full access to tile state
  const currentPdfId = this.immediateState.pdfTile.getCurrentPdfId();
  const bboxVisible = this.immediateState.pdfTile.isBboxVisible();

  // Specific logic for this tile
  const handleBboxToggle = () => {
    this.immediateState.pdfTile.setBboxVisible(!bboxVisible);
  };

  // Specific layout for this use case
  return munin`...`;
}
```

### UI Elements (Tier 4) - Keep It Generic

- **Pure functions** with explicit props
- **No state access** - everything passed in
- **True leaves** of the GUI
- **Reusable everywhere**

```typescript
// Button.ts - Generic, works anywhere
export function Button({ label, onClick, variant = "primary" }: ButtonProps) {
  return munin`
    <button class="btn btn--${variant}" onclick=${onClick}>
      ${label}
    </button>
  `;
}
```

## The Flow

### Start Specific, Extract Only What Proves Reusable

```
1. Build it in a component first
2. Notice a pattern repeating across tiles?
3. Extract ONLY that piece to UI Element
4. Keep the specific logic in the component
```

Don't start by abstracting. Start by making it work for *this* exact use case.

### Push Complexity Back Up

If a UI Element is getting bloated:

```typescript
// BAD: UI Element trying to handle all cases
PDFDropdown({
  mode: 'selector' | 'viewer' | 'editor',
  showDelete: boolean,
  showPreview: boolean,
  customActions: Action[],
  onSelect, onDelete, onPreview, onEdit,
  // ...15 more props
})
```

That's a signal. The specific logic belongs in the component:

```typescript
// GOOD: Simple UI Element
PDFDropdown({ currentPdfId, pdfList, onSelect, onDelete })

// Component handles the "when" and "how"
export function PdfHeader(this: PDFTile) {
  const showDelete = this.immediateState.pdfTile.canDelete();
  // Decide here, not in the UI Element
}
```

## Mental Model

| Layer | Purpose | Specificity |
|-------|---------|-------------|
| **Component** | Adaptation layer between generic UI and specific needs | HIGH - designed for one owner |
| **UI Element** | Building blocks | LOW - works everywhere |

Components are **where complexity is supposed to live**. They're the translation layer that knows:
- What state to read
- When to show/hide things
- How to wire up handlers
- What the exact layout should be

UI Elements just render what they're given.

## Anti-Patterns

### Trying to Make Components Reusable

```typescript
// BAD: Component with "flexibility" props
export function PdfToolbar(this: PDFTile, { showZoom = true, showNav = true }) {
  // Now it's neither specific enough nor generic enough
}
```

If you need flexibility, it's probably a UI Element. If it's a Component, make it specific.

### Cramming Logic into UI Elements

```typescript
// BAD: UI Element with business logic
export function PDFDropdown({ mode, permissions, userRole, ... }) {
  const canDelete = permissions.includes('delete') && userRole !== 'viewer';
  // This logic belongs in the component!
}
```

### Premature Extraction

```typescript
// BAD: Extracting before you have a pattern
// "This button might be reused someday..."
export function PdfUploadButton({ onUpload }: Props) { ... }

// GOOD: Just put it in the component until proven otherwise
export function PdfHeader(this: PDFTile) {
  return munin`
    <button onclick=${() => this.handleUpload()}>Upload</button>
  `;
}
```

## Guidelines

1. **Default to Component** - Start specific
2. **Extract when proven** - Not "might be reused" but "is being reused"
3. **Keep UI Elements simple** - If props are exploding, push logic up
4. **Embrace specificity** - Components are *supposed* to be tailored
5. **One question** - "Is this general or specific behavior?"
