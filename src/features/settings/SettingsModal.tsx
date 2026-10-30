import React, { useState, useEffect } from 'react';
import {
  Settings,
  X,
  Moon,
  Sun,
  Laptop,
  Database,
  Trash2,
  Shield,
  Download,
  Upload,
  HardDrive,
  Info,
  CheckCircle2,
  AlertTriangle,
  Lock,
  LogIn,
  LogOut,
  User,
  Cloud,
  SlidersHorizontal,
} from 'lucide-react';
import { AppSettings, ThemeMode, UserProfile } from '../../types';
import { formatBytes, storageService, StorageStats } from '../../lib/storage-service';
import { PWAInstallButton } from '../../components/common/PWAInstallButton';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  user: UserProfile | null;
  onLoginGoogle: () => void;
  onLogout: () => void;
  onOpenLayoutModal: () => void;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  onOpenBackup: (tab: 'drive' | 'export' | 'import') => void;
  onLibraryCleared: () => void;
  onOpenShortcuts?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  user,
  onLoginGoogle,
  onLogout,
  onOpenLayoutModal,
  onUpdateSettings,
  onOpenBackup,
  onLibraryCleared,
  onOpenShortcuts,
}) => {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [isPersisted, setIsPersisted] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadStats();
      setShowClearConfirm(false);
      setConfirmInput('');
    }
  }, [isOpen]);

  const loadStats = async () => {
    const s = await storageService.getStorageStats();
    setStats(s);
    setIsPersisted(!!s.isStoragePersisted);
  };

  const handleRequestPersistence = async () => {
    const granted = await storageService.requestPersistentStorage();
    setIsPersisted(granted);
    await loadStats();
  };

  const handleExecuteClear = async () => {
    if (confirmInput.trim().toUpperCase() !== 'CLEAR') return;

    setIsClearing(true);
    try {
      await storageService.clearAllDocuments();
      await loadStats();
      setShowClearConfirm(false);
      onLibraryCleared();
    } catch (err) {
      alert('Failed to clear library: ' + (err instanceof Error ? err.message : 'Error'));
    } finally {
      setIsClearing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-2xl bg-[#0d1424] border border-slate-800 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">Vault Settings</h2>
              <p className="text-xs text-slate-400">Account, database sync, and layout preferences</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Google Auth & Google Drive Vault Status */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Google Account & Google Drive Vault</span>
              <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                <Cloud className="w-3 h-3" />
                Google Drive Vault
              </span>
            </h3>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
              {user ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'User'}
                        className="w-10 h-10 rounded-full border border-sky-500/40 shadow-sm"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">
                        {user.displayName?.[0] || 'U'}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-white">{user.displayName || 'Google User'}</p>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          DRIVE SYNCED
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate max-w-[180px] sm:max-w-[240px]">
                        {user.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        onClose();
                        onOpenBackup('drive');
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-xs font-medium transition"
                    >
                      <Cloud className="w-3.5 h-3.5 text-sky-400" />
                      <span>Drive Vault</span>
                    </button>
                    <button
                      onClick={onLogout}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-400" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-white">Connect Google Drive</p>
                    <p className="text-[11px] text-slate-400">
                      Sync PDF files, collections & custom layout directly into your personal Google Drive
                    </p>
                  </div>
                  <button
                    onClick={onLoginGoogle}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs transition shadow-md shadow-white/10 shrink-0"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
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
                    <span>Google Sign In</span>
                  </button>
                </div>
              )}

              {/* Auto Sync Toggle & Organization Settings */}
              {user && (
                <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-200">Auto-Backup & Restore on Login</p>
                      <p className="text-[11px] text-slate-400">
                        Automatically reconciles vault and organizes files into category folders on login
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.autoSyncEnabled !== false}
                        onChange={e => onUpdateSettings({ autoSyncEnabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-500"></div>
                    </label>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                    <p className="font-semibold text-slate-300">Organized Folder Structure:</p>
                    <p className="font-mono text-[10px] text-sky-300">
                      DocPocket Vault/ [Timetables, College, Certificates, Projects, Personal, Subjects, Documents]
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dashboard Customization Shortcut */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Dashboard Layout & Priorities
            </h3>
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white">Customize Section Order</p>
                <p className="text-[11px] text-slate-400">
                  Decide what comes first on your dashboard (Timetables, Quick Access, Collections, etc.)
                </p>
              </div>
              <button
                onClick={() => {
                  onClose();
                  onOpenLayoutModal();
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-400/30 text-xs font-medium transition shrink-0"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
                <span>Configure Order</span>
              </button>
            </div>
          </div>

          {/* Theme Mode */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Appearance & Theme
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'dark', label: 'Dark Navy', icon: Moon },
                { id: 'light', label: 'Light', icon: Sun },
                { id: 'system', label: 'System', icon: Laptop },
              ].map(item => {
                const IconComponent = item.icon;
                const isSelected = settings.theme === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onUpdateSettings({ theme: item.id as ThemeMode })}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition ${
                      isSelected
                        ? 'bg-sky-500/15 border-sky-400 text-sky-300 shadow-md shadow-sky-500/10'
                        : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <IconComponent className="w-4 h-4" />
                    <span className="text-xs font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Storage & IndexedDB Stats */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>On-Device Storage</span>
              <span className="text-[11px] font-mono text-sky-400">IndexedDB</span>
            </h3>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase">Documents</span>
                  <p className="text-sm font-bold font-mono text-white mt-0.5">
                    {stats ? stats.documentCount : '...'}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase">PDF Data</span>
                  <p className="text-sm font-bold font-mono text-sky-300 mt-0.5">
                    {stats ? formatBytes(stats.totalPdfBytes) : '...'}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase">Collections</span>
                  <p className="text-sm font-bold font-mono text-white mt-0.5">
                    {stats ? stats.collectionCount : '...'}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 uppercase">Pinned</span>
                  <p className="text-sm font-bold font-mono text-white mt-0.5">
                    {stats ? stats.pinnedCount : '...'}
                  </p>
                </div>
              </div>

              {/* Quota Progress */}
              {stats && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Browser Storage Allocated:</span>
                    <span className="font-mono text-slate-300">
                      {formatBytes(stats.estimatedBrowserUsageBytes)} /{' '}
                      {formatBytes(stats.estimatedBrowserQuotaBytes)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-blue-500"
                      style={{ width: `${Math.max(1, stats.usagePercentage)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Persistent Storage Toggle */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-800/80 text-xs">
                <div>
                  <span className="font-medium text-slate-200">Persistence Permission</span>
                  <p className="text-[11px] text-slate-400">
                    Prevents browser eviction under low disk space
                  </p>
                </div>
                {isPersisted ? (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Persisted
                  </span>
                ) : (
                  <button
                    onClick={handleRequestPersistence}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-medium border border-slate-700"
                  >
                    Request
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Backup & Restore Shortcuts */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Vault Data Archive
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => {
                  onClose();
                  onOpenBackup('export');
                }}
                className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-sky-500/40 hover:bg-slate-900 transition text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-white group-hover:text-sky-300">
                      Export ZIP Backup
                    </span>
                    <p className="text-[11px] text-slate-400">Full PDFs + Manifest</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenBackup('import');
                }}
                className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-sky-500/40 hover:bg-slate-900 transition text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                    <Upload className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-white group-hover:text-sky-300">
                      Restore from ZIP
                    </span>
                    <p className="text-[11px] text-slate-400">Conflict-safe restore</p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Installation */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Installation
            </h3>
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white">DocPocket Progressive Web App</p>
                <p className="text-[11px] text-slate-400">Install to desktop or mobile home screen</p>
              </div>
              <PWAInstallButton variant="nav" />
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          {onOpenShortcuts && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Navigation
              </h3>
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-white">Keyboard Shortcuts</p>
                  <p className="text-[11px] text-slate-400">Power navigation shortcuts and hotkeys</p>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    onOpenShortcuts();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
                >
                  View Shortcuts (?)
                </button>
              </div>
            </div>
          )}

          {/* Privacy & Architecture Notice */}
          <div className="p-4 rounded-xl bg-sky-950/30 border border-sky-500/20 text-xs space-y-1.5 text-slate-300">
            <div className="flex items-center gap-2 font-semibold text-sky-300">
              <Lock className="w-4 h-4" />
              Private & Encrypted Security
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Your PDF files are stored on-device in browser IndexedDB. When signed in with Google, your documents, categorized folders, and dashboard preferences are privately synced and backed up directly to your personal Google Drive account.
            </p>
          </div>

          {/* Danger Zone: Clear Library */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-400">
              Danger Zone
            </h3>

            {!showClearConfirm ? (
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/20">
                <div>
                  <p className="text-xs font-semibold text-white">Clear All Documents</p>
                  <p className="text-[11px] text-slate-400">
                    Removes all stored PDF files and metadata from IndexedDB
                  </p>
                </div>
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold transition"
                >
                  Clear Library
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 space-y-3 animate-in fade-in">
                <div className="flex items-center gap-2 text-xs font-bold text-rose-400">
                  <AlertTriangle className="w-4 h-4" />
                  Are you absolutely sure?
                </div>
                <p className="text-xs text-rose-200">
                  This action permanently removes all PDFs from your browser vault. Type <strong className="font-mono bg-rose-950/60 px-1 rounded">CLEAR</strong> to confirm:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={confirmInput}
                    onChange={e => setConfirmInput(e.target.value)}
                    placeholder="Type CLEAR"
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-rose-500/40 text-xs text-white focus:outline-none"
                  />
                  <button
                    onClick={handleExecuteClear}
                    disabled={confirmInput.trim().toUpperCase() !== 'CLEAR' || isClearing}
                    className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs disabled:opacity-40 transition"
                  >
                    {isClearing ? 'Clearing...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => {
                      setShowClearConfirm(false);
                      setConfirmInput('');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
