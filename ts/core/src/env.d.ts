// ==================================================================================
// GLOBAL TYPE DECLARATIONS
// ==================================================================================
// Type declarations for environment-specific globals that may or may not exist.
// These allow the package to work with Vite, Astro, or plain Node.js environments.

// ==================================================================================
// BUILD-TIME FLAGS
// ==================================================================================
// These can be defined by bundlers (Vite, esbuild, webpack) for dead code elimination

/** Development mode flag - enables debug features when true */
declare const __DEV__: boolean | undefined;

/** Hugin observability system flag - enables logging when true */
declare const __HUGIN_ENABLED__: boolean | undefined;

// ==================================================================================
// IMPORT.META ENVIRONMENT
// ==================================================================================
// Vite/Astro provide these via import.meta.env
// We augment the existing ImportMeta interface to add optional env property

interface ImportMetaEnv {
  /** True during development */
  readonly DEV?: boolean;
  /** True during production build */
  readonly PROD?: boolean;
  /** Current mode: 'development' | 'production' | custom */
  readonly MODE?: string;
  /** Base URL for the app */
  readonly BASE_URL?: string;
  /** Server-side rendering flag */
  readonly SSR?: boolean;
}

// Augment the global ImportMeta interface
declare global {
  interface ImportMeta {
    readonly env?: ImportMetaEnv;
  }
}

// Note: DOM extensions for Munin (DocumentFragment.__muninCleanup, etc.)
// are declared in src/munin/munin.ts to keep them co-located with the implementation.

export {};
