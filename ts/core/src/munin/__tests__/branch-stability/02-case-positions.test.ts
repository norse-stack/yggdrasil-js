// ==================================================================================
// TIER 2: CASE POSITION TESTS
// Tests that children use case-indexed positions (m0, m1, c0, c1)
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
// MATCH BUILDER - CASE POSITIONS
// ==================================================================================

describe("MatchBuilder: Case-Indexed Positions", () => {
  
  test("case 0 child uses position m0", () => {
    const fragment = munin.match('a')
      .case('a', () => munin`<div>A</div>`)
      .case('b', () => munin`<div>B</div>`)
      .case('c', () => munin`<div>C</div>`)
      .collect({ parentId: null, position: 0, layerName: 'overlay' });
    
    const component = getComponentTree(fragment);
    expect(component.children).toBeDefined();
    expect(component.children.length).toBeGreaterThan(0);
    expect(component.children[0]?.muninId).toContain('-m0');
  });
  
  test("case 1 child uses position m1", () => {
    const fragment = munin.match('b')
      .case('a', () => munin`<div>A</div>`)
      .case('b', () => munin`<div>B</div>`)
      .case('c', () => munin`<div>C</div>`)
      .collect({ parentId: null, position: 0, layerName: 'overlay' });
    
    const component = getComponentTree(fragment);
    expect(component.children).toBeDefined();
    expect(component.children.length).toBeGreaterThan(0);
    expect(component.children[0]?.muninId).toContain('-m1');
  });
  
  test("case 2 child uses position m2", () => {
    const fragment = munin.match('c')
      .case('a', () => munin`<div>A</div>`)
      .case('b', () => munin`<div>B</div>`)
      .case('c', () => munin`<div>C</div>`)
      .collect({ parentId: null, position: 0, layerName: 'overlay' });
    
    const component = getComponentTree(fragment);
    expect(component.children).toBeDefined();
    expect(component.children.length).toBeGreaterThan(0);
    expect(component.children[0]?.muninId).toContain('-m2');
  });
  
  test("default case gets index after all regular cases", () => {
    const fragment = munin.match('unknown')
      .case('a', () => munin`<div>A</div>`)
      .case('b', () => munin`<div>B</div>`)
      .default(() => munin`<div>Default</div>`)
      .collect({ parentId: null, position: 0, layerName: 'overlay' });
    
    const component = getComponentTree(fragment);
    expect(component.children).toBeDefined();
    expect(component.children.length).toBeGreaterThan(0);
    // Default should be m2 (after m0 and m1)
    expect(component.children[0]?.muninId).toContain('-m2');
  });
});

// ==================================================================================
// CONDITIONAL TEMPLATE - BRANCH POSITIONS
// ==================================================================================

describe("ConditionalTemplate: Branch Positions", () => {
  
  test("if-branch uses position c0", () => {
    const fragment = munin`<div>If Branch</div>`
      .when(true)
      .else(munin`<div>Else Branch</div>`)
      .collect({ parentId: null, position: 0, layerName: 'controls' });
    
    const component = getComponentTree(fragment);
    expect(component.children).toBeDefined();
    expect(component.children.length).toBeGreaterThan(0);
    expect(component.children[0]?.muninId).toContain('-c0');
  });
  
  test("else-branch uses position c1", () => {
    const fragment = munin`<div>If Branch</div>`
      .when(false)
      .else(munin`<div>Else Branch</div>`)
      .collect({ parentId: null, position: 0, layerName: 'controls' });
    
    const component = getComponentTree(fragment);
    expect(component.children).toBeDefined();
    expect(component.children.length).toBeGreaterThan(0);
    expect(component.children[0]?.muninId).toContain('-c1');
  });
});
