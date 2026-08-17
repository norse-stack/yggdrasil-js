# Branch Swapping Requires FlowEngine Sequencing

**Status:** Active Workaround
**Created:** 2024-12-15
**Bug Reference:** `/docs/frontend/yggdrasil/bugs/stable-branch-containers.md`

---

## The Problem

When switching between `munin.match()` or `munin.cond()` branches within the same render cycle, orphan component errors occur and state becomes corrupted.

### Affected Patterns

```typescript
// This BREAKS - synchronous branch swap
const handleClick = () => {
  this.immediateState.app.closeSettingsModal();    // Match goes to "null"
  this.immediateState.app.openStripePaymentModal(); // Match goes to "stripe-payment"
  // Result: Orphan errors, corrupted state
};
```

The issue affects both `munin.match()` and `munin.cond()` - any conditional rendering where you swap from one branch to another within a single handler.

---

## Root Cause

Branch nodes (`match`, `cond`) currently have **no stable DOM container**. When the match value changes:

1. The old branch's DOM is being removed
2. The new branch's DOM is being inserted
3. But there's no stable parent to anchor this operation

If this happens mid-handler (while event code is still executing in the old branch), Munin produces orphan errors.

**See:** `stable-branch-containers.md` for the full technical analysis and planned fix.

---

## The Workaround: FlowEngine Sequencing

Use `FlowEngine` to sequence branch transitions with delays, allowing render cycles to complete between state changes.

### Pattern

```typescript
// In your component (where `this` is ExampleApp or a Tile)
const handleClick = () => {
  this.flowEngine.execute(
    this,
    [
      { action: "closeBranchFlow", delay: 0 },      // Close current branch immediately
      { action: "openNewBranchFlow", delay: 100 },  // Open new branch after 100ms
    ],
    { /* context data */ },
  );
};
```

### Implementation Steps

#### 1. Add FlowEngine to your App/Tile

```typescript
// In ExampleApp.ts or your Tile
import { FlowEngine } from "../yggdrasil/flow/FlowEngine.js";

export class ExampleApp {
  // Add public FlowEngine instance
  public flowEngine = new FlowEngine();

  // ... rest of class
}
```

#### 2. Create Flow Methods

Flow methods are async methods that perform the actual state changes:

```typescript
// Flow method to close the first branch
public async closeBranchFlow(
  context: { someData: any },
  _deps?: any,
): Promise<void> {
  this.immediateState.app.closeSettingsModal();
}

// Flow method to open the second branch
public async openNewBranchFlow(
  context: { someData: any },
  _deps?: any,
): Promise<void> {
  this.immediateState.app.openStripePaymentModal(context.someData);
}
```

#### 3. Call FlowEngine from Handler

```typescript
const handleBuyCredits = () => {
  const creditAmount = 100;
  this.flowEngine.execute(
    this,
    [
      { action: "closeSettingsAndOpenStripeFlow", delay: 0 },
      { action: "openStripePaymentFlow", delay: 100 },
    ],
    { creditAmount },
  );
};
```

---

## Real Example: Settings Modal to Stripe Modal

This workaround was implemented for the "Buy Credits" button in UsageTabContent:

**Before (broken):**
```typescript
const handleBuyCredits = () => {
  this.immediateState.app.closeSettingsModal();
  this.immediateState.app.openStripePaymentModal(100);
};
```

**After (working):**
```typescript
const handleBuyCredits = () => {
  const creditAmount = 100;
  this.flowEngine.execute(
    this,
    [
      { action: "closeSettingsAndOpenStripeFlow", delay: 0 },
      { action: "openStripePaymentFlow", delay: 100 },
    ],
    { creditAmount },
  );
};
```

**Flow methods in ExampleApp:**
```typescript
public async closeSettingsAndOpenStripeFlow(
  context: { creditAmount: number },
  _deps?: any,
): Promise<void> {
  this.immediateState.app.closeSettingsModal();
}

public async openStripePaymentFlow(
  context: { creditAmount: number },
  _deps?: any,
): Promise<void> {
  this.immediateState.app.openStripePaymentModal(context.creditAmount);
}
```

---

## Choosing the Delay

The delay between steps allows the render cycle to complete:

| Delay | Use Case |
|-------|----------|
| `50ms` | Simple state changes, minimal DOM updates |
| `100ms` | Modal swaps, moderate DOM changes (recommended default) |
| `150-200ms` | Complex animations, heavy DOM operations |

Start with `100ms` and adjust if you see flickering or timing issues.

---

## When This Fix Ships

Once `stable-branch-containers.md` is implemented:

1. Branch nodes will have stable DOM containers
2. Child swaps will happen inside these containers
3. Synchronous branch swapping will work correctly
4. This workaround can be removed

**Until then:** Always use FlowEngine for branch-to-branch transitions.

---

## Quick Checklist

When you need to swap branches:

- [ ] Add `FlowEngine` instance to your App/Tile (if not already present)
- [ ] Create separate flow methods for each state change
- [ ] Use `flowEngine.execute()` with appropriate delays
- [ ] First step: `delay: 0` (close/deactivate current branch)
- [ ] Second step: `delay: 100` (open/activate new branch)
- [ ] Pass any needed data via `context` object

---

## Related Documents

- `/docs/frontend/yggdrasil/bugs/stable-branch-containers.md` - The bug and planned fix
- `/docs/frontend/yggdrasil/02-architecture/01-systems/10-state-machine-model.md` - Branch architecture
- PDFTile's `Tile.ts` - More FlowEngine examples for temporal sequences
