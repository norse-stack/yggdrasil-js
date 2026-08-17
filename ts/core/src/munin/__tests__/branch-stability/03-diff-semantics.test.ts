// ==================================================================================
// TIER 3: DIFF SEMANTICS TESTS
// Tests that wrapper IDs are stable and diffs show correct REMOVE/ADD behavior
// ==================================================================================
// @vitest-environment jsdom

import { describe, test, expect, beforeEach, vi } from "vitest";
import { munin } from "../../munin";
import { getComponentTree, buildFlatTree, detectChanges, setupTestEnvironment } from "./test-utils";

beforeEach(() => {
  vi.restoreAllMocks();
  setupTestEnvironment();
});

// ==================================================================================
// MATCH BUILDER - STABLE WRAPPER IDS
// ==================================================================================

describe("MatchBuilder: Stable Wrapper IDs", () => {
  
  test("wrapper has STABLE muninId across case changes", () => {
    const makeMatch = (value: string) => munin.match(value)
      .case('a', () => munin`<div>A</div>`)
      .case('b', () => munin`<div>B</div>`)
      .collect({ parentId: null, position: 0, layerName: 'overlay' });
    
    const fragmentA = makeMatch('a');
    const fragmentB = makeMatch('b');
    
    const componentA = getComponentTree(fragmentA);
    const componentB = getComponentTree(fragmentB);
    
    // Wrapper muninId should be the same regardless of which case matches
    expect(componentA.muninId).toBe(componentB.muninId);
  });
  
  test("wrapper has STABLE cacheKey across case changes", () => {
    const makeMatch = (value: string) => munin.match(value)
      .case('a', () => munin`<div>A</div>`)
      .case('b', () => munin`<div>B</div>`)
      .collect({ parentId: null, position: 0, layerName: 'overlay' });
    
    const fragmentA = makeMatch('a');
    const fragmentB = makeMatch('b');
    
    const componentA = getComponentTree(fragmentA);
    const componentB = getComponentTree(fragmentB);
    
    // Wrapper cache key should be the same (stable!)
    expect(componentA.cacheKey).toBe(componentB.cacheKey);
  });
});

// ==================================================================================
// MATCH BUILDER - DIFF BEHAVIOR
// ==================================================================================

describe("MatchBuilder: Diff Semantics", () => {
  
  test("diff shows REMOVE old case + ADD new case, not CHANGE", () => {
    const makeMatch = (value: string) => munin.match(value)
      .case('settings', () => munin`<div class="settings">Settings Modal</div>`)
      .case('stripe', () => munin`<div class="stripe">Stripe Modal</div>`)
      .collect({ parentId: null, position: 0, layerName: 'overlay' });
    
    const fragmentSettings = makeMatch('settings');
    const fragmentStripe = makeMatch('stripe');
    
    const treeSettings = buildFlatTree(getComponentTree(fragmentSettings));
    const treeStripe = buildFlatTree(getComponentTree(fragmentStripe));
    
    const { removed, added, changed } = detectChanges(treeSettings, treeStripe);
    
    // Wrapper should NOT be in any change list (unchanged)
    const wrapperIds = Object.keys(treeSettings).filter(id => !id.includes('-m'));
    expect(wrapperIds.length).toBe(1);
    expect(changed).not.toContain(wrapperIds[0]);
    expect(removed).not.toContain(wrapperIds[0]);
    expect(added).not.toContain(wrapperIds[0]);
    
    // Old case should be REMOVED
    const settingsChildId = Object.keys(treeSettings).find(id => id.includes('-m0'));
    expect(removed).toContain(settingsChildId);
    
    // New case should be ADDED
    const stripeChildId = Object.keys(treeStripe).find(id => id.includes('-m1'));
    expect(added).toContain(stripeChildId);
    
    // Nothing should be CHANGED (morphed)
    expect(changed).toHaveLength(0);
  });
  
  test("same case re-render shows no changes (cache hit)", () => {
    const makeMatch = (value: string) => munin.match(value)
      .case('a', () => munin`<div>Static A</div>`)
      .case('b', () => munin`<div>Static B</div>`)
      .collect({ parentId: null, position: 0, layerName: 'overlay' });
    
    const fragment1 = makeMatch('a');
    const fragment2 = makeMatch('a');
    
    const tree1 = buildFlatTree(getComponentTree(fragment1));
    const tree2 = buildFlatTree(getComponentTree(fragment2));
    
    const { removed, added, changed } = detectChanges(tree1, tree2);
    
    // Perfect cache hit - no changes
    expect(removed).toHaveLength(0);
    expect(added).toHaveLength(0);
    expect(changed).toHaveLength(0);
  });
});

// ==================================================================================
// CONDITIONAL TEMPLATE - STABLE WRAPPER IDS
// ==================================================================================

describe("ConditionalTemplate: Stable Wrapper IDs", () => {
  
  test("wrapper has stable cacheKey regardless of condition", () => {
    const makeCond = (condition: boolean) => munin`<div>Content</div>`
      .when(condition)
      .else(munin`<div>Alt</div>`)
      .collect({ parentId: null, position: 0, layerName: 'controls' });
    
    const fragmentTrue = makeCond(true);
    const fragmentFalse = makeCond(false);
    
    const componentTrue = getComponentTree(fragmentTrue);
    const componentFalse = getComponentTree(fragmentFalse);
    
    // Wrapper cache key should be stable
    expect(componentTrue.cacheKey).toBe(componentFalse.cacheKey);
  });
});

// ==================================================================================
// CONDITIONAL TEMPLATE - DIFF BEHAVIOR
// ==================================================================================

describe("ConditionalTemplate: Diff Semantics", () => {
  
  test("switching branches shows REMOVE + ADD, not CHANGE", () => {
    const makeCond = (condition: boolean) => munin`<div class="if">If</div>`
      .when(condition)
      .else(munin`<div class="else">Else</div>`)
      .collect({ parentId: null, position: 0, layerName: 'controls' });
    
    const fragmentTrue = makeCond(true);
    const fragmentFalse = makeCond(false);
    
    const treeTrue = buildFlatTree(getComponentTree(fragmentTrue));
    const treeFalse = buildFlatTree(getComponentTree(fragmentFalse));
    
    const { removed, added, changed } = detectChanges(treeTrue, treeFalse);
    
    // Wrapper should NOT be changed/removed/added
    const wrapperIds = Object.keys(treeTrue).filter(id => !/-c\d+$/.test(id));
    expect(wrapperIds.length).toBe(1);
    expect(changed).not.toContain(wrapperIds[0]);
    expect(removed).not.toContain(wrapperIds[0]);
    expect(added).not.toContain(wrapperIds[0]);
    
    // c0 (if branch) should be REMOVED
    const ifBranchId = Object.keys(treeTrue).find(id => id.includes('-c0'));
    expect(removed).toContain(ifBranchId);
    
    // c1 (else branch) should be ADDED
    const elseBranchId = Object.keys(treeFalse).find(id => id.includes('-c1'));
    expect(added).toContain(elseBranchId);
    
    // Nothing should be CHANGED
    expect(changed).toHaveLength(0);
  });
});
