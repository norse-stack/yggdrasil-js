# The State Machine Model

> *Munin is a state machine engine that happens to render DOM*

This document reframes Yggdrasil's rendering system as **state machine composition**. Understanding this model clarifies architectural decisions and explains why certain patterns work better than others.

---

## The Core Insight

React and similar frameworks encourage "template thinking" - you write JSX/HTML-like structures that describe what to render. But complex applications aren't templates. They're **state machines with conditional flows**.

The problem with template thinking:

```jsx
// React: Template that hides a state machine
function App() {
  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorPage />;
  if (!user) return <LoginForm />;
  if (user.role === 'admin') return <AdminDashboard />;
  return <HomePage />;
}
```

To understand this code, you must trace through each component, discovering more conditionals nested inside. This is "Component Archaeology" - excavating layers of abstraction to understand what your application actually does.

**Yggdrasil's approach:** Make the state machine explicit. The decision tree IS the code.

```typescript
// Yggdrasil: Explicit state machine
munin.match(this.getAppState())
  .case('loading', () => this.LoadingSpinner())
  .case('error', () => this.ErrorPage())
  .case('unauthenticated', () => this.LoginForm())
  .case('admin', () => this.AdminDashboard())
  .default(() => this.HomePage())
```

Every possible state is visible in one place. No archaeology required.

---

## The Abstraction Gradient

A key insight: **as you descend the component hierarchy, your concerns shift**.

```
HIGH ABSTRACTION (Yapp/Tile)          LOW ABSTRACTION (Leaf)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

State Machine Logic                   Rendering Concerns
"What are the possible states?"       "What pixels do we draw?"
"When do we show what?"               "How do we update efficiently?"

Branches, decision points             Leaves, reactive endpoints
Architectural comprehension           Visual output

munin.match(state)                    munin`<button>${label}</button>`
  .case('A', ...)
  .case('B', ...)
```

At the **Yapp and Tile level**, you're primarily designing a state machine - routing between major application states, defining what's possible.

At the **leaf level**, you're primarily concerned with rendering - what DOM to produce, what styles to apply, what text to show.

This gradient is natural. Don't fight it. Embrace that different levels of your application have different primary concerns.

---

## The Three Fundamental Node Types

Every node in a Yggdrasil application is one of three types:

### 1. Branch Slot (Layer)

A **fixed position** in the rendering tree. Layers are registered with z-indices and provide slots where content can be placed.

```typescript
munin.registerLayers(TILE_ID, {
  10:  { name: 'background', layer_type: 'static' },
  50:  { name: 'content',    layer_type: 'reactive', flow: 'y' },
  100: { name: 'overlay',    layer_type: 'reactive' }
});
```

Think of layers as **reserved channels** in your state machine. The background channel, the content channel, the overlay channel. Each runs independently.

### 2. Decision Point (Branch)

A **routing node** that directs flow based on state. Branches don't render anything themselves - they delegate to sub-branches or leaves.

```typescript
// .match() - Multi-way branch
munin.match(this.getOverlayState())
  .case('settings', () => this.SettingsModal())
  .case('confirm', () => this.ConfirmDialog())
  .case('error', () => this.ErrorModal())
  .default(() => munin``)

// .cond().when().else() - Binary branch
munin.cond(() => this.DocumentViewer())
  .when(this.hasDocument())
  .else(() => this.EmptyState())
```

Branches are **lazy** - only the winning path executes. This is both a performance optimization and a clarity feature.

### 3. Reactive Endpoint (Leaf)

A **terminal node** that produces actual DOM. Leaves contain the variables that trigger surgical updates.

```typescript
// Simple leaf
munin`<button onclick=${handleClick}>${label}</button>`

// Leaf with reactive content
munin`<span class="page-number">Page ${this.getCurrentPage()}</span>`
```

Leaves are where **cache keys are calculated**. When variables inside a leaf change, that leaf (and only that leaf) is surgically updated.

---

## The Tree Grammar

What can grow on what? Here's the formal structure:

```
Yapp        ::= Layer+
Tile        ::= Layer+
Layer       ::= Branch | Leaf
Branch      ::= Match | Cond | Component
Match       ::= match(state) { Case+ }
Cond        ::= cond(Leaf | Branch).when(condition).else(Leaf | Branch)
Case        ::= case(value, Leaf | Branch)
Component   ::= (Branch | Leaf)+
UIElement   ::= Leaf | LeafContainer
LeafContainer ::= munin`...${Leaf}+...`
Leaf        ::= munin`...${variable}*...`
```

### Visual Representation

```
Yapp (Root State Machine)
  │
  ├─ Layer [background]              ← Branch Slot
  │    └─ munin`<div class="bg"/>`   ← Leaf (static)
  │
  ├─ Layer [content]                 ← Branch Slot
  │    │
  │    └─ .match(contentState)       ← Decision Point (Branch)
  │         │
  │         ├─ case 'loading'
  │         │    └─ LoadingSpinner() ← Leaf
  │         │
  │         ├─ case 'ready'
  │         │    └─ Tile [PDFTile]   ← Sub-State Machine
  │         │         │
  │         │         ├─ Layer [canvas]
  │         │         │    └─ ...
  │         │         │
  │         │         └─ Layer [controls]
  │         │              └─ .match(mode)  ← Nested Branch
  │         │                   ├─ case 'view' → ViewControls()
  │         │                   └─ case 'edit' → EditControls()
  │         │
  │         └─ case 'error'
  │              └─ ErrorState()     ← Leaf
  │
  └─ Layer [overlay]                 ← Branch Slot
       │
       └─ .match(modalState)         ← Decision Point
            ├─ case 'settings' → SettingsModal()
            ├─ case 'confirm'  → ConfirmDialog()
            └─ default         → munin``  (empty leaf)
```

---

## Components and UI Elements in the Model

### Components = Named Sub-Branches

Components are **named, overridable sub-branches**. They encapsulate a portion of the state machine that can be replaced via inheritance.

```typescript
// Component can contain branches and leaves
function PdfToolbar(this: PDFTile) {
  return munin`
    <div class="toolbar">
      ${munin.cond(() => this.ZoomControls())
        .when(this.supportsZoom())}
      ${this.PageNavigation()}  ← Sub-branch
      ${this.ActionButtons()}   ← Sub-branch
    </div>
  `;
}
```

The "named" part is crucial - because it's a method on the tile, subclasses can override it:

```typescript
class CustomPDFTile extends PDFTile {
  // Replace just this branch of the state machine
  private PdfToolbar() {
    return munin`<div class="custom-toolbar">...</div>`;
  }
}
```

### UI Elements = Pure Leaves (or Leaf Containers)

UI Elements have **no state access**, so they cannot introduce new branches based on application state. They're either:

**Pure Leaf** - Single reactive unit:
```typescript
function Button({ label, onClick }) {
  return munin`<button onclick=${onClick}>${label}</button>`;
}
```

**Leaf Container** - Stable wrapper around reactive leaves:
```typescript
function ButtonGroup({ buttons }) {
  return munin`
    <div class="button-group">
      ${buttons.map(b => munin`<button>${b.label}</button>`)}
    </div>
  `;
  // Outer munin = stable container (branch-like stability)
  // Inner munins = reactive leaves
}
```

---

## The Cache Key Principle

Understanding branches vs leaves explains cache key behavior:

### Problem: Variable Pollutes Branch

```typescript
// BAD: someVar changes → entire branch re-renders
munin`
  <div class="modal">
    ${this.someVar}      ← Variable in branch scope
    ${Component1()}      ← Re-renders unnecessarily
    ${Component2()}      ← Re-renders unnecessarily
  </div>
`
```

### Solution: Isolate as Leaf

```typescript
// GOOD: someVar changes → only its leaf re-renders
munin`
  <div class="modal">
    ${munin`${this.someVar}`}  ← Isolated leaf
    ${Component1()}            ← Stable
    ${Component2()}            ← Stable
  </div>
`
```

**State machine framing:** The outer `munin` becomes a **stable branch node** - it routes to children but doesn't change itself. The inner `munin` becomes a **reactive leaf** - it's the terminal node that actually updates.

### Rule of Thumb

- Variables at **branch level** → destabilize the branch (everything re-renders)
- Variables at **leaf level** → surgical updates (only that leaf re-renders)

When you want stability, push variables down into leaves. When you want wholesale replacement (showing a completely different UI), let the variable live at branch level.

---

## Layer Types as Branch Strategies

The three layer types map to different branch behaviors:

| Layer Type | Branch Behavior | Use Case |
|------------|-----------------|----------|
| `reactive` | Re-evaluates every render cycle | Dynamic content, forms, controls |
| `static` | Re-evaluates on interval (5s) | Rarely-changing content, chrome |
| `persistent` | Never re-renders (strategy owns DOM) | Canvas, D3, WebGL |

**Persistent layers** are an escape hatch from the state machine model. The layer provides a "shell" (a degenerate leaf that renders once), and an external strategy manages the DOM directly.

```
Layer [persistent]
  └─ Shell (static leaf)
       └─ Strategy (external DOM management)
           └─ [outside Munin's tree]
```

---

## Practical Application: Reading a Tile

With the state machine model, reading a tile becomes straightforward:

```typescript
performRender() {
  return munin
    .inTile(TILE_ID)

    // Branch slot: background
    .layer('background',
      munin`<div class="tile-bg"></div>`  // Leaf (static)
    )

    // Branch slot: content
    .layer('content',
      munin.match(this.getContentState())  // Decision point
        .case('empty', () => this.EmptyState())       // → Leaf
        .case('loading', () => this.LoadingState())   // → Leaf
        .case('ready', () => this.DocumentViewer())   // → Sub-branch
        .case('error', () => this.ErrorState())       // → Leaf
    )

    // Branch slot: controls
    .layer('controls',
      munin.cond(() => this.ControlBar())  // Binary decision
        .when(this.hasDocument())
    )

    // Branch slot: overlay
    .layer('overlay',
      munin.match(this.getModalState())    // Decision point
        .case('settings', () => this.SettingsModal())
        .case('help', () => this.HelpModal())
        .default(() => munin``)            // Empty leaf
    )

    .collectComponents();
}
```

Reading this code, you immediately know:
- There are 4 branch slots (layers)
- Content can be in 4 states: empty, loading, ready, error
- Controls only appear when there's a document
- Two modals are possible: settings and help

**No archaeology required.** The state machine IS the documentation.

---

## Summary

| Concept | What It Is | Primary Concern |
|---------|------------|-----------------|
| **Yapp/Tile** | Root state machine | Architectural flow |
| **Layer** | Branch slot (z-ordered) | Spatial organization |
| **Branch** | Decision point (match/cond) | State routing |
| **Component** | Named sub-branch | Reusable/overridable logic |
| **UI Element** | Pure leaf or leaf container | Presentation |
| **Leaf** | Reactive endpoint | DOM output |

**The abstraction gradient:**
- High (Yapp/Tile): State machine logic - "what are the possible states?"
- Middle (Component): Mixed - routing + rendering
- Low (Leaf): Rendering - "what pixels do we draw?"

**The key insight:** Munin isn't a template engine that happens to support conditionals. It's a **state machine engine** that happens to render DOM. When you embrace this framing, your code becomes self-documenting, your architecture becomes visible, and "Component Archaeology" becomes unnecessary.

---

## Related Documents

- [Rendering System](./02-rendering-system.md) - Progressive rendering levels
- [Component Patterns](../02-patterns/01-component-patterns.md) - The four-tier hierarchy
- [Convention Over Code](../../01-philosophy/02-convention-over-code.md) - Why explicit beats implicit
