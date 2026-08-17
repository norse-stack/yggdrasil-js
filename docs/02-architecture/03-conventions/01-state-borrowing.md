# State Borrowing Convention

## Overview

In Yggdrasil, how you read state affects reactivity. This convention ensures components always have fresh state values when rendering.

## The Rule: Borrow Inline, Don't Clone

### Wrong: Cloning to a variable
```typescript
export function MyComponent(this: ExampleApp) {
  // BAD: This is a "clone" - snapshot at this moment
  const viewMode = this.immediateState.app.getViewMode();

  return munin`
    <div>Current mode: ${viewMode}</div>
  `;
}
```

### Correct: Borrowing inline
```typescript
export function MyComponent(this: ExampleApp) {
  return munin`
    <div>Current mode: ${this.immediateState.app.getViewMode()}</div>
  `;
}
```

## Why This Matters

The real mechanism is **binding time**. Templates in Yggdrasil are lazy values — `.cond()`/`.when()` branches, `.match()` cases, and static layers on interval schedules are *collected* later (and possibly repeatedly), not at construction. When you:

1. **Clone to variable**: the read is bound once, when the component function runs. By the time the template is collected, the captured value can be stale — and the stale value is what enters the cache key, so the change is never detected.

2. **Borrow inline**: the read is bound at collect time, every time. The fresh value enters the leaf's cache key, so a changed value reads as a changed key and the leaf is swapped.

Note there is no per-access dependency graph: reactivity is coarse (any write to the tile's own state marks the whole tile dirty). The cache key is what turns "tile is dirty" into "this specific leaf changed".

## Mental Model

Think of it like Rust's borrowing:

| Pattern | Rust Equivalent | Behavior |
|---------|-----------------|----------|
| `const x = state.getValue()` | `.clone()` | Snapshot, may be stale |
| `${state.getValue()}` inline | `&` borrow | Live reference, always fresh |

## When Cloning is OK

Cloning is acceptable when:
- The value is used in a handler (closures capture at definition time anyway)
- You need to compute/transform the value before rendering
- The value won't change during the component's lifetime

```typescript
export function MyComponent(this: ExampleApp) {
  // OK: Handler captures current value when defined
  const handleClick = () => {
    const mode = this.immediateState.app.getViewMode();
    console.log('Clicked while in mode:', mode);
  };

  // STILL borrow inline for rendering
  return munin`
    <div>Mode: ${this.immediateState.app.getViewMode()}</div>
    <button onclick=${handleClick}>Log Mode</button>
  `;
}
```

## Common Mistakes

### Mistake 1: Caching for "readability"
```typescript
// Tempting but wrong
const isOpen = this.immediateState.app.isUserMenuOpen();
const userName = this.eventualState.app.getUserName();

return munin`
  ${isOpen ? UserMenu({ name: userName }) : ''}
`;
```

### Mistake 2: Destructuring state
```typescript
// Also wrong - destructuring clones
const { getViewMode, isMenuOpen } = this.immediateState.app;
```

## Guidelines

1. **Always borrow inline** for values used in templates
2. **Handlers can clone** - they execute later with fresh reads
3. **Transform inline** if needed: `${state.getValue().toUpperCase()}`
4. **Watch for React habits** - this is different from useState patterns
