// ==================================================================================
// TIER 1: WRAPPER CREATION TESTS
// Tests that branch nodes (match/cond) create stable wrapper elements
// ==================================================================================
// @vitest-environment jsdom

import { describe, test, expect, beforeEach, vi } from "vitest";
import { munin } from "../../munin";
import { getComponentTree, setupTestEnvironment } from "./test-utils";

beforeEach(() => {
  vi.restoreAllMocks();
  setupTestEnvironment();
});

// ==================================================================================
// MATCH BUILDER - WRAPPER CREATION
// ==================================================================================

describe("MatchBuilder: Wrapper Creation", () => {
  
  test("creates a wrapper element with data-munin-branch attribute", () => {
    const fragment = munin.match('a')
      .case('a', () => munin`<div class="case-a">Case A</div>`)
      .case('b', () => munin`<div class="case-b">Case B</div>`)
      .collect({ parentId: null, position: 0, layerName: 'overlay' });
    
    document.body.appendChild(fragment);
    
    const branchWrapper = document.querySelector('[data-munin-branch]');
    expect(branchWrapper).toBeTruthy();
    expect(branchWrapper?.getAttribute('data-munin-branch-type')).toBe('match');
    expect(branchWrapper?.getAttribute('style')).toContain('display: contents');
  });
  
  test("branch wrapper contains the matched case content", () => {
    const fragment = munin.match('b')
      .case('a', () => munin`<div class="case-a">Case A</div>`)
      .case('b', () => munin`<div class="case-b">Case B</div>`)
      .collect({ parentId: null, position: 0, layerName: 'overlay' });
    
    document.body.appendChild(fragment);
    
    const branchWrapper = document.querySelector('[data-munin-branch]');
    const caseContent = branchWrapper?.querySelector('.case-b');
    
    expect(caseContent).toBeTruthy();
    expect(caseContent?.textContent).toBe('Case B');
  });
  
  test("creates component metadata with muninId and cacheKey", () => {
    const fragment = munin.match('a')
      .case('a', () => munin`<div>A</div>`)
      .case('b', () => munin`<div>B</div>`)
      .collect({ parentId: null, position: 0, layerName: 'overlay' });
    
    const component = getComponentTree(fragment);
    
    expect(component).toBeDefined();
    expect(component.muninId).toBeDefined();
    expect(component.cacheKey).toBeDefined();
  });
});

// ==================================================================================
// CONDITIONAL TEMPLATE - WRAPPER CREATION
// ==================================================================================

describe("ConditionalTemplate: Wrapper Creation", () => {
  
  test("creates a wrapper element with data-munin-branch attribute", () => {
    const fragment = munin`<div>Content</div>`
      .when(true)
      .collect({ parentId: null, position: 0, layerName: 'controls' });
    
    document.body.appendChild(fragment);
    
    const branchWrapper = document.querySelector('[data-munin-branch]');
    expect(branchWrapper).toBeTruthy();
    expect(branchWrapper?.getAttribute('data-munin-branch-type')).toBe('cond');
  });
  
  test("cond wrapper contains the winning branch content", () => {
    const fragment = munin`<div class="if-content">If Branch</div>`
      .when(true)
      .else(munin`<div class="else-content">Else Branch</div>`)
      .collect({ parentId: null, position: 0, layerName: 'controls' });
    
    document.body.appendChild(fragment);
    
    const branchWrapper = document.querySelector('[data-munin-branch]');
    const content = branchWrapper?.querySelector('.if-content');
    
    expect(content).toBeTruthy();
    expect(content?.textContent).toBe('If Branch');
  });
});

// ==================================================================================
// DOM STABILITY - WRAPPER PERSISTENCE
// ==================================================================================

describe("DOM Stability: Wrapper Persistence", () => {
  
  test("branch wrapper element exists in DOM after render", () => {
    // Setup layer container
    const { containers } = munin.createLayerContainers('test-tile');
    const overlayContainer = containers['overlay'];
    document.body.appendChild(overlayContainer);
    
    // Render with case 'a'
    const fragment = munin.match('a')
      .case('a', () => munin`<div class="case-a">A</div>`)
      .case('b', () => munin`<div class="case-b">B</div>`)
      .collect({ parentId: null, position: 0, layerName: 'overlay' });
    
    overlayContainer.appendChild(fragment);
    
    const wrapper = overlayContainer.querySelector('[data-munin-branch]');
    expect(wrapper).toBeTruthy();
    expect(overlayContainer.querySelector('.case-a')).toBeTruthy();
  });
});
