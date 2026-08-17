# Yggdrasil

> **Early public preview.** This framework is extracted from a working application and is published as-is: the API is not stable, there is no npm release yet, and no support commitment is implied. Issues and questions are welcome; expectations should be calibrated accordingly.

Yggdrasil is a frontend framework born from a simple observation: **frontend state management is a distributed systems problem.** Everything else follows from taking that seriously.

**Core principles** (the paradigm shifts):

1. **Frontend as distributed systems** — respect the problem
2. **State orthogonal to DOM** — state is just data; the DOM is a projection of it
3. **Ownership & borrowing** — one owner, many borrowers, live references over stale clones

**Design decisions** (derived from the principles):

4. **Shortest path resolution** — resolve every state change via the minimal path
5. **Eventual consistency** — game-loop rendering; convergent state

**Guiding opinions** (stylistic choices):

6. **Convention over configuration** — trust the developer, stay minimal (~10kb gzipped)

The *why* behind each lives in [Design principles](docs/01-philosophy/01-design-principles.md).

## Getting started

```bash
make build   # npm install + tsc -> ts/core/dist
make test    # vitest unit tests
```

The package is consumed from `ts/core` (e.g. via a `file:` dependency); its exports resolve from `dist/`, so build first.

## Yggdrasil in the wild

[bragi-io.com/app](https://bragi-io.com/app) — the Bragi document-parsing platform's frontend — runs on Yggdrasil: tiles, layers, the authority-split state system, and the game-loop renderer, in production.

## Documentation

The docs are the primary artifact of this preview:

- [Design principles](docs/01-philosophy/01-design-principles.md) — the *why*
- [Convention over code](docs/01-philosophy/02-convention-over-code.md)
- [Architecture overview](docs/02-architecture/00-overview.md) — the map of the actors
- Systems, patterns, conventions, and caveats under [docs/02-architecture/](docs/02-architecture/)

## License

Dual-licensed under either of

- MIT license ([LICENSE-MIT](LICENSE-MIT))
- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))

at your option.
