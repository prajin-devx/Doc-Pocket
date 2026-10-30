import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LayoutDashboard,
  Folder,
  Layers,
  Settings,
  Archive,
  UploadCloud,
  Bookmark,
  Star,
  FileText,
  Search,
  HardDrive,
  Menu,
  X,
  Shield,
  Download,
  Plus,
  Calendar,
  LogIn,
  LogOut,
  SlidersHorizontal,
  Cloud,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Keyboard,
} from 'lucide-react';
import { AppSettings, CollectionItem, DashboardSectionId, DocumentItem, UserProfile } from './types';
import { db, initializeDatabase } from './lib/database';
import { documentService } from './lib/document-service';
import { collectionService } from './lib/collection-service';
import { storageService, formatBytes } from './lib/storage-service';
import { auth, loginWithGoogle, logoutUser, initAuth, getAccessToken } from './lib/firebase';
import { googleDriveService } from './lib/google-drive-service';
import { DashboardView } from './features/dashboard/DashboardView';
import { DocumentLibraryView } from './features/documents/DocumentLibraryView';
import { CollectionsView } from './features/collections/CollectionsView';
import { ImportModal } from './features/documents/ImportModal';
import { PDFViewerModal } from './features/pdf-viewer/PDFViewerModal';
import { BackupModal } from './features/backup/BackupModal';
import { ManageCollectionsModal } from './features/collections/ManageCollectionsModal';
import { SettingsModal } from './features/settings/SettingsModal';
import { DeleteConfirmModal } from './features/documents/DeleteConfirmModal';
import { DashboardLayoutModal } from './features/dashboard/DashboardLayoutModal';
import { PWAInstallButton } from './components/common/PWAInstallButton';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { KeyboardShortcutsModal } from './components/common/KeyboardShortcutsModal';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  defaultView: 'grid',
  defaultSortField: 'importedAt',
  defaultSortOrder: 'desc',
  readerTheme: 'dark',
  compactCards: false,
  accentColor: '#38bdf8',
  dashboardSectionOrder: [
    'timetable',
    'quick_access',
    'hero',
    'collections',
    'recent_opened',
    'recent_imports',
  ],
  hiddenDashboardSections: [],
  autoSyncEnabled: true,
};

export default function App() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [collectionCounts, setCollectionCounts] = useState<Record<string, number>>({});
  const [allTags, setAllTags] = useState<string[]>([]);
  const [totalStorageBytes, setTotalStorageBytes] = useState<number>(0);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Auto-sync status for Google Drive
  const [syncStatus, setSyncStatus] = useState<{
    state: 'idle' | 'syncing' | 'synced' | 'error';
    message: string;
    progress?: number;
    folderUrl?: string;
  }>({ state: 'idle', message: '' });

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('docpocket_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          dashboardSectionOrder: parsed.dashboardSectionOrder || DEFAULT_SETTINGS.dashboardSectionOrder,
          hiddenDashboardSections: parsed.hiddenDashboardSections || [],
          autoSyncEnabled: parsed.autoSyncEnabled !== undefined ? parsed.autoSyncEnabled : true,
        };
      }
      return DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Navigation
  const [activeTab, setActiveTab] = useState<'dashboard' | 'library' | 'collections'>('dashboard');
  const [libraryFilters, setLibraryFilters] = useState<{
    category?: string;
    onlyFavorites?: boolean;
    onlyPinned?: boolean;
    searchQuery?: string;
  }>({});

  // Global search input in header
  const [globalSearch, setGlobalSearch] = useState<string>('');

  // Modals state
  const [readerDocId, setReaderDocId] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importCategory, setImportCategory] = useState<string>('inbox');
  const [draggedFiles, setDraggedFiles] = useState<File[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isBackupOpen, setIsBackupOpen] = useState(false);
  const [backupTab, setBackupTab] = useState<'drive' | 'export' | 'import'>('drive');
  const [isManageCollectionsOpen, setIsManageCollectionsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLayoutModalOpen, setIsLayoutModalOpen] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState<DocumentItem | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Load Initial Vault Data from IndexedDB
  const refreshVaultData = useCallback(async () => {
    await initializeDatabase();
    const [docs, cols, counts, tags, stats] = await Promise.all([
      documentService.getAllDocuments(),
      collectionService.getAllCollections(),
      documentService.getCollectionCounts(),
      documentService.getAllTags(),
      storageService.getStorageStats(),
    ]);

    setDocuments(docs);
    setCollections(cols);
    setCollectionCounts(counts);
    setAllTags(tags);
    setTotalStorageBytes(stats.totalPdfBytes);
  }, []);

  // Automatic Sync, Category Organization & Auto-Restore on Login
  const triggerAutoSync = useCallback(
    async (activeSettings: AppSettings) => {
      try {
        setSyncStatus({ state: 'syncing', message: 'Organizing Google Drive Vault...', progress: 10 });
        const result = await googleDriveService.performAutoSyncOnLogin(
          activeSettings,
          (percent, status) => {
            setSyncStatus({ state: 'syncing', message: status, progress: percent });
          }
        );

        if (result.settings) {
          setSettings(prev => ({
            ...prev,
            ...result.settings,
            dashboardSectionOrder: result.settings!.dashboardSectionOrder || prev.dashboardSectionOrder,
            hiddenDashboardSections:
              result.settings!.hiddenDashboardSections || prev.hiddenDashboardSections,
            lastDriveSyncAt: Date.now(),
          }));
        } else {
          setSettings(prev => ({ ...prev, lastDriveSyncAt: Date.now() }));
        }

        await refreshVaultData();

        let finishMsg = 'All files organized in Drive';
        if (result.restoredDocs > 0 && result.backedUpDocs > 0) {
          finishMsg = `Restored ${result.restoredDocs} & backed up ${result.backedUpDocs} file(s)`;
        } else if (result.restoredDocs > 0) {
          finishMsg = `Restored ${result.restoredDocs} file(s) from Drive`;
        } else if (result.backedUpDocs > 0) {
          finishMsg = `Backed up ${result.backedUpDocs} file(s) to Drive`;
        }

        setSyncStatus({
          state: 'synced',
          message: finishMsg,
          progress: 100,
          folderUrl: result.folderUrl,
        });

        setTimeout(() => {
          setSyncStatus(prev => (prev.state === 'synced' ? { ...prev, state: 'idle' } : prev));
        }, 5000);
      } catch (err) {
        console.warn('Auto-sync notice:', err);
        setSyncStatus({ state: 'error', message: 'Sync paused (offline or unauthenticated)' });
        setTimeout(() => {
          setSyncStatus(prev => (prev.state === 'error' ? { ...prev, state: 'idle' } : prev));
        }, 5000);
      }
    },
    [refreshVaultData]
  );

  // Listen to Google Auth state & trigger Auto-Backup / Auto-Restore on login
  useEffect(() => {
    const unsubscribe = initAuth(
      async (fbUser, token) => {
        if (fbUser) {
          const profile: UserProfile = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName,
            photoURL: fbUser.photoURL,
          };
          setUser(profile);

          // Auto-sync & auto-restore upon login
          if (token && settings.autoSyncEnabled !== false) {
            triggerAutoSync(settings);
          }
        } else {
          setUser(null);
        }
        setIsAuthLoading(false);
      },
      () => {
        setUser(null);
        setIsAuthLoading(false);
      }
    );

    return () => unsubscribe();
  }, [triggerAutoSync, settings.autoSyncEnabled]);

  // Apply theme class to document
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else if (settings.theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (isSystemDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    localStorage.setItem('docpocket_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    refreshVaultData();
  }, [refreshVaultData]);

  // Global Drag-and-Drop for PDFs anywhere on the window
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        setIsDraggingOver(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget || (e.clientX === 0 && e.clientY === 0)) {
        setIsDraggingOver(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files).filter(
          (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
        );
        if (files.length > 0) {
          setDraggedFiles(files);
          setImportCategory('inbox');
          setIsImportOpen(true);
        }
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        (e.target as HTMLElement)?.tagName === 'INPUT' ||
        (e.target as HTMLElement)?.tagName === 'TEXTAREA';

      // ⌘K or Ctrl+K: Focus search
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // ⌘I or Ctrl+I: Open Import
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setDraggedFiles([]);
        handleOpenImportModal();
        return;
      }

      // ⌘B or Ctrl+B: Open Drive Vault
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setBackupTab('drive');
        setIsBackupOpen(true);
        return;
      }

      // ?: Open Shortcuts Guide (when not typing in an input)
      if (e.key === '?' && !isInput && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
        return;
      }

      // Escape: Close shortcuts or drop overlay
      if (e.key === 'Escape') {
        setIsShortcutsOpen(false);
        setIsDraggingOver(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handlers
  const handleOpenDocument = (doc: DocumentItem) => {
    setReaderDocId(doc.id);
  };

  const handleToggleFavorite = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await documentService.toggleFavorite(id);
    refreshVaultData();
  };

  const handleTogglePinned = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await documentService.togglePinned(id);
    refreshVaultData();
  };

  const handleDownload = async (doc: DocumentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await documentService.downloadDocument(doc);
    } catch (err) {
      alert('Could not download file: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handleDeleteTrigger = (doc: DocumentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteDoc(doc);
  };

  const handleConfirmDelete = async () => {
    if (!deleteDoc) return;
    try {
      if (user) {
        await googleDriveService.deleteDocumentByDocId(deleteDoc.id).catch(console.warn);
      }
      await documentService.deleteDocument(deleteDoc.id);
      setDeleteDoc(null);
      refreshVaultData();
    } catch (err) {
      alert('Failed to delete document: ' + (err instanceof Error ? err.message : 'Error'));
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    try {
      if (user) {
        ids.forEach(id => googleDriveService.deleteDocumentByDocId(id).catch(console.warn));
      }
      await documentService.deleteMultipleDocuments(ids);
      refreshVaultData();
    } catch (err) {
      alert('Failed to delete selected documents: ' + (err instanceof Error ? err.message : 'Error'));
    }
  };

  const handleOpenImportModal = (category = 'inbox', files?: File[]) => {
    setImportCategory(category);
    if (files && files.length > 0) {
      setDraggedFiles(files);
    } else {
      setDraggedFiles([]);
    }
    setIsImportOpen(true);
  };

  const handleNavigateToLibrary = (filters?: {
    category?: string;
    onlyFavorites?: boolean;
    onlyPinned?: boolean;
  }) => {
    setLibraryFilters(filters || {});
    setActiveTab('library');
  };

  const handleLoginGoogle = async () => {
    try {
      const { user: loggedUser } = await loginWithGoogle();
      const profile: UserProfile = {
        uid: loggedUser.uid,
        email: loggedUser.email,
        displayName: loggedUser.displayName,
        photoURL: loggedUser.photoURL,
      };
      setUser(profile);
      await refreshVaultData();
      if (settings.autoSyncEnabled !== false) {
        triggerAutoSync(settings);
      }
    } catch (err) {
      alert('Google Sign-In failed: ' + (err instanceof Error ? err.message : 'Error'));
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      setUser(null);
    } catch (err) {
      alert('Sign out failed: ' + (err instanceof Error ? err.message : 'Error'));
    }
  };

  const handleSaveDashboardLayout = async (
    newOrder: DashboardSectionId[],
    newHidden: DashboardSectionId[]
  ) => {
    const updatedSettings: AppSettings = {
      ...settings,
      dashboardSectionOrder: newOrder,
      hiddenDashboardSections: newHidden,
    };
    setSettings(updatedSettings);

    if (user) {
      try {
        const token = await getAccessToken();
        if (token) {
          const manifest = await googleDriveService.fetchManifest();
          if (manifest) {
            manifest.settings = updatedSettings;
            await googleDriveService.uploadManifest(manifest);
          }
        }
      } catch (err) {
        console.warn('Failed to sync dashboard preferences to Google Drive:', err);
      }
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#070a12] text-slate-100 overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 lg:w-72 bg-[#0a0f1d] border-r border-slate-800/80 p-5 shrink-0 justify-between select-none">
        {/* Brand Header */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 p-0.5 shadow-lg shadow-sky-500/20">
                <div className="w-full h-full bg-[#0a0f1d] rounded-[14px] flex items-center justify-center">
                  <FileText className="w-5 h-5 text-sky-400" />
                </div>
              </div>
              <div>
                <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-1.5">
                  <span>DocPocket</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-sky-500/15 text-sky-400 border border-sky-500/25">
                    VAULT
                  </span>
                </h1>
                <p className="text-[11px] text-slate-400">Personal PDF Hub</p>
              </div>
            </div>
          </div>

          {/* Quick Import Action */}
          <button
            onClick={() => handleOpenImportModal()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold text-xs shadow-lg shadow-sky-500/20 transition-all active:scale-[0.98]"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Import PDFs</span>
          </button>

          {/* Main Navigation links */}
          <nav className="space-y-1 text-xs">
            <button
              onClick={() => {
                setActiveTab('dashboard');
                setLibraryFilters({});
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium transition ${
                activeTab === 'dashboard'
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </div>
            </button>

            <button
              onClick={() => {
                setActiveTab('library');
                setLibraryFilters({});
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium transition ${
                activeTab === 'library' &&
                !libraryFilters.onlyFavorites &&
                !libraryFilters.onlyPinned &&
                libraryFilters.category !== 'timetable'
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Folder className="w-4 h-4" />
                <span>Library</span>
              </div>
              <span className="font-mono text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded-full">
                {documents.length}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('collections');
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium transition ${
                activeTab === 'collections'
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Layers className="w-4 h-4" />
                <span>Collections</span>
              </div>
              <span className="font-mono text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded-full">
                {collections.length}
              </span>
            </button>



            <div className="pt-3 pb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Quick Views
            </div>

            {/* Timetable PDF Shortcut */}
            <button
              onClick={() => handleNavigateToLibrary({ category: 'timetable' })}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium transition ${
                activeTab === 'library' && libraryFilters.category === 'timetable'
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <span>Timetable PDFs</span>
              </div>
              <span className="font-mono text-[10px] text-cyan-400 font-bold bg-cyan-500/10 px-2 py-0.5 rounded-full">
                {documents.filter(d => d.category === 'timetable').length}
              </span>
            </button>

            <button
              onClick={() => handleNavigateToLibrary({ onlyPinned: true })}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium transition ${
                activeTab === 'library' && libraryFilters.onlyPinned
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Bookmark className="w-4 h-4 text-sky-400" />
                <span>Pinned Documents</span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">
                {documents.filter(d => d.isPinned).length}
              </span>
            </button>

            <button
              onClick={() => handleNavigateToLibrary({ onlyFavorites: true })}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium transition ${
                activeTab === 'library' && libraryFilters.onlyFavorites
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Star className="w-4 h-4 text-amber-400" />
                <span>Favorites</span>
              </div>
              <span className="font-mono text-[10px] text-slate-400">
                {documents.filter(d => d.isFavorite).length}
              </span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer: User Status, Storage Info, Backup & Settings */}
        <div className="space-y-3 pt-4 border-t border-slate-800/80">
          {/* User Account / Google Sign-In Badge */}
          {user ? (
            <div className="p-2.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-7 h-7 rounded-full border border-sky-400/50 shrink-0"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                    {user.displayName?.[0] || 'U'}
                  </div>
                )}
                <div className="truncate">
                  <p className="font-semibold text-white truncate text-[11px]">
                    {user.displayName || 'User'}
                  </p>
                  <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <Cloud className="w-2.5 h-2.5" />
                    <span>Google Drive Vault</span>
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={handleLoginGoogle}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs transition shadow-sm"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Sign in with Google</span>
            </button>
          )}

          {/* Storage Badge */}
          <div className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 text-[11px] space-y-1.5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                IndexedDB Storage
              </span>
              <span className="font-mono text-sky-300 font-semibold">{formatBytes(totalStorageBytes)}</span>
            </div>
            <p className="text-[10px] text-slate-500">100% on-device binaries • Google Drive backup</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setBackupTab('drive');
                setIsBackupOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 hover:text-white transition"
              title="Cloud Sync & Backup"
            >
              <Cloud className="w-3.5 h-3.5 text-sky-400" />
              <span>Drive Vault</span>
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 hover:text-white transition"
              title="Settings"
            >
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              <span>Settings</span>
            </button>
          </div>

          {/* PWA Install Button mounted cleanly */}
          <PWAInstallButton variant="full" />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#070a12]">
        {/* Top Navbar */}
        <header className="h-16 px-4 sm:px-8 border-b border-slate-800/80 bg-[#090e1a]/80 backdrop-blur-md flex items-center justify-between gap-4 shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-bold text-white capitalize">
                {activeTab}
              </span>
              {activeTab === 'library' && libraryFilters.category && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20 font-mono">
                  {collections.find(c => c.id === libraryFilters.category)?.name || libraryFilters.category}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Header Search Shortcut */}
            <div className="hidden sm:block relative w-56 lg:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search timetable, vault... (⌘K)"
                value={globalSearch}
                onChange={e => setGlobalSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    setLibraryFilters({ searchQuery: globalSearch });
                    setActiveTab('library');
                  }
                }}
                className="w-full pl-9 pr-10 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
              <span className="hidden lg:inline-block absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700/60 pointer-events-none">
                ⌘K
              </span>
            </div>

            {/* Keyboard Shortcuts Trigger Button */}
            <button
              onClick={() => setIsShortcutsOpen(true)}
              className="hidden sm:flex items-center justify-center p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Keyboard Shortcuts (?)"
            >
              <Keyboard className="w-4 h-4" />
            </button>

            {/* Live Google Drive Auto-Sync Indicator */}
            {user && (
              <div className="flex items-center">
                {syncStatus.state === 'syncing' && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-medium animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span className="hidden md:inline truncate max-w-[200px]">
                      {syncStatus.message || 'Organizing Drive Vault...'}
                    </span>
                    <span className="md:hidden">Syncing</span>
                  </div>
                )}

                {syncStatus.state === 'synced' && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden md:inline truncate max-w-[220px]">
                      {syncStatus.message || 'Drive Synced'}
                    </span>
                    <span className="md:hidden">Synced</span>
                  </div>
                )}

                {syncStatus.state === 'error' && (
                  <button
                    onClick={() => triggerAutoSync(settings)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/25 transition"
                    title="Click to retry auto-sync"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                    <span className="hidden md:inline text-[11px]">Retry Sync</span>
                  </button>
                )}
              </div>
            )}

            {/* Quick Customize Dashboard Order Button */}
            <button
              onClick={() => setIsLayoutModalOpen(true)}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 hover:text-white transition"
              title="Decide what comes first in Dashboard"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
              <span>Layout Order</span>
            </button>

            <button
              onClick={() => handleOpenImportModal()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold text-xs shadow-md shadow-sky-500/20 transition active:scale-[0.98]"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Import</span>
            </button>

            {/* User Profile / Auth Button in header */}
            {user ? (
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-2 p-1 pl-2 pr-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition"
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-6 h-6 rounded-full"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 font-bold text-[10px] flex items-center justify-center">
                    {user.displayName?.[0] || 'U'}
                  </div>
                )}
                <span className="text-xs font-medium text-slate-200 hidden sm:inline max-w-[90px] truncate">
                  {user.displayName?.split(' ')[0] || 'Account'}
                </span>
              </button>
            ) : (
              <button
                onClick={handleLoginGoogle}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs transition shadow-sm"
              >
                <LogIn className="w-3.5 h-3.5 text-blue-600" />
                <span>Google Sign In</span>
              </button>
            )}

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Vault Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Mobile Dropdown Menu Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#0a0f1d] border-b border-slate-800 p-4 space-y-3 animate-in slide-in-from-top duration-200 z-30">
            {/* Mobile Auth Button */}
            {user ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs">
                      {user.displayName?.[0] || 'U'}
                    </div>
                  )}
                  <div className="truncate text-xs">
                    <p className="font-semibold text-white">{user.displayName || 'User'}</p>
                    <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-lg text-rose-400 hover:bg-slate-800"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleLoginGoogle}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white text-slate-900 font-semibold text-xs"
              >
                <LogIn className="w-4 h-4 text-blue-600" />
                <span>Sign in with Google</span>
              </button>
            )}

            <nav className="space-y-1 text-xs">
              <button
                onClick={() => {
                  setActiveTab('dashboard');
                  setLibraryFilters({});
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:bg-slate-900"
              >
                <LayoutDashboard className="w-4 h-4 text-sky-400" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('library');
                  setLibraryFilters({});
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-slate-300 hover:bg-slate-900"
              >
                <div className="flex items-center gap-3">
                  <Folder className="w-4 h-4 text-sky-400" />
                  <span>Library</span>
                </div>
                <span className="font-mono text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                  {documents.length}
                </span>
              </button>

              <button
                onClick={() => {
                  handleNavigateToLibrary({ category: 'timetable' });
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-slate-300 hover:bg-slate-900"
              >
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  <span>Timetable PDFs</span>
                </div>
                <span className="font-mono text-[10px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full">
                  {documents.filter(d => d.category === 'timetable').length}
                </span>
              </button>



              <button
                onClick={() => {
                  setActiveTab('collections');
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:bg-slate-900"
              >
                <Layers className="w-4 h-4 text-sky-400" />
                <span>Collections</span>
              </button>

              <button
                onClick={() => {
                  setIsLayoutModalOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:bg-slate-900"
              >
                <SlidersHorizontal className="w-4 h-4 text-sky-400" />
                <span>Customize Dashboard Order</span>
              </button>

              <button
                onClick={() => {
                  setIsBackupOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:bg-slate-900"
              >
                <Archive className="w-4 h-4 text-sky-400" />
                <span>Backup & Restoration</span>
              </button>

              <button
                onClick={() => {
                  setIsSettingsOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:bg-slate-900"
              >
                <Settings className="w-4 h-4 text-slate-400" />
                <span>Settings</span>
              </button>
            </nav>
          </div>
        )}

        {/* Scrollable Viewport Container */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 relative">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'dashboard' && (
              <DashboardView
                documents={documents}
                collections={collections}
                collectionCounts={collectionCounts}
                sectionOrder={settings.dashboardSectionOrder}
                hiddenSections={settings.hiddenDashboardSections}
                onOpenDocument={handleOpenDocument}
                onOpenImport={handleOpenImportModal}
                onNavigateToLibrary={handleNavigateToLibrary}
                onToggleFavorite={handleToggleFavorite}
                onTogglePinned={handleTogglePinned}
                onDownload={handleDownload}
                onDelete={handleDeleteTrigger}
                onManageCollections={() => setIsManageCollectionsOpen(true)}
                onOpenLayoutModal={() => setIsLayoutModalOpen(true)}
                onRefreshData={refreshVaultData}
                searchQuery={globalSearch}
                setSearchQuery={setGlobalSearch}
              />
            )}

            {activeTab === 'library' && (
              <DocumentLibraryView
                documents={documents}
                collections={collections}
                allTags={allTags}
                initialCategory={libraryFilters.category || 'all'}
                initialOnlyFavorites={libraryFilters.onlyFavorites || false}
                initialOnlyPinned={libraryFilters.onlyPinned || false}
                initialSearchQuery={libraryFilters.searchQuery || globalSearch || ''}
                onOpenDocument={handleOpenDocument}
                onOpenImport={handleOpenImportModal}
                onToggleFavorite={handleToggleFavorite}
                onTogglePinned={handleTogglePinned}
                onDownload={handleDownload}
                onDelete={handleDeleteTrigger}
                onBulkDelete={handleBulkDelete}
                onManageCollections={() => setIsManageCollectionsOpen(true)}
                onBatchOperationCompleted={refreshVaultData}
              />
            )}

            {activeTab === 'collections' && (
              <CollectionsView
                collections={collections}
                documents={documents}
                collectionCounts={collectionCounts}
                onOpenDocument={handleOpenDocument}
                onOpenImport={handleOpenImportModal}
                onManageCollections={() => setIsManageCollectionsOpen(true)}
                onToggleFavorite={handleToggleFavorite}
                onTogglePinned={handleTogglePinned}
                onDownload={handleDownload}
                onDelete={handleDeleteTrigger}
                onSelectCategoryInLibrary={catId => handleNavigateToLibrary({ category: catId })}
              />
            )}


          </div>
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="md:hidden h-16 bg-[#0a0f1d] border-t border-slate-800/80 flex items-center justify-around px-2 shrink-0 z-20">
          <button
            onClick={() => {
              setActiveTab('dashboard');
              setLibraryFilters({});
            }}
            className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-medium transition ${
              activeTab === 'dashboard' ? 'text-sky-400 font-bold' : 'text-slate-400'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Home</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('library');
              setLibraryFilters({});
            }}
            className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-medium transition ${
              activeTab === 'library' ? 'text-sky-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Folder className="w-5 h-5" />
            <span>Library</span>
          </button>

          {/* Center Floating Import Button */}
          <button
            onClick={() => handleOpenImportModal()}
            className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/30 -mt-5 active:scale-95 transition"
            title="Import PDF"
          >
            <Plus className="w-6 h-6" />
          </button>



          <button
            onClick={() => setActiveTab('collections')}
            className={`flex flex-col items-center gap-1 py-1 px-3 text-[10px] font-medium transition ${
              activeTab === 'collections' ? 'text-sky-400 font-bold' : 'text-slate-400'
            }`}
          >
            <Layers className="w-5 h-5" />
            <span>Collections</span>
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex flex-col items-center gap-1 py-1 px-2 text-[10px] font-medium text-slate-400"
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>
        </nav>
      </div>

      {/* Fullscreen PDF Viewer Modal */}
      {readerDocId && (
        <PDFViewerModal
          documentId={readerDocId}
          onClose={() => setReaderDocId(null)}
          onDocumentUpdated={refreshVaultData}
        />
      )}

      {/* PDF Import Modal */}
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => {
          setIsImportOpen(false);
          setDraggedFiles([]);
        }}
        onSuccess={() => {
          setDraggedFiles([]);
          refreshVaultData();
        }}
        defaultCategory={importCategory}
        initialFiles={draggedFiles}
      />

      {/* Keyboard Shortcuts Cheatsheet Modal */}
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Full-Screen PDF Dropzone Overlay */}
      {isDraggingOver && (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            setIsDraggingOver(false);
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              const files = Array.from(e.dataTransfer.files).filter(
                f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
              );
              if (files.length > 0) {
                setDraggedFiles(files);
                setImportCategory('inbox');
                setIsImportOpen(true);
              }
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#070a12]/90 backdrop-blur-md p-6 pointer-events-auto animate-fadeIn"
        >
          <div className="w-full max-w-xl border-2 border-dashed border-sky-400 bg-sky-500/10 rounded-3xl p-10 flex flex-col items-center justify-center text-center space-y-4 shadow-2xl shadow-sky-500/20">
            <div className="w-16 h-16 rounded-2xl bg-sky-500/20 border border-sky-400 text-sky-300 flex items-center justify-center animate-bounce">
              <UploadCloud className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-xl font-bold text-white tracking-tight">Drop your PDFs here</h3>
              <p className="text-xs sm:text-sm text-slate-300 max-w-sm mx-auto">
                Release anywhere on the screen to immediately organize and import into your personal vault.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Backup and Restore Modal */}
      <BackupModal
        isOpen={isBackupOpen}
        onClose={() => setIsBackupOpen(false)}
        onRestoreComplete={() => {
          refreshVaultData();
        }}
        initialTab={backupTab}
        user={user}
        onLoginGoogle={handleLoginGoogle}
        settings={settings}
      />

      {/* Manage Collections Modal */}
      <ManageCollectionsModal
        isOpen={isManageCollectionsOpen}
        onClose={() => setIsManageCollectionsOpen(false)}
        onUpdated={() => {
          refreshVaultData();
        }}
      />

      {/* Dashboard Layout Reordering Modal */}
      <DashboardLayoutModal
        isOpen={isLayoutModalOpen}
        onClose={() => setIsLayoutModalOpen(false)}
        sectionOrder={settings.dashboardSectionOrder}
        hiddenSections={settings.hiddenDashboardSections}
        onSaveLayout={handleSaveDashboardLayout}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        user={user}
        onLoginGoogle={handleLoginGoogle}
        onLogout={handleLogout}
        onOpenLayoutModal={() => setIsLayoutModalOpen(true)}
        onUpdateSettings={newS => setSettings(prev => ({ ...prev, ...newS }))}
        onOpenBackup={tab => {
          setBackupTab(tab);
          setIsBackupOpen(true);
        }}
        onLibraryCleared={() => {
          refreshVaultData();
        }}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteDoc}
        document={deleteDoc}
        onClose={() => setDeleteDoc(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* Floating Offline Notification Indicator */}
      <OfflineIndicator />
    </div>
  );
}
