import React from 'react';
import {
  SlidersHorizontal,
  X,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Check,
  Calendar,
  Bookmark,
  Layers,
  Clock,
  Sparkles,
  LayoutDashboard,
  RotateCcw,
} from 'lucide-react';
import { DashboardSectionId } from '../../types';

interface DashboardLayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  sectionOrder: DashboardSectionId[];
  hiddenSections: DashboardSectionId[];
  onSaveLayout: (newOrder: DashboardSectionId[], newHidden: DashboardSectionId[]) => void;
}

const SECTION_METADATA: Record<
  DashboardSectionId,
  { label: string; description: string; icon: React.FC<{ className?: string }> }
> = {
  timetable: {
    label: 'Timetable & Class Schedules',
    description: 'Weekly routines, class schedules, exam dates, and lab sessions',
    icon: Calendar,
  },
  quick_access: {
    label: 'Quick Access (Pinned)',
    description: 'Favorite and high-priority pinned PDFs',
    icon: Bookmark,
  },
  hero: {
    label: 'Vault Overview & Storage Stats',
    description: 'Storage stats, welcome banner, and quick actions',
    icon: LayoutDashboard,
  },
  collections: {
    label: 'Collections & Categories',
    description: 'Folder cards for College, Subjects, Timetable, etc.',
    icon: Layers,
  },
  recent_opened: {
    label: 'Recent Documents Carousel',
    description: 'Visual carousel with previews of recently read and newly added PDFs',
    icon: Clock,
  },
  recent_imports: {
    label: 'Recent Imports',
    description: 'Latest PDF uploads added to your vault',
    icon: Sparkles,
  },
};

export const DashboardLayoutModal: React.FC<DashboardLayoutModalProps> = ({
  isOpen,
  onClose,
  sectionOrder,
  hiddenSections,
  onSaveLayout,
}) => {
  const [order, setOrder] = React.useState<DashboardSectionId[]>(sectionOrder);
  const [hidden, setHidden] = React.useState<DashboardSectionId[]>(hiddenSections);

  React.useEffect(() => {
    if (isOpen) {
      setOrder(sectionOrder);
      setHidden(hiddenSections);
    }
  }, [isOpen, sectionOrder, hiddenSections]);

  if (!isOpen) return null;

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...order];
    const temp = next[index];
    next[index] = next[index - 1];
    next[index - 1] = temp;
    setOrder(next);
  };

  const moveDown = (index: number) => {
    if (index === order.length - 1) return;
    const next = [...order];
    const temp = next[index];
    next[index] = next[index + 1];
    next[index + 1] = temp;
    setOrder(next);
  };

  const setFirst = (id: DashboardSectionId) => {
    const filtered = order.filter(item => item !== id);
    const newOrder = [id, ...filtered];
    setOrder(newOrder);
    // Unhide if it was hidden
    setHidden(hidden.filter(item => item !== id));
  };

  const toggleHide = (id: DashboardSectionId) => {
    if (hidden.includes(id)) {
      setHidden(hidden.filter(item => item !== id));
    } else {
      setHidden([...hidden, id]);
    }
  };

  const handleResetDefault = () => {
    const defaultOrder: DashboardSectionId[] = [
      'timetable',
      'quick_access',
      'hero',
      'collections',
      'recent_opened',
      'recent_imports',
    ];
    setOrder(defaultOrder);
    setHidden([]);
  };

  const handleApply = () => {
    onSaveLayout(order, hidden);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl bg-[#0d1424] border border-slate-800 shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
              <SlidersHorizontal className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">Customize Dashboard</h2>
              <p className="text-xs text-slate-400">Decide what comes first in your personal dashboard</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Quick "Set What Comes First" selector */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              What should come first?
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {order.map(secId => {
                const meta = SECTION_METADATA[secId];
                const isFirst = order[0] === secId;
                const IconComponent = meta.icon;
                return (
                  <button
                    key={secId}
                    type="button"
                    onClick={() => setFirst(secId)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs transition ${
                      isFirst
                        ? 'bg-sky-500/20 border-sky-400 text-sky-300 shadow-sm'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <IconComponent className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-medium truncate">{meta.label.split(' ')[0]}</span>
                    {isFirst && <Check className="w-3.5 h-3.5 text-sky-400 ml-auto shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reorder and Visibility list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Section Ordering & Visibility
              </h3>
              <button
                type="button"
                onClick={handleResetDefault}
                className="text-[11px] text-slate-400 hover:text-sky-300 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Default</span>
              </button>
            </div>

            <div className="space-y-2">
              {order.map((secId, idx) => {
                const meta = SECTION_METADATA[secId];
                const isHidden = hidden.includes(secId);
                const isTop = idx === 0;
                const IconComponent = meta.icon;

                return (
                  <div
                    key={secId}
                    className={`flex items-center justify-between p-3 rounded-xl border transition ${
                      isTop
                        ? 'bg-sky-950/30 border-sky-500/40'
                        : isHidden
                        ? 'bg-slate-950/40 border-slate-800/50 opacity-60'
                        : 'bg-slate-900/70 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 text-center font-mono text-xs text-slate-500 font-bold">
                        #{idx + 1}
                      </span>
                      <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          isTop ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        <IconComponent className="w-4 h-4" />
                      </span>
                      <div className="truncate">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white truncate">
                            {meta.label}
                          </span>
                          {isTop && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/30 font-semibold">
                              Top Section
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">{meta.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={() => toggleHide(secId)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                        title={isHidden ? 'Show Section' : 'Hide Section'}
                      >
                        {isHidden ? <EyeOff className="w-4 h-4 text-rose-400" /> : <Eye className="w-4 h-4" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => moveUp(idx)}
                        disabled={idx === 0}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20"
                        title="Move Up"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => moveDown(idx)}
                        disabled={idx === order.length - 1}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-20"
                        title="Move Down"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer buttons */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 transition shadow-lg shadow-sky-500/20"
            >
              Apply Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
