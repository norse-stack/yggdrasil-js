// ==================================================================================
// UTILS - Bread and Butter Functions
// ==================================================================================
// Universal utilities that can be useful anywhere and everywhere

// Performance Logging
class PerformanceLogger {
  private static instance: PerformanceLogger;
  private startTimes = new Map<string, number>();

  static getInstance(): PerformanceLogger {
    if (!PerformanceLogger.instance) {
      PerformanceLogger.instance = new PerformanceLogger();
    }
    return PerformanceLogger.instance;
  }

  startTimer(key: string): void {
    this.startTimes.set(key, performance.now());
    console.log(
      `⏱️  [${key}] STARTED at ${this.startTimes.get(key)?.toFixed(2)}ms`
    );
  }

  endTimer(key: string, details?: string): number {
    const startTime = this.startTimes.get(key);
    const endTime = performance.now();

    if (!startTime) {
      console.warn(`⚠️  [${key}] No start time found`);
      return 0;
    }

    const duration = endTime - startTime;
    const detailsStr = details ? ` (${details})` : "";
    console.log(
      `✅ [${key}] COMPLETED in ${duration.toFixed(2)}ms${detailsStr}`
    );

    this.startTimes.delete(key);
    return duration;
  }

  mark(event: string, details?: string): void {
    const timestamp = performance.now();
    const detailsStr = details ? ` (${details})` : "";
    console.log(`📍 [${event}] at ${timestamp.toFixed(2)}ms${detailsStr}`);
  }
}

export const perfLogger = PerformanceLogger.getInstance();