import React, { useState, useEffect } from 'react';
import {
  FolderPlus,
  X,
  Edit2,
  Trash2,
  Folder,
  Check,
  AlertCircle,
  GraduationCap,
  BookOpen,
  Award,
  Briefcase,
  User,
  Inbox,
  Bookmark,
  Sparkles,
  Archive,
  Layers,
} from 'lucide-react';
import { CollectionItem } from '../../types';
import { collectionService } from '../../lib/collection-service';
import { CategoryIcon } from '../../components/common/CategoryIcon';

interface ManageCollectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

const AVAILABLE_ICONS = [
  'Folder',
  'GraduationCap',
  'BookOpen',
  'Award',
  'Briefcase',
  'User',
  'Inbox',
  'Bookmark',
  'Sparkles',
  'Archive',
  'Layers',
];

const AVAILABLE_COLORS = [
  '#38bdf8', // sky/ice blue
  '#818cf8', // indigo
  '#a855f7', // purple
  '#ec4899', // pink
  '#f43f5e', // rose
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#64748b', // slate
];

export const ManageCollectionsModal: React.FC<ManageCollectionsModalProps> = ({
  isOpen,
  onClose,
  onUpdated,
}) => {
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [color, setColor] = useState('#38bdf8');
  const [icon, setIcon] = useState('Folder');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadCollections();
      resetForm();
    }
  }, [isOpen]);

  const loadCollections = async () => {
    const list = await collectionService.getAllCollections();
    setCollections(list);
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setColor('#38bdf8');
    setIcon('Folder');
    setDescription('');
    setError(null);
  };

  const startEdit = (col: CollectionItem) => {
    setEditingId(col.id);
    setName(col.name);
    setColor(col.color);
    setIcon(col.icon);
    setDescription(col.description);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Collection name cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        await collectionService.updateCollection(editingId, {
          name: name.trim(),
          color,
          icon,
          description: description.trim(),
        });
      } else {
        await collectionService.createCollection({
          name: name.trim(),
          color,
          icon,
          description: description.trim(),
        });
      }
      await loadCollections();
      resetForm();
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save collection');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (col: CollectionItem) => {
    if (col.isSystem) return;
    const confirmDelete = window.confirm(
      `Delete collection "${col.name}"? Documents in this collection will safely be moved to "Inbox".`
    );
    if (!confirmDelete) return;

    try {
      await collectionService.deleteCollection(col.id);
      await loadCollections();
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not delete collection');
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
              <FolderPlus className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">Manage Collections</h2>
              <p className="text-xs text-slate-400">Organize your personal categories</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Create or Edit Form */}
          <form onSubmit={handleSubmit} className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-sky-400">
                {editingId ? 'Edit Collection' : 'Create Custom Collection'}
              </h3>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Collection Name</label>
                <input
                  type="text"
                  placeholder="e.g. Research Papers"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="Short note..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Icon & Color selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Pick Icon</label>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_ICONS.map(ic => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setIcon(ic)}
                      className={`p-1.5 rounded-lg border transition ${
                        icon === ic
                          ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <CategoryIcon icon={ic} className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Pick Accent Color</label>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded-full border transition flex items-center justify-center ${
                        color === c ? 'border-white scale-110 shadow' : 'border-transparent opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {color === c && <Check className="w-3 h-3 text-slate-950" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition shadow-md shadow-sky-500/20 disabled:opacity-50"
              >
                {editingId ? 'Save Changes' : 'Create Collection'}
              </button>
            </div>
          </form>

          {/* Existing Collections List */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Active Collections ({collections.length})
            </h3>
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {collections.map(col => (
                <div
                  key={col.id}
                  className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border"
                      style={{
                        backgroundColor: `${col.color}15`,
                        borderColor: `${col.color}40`,
                      }}
                    >
                      <CategoryIcon icon={col.icon} color={col.color} className="w-4 h-4" />
                    </span>
                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white truncate">{col.name}</span>
                        {col.isSystem && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                            System
                          </span>
                        )}
                      </div>
                      {col.description && (
                        <p className="text-[11px] text-slate-400 truncate">{col.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEdit(col)}
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {!col.isSystem && (
                      <button
                        onClick={() => handleDelete(col)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
