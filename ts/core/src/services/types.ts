// ==================================================================================
// @SECTION: Service System Types
// Service interfaces and result types for the Yggdrasil service layer
// ==================================================================================

/**
 * Base interface for all services in the system
 * Services encapsulate business logic and coordination across adapters
 */
export interface ServiceInterface {
  /** Unique identifier for this service */
  readonly name: string;

  /** Service type - determines data capture rules */
  readonly type: 'framework' | 'external';

  /** Optional: Get current service state for debugging */
  getState?(): Readonly<any>;

  /** Optional: Cleanup method for service teardown */
  destroy?(): Promise<void>;
}

/**
 * Standardized result type for all service operations
 * Provides consistent error handling and metadata tracking
 */
export interface ServiceResult<TData = any> {
  /** Whether the operation succeeded */
  success: boolean;

  /** Result data if successful */
  data?: TData;

  /** Error object if failed */
  error?: Error;

  /** Optional state updates to propagate to ImmediateState */
  stateUpdates?: Record<string, any>;

  /** Metadata for Hugin data capture and debugging */
  metadata: {
    /** Name of the operation performed */
    operationName: string;

    /** Operation duration in milliseconds */
    duration: number;

    /** Timestamp when operation started */
    timestamp: number;

    /** Additional metadata (framework services only) */
    [key: string]: any;
  };
}

/**
 * Helper function to create a successful ServiceResult
 */
export function createSuccessResult<TData>(
  operationName: string,
  data: TData,
  startTime: number,
  additionalMetadata?: Record<string, any>
): ServiceResult<TData> {
  return {
    success: true,
    data,
    metadata: {
      operationName,
      duration: Date.now() - startTime,
      timestamp: startTime,
      ...additionalMetadata,
    },
  };
}

/**
 * Helper function to create a failed ServiceResult
 */
export function createErrorResult(
  operationName: string,
  error: Error,
  startTime: number,
  additionalMetadata?: Record<string, any>
): ServiceResult<never> {
  return {
    success: false,
    error,
    metadata: {
      operationName,
      duration: Date.now() - startTime,
      timestamp: startTime,
      ...additionalMetadata,
    },
  };
}
