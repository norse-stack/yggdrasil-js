// ==================================================================================
// THEME STATE - Framework-Level Theme Management
// ==================================================================================
// Theme is a framework concern, not an app concern. Any tile can access theme state.
// This provides a single source of truth for theme, replacing the separate ThemeManager.
//
// Usage:
//   this.immediateState.theme.getCurrentTheme()  // 'dark' | 'light' | 'high-contrast'
//   this.immediateState.theme.setTheme('light')
//   this.immediateState.theme.cycleTheme()
//
// See: /docs/frontend/yggdrasil/02-architecture/css-architecture.md

import { hugin } from "../hugin/index.js";

// ==================================================================================
// TYPES
// ==================================================================================

export type Theme = "dark" | "light" | "high-contrast";

export interface ThemeState {
  // Read methods
  getCurrentTheme(): Theme;
  getAvailableThemes(): Theme[];

  // Write methods
  setTheme(theme: Theme): void;
  cycleTheme(): Theme;
  toggleLightDark(): Theme;
  clearPreference(): void;
}

// TypeScript module augmentation - adds theme to ImmediateState interface
declare module "../state/ImmediateState" {
  interface ImmediateState {
    theme: ThemeState;
  }
}

// ==================================================================================
// CONSTANTS
// ==================================================================================

const COMPONENT_NAME = "ThemeState";
const STORAGE_KEY = "yggdrasil-theme";
const AVAILABLE_THEMES: Theme[] = ["dark", "light", "high-contrast"];

// ==================================================================================
// REGISTRATION
// ==================================================================================

/**
 * Register framework-level theme state on ImmediateState.
 * Called automatically during ImmediateState construction.
 *
 * @param immediateState - The ImmediateState instance to register on
 * @param notifyListeners - Callback to notify state subscribers
 */
export function registerThemeState(
  immediateState: any,
  notifyListeners: (query: string) => void,
): void {
  // Private state
  let currentTheme: Theme = "dark";

  // Initialize from localStorage or system preference
  const initializeTheme = (): void => {
    // First, check localStorage
    const savedTheme = localStorage.getItem(STORAGE_KEY) as Theme | null;

    if (savedTheme && isValidTheme(savedTheme)) {
      applyTheme(savedTheme, false); // Don't notify during init
      return;
    }

    // No saved theme — default to dark
    applyTheme("dark", false);
  };

  // Apply theme to DOM and optionally persist
  const applyTheme = (theme: Theme, notify: boolean): void => {
    currentTheme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);

    hugin.debug.log(COMPONENT_NAME, "Theme applied", { theme });

    if (notify) {
      notifyListeners("theme.getCurrentTheme");
    }
  };

  // Type guard
  const isValidTheme = (theme: string): theme is Theme => {
    return AVAILABLE_THEMES.includes(theme as Theme);
  };

  // Create the theme state object
  const themeState: ThemeState = {
    getCurrentTheme: () => currentTheme,

    getAvailableThemes: () => [...AVAILABLE_THEMES],

    setTheme: (theme: Theme) => {
      if (!isValidTheme(theme)) {
        hugin.debug.log(COMPONENT_NAME, "Invalid theme", { theme });
        return;
      }
      applyTheme(theme, true);
    },

    cycleTheme: () => {
      const currentIndex = AVAILABLE_THEMES.indexOf(currentTheme);
      const nextIndex = (currentIndex + 1) % AVAILABLE_THEMES.length;
      const nextTheme = AVAILABLE_THEMES[nextIndex];
      applyTheme(nextTheme, true);
      return nextTheme;
    },

    toggleLightDark: () => {
      const newTheme = currentTheme === "light" ? "dark" : "light";
      applyTheme(newTheme, true);
      return newTheme;
    },

    clearPreference: () => {
      localStorage.removeItem(STORAGE_KEY);
      // Re-initialize to default (dark)
      applyTheme("dark", true);
    },
  };

  // Register on ImmediateState
  immediateState.theme = themeState;

  // Initialize theme
  initializeTheme();

  hugin.debug.log(COMPONENT_NAME, "Theme state registered", {
    initialTheme: currentTheme,
  });
}
