import React, { useState, useMemo } from 'react';
import {
  Search,
  LayoutGrid,
  List,
  ArrowUpDown,
  Filter,
  Bookmark,
  Star,
  Tag,
  Trash2,
  Folder,
  X,
  UploadCloud,
  FileText,
  SlidersHorizontal,
  ChevronDown,
  Sparkles,
  Archive,
  FolderInput,
  Loader2,
  Plus,
} from 'lucide-react';
import { CollectionItem, DocumentItem, SortField, SortOrder, ViewMode } from '../../types';
import { DocumentCard } from './DocumentCard';
import { DocumentRow } from './DocumentRow';
import { CategoryIcon } from '../../components/common/CategoryIcon';
import { formatBytes } from '../../lib/storage-service';
import { documentService } from '../../lib/document-service';

interface DocumentLibraryViewProps {
  documents: DocumentItem[];
  collections: CollectionItem[];
  allTags: string[];
  initialCategory?: string;
  initialOnlyFavorites?: boolean;
  initialOnlyPinned?: boolean;
  initialSearchQuery?: string;
  onOpenDocument: (doc: DocumentItem) => void;
  onOpenImport: (category?: string) => void;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  onTogglePinned: (id: string, e: React.MouseEvent) => void;
  onDownload: (doc: DocumentItem, e: React.MouseEvent) => void;
  onDelete: (doc: DocumentItem, e: React.MouseEvent) => void;
  onBulkDelete: (ids: string[]) => void;
  onManageCollections: () => void;
  onBatchOperationCompleted?: () => void;
}

export const DocumentLibraryView: React.FC<DocumentLibraryViewProps> = ({
  documents,
  collections,
  allTags,
  initialCategory = 'all',
  initialOnlyFavorites = false,
  initialOnlyPinned = false,
  initialSearchQuery = '',
  onOpenDocument,
  onOpenImport,
  onToggleFavorite,
  onTogglePinned,
  onDownload,
  onDelete,
  onBulkDelete,
  onManageCollections,
  onBatchOperationCompleted,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState<string>(initialSearchQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(initialOnlyFavorites);
  const [onlyPinned, setOnlyPinned] = useState<boolean>(initialOnlyPinned);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Deep Full-Text Search inside PDF contents
  const [isDeepSearch, setIsDeepSearch] = useState<boolean>(false);
  const [deepMatches, setDeepMatches] = useState<Map<string, string>>(new Map());
  const [isDeepSearching, setIsDeepSearching] = useState<boolean>(false);

  React.useEffect(() => {
    let active = true;
    if (isDeepSearch && searchQuery.trim().length >= 2) {
      setIsDeepSearching(true);
      const timer = setTimeout(async () => {
        try {
          const results = await documentService.searchDocumentsDeep(searchQuery, documents);
          if (active) {
            const map = new Map<string, string>();
            results.forEach(r => map.set(r.doc.id, r.snippet));
            setDeepMatches(map);
          }
        } finally {
          if (active) setIsDeepSearching(false);
        }
      }, 300);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    } else {
      setDeepMatches(new Map());
      setIsDeepSearching(false);
    }
  }, [isDeepSearch, searchQuery, documents]);

  // Sorting
  const [sortField, setSortField] = useState<SortField>('importedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isBatchWorking, setIsBatchWorking] = useState(false);
  const [batchWorkMessage, setBatchWorkMessage] = useState('');
  const [showTagPrompt, setShowTagPrompt] = useState(false);
  const [batchTagInput, setBatchTagInput] = useState('');

  // Batch actions
  const handleBatchMoveCategory = async (targetCategory: string) => {
    if (!targetCategory || selectedIds.size === 0) return;
    setIsBatchWorking(true);
    setBatchWorkMessage('Updating collections...');
    try {
      await documentService.batchUpdateCategory(Array.from(selectedIds), targetCategory);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      onBatchOperationCompleted?.();
    } catch (err) {
      alert('Failed to update category: ' + (err instanceof Error ? err.message : 'Error'));
    } finally {
      setIsBatchWorking(false);
      setBatchWorkMessage('');
    }
  };

  const handleBatchAddTagSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!batchTagInput.trim() || selectedIds.size === 0) return;
    setIsBatchWorking(true);
    setBatchWorkMessage('Adding tags...');
    try {
      await documentService.batchAddTag(Array.from(selectedIds), batchTagInput.trim());
      setBatchTagInput('');
      setShowTagPrompt(false);
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      onBatchOperationCompleted?.();
    } catch (err) {
      alert('Failed to add tag: ' + (err instanceof Error ? err.message : 'Error'));
    } finally {
      setIsBatchWorking(false);
      setBatchWorkMessage('');
    }
  };

  const handleBatchDownloadZip = async () => {
    if (selectedIds.size === 0) return;
    setIsBatchWorking(true);
    setBatchWorkMessage('Packaging ZIP archive...');
    try {
      const selectedDocs = documents.filter(d => selectedIds.has(d.id));
      await documentService.downloadBatchAsZip(selectedDocs, (_p, status) => {
        setBatchWorkMessage(status);
      });
    } catch (err) {
      alert('Failed to download ZIP: ' + (err instanceof Error ? err.message : 'Error'));
    } finally {
      setIsBatchWorking(false);
      setBatchWorkMessage('');
    }
  };

  // Filter & Sort Logic
  const filteredDocuments = useMemo(() => {
    return documents
      .filter(doc => {
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchTitle = doc.displayName.toLowerCase().includes(q);
          const matchFile = doc.fileName.toLowerCase().includes(q);
          const matchDesc = (doc.description || '').toLowerCase().includes(q);
          const matchTag = doc.tags?.some(t => t.toLowerCase().includes(q));
          const matchDeep = isDeepSearch && deepMatches.has(doc.id);
          const matchBookmark = doc.pageBookmarks?.some(
            b => b.title.toLowerCase().includes(q) || (b.note && b.note.toLowerCase().includes(q))
          );

          if (!matchTitle && !matchFile && !matchDesc && !matchTag && !matchDeep && !matchBookmark) {
            return false;
          }
        }

        // Category filter
        if (selectedCategory !== 'all' && doc.category !== selectedCategory) {
          return false;
        }

        // Favorites
        if (onlyFavorites && !doc.isFavorite) {
          return false;
        }

        // Pinned
        if (onlyPinned && !doc.isPinned) {
          return false;
        }

        // Tag filter
        if (selectedTag && (!doc.tags || !doc.tags.includes(selectedTag))) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === 'importedAt') {
          cmp = a.importedAt - b.importedAt;
        } else if (sortField === 'lastOpenedAt') {
          cmp = (a.lastOpenedAt || 0) - (b.lastOpenedAt || 0);
        } else if (sortField === 'displayName') {
          cmp = a.displayName.localeCompare(b.displayName);
        } else if (sortField === 'fileSize') {
          cmp = a.fileSize - b.fileSize;
        } else if (sortField === 'pageCount') {
          cmp = a.pageCount - b.pageCount;
        }
        return sortOrder === 'asc' ? cmp : -cmp;
      });
  }, [documents, searchQuery, selectedCategory, onlyFavorites, onlyPinned, selectedTag, sortField, sortOrder]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDocuments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDocuments.map(d => d.id)));
    }
  };

  const handleToggleSelectDoc = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkDeleteConfirm = () => {
    if (selectedIds.size === 0) return;
    const confirm = window.confirm(
      `Are you sure you want to delete ${selectedIds.size} selected document(s) permanently?`
    );
    if (confirm) {
      onBulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
      setIsSelectionMode(false);
    }
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setOnlyFavorites(false);
    setOnlyPinned(false);
    setSelectedTag(null);
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedCategory !== 'all' ||
    onlyFavorites ||
    onlyPinned ||
    selectedTag !== null;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span>Document Library</span>
            <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-full bg-slate-800 text-sky-400 border border-slate-700">
              {filteredDocuments.length} of {documents.length}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Browse, search, sort, and organize all your on-device PDF files.
          </p>
        </div>

        {/* Top actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onOpenImport(selectedCategory !== 'all' ? selectedCategory : undefined)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-semibold text-xs shadow-md shadow-sky-500/20 transition active:scale-[0.98]"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Import PDF</span>
          </button>

          <button
            onClick={() => setIsSelectionMode(!isSelectionMode)}
            className={`px-3 py-2.5 rounded-xl text-xs font-medium border transition ${
              isSelectionMode
                ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                : 'bg-slate-900/80 border-slate-700/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {isSelectionMode ? 'Cancel Select' : 'Select'}
          </button>

          {/* Grid / List View Toggle */}
          <div className="flex items-center rounded-xl bg-slate-900 border border-slate-800 p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition ${
                viewMode === 'grid'
                  ? 'bg-sky-500/20 text-sky-400'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition ${
                viewMode === 'list'
                  ? 'bg-sky-500/20 text-sky-400'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Batch Selection Action Bar */}
      {isSelectionMode && (
        <div className="p-3 rounded-2xl bg-sky-950/40 border border-sky-500/30 text-xs animate-in slide-in-from-top-2 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="font-medium text-sky-300 hover:underline"
              >
                {selectedIds.size === filteredDocuments.length ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-slate-400 font-mono">
                {selectedIds.size} selected
              </span>
              {isBatchWorking && (
                <span className="flex items-center gap-1.5 text-sky-400 animate-pulse text-[11px]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{batchWorkMessage || 'Processing...'}</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Move to Collection */}
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1 text-xs">
                <FolderInput className="w-3.5 h-3.5 text-sky-400" />
                <select
                  disabled={selectedIds.size === 0 || isBatchWorking}
                  onChange={e => {
                    if (e.target.value) {
                      handleBatchMoveCategory(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  defaultValue=""
                  className="bg-transparent text-slate-200 focus:outline-none cursor-pointer disabled:opacity-40"
                >
                  <option value="" disabled className="bg-slate-900">
                    Move to...
                  </option>
                  {collections.map(col => (
                    <option key={col.id} value={col.id} className="bg-slate-900">
                      {col.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Add Tag */}
              <button
                onClick={() => setShowTagPrompt(prev => !prev)}
                disabled={selectedIds.size === 0 || isBatchWorking}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 disabled:opacity-40 transition"
                title="Add tag to selected"
              >
                <Tag className="w-3.5 h-3.5 text-amber-400" />
                <span>Tag</span>
              </button>

              {/* Download as ZIP */}
              <button
                onClick={handleBatchDownloadZip}
                disabled={selectedIds.size === 0 || isBatchWorking}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 disabled:opacity-40 transition"
                title="Download selected as ZIP archive"
              >
                <Archive className="w-3.5 h-3.5 text-sky-400" />
                <span>Download ZIP</span>
              </button>

              {/* Delete Selected */}
              <button
                onClick={handleBulkDeleteConfirm}
                disabled={selectedIds.size === 0 || isBatchWorking}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs disabled:opacity-50 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete ({selectedIds.size})</span>
              </button>
            </div>
          </div>

          {/* Quick Tag Entry Sub-row */}
          {showTagPrompt && selectedIds.size > 0 && (
            <form
              onSubmit={handleBatchAddTagSubmit}
              className="flex items-center gap-2 pt-2 border-t border-slate-800/80 animate-in fade-in"
            >
              <Tag className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <input
                type="text"
                placeholder="Enter tag to apply to selected documents (e.g. syllabus, sem4)..."
                value={batchTagInput}
                onChange={e => setBatchTagInput(e.target.value)}
                autoFocus
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1 text-xs text-white focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={!batchTagInput.trim() || isBatchWorking}
                className="px-3 py-1 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs disabled:opacity-40"
              >
                Apply Tag
              </button>
              <button
                type="button"
                onClick={() => setShowTagPrompt(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      )}

      {/* Search & Sort Controls Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search with Deep Search Toggle */}
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                isDeepSearch
                  ? 'Deep search text inside all stored PDF pages...'
                  : 'Search by name, tags, or bookmarks...'
              }
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-[#0c1220] border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 shadow-sm"
            />
            {isDeepSearching ? (
              <Loader2 className="w-4 h-4 text-sky-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
            ) : searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>

          {/* Deep Content Search Toggle */}
          <button
            onClick={() => setIsDeepSearch(!isDeepSearch)}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition shrink-0 ${
              isDeepSearch
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 font-semibold shadow-sm'
                : 'bg-[#0c1220] text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Search inside the full text of all stored PDF files"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isDeepSearch ? 'text-sky-400 fill-sky-400/20' : 'text-slate-500'}`} />
            <span className="hidden sm:inline">Deep Search</span>
          </button>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-[#0c1220] border border-slate-800 rounded-xl px-3 py-2 text-xs">
            <span className="text-slate-400 flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3 text-sky-400" />
              Sort:
            </span>
            <select
              value={sortField}
              onChange={e => setSortField(e.target.value as SortField)}
              className="bg-transparent text-white focus:outline-none cursor-pointer"
            >
              <option value="importedAt" className="bg-slate-900">Import Date</option>
              <option value="lastOpenedAt" className="bg-slate-900">Last Opened</option>
              <option value="displayName" className="bg-slate-900">Display Name</option>
              <option value="fileSize" className="bg-slate-900">File Size</option>
              <option value="pageCount" className="bg-slate-900">Page Count</option>
            </select>
          </div>

          <button
            onClick={() => setSortOrder(o => (o === 'asc' ? 'desc' : 'asc'))}
            className="px-3 py-2 rounded-xl bg-[#0c1220] border border-slate-800 text-xs text-slate-300 hover:text-white font-mono"
            title="Toggle Ascending / Descending"
          >
            {sortOrder.toUpperCase()}
          </button>
        </div>
      </div>

      {/* Category Pills & Quick Filter Chips */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {/* All tab */}
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition border ${
              selectedCategory === 'all'
                ? 'bg-sky-500/20 text-sky-300 border-sky-400/40 shadow-sm'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            All Collections ({documents.length})
          </button>

          {/* Collection Pills */}
          {collections.map(col => {
            const isSelected = selectedCategory === col.id;
            const count = documents.filter(d => d.category === col.id).length;
            return (
              <button
                key={col.id}
                onClick={() => setSelectedCategory(col.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition border ${
                  isSelected
                    ? 'border-sky-400/50 shadow-sm'
                    : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
                style={
                  isSelected
                    ? { backgroundColor: `${col.color}25`, color: col.color }
                    : undefined
                }
              >
                <CategoryIcon icon={col.icon} color={isSelected ? col.color : undefined} className="w-3.5 h-3.5" />
                <span>{col.name}</span>
                <span className="font-mono text-[10px] opacity-75">({count})</span>
              </button>
            );
          })}

          <button
            onClick={onManageCollections}
            className="px-2.5 py-1.5 rounded-xl text-xs text-sky-400 bg-sky-500/10 border border-sky-500/20 whitespace-nowrap hover:bg-sky-500/20 transition"
          >
            + New Category
          </button>
        </div>

        {/* Favorite & Pinned & Tag Chips row */}
        <div className="flex items-center gap-2 flex-wrap text-xs pt-1">
          <button
            onClick={() => setOnlyFavorites(!onlyFavorites)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition ${
              onlyFavorites
                ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Star className={`w-3 h-3 ${onlyFavorites ? 'fill-amber-400 text-amber-400' : ''}`} />
            <span>Favorites</span>
          </button>

          <button
            onClick={() => setOnlyPinned(!onlyPinned)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition ${
              onlyPinned
                ? 'bg-sky-500/15 border-sky-400/40 text-sky-300'
                : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bookmark className={`w-3 h-3 ${onlyPinned ? 'fill-sky-400 text-sky-400' : ''}`} />
            <span>Pinned</span>
          </button>

          {/* Tag filters */}
          {allTags.slice(0, 8).map(t => (
            <button
              key={t}
              onClick={() => setSelectedTag(selectedTag === t ? null : t)}
              className={`px-2 py-0.5 rounded-md border text-[11px] transition ${
                selectedTag === t
                  ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                  : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-300'
              }`}
            >
              #{t}
            </button>
          ))}

          {hasActiveFilters && (
            <button
              onClick={resetAllFilters}
              className="text-[11px] text-rose-400 hover:underline flex items-center gap-1 ml-auto"
            >
              <X className="w-3 h-3" />
              <span>Reset filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Documents Grid or List */}
      {filteredDocuments.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredDocuments.map(doc => {
              const col = collections.find(c => c.id === doc.category);
              return (
                <div key={doc.id} className="relative">
                  {isSelectionMode && (
                    <div
                      onClick={() => handleToggleSelectDoc(doc.id)}
                      className="absolute top-3 left-3 z-20 cursor-pointer p-1 rounded-md bg-black/60 backdrop-blur-md"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(doc.id)}
                        onChange={() => {}}
                        className="rounded border-slate-600 text-sky-500 focus:ring-sky-500"
                      />
                    </div>
                  )}
                  <DocumentCard
                    document={doc}
                    collection={col}
                    isSelected={selectedIds.has(doc.id)}
                    matchedSnippet={deepMatches.get(doc.id)}
                    onOpen={isSelectionMode ? () => handleToggleSelectDoc(doc.id) : onOpenDocument}
                    onToggleFavorite={onToggleFavorite}
                    onTogglePinned={onTogglePinned}
                    onDownload={onDownload}
                    onDelete={onDelete}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDocuments.map(doc => {
              const col = collections.find(c => c.id === doc.category);
              return (
                <div key={doc.id} className="flex items-center gap-3">
                  {isSelectionMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(doc.id)}
                      onChange={() => handleToggleSelectDoc(doc.id)}
                      className="rounded border-slate-600 text-sky-500 focus:ring-sky-500 ml-1"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <DocumentRow
                      document={doc}
                      collection={col}
                      onOpen={onOpenDocument}
                      onToggleFavorite={onToggleFavorite}
                      onTogglePinned={onTogglePinned}
                      onDownload={onDownload}
                      onDelete={onDelete}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Empty Filtered Result State */
        <div className="p-12 rounded-3xl bg-[#0c1220]/70 border border-slate-800 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-white">No documents match your criteria</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {hasActiveFilters
              ? 'Try relaxing your search terms or clearing selected category filters.'
              : 'This collection does not have any documents yet.'}
          </p>
          <div className="pt-2 flex justify-center gap-3">
            {hasActiveFilters ? (
              <button
                onClick={resetAllFilters}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-white hover:bg-slate-700 transition"
              >
                Clear all filters
              </button>
            ) : (
              <button
                onClick={() => onOpenImport(selectedCategory !== 'all' ? selectedCategory : undefined)}
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition"
              >
                Import to this collection
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
