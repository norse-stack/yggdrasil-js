// ==================================================================================
// MUNIN SORT STRATEGIES - Pluggable Sorting for Surgical Updates
// ==================================================================================
// PHASE 2 STEP 5: Configurable sort strategies for performance experimentation
//
// Different strategies optimize for different scenarios:
// - bucketSort: O(n) - Best for typical UIs with bounded depth
// - depthSort: O(n log n) - Explicit depth ordering
// - simple: O(n log n) - Lexicographic sort
// - none: O(n) - No sorting, relies on branch pruning

import { getDepth } from './munin-utils.js';
import { hugin } from '../hugin/index.js';

/**
 * Sorting strategy for changed component IDs
 * Takes array of muninIds, returns sorted array
 */
export type SortStrategy = (ids: string[]) => string[];

/**
 * Available sorting strategies
 */
export const SORT_STRATEGIES = {
  /**
   * Simple lexicographic sort - O(n log n)
   * Good for: Small component counts, general use
   */
  simple: (ids: string[]): string[] => {
    return [...ids].sort();
  },

  /**
   * Depth-based sort - O(n log n)
   * Good for: Ensuring shallow-first order explicitly
   */
  depthSort: (ids: string[]): string[] => {
    return [...ids].sort((a, b) => getDepth(a) - getDepth(b));
  },

  /**
   * Bucket sort by depth - O(n)
   * Good for: Large component counts, bounded depth
   * Assumes max depth of 10 (typical for UIs)
   *
   * This is the optimal strategy for most use cases!
   */
  bucketSort: (ids: string[]): string[] => {
    const maxDepth = 10;
    const buckets: string[][] = Array(maxDepth + 1).fill(null).map(() => []);

    ids.forEach(id => {
      const depth = getDepth(id);
      if (depth <= maxDepth) {
        buckets[depth].push(id);
      } else {
        // Fallback for unexpectedly deep nesting
        buckets[maxDepth].push(id);
      }
    });

    return buckets.flat();
  },

  /**
   * No sorting - O(n)
   * Good for: Testing branch pruning effectiveness
   * May result in more DOM swaps, but faster iteration
   *
   * Use this to measure how effective branch pruning is!
   */
  none: (ids: string[]): string[] => {
    return ids;
  }
} as const;

/**
 * Current sort strategy (can be changed at runtime)
 * Default is bucketSort (O(n) with best cache performance)
 */
let currentSortStrategy: SortStrategy = SORT_STRATEGIES.bucketSort;

/**
 * Set the sort strategy for component swapping
 * Useful for A/B testing and performance optimization
 *
 * @param strategy - Strategy name ('bucketSort', 'depthSort', 'simple', 'none')
 */
export function setMuninSortStrategy(strategy: keyof typeof SORT_STRATEGIES): void {
  currentSortStrategy = SORT_STRATEGIES[strategy];

  const complexity = strategy === 'bucketSort' || strategy === 'none' ? 'O(n)' : 'O(n log n)';

  hugin.debug.log('MuninConfig', 'Sort strategy changed', {
    strategy,
    complexity,
    description: getStrategyDescription(strategy)
  });
}

/**
 * Get current sort strategy function
 */
export function getMuninSortStrategy(): SortStrategy {
  return currentSortStrategy;
}

/**
 * Sort changed IDs using current strategy
 *
 * @param ids - Array of muninIds that changed
 * @returns Sorted array (shallow-first if strategy supports it)
 */
export function sortChangedIds(ids: string[]): string[] {
  const sorted = currentSortStrategy(ids);

  hugin.debug.log('MuninSort', 'Sorted changed components', {
    inputCount: ids.length,
    outputCount: sorted.length,
    strategy: getCurrentStrategyName()
  });

  return sorted;
}

/**
 * Get description of a strategy
 */
function getStrategyDescription(strategy: keyof typeof SORT_STRATEGIES): string {
  const descriptions = {
    simple: 'Lexicographic sort - simple and reliable',
    depthSort: 'Explicit depth-first ordering',
    bucketSort: 'O(n) bucket sort - optimal for most UIs',
    none: 'No sorting - tests branch pruning efficiency'
  };

  return descriptions[strategy];
}

/**
 * Get name of current strategy (for debugging)
 */
function getCurrentStrategyName(): string {
  for (const [name, fn] of Object.entries(SORT_STRATEGIES)) {
    if (fn === currentSortStrategy) {
      return name;
    }
  }
  return 'unknown';
}

// ==================================================================================
// DEVELOPER TOOLS - Expose to window for runtime experimentation
// ==================================================================================

if (typeof window !== 'undefined') {
  (window as any).__muninSetSort = setMuninSortStrategy;
  (window as any).__muninSortStrategies = Object.keys(SORT_STRATEGIES);

  // Helpful console message (always show in browser)
  console.log('🎯 Munin Sort Strategies available:');
  console.log('   __muninSetSort("bucketSort")  // O(n) - default');
  console.log('   __muninSetSort("depthSort")   // O(n log n)');
  console.log('   __muninSetSort("simple")      // O(n log n)');
  console.log('   __muninSetSort("none")        // O(n) - no sort');
  console.log('   __muninSortStrategies         // List all');
}
