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

// Standard category folder names for clean organization inside Google Drive
const CATEGORY_FOLDER_MAP: Record<string, string> = {
  timetable: 'Timetables',
  college: 'College',
  certificates: 'Certificates',
  projects: 'Projects',
  personal: 'Personal',
  subjects: 'Subjects',
  inbox: 'Documents',
};

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  parents?: string[];
  appProperties?: Record<string, string>;
}

export interface AutoSyncResult {
  restoredDocs: number;
  backedUpDocs: number;
  totalSynced: number;
  folderUrl: string;
  settings?: AppSettings;
}

export type SyncState = 'idle' | 'syncing' | 'synced' | 'error';

class GoogleDriveService {
  private _cachedFolderId: string | null = null;
  private _categoryFolderMap: Map<string, string> = new Map();
  private _syncState: SyncState = 'idle';
  private _syncListeners: Set<(state: SyncState, message?: string) => void> = new Set();

  /**
   * Register listener for sync status updates
   */
  public onSyncStatusChange(cb: (state: SyncState, message?: string) => void): () => void {
    this._syncListeners.add(cb);
    return () => this._syncListeners.delete(cb);
  }

  private _notifySync(state: SyncState, message?: string) {
    this._syncState = state;
    this._syncListeners.forEach(listener => listener(state, message));
  }

  public get currentSyncState(): SyncState {
    return this._syncState;
  }

  /**
   * Ensure user is authenticated with Google and has an active token
   */
  async requireToken(): Promise<string> {
    const token = await getAccessToken();
    if (!token) {
      throw new Error('Google Drive access token not available. Please sign in with Google to enable Drive sync.');
    }
    return token;
  }

  /**
   * Locate or create the dedicated 'DocPocket Vault' root folder in Google Drive
   */
  async getOrCreateVaultFolder(): Promise<string> {
    if (this._cachedFolderId) {
      return this._cachedFolderId;
    }

    const token = await this.requireToken();

    // Query for existing root folder
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

    // Create the root folder if it does not exist
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
        appProperties: {
          docPocketVault: 'true',
          isRootVault: 'true',
        },
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
  }

  /**
   * Locate or create an organized category subfolder inside DocPocket Vault (e.g. Timetables, College, etc.)
   */
  async getOrCreateCategoryFolder(categoryId: string): Promise<string> {
    const rootFolderId = await this.getOrCreateVaultFolder();
    const folderName = CATEGORY_FOLDER_MAP[categoryId] || (categoryId.charAt(0).toUpperCase() + categoryId.slice(1));

    if (this._categoryFolderMap.has(folderName)) {
      return this._categoryFolderMap.get(folderName)!;
    }

    const token = await this.requireToken();
    const query = `'${rootFolderId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`;

    const res = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        const id: string = data.files[0].id;
        this._categoryFolderMap.set(folderName, id);
        return id;
      }
    }

    // Create subfolder
    const createRes = await fetch(`${DRIVE_API_BASE}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        parents: [rootFolderId],
        mimeType: 'application/vnd.google-apps.folder',
        description: `DocPocket Vault Category: ${folderName}`,
        appProperties: {
          docPocketVault: 'true',
          category: categoryId,
        },
      }),
    });

    if (!createRes.ok) {
      // Fallback to root folder if subfolder creation fails
      return rootFolderId;
    }

    const created = await createRes.json();
    const subId: string = created.id;
    this._categoryFolderMap.set(folderName, subId);
    return subId;
  }

  /**
   * Pre-initialize vault and all default category folders upon user login
   */
  async initializeUserVault(): Promise<{ rootFolderId: string; folderUrl: string }> {
    const rootFolderId = await this.getOrCreateVaultFolder();

    // Ensure all standard subfolders are created in parallel
    const standardCategories = ['timetable', 'college', 'certificates', 'projects', 'personal', 'subjects', 'inbox'];
    await Promise.all(
      standardCategories.map(cat => this.getOrCreateCategoryFolder(cat).catch(err => console.warn(err)))
    );

    return {
      rootFolderId,
      folderUrl: `https://drive.google.com/drive/folders/${rootFolderId}`,
    };
  }

  /**
   * Get status & file counts for the Google Drive vault folder
   */
  async getVaultInfo(): Promise<GoogleDriveVaultInfo | null> {
    try {
      const token = await this.requireToken();
      const folderId = await this.getOrCreateVaultFolder();

      const files = await this.listAllVaultFiles();
      const manifestFile = files.find(f => f.name === 'vault-manifest.json');
      const pdfFiles = files.filter(f => f.name.endsWith('.pdf'));

      return {
        folderId,
        folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
        manifestFileId: manifestFile?.id,
        fileCount: pdfFiles.length,
        lastSyncTime: manifestFile?.modifiedTime ? new Date(manifestFile.modifiedTime).getTime() : undefined,
      };
    } catch (err) {
      console.warn('Could not retrieve Drive vault info:', err);
      return null;
    }
  }

  /**
   * List all files in the vault (including inside organized subfolders)
   */
  async listAllVaultFiles(): Promise<DriveFileInfo[]> {
    const token = await this.requireToken();
    const rootFolderId = await this.getOrCreateVaultFolder();

    // Search by docPocketVault appProperty or root parent
    const query = `trashed = false and (appProperties has { key='docPocketVault' and value='true' } or '${rootFolderId}' in parents)`;
    const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime,parents,appProperties)&spaces=drive&pageSize=1000`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to list Google Drive files: ${errText}`);
    }

    const data = await res.json();
    return data.files || [];
  }

  /**
   * Upload or update a PDF document file to its organized category subfolder in Google Drive
   */
  async uploadDocument(docItem: DocumentItem, pdfBinary: ArrayBuffer): Promise<string> {
    const token = await this.requireToken();

    // Determine target organized folder (e.g. Timetables, College, Certificates)
    const targetFolderId = await this.getOrCreateCategoryFolder(docItem.category || 'inbox');

    const existingFiles = await this.listAllVaultFiles();
    const cleanDocFileName = docItem.displayName.toLowerCase().endsWith('.pdf')
      ? docItem.displayName
      : `${docItem.displayName}.pdf`;

    const existingFile = existingFiles.find(
      f =>
        f.appProperties?.docPocketId === docItem.id ||
        f.name === cleanDocFileName ||
        f.name === `${docItem.id}.pdf`
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
      parents: [targetFolderId],
      mimeType: 'application/pdf',
      description: docItem.description || `DocPocket Vault: ${docItem.displayName}`,
      appProperties: {
        docPocketVault: 'true',
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
  }

  /**
   * Save or update the vault-manifest.json in the root DocPocket Vault folder
   */
  async uploadManifest(manifest: BackupManifest): Promise<string> {
    const token = await this.requireToken();
    const folderId = await this.getOrCreateVaultFolder();

    const existingFiles = await this.listAllVaultFiles();
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

    // Create manifest in root folder
    const boundary = '-------DocPocketManifest' + Date.now();
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: 'vault-manifest.json',
      parents: [folderId],
      mimeType: 'application/json',
      description: 'DocPocket Vault Manifest and Catalog',
      appProperties: {
        docPocketVault: 'true',
        isManifest: 'true',
      },
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
  }

  /**
   * Fetch and parse vault-manifest.json from Google Drive
   */
  async fetchManifest(): Promise<BackupManifest | null> {
    const token = await this.requireToken();
    const existingFiles = await this.listAllVaultFiles();
    const manifestFile = existingFiles.find(f => f.name === 'vault-manifest.json');
    if (!manifestFile) return null;

    const res = await fetch(`${DRIVE_API_BASE}/files/${manifestFile.id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to download vault-manifest from Google Drive: ${await res.text()}`);
    }

    return await res.json();
  }

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
  }

  /**
   * Delete a file from Google Drive
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
  }

  /**
   * Delete document from Google Drive by document ID
   */
  async deleteDocumentByDocId(docId: string): Promise<void> {
    try {
      const files = await this.listAllVaultFiles();
      const target = files.find(
        f => f.appProperties?.docPocketId === docId || f.name.startsWith(docId)
      );
      if (target) {
        await this.deleteFile(target.id);
      }
    } catch (err) {
      console.warn('Could not delete remote Drive file for doc:', docId, err);
    }
  }

  /**
   * Full Synchronous Auto-Sync on User Login:
   * 1. Initializes root 'DocPocket Vault' and category folders (Timetables, College, etc.)
   * 2. Checks remote manifest:
   *    - If remote manifest exists: restores any missing remote documents into local IndexedDB
   *    - If local has documents missing remotely: uploads them to their category folders in Drive
   *    - Reconciles collections and preferences
   * 3. Saves updated unified manifest
   */
  async performAutoSyncOnLogin(
    settings: AppSettings,
    onProgress?: (percent: number, status: string) => void
  ): Promise<AutoSyncResult> {
    this._notifySync('syncing', 'Connecting to Google Drive...');
    if (onProgress) onProgress(5, 'Organizing Google Drive vault folders...');

    // 1. Initialize vault and folders
    const { folderUrl } = await this.initializeUserVault();

    if (onProgress) onProgress(15, 'Scanning local vault and Google Drive...');
    const [localDocs, localCollections, driveFiles, remoteManifest] = await Promise.all([
      db.documents.toArray(),
      db.collections.toArray(),
      this.listAllVaultFiles(),
      this.fetchManifest().catch(() => null),
    ]);

    let restoredDocs = 0;
    let backedUpDocs = 0;

    if (remoteManifest && remoteManifest.documents && remoteManifest.documents.length > 0) {
      // -------------------------------------------------------------
      // CASE A: Existing Drive Vault — Reconcile & Auto-Restore
      // -------------------------------------------------------------
      this._notifySync('syncing', 'Restoring documents from Google Drive...');

      // 1. Auto-Restore: Any documents in Drive not present locally
      const localDocIds = new Set(localDocs.map(d => d.id));
      const missingLocally = remoteManifest.documents.filter(d => !localDocIds.has(d.id));

      for (let i = 0; i < missingLocally.length; i++) {
        const doc = missingLocally[i];
        if (onProgress) {
          const percent = 20 + Math.floor((i / Math.max(missingLocally.length, 1)) * 40);
          onProgress(percent, `Restoring "${doc.displayName}" from Google Drive (${i + 1}/${missingLocally.length})...`);
        }

        // Save metadata locally
        await db.documents.put(doc);

        // Find binary file in Drive
        const cleanName = doc.displayName.toLowerCase().endsWith('.pdf')
          ? doc.displayName
          : `${doc.displayName}.pdf`;

        const match = driveFiles.find(
          f =>
            f.appProperties?.docPocketId === doc.id ||
            f.name === cleanName ||
            f.name === `${doc.id}.pdf`
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
      }

      // 2. Restore collections
      if (remoteManifest.collections) {
        for (const col of remoteManifest.collections) {
          await db.collections.put(col);
        }
      }

      // 3. Auto-Backup: Any local documents not present in remote Drive
      const remoteDocIds = new Set(remoteManifest.documents.map(d => d.id));
      const missingRemotely = localDocs.filter(d => !remoteDocIds.has(d.id));

      for (let i = 0; i < missingRemotely.length; i++) {
        const doc = missingRemotely[i];
        if (onProgress) {
          const percent = 60 + Math.floor((i / Math.max(missingRemotely.length, 1)) * 30);
          onProgress(percent, `Backing up "${doc.displayName}" to Google Drive (${i + 1}/${missingRemotely.length})...`);
        }

        const binary = await db.binaries.get(doc.id);
        if (binary) {
          await this.uploadDocument(doc, binary.data);
          backedUpDocs++;
        }
      }
    } else {
      // -------------------------------------------------------------
      // CASE B: First-time setup / Fresh Google Account — Initial Auto-Backup
      // -------------------------------------------------------------
      this._notifySync('syncing', 'Backing up local documents to Google Drive...');
      const total = localDocs.length;

      for (let i = 0; i < total; i++) {
        const doc = localDocs[i];
        if (onProgress) {
          const percent = 20 + Math.floor((i / Math.max(total, 1)) * 65);
          onProgress(percent, `Backing up "${doc.displayName}" to Google Drive (${i + 1}/${total})...`);
        }

        const binary = await db.binaries.get(doc.id);
        if (binary) {
          await this.uploadDocument(doc, binary.data);
          backedUpDocs++;
        }
      }
    }

    // 4. Update unified manifest on Google Drive
    if (onProgress) onProgress(92, 'Finalizing vault manifest...');
    const allFinalDocs = await db.documents.toArray();
    const allFinalCols = await db.collections.toArray();

    const updatedManifest: BackupManifest = {
      version: '1.0.0',
      appName: 'DocPocket',
      exportedAt: Date.now(),
      totalDocuments: allFinalDocs.length,
      collections: allFinalCols,
      documents: allFinalDocs,
      settings: remoteManifest?.settings || settings,
    };

    await this.uploadManifest(updatedManifest);

    if (onProgress) onProgress(100, 'Auto-sync complete!');
    this._notifySync('synced', `Synced ${allFinalDocs.length} items with Google Drive`);

    return {
      restoredDocs,
      backedUpDocs,
      totalSynced: allFinalDocs.length,
      folderUrl,
      settings: remoteManifest?.settings,
    };
  }

  /**
   * Manual trigger for full backup to Google Drive
   */
  async syncAllToDrive(
    settings: AppSettings,
    onProgress?: (percent: number, status: string) => void
  ): Promise<{ uploadedCount: number; manifestId: string; folderUrl: string }> {
    const res = await this.performAutoSyncOnLogin(settings, onProgress);
    return {
      uploadedCount: res.backedUpDocs,
      manifestId: 'vault-manifest.json',
      folderUrl: res.folderUrl,
    };
  }

  /**
   * Manual trigger for full restore from Google Drive
   */
  async restoreFromDrive(
    onProgress?: (percent: number, status: string) => void
  ): Promise<{
    restoredDocs: number;
    restoredCollections: number;
    settings?: AppSettings;
  }> {
    const manifest = await this.fetchManifest();
    if (!manifest) {
      throw new Error('No vault-manifest.json found in your Google Drive DocPocket Vault folder.');
    }

    const res = await this.performAutoSyncOnLogin(manifest.settings || ({} as AppSettings), onProgress);
    return {
      restoredDocs: res.restoredDocs,
      restoredCollections: manifest.collections?.length || 0,
      settings: res.settings,
    };
  }
}

export const googleDriveService = new GoogleDriveService();
