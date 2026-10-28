import JSZip from 'jszip';
import { db } from './database';
import { BackupConflict, BackupManifest, CollectionItem, DocumentItem } from '../types';

export interface BackupValidationResult {
  isValid: boolean;
  error?: string;
  manifest?: BackupManifest;
  newDocuments: DocumentItem[];
  conflicts: BackupConflict[];
  missingFiles: string[];
}

export const backupService = {
  /**
   * Export entire vault to a clean ZIP archive with manifest.json and original PDF binaries
   */
  async exportBackup(onProgress?: (percent: number, status: string) => void): Promise<Blob> {
    const zip = new JSZip();

    if (onProgress) onProgress(5, 'Gathering document metadata...');
    const documents = await db.documents.toArray();
    const collections = await db.collections.toArray();

    const manifest: BackupManifest = {
      version: '1.0.0',
      appName: 'DocPocket',
      exportedAt: Date.now(),
      totalDocuments: documents.length,
      collections,
      documents,
    };

    // Store manifest JSON in root of ZIP
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const filesFolder = zip.folder('files');
    if (!filesFolder) {
      throw new Error('Could not create files directory in ZIP');
    }

    const total = documents.length;
    for (let i = 0; i < total; i++) {
      const doc = documents[i];
      if (onProgress) {
        const percent = 10 + Math.floor((i / Math.max(total, 1)) * 70);
        onProgress(percent, `Packing ${doc.displayName}... (${i + 1}/${total})`);
      }

      const binaryRecord = await db.binaries.get(doc.id);
      if (binaryRecord) {
        filesFolder.file(`${doc.id}.pdf`, binaryRecord.data);
      }
    }

    if (onProgress) onProgress(85, 'Compressing archive...');
    const zipBlob = await zip.generateAsync(
      {
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      },
      metadata => {
        if (onProgress) {
          onProgress(85 + Math.floor(metadata.percent * 0.15), `Generating zip (${Math.round(metadata.percent)}%)...`);
        }
      }
    );

    if (onProgress) onProgress(100, 'Backup generated!');
    return zipBlob;
  },

  /**
   * Triggers download of the exported ZIP file
   */
  async triggerBackupDownload(): Promise<void> {
    const blob = await this.exportBackup();
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `DocPocket_Backup_${dateStr}.zip`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },

  /**
   * Validate an uploaded ZIP backup without committing any changes yet
   */
  async validateBackupFile(file: File): Promise<{ zip: JSZip; validation: BackupValidationResult }> {
    const zip = new JSZip();
    let loadedZip: JSZip;
    try {
      loadedZip = await zip.loadAsync(file);
    } catch {
      return {
        zip,
        validation: {
          isValid: false,
          error: 'The provided file is not a valid or readable ZIP archive.',
          newDocuments: [],
          conflicts: [],
          missingFiles: [],
        },
      };
    }

    const manifestEntry = loadedZip.file('manifest.json');
    if (!manifestEntry) {
      return {
        zip: loadedZip,
        validation: {
          isValid: false,
          error: 'Invalid backup structure: "manifest.json" was not found in the archive.',
          newDocuments: [],
          conflicts: [],
          missingFiles: [],
        },
      };
    }

    let manifest: BackupManifest;
    try {
      const manifestText = await manifestEntry.async('string');
      manifest = JSON.parse(manifestText);
      if (!Array.isArray(manifest.documents) || !Array.isArray(manifest.collections)) {
        throw new Error('Malformed manifest format.');
      }
    } catch {
      return {
        zip: loadedZip,
        validation: {
          isValid: false,
          error: 'Failed to read manifest.json: the file is corrupted or formatted incorrectly.',
          newDocuments: [],
          conflicts: [],
          missingFiles: [],
        },
      };
    }

    // Check files existence in zip
    const missingFiles: string[] = [];
    for (const doc of manifest.documents) {
      const entry = loadedZip.file(`files/${doc.id}.pdf`);
      if (!entry) {
        missingFiles.push(`${doc.displayName} (${doc.id}.pdf)`);
      }
    }

    // Detect conflicts with current database
    const existingDocs = await db.documents.toArray();
    const conflicts: BackupConflict[] = [];
    const newDocuments: DocumentItem[] = [];

    for (const incDoc of manifest.documents) {
      // 1. By ID match
      const sameId = existingDocs.find(d => d.id === incDoc.id);
      if (sameId) {
        conflicts.push({
          existingDoc: sameId,
          incomingDoc: incDoc,
          reason: 'same_id',
          resolution: 'skip',
        });
        continue;
      }

      // 2. By exact fileHash match
      if (incDoc.fileHash) {
        const sameHash = existingDocs.find(d => d.fileHash === incDoc.fileHash);
        if (sameHash) {
          conflicts.push({
            existingDoc: sameHash,
            incomingDoc: incDoc,
            reason: 'exact_hash',
            resolution: 'skip',
          });
          continue;
        }
      }

      // 3. By identical filename and size
      const sameNameSize = existingDocs.find(
        d => d.fileName === incDoc.fileName && d.fileSize === incDoc.fileSize
      );
      if (sameNameSize) {
        conflicts.push({
          existingDoc: sameNameSize,
          incomingDoc: incDoc,
          reason: 'same_name_and_size',
          resolution: 'skip',
        });
        continue;
      }

      newDocuments.push(incDoc);
    }

    return {
      zip: loadedZip,
      validation: {
        isValid: true,
        manifest,
        newDocuments,
        conflicts,
        missingFiles,
      },
    };
  },

  /**
   * Execute restoration of validated backup with chosen conflict resolution strategy
   */
  async executeRestore(
    zip: JSZip,
    manifest: BackupManifest,
    resolutions: Map<string, 'skip' | 'keep_both' | 'overwrite'>,
    onProgress?: (percent: number, status: string) => void
  ): Promise<{ restoredDocs: number; skippedDocs: number; overwrittenDocs: number }> {
    let restoredDocs = 0;
    let skippedDocs = 0;
    let overwrittenDocs = 0;

    // 1. Restore Collections (merge without overwriting system collections)
    if (onProgress) onProgress(10, 'Merging collections...');
    const currentCollections = await db.collections.toArray();
    const currentCollIds = new Set(currentCollections.map(c => c.id));

    for (const col of manifest.collections) {
      if (!currentCollIds.has(col.id)) {
        await db.collections.add(col);
      }
    }

    // 2. Process documents
    const total = manifest.documents.length;
    for (let i = 0; i < total; i++) {
      const doc = manifest.documents[i];
      if (onProgress) {
        const percent = 20 + Math.floor((i / Math.max(total, 1)) * 75);
        onProgress(percent, `Restoring ${doc.displayName}... (${i + 1}/${total})`);
      }

      const resolution = resolutions.get(doc.id) || 'keep_both';

      if (resolution === 'skip') {
        skippedDocs++;
        continue;
      }

      const fileEntry = zip.file(`files/${doc.id}.pdf`);
      if (!fileEntry) {
        // Binary file missing in archive, skip safely
        skippedDocs++;
        continue;
      }

      const arrayBuffer = await fileEntry.async('arraybuffer');

      if (resolution === 'overwrite') {
        await db.transaction('rw', [db.documents, db.binaries], async () => {
          await db.documents.put(doc);
          await db.binaries.put({
            id: doc.id,
            data: arrayBuffer,
          });
        });
        overwrittenDocs++;
      } else {
        // 'keep_both' or brand new doc
        const existingDoc = await db.documents.get(doc.id);
        const targetId = existingDoc
          ? `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
          : doc.id;
        const targetDisplayName = existingDoc ? `${doc.displayName} (Restored Copy)` : doc.displayName;

        const restoredItem: DocumentItem = {
          ...doc,
          id: targetId,
          displayName: targetDisplayName,
          importedAt: Date.now(),
        };

        await db.transaction('rw', [db.documents, db.binaries], async () => {
          await db.documents.put(restoredItem);
          await db.binaries.put({
            id: targetId,
            data: arrayBuffer,
          });
        });
        restoredDocs++;
      }
    }

    if (onProgress) onProgress(100, 'Restoration complete!');
    return { restoredDocs, skippedDocs, overwrittenDocs };
  },
};
