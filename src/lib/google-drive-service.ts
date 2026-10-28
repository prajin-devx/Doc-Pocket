import { getAccessToken } from './firebase';
import { db } from './database';
import {
  AppSettings,
  BackupManifest,
  CollectionItem,
  DocumentItem,
  GoogleDriveVaultInfo,
} from '../types';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const VAULT_FOLDER_NAME = 'DocPocket Vault';

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  appProperties?: Record<string, string>;
}

export const googleDriveService = {
  /**
   * Cached vault folder ID to minimize round-trips
   */
  _cachedFolderId: null as string | null,

  /**
   * Ensure user is authenticated with Google and has an active token
   */
  async requireToken(): Promise<string> {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('Google Drive access token not available. Please sign in with Google to enable Drive sync.');
    }
    return token;
  },

  /**
   * Locate or create the dedicated 'DocPocket Vault' folder in Google Drive
   */
  async getOrCreateVaultFolder(): Promise<string> {
    if (this._cachedFolderId) {
      return this._cachedFolderId;
    }

    const token = await this.requireToken();

    // Query for existing folder
    const query = `name = '${VAULT_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&spaces=drive`;

    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      throw new Error(`Failed to query Google Drive folder: ${errText}`);
    }

    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      const folderId: string = searchData.files[0].id;
      this._cachedFolderId = folderId;
      return folderId;
    }

    // Create the folder if it does not exist
    const createRes = await fetch(`${DRIVE_API_BASE}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: VAULT_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        description: 'DocPocket Cross-Platform PDF Vault and Backup',
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to create DocPocket Vault folder in Google Drive: ${errText}`);
    }

    const createData = await createRes.json();
    const folderId: string = createData.id;
    this._cachedFolderId = folderId;
    return folderId;
  },

  /**
   * Get status & file counts for the Google Drive vault folder
   */
  async getVaultInfo(): Promise<GoogleDriveVaultInfo | null> {
    try {
      const token = await this.requireToken();
      const folderId = await this.getOrCreateVaultFolder();

      const query = `'${folderId}' in parents and trashed = false`;
      const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,modifiedTime)&spaces=drive&pageSize=100`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return null;

      const data = await res.json();
      const files: DriveFileInfo[] = data.files || [];
      const manifestFile = files.find(f => f.name === 'vault-manifest.json');

      return {
        folderId,
        folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
        manifestFileId: manifestFile?.id,
        fileCount: files.length,
        lastSyncTime: manifestFile?.modifiedTime ? new Date(manifestFile.modifiedTime).getTime() : undefined,
      };
    } catch (err) {
      console.warn('Could not retrieve Drive vault info:', err);
      return null;
    }
  },

  /**
   * List all files inside DocPocket Vault folder
   */
  async listVaultFiles(): Promise<DriveFileInfo[]> {
    const token = await this.requireToken();
    const folderId = await this.getOrCreateVaultFolder();

    const query = `'${folderId}' in parents and trashed = false`;
    const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime,appProperties)&spaces=drive&pageSize=1000`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to list Google Drive files: ${errText}`);
    }

    const data = await res.json();
    return data.files || [];
  },

  /**
   * Upload or update a PDF document file to DocPocket Vault in Google Drive
   */
  async uploadDocument(docItem: DocumentItem, pdfBinary: ArrayBuffer): Promise<string> {
    const token = await this.requireToken();
    const folderId = await this.getOrCreateVaultFolder();

    const existingFiles = await this.listVaultFiles();
    const cleanDocFileName = docItem.displayName.toLowerCase().endsWith('.pdf')
      ? docItem.displayName
      : `${docItem.displayName}.pdf`;

    const existingFile = existingFiles.find(
      f => f.appProperties?.docPocketId === docItem.id || f.name === cleanDocFileName || f.name === `${docItem.id}.pdf`
    );

    if (existingFile) {
      // Update existing file content in Google Drive
      const updateUrl = `${DRIVE_UPLOAD_BASE}/files/${existingFile.id}?uploadType=media`;
      const updateRes = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/pdf',
        },
        body: pdfBinary,
      });

      if (!updateRes.ok) {
        throw new Error(`Failed to update PDF in Google Drive: ${await updateRes.text()}`);
      }
      return existingFile.id;
    }

    // New file: Multipart upload (metadata + binary in 1 request)
    const boundary = '-------DocPocketBoundary' + Date.now();
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: cleanDocFileName,
      parents: [folderId],
      mimeType: 'application/pdf',
      description: docItem.description || `DocPocket Vault: ${docItem.displayName}`,
      appProperties: {
        docPocketId: docItem.id,
        fileHash: docItem.fileHash || '',
        category: docItem.category,
      },
    };

    const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
    const mediaHeader = `${delimiter}Content-Type: application/pdf\r\n\r\n`;

    const enc = new TextEncoder();
    const multipartBody = new Blob(
      [enc.encode(metadataPart), enc.encode(mediaHeader), pdfBinary, enc.encode(closeDelimiter)],
      { type: `multipart/related; boundary=${boundary}` }
    );

    const uploadRes = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: multipartBody,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`Failed to upload PDF to Google Drive: ${err}`);
    }

    const result = await uploadRes.json();
    return result.id;
  },

  /**
   * Save or update the vault-manifest.json in Google Drive
   */
  async uploadManifest(manifest: BackupManifest): Promise<string> {
    const token = await this.requireToken();
    const folderId = await this.getOrCreateVaultFolder();

    const existingFiles = await this.listVaultFiles();
    const existingManifest = existingFiles.find(f => f.name === 'vault-manifest.json');
    const jsonStr = JSON.stringify(manifest, null, 2);

    if (existingManifest) {
      // Update media
      const res = await fetch(`${DRIVE_UPLOAD_BASE}/files/${existingManifest.id}?uploadType=media`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: jsonStr,
      });

      if (!res.ok) {
        throw new Error(`Failed to update vault-manifest in Google Drive: ${await res.text()}`);
      }
      return existingManifest.id;
    }

    // Create manifest
    const boundary = '-------DocPocketManifest' + Date.now();
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: 'vault-manifest.json',
      parents: [folderId],
      mimeType: 'application/json',
      description: 'DocPocket Vault Manifest and Catalog',
    };

    const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
    const mediaHeader = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n`;

    const enc = new TextEncoder();
    const multipartBody = new Blob(
      [enc.encode(metadataPart), enc.encode(mediaHeader), enc.encode(jsonStr), enc.encode(closeDelimiter)],
      { type: `multipart/related; boundary=${boundary}` }
    );

    const res = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: multipartBody,
    });

    if (!res.ok) {
      throw new Error(`Failed to create vault-manifest in Google Drive: ${await res.text()}`);
    }

    const data = await res.json();
    return data.id;
  },

  /**
   * Fetch and parse vault-manifest.json from Google Drive
   */
  async fetchManifest(): Promise<BackupManifest | null> {
    const token = await this.requireToken();
    const existingFiles = await this.listVaultFiles();
    const manifestFile = existingFiles.find(f => f.name === 'vault-manifest.json');
    if (!manifestFile) return null;

    const res = await fetch(`${DRIVE_API_BASE}/files/${manifestFile.id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to download vault-manifest from Google Drive: ${await res.text()}`);
    }

    return await res.json();
  },

  /**
   * Download a PDF binary file by its Google Drive file ID
   */
  async downloadDocumentBinary(fileId: string): Promise<ArrayBuffer> {
    const token = await this.requireToken();
    const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to download document from Google Drive: ${await res.text()}`);
    }

    return await res.arrayBuffer();
  },

  /**
   * Delete a file from Google Drive.
   * Note: Destructive operations must be confirmed in UI prior to invocation.
   */
  async deleteFile(fileId: string): Promise<void> {
    const token = await this.requireToken();
    const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok && res.status !== 404) {
      throw new Error(`Failed to delete file from Google Drive: ${await res.text()}`);
    }
  },

  /**
   * Delete document from Google Drive by document ID
   */
  async deleteDocumentByDocId(docId: string): Promise<void> {
    try {
      const files = await this.listVaultFiles();
      const target = files.find(
        f => f.appProperties?.docPocketId === docId || f.name.startsWith(docId)
      );
      if (target) {
        await this.deleteFile(target.id);
      }
    } catch (err) {
      console.warn('Could not delete remote Drive file for doc:', docId, err);
    }
  },

  /**
   * Full Backup / Sync to Google Drive:
   * Uploads all local documents and updates vault-manifest.json
   */
  async syncAllToDrive(
    settings: AppSettings,
    onProgress?: (percent: number, status: string) => void
  ): Promise<{ uploadedCount: number; manifestId: string; folderUrl: string }> {
    if (onProgress) onProgress(5, 'Connecting to Google Drive...');

    const folderId = await this.getOrCreateVaultFolder();
    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

    if (onProgress) onProgress(15, 'Scanning local vault and drive files...');
    const [localDocs, localCollections, driveFiles] = await Promise.all([
      db.documents.toArray(),
      db.collections.toArray(),
      this.listVaultFiles(),
    ]);

    let uploadedCount = 0;
    const total = localDocs.length;

    for (let i = 0; i < total; i++) {
      const doc = localDocs[i];
      if (onProgress) {
        const percent = 20 + Math.floor((i / Math.max(total, 1)) * 60);
        onProgress(percent, `Backing up "${doc.displayName}" to Google Drive (${i + 1}/${total})...`);
      }

      // Check if file binary exists locally
      const binaryRecord = await db.binaries.get(doc.id);
      if (binaryRecord) {
        await this.uploadDocument(doc, binaryRecord.data);
        uploadedCount++;
      }
    }

    if (onProgress) onProgress(85, 'Updating vault manifest on Google Drive...');
    const manifest: BackupManifest = {
      version: '1.0.0',
      appName: 'DocPocket',
      exportedAt: Date.now(),
      totalDocuments: localDocs.length,
      collections: localCollections,
      documents: localDocs,
      settings,
    };

    const manifestId = await this.uploadManifest(manifest);

    if (onProgress) onProgress(100, 'Google Drive backup complete!');

    return {
      uploadedCount,
      manifestId,
      folderUrl,
    };
  },

  /**
   * Full Cross-Platform Restore / Sync from Google Drive into local IndexedDB
   */
  async restoreFromDrive(
    onProgress?: (percent: number, status: string) => void
  ): Promise<{
    restoredDocs: number;
    restoredCollections: number;
    settings?: AppSettings;
  }> {
    if (onProgress) onProgress(5, 'Connecting to Google Drive...');
    const driveFiles = await this.listVaultFiles();
    const manifest = await this.fetchManifest();

    if (!manifest) {
      throw new Error('No vault-manifest.json found in your Google Drive DocPocket Vault folder.');
    }

    if (onProgress) onProgress(20, 'Restoring collections & structure...');

    // Restore collections
    let restoredCollections = 0;
    if (manifest.collections && manifest.collections.length > 0) {
      for (const col of manifest.collections) {
        await db.collections.put(col);
        restoredCollections++;
      }
    }

    // Download documents
    const totalDocs = manifest.documents?.length || 0;
    let restoredDocs = 0;

    for (let i = 0; i < totalDocs; i++) {
      const doc = manifest.documents[i];
      if (onProgress) {
        const percent = 25 + Math.floor((i / Math.max(totalDocs, 1)) * 65);
        onProgress(percent, `Restoring "${doc.displayName}" from Google Drive (${i + 1}/${totalDocs})...`);
      }

      // Save metadata in Dexie
      await db.documents.put(doc);

      // Check if we need to download the PDF binary
      const localBinary = await db.binaries.get(doc.id);
      if (!localBinary) {
        // Find corresponding file in Drive
        const cleanName = doc.displayName.toLowerCase().endsWith('.pdf')
          ? doc.displayName
          : `${doc.displayName}.pdf`;

        const match = driveFiles.find(
          f => f.appProperties?.docPocketId === doc.id || f.name === cleanName || f.name === `${doc.id}.pdf`
        );

        if (match) {
          try {
            const binaryData = await this.downloadDocumentBinary(match.id);
            await db.binaries.put({ id: doc.id, data: binaryData });
            restoredDocs++;
          } catch (err) {
            console.warn(`Could not download binary for ${doc.displayName}:`, err);
          }
        }
      } else {
        restoredDocs++;
      }
    }

    if (onProgress) onProgress(100, 'Google Drive restore complete!');

    return {
      restoredDocs,
      restoredCollections,
      settings: manifest.settings,
    };
  },
};
