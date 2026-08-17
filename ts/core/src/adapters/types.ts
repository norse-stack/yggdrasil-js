// ==================================================================================
// @SECTION: Adapter Types
// Platform adapter interfaces for cross-platform compatibility
// ==================================================================================

/**
 * FileAdapter - Platform file I/O abstraction
 * Implementations: BrowserFileAdapter, TauriFileAdapter, CapacitorFileAdapter
 */
export interface FileAdapter {
  readFile(file: File): Promise<ArrayBuffer>;
}

/**
 * ApiAdapter - Platform HTTP/network abstraction
 * Implementations: FetchApiAdapter, TauriApiAdapter, CapacitorApiAdapter
 */
export interface ApiAdapter {
  get(url: string): Promise<any>;
  post(url: string, data: any): Promise<any>;
  uploadFile(file: File, endpoint: string): Promise<any>;
}

/**
 * StorageAdapter - Platform persistence abstraction
 * Implementations: LocalStorageAdapter, TauriStoreAdapter, CapacitorStorageAdapter
 */
export interface StorageAdapter {
  save(key: string, data: any): Promise<void>;
  load(key: string): Promise<any>;
  remove(key: string): Promise<void>;
}

/**
 * Platform adapter bundle
 */
export interface PlatformAdapters {
  file: FileAdapter;
  api: ApiAdapter;
  storage: StorageAdapter;
}
