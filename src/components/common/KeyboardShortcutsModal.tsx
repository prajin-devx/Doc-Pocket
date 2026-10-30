import React from 'react';
import { X, Command, Keyboard, Search, UploadCloud, Cloud, BookOpen, ZoomIn, RotateCw, Maximize2 } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
  category: 'Global' | 'PDF Viewer' | 'Navigation';
  icon?: React.FC<{ className?: string }>;
}

const SHORTCUTS: ShortcutItem[] = [
  {
    keys: ['Ctrl / ⌘', 'K'],
    description: 'Focus global search input',
    category: 'Global',
    icon: Search,
  },
  {
    keys: ['Ctrl / ⌘', 'I'],
    description: 'Open PDF import dialog',
    category: 'Global',
    icon: UploadCloud,
  },
  {
    keys: ['Ctrl / ⌘', 'B'],
    description: 'Open Google Drive Sync & Backup',
    category: 'Global',
    icon: Cloud,
  },
  {
    keys: ['?'],
    description: 'Show keyboard shortcuts guide',
    category: 'Global',
    icon: Keyboard,
  },
  {
    keys: ['Esc'],
    description: 'Close active modal, viewer, or dropdown',
    category: 'Global',
    icon: X,
  },
  {
    keys: ['←', '→'],
    description: 'Turn to previous or next page',
    category: 'PDF Viewer',
    icon: BookOpen,
  },
  {
    keys: ['+', '-'],
    description: 'Zoom in / Zoom out',
    category: 'PDF Viewer',
    icon: ZoomIn,
  },
  {
    keys: ['R'],
    description: 'Rotate document 90° clockwise',
    category: 'PDF Viewer',
    icon: RotateCw,
  },
  {
    keys: ['F'],
    description: 'Toggle full-screen reading mode',
    category: 'PDF Viewer',
    icon: Maximize2,
  },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const categories = ['Global', 'PDF Viewer'] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-[#0c1322] border border-slate-800 p-6 shadow-2xl space-y-6 text-slate-100 animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
              <Command className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Keyboard Shortcuts</h2>
              <p className="text-xs text-slate-400">Power user shortcuts for instant navigation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Shortcuts list grouped by category */}
        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
          {categories.map((cat) => {
            const list = SHORTCUTS.filter((s) => s.category === cat);
            return (
              <div key={cat} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                  {cat}
                </h3>
                <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 divide-y divide-slate-800/60 overflow-hidden">
                  {list.map((item, idx) => (
                    <div
                      key={idx}
                      className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs hover:bg-slate-800/30 transition"
                    >
                      <div className="flex items-center gap-2.5 text-slate-300">
                        {item.icon && <item.icon className="w-4 h-4 text-sky-400 shrink-0" />}
                        <span>{item.description}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {item.keys.map((k, kidx) => (
                          <kbd
                            key={kidx}
                            className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700/80 text-[11px] font-mono text-sky-300 shadow-sm"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer tip */}
        <div className="pt-2 text-center text-[11px] text-slate-500">
          Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-sky-400">?</kbd> anywhere to bring up this cheatsheet.
        </div>
      </div>
    </div>
  );
};
