# Refs vs Clones in Yggdrasil Rendering

## Overview

When passing state values to Munin templates, you can pass either:
- **Refs (functions):** `this.isLoading` - a function that returns the current value when called
- **Clones (values):** `this.isLoading()` - the evaluated result at call time

Whether this distinction matters depends on **which rendering mode you use**.

## The Three Rendering Modes

```
1. collect() + render()                    → Full re-render every time
2. collectLayers() + renderLayers()        → Only reactive layers re-render
3. collectComponents() + renderComponents() → Only components with changed cache keys re-render
```

## When Does It Matter?

### Mode 1: `collect()` + `render()` - Doesn't Matter

Full re-render every time. All values are re-evaluated because `performRender()` rebuilds everything.

### Mode 2: `collectLayers()` + `renderLayers()` - Usually Doesn't Matter

Only reactive layers re-render, but `performRender()` is still called on every state change. The key insight:

```typescript
// In performRender() - called fresh each time
const { fragments } = munin
  .layer("overlay", munin.cond(this.LoadingOverlay()).when(this.isLoading()))
  //                                                       ↑
  //                                      Called fresh each performRender()
  .collectLayers();
```

Even though `.when(this.isLoading())` passes a boolean (clone), it's a **fresh clone** because `performRender()` is invoked again on state change.

**The reactive flow ensures freshness:**
```
setProcessing(true)
  → notifyListeners("pdfTile.isProcessing")
  → subscription callback triggers rerenderFlow
  → tilingManager.scheduleRender(TILE_ID)
  → performRender() called fresh
  → this.isLoading() evaluated anew
```

### Mode 3: `collectComponents()` + `renderComponents()` - Matters for Cache Keys

This mode only re-renders components whose **cache keys have changed**. If a cache key depends on state that was cloned at the wrong time, you'll get stale renders.

**Safe:** Using cloned values for visibility conditions (`.when()`)
```typescript
// OK - .when() controls visibility, not identity
munin.cond(this.Component()).when(this.isLoading())
```

**Dangerous:** Using cloned values in cache keys
```typescript
// RISKY - if isLoading was cloned before state change, cache key is stale
munin.component("key", { loading: this.isLoading() })
```

For cache keys in Mode 3, prefer refs:
```typescript
// SAFE - ref is evaluated when cache key is computed
munin.component("key", { loading: this.isLoading })  // No parentheses
```

## Summary Table

| Rendering Mode | `.when()` Conditions | Cache Keys |
|---------------|---------------------|------------|
| `collect()` | Clone OK | Clone OK |
| `collectLayers()` | Clone OK | Clone OK |
| `collectComponents()` | Clone OK | **Use Refs** |

## Current PDFTile Implementation

PDFTile uses Mode 2 (`collectLayers()`), so the current implementation is correct:

```typescript
// Derived state as arrow functions (clean pattern)
private isLoading = () => this.immediateState.pdfTile.isProcessing();
private isReady = () => !!this.eventualState.pdfTile.getCurrentPdfDocument() && !this.isLoading();
private isEmpty = () => !this.eventualState.pdfTile.getCurrentPdfDocument() && !this.isLoading();

// Used in performRender() - evaluated fresh each render
.layer("overlay", munin.cond(this.LoadingOverlay()).when(this.isLoading()))
```

The subscription to `pdfTile.isProcessing` ensures `performRender()` is called whenever processing state changes, so the cloned boolean in `.when()` is always fresh.

## Best Practices

1. **For Mode 2 (layers):** Either pattern works, but arrow function properties are cleaner:
   ```typescript
   private isLoading = () => this.immediateState.pdfTile.isProcessing();
   ```

2. **For Mode 3 (components):** Always use refs for cache key values to ensure freshness.

3. **Understand your subscription flow:** The reactive system only works if state changes trigger re-renders. Always verify your subscriptions are set up correctly.

---

## Caveat: Eager Evaluation in `munin.cond()`

There's a subtle but important issue with `munin.cond()` that relates to evaluation order, not refs vs clones.

### The Problem

```typescript
// This CRASHES if PDF is null!
munin.cond(this.PdfPageControls()).when(this.isReady())
//         ↑ EXECUTES FIRST         ↑ CHECKED SECOND (too late!)
```

JavaScript evaluates arguments before passing them to functions. So `this.PdfPageControls()` runs **before** `.when()` can check the condition. If `PdfPageControls` assumes the PDF exists (because it's guarded), it crashes.

### The Solution: Lazy Evaluation with Arrow Functions

```typescript
// SAFE - condition checked first, component only runs if true
munin.cond(() => this.PdfPageControls()).when(this.isReady())
//         ↑ Creates function (cheap)   ↑ If true, THEN call function
```

By wrapping the component in `() =>`, we defer its execution. Inside `munin.cond()`, the condition is checked first, and the component function is only called if the condition is true.

### Why Not Pass Function References Directly?

We explored an alternative syntax:

```typescript
// Alternative: pass function refs without calling
munin.cond(this.PdfPageControls).when(this.isReady)
```

This would work if components were bound with `.bind(this)`:

```typescript
private PdfPageControls = PdfPageControls.bind(this);
```

However, we rejected this approach because:
1. **Inconsistent syntax** - Normal Munin usage is `munin\`${this.Component()}\``, always with `()`
2. **More boilerplate** - Every component needs `.bind(this)` in the class
3. **Confusing DX** - Sometimes `()`, sometimes not, depending on context

The `() =>` approach maintains consistent Munin syntax while solving the evaluation order problem.

### Updated Best Practice

For guarded components in `munin.cond()`, always use lazy evaluation:

```typescript
// PREFERRED: Lazy evaluation - safe for guarded components
munin.cond(() => this.PdfPageControls()).when(this.isReady())
munin.cond(() => this.PdfCanvas()).when(this.isReady())
munin.cond(() => this.LoadingOverlay()).when(this.isLoading())

// LEGACY: Eager evaluation - only safe if component handles null gracefully
munin.cond(this.SimpleComponent()).when(condition)
```

The extra `() =>` is a small price for crash-free conditional rendering.
