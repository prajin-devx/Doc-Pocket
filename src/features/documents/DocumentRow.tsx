import React from 'react';
import {
  FileText,
  Star,
  Bookmark,
  Download,
  Trash2,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { CollectionItem, DocumentItem } from '../../types';
import { formatBytes } from '../../lib/storage-service';
import { CategoryIcon } from '../../components/common/CategoryIcon';

interface DocumentRowProps {
  document: DocumentItem;
  collection?: CollectionItem;
  onOpen: (doc: DocumentItem) => void;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  onTogglePinned: (id: string, e: React.MouseEvent) => void;
  onDownload: (doc: DocumentItem, e: React.MouseEvent) => void;
  onDelete: (doc: DocumentItem, e: React.MouseEvent) => void;
}

export const DocumentRow: React.FC<DocumentRowProps> = ({
  document,
  collection,
  onOpen,
  onToggleFavorite,
  onTogglePinned,
  onDownload,
  onDelete,
}) => {
  return (
    <div
      onClick={() => onOpen(document)}
      className="group flex items-center justify-between p-3 rounded-2xl bg-[#0d1424]/90 hover:bg-[#111a30] border border-slate-800/80 hover:border-slate-700/80 transition-all cursor-pointer gap-4 shadow-sm"
    >
      {/* Left: Thumbnail & Info */}
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <div className="w-12 h-14 rounded-xl bg-slate-900 border border-slate-800 shrink-0 overflow-hidden flex items-center justify-center">
          {document.thumbnailDataUrl ? (
            <img
              src={document.thumbnailDataUrl}
              alt={document.displayName}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <FileText className="w-5 h-5 text-sky-400/80" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-xs sm:text-sm font-semibold text-white group-hover:text-sky-300 transition-colors truncate">
              {document.displayName}
            </h3>
            {collection && (
              <span
                className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border"
                style={{
                  backgroundColor: `${collection.color}20`,
                  color: collection.color,
                  borderColor: `${collection.color}40`,
                }}
              >
                <CategoryIcon icon={collection.icon} className="w-2.5 h-2.5" />
                <span>{collection.name}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
            <span className="font-mono truncate max-w-[140px] sm:max-w-[200px]">
              {document.fileName}
            </span>
            <span>•</span>
            <span className="font-mono">{formatBytes(document.fileSize)}</span>
            <span>•</span>
            <span className="font-mono flex items-center gap-0.5">
              <Layers className="w-3 h-3 text-sky-400" />
              {document.pageCount}p
            </span>
          </div>

          {/* Tags on row */}
          {document.tags && document.tags.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {document.tags.slice(0, 4).map(t => (
                <span
                  key={t}
                  className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800/80 text-sky-300/80 border border-slate-700/60"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Actions */}
      <div
        className="flex items-center gap-1 shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={e => onTogglePinned(document.id, e)}
          className={`p-2 rounded-xl transition ${
            document.isPinned
              ? 'bg-sky-500/15 text-sky-400 border border-sky-400/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          title={document.isPinned ? 'Unpin' : 'Pin to Quick Access'}
        >
          <Bookmark className={`w-3.5 h-3.5 ${document.isPinned ? 'fill-sky-400' : ''}`} />
        </button>

        <button
          onClick={e => onToggleFavorite(document.id, e)}
          className={`p-2 rounded-xl transition ${
            document.isFavorite
              ? 'bg-amber-500/15 text-amber-400 border border-amber-400/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          title={document.isFavorite ? 'Remove Favorite' : 'Favorite'}
        >
          <Star className={`w-3.5 h-3.5 ${document.isFavorite ? 'fill-amber-400' : ''}`} />
        </button>

        <button
          onClick={e => onDownload(document, e)}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Download PDF"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={e => onDelete(document, e)}
          className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
          title="Delete Document"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
