# Convention Over Code

> *Why Yggdrasil stays lean by making conventions explicit*

This document explains Yggdrasil's core architectural choice: relying on well-defined conventions rather than framework-enforced constraints.

---

## The Core Insight

Most frameworks add features by adding code. Validation logic, guard rails, configuration systems, runtime checks. Each feature increases the framework's surface area.

Yggdrasil inverts this:

```
Framework complexity ∝ 1 / (convention clarity)
```

The clearer your conventions, the less code you need.

---

## What This Means

### Traditional Framework Approach

```typescript
// Framework enforces constraints via code
class Tile {
  private validateStateAccess(key: string) {
    if (!this.allowedKeys.includes(key)) {
      throw new Error(`Tile cannot access ${key}`);
    }
  }

  private enforceLayerOrder(layers: Layer[]) {
    // Runtime validation of layer z-indices
  }

  private checkRenderingContext() {
    // Ensure we're in valid render phase
  }
}
```

More safety, but also:
- More code to maintain
- More runtime overhead
- More edge cases to handle
- More API surface to learn

### Yggdrasil Approach

```typescript
// Framework provides primitives
class Tile extends BaseTile {
  // That's it. Conventions define how to use them.
}
```

The "enforcement" lives in documentation and developer understanding, not code.

---

## The Geometric Connection

This connects directly to the [coupling coefficient (κ)](../02-architecture/02-patterns/02-cross-tile-communication.md) from cross-tile communication:

**Explicit code constraints** = brute-force constraints in the code itself
- Runtime checks, type guards, validation
- Cost: complexity, overhead, rigidity

**Implicit conventions** = geometric constraints that limit the solution space
- Developers internalize the patterns
- Cost: requires understanding, can drift without discipline

When you establish that "tiles are orthogonal basis vectors" as a convention, you don't need code to *enforce* orthogonality - developers think in those terms. The κ coefficient becomes a mental tool, not a runtime calculation.

---

## Why This Works for Yggdrasil

### 1. Small, Focused Primitives

Yggdrasil provides:
- **Munin** - Template literals → DocumentFragments
- **ImmediateState** - Synchronous, frontend-authoritative state
- **EventualState** - Async, backend-authoritative state
- **Layers** - Named z-ordered rendering slots
- **Tiles** - Composable application units

That's the framework. Everything else is convention.

### 2. Conventions Are Documented, Not Coded

Instead of:
```typescript
// Framework prevents this at runtime
tile.readState(otherTile.stateKey); // throws: CrossTileStateAccessError
```

We document:
> Tiles should not read each other's state directly. Use AppCoordinator subscriptions (Level 1) or tile extensions (Level 2). See [Cross-Tile Communication](../02-architecture/02-patterns/02-cross-tile-communication.md).

### 3. Flexibility When You Need It

Code constraints are binary - allowed or not. Conventions can be bent intentionally:

```typescript
// This violates the "tiles don't know each other" convention
// But we're doing it intentionally, in an override file, with full awareness
class PDFTile extends BasePDFTile {
  performRender() {
    const graphFrozen = this.immediateState.graphTile?.isFrozen();
    // We accept the coupling cost (κ ≈ 0.3) for this specific need
  }
}
```

The framework doesn't stop you. The convention tells you the cost.

---

## The Tradeoff

### What You Gain

- **Minimal framework surface** - Less to learn, less to break
- **No runtime overhead** - No validation, no guards, no checks
- **Maximum flexibility** - Bend rules when you understand the cost
- **Faster iteration** - Change conventions without changing framework code

### What You Pay

- **Discipline required** - No guardrails means you can go off the road
- **Documentation is essential** - Conventions only work if documented
- **Onboarding investment** - New developers must internalize patterns
- **Drift risk** - Undocumented variations can creep in

---

## How We Mitigate the Risks

### 1. Explicit Convention Documentation

Every convention has a document:
- [State Borrowing](../02-architecture/03-conventions/01-state-borrowing.md) - Inline access, don't clone
- [Parent-Controlled Rendering](../02-architecture/03-conventions/02-parent-controlled-rendering.md) - Parents gate children
- [Specificity Over Reusability](../02-architecture/03-conventions/03-specificity-over-reusability.md) - Components are specific

### 2. The MCP Server

The Yggdrasil MCP server provides AI agents (and developers) with:
- Current convention documentation
- Real tile implementations as examples
- Consistent, up-to-date guidance

This creates a feedback loop: documentation → MCP → development → documentation.

### 3. Clear Architectural Boundaries

The [component hierarchy](../02-architecture/02-patterns/01-component-patterns.md) makes ownership explicit:
```
App → Tiles → Components → UI Elements
```

Each level has clear responsibilities. Conventions define how they interact.

### 4. Mathematical Foundations

The geometric model (κ, orthogonality, composition space) gives conventions a formal basis. It's not just "this feels right" - it's "this preserves 95% of your composition space."

---

## When to Add Framework Code vs Convention

| Add Framework Code When | Add Convention When |
|------------------------|---------------------|
| Violation causes silent bugs | Violation causes obvious bugs |
| Pattern is universal and non-negotiable | Pattern has valid exceptions |
| Runtime detection is necessary | Static analysis or review catches it |
| Cost of violation is catastrophic | Cost is understood coupling |

**Example - Framework code:**
- HTML escaping in Munin (XSS is silent and catastrophic)

**Example - Convention:**
- Tiles not reading each other's state (coupling is visible and sometimes intentional)

---

## Summary

Yggdrasil's power comes from well-defined conventions, not extensive framework code:

1. **Primitives are minimal** - Munin, State, Layers, Tiles
2. **Conventions are explicit** - Documented, reasoned, with known costs
3. **Flexibility is preserved** - Bend rules when you understand the tradeoff
4. **Documentation is essential** - The MCP server keeps it accessible

The framework stays lean. The patterns stay clear. The developers stay empowered.

---

## Related Documents

- [Design Principles](./01-design-principles.md) - Core philosophy
- [Cross-Tile Communication](../02-architecture/02-patterns/02-cross-tile-communication.md) - Coupling coefficient (κ)
- [Component Patterns](../02-architecture/02-patterns/01-component-patterns.md) - The 4-tier hierarchy
- [State Borrowing](../02-architecture/03-conventions/01-state-borrowing.md) - Example convention
