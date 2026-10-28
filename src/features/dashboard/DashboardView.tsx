import React from 'react';
import {
  Search,
  UploadCloud,
  Bookmark,
  Clock,
  Sparkles,
  ArrowRight,
  FileText,
  HardDrive,
  Folder,
  Plus,
  Star,
  Layers,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  SlidersHorizontal,
} from 'lucide-react';
import { CollectionItem, DashboardSectionId, DocumentItem } from '../../types';
import { DocumentCard } from '../documents/DocumentCard';
import { CategoryIcon } from '../../components/common/CategoryIcon';
import { formatBytes } from '../../lib/storage-service';
import { sampleVaultDocuments } from '../../lib/sample-documents';
import { documentService } from '../../lib/document-service';

interface DashboardViewProps {
  documents: DocumentItem[];
  collections: CollectionItem[];
  collectionCounts: Record<string, number>;
  sectionOrder: DashboardSectionId[];
  hiddenSections: DashboardSectionId[];
  onOpenDocument: (doc: DocumentItem) => void;
  onOpenImport: (category?: string) => void;
  onNavigateToLibrary: (filter?: { category?: string; onlyFavorites?: boolean; onlyPinned?: boolean }) => void;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  onTogglePinned: (id: string, e: React.MouseEvent) => void;
  onDownload: (doc: DocumentItem, e: React.MouseEvent) => void;
  onDelete: (doc: DocumentItem, e: React.MouseEvent) => void;
  onManageCollections: () => void;
  onOpenLayoutModal: () => void;
  onRefreshData: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  documents,
  collections,
  collectionCounts,
  sectionOrder,
  hiddenSections,
  onOpenDocument,
  onOpenImport,
  onNavigateToLibrary,
  onToggleFavorite,
  onTogglePinned,
  onDownload,
  onDelete,
  onManageCollections,
  onOpenLayoutModal,
  onRefreshData,
  searchQuery,
  setSearchQuery,
}) => {
  const [isSeeding, setIsSeeding] = React.useState(false);

  // Compute document groups
  const timetableDocs = documents.filter(
    d => d.category === 'timetable' || d.tags?.includes('timetable') || d.tags?.includes('schedule')
  );
  const pinnedDocs = documents.filter(d => d.isPinned);
  const favoriteDocs = documents.filter(d => d.isFavorite);
  const recentlyOpenedDocs = documents
    .filter(d => d.lastOpenedAt)
    .sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0))
    .slice(0, 4);

  const recentImports = [...documents]
    .sort((a, b) => b.importedAt - a.importedAt)
    .slice(0, 6);

  const totalBytes = documents.reduce((acc, d) => acc + (d.fileSize || 0), 0);

  const handleSeedSamples = async () => {
    setIsSeeding(true);
    try {
      for (const sample of sampleVaultDocuments) {
        const buffer = sample.generateBuffer();
        await documentService.importArrayBuffer(
          buffer,
          sample.fileName,
          buffer.byteLength,
          {
            category: sample.category,
            tags: sample.tags,
            description: sample.description,
            skipDuplicateCheck: true,
          }
        );
      }
      onRefreshData();
    } catch (err) {
      alert('Error adding sample documents: ' + (err instanceof Error ? err.message : 'Failed'));
    } finally {
      setIsSeeding(false);
    }
  };

  // Render individual sections
  const renderSection = (sectionId: DashboardSectionId) => {
    if (hiddenSections.includes(sectionId)) return null;

    switch (sectionId) {
      case 'hero':
        return (
          <div
            key="hero"
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0e172a] via-[#0b1222] to-[#070b16] border border-slate-800/90 p-6 sm:p-8 shadow-2xl"
          >
            {/* Ambient background glow */}
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-1/3 -mb-10 w-64 h-64 bg-blue-600/10 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>On-Device Vault & Cloud Sync</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Personal PDF Hub & Vault
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Store, view, tag, and organize your timetables, college notes, certificates, and personal records securely in your personal vault.
                </p>
              </div>

              {/* Quick Action CTA */}
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  onClick={() => onOpenImport()}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold text-xs sm:text-sm shadow-xl shadow-sky-500/25 transition-all active:scale-[0.98]"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Import PDFs</span>
                </button>
                <button
                  onClick={onOpenLayoutModal}
                  className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700/80 font-medium text-xs sm:text-sm transition"
                  title="Customize Dashboard Order"
                >
                  <SlidersHorizontal className="w-4 h-4 text-sky-400" />
                  <span>Layout Order</span>
                </button>
              </div>
            </div>

            {/* Quick Stats Strip */}
            <div className="mt-8 pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-0.5">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider">Total Documents</span>
                <p className="text-xl sm:text-2xl font-bold font-mono text-white">{documents.length}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider">Timetables</span>
                <p className="text-xl sm:text-2xl font-bold font-mono text-cyan-400">{timetableDocs.length}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider">Storage Consumed</span>
                <p className="text-xl sm:text-2xl font-bold font-mono text-sky-400">{formatBytes(totalBytes)}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[11px] text-slate-400 uppercase tracking-wider">Collections</span>
                <p className="text-xl sm:text-2xl font-bold font-mono text-white">{collections.length}</p>
              </div>
            </div>
          </div>
        );

      case 'timetable':
        return (
          <div key="timetable" className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </span>
                <h2 className="text-sm sm:text-base font-bold text-white">Timetables & Class Schedules</h2>
                <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
                  {timetableDocs.length}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpenImport('timetable')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Timetable</span>
                </button>
                <button
                  onClick={() => onNavigateToLibrary({ category: 'timetable' })}
                  className="text-xs text-sky-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <span>View all</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {timetableDocs.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {timetableDocs.map(doc => {
                  const col = collections.find(c => c.id === doc.category);
                  return (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      collection={col}
                      onOpen={onOpenDocument}
                      onToggleFavorite={onToggleFavorite}
                      onTogglePinned={onTogglePinned}
                      onDownload={onDownload}
                      onDelete={onDelete}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-cyan-950/20 border border-cyan-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-semibold text-white">No Timetable PDFs Added Yet</h3>
                    <p className="text-[11px] text-slate-400">
                      Upload your semester class schedule, lab routine, or exam timetable for 1-click access.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onOpenImport('timetable')}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs shadow-md shadow-cyan-500/20 transition shrink-0"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Upload Timetable PDF</span>
                </button>
              </div>
            )}
          </div>
        );

      case 'quick_access':
        if (pinnedDocs.length === 0) return null;
        return (
          <div key="quick_access" className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-sky-400 fill-sky-400" />
                <h2 className="text-sm sm:text-base font-bold text-white">Quick Access (Pinned)</h2>
                <span className="text-xs font-mono text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
                  {pinnedDocs.length}
                </span>
              </div>
              <button
                onClick={() => onNavigateToLibrary({ onlyPinned: true })}
                className="text-xs text-sky-400 hover:underline flex items-center gap-1 font-medium"
              >
                <span>See all pinned</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {pinnedDocs.slice(0, 4).map(doc => {
                const col = collections.find(c => c.id === doc.category);
                return (
                  <DocumentCard
                    key={doc.id}
                    document={doc}
                    collection={col}
                    onOpen={onOpenDocument}
                    onToggleFavorite={onToggleFavorite}
                    onTogglePinned={onTogglePinned}
                    onDownload={onDownload}
                    onDelete={onDelete}
                  />
                );
              })}
            </div>
          </div>
        );

      case 'collections':
        return (
          <div key="collections" className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm sm:text-base font-bold text-white">Collections</h2>
                <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                  {collections.length}
                </span>
              </div>
              <button
                onClick={onManageCollections}
                className="text-xs text-sky-400 hover:underline flex items-center gap-1 font-medium"
              >
                <span>Manage Collections</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              {collections.map(col => {
                const count = collectionCounts[col.id] || 0;
                return (
                  <div
                    key={col.id}
                    onClick={() => onNavigateToLibrary({ category: col.id })}
                    className="group relative p-3.5 rounded-2xl bg-[#0c1220]/90 hover:bg-[#11192d] border border-slate-800/90 hover:border-slate-700 transition cursor-pointer flex flex-col justify-between gap-3 shadow-sm hover:shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className="w-8 h-8 rounded-xl flex items-center justify-center border transition group-hover:scale-105"
                        style={{
                          backgroundColor: `${col.color}18`,
                          borderColor: `${col.color}35`,
                        }}
                      >
                        <CategoryIcon icon={col.icon} color={col.color} className="w-4 h-4" />
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-400 group-hover:text-white">
                        {count}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-xs font-semibold text-white group-hover:text-sky-300 transition-colors truncate">
                        {col.name}
                      </h3>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">
                        {col.description || 'Documents'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 'recent_opened':
        if (recentlyOpenedDocs.length === 0) return null;
        return (
          <div key="recent_opened" className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm sm:text-base font-bold text-white">Recently Opened</h2>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {recentlyOpenedDocs.map(doc => {
                const col = collections.find(c => c.id === doc.category);
                return (
                  <DocumentCard
                    key={doc.id}
                    document={doc}
                    collection={col}
                    onOpen={onOpenDocument}
                    onToggleFavorite={onToggleFavorite}
                    onTogglePinned={onTogglePinned}
                    onDownload={onDownload}
                    onDelete={onDelete}
                  />
                );
              })}
            </div>
          </div>
        );

      case 'recent_imports':
        return (
          <div key="recent_imports" className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-400" />
                <h2 className="text-sm sm:text-base font-bold text-white">Recent Imports</h2>
                <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                  {documents.length}
                </span>
              </div>
              {documents.length > 6 && (
                <button
                  onClick={() => onNavigateToLibrary()}
                  className="text-xs text-sky-400 hover:underline flex items-center gap-1 font-medium"
                >
                  <span>View all ({documents.length})</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {recentImports.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {recentImports.map(doc => {
                  const col = collections.find(c => c.id === doc.category);
                  return (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      collection={col}
                      onOpen={onOpenDocument}
                      onToggleFavorite={onToggleFavorite}
                      onTogglePinned={onTogglePinned}
                      onDownload={onDownload}
                      onDelete={onDelete}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="p-8 sm:p-12 rounded-3xl bg-[#0c1322]/80 border border-slate-800/80 text-center space-y-4">
                <div className="w-16 h-16 rounded-3xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center mx-auto shadow-inner">
                  <FileText className="w-8 h-8" />
                </div>
                <div className="max-w-md mx-auto space-y-1.5">
                  <h3 className="text-base font-semibold text-white">Your Vault is Empty</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Import your timetable, syllabus, or lecture notes to get started.
                  </p>
                </div>
                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => onOpenImport()}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold text-xs shadow-lg shadow-sky-500/20 transition"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Import PDFs</span>
                  </button>
                  <button
                    onClick={handleSeedSamples}
                    disabled={isSeeding}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 font-medium text-xs transition disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{isSeeding ? 'Generating...' : 'Add Sample Guides'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-300">
      {/* Global Search Input Bar */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="w-5 h-5 text-slate-400 absolute left-4 pointer-events-none" />
          <input
            type="text"
            placeholder="Search timetable, subject notes, certificates, or tags..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                onNavigateToLibrary();
              }
            }}
            className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-[#0c1322] border border-slate-800/90 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 shadow-lg shadow-black/20"
          />
          {searchQuery && (
            <button
              onClick={() => onNavigateToLibrary()}
              className="absolute right-3 px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition"
            >
              Search
            </button>
          )}
        </div>
      </div>

      {/* Render Sections in Dynamic User-Configured Order */}
      {sectionOrder.map(secId => renderSection(secId))}
    </div>
  );
};
