// ==================================================================================
// SHARED TEST UTILITIES FOR BRANCH STABILITY TESTS
// ==================================================================================

import { munin } from "../../munin";

/**
 * Helper to extract component tree from a collected fragment
 */
export function getComponentTree(fragment: DocumentFragment): any {
  return (fragment as any).__muninComponent;
}

/**
 * Helper to build flat tree like MuninBuilder.buildFlatTree does
 */
export function buildFlatTree(component: any): Record<string, { cacheKey: string }> {
  const flat: Record<string, { cacheKey: string }> = {};
  
  const extract = (comp: any) => {
    if (!comp) return;
    flat[comp.muninId] = { cacheKey: comp.cacheKey };
    comp.children?.forEach((child: any) => extract(child));
  };
  
  extract(component);
  return flat;
}

/**
 * Simulate the diff that RenderingEngine.detectComponentChanges would do
 */
export function detectChanges(
  oldTree: Record<string, { cacheKey: string }>,
  newTree: Record<string, { cacheKey: string }>
): { removed: string[]; added: string[]; changed: string[] } {
  const oldIds = new Set(Object.keys(oldTree));
  const newIds = new Set(Object.keys(newTree));
  
  const removed = [...oldIds].filter(id => !newIds.has(id));
  const added = [...newIds].filter(id => !oldIds.has(id));
  const changed: string[] = [];
  
  for (const id of newIds) {
    if (oldIds.has(id) && oldTree[id].cacheKey !== newTree[id].cacheKey) {
      changed.push(id);
    }
  }
  
  return { removed, added, changed };
}

/**
 * Standard setup for all branch stability tests
 */
export function setupTestEnvironment() {
  document.body.innerHTML = "";
  
  // Register test tile
  munin.registerLayers('test-tile', {
    10: 'main',
    20: 'overlay',
    30: 'controls',
  });
}
