import { db } from './database';
import { DocumentItem, DocumentBinary } from '../types';
import { inspectPDF } from './pdf-service';

export interface ImportResult {
  document: DocumentItem;
  isDuplicate: boolean;
  duplicateOf?: DocumentItem;
}

export interface ImportOptions {
  category?: string;
  tags?: string[];
  description?: string;
  skipDuplicateCheck?: boolean;
}

export const documentService = {
  /**
   * Import a single PDF File object from file picker
   */
  async importFile(file: File, options?: ImportOptions): Promise<ImportResult> {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      throw new Error(`"${file.name}" is not a valid PDF file.`);
    }

    const arrayBuffer = await file.arrayBuffer();
    return this.importArrayBuffer(arrayBuffer, file.name, file.size, options);
  },

  /**
   * Import PDF from raw ArrayBuffer
   */
  async importArrayBuffer(
    buffer: ArrayBuffer,
    fileName: string,
    fileSize: number,
    options?: ImportOptions
  ): Promise<ImportResult> {
    const inspected = await inspectPDF(buffer);

    // Check for duplicate by hash if not skipped
    let duplicateOf: DocumentItem | undefined;
    if (!options?.skipDuplicateCheck) {
      duplicateOf = await db.documents
        .where('fileHash')
        .equals(inspected.fileHash)
        .first();

      if (!duplicateOf) {
        // Also check by exact filename and size
        duplicateOf = await db.documents
          .where('fileName')
          .equals(fileName)
          .and(doc => doc.fileSize === fileSize)
          .first();
      }
    }

    // Default display name clean up
    const cleanDisplayName = inspected.extractedTitle || fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

    const newDocId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newDoc: DocumentItem = {
      id: newDocId,
      fileName,
      displayName: cleanDisplayName.trim() || fileName,
      fileSize,
      pageCount: inspected.pageCount,
      thumbnailDataUrl: inspected.thumbnailDataUrl,
      category: options?.category || 'inbox',
      tags: options?.tags || [],
      description: options?.description || '',
      isFavorite: false,
      isPinned: false,
      importedAt: Date.now(),
      fileHash: inspected.fileHash,
      version: 1,
    };

    // Transactionally store metadata and binary
    await db.transaction('rw', [db.documents, db.binaries], async () => {
      await db.documents.add(newDoc);
      await db.binaries.add({
        id: newDocId,
        data: buffer,
      });
    });

    return {
      document: newDoc,
      isDuplicate: !!duplicateOf,
      duplicateOf,
    };
  },

  /**
   * Import multiple files
   */
  async importMultipleFiles(
    files: File[],
    options?: ImportOptions,
    onProgress?: (processed: number, total: number, currentName: string) => void
  ): Promise<{ imported: DocumentItem[]; duplicates: { file: File; existing: DocumentItem }[]; errors: { name: string; error: string }[] }> {
    const imported: DocumentItem[] = [];
    const duplicates: { file: File; existing: DocumentItem }[] = [];
    const errors: { name: string; error: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (onProgress) {
        onProgress(i + 1, files.length, file.name);
      }

      try {
        const res = await this.importFile(file, options);
        if (res.isDuplicate && res.duplicateOf) {
          duplicates.push({ file, existing: res.duplicateOf });
        }
        imported.push(res.document);
      } catch (err) {
        errors.push({
          name: file.name,
          error: err instanceof Error ? err.message : 'Unknown error during import',
        });
      }
    }

    return { imported, duplicates, errors };
  },

  /**
   * Retrieve PDF binary for reading or downloading
   */
  async getDocumentBinary(id: string): Promise<ArrayBuffer | null> {
    const binaryRecord = await db.binaries.get(id);
    return binaryRecord ? binaryRecord.data : null;
  },

  /**
   * Retrieve document metadata by ID
   */
  async getDocument(id: string): Promise<DocumentItem | undefined> {
    return db.documents.get(id);
  },

  /**
   * Get all documents
   */
  async getAllDocuments(): Promise<DocumentItem[]> {
    return db.documents.toArray();
  },

  /**
   * Record that a document was opened
   */
  async recordOpened(id: string): Promise<void> {
    await db.documents.update(id, { lastOpenedAt: Date.now() });
  },

  /**
   * Update document details (displayName, category, tags, description)
   */
  async updateDocument(
    id: string,
    updates: Partial<Pick<DocumentItem, 'displayName' | 'category' | 'tags' | 'description' | 'isFavorite' | 'isPinned'>>
  ): Promise<void> {
    await db.documents.update(id, updates);
  },

  /**
   * Toggle favorite
   */
  async toggleFavorite(id: string): Promise<boolean> {
    const doc = await db.documents.get(id);
    if (!doc) return false;
    const newVal = !doc.isFavorite;
    await db.documents.update(id, { isFavorite: newVal });
    return newVal;
  },

  /**
   * Toggle pinned
   */
  async togglePinned(id: string): Promise<boolean> {
    const doc = await db.documents.get(id);
    if (!doc) return false;
    const newVal = !doc.isPinned;
    await db.documents.update(id, { isPinned: newVal });
    return newVal;
  },

  /**
   * Delete a document and its stored binary
   */
  async deleteDocument(id: string): Promise<void> {
    await db.transaction('rw', [db.documents, db.binaries], async () => {
      await db.documents.delete(id);
      await db.binaries.delete(id);
    });
  },

  /**
   * Bulk delete
   */
  async deleteMultipleDocuments(ids: string[]): Promise<void> {
    await db.transaction('rw', [db.documents, db.binaries], async () => {
      await db.documents.bulkDelete(ids);
      await db.binaries.bulkDelete(ids);
    });
  },

  /**
   * Get all unique tags across all documents
   */
  async getAllTags(): Promise<string[]> {
    const docs = await db.documents.toArray();
    const tagSet = new Set<string>();
    for (const doc of docs) {
      if (doc.tags) {
        doc.tags.forEach(t => tagSet.add(t));
      }
    }
    return Array.from(tagSet).sort();
  },

  /**
   * Get counts per collection
   */
  async getCollectionCounts(): Promise<Record<string, number>> {
    const docs = await db.documents.toArray();
    const counts: Record<string, number> = {};
    for (const doc of docs) {
      const cat = doc.category || 'inbox';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  },

  /**
   * Download the document as a native file
   */
  async downloadDocument(doc: DocumentItem): Promise<void> {
    const binary = await this.getDocumentBinary(doc.id);
    if (!binary) {
      throw new Error('PDF data could not be retrieved from IndexedDB.');
    }

    const blob = new Blob([binary], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName.endsWith('.pdf') ? doc.fileName : `${doc.fileName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },
};
