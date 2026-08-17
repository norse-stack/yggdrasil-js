# Yggdrasil

> The world tree that connects all realms.

A frontend framework for intelligent applications. Treats frontend state management as a distributed systems problem.

## Installation

```bash
# Local development (from monorepo)
npm install

# Eventually (when published)
npm install yggdrasil-js
```

## Core Concepts

- **Munin**: Template engine using tagged template literals
- **ImmediateState**: Frontend-authoritative synchronous state
- **EventualState**: Backend-authoritative async state
- **AppCoordinator**: Cross-tile communication hub
- **TilingManager**: Multi-tile rendering orchestration

## Project Structure

```
src/
├── munin/          # Template engine
├── state/          # State management
├── tiling/         # Tile orchestration
├── layer/          # Rendering system
├── adapters/       # Platform adapters (web, Tauri, etc.)
├── skeleton/       # SSR support
└── index.ts        # Main exports
```

## Philosophy

See the [Design Principles](../../yggdrasil-mcp/docs/01-foundations/01-philosophy/01-design-principles.md) for the full philosophy.

**TL;DR:**
1. Frontend as Distributed Systems
2. State Orthogonal to DOM
3. Ownership & Borrowing (Rust-inspired)
4. Eventual Consistency (game loop rendering)
5. Convention Over Configuration

## License

MIT
