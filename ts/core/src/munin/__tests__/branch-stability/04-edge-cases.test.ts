// ==================================================================================
// TIER 4: EDGE CASES AND INTEGRATION TESTS
// Tests nested branches, empty cases, and collectComponents integration
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
// NESTED BRANCHES
// ==================================================================================

describe("Nested Branches", () => {
  
  test("nested match creates nested wrappers with correct IDs", () => {
    const fragment = munin.match('outer-a')
      .case('outer-a', () => 
        munin.match('inner-x')
          .case('inner-x', () => munin`<div class="inner-x">X</div>`)
          .case('inner-y', () => munin`<div class="inner-y">Y</div>`)
      )
      .case('outer-b', () => munin`<div class="outer-b">B</div>`)
      .collect({ parentId: null, position: 0, layerName: 'overlay' });
    
    const component = getComponentTree(fragment);
    const tree = buildFlatTree(component);
    
    // Should have outer wrapper, outer child (m0), inner wrapper, inner child (m0)
    const ids = Object.keys(tree);
    
    // Outer wrapper should exist (no -m suffix)
    const outerWrapper = ids.find(id => id.startsWith('branch-overlay-') && !id.includes('-m'));
    expect(outerWrapper).toBeDefined();
    
    // Outer's child should be m0 (the inner match wrapper)
    const outerChild = ids.find(id => id.endsWith('-m0') && !id.includes('-m0-'));
    expect(outerChild).toBeDefined();
    
    // Inner's child should have m0-m0 pattern (outer-m0's child with position m0)
    const innerChild = ids.find(id => id.includes('-m0-m0'));
    expect(innerChild).toBeDefined();
  });
  
  test("cond inside match creates hybrid position IDs", () => {
    const fragment = munin.match('a')
      .case('a', () => 
        munin`<div>Loading</div>`
          .when(true)
          .else(munin`<div>Ready</div>`)
      )
      .collect({ parentId: null, position: 0, layerName: 'overlay' });
    
    const tree = buildFlatTree(getComponentTree(fragment));
    const ids = Object.keys(tree);
    
    // Should have: wrapper, m0 (match child = cond wrapper), c0 (cond's if branch)
    expect(ids.some(id => id.includes('-m0'))).toBe(true);
    expect(ids.some(id => id.includes('-c0'))).toBe(true);
  });
});

// ==================================================================================
// EMPTY BRANCHES
// ==================================================================================

describe("Empty Branches", () => {
  
  test("empty match (no case matches, no default) still has wrapper", () => {
    const fragment = munin.match('unknown')
      .case('a', () => munin`<div>A</div>`)
      .case('b', () => munin`<div>B</div>`)
      .collect({ parentId: null, position: 0, layerName: 'overlay' });
    
    document.body.appendChild(fragment);
    
    // Wrapper should exist even with no content
    const wrapper = document.querySelector('[data-munin-branch]');
    expect(wrapper).toBeTruthy();
    
    // But no case content
    expect(document.querySelector('.case-a')).toBeNull();
    expect(document.querySelector('.case-b')).toBeNull();
    
    // Component tree should have wrapper with no children
    const component = getComponentTree(fragment);
    expect(component.muninId).toBeDefined();
    expect(component.children).toHaveLength(0);
  });
  
  test("cond without else and false condition still has wrapper", () => {
    const fragment = munin`<div>Content</div>`
      .when(false)
      .collect({ parentId: null, position: 0, layerName: 'overlay' });
    
    document.body.appendChild(fragment);
    
    // Wrapper should exist
    const wrapper = document.querySelector('[data-munin-branch]');
    expect(wrapper).toBeTruthy();
    
    // Component should have no children
    const component = getComponentTree(fragment);
    expect(component.children).toHaveLength(0);
  });
});

// ==================================================================================
// CONTENT CHANGES WITHIN SAME CASE
// ==================================================================================

describe("Content Changes Within Same Case", () => {
  
  test("match with same value but different content shows child CHANGED", () => {
    let counter = 0;
    
    const makeMatch = () => munin.match('a')
      .case('a', () => munin`<div>Count: ${++counter}</div>`)
      .collect({ parentId: null, position: 0, layerName: 'overlay' });
    
    const fragment1 = makeMatch(); // counter = 1
    const fragment2 = makeMatch(); // counter = 2
    
    const tree1 = buildFlatTree(getComponentTree(fragment1));
    const tree2 = buildFlatTree(getComponentTree(fragment2));
    
    const { changed } = detectChanges(tree1, tree2);
    
    // Wrapper should be unchanged (filter out wrapper from changed list)
    const wrapperChanged = changed.filter(id => !id.includes('-m'));
    expect(wrapperChanged).toHaveLength(0);
    
    // Child content changed (cache key differs due to counter)
    expect(changed.some(id => id.includes('-m0'))).toBe(true);
  });
});

// ==================================================================================
// INTEGRATION: collectComponents()
// ==================================================================================

describe("Integration: Layer Collection", () => {
  
  test("collectComponents includes branch wrapper in tree", () => {
    const result = munin.inTile('test-tile')
      .layer('overlay', 
        munin.match('settings')
          .case('settings', () => munin`<div class="settings">Settings</div>`)
          .case('stripe', () => munin`<div class="stripe">Stripe</div>`)
      )
      .collectComponents();
    
    // Tree should have entries for this layer
    expect(result.tree['overlay']).toBeDefined();
    
    const overlayTree = result.tree['overlay'];
    const ids = Object.keys(overlayTree);
    
    // Should have wrapper ID (starts with branch-{tileName}-overlay-)
    const wrapperId = ids.find(id => id.startsWith('branch-test-tile-overlay-'));
    expect(wrapperId).toBeDefined();
    
    // Should have child with m0
    const childId = ids.find(id => id.includes('-m0'));
    expect(childId).toBeDefined();
  });
  
  test("switching cases produces correct diff in collectComponents", () => {
    const makeResult = (value: string) => munin.inTile('test-tile')
      .layer('overlay',
        munin.match(value)
          .case('settings', () => munin`<div class="settings">Settings</div>`)
          .case('stripe', () => munin`<div class="stripe">Stripe</div>`)
      )
      .collectComponents();
    
    const result1 = makeResult('settings');
    const result2 = makeResult('stripe');
    
    const { removed, added, changed } = detectChanges(
      result1.tree['overlay'],
      result2.tree['overlay']
    );
    
    // Wrapper should be stable (not in any list)
    const wrapperId = Object.keys(result1.tree['overlay']).find(id => !id.includes('-m'));
    expect(removed).not.toContain(wrapperId);
    expect(added).not.toContain(wrapperId);
    expect(changed).not.toContain(wrapperId);
    
    // One case removed, one added
    expect(removed.length).toBe(1);
    expect(added.length).toBe(1);
    expect(changed.length).toBe(0);
  });
});
