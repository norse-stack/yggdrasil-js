# Persistent Layer State-Driven Actions Convention

## Overview

Persistent layers manage their own DOM and internal state, operating outside Yggdrasil's reactive rendering system. When using ImmediateState to trigger **actions** (not just read state for display), specific patterns must be followed to avoid race conditions.

## The Rule: Immediate Execution with Early Return

When a persistent layer receives an action trigger via state:

1. **Execute immediately** - no `setTimeout` or deferred execution
2. **Early return** - prevent other `onUpdate` logic from interfering
3. **Version counters** - use incrementing versions to detect "action requested"

## The Pattern

### Wrong: Delayed Execution

```typescript
onUpdate(handle, eventualState, immediateState) {
  const actionVersion = immediateState.tile.getActionVersion();

  // BAD: setTimeout creates race conditions
  if (actionVersion > this.lastActionVersion) {
    this.lastActionVersion = actionVersion;
    setTimeout(() => this.executeAction(), 100);  // Race condition!
  }

  // Other logic continues running...
  // Another onUpdate might fire during the delay...
  // State might change before the action executes...
}
```

### Correct: Immediate with Early Return

```typescript
onUpdate(handle, eventualState, immediateState) {
  const actionVersion = immediateState.tile.getActionVersion();

  // GOOD: Execute immediately and return
  if (actionVersion > this.lastActionVersion && this.canExecute()) {
    this.lastActionVersion = actionVersion;
    this.executeAction();
    return;  // Don't let other logic interfere
  }

  // Rest of onUpdate only runs if no action was triggered
  // ...
}
```

## Why This Matters

### The Race Condition

Yggdrasil's subscription model means `onUpdate` can be called multiple times in quick succession:

```
1. User clicks "Fit to View" button
2. setFitToViewVersion(current + 1) updates ImmediateState
3. Subscription triggers onUpdate
4. onUpdate schedules action with setTimeout(100ms)
5. onUpdate continues running (or another fires)
6. Other logic might re-initialize state, reset positions, etc.
7. 100ms later, action runs with corrupted state
```

### The Solution

By executing immediately and returning early:

```
1. User clicks "Fit to View" button
2. setFitToViewVersion(current + 1) updates ImmediateState
3. Subscription triggers onUpdate
4. onUpdate detects version change, executes action immediately
5. onUpdate returns - no other logic runs this cycle
6. Action completes cleanly with consistent state
```

## The Framework Contract

### The Framework Will:
- Call `onUpdate` whenever subscribed state changes
- Pass current state values (eventualState, immediateState)
- Not make assumptions about what you need

### The Framework Will NOT:
- Debounce calls for you
- Prevent multiple rapid calls
- Manage your internal state

### Your Responsibility:
- Handle all state permutations
- Decide what to skip (early return)
- Clean up properly (old simulations, listeners, timers)
- Be explicit everywhere

## Full Pattern Template

```typescript
class MyPersistentLayer implements PersistentLayerStrategy {
  private lastActionVersion = 0;
  private currentMode: string | null = null;

  onUpdate(handle, eventualState, immediateState) {
    // 1. Read ALL state upfront
    const data = eventualState.tile.getData();
    const mode = immediateState.tile.getMode();
    const actionVersion = immediateState.tile.getActionVersion();

    // 2. Handle actions FIRST (with early return)
    if (actionVersion > this.lastActionVersion && this.simulation) {
      this.lastActionVersion = actionVersion;
      this.executeAction();
      return;  // Isolate action from other logic
    }

    // 3. Detect what changed
    const modeChanged = mode !== this.currentMode;
    const dataChanged = this.hasDataChanged(data);

    // 4. Skip if nothing relevant changed
    if (!modeChanged && !dataChanged) {
      return;
    }

    // 5. Clean up before re-initializing
    if (modeChanged || dataChanged) {
      this.cleanup();
    }

    // 6. Initialize/update
    this.initialize(data, mode);
    this.currentMode = mode;
  }
}
```

## Mental Model

Think of a persistent layer like a **microservice**:
- It receives "events" (`onUpdate` calls) from the framework
- It maintains its own internal state
- It decides how to respond to each event
- It's responsible for its own consistency

This is **freedom with responsibility** - the framework trusts you to do the right thing.

## Common Pitfalls

### Pitfall 1: Assuming Update Order

```typescript
// BAD: Assuming state arrives in a particular order
if (this.simulation && data) {
  // What if simulation doesn't exist yet?
}

// GOOD: Handle all permutations
if (!this.simulation) {
  this.initializeSimulation(data);
} else if (dataChanged) {
  this.updateSimulation(data);
}
```

### Pitfall 2: Forgetting Cleanup

```typescript
// BAD: Creating new simulation without cleanup
const result = this.initializeSimulation(data);
this.simulation = result.simulation;  // Old simulation still running!

// GOOD: Clean up first
this.cleanupSimulation();  // Stop old simulation, clear handlers
const result = this.initializeSimulation(data);
this.simulation = result.simulation;
```

### Pitfall 3: Not Tracking Internal State

```typescript
// BAD: No way to detect mode changes
if (forceMode === "hierarchical") {
  // This runs every onUpdate even if mode didn't change!
}

// GOOD: Track and compare
if (forceMode !== this.currentForceMode) {
  this.currentForceMode = forceMode;
  this.reinitialize();
}
```

## Guidelines

1. **Actions execute immediately** - no `setTimeout`, no `requestAnimationFrame`
2. **Early return after actions** - isolate action handling from normal updates
3. **Track versions for actions** - use incrementing counters, not booleans
4. **Track modes for changes** - compare against stored internal state
5. **Clean up before re-init** - stop simulations, remove listeners, clear timers
6. **Handle all permutations** - don't assume state order or availability

## Related Documents

- [State Borrowing Convention](./01-state-borrowing.md) - How to read state
- [Persistent Layers](../01-systems/03-persistent-layers.md) - Architecture overview
- [Parent-Controlled Rendering](./02-parent-controlled-rendering.md) - Readiness patterns
