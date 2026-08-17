// ==================================================================================
// DYNAMIC LIST RECONCILIATION — guidance tests (executable documentation)
// ==================================================================================
// @vitest-environment jsdom
//
// Pins the behavior behind the two dynamic-list pitfalls the first Manifold chat probe
// surfaced (2026-06-30). These are conventions, NOT munin bugs — the tests exist so the
// "what works vs what escapes" rules are checkable, not just prose.
//   Full account:  docs/manifold/P3/AAR/2026-06-30-munin-dynamic-list-escape-and-composer-send.md
//   Conventions:   .claude/skills/yggdrasil/gotchas.md  #21 (and #22 for the composer ref)
//
// Two rules these tests enforce:
//   1. DON'T put an interpolated array and a `munin.cond()` as SIBLINGS — reconciliation is
//      positional, not keyed, so growing the array collides with the cond's slot. Fold the
//      conditional into the same array as a trailing item instead.
//   2. DON'T wrap an appended-to array in an inner element — munin tags a component's
//      *children*, never its own root, so an inner wrapper sits one level below the
//      id-bearing element and a surgical append (by id) escapes past it.

import { describe, test, expect, beforeEach, vi } from "vitest";
import { munin } from "../munin";
import {
  getComponentTree,
  buildFlatTree,
  detectChanges,
} from "./branch-stability/test-utils";

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

// Build the content component's flat tree two ways, mirroring a chat message list.
const arrayPlusCond = (msgs: string[], thinking: boolean) =>
  buildFlatTree(
    getComponentTree(
      munin`${msgs.map((m) => munin`<div class="msg">${m}</div>`)}${munin`<div class="thinking"></div>`.when(
        thinking,
      )}`.collect({ parentId: null, position: 0, layerName: "content" }),
    ),
  );

const unifiedArray = (msgs: string[], thinking: boolean) => {
  const items = msgs.map((m) => munin`<div class="msg">${m}</div>`);
  if (thinking) items.push(munin`<div class="thinking"></div>`);
  return buildFlatTree(
    getComponentTree(
      munin`${items}`.collect({
        parentId: null,
        position: 0,
        layerName: "content",
      }),
    ),
  );
};

// ----------------------------------------------------------------------------------
// Rule 1 — array + sibling cond collides (anti-pattern)
// ----------------------------------------------------------------------------------
describe("Dynamic list: an array beside a munin.cond() collides on append", () => {
  test("a cond occupies a positional slot even when its condition is FALSE", () => {
    // root + one message (-0) + the cond's own slot (-1). The cond is always present,
    // so it permanently sits at the array's tail position.
    const tree = arrayPlusCond(["a"], false);
    expect(Object.keys(tree).length).toBe(3);
  });

  test("appending a message reuses the cond's slot → a brittle 'changed' (message dropped live)", () => {
    const before = arrayPlusCond(["a"], false); //  msg-a @ -0, cond @ -1
    const after = arrayPlusCond(["a", "b"], true); // msg-a @ -0, msg-b @ -1, cond @ -2

    const diff = detectChanges(before, after);

    // Slot -1 flips identity (cond → message): the engine tries to swap a branch-slot into a
    // regular component, which swapComponents (branch-pruning) refuses — so in the live render
    // the appended message is dropped. The positional id scheme is the root cause.
    expect(diff.changed.length).toBeGreaterThan(0);
  });
});

// ----------------------------------------------------------------------------------
// Rule 1 (fix) — fold the conditional into the one array
// ----------------------------------------------------------------------------------
describe("Dynamic list: folding the conditional into one array reconciles cleanly", () => {
  test("appending yields pure 'added', never 'changed' — every change is an append", () => {
    const before = unifiedArray(["a"], false); //       msg-a @ -0
    const after = unifiedArray(["a", "b"], true); // msg-a @ -0, msg-b @ -1, thinking @ -2

    const diff = detectChanges(before, after);

    expect(diff.changed).toEqual([]);
    expect(diff.added.length).toBe(2);
  });
});

// ----------------------------------------------------------------------------------
// Rule 2 — munin tags children, never a component's own root
// ----------------------------------------------------------------------------------
describe("Dynamic list: an inner wrapper makes surgical appends escape", () => {
  test("a component's root element carries no id; the array items are DIRECT children of it", () => {
    // No inner wrapper: the array is interpolated straight into the component's root.
    const frag = munin`<div class="parent">${["a", "b"].map(
      (i) => munin`<span class="item">${i}</span>`,
    )}</div>`.collect({ parentId: null, position: 0, layerName: "content" });
    document.body.appendChild(frag);

    const parent = document.querySelector(".parent")!;
    // munin never tags a component's OWN root element...
    expect(parent.getAttribute("data-munin-component")).toBeNull();
    // ...but the array item wrappers are tagged AND are direct children of the root, so the
    // element that becomes id-bearing at the layer level (the layer container == this root's
    // role) directly contains them → a surgical append lands in the right place.
    const direct = [...parent.children];
    expect(direct.length).toBe(2);
    expect(direct.every((c) => c.getAttribute("data-munin-component"))).toBe(
      true,
    );
  });

  test("an inner wrapper sits between the id-bearing parent and the array → append escapes", () => {
    // .inner is a plain element with NO munin id; the wrapped component's id sits on the
    // display:contents wrapper AROUND .inner. So the items live one level BELOW their
    // id-bearing parent.
    const frag = munin`<div class="parent">${munin`<div class="inner">${["a", "b"].map(
      (i) => munin`<span class="item">${i}</span>`,
    )}</div>`}</div>`.collect({
      parentId: null,
      position: 0,
      layerName: "content",
    });
    document.body.appendChild(frag);

    const item = document.querySelector(".item")!;
    const itemWrapper = item.parentElement!; // display:contents wrapper carrying the item's id
    const itemId = itemWrapper.getAttribute("data-munin-component")!;
    const parentId = itemId.slice(0, itemId.lastIndexOf("-"));

    // Replicate RenderingEngine.addComponents' parent resolution: strip the trailing -N,
    // querySelector the id-bearing element, append there.
    const idBearingParent = document.querySelector(
      `[data-munin-component="${parentId}"]`,
    )!;
    const actualContainer = itemWrapper.parentElement!; // = .inner (untagged)

    // The array's real DOM container (.inner) is NOT the id-bearing element...
    expect((actualContainer as HTMLElement).className).toBe("inner");
    expect(actualContainer.getAttribute("data-munin-component")).toBeNull();
    expect(idBearingParent).not.toBe(actualContainer);
    // ...so an item appended into idBearingParent would be a SIBLING of .inner, escaping the
    // list. (idBearingParent's only direct child is .inner, never the item wrappers.)
    expect([...idBearingParent.children]).not.toContain(itemWrapper);
  });
});
