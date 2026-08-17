# Yggdrasil

> **Early public preview.** This framework is extracted from a working application and is published as-is: the API is not stable, there is no npm release yet, and no support commitment is implied. Issues and questions are welcome; expectations should be calibrated accordingly.

Yggdrasil is a frontend framework built around one question: **who has the authority to say a piece of state is true?** Nearly every architectural decision is that answer expressed in a different subsystem.

- **State split by authority.** `ImmediateState` is frontend-authoritative: synchronous, instant, cannot fail. `EventualState` is backend-authoritative: asynchronous, may fail, needs confirmation. The seam most frameworks hide behind a uniform cache surface is load-bearing here.
- **Orchestration over choreography.** Cross-cutting flows live in one named place (the `AppCoordinator`), not in an event soup where every component reacts to every other.
- **Game-loop rendering.** Tiles converge at a fixed cadence with dirty-flag scheduling — batching is free, cascades cannot stampede, and eventual consistency on a 16ms horizon replaces hydration machinery.
- **No virtual DOM, no signal graph.** The template engine (Munin) hashes interpolated values into cache keys *while assembling the HTML* — the diff input is a free byproduct of rendering, not a parallel structure to keep consistent. Only leaves whose keys changed touch the DOM.
- **Tiles and layers.** Apps compose from tiles (self-registering units that own their state and adapt to their container) stacked in explicit z-ordered layers — reactive, static, or persistent (D3 graphs and canvases survive re-renders).

## Getting started

```bash
make build   # npm install + tsc -> ts/core/dist
make test    # vitest unit tests
```

The package is consumed from `ts/core` (e.g. via a `file:` dependency); its exports resolve from `dist/`, so build first.

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
