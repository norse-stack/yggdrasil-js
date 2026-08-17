// Framework imports
import type { StateEvent, EventualActionDefinition } from "../types.js";
import { hugin, EVENTUAL_STATE } from "../hugin/index.js";
import type {
  FileAdapter,
  ApiAdapter,
  StorageAdapter,
} from "../adapters/types.js";
// ==================================================================================
// @SECTION: Eventual State
// EVENTUAL STATE - Generic Side-Effects Coordinator
// ==================================================================================

export class EventualState {
  private listeners = new Map<string, Function[]>();
  private eventHistory: StateEvent[] = [];
  private registeredTiles = new Map<string, any>();

  // ==================================================================================
  // ADAPTERS: Platform abstraction layer
  // Convention: __ prefix indicates "available but prefer services for complex logic"
  // Use directly for simple operations, wrap in services for complex coordination
  // ==================================================================================
  public __fileAdapter: FileAdapter;
  public __apiAdapter: ApiAdapter;
  public __storageAdapter: StorageAdapter;

  // ==================================================================================
  // SERVICES: Business logic layer
  // Complex operations, state coordination, cross-cutting concerns
  // Framework services and external services will be added here
  // ==================================================================================
  // Framework services (opt-out data collection) - to be added
  // External services (no payload data) - to be added

  // READ-ONLY interface for borrowers (tiles) - dynamically populated
  readonly view: any = {};

  // Reactive queries - dynamically populated
  readonly queries: any = {};

  constructor(adapters: {
    file: FileAdapter;
    api: ApiAdapter;
    storage: StorageAdapter;
  }) {
    this.__fileAdapter = adapters.file;
    this.__apiAdapter = adapters.api;
    this.__storageAdapter = adapters.storage;
  }

  // ==================================================================================
  // CONTROLLED SIDE-EFFECTS API - Curated operations for tiles
  // Backwards compatible convenience methods - delegate to __ adapters
  // ==================================================================================

  async readFile(file: File): Promise<ArrayBuffer> {
    try {
      return await this.__fileAdapter.readFile(file);
    } catch (error) {
      throw new Error(`File read failed: ${(error as Error).message}`);
    }
  }

  async uploadFile(file: File, endpoint: string): Promise<any> {
    try {
      return await this.__apiAdapter.uploadFile(file, endpoint);
    } catch (error) {
      throw new Error(`Upload failed: ${(error as Error).message}`);
    }
  }

  async fetchData(url: string): Promise<any> {
    try {
      return await this.__apiAdapter.get(url);
    } catch (error) {
      throw new Error(`Fetch failed: ${(error as Error).message}`);
    }
  }

  async postData(url: string, data: any): Promise<any> {
    try {
      return await this.__apiAdapter.post(url, data);
    } catch (error) {
      throw new Error(`Post failed: ${(error as Error).message}`);
    }
  }

  async saveToStorage(key: string, data: any): Promise<void> {
    try {
      return await this.__storageAdapter.save(key, data);
    } catch (error) {
      throw new Error(`Storage save failed: ${(error as Error).message}`);
    }
  }

  async loadFromStorage(key: string): Promise<any> {
    try {
      return await this.__storageAdapter.load(key);
    } catch (error) {
      throw new Error(`Storage load failed: ${(error as Error).message}`);
    }
  }

  // ==================================================================================
  // TILE REGISTRATION SYSTEM - Dynamic tile registration
  // ==================================================================================

  registerTile(
    tileName: string,
    definitions: EventualActionDefinition[],
  ): void {
    const tileObject: any = {};

    // Process each definition
    definitions.forEach((def) => {
      if (def.initialValue !== undefined && !def.action) {
        // State property - create getter/setter with reactive notifications
        let value = def.initialValue;

        Object.defineProperty(tileObject, def.name, {
          get: () => value,
          set: (newValue: any) => {
            // Add detailed logging for PDF document property changes
            if (tileName === "pdfTile" && def.name === "currentPdfDocument") {
              const oldFileName = value?.file?.name || "none";
              const newFileName = newValue?.file?.name || "none";
              hugin.debug.log(EVENTUAL_STATE, "PDF document property changed", {
                tileName,
                propertyName: def.name,
                from: oldFileName,
                to: newFileName,
                hasNewValue: !!newValue,
                stackTrace:
                  new Error().stack?.split("\n").slice(1, 4).join("\n") ||
                  "no stack",
              });
            }

            value = newValue;
            this.notifyListeners(
              `${tileName}.get${def.name.charAt(0).toUpperCase() + def.name.slice(1)}`,
            );
          },
          enumerable: true,
          configurable: true,
        });

        // Add to queries for subscription system
        this.queries[
          `${tileName}.get${def.name.charAt(0).toUpperCase() + def.name.slice(1)}`
        ] = () => value;

        // Add getter method to view (legacy system)
        if (!this.view[tileName]) this.view[tileName] = {};
        this.view[tileName][
          `get${def.name.charAt(0).toUpperCase() + def.name.slice(1)}`
        ] = () => value;

        // ALSO add getter method to tile object (new unified system)
        const methodName = `get${def.name.charAt(0).toUpperCase() + def.name.slice(1)}`;
        tileObject[methodName] = () => value;
      } else if (def.action) {
        // Action method - bind to tile context with preserved `this`
        const action = def.action; // Capture for type narrowing
        tileObject[def.name] = (...args: any[]) => {
          hugin.debug.log(
            EVENTUAL_STATE,
            "Calling action with preserved context",
            {
              tileName,
              actionName: def.name,
            },
          );
          return action.call(tileObject, ...args);
        };
      }
    });

    // Register the tile
    this.registeredTiles.set(tileName, tileObject);

    // Expose tile on EventualState for coordinator access
    (this as any)[tileName] = tileObject;

    hugin.debug.log(EVENTUAL_STATE, "Registered tile", {
      tileName,
      definitionsCount: definitions.length,
    });
  }

  // ==================================================================================
  // REACTIVE SUBSCRIPTION SYSTEM - Preserved from original architecture
  // ==================================================================================

  subscribe(query: string, callback: (event: StateEvent) => void): () => void {
    if (!this.listeners.has(query)) {
      this.listeners.set(query, []);
    }

    this.listeners.get(query)!.push(callback);

    // Call immediately with current value as event if query exists
    if (this.queries[query]) {
      const currentEvent = this.createEvent(query);
      this.eventHistory.push(currentEvent);
      callback(currentEvent);
    }

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(query);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  private createEvent(query: string): StateEvent {
    return {
      id: crypto.randomUUID(),
      type: query,
      timestamp: Date.now(),
      stateId: "eventual-state",
      data: this.queries[query] ? this.queries[query]() : null,
    };
  }

  // Debugging methods - available in console
  getEventHistory(): StateEvent[] {
    return [...this.eventHistory];
  }

  getEventsAfter(timestamp: number): StateEvent[] {
    return this.eventHistory.filter((e) => e.timestamp > timestamp);
  }

  getRecentEvents(milliseconds: number = 1000): StateEvent[] {
    const cutoff = Date.now() - milliseconds;
    return this.eventHistory.filter((e) => e.timestamp > cutoff);
  }

  private notifyListeners(targetQuery?: string) {
    if (targetQuery) {
      // Targeted notification - only notify listeners for specific query
      const callbacks = this.listeners.get(targetQuery);
      if (callbacks && this.queries[targetQuery]) {
        const event = this.createEvent(targetQuery);
        this.eventHistory.push(event);
        hugin.debug.log(EVENTUAL_STATE, "Notifying listeners for query", {
          targetQuery,
          listenerCount: callbacks.length,
        });
        callbacks.forEach((cb) => cb(event));
      }
    } else {
      // Broadcast notification - notify all listeners (used for initialization)
      hugin.debug.log(EVENTUAL_STATE, "Broadcasting to all listeners", {
        queryTypesCount: this.listeners.size,
      });

      for (const [queryKey, callbacks] of this.listeners) {
        if (this.queries[queryKey]) {
          const event = this.createEvent(queryKey);
          this.eventHistory.push(event);
          callbacks.forEach((cb) => cb(event));
        }
      }
    }
  }
}
