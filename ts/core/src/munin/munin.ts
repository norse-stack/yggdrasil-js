// ==================================================================================
// MUNIN - Odin's All-Seeing Raven Template System
// ALL-SEEING TEMPLATING WITHOUT REACT CONSTRAINTS + LAYERED COMPOSITION
// ==================================================================================

import { hugin, MUNIN } from "../hugin/index.js";

/**
 * MUNIN - Odin's All-Seeing Raven (JSX-like) Template System
 *
 * Like Munin who flies across all nine realms and sees everything without boundaries,
 * this template function sees all application state without React's component constraints.
 *
 * Munin remembers everything, sees everything, reports directly to your tiles.
 * No prop drilling, no component boundaries, no artificial limitations.
 *
 * Evolution: Now with LAZY EXECUTION for proper tree tracking through cond/match.
 *
 * Usage:
 *   munin`<div class="tile">${this.getState()}</div>`
 *   munin`<button onclick=${this.handleClick}>Click me</button>`
 *   munin`<canvas ref=${(el) => this.canvas = el}></canvas>`
 *
 *   // Conditional rendering (lazy - proper tree tracking!)
 *   munin`<div>Content</div>`.when(loading).else(munin`<div>Idle</div>`)
 *
 *   // Match statements (lazy - only winning branch executes!)
 *   munin.match(modalType)
 *     .case('settings', () => this.SettingsModal())
 *     .case('stripe', () => this.StripePaymentModal())
 *
 *   // Layer composition
 *   munin.inTile('pdf')
 *     .layer('background', munin`<canvas></canvas>`)
 *     .layer('controls', munin`<div>Controls</div>`.when(ready))
 *     .collectComponents()  // <-- Collection point: all templates execute here
 *
 * "Munin sees everything, remembers everything, reports directly."
 */

// ==================================================================================
// SECURITY UTILITIES
// ==================================================================================

/**
 * Escapes HTML entities to prevent XSS in text content
 */
function escapeHTML(str: string): string {
  const escapeMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
  };
  return str.replace(/[&<>"']/g, (char) => escapeMap[char]);
}

/**
 * Escapes HTML attribute values to prevent XSS in attributes
 */
function escapeAttribute(str: string): string {
  const escapeMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
  };
  return str.replace(/[&<>"']/g, (char) => escapeMap[char]);
}

/**
 * Detects the context where a value is being interpolated
 */
function getInterpolationContext(
  beforeString: string,
  afterString: string,
): "attribute" | "content" {
  const beforeTrimmed = beforeString.trim();
  const afterTrimmed = afterString.trim();

  if (
    (beforeTrimmed.endsWith('="') && afterTrimmed.startsWith('"')) ||
    (beforeTrimmed.endsWith("='") && afterTrimmed.startsWith("'"))
  ) {
    return "attribute";
  }

  return "content";
}

// ==================================================================================
// URL SANITIZATION
// ==================================================================================

/**
 * Dangerous URL schemes that can execute code
 * - javascript: executes JavaScript
 * - vbscript: executes VBScript (IE legacy)
 * - data: can embed executable content (data:text/html,<script>...)
 */
const DANGEROUS_URL_PATTERN = /^\s*(javascript|vbscript|data):/i;

/**
 * URL attributes that need scheme validation
 */
const URL_ATTRIBUTES = ["href", "src", "action", "formaction", "xlink:href"];

/**
 * Sanitizes URLs to prevent javascript: and other dangerous schemes
 */
function sanitizeUrl(url: string): string {
  if (DANGEROUS_URL_PATTERN.test(url)) {
    console.warn("[Munin] Blocked dangerous URL scheme:", url.slice(0, 50));
    return "about:blank";
  }
  return url;
}

/**
 * Detects if we're interpolating into a URL attribute
 */
function isUrlAttribute(beforeString: string): boolean {
  const attrMatch = beforeString.match(/(\w+(?::\w+)?)\s*=\s*["']?$/);
  if (!attrMatch) return false;
  return URL_ATTRIBUTES.includes(attrMatch[1].toLowerCase());
}

// ==================================================================================
// CLEANUP SYSTEM INTERFACES
// ==================================================================================

interface MuninCleanupInfo {
  eventHandlers: Array<{ element: Element; type: string; handler: Function }>;
  refs: Function[];
  timers: number[];
  observers: Array<MutationObserver | IntersectionObserver>;
  clearAll(): void;
}

// ==================================================================================
// CSS VARIABLE DETECTION - For style-only updates without cache key destabilization
// ==================================================================================

/**
 * Pattern to detect CSS custom properties (--variable-name)
 * CSS custom properties are presentation, not content - they shouldn't affect cache key
 */
const CSS_CUSTOM_PROPERTY_PATTERN = /--[\w-]+\s*:/;

/**
 * Check if a style attribute value contains CSS custom properties
 * Used to determine if this value should be excluded from cache key
 */
function containsCssCustomProperty(styleValue: string): boolean {
  return CSS_CUSTOM_PROPERTY_PATTERN.test(styleValue);
}

/**
 * Check if we're interpolating into a style attribute
 *
 * ⚠️ HERE BE DRAGONS ⚠️
 * This regex is tricky! We need to detect if the interpolation point is INSIDE
 * a style attribute, even when there are other quoted attributes before it.
 *
 * The challenge: `<div class="foo" style="--panel-open: ${...}">`
 *                                        ↑ we're here
 *
 * We can't just look for `style="` followed by non-quotes, because the `class="foo"`
 * has quotes that confuse simple patterns.
 *
 * Solution: Look for `style=` followed by a quote, then check if there's an
 * odd number of that quote type before the end (meaning we're inside the attribute).
 *
 * If this breaks again, consider a proper state-machine parser or explicit API like:
 *   munin.cssVar('--panel-open', value)
 */
function isStyleAttribute(precedingString: string): boolean {
  // Look for style=" or style=' near the end
  // Then verify we haven't closed that quote yet

  // First, find the last occurrence of style=
  const styleMatch = precedingString.match(/style\s*=\s*(["'])/i);
  if (!styleMatch) return false;

  const quoteChar = styleMatch[1];
  const styleStart = precedingString.lastIndexOf(styleMatch[0]);
  const afterStyleAttr = precedingString.slice(styleStart + styleMatch[0].length);

  // If there's a closing quote after style=", we're NOT inside the style attribute
  // If there's no closing quote, we ARE inside
  return !afterStyleAttr.includes(quoteChar);
}

/**
 * Extract CSS custom property assignments from a style string
 * Returns object mapping property names to values
 * e.g., "--panel-open: 1; --color: red" → { "--panel-open": "1", "--color": "red" }
 */
function extractCssVars(styleString: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Match --property-name: value patterns
  const regex = /(--[\w-]+)\s*:\s*([^;]+)/g;
  let match;
  while ((match = regex.exec(styleString)) !== null) {
    result[match[1]] = match[2].trim();
  }
  return result;
}

// ==================================================================================
// COMPONENT TREE INFRASTRUCTURE
// ==================================================================================

/**
 * Hash a string into a compact base36 representation
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generate stable component ID using hybrid hash + position approach
 *
 * When parentId is null and layerName is provided, creates a branch node:
 *   branch-{layerName}-{hash}
 *
 * Children of branch nodes follow the pattern:
 *   branch-{layerName}-{hash}-0, branch-{layerName}-{hash}-1, etc.
 *
 * For branch nodes (match/cond), position can be string:
 *   - Match cases: m0, m1, m2, etc.
 *   - Cond branches: c0 (if), c1 (else)
 */
function generateMuninId(
  templateStrings: TemplateStringsArray,
  parentId: string | null,
  positionInParent: number | string,
  layerName?: string,
  tileName?: string,
): string {
  const templateKey = templateStrings.join("{{}}");
  const templateHash = hashString(templateKey);

  if (parentId === null) {
    // Root of a layer - create branch node with tile+layer name for uniqueness
    if (tileName && layerName) {
      return `branch-${tileName}-${layerName}-${templateHash}`;
    }
    if (layerName) {
      return `branch-${layerName}-${templateHash}`;
    }
    // Fallback for non-layer contexts (shouldn't happen in normal usage)
    return `root-${templateHash}`;
  }

  return `${parentId}-${positionInParent}`;
}

/**
 * Detect if a function value is an event handler
 */
function isEventHandler(value: any, precedingString: string): boolean {
  return (
    typeof value === "function" &&
    /on[a-z]+\s*=\s*$/i.test(precedingString.trim())
  );
}

/**
 * MuninComponent - Metadata for component tree structure
 */
interface MuninComponent {
  muninId: string;
  fragment: DocumentFragment;
  cacheKey: string;
  children: MuninComponent[];
  placeholder: HTMLElement | null;
  cleanup?: MuninCleanupInfo;
  contentNodes?: Node[];
  /**
   * CSS custom property values for style-only updates
   * When cache key matches but cssVars differ, only style is updated (no DOM replacement)
   * This enables CSS transitions while maintaining stable element identity
   */
  cssVars?: Record<string, string>;
}

// Export for RenderingEngine
export type { MuninComponent };

// Extend DocumentFragment type to include cleanup info and component metadata
declare global {
  interface DocumentFragment {
    __muninCleanup?: MuninCleanupInfo;
    __muninComponent?: MuninComponent;
  }
  interface HTMLElement {
    __muninCleanup?: MuninCleanupInfo;
  }
}

// ==================================================================================
// EXECUTION CONTEXT - Passed during collection for proper tree building
// ==================================================================================

/**
 * Context passed to templates during collection
 * Enables proper parent-child relationship tracking
 */
interface MuninContext {
  parentId: string | null;
  position: number | string; // Allow string for branch cases (m0, m1, c0, c1)
  /** Layer name - used for branch naming when parentId is null */
  layerName?: string;
  /** Tile name - scopes IDs to prevent collisions across tiles with same layer names */
  tileName?: string;
}

// ==================================================================================
// MUNIN TEMPLATE - LAZY EXECUTION CORE
// ==================================================================================

/**
 * MuninTemplate - A lazy template that defers execution until collected
 *
 * This is the key to making cond/match work with tree diffing!
 * Templates are NOT executed when created - only when .collect() is called.
 *
 * The collection point (RenderingEngine.renderComponents) injects
 * the proper context (parentId, position) so the tree is built correctly.
 */
export class MuninTemplate {
  private strings: TemplateStringsArray;
  private values: any[];
  private autoEscape: boolean;

  constructor(
    strings: TemplateStringsArray,
    values: any[],
    autoEscape: boolean = true,
  ) {
    this.strings = strings;
    this.values = values;
    this.autoEscape = autoEscape;
  }

  /**
   * Execute the template and return a DocumentFragment
   *
   * @param ctx - Optional context for tree building (parentId, position, layerName)
   * @returns DocumentFragment with __muninComponent metadata
   */
  collect(ctx?: MuninContext): DocumentFragment {
    return muninCore(
      this.strings,
      this.values,
      this.autoEscape,
      true, // preserveStructure
      ctx?.parentId ?? null,
      ctx?.position ?? 0,
      ctx?.layerName,
      ctx?.tileName,
    );
  }

  /**
   * Conditional rendering - returns ConditionalTemplate for lazy evaluation
   *
   * Usage:
   *   munin`<div>Content</div>`.when(condition).else(munin`<div>Alt</div>`)
   */
  when(condition: boolean): ConditionalTemplate {
    return new ConditionalTemplate(this, condition);
  }

  /**
   * Check if this is a MuninTemplate (for type checking in muninCore)
   */
  static isTemplate(value: any): value is MuninTemplate {
    return value instanceof MuninTemplate;
  }
}

// ==================================================================================
// CONDITIONAL TEMPLATE - LAZY CONDITIONAL RENDERING
// ==================================================================================

/**
 * ConditionalTemplate - Lazy conditional that only executes the winning branch
 *
 * The key insight: we store TEMPLATES, not fragments!
 * Only when collected does the winning template execute.
 */
export class ConditionalTemplate {
  private ifTemplate: MuninTemplate;
  private condition: boolean;
  private elseTemplate: MuninTemplate | null = null;
  private elseTemplateFn: (() => MuninTemplate) | null = null;

  constructor(ifTemplate: MuninTemplate, condition: boolean) {
    this.ifTemplate = ifTemplate;
    this.condition = condition;
  }

  /**
   * Provide alternative template for when condition is false.
   * Optional - if not provided, defaults to empty (renders nothing).
   *
   * Supports both eager and lazy evaluation:
   *   .else(munin`...`)           - Eager: template already evaluated
   *   .else(() => munin`...`)     - Lazy: only evaluated if condition is false
   */
  else(
    elseTemplateOrFn: MuninTemplate | (() => MuninTemplate)
  ): ConditionalTemplate {
    if (typeof elseTemplateOrFn === "function") {
      // Lazy evaluation - store the function
      this.elseTemplateFn = elseTemplateOrFn;
    } else {
      // Eager evaluation - store the template directly
      this.elseTemplate = elseTemplateOrFn;
    }
    return this;
  }

  /**
   * Execute the winning branch and return a DocumentFragment
   *
   * Now creates a stable wrapper container with the cond node's own identity.
   * Children get case-indexed positions (c0 for if, c1 for else).
   *
   * @param ctx - Context for tree building
   * @returns DocumentFragment with stable wrapper and child inside
   */
  collect(ctx?: MuninContext): DocumentFragment {
    // 1. Generate stable branch ID for the COND wrapper (tile-scoped)
    const tilePrefix = ctx?.tileName ? `${ctx.tileName}-` : '';
    const branchId = ctx?.parentId
      ? `${ctx.parentId}-${ctx.position}`
      : `branch-${tilePrefix}${ctx?.layerName ?? 'anon'}-${hashString('__COND__')}`;

    // 2. Create stable wrapper element
    const wrapper = document.createElement('div');
    wrapper.style.display = 'contents';
    wrapper.setAttribute('data-munin-branch', branchId);
    wrapper.setAttribute('data-munin-branch-type', 'cond');

    // 3. Determine which branch and its position
    const branchPosition = this.condition ? 'c0' : 'c1';  // c0 for if, c1 for else

    // 4. Get the winning template
    let winningTemplate: MuninTemplate | null = null;

    if (this.condition) {
      winningTemplate = this.ifTemplate;
    } else if (this.elseTemplateFn) {
      winningTemplate = this.elseTemplateFn();
    } else if (this.elseTemplate) {
      winningTemplate = this.elseTemplate;
    }

    // 5. Collect winning branch with BRANCH-INDEXED position
    let childComponent: MuninComponent | null = null;

    if (winningTemplate) {
      const childCtx: MuninContext = {
        parentId: branchId,
        position: branchPosition,  // c0 or c1
        layerName: ctx?.layerName,
        tileName: ctx?.tileName,
      };

      const childFragment = winningTemplate.collect(childCtx);
      childComponent = childFragment.__muninComponent ?? null;

      // ALWAYS create a wrapper element for the child content
      // This ensures RenderingEngine can find the element even for empty templates
      const childWrapper = document.createElement('div');
      childWrapper.style.display = 'contents';
      if (childComponent) {
        childWrapper.setAttribute('data-munin-component', childComponent.muninId);
        childComponent.placeholder = childWrapper;
      }

      // Transfer child content into child wrapper
      while (childFragment.firstChild) {
        childWrapper.appendChild(childFragment.firstChild);
      }

      // Add child wrapper to branch wrapper
      wrapper.appendChild(childWrapper);

      // Transfer cleanup
      if (childFragment.__muninCleanup) {
        (childWrapper as any).__muninCleanup = childFragment.__muninCleanup;
      }
    }

    // 6. Build result fragment with STABLE metadata
    const fragment = document.createDocumentFragment();
    fragment.appendChild(wrapper);

    fragment.__muninComponent = {
      muninId: branchId,
      cacheKey: branchId,  // STABLE: never changes regardless of condition
      children: childComponent ? [childComponent] : [],
      placeholder: wrapper,
      fragment,
    };

    // Debug logging
    hugin.debug.log(MUNIN, "Conditional: created branch container", {
      branchId,
      condition: this.condition,
      branchPosition,
      childId: childComponent?.muninId,
    });

    return fragment;
  }

  /**
   * Check if this is a ConditionalTemplate
   */
  static isConditional(value: any): value is ConditionalTemplate {
    return value instanceof ConditionalTemplate;
  }
}

// ==================================================================================
// MATCH BUILDER - LAZY PATTERN MATCHING
// ==================================================================================

/**
 * MatchBuilder - Lazy match statement that only executes the matching case
 *
 * Like Rust's match or a switch statement, but for templates.
 * Uses lazy evaluation - only the matched case factory is called.
 */
class MatchBuilder<T> {
  private value: T;
  private cases: Array<{ pattern: T; factory: () => Collectable }> = [];
  private defaultFactory: (() => Collectable) | null = null;

  constructor(value: T) {
    this.value = value;
  }

  /**
   * Add a case to the match statement
   * The factory function is only called if the pattern matches
   * Factory can return MuninTemplate, ConditionalTemplate, or MatchBuilder (nested branches)
   */
  case(pattern: T, factory: () => Collectable): MatchBuilder<T> {
    this.cases.push({ pattern, factory });
    return this;
  }

  /**
   * Set a custom default factory (optional - defaults to empty fragment)
   * Factory can return MuninTemplate, ConditionalTemplate, or MatchBuilder (nested branches)
   */
  default(factory: () => Collectable): MatchBuilder<T> {
    this.defaultFactory = factory;
    return this;
  }

  /**
   * Execute the matching case and return a DocumentFragment
   *
   * Now creates a stable wrapper container with the match node's own identity.
   * Children get case-indexed positions (m0, m1, m2, etc.).
   *
   * @param ctx - Context for tree building
   * @returns DocumentFragment with stable wrapper and child inside
   */
  collect(ctx?: MuninContext): DocumentFragment {
    // 1. Generate stable branch ID for the MATCH wrapper (tile-scoped)
    const tilePrefix = ctx?.tileName ? `${ctx.tileName}-` : '';
    const branchId = ctx?.parentId
      ? `${ctx.parentId}-${ctx.position}`
      : `branch-${tilePrefix}${ctx?.layerName ?? 'anon'}-${hashString('__MATCH__')}`;

    // 2. Create stable wrapper element
    const wrapper = document.createElement('div');
    wrapper.style.display = 'contents';
    wrapper.setAttribute('data-munin-branch', branchId);
    wrapper.setAttribute('data-munin-branch-type', 'match');

    // 3. Find matching case INDEX (not just the match)
    let matchedIndex = -1;
    let matchedFactory: (() => Collectable) | null = null;

    for (let i = 0; i < this.cases.length; i++) {
      if (this.cases[i].pattern === this.value) {
        matchedIndex = i;
        matchedFactory = this.cases[i].factory;
        break;
      }
    }

    // 4. Handle default case
    if (matchedIndex === -1 && this.defaultFactory) {
      matchedIndex = this.cases.length;  // Default gets index after all cases
      matchedFactory = this.defaultFactory;
    }

    // 5. Collect winning case with CASE-INDEXED position
    let childComponent: MuninComponent | null = null;

    if (matchedFactory !== null && matchedIndex !== -1) {
      const childCtx: MuninContext = {
        parentId: branchId,
        position: `m${matchedIndex}`,  // m0, m1, m2, etc.
        layerName: ctx?.layerName,
        tileName: ctx?.tileName,
      };

      const template = matchedFactory();
      const childFragment = template.collect(childCtx);
      childComponent = childFragment.__muninComponent ?? null;

      // ALWAYS create a wrapper element for the child content
      // This ensures RenderingEngine can find the element even for empty templates
      const childWrapper = document.createElement('div');
      childWrapper.style.display = 'contents';
      if (childComponent) {
        childWrapper.setAttribute('data-munin-component', childComponent.muninId);
        childComponent.placeholder = childWrapper;
      }

      // Transfer child content into child wrapper
      while (childFragment.firstChild) {
        childWrapper.appendChild(childFragment.firstChild);
      }

      // Add child wrapper to branch wrapper
      wrapper.appendChild(childWrapper);

      // Transfer cleanup
      if (childFragment.__muninCleanup) {
        (childWrapper as any).__muninCleanup = childFragment.__muninCleanup;
      }
    }

    // 6. Build result fragment with STABLE metadata
    const fragment = document.createDocumentFragment();
    fragment.appendChild(wrapper);

    fragment.__muninComponent = {
      muninId: branchId,
      cacheKey: branchId,  // STABLE: never changes regardless of match value
      children: childComponent ? [childComponent] : [],
      placeholder: wrapper,
      fragment,
    };

    // Debug logging
    hugin.debug.log(MUNIN, "Match: created branch container", {
      branchId,
      matchedCase: matchedIndex,
      childId: childComponent?.muninId,
      value: this.value,
    });

    return fragment;
  }

  /**
   * Check if this is a MatchBuilder
   */
  static isMatch(value: any): value is MatchBuilder<any> {
    return value instanceof MatchBuilder;
  }
}

// ==================================================================================
// COLLECTABLE TYPE - Union of all lazy types
// ==================================================================================

/**
 * Anything that can be collected into a DocumentFragment
 */
type Collectable = MuninTemplate | ConditionalTemplate | MatchBuilder<any>;

/**
 * Check if a value is collectable (lazy)
 */
function isCollectable(value: any): value is Collectable {
  return (
    MuninTemplate.isTemplate(value) ||
    ConditionalTemplate.isConditional(value) ||
    MatchBuilder.isMatch(value)
  );
}

// ==================================================================================
// CORE TEMPLATE EXECUTION
// ==================================================================================

/**
 * Detect the appropriate placeholder element based on HTML context
 * This prevents breaking table structure when nesting munin templates
 */
function getPlaceholderElement(precedingHtml: string): string {
  // Find the last unclosed tag by parsing the HTML
  // We need to track which tags are open
  const tagStack: string[] = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  let match;

  while ((match = tagRegex.exec(precedingHtml)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1].toLowerCase();

    // Skip self-closing tags and void elements
    const voidElements = [
      "area",
      "base",
      "br",
      "col",
      "embed",
      "hr",
      "img",
      "input",
      "link",
      "meta",
      "param",
      "source",
      "track",
      "wbr",
    ];
    if (voidElements.includes(tagName) || fullMatch.endsWith("/>")) {
      continue;
    }

    if (fullMatch.startsWith("</")) {
      // Closing tag - pop from stack
      const lastOpen = tagStack.lastIndexOf(tagName);
      if (lastOpen !== -1) {
        tagStack.splice(lastOpen, 1);
      }
    } else {
      // Opening tag - push to stack
      tagStack.push(tagName);
    }
  }

  // Get the innermost open tag
  const innermostTag =
    tagStack.length > 0 ? tagStack[tagStack.length - 1] : null;

  // Determine placeholder based on innermost open tag
  switch (innermostTag) {
    case "tbody":
    case "thead":
    case "tfoot":
      return "tr";
    case "tr":
      return "td";
    case "table":
      return "tbody";
    case "ul":
    case "ol":
      return "li";
    case "select":
    case "datalist":
    case "optgroup":
      return "option";
    case "dl":
      return "div"; // Could be dt or dd, div is safe
    case "colgroup":
      return "col";
    default:
      return "div";
  }
}

/**
 * Core implementation that builds the DocumentFragment
 *
 * Now accepts context for proper tree building when collected.
 */
function muninCore(
  strings: TemplateStringsArray,
  values: any[],
  autoEscape: boolean,
  preserveStructure: boolean,
  parentId: string | null,
  positionInParent: number | string,
  layerName?: string,
  tileName?: string,
): DocumentFragment {
  // Generate stable ID for this component
  const muninId = generateMuninId(strings, parentId, positionInParent, layerName, tileName);

  // Track child position counter for ID generation
  let childPositionCounter = 0;

  // Arrays to track cache key values and child components
  const cacheKeyValues: any[] = [];
  const children: MuninComponent[] = [];
  // Track CSS custom property values for style-only updates
  const cssVars: Record<string, string> = {};

  // Build the HTML string with placeholders for dynamic values
  let html = "";
  const eventHandlers: Map<string, Function> = new Map();
  const refs: Map<string, Function> = new Map();
  const nestedFragments: Map<string, DocumentFragment> = new Map();
  let placeholderIndex = 0;

  // Cleanup tracking
  const cleanupInfo: MuninCleanupInfo = {
    eventHandlers: [],
    refs: [],
    timers: [],
    observers: [],
    clearAll() {
      this.timers.forEach((id) => {
        clearTimeout(id);
        clearInterval(id);
      });
      this.observers.forEach((observer) => observer.disconnect());
    },
  };

  // Timer wrapping for cleanup tracking
  const originalSetTimeout = globalThis.setTimeout;
  const originalSetInterval = globalThis.setInterval;

  globalThis.setTimeout = ((
    callback: TimerHandler,
    delay?: number,
    ...args: any[]
  ): number => {
    const id = originalSetTimeout(callback, delay, ...args);
    cleanupInfo.timers.push(id);
    return id;
  }) as typeof globalThis.setTimeout;

  globalThis.setInterval = ((
    callback: TimerHandler,
    delay?: number,
    ...args: any[]
  ): number => {
    const id = originalSetInterval(callback, delay, ...args);
    cleanupInfo.timers.push(id);
    return id;
  }) as typeof globalThis.setInterval;

  try {
    for (let i = 0; i < strings.length; i++) {
      html += strings[i];

      if (i < values.length) {
        const value = values[i];

        // NEW: Handle arrays of collectables (e.g., rows.map(r => munin`...`))
        if (
          Array.isArray(value) &&
          value.length > 0 &&
          isCollectable(value[0])
        ) {
          // Detect the appropriate placeholder element based on HTML context
          const placeholderTag = getPlaceholderElement(html);

          // Process each item in the array as a collectable
          for (const item of value) {
            if (isCollectable(item)) {
              const childCtx: MuninContext = {
                parentId: muninId,
                position: childPositionCounter++,
              };

              const childFragment = item.collect(childCtx);
              const childComponent = childFragment.__muninComponent;

              if (childComponent) {
                children.push(childComponent);
              }

              const placeholder = `__NESTED_MUNIN_${placeholderIndex}__`;
              nestedFragments.set(placeholder, childFragment);
              html += `<${placeholderTag} data-munin-placeholder="${placeholder}"></${placeholderTag}>`;
              placeholderIndex++;
            }
          }
        }
        // Handle single nested MuninTemplate (lazy) - collect with context!
        else if (isCollectable(value)) {
          // Detect the appropriate placeholder element based on HTML context
          const placeholderTag = getPlaceholderElement(html);

          const childCtx: MuninContext = {
            parentId: muninId,
            position: childPositionCounter++,
          };

          // Execute the template with proper context
          const childFragment = value.collect(childCtx);
          const childComponent = childFragment.__muninComponent;

          if (childComponent) {
            children.push(childComponent);
          }

          // Create placeholder for nested content
          const placeholder = `__NESTED_MUNIN_${placeholderIndex}__`;
          nestedFragments.set(placeholder, childFragment);
          html += `<${placeholderTag} data-munin-placeholder="${placeholder}"></${placeholderTag}>`;
          placeholderIndex++;
        }
        // Handle already-collected DocumentFragment (backwards compatibility)
        else if (
          value instanceof DocumentFragment &&
          (value as any).__muninComponent
        ) {
          // Detect the appropriate placeholder element based on HTML context
          const placeholderTag = getPlaceholderElement(html);

          const childComponent = (value as any)
            .__muninComponent as MuninComponent;

          // Reassign child ID based on position in THIS parent
          const correctChildId = `${muninId}-${childPositionCounter}`;
          const oldChildId = childComponent.muninId;
          childComponent.muninId = correctChildId;
          childPositionCounter++;

          if (childComponent.cacheKey === oldChildId) {
            childComponent.cacheKey = correctChildId;
          }

          children.push(childComponent);

          const placeholder = `__NESTED_MUNIN_${placeholderIndex}__`;
          nestedFragments.set(placeholder, value);
          html += `<${placeholderTag} data-munin-placeholder="${placeholder}"></${placeholderTag}>`;
          placeholderIndex++;
        }
        // Handle ref callbacks
        else if (typeof value === "function" && strings[i].endsWith("ref=")) {
          const placeholder = `__REF_CALLBACK_${placeholderIndex}__`;
          refs.set(placeholder, value);
          html += placeholder;
          placeholderIndex++;
        }
        // Handle event handlers
        else if (
          typeof value === "function" &&
          isEventHandler(value, strings[i])
        ) {
          const placeholder = `__EVENT_HANDLER_${placeholderIndex}__`;
          eventHandlers.set(placeholder, value);
          html += placeholder;
          placeholderIndex++;
        }
        // Handle getter functions
        else if (typeof value === "function") {
          const dereffedValue = value();

          // CSS VARIABLE EXCLUSION: Don't add style values with CSS custom properties to cache key
          // This enables style-only updates without DOM replacement (critical for CSS transitions)
          const stringValue = String(dereffedValue ?? "");
          const inStyleAttr = isStyleAttribute(strings[i]);
          const fullStyleContent = strings[i] + stringValue;
          const hasCssVar = inStyleAttr && containsCssCustomProperty(fullStyleContent);

          if (hasCssVar) {
            // Extract and track CSS variables for style-only updates
            Object.assign(cssVars, extractCssVars(fullStyleContent));
          } else {
            cacheKeyValues.push(dereffedValue);
          }

          if (autoEscape) {
            const context = getInterpolationContext(
              strings[i],
              strings[i + 1] || "",
            );
            if (context === "attribute") {
              // Sanitize URLs in URL attributes to prevent javascript: XSS
              const sanitized = isUrlAttribute(strings[i])
                ? sanitizeUrl(stringValue)
                : stringValue;
              html += escapeAttribute(sanitized);
            } else {
              html += escapeHTML(stringValue);
            }
          } else {
            html += stringValue;
          }
        }
        // Handle regular interpolation
        else {
          const stringValue = String(value ?? "");

          // CSS VARIABLE EXCLUSION: Don't add style values with CSS custom properties to cache key
          const inStyleAttr = isStyleAttribute(strings[i]);
          const fullStyleContent = strings[i] + stringValue;
          const hasCssVar = inStyleAttr && containsCssCustomProperty(fullStyleContent);

          if (Array.isArray(value)) {
            hugin.debug.log(
              MUNIN,
              "Array interpolated - not added to cache key",
              {
                arrayLength: value.length,
                muninId,
              },
            );
          } else if (typeof value === "object" && value !== null) {
            hugin.debug.log(
              MUNIN,
              "Object interpolated - not added to cache key",
              {
                objectKeys: Object.keys(value),
                muninId,
              },
            );
          } else if (hasCssVar) {
            // Extract and track CSS variables for style-only updates
            Object.assign(cssVars, extractCssVars(fullStyleContent));
          } else {
            cacheKeyValues.push(value);
          }

          if (autoEscape) {
            const context = getInterpolationContext(
              strings[i],
              strings[i + 1] || "",
            );
            if (context === "attribute") {
              // Sanitize URLs in URL attributes to prevent javascript: XSS
              const sanitized = isUrlAttribute(strings[i])
                ? sanitizeUrl(stringValue)
                : stringValue;
              html += escapeAttribute(sanitized);
            } else {
              html += escapeHTML(stringValue);
            }
          } else {
            html += stringValue;
          }
        }
      }
    }
  } finally {
    // Restore original timer functions
    globalThis.setTimeout = originalSetTimeout;
    globalThis.setInterval = originalSetInterval;
  }

  // Compute cache key
  const cacheKey =
    cacheKeyValues.length > 0 ? JSON.stringify(cacheKeyValues) : muninId;

  // Create DOM elements from HTML
  const template = document.createElement("template");
  template.innerHTML = html;
  const fragment = template.content;

  // Bind event handlers and refs
  const walker = document.createTreeWalker(
    fragment,
    NodeFilter.SHOW_ELEMENT,
    null,
  );

  let currentElement: Element | null;
  while ((currentElement = walker.nextNode() as Element)) {
    if (currentElement) {
      // Bind event handlers
      for (const [placeholder, handler] of eventHandlers) {
        Array.from(currentElement.attributes).forEach((attr) => {
          if (attr.value === placeholder) {
            const eventName = attr.name.replace(/^on/, "").toLowerCase();

            // hugin.debug.log(MUNIN, "Attaching event listener", {
            //   elementId: currentElement!.id,
            //   eventName,
            //   placeholder,
            // });

            currentElement!.addEventListener(
              eventName,
              handler as EventListener,
            );

            cleanupInfo.eventHandlers.push({
              element: currentElement!,
              type: eventName,
              handler: handler as Function,
            });

            currentElement!.removeAttribute(attr.name);
          }
        });
      }

      // Bind ref callbacks
      for (const [placeholder, refCallback] of refs) {
        Array.from(currentElement.attributes).forEach((attr) => {
          if (attr.value === placeholder) {
            refCallback(currentElement);
            cleanupInfo.refs.push(refCallback as Function);
            currentElement!.removeAttribute(attr.name);
          }
        });
      }
    }
  }

  // PHASE 2: Handle nested DocumentFragments
  // IMPORTANT: Collect ALL placeholders first, then process them.
  // Modifying DOM during TreeWalker iteration causes it to skip nodes!
  const placeholderElements = Array.from(
    fragment.querySelectorAll("[data-munin-placeholder]"),
  ) as HTMLElement[];

  for (const placeholderEl of placeholderElements) {
    const placeholderAttr = placeholderEl.getAttribute(
      "data-munin-placeholder",
    );
    if (!placeholderAttr || !nestedFragments.has(placeholderAttr)) continue;

    const nestedFragment = nestedFragments.get(placeholderAttr)!;
    const childComponent = (nestedFragment as any).__muninComponent;
    const placeholderTagName = placeholderEl.tagName.toLowerCase();

    // Table elements can't be wrapped - they have strict HTML parsing rules
    // Instead of wrapping, we put the data-munin-component on the actual element
    const isTableElement = [
      "tr",
      "td",
      "th",
      "thead",
      "tbody",
      "tfoot",
      "colgroup",
      "col",
      "caption",
    ].includes(placeholderTagName);

    if (preserveStructure && childComponent) {
      if (isTableElement) {
        // TABLE ELEMENT STRATEGY: Replace placeholder with actual content
        // Put data-munin-component directly on the first element child
        const parent = placeholderEl.parentNode;
        if (parent) {
          // Find the first element in the fragment to attach the muninId
          const firstElement = nestedFragment.querySelector("*");
          if (firstElement) {
            firstElement.setAttribute(
              "data-munin-component",
              childComponent.muninId,
            );
            childComponent.placeholder = firstElement as HTMLElement;
          }

          // Insert all children before the placeholder, then remove placeholder
          while (nestedFragment.firstChild) {
            parent.insertBefore(nestedFragment.firstChild, placeholderEl);
          }
          parent.removeChild(placeholderEl);

          // hugin.debug.log(
          //   MUNIN,
          //   "Table element - direct replacement (no wrapper)",
          //   {
          //     parentId: muninId,
          //     childId: childComponent.muninId,
          //     placeholderTagName,
          //   },
          // );
        }
      } else {
        // NON-TABLE STRATEGY: Use wrapper with display:contents
        placeholderEl.style.display = "contents";
        placeholderEl.setAttribute(
          "data-munin-component",
          childComponent.muninId,
        );
        placeholderEl.removeAttribute("data-munin-placeholder");

        while (nestedFragment.firstChild) {
          placeholderEl.appendChild(nestedFragment.firstChild);
        }

        childComponent.placeholder = placeholderEl;

        // hugin.debug.log(MUNIN, "Preserved component structure (wrapper)", {
        //   parentId: muninId,
        //   childId: childComponent.muninId,
        //   placeholderAttr,
        // });
      }
    } else {
      const parent = placeholderEl.parentNode;
      if (parent) {
        while (nestedFragment.firstChild) {
          parent.insertBefore(nestedFragment.firstChild, placeholderEl);
        }
        parent.removeChild(placeholderEl);
      }
    }
  }

  // Attach cleanup and component metadata
  fragment.__muninCleanup = cleanupInfo;
  (fragment as any).__muninComponent = {
    muninId,
    fragment,
    cacheKey,
    children,
    placeholder: null,
    cleanup: cleanupInfo,
    // CSS variables for style-only updates (only set if any were found)
    cssVars: Object.keys(cssVars).length > 0 ? cssVars : undefined,
  } as MuninComponent;

  // hugin.debug.log(MUNIN, "Created component", {
  //   muninId,
  //   cacheKey,
  //   childCount: children.length,
  //   parentId,
  //   positionInParent,
  // });

  return fragment;
}

// ==================================================================================
// MUNIN FUNCTION - THE PUBLIC API
// ==================================================================================

/**
 * Core MUNIN template literal function
 *
 * NOW RETURNS MuninTemplate (lazy) instead of DocumentFragment!
 * The template is only executed when .collect() is called.
 *
 * For backwards compatibility, nested templates auto-collect during parent collection.
 */
export const munin = (
  strings: TemplateStringsArray,
  ...values: any[]
): MuninTemplate => {
  return new MuninTemplate(strings, values, true);
};

/**
 * Raw munin function that bypasses auto-escaping
 * USE WITH EXTREME CAUTION - Only for content you trust completely
 */
munin.raw = (
  strings: TemplateStringsArray,
  ...values: any[]
): MuninTemplate => {
  return new MuninTemplate(strings, values, false);
};

/**
 * Conditional rendering helper with fluent API
 *
 * PREFERRED: Lazy evaluation with arrow function (evaluates condition first!)
 *   munin.cond(() => this.MyComponent()).when(condition)
 *
 * This is the recommended pattern because:
 * 1. The condition is evaluated BEFORE the component
 * 2. If condition is false, component function is never called
 * 3. Prevents crashes from components that assume preconditions
 * 4. Maintains consistent munin syntax: always use () for component calls
 *
 * LEGACY: Eager evaluation (component evaluates before condition!)
 *   munin.cond(this.MyComponent()).when(condition)
 *
 * WARNING: With eager evaluation, the component runs even if condition is false!
 * This can cause crashes if the component assumes data exists.
 *
 * Also supports tagged template literal syntax (legacy):
 *   munin.cond`<div>content</div>`.when(condition)
 */
munin.cond = ((
  templateOrFnOrStrings:
    | MuninTemplate
    | (() => MuninTemplate)
    | TemplateStringsArray,
  ...values: any[]
): { when(condition: boolean): ConditionalTemplate } => {
  // Handle arrow function (LAZY): munin.cond(() => this.MyComponent()).when(condition)
  if (
    typeof templateOrFnOrStrings === "function" &&
    !Array.isArray(templateOrFnOrStrings)
  ) {
    const componentFn = templateOrFnOrStrings as () => MuninTemplate;
    return {
      when: (condition: boolean) => {
        // Only call component if condition is true (LAZY EVALUATION!)
        if (!condition) {
          return new ConditionalTemplate(munin``, false);
        }
        return new ConditionalTemplate(componentFn(), true);
      },
    };
  }

  // Handle MuninTemplate wrapper (EAGER): munin.cond(this.MyComponent())
  if (MuninTemplate.isTemplate(templateOrFnOrStrings)) {
    return {
      when: (condition: boolean) =>
        new ConditionalTemplate(templateOrFnOrStrings, condition),
    };
  }

  // Handle tagged template literal (EAGER): munin.cond`...`
  const template = new MuninTemplate(
    templateOrFnOrStrings as TemplateStringsArray,
    values,
    true,
  );
  return {
    when: (condition: boolean) => new ConditionalTemplate(template, condition),
  };
}) as {
  // Lazy evaluation (preferred)
  (componentFn: () => MuninTemplate): {
    when(condition: boolean): ConditionalTemplate;
  };
  // Eager evaluation (legacy)
  (template: MuninTemplate): {
    when(condition: boolean): ConditionalTemplate;
  };
  // Tagged template literal (legacy)
  (
    strings: TemplateStringsArray,
    ...values: any[]
  ): { when(condition: boolean): ConditionalTemplate };
};

/**
 * Match statement for selecting between multiple mutually exclusive rendering options
 *
 * Uses lazy evaluation - only the matched case factory is called.
 */
munin.match = <T>(value: T): MatchBuilder<T> => {
  return new MatchBuilder(value);
};

/**
 * Set tile context for layer composition
 */
munin.inTile = (tileName: string) => {
  return new MuninBuilder(tileName);
};

/**
 * Layer composition - starts building a layered composition
 */
munin.layer = (name: string, content: Collectable) => {
  return new MuninBuilder().layer(name, content);
};

/**
 * Register semantic layer names with z-index values for a specific tile
 */
munin.registerLayers = (tileName: string, registry: LayerRegistry) => {
  MuninBuilder.registerLayers(tileName, registry);
};

/**
 * Get the render strategy for a specific layer in a tile
 */
munin.getLayerStrategy = (
  tileName: string,
  layerName: string,
): RenderStrategy => {
  const tileRegistry = MuninBuilder.tileRegistry[tileName];
  if (!tileRegistry) {
    throw new Error(`Tile '${tileName}' not found in registry.`);
  }

  for (const [_, layerDef] of Object.entries(tileRegistry)) {
    const name = typeof layerDef === "string" ? layerDef : layerDef.name;
    const strategy =
      typeof layerDef === "string"
        ? "reactive"
        : layerDef.strategy || "reactive";

    if (name === layerName) {
      return strategy;
    }
  }
  throw new Error(
    `Layer '${layerName}' not found in tile '${tileName}' registry.`,
  );
};

/**
 * Get all layer strategies for a tile
 */
munin.getAllLayerStrategies = (
  tileName: string,
): Record<string, RenderStrategy> => {
  const tileRegistry = MuninBuilder.tileRegistry[tileName];
  if (!tileRegistry) {
    throw new Error(`Tile '${tileName}' not found in registry.`);
  }

  const strategies: Record<string, RenderStrategy> = {};
  for (const [_, layerDef] of Object.entries(tileRegistry)) {
    const name = typeof layerDef === "string" ? layerDef : layerDef.name;
    const strategy =
      typeof layerDef === "string"
        ? "reactive"
        : layerDef.strategy || "reactive";
    strategies[name] = strategy;
  }

  return strategies;
};

/**
 * Dynamically update the render strategy for a layer
 */
munin.setLayerStrategy = (
  tileName: string,
  layerName: string,
  strategy: RenderStrategy,
): void => {
  const tileRegistry = MuninBuilder.tileRegistry[tileName];
  if (!tileRegistry) {
    throw new Error(`Tile '${tileName}' not found in registry.`);
  }

  for (const [zIndex, layerDef] of Object.entries(tileRegistry)) {
    const name = typeof layerDef === "string" ? layerDef : layerDef.name;

    if (name === layerName) {
      if (typeof layerDef === "string") {
        tileRegistry[parseInt(zIndex)] = {
          name: layerDef,
          layer_type: strategy,
        };
      } else {
        layerDef.layer_type = strategy;
      }
      hugin.debug.log(MUNIN, "Updated layer strategy", {
        layerName,
        tileName,
        strategy,
      });
      return;
    }
  }
  throw new Error(
    `Layer '${layerName}' not found in tile '${tileName}' registry.`,
  );
};

/**
 * Result of createLayerContainers - includes containers and flow metadata
 */
interface LayerContainersResult {
  containers: { [key: string]: HTMLElement };
  /** Flow direction if any layers use flow, undefined otherwise */
  flowDirection?: "x" | "y";
  /** Names of layers that participate in flow (in order) */
  flowLayers: string[];
}

/**
 * Create layer containers for a tile during initialization
 *
 * Returns containers and flow metadata. When flow layers are present,
 * the parent container should use CSS Grid for layout.
 */
munin.createLayerContainers = (
  tileName: string,
): LayerContainersResult => {
  const tileRegistry = MuninBuilder.tileRegistry[tileName];
  if (!tileRegistry) {
    throw new Error(
      `Tile '${tileName}' not found in registry. Register it first with munin.registerLayers('${tileName}', {...})`,
    );
  }

  const containers: { [key: string]: HTMLElement } = {};
  const flowLayers: string[] = [];
  let flowDirection: "x" | "y" | undefined;

  const sortedEntries = Object.entries(tileRegistry).sort(
    (a, b) => parseInt(a[0]) - parseInt(b[0]),
  );

  sortedEntries.forEach(([zIndex, layerDef]) => {
    const layerName = typeof layerDef === "string" ? layerDef : layerDef.name;
    const layer_type =
      typeof layerDef === "string"
        ? "reactive"
        : layerDef.layer_type || "reactive";
    const persistentLayer =
      typeof layerDef === "object" ? layerDef.persistentLayer : undefined;
    const flow =
      typeof layerDef === "object" ? layerDef.flow : undefined;

    const container = document.createElement("div");
    container.className = `munin-layer munin-layer-${layerName}`;
    container.dataset.zIndex = zIndex;
    container.dataset.layerName = layerName;
    container.dataset.layer_type = layer_type;
    container.dataset.strategy = layer_type;

    // Handle flow attribute
    if (flow === "x" || flow === "y") {
      container.dataset.flow = flow;
      flowLayers.push(layerName);

      // Track flow direction (all flow layers should use same direction)
      if (!flowDirection) {
        flowDirection = flow;
      } else if (flowDirection !== flow) {
        hugin.debug.log(MUNIN, "Warning: Mixed flow directions in tile", {
          tileName,
          layerName,
          existingFlow: flowDirection,
          newFlow: flow,
        });
      }
    }

    if (persistentLayer) {
      (container as any).__persistentLayer = persistentLayer;
      hugin.debug.log(MUNIN, "Layer registered with persistent layer", {
        layerName,
        persistentLayerName: persistentLayer.name,
      });
    }

    containers[layerName] = container;
  });

  hugin.debug.log(MUNIN, "Created layer containers for tile", {
    tileName,
    layerNames: Object.keys(containers),
    flowDirection,
    flowLayers,
  });

  return { containers, flowDirection, flowLayers };
};

/**
 * Update the flow direction for a tile's layers
 *
 * This allows dynamic layout changes (e.g., horizontal ↔ vertical splits)
 * without recreating the DOM structure. Updates both Munin's internal
 * registry and the DOM container attributes.
 *
 * @param tileName - The tile whose flow direction to update
 * @param newDirection - The new flow direction ("x" for horizontal, "y" for vertical)
 * @param container - The DOM container to update attributes on
 * @returns Updated flow metadata
 *
 * @example
 * // Switch from horizontal to vertical split
 * munin.updateFlowDirection('tiles-container', 'y', tilesContainer);
 */
munin.updateFlowDirection = (
  tileName: string,
  newDirection: "x" | "y",
  container: HTMLElement,
): { flowDirection: "x" | "y"; flowLayers: string[] } => {
  const tileRegistry = MuninBuilder.tileRegistry[tileName];
  if (!tileRegistry) {
    throw new Error(
      `Tile '${tileName}' not found in registry. Register it first with munin.registerLayers('${tileName}', {...})`,
    );
  }

  const flowLayers: string[] = [];

  // Update flow direction in registry for all flow layers
  for (const [_zIndex, layerDef] of Object.entries(tileRegistry)) {
    if (typeof layerDef === "object" && layerDef.flow) {
      // Update the flow direction in the registry
      layerDef.flow = newDirection;
      flowLayers.push(layerDef.name);

      // Update the corresponding DOM element if it exists
      const layerElement = container.querySelector(
        `.munin-layer-${layerDef.name}`,
      ) as HTMLElement | null;
      if (layerElement) {
        layerElement.dataset.flow = newDirection;
      }
    }
  }

  // Update container attributes
  if (flowLayers.length > 0) {
    container.dataset.hasFlow = "true";
    container.dataset.flowDirection = newDirection;
  }

  hugin.debug.log(MUNIN, "Updated flow direction for tile", {
    tileName,
    newDirection,
    flowLayers,
  });

  return { flowDirection: newDirection, flowLayers };
};

/**
 * Get the current flow configuration for a tile
 *
 * @param tileName - The tile to query
 * @returns Current flow direction and participating layers, or undefined if no flow
 */
munin.getFlowConfig = (
  tileName: string,
): { flowDirection: "x" | "y"; flowLayers: string[] } | undefined => {
  const tileRegistry = MuninBuilder.tileRegistry[tileName];
  if (!tileRegistry) {
    return undefined;
  }

  const flowLayers: string[] = [];
  let flowDirection: "x" | "y" | undefined;

  for (const [_, layerDef] of Object.entries(tileRegistry)) {
    if (typeof layerDef === "object" && layerDef.flow) {
      if (!flowDirection) {
        flowDirection = layerDef.flow as "x" | "y";
      }
      flowLayers.push(layerDef.name);
    }
  }

  if (!flowDirection || flowLayers.length === 0) {
    return undefined;
  }

  return { flowDirection, flowLayers };
};

// ==================================================================================
// LAYER COMPOSITION SYSTEM
// ==================================================================================

type RenderStrategy = "reactive" | "static" | "persistent";

/**
 * Flow direction for layers:
 * - "y": Participates in vertical document flow (grid rows)
 * - "x": Participates in horizontal document flow (grid columns)
 * - "z" or undefined: Spatial overlay (absolute positioning, uses z-index for stacking)
 */
type FlowDirection = "x" | "y" | "z";

interface LayerDefinition {
  name: string;
  layer_type?: RenderStrategy;
  strategy?: RenderStrategy;
  persistentLayer?: import("./types").PersistentLayerStrategy;
  /**
   * Flow direction for this layer:
   * - "y": Stacks vertically in document flow
   * - "x": Stacks horizontally in document flow
   * - "z" or omitted: Spatial overlay (spans all flow layers, uses z-index)
   */
  flow?: FlowDirection;
}

interface LayerRegistry {
  [zIndex: number]: string | LayerDefinition;
}

interface TileRegistry {
  [tileName: string]: LayerRegistry;
}

interface LayerConfig {
  name: string;
  zIndex: number;
  content: Collectable;
  renderStrategy: RenderStrategy;
}

/**
 * Fluent layer builder class
 *
 * Now accepts Collectable (templates, conditionals, matches) instead of DocumentFragment.
 * Collection happens in renderComponents() with proper context injection.
 */
class MuninBuilder {
  private layers: LayerConfig[] = [];
  public static tileRegistry: TileRegistry = {};
  private tileName: string;

  constructor(tileName: string = "global") {
    this.tileName = tileName;
  }

  /**
   * Add a layer to the composition
   * Accepts MuninTemplate, ConditionalTemplate, or MatchBuilder (all lazy!)
   */
  layer(name: string, content: Collectable): MuninBuilder {
    const { zIndex, strategy } = this.getLayerConfig(name);

    this.layers.push({
      name,
      zIndex,
      content,
      renderStrategy: strategy,
    });
    return this;
  }

  /**
   * Collect all layers into a single DocumentFragment (simple mode)
   *
   * Use this when you don't need layer-level or component-level granularity.
   * All layers are collected and merged into one container.
   */
  collect(): DocumentFragment {
    const container = document.createElement("div");
    container.className = "munin-layered-container";

    const sortedLayers = this.layers.sort((a, b) => a.zIndex - b.zIndex);

    sortedLayers.forEach((layer) => {
      // Collect the template with root context (tile-scoped)
      const fragment = layer.content.collect({ parentId: null, position: 0, tileName: this.tileName });

      if (!fragment.hasChildNodes()) return;

      const layerContainer = document.createElement("div");
      layerContainer.className = `munin-layer munin-layer-${layer.name}`;
      layerContainer.dataset.zIndex = layer.zIndex.toString();

      layerContainer.appendChild(fragment);
      container.appendChild(layerContainer);
    });

    const fragment = document.createDocumentFragment();
    fragment.appendChild(container);
    return fragment;
  }

  /**
   * Collect layers into separate DocumentFragments
   *
   * Use this when you need layer-level update granularity but don't need
   * component-level surgical updates.
   *
   * @returns Object with fragments keyed by layer name
   */
  collectLayers(): { fragments: { [key: string]: DocumentFragment } } {
    const fragments: { [key: string]: DocumentFragment } = {};

    const sortedLayers = this.layers.sort((a, b) => a.zIndex - b.zIndex);

    sortedLayers.forEach((layer) => {
      // Collect with root context for this layer (tile-scoped)
      const collectedFragment = layer.content.collect({
        parentId: null,
        position: 0,
        tileName: this.tileName,
      });
      const fragment = document.createDocumentFragment();

      if (collectedFragment.hasChildNodes()) {
        while (collectedFragment.firstChild) {
          fragment.appendChild(collectedFragment.firstChild);
        }

        const cleanup = (collectedFragment as any).__muninCleanup;
        if (cleanup) {
          (fragment as any).__muninCleanup = cleanup;
        }
      }

      fragments[layer.name] = fragment;
    });

    hugin.debug.log(MUNIN, "Collected layer fragments", {
      tileName: this.tileName,
      fragmentCount: Object.keys(fragments).length,
    });
    return { fragments };
  }

  /**
   * Component tree entry - includes cache key and optional CSS variables
   */
  static TreeEntry: { cacheKey: string; cssVars?: Record<string, string> };

  /**
   * Collect layers with component trees for surgical DOM updates
   *
   * THIS IS THE MAIN COLLECTION POINT for reactive UIs!
   * All templates are collected here with proper context injection.
   * Returns both fragments (for rendering) and trees (for diffing).
   *
   * @returns Object with fragments and component trees keyed by layer name
   */
  collectComponents(): {
    fragments: { [key: string]: DocumentFragment };
    tree: { [key: string]: { [muninId: string]: { cacheKey: string; cssVars?: Record<string, string> } } };
  } {
    const fragments: { [key: string]: DocumentFragment } = {};
    const tree: { [key: string]: { [muninId: string]: { cacheKey: string; cssVars?: Record<string, string> } } } = {};

    const sortedLayers = this.layers.sort((a, b) => a.zIndex - b.zIndex);

    sortedLayers.forEach((layer) => {
      // COLLECTION POINT: Execute the template with branch context
      // tileName+layerName are passed so the branch node is named branch-{tileName}-{layerName}-{hash}
      const collectedFragment = layer.content.collect({
        parentId: null,
        position: 0,
        layerName: layer.name,
        tileName: this.tileName,
      });
      const fragment = document.createDocumentFragment();

      if (collectedFragment.hasChildNodes()) {
        while (collectedFragment.firstChild) {
          fragment.appendChild(collectedFragment.firstChild);
        }

        const cleanup = (collectedFragment as any).__muninCleanup;
        if (cleanup) {
          (fragment as any).__muninCleanup = cleanup;
        }

        // Build flat tree for this layer
        const component = (collectedFragment as any).__muninComponent;
        if (component) {
          tree[layer.name] = this.buildFlatTree(component);

          hugin.debug.log(MUNIN, "Built flat tree for layer", {
            tileName: this.tileName,
            layerName: layer.name,
            componentCount: Object.keys(tree[layer.name]).length,
          });
        }
      }

      fragments[layer.name] = fragment;
    });

    hugin.debug.log(MUNIN, "Collected component-based layers", {
      tileName: this.tileName,
      fragmentCount: Object.keys(fragments).length,
      treeLayerCount: Object.keys(tree).length,
    });

    return { fragments, tree };
  }

  /**
   * Build flat tree from component hierarchy
   * Now includes CSS variables for style-only updates
   */
  private buildFlatTree(component: MuninComponent): {
    [muninId: string]: { cacheKey: string; cssVars?: Record<string, string> };
  } {
    const flat: { [muninId: string]: { cacheKey: string; cssVars?: Record<string, string> } } = {};

    const extract = (comp: MuninComponent) => {
      flat[comp.muninId] = {
        cacheKey: comp.cacheKey,
        cssVars: comp.cssVars,
      };
      comp.children.forEach((child) => extract(child));
    };

    extract(component);
    return flat;
  }

  /**
   * Get layer configuration from tile registry
   */
  private getLayerConfig(name: string): {
    zIndex: number;
    strategy: RenderStrategy;
  } {
    const tileRegistry = MuninBuilder.tileRegistry[this.tileName];
    if (!tileRegistry) {
      const contextHelp =
        this.tileName === "global"
          ? "Register global layers with munin.registerLayers('global', {...})"
          : `Register it first with munin.registerLayers('${this.tileName}', {...})`;
      throw new Error(
        `Tile '${this.tileName}' not found in registry. ${contextHelp}`,
      );
    }

    for (const [zIndex, layerDef] of Object.entries(tileRegistry)) {
      const layerName = typeof layerDef === "string" ? layerDef : layerDef.name;
      const strategy =
        typeof layerDef === "string"
          ? "reactive"
          : layerDef.strategy || "reactive";

      if (layerName === name) {
        return { zIndex: parseInt(zIndex), strategy };
      }
    }
    throw new Error(
      `Layer '${name}' not found in tile '${this.tileName}' registry.`,
    );
  }

  static registerLayers(tileName: string, registry: LayerRegistry): void {
    this.tileRegistry[tileName] = registry;
  }
}

// ==================================================================================
// LEGACY EXPORTS FOR BACKWARDS COMPATIBILITY
// ==================================================================================

/**
 * Legacy conditional function - wraps a template with conditional rendering
 * @deprecated Use munin`...`.when(condition) instead
 */
export const conditional = (
  template: MuninTemplate,
): { when(condition: boolean): ConditionalTemplate } => {
  return {
    when: (condition: boolean) => new ConditionalTemplate(template, condition),
  };
};

/**
 * Main Munin package with layer composition capabilities
 */
export const Munin = {
  registerLayers: (tileName: string, registry: LayerRegistry) => {
    MuninBuilder.registerLayers(tileName, registry);
  },

  layer: (name: string, content: Collectable) => {
    return new MuninBuilder().layer(name, content);
  },

  template: munin,
};
