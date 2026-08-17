/* =================================================================================== */
/* THEME MANAGER - Runtime Theme Switching System */
/* =================================================================================== */

export type Theme = 'light' | 'dark' | 'high-contrast';

export class ThemeManager {
  private currentTheme: Theme = 'dark'; // Default to dark theme
  private storageKey = 'yggdrasil-theme';

  constructor() {
    this.initializeTheme();
  }

  /**
   * Set the active theme and persist the choice
   */
  setTheme(theme: Theme): void {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(this.storageKey, theme);
    
    console.log(`🎨 Theme switched to: ${theme}`);
  }

  /**
   * Get the currently active theme
   */
  getCurrentTheme(): Theme {
    return this.currentTheme;
  }

  /**
   * Cycle through available themes
   */
  cycleTheme(): Theme {
    const themes: Theme[] = ['dark', 'light', 'high-contrast'];
    const currentIndex = themes.indexOf(this.currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    const nextTheme = themes[nextIndex];
    
    this.setTheme(nextTheme);
    return nextTheme;
  }

  /**
   * Toggle between light and dark themes (ignoring high-contrast)
   */
  toggleLightDark(): Theme {
    const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
    return newTheme;
  }

  /**
   * Initialize theme from localStorage or system preference
   */
  private initializeTheme(): void {
    // First, check localStorage
    const savedTheme = localStorage.getItem(this.storageKey) as Theme | null;
    
    if (savedTheme && this.isValidTheme(savedTheme)) {
      this.setTheme(savedTheme);
      return;
    }

    // No saved theme — default to dark
    this.setTheme('dark');
  }

  /**
   * Type guard to check if a string is a valid theme
   */
  private isValidTheme(theme: string): theme is Theme {
    return ['light', 'dark', 'high-contrast'].includes(theme);
  }

  /**
   * Get all available themes
   */
  getAvailableThemes(): Theme[] {
    return ['dark', 'light', 'high-contrast'];
  }

  /**
   * Clear saved theme preference (will revert to system preference)
   */
  clearThemePreference(): void {
    localStorage.removeItem(this.storageKey);
    this.setTheme('dark');
  }
}