// ==================================================================================
// SEED RENDERER - Render seed definitions to DOM or HTML
// ==================================================================================
// Three modes:
// 1. renderSeed() - Renders into DOM container (client-side)
// 2. renderSeedToHTML() - Renders to HTML string (SSR)
// 3. renderSeedWithTree() - Renders AND captures tree for surgical handoff
// ==================================================================================

import type { SeedDefinition } from "./types.js";
import { munin } from "../../munin/munin.js";

/**
 * Render a seed definition into a DOM container
 *
 * Creates layer containers and renders seed content into them.
 * Used by TilingManager before tile construction.
 *
 * @param seed - The seed definition to render
 * @param container - The DOM container to render into
 * @param layerContainerClass - CSS class prefix for layer containers (default: "munin-layer")
 */
export function renderSeed(
  seedDef: SeedDefinition,
  container: HTMLElement,
  layerContainerClass: string = "munin-layer",
): void {
  // Get seed state
  const seed = seedDef.seedState();

  // Generate layer templates
  const layers = seedDef.layers(seed);

  // Render each layer into container
  for (const [layerName, template] of Object.entries(layers)) {
    // Find or create layer container
    let layerEl = container.querySelector(
      `.${layerContainerClass}-${layerName}`,
    ) as HTMLElement;

    if (!layerEl) {
      layerEl = document.createElement("div");
      layerEl.className = `${layerContainerClass} ${layerContainerClass}-${layerName}`;
      container.appendChild(layerEl);
    }

    // Clear existing content and render seed
    layerEl.innerHTML = "";

    // Collect the Munin template to a DocumentFragment and append
    const fragment = template.collect();
    layerEl.appendChild(fragment);
  }
}

/**
 * Render a seed definition to an HTML string
 *
 * Used for SSR - generates HTML that can be embedded in server response.
 * The client will render over this seed when Yggdrasil initializes.
 *
 * @param seed - The seed definition to render
 * @param layerContainerClass - CSS class prefix for layer containers (default: "munin-layer")
 * @returns HTML string
 */
export function renderSeedToHTML(
  seedDef: SeedDefinition,
  layerContainerClass: string = "munin-layer",
): string {
  // Get seed state
  const seed = seedDef.seedState();

  // Generate layer templates
  const layers = seedDef.layers(seed);

  // Build HTML string for each layer
  const layerHTMLs: string[] = [];

  for (const [layerName, template] of Object.entries(layers)) {
    // Collect the Munin template to a DocumentFragment
    const fragment = template.collect();

    // Convert fragment to HTML string
    const wrapper = document.createElement("div");
    wrapper.appendChild(fragment.cloneNode(true));
    const innerHTML = wrapper.innerHTML;

    // Wrap in layer container
    const layerHTML = `<div class="${layerContainerClass} ${layerContainerClass}-${layerName}">${innerHTML}</div>`;
    layerHTMLs.push(layerHTML);
  }

  return layerHTMLs.join("\n");
}

/**
 * Render seed with component trees for surgical handoff
 *
 * This renders the seed into a container AND captures the component tree
 * for each layer. The tree can be passed to RenderingEngine.setSeedTree()
 * to enable surgical first-render diffing.
 *
 * KEY INSIGHT: Uses the same munin layer builder as the tile's performRender(),
 * so muninIds will match if the templates are identical!
 *
 * @param seed - The seed definition to render
 * @param tileId - The tile ID for munin layer registration
 * @param container - The DOM container to render into
 * @returns Component tree for each layer (for setSeedTree())
 */
type TreeEntry = { cacheKey: string; cssVars?: Record<string, string> };

export function renderSeedWithTree(
  seedDef: SeedDefinition,
  tileId: string,
  container: HTMLElement,
): Record<string, Record<string, TreeEntry>> {
  // Get seed state
  const seed = seedDef.seedState();

  // Generate layer templates
  const layers = seedDef.layers(seed);

  // Build using same pattern as tile's performRender()
  let builder = munin.inTile(tileId);

  for (const [layerName, template] of Object.entries(layers)) {
    builder = builder.layer(layerName, template);
  }

  // Collect with tree for surgical diffing
  const { fragments, tree } = builder.collectComponents();

  // Find or create layer containers and render
  for (const [layerName, fragment] of Object.entries(fragments)) {
    let layerEl = container.querySelector(
      `.munin-layer-${layerName}`,
    ) as HTMLElement;

    if (!layerEl) {
      layerEl = document.createElement("div");
      layerEl.className = `munin-layer munin-layer-${layerName}`;
      container.appendChild(layerEl);
    }

    // Clear and render
    layerEl.innerHTML = "";
    layerEl.appendChild(fragment);
  }

  return tree;
}
