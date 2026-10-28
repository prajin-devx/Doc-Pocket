import { db } from './database';

export interface StorageStats {
  documentCount: number;
  collectionCount: number;
  favoriteCount: number;
  pinnedCount: number;
  totalPdfBytes: number;
  estimatedBrowserUsageBytes: number;
  estimatedBrowserQuotaBytes: number;
  usagePercentage: number;
  isStoragePersisted?: boolean;
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export const storageService = {
  async getStorageStats(): Promise<StorageStats> {
    const documents = await db.documents.toArray();
    const collectionCount = await db.collections.count();

    let totalPdfBytes = 0;
    let favoriteCount = 0;
    let pinnedCount = 0;

    for (const doc of documents) {
      totalPdfBytes += doc.fileSize || 0;
      if (doc.isFavorite) favoriteCount++;
      if (doc.isPinned) pinnedCount++;
    }

    let estimatedBrowserUsageBytes = totalPdfBytes;
    let estimatedBrowserQuotaBytes = 1024 * 1024 * 1024; // fallback 1GB
    let isStoragePersisted = false;

    if (typeof navigator !== 'undefined' && navigator.storage) {
      if (navigator.storage.estimate) {
        try {
          const estimate = await navigator.storage.estimate();
          estimatedBrowserUsageBytes = estimate.usage || totalPdfBytes;
          estimatedBrowserQuotaBytes = estimate.quota || estimatedBrowserQuotaBytes;
        } catch {
          // ignore
        }
      }

      if (navigator.storage.persisted) {
        try {
          isStoragePersisted = await navigator.storage.persisted();
        } catch {
          // ignore
        }
      }
    }

    const usagePercentage = estimatedBrowserQuotaBytes > 0
      ? Math.min(100, Math.round((estimatedBrowserUsageBytes / estimatedBrowserQuotaBytes) * 100))
      : 0;

    return {
      documentCount: documents.length,
      collectionCount,
      favoriteCount,
      pinnedCount,
      totalPdfBytes,
      estimatedBrowserUsageBytes,
      estimatedBrowserQuotaBytes,
      usagePercentage,
      isStoragePersisted,
    };
  },

  async requestPersistentStorage(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
    return false;
  },

  /**
   * Clears all user documents and binaries from IndexedDB. Preserves default collections.
   */
  async clearAllDocuments(): Promise<void> {
    await db.transaction('rw', [db.documents, db.binaries], async () => {
      await db.documents.clear();
      await db.binaries.clear();
    });
  },

  /**
   * Resets entire database back to pristine initial state
   */
  async resetEntireVault(): Promise<void> {
    await db.transaction('rw', [db.documents, db.binaries, db.collections, db.settings], async () => {
      await db.documents.clear();
      await db.binaries.clear();
      await db.collections.clear();
      await db.settings.clear();
    });
  },
};
