import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Star,
  Bookmark,
  Download,
  Trash2,
  FileText,
  Layers,
  Sparkles,
  ArrowRight,
  FolderOpen,
} from 'lucide-react';
import { CollectionItem, DocumentItem } from '../../types';
import { CategoryIcon } from '../../components/common/CategoryIcon';
import { formatBytes } from '../../lib/storage-service';

interface RecentDocumentsCarouselProps {
  documents: DocumentItem[];
  collections: CollectionItem[];
  onOpenDocument: (doc: DocumentItem) => void;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  onTogglePinned: (id: string, e: React.MouseEvent) => void;
  onDownload: (doc: DocumentItem, e: React.MouseEvent) => void;
  onDelete: (doc: DocumentItem, e: React.MouseEvent) => void;
  onNavigateToLibrary: () => void;
  onOpenImport?: () => void;
}

type FilterTab = 'all' | 'opened' | 'newest';

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return 'Never';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export const RecentDocumentsCarousel: React.FC<RecentDocumentsCarouselProps> = ({
  documents,
  collections,
  onOpenDocument,
  onToggleFavorite,
  onTogglePinned,
  onDownload,
  onDelete,
  onNavigateToLibrary,
  onOpenImport,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Group and sort documents based on active tab
  const readDocs = React.useMemo(() => {
    return documents
      .filter((d) => Boolean(d.lastOpenedAt))
      .sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));
  }, [documents]);

  const newestDocs = React.useMemo(() => {
    return [...documents].sort((a, b) => b.importedAt - a.importedAt);
  }, [documents]);

  const allRecentDocs = React.useMemo(() => {
    return [...documents].sort((a, b) => {
      const timeA = Math.max(a.lastOpenedAt || 0, a.importedAt);
      const timeB = Math.max(b.lastOpenedAt || 0, b.importedAt);
      return timeB - timeA;
    });
  }, [documents]);

  // Determine filtered list
  const filteredDocs = React.useMemo(() => {
    if (activeTab === 'opened') {
      return readDocs;
    }
    if (activeTab === 'newest') {
      return newestDocs;
    }
    return allRecentDocs;
  }, [activeTab, readDocs, newestDocs, allRecentDocs]);

  // Check scroll positions
  const updateScrollState = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 6);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);

    // Compute active card index
    const firstChild = el.firstElementChild as HTMLElement | null;
    const cardWidth = firstChild ? firstChild.offsetWidth + 16 : 320;
    const currentIdx = Math.min(
      Math.max(0, Math.round(scrollLeft / cardWidth)),
      Math.max(0, filteredDocs.length - 1)
    );
    setActiveIndex(currentIdx);
  }, [filteredDocs.length]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState]);

  // Reset scroll position when switching tabs
  const handleTabChange = (tab: FilterTab) => {
    setActiveTab(tab);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const firstChild = el.firstElementChild as HTMLElement | null;
    const cardWidth = firstChild ? firstChild.offsetWidth + 16 : 340;
    const scrollAmount = direction === 'left' ? -cardWidth * 1.5 : cardWidth * 1.5;

    el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  const scrollToCard = (index: number) => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const firstChild = el.firstElementChild as HTMLElement | null;
    const cardWidth = firstChild ? firstChild.offsetWidth + 16 : 340;
    el.scrollTo({ left: index * cardWidth, behavior: 'smooth' });
  };

  if (documents.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c1322] to-[#070b14] border border-slate-800/90 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-center gap-6 justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
              <FileText className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Recent Documents Carousel</h3>
              <p className="text-xs text-slate-400 mt-1">
                Your recently read and imported PDFs will appear here with instant previews and quick actions.
              </p>
            </div>
          </div>
          {onOpenImport && (
            <button
              onClick={onOpenImport}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-medium text-xs transition shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              <span>Import First Document</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-3.5">
      {/* Header bar with tabs and carousel navigation controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Clock className="w-4 h-4" />
            </div>
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Recent Documents
            </h2>
            <span className="text-[11px] font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-full">
              {filteredDocs.length}
            </span>
          </div>

          {/* Filter Pills / Tabs */}
          <div className="hidden md:flex items-center gap-1 bg-slate-900/90 border border-slate-800/90 p-0.5 rounded-xl text-xs">
            <button
              onClick={() => handleTabChange('all')}
              className={`px-2.5 py-1 rounded-lg transition font-medium ${
                activeTab === 'all'
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Activity
            </button>
            <button
              onClick={() => handleTabChange('opened')}
              className={`px-2.5 py-1 rounded-lg transition font-medium flex items-center gap-1.5 ${
                activeTab === 'opened'
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Read</span>
              {readDocs.length > 0 && (
                <span className="text-[10px] font-mono opacity-80">({readDocs.length})</span>
              )}
            </button>
            <button
              onClick={() => handleTabChange('newest')}
              className={`px-2.5 py-1 rounded-lg transition font-medium ${
                activeTab === 'newest'
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Newly Added
            </button>
          </div>
        </div>

        {/* Carousel Prev/Next Buttons and Library Link */}
        <div className="flex items-center justify-between sm:justify-end gap-2">
          {/* Mobile subtabs */}
          <div className="flex md:hidden items-center gap-1 bg-slate-900/90 border border-slate-800/90 p-0.5 rounded-xl text-xs">
            <button
              onClick={() => handleTabChange('all')}
              className={`px-2 py-0.5 rounded-lg transition text-[11px] font-medium ${
                activeTab === 'all' ? 'bg-sky-500 text-white' : 'text-slate-400'
              }`}
            >
              All
            </button>
            <button
              onClick={() => handleTabChange('opened')}
              className={`px-2 py-0.5 rounded-lg transition text-[11px] font-medium ${
                activeTab === 'opened' ? 'bg-sky-500 text-white' : 'text-slate-400'
              }`}
            >
              Read ({readDocs.length})
            </button>
            <button
              onClick={() => handleTabChange('newest')}
              className={`px-2 py-0.5 rounded-lg transition text-[11px] font-medium ${
                activeTab === 'newest' ? 'bg-sky-500 text-white' : 'text-slate-400'
              }`}
            >
              New
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onNavigateToLibrary}
              className="hidden lg:flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 font-medium px-2 py-1 mr-1 transition"
            >
              <span>Library</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {/* Prev Button */}
            <button
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              aria-label="Previous documents"
              className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all ${
                canScrollLeft
                  ? 'bg-slate-900/90 hover:bg-slate-800 border-slate-700/80 text-white active:scale-95 shadow-md'
                  : 'bg-slate-950/40 border-slate-800/40 text-slate-600 cursor-not-allowed'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Next Button */}
            <button
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              aria-label="Next documents"
              className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all ${
                canScrollRight
                  ? 'bg-slate-900/90 hover:bg-slate-800 border-slate-700/80 text-white active:scale-95 shadow-md'
                  : 'bg-slate-950/40 border-slate-800/40 text-slate-600 cursor-not-allowed'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Carousel Track */}
      {filteredDocs.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#0b1220]/80 border border-slate-800 text-center space-y-2">
          <BookOpen className="w-7 h-7 text-slate-500 mx-auto" />
          <p className="text-xs text-slate-300 font-medium">No documents opened yet</p>
          <p className="text-[11px] text-slate-500">
            Open any document from the Newly Added tab or library to begin tracking your reading history.
          </p>
          <button
            onClick={() => handleTabChange('newest')}
            className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline pt-1"
          >
            <span>View Newly Added</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div className="relative group/carousel">
          {/* Subtle Left Fade Gradient */}
          <div
            className={`absolute left-0 top-0 bottom-3 w-8 bg-gradient-to-r from-[#070b14] to-transparent z-10 pointer-events-none transition-opacity duration-300 ${
              canScrollLeft ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Subtle Right Fade Gradient */}
          <div
            className={`absolute right-0 top-0 bottom-3 w-8 bg-gradient-to-l from-[#070b14] to-transparent z-10 pointer-events-none transition-opacity duration-300 ${
              canScrollRight ? 'opacity-100' : 'opacity-0'
            }`}
          />

          <div
            ref={scrollContainerRef}
            className="flex items-stretch gap-4 overflow-x-auto pb-3 pt-1 px-1 scroll-smooth snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:none"
          >
            {filteredDocs.map((doc) => {
              const col = collections.find((c) => c.id === doc.category);
              const relativeTime = doc.lastOpenedAt
                ? `Opened ${formatRelativeTime(doc.lastOpenedAt)}`
                : `Added ${formatRelativeTime(doc.importedAt)}`;

              return (
                <div
                  key={doc.id}
                  className="snap-start shrink-0 w-[275px] sm:w-[310px] md:w-[330px] flex flex-col justify-between rounded-2xl bg-gradient-to-b from-[#0e1628] to-[#0a101e] border border-slate-800/90 hover:border-sky-500/50 shadow-lg hover:shadow-xl hover:shadow-sky-500/10 transition-all duration-300 group overflow-hidden"
                >
                  {/* Top Thumbnail Preview Area */}
                  <div
                    onClick={() => onOpenDocument(doc)}
                    className="relative aspect-[16/10] w-full bg-[#070b14] overflow-hidden flex items-center justify-center cursor-pointer border-b border-slate-800/80"
                  >
                    {doc.thumbnailDataUrl ? (
                      <img
                        src={doc.thumbnailDataUrl}
                        alt={doc.displayName}
                        className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-500 group-hover:text-sky-400 transition-colors p-4 w-full">
                        <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-inner">
                          <FileText className="w-6 h-6 text-sky-400" />
                        </div>
                        <div className="w-3/4 space-y-1 opacity-40">
                          <div className="h-1.5 bg-slate-700 rounded-full w-full" />
                          <div className="h-1.5 bg-slate-700 rounded-full w-5/6" />
                          <div className="h-1.5 bg-slate-700 rounded-full w-2/3" />
                        </div>
                      </div>
                    )}

                    {/* Gradient overlay on thumbnail bottom */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0e1628] via-transparent to-black/40 pointer-events-none" />

                    {/* Top overlay badges: Collection & Quick Pins */}
                    <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-auto">
                      {col ? (
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-md border shadow-sm"
                          style={{
                            backgroundColor: `${col.color}25`,
                            color: col.color,
                            borderColor: `${col.color}40`,
                          }}
                        >
                          <CategoryIcon icon={col.icon} className="w-3 h-3" />
                          <span className="truncate max-w-[90px]">{col.name}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-900/85 text-slate-300 border border-slate-700/80 backdrop-blur-md">
                          <FolderOpen className="w-3 h-3 text-sky-400" />
                          <span>Vault</span>
                        </span>
                      )}

                      {/* Favorite & Pin buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => onTogglePinned(doc.id, e)}
                          className={`p-1.5 rounded-lg backdrop-blur-md transition ${
                            doc.isPinned
                              ? 'bg-sky-500/20 text-sky-400 border border-sky-400/40'
                              : 'bg-black/50 text-slate-400 hover:text-white hover:bg-black/75'
                          }`}
                          title={doc.isPinned ? 'Unpin' : 'Pin to Quick Access'}
                        >
                          <Bookmark className={`w-3.5 h-3.5 ${doc.isPinned ? 'fill-sky-400' : ''}`} />
                        </button>
                        <button
                          onClick={(e) => onToggleFavorite(doc.id, e)}
                          className={`p-1.5 rounded-lg backdrop-blur-md transition ${
                            doc.isFavorite
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-400/40'
                              : 'bg-black/50 text-slate-400 hover:text-white hover:bg-black/75'
                          }`}
                          title={doc.isFavorite ? 'Remove Favorite' : 'Add to Favorites'}
                        >
                          <Star className={`w-3.5 h-3.5 ${doc.isFavorite ? 'fill-amber-400' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Bottom overlay: Pages & Bookmarks notes */}
                    <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-200 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10">
                        <Layers className="w-3 h-3 text-sky-400" />
                        <span>
                          {doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'}
                        </span>
                      </div>

                      {doc.pageBookmarks && doc.pageBookmarks.length > 0 && (
                        <div className="flex items-center gap-1 text-[10px] font-mono text-amber-300 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-md border border-amber-500/30">
                          <Bookmark className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                          <span>
                            {doc.pageBookmarks.length} {doc.pageBookmarks.length === 1 ? 'note' : 'notes'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Content & Metadata */}
                  <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between gap-3">
                    <div className="space-y-1.5 cursor-pointer" onClick={() => onOpenDocument(doc)}>
                      <h3
                        className="text-xs sm:text-sm font-semibold text-white group-hover:text-sky-300 transition-colors line-clamp-1 tracking-tight"
                        title={doc.displayName}
                      >
                        {doc.displayName}
                      </h3>

                      <p className="text-[11px] text-slate-400 line-clamp-1 font-mono">
                        {doc.fileName}
                      </p>

                      {/* Unboxed Tabular Metadata Row */}
                      <div className="flex items-center gap-2 pt-1 text-[11px] font-mono text-slate-400">
                        <span>{formatBytes(doc.fileSize)}</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-sky-400/90 truncate">{relativeTime}</span>
                      </div>

                      {/* Tags (if any) */}
                      {doc.tags && doc.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1.5">
                          {doc.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] font-medium text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded-md border border-slate-800"
                            >
                              #{tag}
                            </span>
                          ))}
                          {doc.tags.length > 3 && (
                            <span className="text-[10px] text-slate-500 self-center">
                              +{doc.tags.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <button
                        onClick={() => onOpenDocument(doc)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-sky-500/10 hover:bg-sky-500 text-sky-400 hover:text-white border border-sky-500/25 hover:border-sky-500 font-semibold text-xs transition-all active:scale-[0.98]"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>{doc.lastOpenedAt ? 'Resume Reading' : 'Open PDF'}</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => onDownload(doc, e)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition"
                          title="Download PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => onDelete(doc, e)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition"
                          title="Delete from Vault"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Carousel Slide Indicators / Dots */}
          {filteredDocs.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-2">
              {filteredDocs.slice(0, 10).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => scrollToCard(idx)}
                  aria-label={`Jump to slide ${idx + 1}`}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    activeIndex === idx
                      ? 'w-6 bg-sky-400 shadow-sm shadow-sky-400/50'
                      : 'w-1.5 bg-slate-800 hover:bg-slate-700'
                  }`}
                />
              ))}
              {filteredDocs.length > 10 && (
                <span className="text-[10px] text-slate-500 font-mono ml-1">
                  +{filteredDocs.length - 10}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
