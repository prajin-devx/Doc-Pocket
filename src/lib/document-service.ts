import JSZip from 'jszip';
import { db } from './database';
import { DocumentItem, DocumentBinary, PageBookmark } from '../types';
import { inspectPDF, extractAllPDFText } from './pdf-service';

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
    const cleanDisplayName =
      inspected.extractedTitle || fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

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
      isPasswordProtected: inspected.isPasswordProtected || false,
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
  ): Promise<{
    imported: DocumentItem[];
    duplicates: { file: File; existing: DocumentItem }[];
    errors: { name: string; error: string }[];
  }> {
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
    updates: Partial<
      Pick<
        DocumentItem,
        | 'displayName'
        | 'category'
        | 'tags'
        | 'description'
        | 'isFavorite'
        | 'isPinned'
        | 'isPasswordProtected'
      >
    >
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
   * Batch update category for selected documents
   */
  async batchUpdateCategory(ids: string[], newCategory: string): Promise<void> {
    await db.transaction('rw', db.documents, async () => {
      for (const id of ids) {
        await db.documents.update(id, { category: newCategory });
      }
    });
  },

  /**
   * Batch add tag to selected documents
   */
  async batchAddTag(ids: string[], tagToAdd: string): Promise<void> {
    const cleanTag = tagToAdd.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (!cleanTag) return;

    await db.transaction('rw', db.documents, async () => {
      for (const id of ids) {
        const item = await db.documents.get(id);
        if (item) {
          const currentTags = item.tags || [];
          if (!currentTags.includes(cleanTag)) {
            await db.documents.update(id, { tags: [...currentTags, cleanTag] });
          }
        }
      }
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

  /**
   * Bulk download multiple documents packaged into a single ZIP file
   */
  async downloadBatchAsZip(
    docs: DocumentItem[],
    onProgress?: (percent: number, status: string) => void
  ): Promise<void> {
    if (docs.length === 0) return;

    const zip = new JSZip();
    for (let i = 0; i < docs.length; i++) {
      const d = docs[i];
      if (onProgress) {
        onProgress(Math.floor((i / docs.length) * 80), `Archiving ${d.displayName}...`);
      }
      const binary = await this.getDocumentBinary(d.id);
      if (binary) {
        const safeName = d.fileName.endsWith('.pdf') ? d.fileName : `${d.fileName}.pdf`;
        zip.file(safeName, binary);
      }
    }

    if (onProgress) onProgress(85, 'Compressing ZIP package...');
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `DocPocket_Selected_${docs.length}_Files_${dateStr}.zip`;

    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },

  /**
   * Add a page bookmark with optional notes and color tag to a document
   */
  async addPageBookmark(
    docId: string,
    bookmarkData: Omit<PageBookmark, 'id' | 'createdAt'>
  ): Promise<PageBookmark> {
    const doc = await db.documents.get(docId);
    if (!doc) throw new Error('Document not found');

    const newBookmark: PageBookmark = {
      id: `bm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      pageNumber: bookmarkData.pageNumber,
      title: bookmarkData.title.trim() || `Page ${bookmarkData.pageNumber}`,
      note: bookmarkData.note?.trim() || undefined,
      color: bookmarkData.color || '#38bdf8',
      createdAt: Date.now(),
    };

    const currentBookmarks = doc.pageBookmarks || [];
    const updatedBookmarks = [...currentBookmarks, newBookmark].sort(
      (a, b) => a.pageNumber - b.pageNumber
    );

    await db.documents.update(docId, { pageBookmarks: updatedBookmarks });
    return newBookmark;
  },

  /**
   * Remove a page bookmark by ID
   */
  async deletePageBookmark(docId: string, bookmarkId: string): Promise<void> {
    const doc = await db.documents.get(docId);
    if (!doc) return;

    const updated = (doc.pageBookmarks || []).filter(b => b.id !== bookmarkId);
    await db.documents.update(docId, { pageBookmarks: updated });
  },

  /**
   * Update a page bookmark's title, note, or color
   */
  async updatePageBookmark(
    docId: string,
    bookmarkId: string,
    updates: Partial<Pick<PageBookmark, 'title' | 'note' | 'color'>>
  ): Promise<void> {
    const doc = await db.documents.get(docId);
    if (!doc) return;

    const updated = (doc.pageBookmarks || []).map(b => {
      if (b.id === bookmarkId) {
        return {
          ...b,
          title: updates.title !== undefined ? updates.title.trim() || b.title : b.title,
          note: updates.note !== undefined ? updates.note.trim() : b.note,
          color: updates.color !== undefined ? updates.color : b.color,
        };
      }
      return b;
    });

    await db.documents.update(docId, { pageBookmarks: updated });
  },

  /**
   * Extracts and caches text for a document to enable instant deep searching and reflow reading
   */
  async extractAndCacheDocumentText(docId: string): Promise<string> {
    const doc = await db.documents.get(docId);
    if (!doc) return '';

    if (doc.extractedTextCache && doc.extractedTextCache.length > 0) {
      return doc.extractedTextCache;
    }

    const binary = await this.getDocumentBinary(docId);
    if (!binary) return '';

    const { fullText } = await extractAllPDFText(binary, 30);
    if (fullText) {
      await db.documents.update(docId, { extractedTextCache: fullText });
    }
    return fullText;
  },

  /**
   * Deep search inside stored PDF contents across the vault
   */
  async searchDocumentsDeep(
    query: string,
    docs: DocumentItem[]
  ): Promise<{
    doc: DocumentItem;
    snippet: string;
  }[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const results: { doc: DocumentItem; snippet: string }[] = [];

    for (const doc of docs) {
      let text = doc.extractedTextCache;
      if (!text) {
        text = await this.extractAndCacheDocumentText(doc.id);
      }

      if (text) {
        const lowerText = text.toLowerCase();
        const matchPos = lowerText.indexOf(q);
        if (matchPos !== -1) {
          const start = Math.max(0, matchPos - 45);
          const end = Math.min(text.length, matchPos + q.length + 65);
          let snippet = text.substring(start, end).replace(/\s+/g, ' ').trim();
          if (start > 0) snippet = '...' + snippet;
          if (end < text.length) snippet = snippet + '...';

          results.push({
            doc,
            snippet,
          });
        }
      }
    }

    return results;
  },
};
