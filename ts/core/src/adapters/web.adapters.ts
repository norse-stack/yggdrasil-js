// ==================================================================================
// @SECTION: Web Platform Adapters
// Browser-based implementations of platform adapters
// ==================================================================================

import type { PlatformAdapters } from './types.js';

/**
 * Web platform adapters using browser APIs
 * - File: File API
 * - API: Fetch API
 * - Storage: localStorage
 */
export const webAdapters: PlatformAdapters = {
  file: {
    readFile: async (file: File) => {
      return await file.arrayBuffer();
    },
  },

  api: {
    get: async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    },

    post: async (url: string, data: any) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    },

    uploadFile: async (file: File, endpoint: string) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    },
  },

  storage: {
    save: async (key: string, data: any) => {
      localStorage.setItem(key, JSON.stringify(data));
    },

    load: async (key: string) => {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    },

    remove: async (key: string) => {
      localStorage.removeItem(key);
    },
  },
};
