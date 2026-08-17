// ==================================================================================
// @SECTION: Cache Service
// Framework service that provides smart caching with storage fallback
// ==================================================================================

import type { ServiceInterface, ServiceResult } from './types.js';
import { createSuccessResult, createErrorResult } from './types.js';

/**
 * Cache entry structure
 */
interface CacheEntry {
  value: any;
  timestamp: number;
  maxAge?: number;
}

/**
 * Cache options for get operations
 */
export interface CacheOptions {
  /** Maximum age in milliseconds before cache is considered stale */
  maxAge?: number;

  /** Optional URL to fetch from if cache misses */
  fallbackUrl?: string;
}

/**
 * CacheService - Framework service for smart caching
 *
 * Features:
 * - In-memory cache (Map)
 * - Persistent storage fallback (via StorageAdapter)
 * - API fallback on cache miss (via ApiAdapter)
 * - Automatic stale detection
 *
 * Data Capture: Framework service - captures rich metadata including
 * cache hit rates, sources, and performance metrics
 */
export class CacheService implements ServiceInterface {
  readonly name = 'cache';
  readonly type = 'framework' as const;

  private cache = new Map<string, CacheEntry>();

  constructor(
    private storageAdapter: any, // StorageAdapter
    private apiAdapter: any,     // ApiAdapter
  ) {}

  /**
   * Get value from cache with automatic fallback chain:
   * 1. Check memory cache
   * 2. Check persistent storage
   * 3. Fetch from API (if fallbackUrl provided)
   */
  async get<T>(key: string, options: CacheOptions = {}): Promise<ServiceResult<T>> {
    const startTime = Date.now();

    try {
      // Check memory cache
      const cached = this.cache.get(key);
      if (cached && !this.isStale(cached, options.maxAge)) {
        return createSuccessResult(
          'cache:get',
          cached.value,
          startTime,
          { cacheHit: true, source: 'memory' }
        );
      }

      // Check storage adapter (persistent cache)
      const stored = await this.storageAdapter.load(key);
      if (stored && !this.isStale(stored, options.maxAge)) {
        // Promote to memory cache
        this.cache.set(key, stored);

        return createSuccessResult(
          'cache:get',
          stored.value,
          startTime,
          { cacheHit: true, source: 'storage' }
        );
      }

      // Cache miss - fetch from API if fallback provided
      if (options.fallbackUrl) {
        const data = await this.apiAdapter.get(options.fallbackUrl);
        await this.set(key, data, options.maxAge);

        return createSuccessResult(
          'cache:get',
          data,
          startTime,
          { cacheHit: false, source: 'api' }
        );
      }

      // No fallback - cache miss
      return createErrorResult(
        'cache:get',
        new Error('Cache miss and no fallback provided'),
        startTime,
        { cacheHit: false }
      );

    } catch (error) {
      return createErrorResult(
        'cache:get',
        error as Error,
        startTime,
        { cacheHit: false }
      );
    }
  }

  /**
   * Set value in cache (both memory and persistent storage)
   */
  async set(key: string, value: any, maxAge?: number): Promise<void> {
    const entry: CacheEntry = {
      value,
      timestamp: Date.now(),
      maxAge,
    };

    // Set in memory
    this.cache.set(key, entry);

    // Persist to storage
    await this.storageAdapter.save(key, entry);
  }

  /**
   * Remove value from cache
   */
  async remove(key: string): Promise<void> {
    this.cache.delete(key);
    await this.storageAdapter.remove(key);
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.cache.clear();
    // Note: StorageAdapter doesn't have a clear() method in current interface
    // This is intentional - we only clear memory cache
  }

  /**
   * Check if cache entry is stale
   */
  private isStale(entry: CacheEntry, maxAge?: number): boolean {
    if (!maxAge && !entry.maxAge) return false;
    const age = Date.now() - entry.timestamp;
    return age > (maxAge || entry.maxAge || 0);
  }

  /**
   * Get current cache state for debugging
   */
  getState(): Readonly<{
    memorySize: number;
    keys: string[];
  }> {
    return {
      memorySize: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Cleanup method for service teardown
   */
  async destroy(): Promise<void> {
    this.cache.clear();
  }
}
