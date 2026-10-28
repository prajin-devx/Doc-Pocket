import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import {
  Download,
  Upload,
  Archive,
  ShieldCheck,
  X,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  HardDrive,
  Copy,
  FolderInput,
} from 'lucide-react';
import { backupService, BackupValidationResult } from '../../lib/backup-service';
import { formatBytes } from '../../lib/storage-service';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreComplete: () => void;
  initialTab?: 'export' | 'import';
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  onRestoreComplete,
  initialTab = 'export',
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>(initialTab);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ percent: number; status: string }>({
    percent: 0,
    status: '',
  });

  // Import State
  const [isCheckingZip, setIsCheckingZip] = useState(false);
  const [validationData, setValidationData] = useState<{
    zip: JSZip;
    validation: BackupValidationResult;
  } | null>(null);
  const [conflictResolutions, setConflictResolutions] = useState<Map<string, 'skip' | 'keep_both' | 'overwrite'>>(
    new Map()
  );
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<{ percent: number; status: string }>({
    percent: 0,
    status: '',
  });
  const [restoreSummary, setRestoreSummary] = useState<{
    restoredDocs: number;
    skippedDocs: number;
    overwrittenDocs: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    setIsExporting(true);
    setExportProgress({ percent: 5, status: 'Initializing vault backup...' });
    try {
      const blob = await backupService.exportBackup((percent, status) => {
        setExportProgress({ percent, status });
      });

      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `DocPocket_Vault_${dateStr}.zip`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      alert('Backup failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleSelectZipFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCheckingZip(true);
    setValidationData(null);
    setRestoreSummary(null);

    try {
      const result = await backupService.validateBackupFile(file);
      setValidationData(result);

      // Default all conflicts to 'skip' or 'keep_both'
      const resolutions = new Map<string, 'skip' | 'keep_both' | 'overwrite'>();
      result.validation.conflicts.forEach(c => {
        resolutions.set(c.incomingDoc.id, 'keep_both');
      });
      setConflictResolutions(resolutions);
    } catch (err) {
      alert('Failed to parse backup zip: ' + (err instanceof Error ? err.message : 'Invalid file'));
    } finally {
      setIsCheckingZip(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const setAllResolution = (choice: 'skip' | 'keep_both' | 'overwrite') => {
    if (!validationData) return;
    const newMap = new Map(conflictResolutions);
    validationData.validation.conflicts.forEach(c => {
      newMap.set(c.incomingDoc.id, choice);
    });
    setConflictResolutions(newMap);
  };

  const setSingleResolution = (id: string, choice: 'skip' | 'keep_both' | 'overwrite') => {
    const newMap = new Map(conflictResolutions);
    newMap.set(id, choice);
    setConflictResolutions(newMap);
  };

  const handleExecuteRestore = async () => {
    if (!validationData || !validationData.validation.manifest) return;

    setIsRestoring(true);
    setRestoreProgress({ percent: 5, status: 'Beginning restoration...' });

    try {
      const summary = await backupService.executeRestore(
        validationData.zip,
        validationData.validation.manifest,
        conflictResolutions,
        (percent, status) => {
          setRestoreProgress({ percent, status });
        }
      );

      setRestoreSummary(summary);
      onRestoreComplete();
    } catch (err) {
      alert('Restoration error: ' + (err instanceof Error ? err.message : 'Failed'));
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-2xl bg-[#0d1424] border border-slate-800 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
              <Archive className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">Backup & Restoration</h2>
              <p className="text-xs text-slate-400">Portable on-device ZIP archives</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExporting || isRestoring}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 px-6 pt-2 bg-slate-900/20">
          <button
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
              activeTab === 'export'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Backup ZIP</span>
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
              activeTab === 'import'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Restore from ZIP</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 space-y-5">
          {activeTab === 'export' ? (
            /* Export Flow */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-300 space-y-1">
                  <p className="font-semibold text-white">Full Vault Export</p>
                  <p className="text-slate-400 leading-relaxed">
                    Generates a self-contained ZIP archive containing all original PDF documents, tags, categories, and a structured <code className="font-mono text-sky-300">manifest.json</code>.
                  </p>
                </div>
              </div>

              {isExporting ? (
                <div className="p-4 rounded-xl bg-slate-900/90 border border-sky-500/30 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-2 text-sky-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {exportProgress.status}
                    </span>
                    <span className="font-mono text-slate-400">{exportProgress.percent}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-sky-500 transition-all duration-300"
                      style={{ width: `${exportProgress.percent}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="pt-2">
                  <button
                    onClick={handleStartExport}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold text-xs shadow-lg shadow-sky-500/20 transition active:scale-[0.99]"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Vault Backup (.zip)</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Import & Restore Flow */
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={handleSelectZipFile}
              />

              {!validationData && !restoreSummary && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="cursor-pointer rounded-2xl border-2 border-dashed border-slate-700 hover:border-sky-500/50 bg-slate-900/30 hover:bg-sky-950/10 p-6 text-center transition group"
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      {isCheckingZip ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <FolderInput className="w-6 h-6" />
                      )}
                    </span>
                    <p className="text-sm font-medium text-white">
                      {isCheckingZip ? 'Validating backup ZIP...' : 'Select DocPocket Backup ZIP'}
                    </p>
                    <p className="text-xs text-slate-400">
                      We check integrity and conflict status before importing any file.
                    </p>
                  </div>
                </div>
              )}

              {/* Validation Failed State */}
              {validationData && !validationData.validation.isValid && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-rose-400">
                    <AlertTriangle className="w-4 h-4" />
                    Invalid Backup Archive
                  </div>
                  <p className="text-slate-300">{validationData.validation.error}</p>
                  <button
                    onClick={() => setValidationData(null)}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-rose-500/20 text-xs text-rose-200"
                  >
                    Choose another file
                  </button>
                </div>
              )}

              {/* Validation Success & Conflicts Screen */}
              {validationData && validationData.validation.isValid && !restoreSummary && (
                <div className="space-y-4 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-white font-semibold">
                      <span>Backup Contents Verified</span>
                      <span className="font-mono text-sky-400">
                        {validationData.validation.manifest?.totalDocuments} Documents
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      Created on{' '}
                      {new Date(validationData.validation.manifest?.exportedAt || 0).toLocaleString()}
                    </p>
                  </div>

                  {/* Conflict handling options if duplicates detected */}
                  {validationData.validation.conflicts.length > 0 ? (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          {validationData.validation.conflicts.length} Existing Documents Found
                        </span>
                        <div className="flex items-center gap-1 text-[11px]">
                          <button
                            onClick={() => setAllResolution('keep_both')}
                            className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white"
                          >
                            Keep Both
                          </button>
                          <button
                            onClick={() => setAllResolution('skip')}
                            className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white"
                          >
                            Skip
                          </button>
                          <button
                            onClick={() => setAllResolution('overwrite')}
                            className="px-2 py-0.5 rounded bg-slate-800 text-rose-300 hover:text-rose-200"
                          >
                            Overwrite
                          </button>
                        </div>
                      </div>

                      <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                        {validationData.validation.conflicts.map(c => {
                          const currentRes = conflictResolutions.get(c.incomingDoc.id) || 'keep_both';
                          return (
                            <div
                              key={c.incomingDoc.id}
                              className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-2"
                            >
                              <div className="overflow-hidden">
                                <p className="font-medium text-slate-200 truncate">
                                  {c.incomingDoc.displayName}
                                </p>
                                <p className="text-[10px] text-slate-500 truncate font-mono">
                                  {formatBytes(c.incomingDoc.fileSize)} • {c.reason.replace(/_/g, ' ')}
                                </p>
                              </div>
                              <select
                                value={currentRes}
                                onChange={e =>
                                  setSingleResolution(
                                    c.incomingDoc.id,
                                    e.target.value as 'skip' | 'keep_both' | 'overwrite'
                                  )
                                }
                                className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[11px] text-white focus:outline-none"
                              >
                                <option value="keep_both">Keep Both</option>
                                <option value="skip">Skip</option>
                                <option value="overwrite">Overwrite</option>
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>All documents are new. Ready to restore into your vault.</span>
                    </div>
                  )}

                  {isRestoring ? (
                    <div className="p-4 rounded-xl bg-slate-900/90 border border-sky-500/30 space-y-2">
                      <div className="flex items-center justify-between font-medium">
                        <span className="flex items-center gap-2 text-sky-400">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {restoreProgress.status}
                        </span>
                        <span className="font-mono text-slate-400">{restoreProgress.percent}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-sky-500 transition-all duration-300"
                          style={{ width: `${restoreProgress.percent}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 flex justify-end gap-3">
                      <button
                        onClick={() => setValidationData(null)}
                        className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleExecuteRestore}
                        className="px-5 py-2.5 rounded-xl font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 transition shadow-lg shadow-sky-500/20"
                      >
                        Confirm Restoration
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Restore Summary Screen */}
              {restoreSummary && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <h4 className="font-semibold text-white">Vault Restoration Complete</h4>
                      <p className="text-emerald-300/90">
                        Successfully processed all documents into IndexedDB.
                      </p>
                      <div className="flex gap-4 pt-2 font-mono text-[11px] text-slate-300">
                        <span>Restored: {restoreSummary.restoredDocs}</span>
                        <span>Skipped: {restoreSummary.skippedDocs}</span>
                        <span>Overwritten: {restoreSummary.overwrittenDocs}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={onClose}
                      className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
