import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileText,
  X,
  AlertCircle,
  CheckCircle2,
  Tag,
  Folder,
  Loader2,
  FilePlus2,
  AlertTriangle,
} from 'lucide-react';
import { CollectionItem } from '../../types';
import { documentService } from '../../lib/document-service';
import { collectionService } from '../../lib/collection-service';
import { formatBytes } from '../../lib/storage-service';
import { db } from '../../lib/database';
import { getAccessToken } from '../../lib/firebase';
import { googleDriveService } from '../../lib/google-drive-service';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultCategory?: string;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultCategory = 'inbox',
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(defaultCategory);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; currentName: string }>({
    current: 0,
    total: 0,
    currentName: '',
  });
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [importSummary, setImportSummary] = useState<{
    successCount: number;
    duplicatesCount: number;
    errorCount: number;
    errors: { name: string; error: string }[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedCategory(defaultCategory);
      setSelectedFiles([]);
      setTags([]);
      setDescription('');
      setImportSummary(null);
      setIsProcessing(false);

      collectionService.getAllCollections().then(setCollections);
      documentService.getAllTags().then(setAvailableTags);
    }
  }, [isOpen, defaultCategory]);

  if (!isOpen) return null;

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const pdfFiles: File[] = [];
    const nonPdfNames: string[] = [];

    Array.from(fileList).forEach(file => {
      if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
        pdfFiles.push(file);
      } else {
        nonPdfNames.push(file.name);
      }
    });

    if (nonPdfNames.length > 0) {
      alert(`Only PDF files are supported. Skipped: ${nonPdfNames.slice(0, 3).join(', ')}${nonPdfNames.length > 3 ? '...' : ''}`);
    }

    if (pdfFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...pdfFiles]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleFilesSelected(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddTag = (tagToAdd?: string) => {
    const val = (tagToAdd || tagInput).trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (val && !tags.includes(val)) {
      setTags(prev => [...prev, val]);
    }
    setTagInput('');
  };

  const removeTag = (tagToRemove: string) => {
    setTags(prev => prev.filter(t => t !== tagToRemove));
  };

  const handleStartImport = async () => {
    if (selectedFiles.length === 0) return;

    setIsProcessing(true);
    setProgress({ current: 0, total: selectedFiles.length, currentName: 'Preparing import...' });

    try {
      const result = await documentService.importMultipleFiles(
        selectedFiles,
        {
          category: selectedCategory,
          tags,
          description: description.trim(),
        },
        (current, total, currentName) => {
          setProgress({ current, total, currentName });
        }
      );

      setImportSummary({
        successCount: result.imported.length,
        duplicatesCount: result.duplicates.length,
        errorCount: result.errors.length,
        errors: result.errors,
      });

      // Background upload to Google Drive if user is connected
      getAccessToken().then(async token => {
        if (token && result.imported.length > 0) {
          for (const doc of result.imported) {
            const bin = await db.binaries.get(doc.id);
            if (bin) {
              googleDriveService.uploadDocument(doc, bin.data).catch(err => {
                console.warn('Background Drive backup warning:', err);
              });
            }
          }
        }
      }).catch(() => {});

      onSuccess();
    } catch (err) {
      console.error('Import failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-2xl bg-[#0d1424] border border-slate-800 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
              <UploadCloud className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">Import PDFs to Vault</h2>
              <p className="text-xs text-slate-400">Stored on-device in IndexedDB</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {importSummary ? (
            /* Summary State */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    Import completed successfully!
                  </h4>
                  <p className="text-xs text-emerald-300/90 mt-1">
                    {importSummary.successCount} {importSummary.successCount === 1 ? 'document' : 'documents'} safely saved to your vault.
                  </p>
                </div>
              </div>

              {importSummary.duplicatesCount > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <span className="font-semibold">{importSummary.duplicatesCount} duplicate file(s) identified.</span>
                    <p className="text-slate-400 mt-0.5">
                      The vault safely preserved the file metadata without overwriting existing entries.
                    </p>
                  </div>
                </div>
              )}

              {importSummary.errorCount > 0 && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                    Failed to import {importSummary.errorCount} document(s):
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-slate-400">
                    {importSummary.errors.map((err, i) => (
                      <li key={i}>
                        <strong className="text-slate-300">{err.name}:</strong> {err.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setImportSummary(null);
                    setSelectedFiles([]);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
                >
                  Import More
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 transition"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* Upload & Configure Form */
            <>
              {/* Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="group relative cursor-pointer rounded-2xl border-2 border-dashed border-slate-700 hover:border-sky-500/50 bg-slate-900/30 hover:bg-sky-950/10 p-6 text-center transition-all"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={e => handleFilesSelected(e.target.files)}
                />
                <div className="flex flex-col items-center justify-center gap-2.5">
                  <span className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <FilePlus2 className="w-6 h-6" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">
                      Click to choose PDFs or drag and drop
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Supports multiple file selection • Stored securely on your device
                    </p>
                  </div>
                </div>
              </div>

              {/* Selected Files List */}
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>
                      Selected <strong className="text-slate-200">{selectedFiles.length}</strong> file(s)
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedFiles([])}
                      className="text-rose-400 hover:underline"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    {selectedFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                          <span className="text-slate-200 truncate font-medium">{file.name}</span>
                          <span className="text-[11px] font-mono text-slate-500 shrink-0">
                            {formatBytes(file.size)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="text-slate-400 hover:text-rose-400 p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Collection selector */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-sky-400" />
                    Target Collection
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={e => setSelectedCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    {collections.map(col => (
                      <option key={col.id} value={col.id}>
                        {col.name} {col.isSystem ? '(Default)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-sky-400" />
                    Add Tags
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="e.g. syllabus, invoice, sem4"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddTag()}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs text-slate-200"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Tag Badges */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(t => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-300 text-[11px]"
                    >
                      #{t}
                      <button
                        type="button"
                        onClick={() => removeTag(t)}
                        className="hover:text-rose-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Available Tag Suggestions */}
              {availableTags.length > 0 && tags.length < 5 && (
                <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-400">
                  <span>Suggestions:</span>
                  {availableTags.slice(0, 5).map(at => (
                    <button
                      key={at}
                      type="button"
                      onClick={() => handleAddTag(at)}
                      className="px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300"
                    >
                      +{at}
                    </button>
                  ))}
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Description / Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Add notes, key topics, or reminders about these documents..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 resize-none"
                />
              </div>

              {/* Progress Bar when importing */}
              {isProcessing && (
                <div className="p-4 rounded-xl bg-slate-900/80 border border-sky-500/30 space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-2 text-sky-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {progress.currentName || 'Processing PDF files...'}
                    </span>
                    <span className="text-slate-400 font-mono">
                      {progress.current} / {progress.total}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-sky-500 transition-all duration-300"
                      style={{
                        width: `${Math.round((progress.current / Math.max(progress.total, 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isProcessing}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleStartImport}
                  disabled={selectedFiles.length === 0 || isProcessing}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-lg shadow-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Importing...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Import {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
