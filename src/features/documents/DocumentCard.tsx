import React from 'react';
import {
  FileText,
  Star,
  Bookmark,
  MoreVertical,
  Download,
  Trash2,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { CollectionItem, DocumentItem } from '../../types';
import { formatBytes } from '../../lib/storage-service';
import { CategoryIcon } from '../../components/common/CategoryIcon';

interface DocumentCardProps {
  document: DocumentItem;
  collection?: CollectionItem;
  onOpen: (doc: DocumentItem) => void;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  onTogglePinned: (id: string, e: React.MouseEvent) => void;
  onDownload: (doc: DocumentItem, e: React.MouseEvent) => void;
  onDelete: (doc: DocumentItem, e: React.MouseEvent) => void;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  matchedSnippet?: string;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  document,
  collection,
  onOpen,
  onToggleFavorite,
  onTogglePinned,
  onDownload,
  onDelete,
  isSelected = false,
  onSelect,
  matchedSnippet,
}) => {
  const [showMenu, setShowMenu] = React.useState(false);

  return (
    <div
      onClick={() => onOpen(document)}
      className={`group relative flex flex-col rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden ${
        isSelected
          ? 'bg-sky-500/10 border-sky-400 shadow-lg shadow-sky-500/10 ring-1 ring-sky-400'
          : 'bg-[#0d1424]/90 hover:bg-[#111a30] border-slate-800/90 hover:border-slate-700/90 shadow-md hover:shadow-xl hover:shadow-black/40'
      }`}
    >
      {/* Top Banner / Preview Thumbnail Area */}
      <div className="relative aspect-[16/10] w-full bg-[#080d1a] overflow-hidden flex items-center justify-center border-b border-slate-800/60">
        {document.thumbnailDataUrl ? (
          <img
            src={document.thumbnailDataUrl}
            alt={document.displayName}
            className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-500 group-hover:text-sky-400 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center">
              <FileText className="w-6 h-6 text-sky-400/80" />
            </div>
            <span className="text-[10px] font-mono tracking-wider uppercase text-slate-400">PDF Document</span>
          </div>
        )}

        {/* Gradient overlay on thumbnail bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d1424] via-transparent to-black/30 pointer-events-none" />

        {/* Top Badges / Actions floating over thumbnail */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-auto">
          {/* Collection Pill */}
          {collection ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-md border shadow-sm"
              style={{
                backgroundColor: `${collection.color}25`,
                color: collection.color,
                borderColor: `${collection.color}40`,
              }}
            >
              <CategoryIcon icon={collection.icon} className="w-3 h-3" />
              <span>{collection.name}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800/80 text-slate-300 border border-slate-700 backdrop-blur-md">
              <FileText className="w-3 h-3 text-sky-400" />
              <span>Vault</span>
            </span>
          )}

          {/* Quick Pin & Favorite buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={e => onTogglePinned(document.id, e)}
              className={`p-1.5 rounded-lg backdrop-blur-md transition ${
                document.isPinned
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-400/30'
                  : 'bg-black/40 text-slate-400 hover:text-white hover:bg-black/60'
              }`}
              title={document.isPinned ? 'Unpin' : 'Pin to Quick Access'}
            >
              <Bookmark className={`w-3.5 h-3.5 ${document.isPinned ? 'fill-sky-400' : ''}`} />
            </button>
            <button
              onClick={e => onToggleFavorite(document.id, e)}
              className={`p-1.5 rounded-lg backdrop-blur-md transition ${
                document.isFavorite
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-400/30'
                  : 'bg-black/40 text-slate-400 hover:text-white hover:bg-black/60'
              }`}
              title={document.isFavorite ? 'Remove Favorite' : 'Add to Favorites'}
            >
              <Star className={`w-3.5 h-3.5 ${document.isFavorite ? 'fill-amber-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Page Count & Bookmarks Badge */}
        <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-300 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10">
            <Layers className="w-3 h-3 text-sky-400" />
            <span>{document.pageCount} {document.pageCount === 1 ? 'page' : 'pages'}</span>
          </div>

          {document.pageBookmarks && document.pageBookmarks.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-amber-300 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-md border border-amber-500/30 shadow-sm">
              <Bookmark className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
              <span>{document.pageBookmarks.length} {document.pageBookmarks.length === 1 ? 'note' : 'notes'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Card Content */}
      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          <h3
            className="text-xs font-semibold text-white group-hover:text-sky-300 transition-colors line-clamp-1"
            title={document.displayName}
          >
            {document.displayName}
          </h3>

          <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5 font-mono">
            {document.fileName}
          </p>

          {document.description && (
            <p className="text-[11px] text-slate-400 line-clamp-1 mt-1.5">
              {document.description}
            </p>
          )}

          {/* Deep Content Search Match Snippet */}
          {matchedSnippet && (
            <div className="mt-2 p-2 rounded-xl bg-sky-500/10 border border-sky-500/25 text-[10px] text-sky-200 line-clamp-2">
              <span className="font-semibold text-sky-400">Content Match: </span>
              <span className="italic">"{matchedSnippet}"</span>
            </div>
          )}

          {/* Tags */}
          {document.tags && document.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2.5">
              {document.tags.slice(0, 3).map(tag => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800/80 text-sky-300/90 border border-slate-700/60"
                >
                  #{tag}
                </span>
              ))}
              {document.tags.length > 3 && (
                <span className="text-[10px] text-slate-500 self-center">
                  +{document.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer info & action menu */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span className="font-mono text-slate-400 font-medium">
            {formatBytes(document.fileSize)}
          </span>

          <div className="flex items-center gap-1 relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={e => onDownload(document, e)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Download PDF"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={e => onDelete(document, e)}
              className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
              title="Delete Document"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
