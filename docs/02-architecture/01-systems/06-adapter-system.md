# Adapters and Services Deep Dive

> *Platform abstraction and business logic separation*

This document explains how Yggdrasil handles cross-platform deployment through adapters and services: what they are, when to use each, and how they enable running the same code on web, desktop, and mobile.

---

## The Fundamental Distinction

```
┌──────────────────────────────────────────────────────────────────┐
│                        APPLICATION                                │
│                  (Tiles, Components, UI)                          │
└────────────────────────────┬─────────────────────────────────────┘
                             │ uses
┌────────────────────────────▼─────────────────────────────────────┐
│                       EventualState                               │
│                   (Side-Effects Boundary)                         │
├───────────────────────────────────────────────────────────────────┤
│  SERVICES (Business Logic)                                        │
│  - Same across all platforms                                      │
│  - Stateful, complex coordination                                 │
│  - cacheService, stripeService, authService                       │
├───────────────────────────────────────────────────────────────────┤
│  ADAPTERS (Platform Abstraction)                                  │
│  - Hot-swapped per build target                                   │
│  - Stateless platform wrappers                                    │
│  - __fileAdapter, __apiAdapter, __storageAdapter                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │ controls
┌────────────────────────────▼─────────────────────────────────────┐
│                     HARDWARE / PLATFORM                           │
│           (Browser APIs, Tauri APIs, Capacitor APIs)              │
└───────────────────────────────────────────────────────────────────┘
```

---

## Adapters: Platform Abstraction Layer

### What Are Adapters?

Adapters are **stateless wrappers** that abstract platform-specific I/O operations. They present a consistent interface to the application while the actual implementation changes per build target.

### Adapter Characteristics

| Property | Value |
|----------|-------|
| State | Stateless (no internal state) |
| Logic | Minimal (just translate calls to platform APIs) |
| Selection | Compile-time (build tool chooses implementation) |
| Naming | `__` prefix (indicates "low-level, prefer services") |

### Core Adapter Interfaces

#### FileAdapter

```typescript
interface FileAdapter {
  readFile(file: File): Promise<ArrayBuffer>;
}
```

**Platform implementations:**

```typescript
// Web (Browser File API)
const webFileAdapter: FileAdapter = {
  readFile: async (file: File) => await file.arrayBuffer()
};

// Desktop (Tauri filesystem)
const desktopFileAdapter: FileAdapter = {
  readFile: async (filePath: string) => {
    const { readBinaryFile } = await import('@tauri-apps/api/fs');
    return await readBinaryFile(filePath);
  }
};
```

#### ApiAdapter

```typescript
interface ApiAdapter {
  get(url: string): Promise<any>;
  post(url: string, data: any): Promise<any>;
  uploadFile(file: File, endpoint: string): Promise<any>;
}
```

**Platform implementations:**

```typescript
// Web (Fetch API)
const webApiAdapter: ApiAdapter = {
  get: async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  },

  post: async (url: string, data: any) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  },

  uploadFile: async (file: File, endpoint: string) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });
    return await response.json();
  }
};

// Desktop (Tauri HTTP)
const desktopApiAdapter: ApiAdapter = {
  get: async (url: string) => {
    const { fetch } = await import('@tauri-apps/api/http');
    const response = await fetch(url, { method: 'GET' });
    return response.data;
  },

  post: async (url: string, data: any) => {
    const { fetch } = await import('@tauri-apps/api/http');
    const response = await fetch(url, {
      method: 'POST',
      body: data
    });
    return response.data;
  }
};
```

#### StorageAdapter

```typescript
interface StorageAdapter {
  save(key: string, data: any): Promise<void>;
  load(key: string): Promise<any>;
  remove(key: string): Promise<void>;
}
```

**Platform implementations:**

```typescript
// Web (localStorage)
const webStorageAdapter: StorageAdapter = {
  save: async (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
  },

  load: async (key: string) => {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  },

  remove: async (key: string) => {
    localStorage.removeItem(key);
  }
};

// Desktop (Tauri Store)
const desktopStorageAdapter: StorageAdapter = {
  save: async (key: string, data: any) => {
    const { Store } = await import('@tauri-apps/plugin-store');
    const store = new Store('app.dat');
    await store.set(key, data);
    await store.save();
  },

  load: async (key: string) => {
    const { Store } = await import('@tauri-apps/plugin-store');
    const store = new Store('app.dat');
    return await store.get(key);
  }
};
```

---

## Services: Business Logic Layer

### What Are Services?

Services encapsulate **complex business logic**, coordination flows, and cross-cutting concerns. They're platform-agnostic and use adapters internally for platform operations.

### Service Characteristics

| Property | Value |
|----------|-------|
| State | May have internal state (caches, configs) |
| Logic | Complex (retry logic, fallbacks, validation) |
| Platforms | Same implementation across all platforms |
| Types | Framework services vs External services |

### Two Types of Services

#### Framework Services

Built into Yggdrasil, capture rich metadata for debugging/optimization:

- `cacheService` - Caching with fallback chains
- `routingService` - URL/route management

**What gets captured:**
- Operation timing and performance
- Cache hit rates and sources
- Success/failure patterns

#### External Services

App-specific, privacy-first (only timing, no payload data):

- `stripeService` - Payment processing
- `authService` - Authentication

**What gets captured:**
- Operation timing
- Success/failure status
- **Never**: request payloads, user data, payment details

---

## ServiceResult Pattern

All services return standardized results:

```typescript
interface ServiceResult<TData = any> {
  success: boolean;
  data?: TData;
  error?: Error;
  metadata: {
    operationName: string;
    duration: number;
    timestamp: number;
  };
}
```

**Helper functions:**

```typescript
function createSuccessResult<T>(
  operationName: string,
  data: T,
  startTime: number,
  additionalMetadata?: Record<string, any>
): ServiceResult<T> {
  return {
    success: true,
    data,
    metadata: {
      operationName,
      duration: Date.now() - startTime,
      timestamp: startTime,
      ...additionalMetadata,
    },
  };
}

function createErrorResult(
  operationName: string,
  error: Error,
  startTime: number
): ServiceResult<never> {
  return {
    success: false,
    error,
    metadata: {
      operationName,
      duration: Date.now() - startTime,
      timestamp: startTime,
    },
  };
}
```

---

## Example: CacheService (Framework)

```typescript
export class CacheService implements ServiceInterface {
  readonly name = 'cache';
  readonly type = 'framework' as const;

  private cache = new Map<string, CacheEntry>();

  constructor(
    private storageAdapter: StorageAdapter,
    private apiAdapter: ApiAdapter,
  ) {}

  /**
   * Get value with automatic fallback chain:
   * 1. Memory cache
   * 2. Persistent storage
   * 3. API (if fallbackUrl provided)
   */
  async get<T>(key: string, options: CacheOptions = {}): Promise<ServiceResult<T>> {
    const startTime = Date.now();

    try {
      // Check memory cache
      const cached = this.cache.get(key);
      if (cached && !this.isStale(cached, options.maxAge)) {
        return createSuccessResult('cache:get', cached.value, startTime, {
          cacheHit: true,
          source: 'memory'
        });
      }

      // Check storage (persistent cache)
      const stored = await this.storageAdapter.load(key);
      if (stored && !this.isStale(stored, options.maxAge)) {
        this.cache.set(key, stored); // Promote to memory
        return createSuccessResult('cache:get', stored.value, startTime, {
          cacheHit: true,
          source: 'storage'
        });
      }

      // Cache miss - fetch from API if fallback provided
      if (options.fallbackUrl) {
        const data = await this.apiAdapter.get(options.fallbackUrl);
        await this.set(key, data, options.maxAge);
        return createSuccessResult('cache:get', data, startTime, {
          cacheHit: false,
          source: 'api'
        });
      }

      return createErrorResult(
        'cache:get',
        new Error('Cache miss and no fallback'),
        startTime
      );

    } catch (error) {
      return createErrorResult('cache:get', error as Error, startTime);
    }
  }

  async set(key: string, value: any, maxAge?: number): Promise<void> {
    const entry = { value, timestamp: Date.now(), maxAge };
    this.cache.set(key, entry);
    await this.storageAdapter.save(key, entry);
  }

  private isStale(entry: CacheEntry, maxAge?: number): boolean {
    if (!maxAge && !entry.maxAge) return false;
    const age = Date.now() - entry.timestamp;
    return age > (maxAge || entry.maxAge || 0);
  }
}
```

---

## Example: StripeService (External)

```typescript
export class StripeService implements ServiceInterface {
  readonly name = 'stripe';
  readonly type = 'external' as const;

  private stripe: any = null;
  private isInitialized = false;

  constructor(private apiAdapter: ApiAdapter) {}

  async initializeStripe(): Promise<void> {
    if (this.isInitialized) return;

    const StripeConstructor = (window as any).Stripe;
    if (!StripeConstructor) {
      throw new Error('Stripe.js not loaded');
    }

    this.stripe = StripeConstructor('pk_test_...');
    this.isInitialized = true;
  }

  async createPaymentIntent(
    options: { credits: number }
  ): Promise<ServiceResult<PaymentIntentResponse>> {
    const startTime = Date.now();

    try {
      const response = await this.apiAdapter.post(
        '/api/stripe/create-payment-intent',
        { credits: options.credits }
      );

      // PRIVACY: Only timing - NO payment details in metadata!
      return createSuccessResult(
        'stripe:createPaymentIntent',
        {
          clientSecret: response.client_secret,
          paymentIntentId: response.payment_intent_id,
        },
        startTime
        // Note: No credit amounts or prices logged
      );

    } catch (error) {
      return createErrorResult(
        'stripe:createPaymentIntent',
        error as Error,
        startTime
      );
    }
  }

  createElements(clientSecret: string): any {
    if (!this.stripe) throw new Error('Stripe not initialized');
    return this.stripe.elements({ clientSecret, loader: 'never' });
  }

  async confirmPayment(elements: any, options: any): Promise<any> {
    if (!this.stripe) throw new Error('Stripe not initialized');
    return this.stripe.confirmPayment({ elements, ...options });
  }
}
```

---

## When to Use Which

### Use Adapter Directly

For simple, one-off operations where business logic is minimal:

```typescript
// Simple file loading - adapter is enough
async loadDocument(file: File) {
  const arrayBuffer = await this.eventualState.__fileAdapter.readFile(file);
  const text = new TextDecoder().decode(arrayBuffer);
  return JSON.parse(text);
}
```

### Use Service

For complex flows with business logic, retries, fallbacks, or state:

```typescript
// Complex flow - service handles coordination
async handlePurchase(credits: number) {
  const result = await this.eventualState.stripeService.createPaymentIntent({
    credits
  });

  if (result.success) {
    const elements = this.eventualState.stripeService.createElements(
      result.data.clientSecret
    );
    // Mount payment form...
  } else {
    this.showError(result.error?.message);
  }
}
```

### Decision Matrix

| Question | Answer | Use |
|----------|--------|-----|
| Simple platform I/O? | Yes | **Adapter** |
| Complex business logic? | Yes | **Service** |
| Retry/fallback needed? | Yes | **Service** |
| Multiple adapters involved? | Yes | **Service** |
| State coordination? | Yes | **Service** |

---

## Progressive Complexity

Start simple with adapters, extract to services when needed:

```typescript
// PHASE 1: Simple - use adapter directly
async fetchUser() {
  const data = await this.eventualState.__apiAdapter.get('/api/user');
  return data;
}

// PHASE 2: Growing complexity - extract to service
// UserService now handles:
// - Caching strategy
// - Fallback to localStorage
// - Retry logic
// - State synchronization

async fetchUser() {
  const result = await this.eventualState.userService.getProfile();
  return result.data;
}
```

---

## Integration with EventualState

Adapters are injected into EventualState at construction:

```typescript
class EventualState {
  // Adapters (__ prefix = "low-level")
  public __fileAdapter: FileAdapter;
  public __apiAdapter: ApiAdapter;
  public __storageAdapter: StorageAdapter;

  // Framework services
  public cacheService: CacheService;

  constructor(adapters: PlatformAdapters) {
    // Store adapters
    this.__fileAdapter = adapters.file;
    this.__apiAdapter = adapters.api;
    this.__storageAdapter = adapters.storage;

    // Initialize framework services (receive adapters)
    this.cacheService = new CacheService(
      this.__storageAdapter,
      this.__apiAdapter
    );
  }

  // Convenience methods
  async readFile(file: File): Promise<ArrayBuffer> {
    return await this.__fileAdapter.readFile(file);
  }

  async fetchData(url: string): Promise<any> {
    return await this.__apiAdapter.get(url);
  }
}
```

---

## Build-Time Adapter Selection

Adapters are selected at compile time:

```typescript
// main.ts
import { EventualState } from './yggdrasil/state/EventualState';

// Vite resolves at build time
const adapters = import.meta.env.PLATFORM === 'desktop'
  ? await import('./yggdrasil/adapters/desktop.adapters')
  : import.meta.env.PLATFORM === 'mobile'
  ? await import('./yggdrasil/adapters/mobile.adapters')
  : await import('./yggdrasil/adapters/web.adapters');

const eventualState = new EventualState(adapters.default);
```

**Vite config:**

```typescript
// vite.config.ts
export default defineConfig({
  define: {
    'import.meta.env.PLATFORM': JSON.stringify(
      process.env.BUILD_TARGET || 'web'
    )
  }
});

// Build commands:
// npm run build                      → web
// BUILD_TARGET=desktop npm run build → Tauri
// BUILD_TARGET=mobile npm run build  → Capacitor
```

---

## Adding External Services

External services are added at the app level:

```typescript
// In app initialization
const eventualState = new EventualState(adapters);

// Add app-specific services
(eventualState as any).stripeService = new StripeService(
  eventualState.__apiAdapter
);
```

**TypeScript declaration:**

```typescript
// In app/services/StripeService.ts
declare module "../../yggdrasil/state/EventualState" {
  interface EventualState {
    stripeService: StripeService;
  }
}
```

---

## Folder Structure

```
yggdrasil/
├── adapters/
│   ├── types.ts              # Adapter interfaces
│   ├── web.adapters.ts       # Browser implementations
│   ├── desktop.adapters.ts   # Tauri implementations
│   └── mobile.adapters.ts    # Capacitor implementations
├── services/
│   ├── types.ts              # ServiceInterface, ServiceResult
│   └── CacheService.ts       # Framework service
└── state/
    └── EventualState.ts      # Adapters + framework services

app/
└── services/
    ├── StripeService.ts      # External service
    └── AuthService.ts        # External service
```

---

## Privacy Boundaries

### Framework Services

Capture rich metadata for optimization:

```typescript
{
  operationName: 'cache:get',
  duration: 15,
  cacheHit: true,
  source: 'memory',
  // OK - helps optimize framework
}
```

### External Services

Only timing and status - NO payload data:

```typescript
{
  operationName: 'stripe:createPaymentIntent',
  duration: 1250,
  // NO credit amounts
  // NO prices
  // NO customer data
  // NO payment details
}
```

---

## Summary

| Concept | Purpose | Stateful | Platform-specific |
|---------|---------|----------|-------------------|
| **Adapter** | Platform abstraction | No | Yes (different per target) |
| **Framework Service** | Core business logic | Yes | No (same everywhere) |
| **External Service** | App-specific logic | Yes | No (same everywhere) |

**Key patterns:**
1. Adapters abstract I/O - swap per build target
2. Services encapsulate logic - same everywhere
3. Start with adapters, extract services when needed
4. Services return `ServiceResult<T>` for consistent error handling
5. External services are privacy-first (no payload logging)

---

## Next Steps

- [State System](./01-state-system.md) — How adapters integrate with EventualState
- [Component Patterns](../02-patterns/01-component-patterns.md) — How to use services in components
