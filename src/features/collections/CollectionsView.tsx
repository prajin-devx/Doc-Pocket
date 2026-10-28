import React, { useState } from 'react';
import {
  Folder,
  Plus,
  Edit2,
  Trash2,
  ChevronRight,
  FileText,
  UploadCloud,
  Layers,
  Sparkles,
} from 'lucide-react';
import { CollectionItem, DocumentItem } from '../../types';
import { CategoryIcon } from '../../components/common/CategoryIcon';
import { formatBytes } from '../../lib/storage-service';
import { DocumentCard } from '../documents/DocumentCard';

interface CollectionsViewProps {
  collections: CollectionItem[];
  documents: DocumentItem[];
  collectionCounts: Record<string, number>;
  onOpenDocument: (doc: DocumentItem) => void;
  onOpenImport: (category?: string) => void;
  onManageCollections: () => void;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  onTogglePinned: (id: string, e: React.MouseEvent) => void;
  onDownload: (doc: DocumentItem, e: React.MouseEvent) => void;
  onDelete: (doc: DocumentItem, e: React.MouseEvent) => void;
  onSelectCategoryInLibrary: (catId: string) => void;
}

export const CollectionsView: React.FC<CollectionsViewProps> = ({
  collections,
  documents,
  collectionCounts,
  onOpenDocument,
  onOpenImport,
  onManageCollections,
  onToggleFavorite,
  onTogglePinned,
  onDownload,
  onDelete,
  onSelectCategoryInLibrary,
}) => {
  const [activeCollectionId, setActiveCollectionId] = useState<string>(collections[0]?.id || 'inbox');

  const activeCollection = collections.find(c => c.id === activeCollectionId) || collections[0];
  const activeDocs = documents.filter(d => d.category === activeCollection?.id);
  const totalBytesInActive = activeDocs.reduce((acc, d) => acc + (d.fileSize || 0), 0);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <span>Collections</span>
            <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-full bg-slate-800 text-sky-400 border border-slate-700">
              {collections.length} categories
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Organize documents into dedicated vaults for college, certifications, work, and personal files.
          </p>
        </div>

        <button
          onClick={onManageCollections}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs shadow-md shadow-sky-500/20 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New / Edit Collection</span>
        </button>
      </div>

      {/* Collections Carousel / Horizontal Selection */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {collections.map(col => {
          const count = collectionCounts[col.id] || 0;
          const isSelected = activeCollection?.id === col.id;

          return (
            <div
              key={col.id}
              onClick={() => setActiveCollectionId(col.id)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                isSelected
                  ? 'bg-sky-500/15 border-sky-400 shadow-lg shadow-sky-500/10 ring-1 ring-sky-400'
                  : 'bg-[#0c1220]/90 hover:bg-[#11192d] border-slate-800/90'
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center border"
                  style={{
                    backgroundColor: `${col.color}20`,
                    borderColor: `${col.color}40`,
                  }}
                >
                  <CategoryIcon icon={col.icon} color={col.color} className="w-4 h-4" />
                </span>
                <span className="font-mono text-xs font-bold text-slate-300">{count}</span>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-white truncate">{col.name}</h3>
                <p className="text-[10px] text-slate-400 truncate mt-0.5">
                  {col.isSystem ? 'System Category' : 'Custom'}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Collection Detail Section */}
      {activeCollection && (
        <div className="p-6 rounded-3xl bg-[#0c1322] border border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
            <div className="flex items-center gap-3.5">
              <span
                className="w-12 h-12 rounded-2xl flex items-center justify-center border shadow-md"
                style={{
                  backgroundColor: `${activeCollection.color}20`,
                  borderColor: `${activeCollection.color}40`,
                }}
              >
                <CategoryIcon icon={activeCollection.icon} color={activeCollection.color} className="w-6 h-6" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-white">{activeCollection.name}</h2>
                  {activeCollection.isSystem && (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {activeCollection.description || 'Collection documents'} • {activeDocs.length} files • {formatBytes(totalBytesInActive)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenImport(activeCollection.id)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Import to {activeCollection.name}</span>
              </button>
              <button
                onClick={() => onSelectCategoryInLibrary(activeCollection.id)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition"
              >
                Open in Library
              </button>
            </div>
          </div>

          {/* Documents inside this collection */}
          {activeDocs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {activeDocs.map(doc => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  collection={activeCollection}
                  onOpen={onOpenDocument}
                  onToggleFavorite={onToggleFavorite}
                  onTogglePinned={onTogglePinned}
                  onDownload={onDownload}
                  onDelete={onDelete}
                />
              ))}
            </div>
          ) : (
            <div className="p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-white">No documents in {activeCollection.name}</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Upload course materials, certificates, or personal records into this collection.
              </p>
              <div className="pt-2">
                <button
                  onClick={() => onOpenImport(activeCollection.id)}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs"
                >
                  Import PDF Now
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
