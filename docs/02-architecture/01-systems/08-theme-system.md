# Theme System

> *Framework-managed theming for standalone tiles*

This document explains how Yggdrasil handles theming at the framework level, ensuring that tiles work correctly whether they're inside a Yapp or running standalone (e.g., as an Astro island).

---

## Why Framework-Level Theming?

Yggdrasil treats **tiles as the smallest meaningful unit**. A tile should be deployable anywhere - in a full Yapp, embedded in a CMS, or as an Astro island. This creates a requirement:

> Tiles must have access to theming without depending on a Yapp.

If theming lived at the app level, standalone tiles would need to implement their own theme handling. By making theme a **framework concern**, we:

1. **Enable standalone tiles** - Any tile gets theming out of the box
2. **Ensure consistency** - All tiles in a Yapp share the same theme state
3. **Reduce boilerplate** - Tile authors don't implement theme management

```
┌─────────────────────────────────────────────────────────────┐
│                    ImmediateState                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Framework State (built-in)                          │   │
│  │   - theme        ← Theme management                 │   │
│  │   - focus        ← Browser focus tracking           │   │
│  │   - tileLayout   ← Window arrangement               │   │
│  │   - loadingStatus                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Tile State (registered per tile)                    │   │
│  │   - pdfTile.getCurrentPage()                        │   │
│  │   - graphTile.getSelectedNode()                     │   │
│  │   - ...                                             │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## How It Works

### 1. State Registration

Theme state is registered automatically during `ImmediateState` construction:

```typescript
// Inside ImmediateState constructor
registerThemeState(this, (query: string) => this.notifyListeners(query));
```

This makes `immediateState.theme` available to all tiles and components without any setup.

### 2. DOM Integration

Theme is applied via a `data-theme` attribute on the document root:

```html
<html data-theme="dark">
```

CSS variables respond to this attribute:

```css
:root {
  --color-bg: #242424;      /* Default (dark) */
  --color-text: rgba(255, 255, 255, 0.87);
}

[data-theme="light"] {
  --color-bg: #ffffff;
  --color-text: #213547;
}

[data-theme="high-contrast"] {
  --color-bg: #ffffff;
  --color-text: #000000;
  --color-border: #000000;
}
```

### 3. Persistence

Theme preference is persisted to localStorage (`yggdrasil-theme`). On load:

1. Check localStorage for saved preference
2. If none, use system preference (`prefers-color-scheme`)
3. Listen for system preference changes (only if no explicit user preference)

---

## API Reference

Access theme state via `immediateState.theme`:

### Read Methods

```typescript
// Get current theme
const theme = this.immediateState.theme.getCurrentTheme();
// Returns: 'dark' | 'light' | 'high-contrast'

// Get available themes
const themes = this.immediateState.theme.getAvailableThemes();
// Returns: ['dark', 'light', 'high-contrast']
```

### Write Methods

```typescript
// Set specific theme
this.immediateState.theme.setTheme('light');

// Cycle through themes (dark → light → high-contrast → dark)
const nextTheme = this.immediateState.theme.cycleTheme();

// Toggle between light and dark only
const newTheme = this.immediateState.theme.toggleLightDark();

// Clear preference (revert to system preference)
this.immediateState.theme.clearPreference();
```

### Reactive Updates

Subscribe to theme changes:

```typescript
this.immediateState.subscribe('theme.getCurrentTheme', (event) => {
  const theme = event.data as Theme;
  console.log('Theme changed to:', theme);
  this.scheduleRender();
});
```

---

## Usage in Components

### In Templates (Borrow Pattern)

Access theme directly in Munin templates for reactive updates:

```typescript
export function ThemeSelector(this: SomeTile) {
  const handleChange = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    this.immediateState.theme.setTheme(target.value as Theme);
  };

  return munin`
    <select
      ref=${(el: HTMLSelectElement) => {
        el.value = this.immediateState.theme.getCurrentTheme();
      }}
      onchange=${handleChange}>
      <option value="dark">Dark</option>
      <option value="light">Light</option>
      <option value="high-contrast">High Contrast</option>
    </select>
  `;
}
```

### Theme Toggle Button

```typescript
export function ThemeToggle(this: SomeTile) {
  const handleToggle = () => {
    this.immediateState.theme.cycleTheme();
  };

  return munin`
    <button onclick=${handleToggle} title="Cycle theme">
      ${this.immediateState.theme.getCurrentTheme() === 'dark' ? '🌙' : '☀️'}
    </button>
  `;
}
```

---

## CSS Architecture Integration

Theme variables are defined in `/styles/framework/themes/dark.css` (or `theme.css`). All themes live in one file using attribute selectors:

```css
@layer ygg.theme {
  /* Default values (dark theme) */
  :root {
    --color-bg: #242424;
    --color-text: rgba(255, 255, 255, 0.87);
    --color-primary: #646cff;
    /* ... */
  }

  /* Light theme overrides */
  [data-theme="light"] {
    --color-bg: #ffffff;
    --color-text: #213547;
    /* ... */
  }

  /* High contrast theme overrides */
  [data-theme="high-contrast"] {
    --color-bg: #ffffff;
    --color-text: #000000;
    --color-border: #000000;
    /* ... */
  }
}
```

**Adding a new theme:**

1. Add the theme name to `AVAILABLE_THEMES` in `ThemeState.ts`
2. Add the corresponding `[data-theme="your-theme"]` block in CSS
3. The theme is now available via `setTheme('your-theme')`

---

## Standalone Tile Usage

When a tile runs outside a Yapp (e.g., Astro island), it can still access theming:

```typescript
// Standalone tile initialization
import { ImmediateState } from 'yggdrasil/state/ImmediateState';

const immediateState = new ImmediateState();
// Theme is automatically available!
const theme = immediateState.theme.getCurrentTheme();
```

The tile inherits the page's theme (via `data-theme` on `<html>`) or initializes from system preference.

---

## Design Decisions

### Why `data-theme` on `<html>` (not CSS classes)?

- **Attribute selectors are explicit** - `[data-theme="dark"]` clearly communicates intent
- **No specificity wars** - Attributes don't compete with class-based styling
- **Framework convention** - Consistent with how we use `data-*` attributes elsewhere

### Why one theme file instead of separate files?

Simpler. All theme variations in one place means:
- Easier to see what changes between themes
- No import management
- Variables are naturally grouped

If you prefer separate files per theme, you can structure it that way - the `data-theme` approach supports both.

### Why localStorage, not the state persistence system?

Theme preference is a user preference that should survive across sessions, tabs, and even different Yapps on the same domain. localStorage is the right tool for this.

---

## Summary

| Aspect | Implementation |
|--------|----------------|
| **Location** | `immediateState.theme` (framework-level) |
| **State type** | ImmediateState (synchronous, never fails) |
| **DOM mechanism** | `data-theme` attribute on `<html>` |
| **CSS mechanism** | CSS variables with attribute selectors |
| **Persistence** | localStorage (`yggdrasil-theme`) |
| **System preference** | Falls back to `prefers-color-scheme` |
| **Available themes** | `'dark'` \| `'light'` \| `'high-contrast'` |

**Key insight:** By making theme a framework concern, tiles become truly standalone - they work correctly in any context, with or without a Yapp.

---

## Related Documents

- [CSS Architecture](./09-css-architecture.md) - Layer system and theme variables
- [State System](./01-state-system.md) - ImmediateState and framework state
- [Design Principles](../../01-philosophy/01-design-principles.md) - Tile independence philosophy
