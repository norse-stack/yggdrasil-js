# Yggdrasil Design Principles

> *The world tree that connects all realms*

Yggdrasil is a frontend framework born from a simple observation: **frontend state management is a distributed systems problem**. By accepting this reality rather than hiding from it, we unlock elegant solutions that feel natural rather than forced.

This document describes the philosophical foundation of Yggdrasil. Understanding these principles will help you work *with* the framework rather than against it.

---

## Who Is This For?

Yggdrasil is designed for developers who:
- Are comfortable reasoning about state, ownership, and data flow
- Want explicit control over their application architecture
- Prefer understanding *why* things work over memorizing *how* to use them
- Value simplicity and small bundle sizes (~10kb gzipped)

If you're looking for guardrails and hand-holding, this may not be the right fit. Yggdrasil trusts you to know what you're doing.

---

## Core Principles

These are the paradigm shifts that define Yggdrasil. They represent fundamentally different ways of thinking about frontend development.

### 1. Frontend as Distributed Systems

> *Respect the problem*

Traditional frontend thinking treats state management as a UI problem: "How do I keep my components in sync?" This framing leads to increasingly complex solutions (state libraries, context providers, effect systems) that fight against the underlying reality.

**Yggdrasil's insight**: Frontend applications *are* distributed systems. You have:
- Multiple sources of truth (local state, server state, URL state)
- Asynchronous communication (API calls, websockets)
- Consistency challenges (stale data, optimistic updates, conflicts)
- Failure modes (network errors, race conditions)

Backend engineers have dealt with these problems for decades. They don't pretend distributed systems are simple—they build architectures that acknowledge the complexity.

Yggdrasil applies the same honest approach to frontend. When you take this lens seriously, many problems that seem intractable suddenly have natural solutions.

### 2. State Orthogonal to DOM

> *State is just data. DOM is just rendering.*

In most frontend frameworks, state and UI are entangled. React's `useState` lives inside components. Vue's reactivity is bound to templates. This coupling creates confusion about what state actually *is* and who owns it.

**Yggdrasil's approach**: State exists independently, structured for the problem domain—exactly like any backend service would structure its data. The DOM is merely a *side-effect* of state, a visual projection of the current truth.

```
┌─────────────────────────────────────────┐
│              State Layer                │
│  (structured for the problem domain)    │
└─────────────────────────────────────────┘
                    │
                    │ render (pure side-effect)
                    ▼
┌─────────────────────────────────────────┐
│              DOM Layer                  │
│    (visual projection of state)         │
└─────────────────────────────────────────┘
```

This separation means:
- State can be reasoned about without thinking about UI
- UI can be reasoned about as a pure function of state
- Testing state logic requires no DOM
- Refactoring UI doesn't touch state logic

### 3. Ownership & Borrowing

> *One owner, many borrowers. Live references, not stale clones.*

In distributed systems, unclear ownership leads to chaos. Who is the source of truth? Who can modify what? How do you avoid conflicts?

**Yggdrasil's model** (inspired by Rust):
- Every piece of state has exactly **one owner**
- Other parts of the application can **borrow** state (read access)
- Only the owner can **mutate** state
- We always work with **live references**, never stale clones

```
┌─────────────────────────────────────────┐
│           AppCoordinator                │
│         (owns all state)                │
│                                         │
│   ┌─────────────┐   ┌─────────────┐    │
│   │ TileA State │   │ TileB State │    │
│   │  (owned)    │   │  (owned)    │    │
│   └─────────────┘   └─────────────┘    │
└─────────────────────────────────────────┘
         │                   │
         │ borrow            │ borrow
         ▼                   ▼
    ┌─────────┐         ┌─────────┐
    │ TileA   │         │ TileB   │
    │ (reads) │         │ (reads) │
    └─────────┘         └─────────┘
```

Why no clones? Because **any clone immediately becomes a stale reference**. If TileA clones some state and TileB modifies the original, TileA now has outdated data. By always borrowing live references, we eliminate an entire class of synchronization bugs.

---

## Design Decisions

These decisions flow naturally from the core principles. They're important architectural choices, but they're derived from the thinking above rather than being foundational themselves.

### 4. Shortest Path Resolution (The Markov Tree)

> *Always resolve state changes via the shortest possible path*

When a DOM event occurs (user clicks a button), it triggers a chain of state changes that eventually resolves. This chain forms a tree:

```
        [DOM Event]              ← Leaf (where events originate)
             │
             ▼
      [ImmediateState]           ← Frontend authority
             │
             ▼
      [EventualState]            ← Backend authority (may be cached)
             │
             ▼
      [AppCoordinator]           ← Coordinates complex flows
             │
             ▼
      [Services/Backend]         ← Root (external systems)
```

Different events require different depths of resolution:
1. **Immediate**: User toggles a panel → ImmediateState handles it directly
2. **Cached**: Fetch user data → EventualState returns cached response
3. **Full roundtrip**: Submit form → All the way to backend and back

Yggdrasil is designed to always take the **shortest path** necessary. Don't go to the backend if cache suffices. Don't coordinate multiple states if one state change resolves it. This is the "Markov" property—each step only depends on current state, and we stop as soon as we reach resolution.

### 5. Eventual Consistency (Game Loop Rendering)

> *If one frame misses something, the next frame catches it*

Rather than blocking on perfect renders or complex synchronization, Yggdrasil uses a game-engine-style render loop:

1. State changes set a "dirty" flag
2. Render loop runs at 60fps
3. Each frame checks for dirty state and re-renders if needed
4. If a render misses an update, the next frame will catch it

This approach enables:
- **Staggered rendering**: Different tiles can render on offset schedules
- **Load distribution**: Expensive updates spread across frames
- **Resilience**: No single missed update breaks the application

We accept eventual consistency in exchange for simplicity and performance. The UI will always *converge* to the correct state, even if it takes a frame or two.

---

## Guiding Opinions

These are stylistic choices that shape the developer experience.

### 6. Convention Over Configuration

> *Simple implicit rules beat complex explicit guardrails*

Yggdrasil is deliberately minimal. We don't provide:
- Complex type hierarchies
- Extensive configuration options
- Guardrails against every possible mistake

Instead, we provide:
- Clear conventions to follow
- Small, understandable APIs
- Trust in the developer

This keeps the framework at ~10kb gzipped and makes it possible to understand the entire system. If something seems hard, you're probably fighting the conventions rather than following them.

---

## What Yggdrasil Is NOT

To fully understand Yggdrasil, it helps to contrast it with common frontend mental models:

| Aspect | React/Vue Model | Yggdrasil Model |
|--------|-----------------|-----------------|
| State location | Lives in components | Lives in dedicated state layer |
| State updates | Trigger re-renders | Set dirty flags, loop renders |
| DOM relationship | Virtual DOM diffing | DOM as pure side-effect |
| Data flow | Props down, events up | Borrow from owner, mutate via owner |
| Consistency model | Synchronous renders | Eventual consistency |
| Philosophy | Declarative UI | Distributed systems |

Yggdrasil is not "React but different." It's a fundamentally different way of thinking about frontend applications. The patterns that work in React may not translate directly—and that's intentional.

---

## Summary

**Core Principles** (the paradigm shifts):
1. Frontend as Distributed Systems — Respect the complexity
2. State Orthogonal to DOM — Clean separation of concerns
3. Ownership & Borrowing — Clear authority, live references

**Design Decisions** (derived from principles):
4. Shortest Path Resolution — Take the minimal path to resolve state changes
5. Eventual Consistency — Game loop rendering, convergent state

**Guiding Opinions** (stylistic choices):
6. Convention Over Configuration — Trust the developer, stay minimal

---

## Next Steps

With the philosophy understood, you're ready to explore the architecture:
- [Architecture Overview](../02-architecture/00-overview.md) — How the pieces fit together
- [State System](../02-architecture/01-systems/01-state-system.md) — ImmediateState & EventualState
- [Rendering System](../02-architecture/01-systems/02-rendering-system.md) — Layers, Munin, and the render loop
