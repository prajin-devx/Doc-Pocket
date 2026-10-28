export interface DocumentItem {
  id: string;
  fileName: string;
  displayName: string;
  fileSize: number;
  pageCount: number;
  thumbnailDataUrl?: string;
  category: string;
  tags: string[];
  description: string;
  isFavorite: boolean;
  isPinned: boolean;
  importedAt: number;
  lastOpenedAt?: number;
  fileHash?: string;
  isPasswordProtected?: boolean;
  version?: number;
}

export interface DocumentBinary {
  id: string;
  data: ArrayBuffer;
}

export interface CollectionItem {
  id: string;
  name: string;
  color: string;
  icon: string;
  description: string;
  isSystem: boolean;
  createdAt: number;
}

export type ThemeMode = 'dark' | 'light' | 'system';
export type ViewMode = 'grid' | 'list';
export type SortField = 'importedAt' | 'lastOpenedAt' | 'displayName' | 'fileSize' | 'pageCount';
export type SortOrder = 'asc' | 'desc';

export type DashboardSectionId =
  | 'timetable'
  | 'quick_access'
  | 'hero'
  | 'collections'
  | 'recent_opened'
  | 'recent_imports';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface AppSettings {
  theme: ThemeMode;
  defaultView: ViewMode;
  defaultSortField: SortField;
  defaultSortOrder: SortOrder;
  readerTheme: 'dark' | 'light' | 'sepia';
  compactCards: boolean;
  accentColor: string;
  dashboardSectionOrder: DashboardSectionId[];
  hiddenDashboardSections: DashboardSectionId[];
}

export interface BackupManifest {
  version: string;
  exportedAt: number;
  appName: string;
  totalDocuments: number;
  collections: CollectionItem[];
  documents: DocumentItem[];
  settings?: AppSettings;
}

export interface BackupConflict {
  existingDoc: DocumentItem;
  incomingDoc: DocumentItem;
  reason: 'exact_hash' | 'same_name_and_size' | 'same_id';
  resolution?: 'skip' | 'keep_both' | 'overwrite';
}

export interface FilterOptions {
  searchQuery: string;
  category: string;
  onlyFavorites: boolean;
  onlyPinned: boolean;
  selectedTag?: string;
  sortField: SortField;
  sortOrder: SortOrder;
}

export type GoogleDriveSyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'not_connected';

export interface GoogleDriveVaultInfo {
  folderId: string;
  folderUrl: string;
  manifestFileId?: string;
  lastSyncTime?: number;
  fileCount: number;
}

