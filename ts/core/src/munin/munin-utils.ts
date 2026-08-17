// ==================================================================================
// MUNIN UTILITIES - Structure Extraction from Flat Tree
// ==================================================================================
// PHASE 2 STEP 3: Helper functions for working with muninId-based flat trees
//
// The muninId encodes the full tree structure:
//
// Branch format (layer-based):
//   'branch-controls-abc123'       → depth 0 (branch root)
//   'branch-controls-abc123-0'     → depth 1, parent is 'branch-controls-abc123'
//   'branch-controls-abc123-0-1'   → depth 2, parent is 'branch-controls-abc123-0'
//
// Legacy root format (deprecated):
//   'root-abc123'       → depth 0 (root)
//   'root-abc123-0'     → depth 1, parent is 'root-abc123'
//
// These utilities extract that structure in O(1) time using string operations.

/**
 * Get parent ID from muninId
 *
 * @param muninId - Component ID (e.g., 'branch-controls-abc123-0-1')
 * @returns Parent ID or null if root (e.g., 'branch-controls-abc123-0')
 *
 * @example
 * getParentId('branch-controls-abc123-0-1') // 'branch-controls-abc123-0'
 * getParentId('branch-controls-abc123-0')   // 'branch-controls-abc123'
 * getParentId('branch-controls-abc123')     // null (branch root)
 * getParentId('root-abc123')                // null (legacy root)
 */
export function getParentId(muninId: string): string | null {
  const parts = muninId.split('-');

  // Branch format: branch-{layerName}-{hash} = 3 parts for root
  if (muninId.startsWith('branch-')) {
    if (parts.length <= 3) return null; // branch-layer-hash has no parent
    return parts.slice(0, -1).join('-');
  }

  // Legacy root format: root-{hash} = 2 parts for root
  if (parts.length <= 2) return null; // root-hash has no parent
  return parts.slice(0, -1).join('-');
}

/**
 * Get component depth (0 = root, 1 = child, 2 = grandchild, etc.)
 *
 * @param muninId - Component ID
 * @returns Depth level (0-based)
 *
 * @example
 * getDepth('branch-controls-abc123')       // 0 (branch root)
 * getDepth('branch-controls-abc123-0')     // 1 (child)
 * getDepth('branch-controls-abc123-0-1')   // 2 (grandchild)
 * getDepth('root-abc123')                  // 0 (legacy root)
 */
export function getDepth(muninId: string): number {
  const parts = muninId.split('-');

  // Branch format: branch-{layerName}-{hash} = 3 parts for depth 0
  if (muninId.startsWith('branch-')) {
    return parts.length - 3;
  }

  // Legacy root format: root-{hash} = 2 parts for depth 0
  return parts.length - 2;
}

/**
 * Check if ancestorId is an ancestor of descendantId
 *
 * @param ancestorId - Potential ancestor component ID
 * @param descendantId - Potential descendant component ID
 * @returns True if ancestorId is an ancestor of descendantId
 *
 * @example
 * isAncestor('branch-controls-abc123', 'branch-controls-abc123-0-1')      // true
 * isAncestor('branch-controls-abc123-0', 'branch-controls-abc123-0-1')    // true
 * isAncestor('branch-controls-abc123-1', 'branch-controls-abc123-0-1')    // false (sibling)
 */
export function isAncestor(ancestorId: string, descendantId: string): boolean {
  return descendantId.startsWith(ancestorId + '-');
}

/**
 * Check if component is child of any already-swapped parent
 * Used for branch pruning in surgical updates
 *
 * @param muninId - Component ID to check
 * @param swapped - Set of already-swapped component IDs
 * @returns True if any ancestor was already swapped
 *
 * @example
 * const swapped = new Set(['branch-controls-abc123-0']);
 * isChildOfSwapped('branch-controls-abc123-0-1', swapped)  // true (parent swapped)
 * isChildOfSwapped('branch-controls-abc123-1', swapped)    // false (sibling)
 */
export function isChildOfSwapped(
  muninId: string,
  swapped: Set<string>
): boolean {
  const parts = muninId.split('-');

  // Determine minimum parts for root (branch format has 3, legacy has 2)
  const minRootParts = muninId.startsWith('branch-') ? 3 : 2;

  // Check all ancestors (walk up the tree)
  for (let i = parts.length - 1; i >= minRootParts; i--) {
    const ancestorId = parts.slice(0, i).join('-');
    if (swapped.has(ancestorId)) {
      return true; // Ancestor was swapped - we're already updated
    }
  }

  return false;
}

/**
 * Get all siblings of a component (components with same parent)
 *
 * @param muninId - Component ID
 * @param allIds - All component IDs in the tree
 * @returns Array of sibling IDs (excluding the component itself)
 *
 * @example
 * getSiblings('branch-controls-abc123-0', ['branch-controls-abc123', 'branch-controls-abc123-0', 'branch-controls-abc123-1'])
 * // Returns: ['branch-controls-abc123-1']
 */
export function getSiblings(muninId: string, allIds: string[]): string[] {
  const parentId = getParentId(muninId);
  if (parentId === null) return []; // Root has no siblings

  const depth = getDepth(muninId);

  return allIds.filter(id =>
    id !== muninId &&
    getDepth(id) === depth &&
    getParentId(id) === parentId
  );
}

/**
 * Get all children of a component
 *
 * @param muninId - Component ID
 * @param allIds - All component IDs in the tree
 * @returns Array of direct children IDs
 *
 * @example
 * getChildren('branch-controls-abc123', ['branch-controls-abc123', 'branch-controls-abc123-0', 'branch-controls-abc123-0-1', 'branch-controls-abc123-1'])
 * // Returns: ['branch-controls-abc123-0', 'branch-controls-abc123-1']
 */
export function getChildren(muninId: string, allIds: string[]): string[] {
  const childDepth = getDepth(muninId) + 1;

  return allIds.filter(id =>
    getDepth(id) === childDepth &&
    getParentId(id) === muninId
  );
}

/**
 * Get all descendants of a component (children, grandchildren, etc.)
 *
 * @param muninId - Component ID
 * @param allIds - All component IDs in the tree
 * @returns Array of all descendant IDs
 *
 * @example
 * getDescendants('branch-controls-abc123', ['branch-controls-abc123', 'branch-controls-abc123-0', 'branch-controls-abc123-0-1'])
 * // Returns: ['branch-controls-abc123-0', 'branch-controls-abc123-0-1']
 */
export function getDescendants(muninId: string, allIds: string[]): string[] {
  return allIds.filter(id => isAncestor(muninId, id));
}
