import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Search,
  Maximize2,
  Minimize2,
  Bookmark,
  Star,
  Copy,
  Check,
  Type,
  Sun,
  Moon,
  Clock,
  Printer,
  Sparkles,
  BookOpen,
  AlignLeft,
  List,
  Sliders,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { CollectionItem, DocumentItem } from '../../types';
import { documentService } from '../../lib/document-service';
import { collectionService } from '../../lib/collection-service';
import { formatBytes } from '../../lib/storage-service';
import { inspectDocx } from '../../lib/office-service';

interface WordViewerModalProps {
  documentId: string;
  onClose: () => void;
  onDocumentUpdated?: () => void;
}

interface DocHeading {
  id: string;
  text: string;
  level: number;
}

export const WordViewerModal: React.FC<WordViewerModalProps> = ({
  documentId,
  onClose,
  onDocumentUpdated,
}) => {
  const [docItem, setDocItem] = useState<DocumentItem | null>(null);
  const [binaryData, setBinaryData] = useState<ArrayBuffer | null>(null);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [docxHtml, setDocxHtml] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Layout View: 'pages' (paginated A4 sheets) vs 'web' (continuous responsive reader)
  const [layoutMode, setLayoutMode] = useState<'pages' | 'web'>('pages');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showOutline, setShowOutline] = useState(true);
  const [showTypographyPanel, setShowTypographyPanel] = useState(false);

  // Typography & Themes
  const [readerTheme, setReaderTheme] = useState<'slate' | 'oled' | 'sepia' | 'day'>('slate');
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>('sans');
  const [lineSpacing, setLineSpacing] = useState<'normal' | 'relaxed' | 'spacious'>('relaxed');
  const [contentWidth, setContentWidth] = useState<'compact' | 'standard' | 'wide'>('standard');

  // Reading Metrics & Progress
  const [scrollProgress, setScrollProgress] = useState(0);
  const [copiedText, setCopiedText] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchCount, setSearchMatchCount] = useState(0);

  const contentScrollRef = useRef<HTMLDivElement>(null);

  // Load document and binary from IndexedDB
  useEffect(() => {
    let active = true;

    async function loadDocument() {
      setIsLoading(true);
      setError(null);
      try {
        const item = await documentService.getDocument(documentId);
        if (!item) {
          throw new Error('Word document could not be found in vault.');
        }
        if (!active) return;
        setDocItem(item);

        // Record opened timestamp
        documentService.recordOpened(item.id);

        const binary = await documentService.getDocumentBinary(documentId);
        if (!binary) {
          throw new Error('Document binary data missing from local storage.');
        }
        if (!active) return;
        setBinaryData(binary);

        // Extract HTML if not present
        if (item.docxHtml) {
          setDocxHtml(item.docxHtml);
          setRawText(item.extractedTextCache || '');
        } else {
          const inspected = await inspectDocx(binary, item.fileName);
          if (active && inspected.docxHtml) {
            setDocxHtml(inspected.docxHtml);
            setRawText(inspected.extractedText);
            // Cache back to document metadata
            documentService.updateDocumentMetadata(item.id, {
              docxHtml: inspected.docxHtml,
              wordCount: inspected.wordCount,
              pageCount: inspected.pageCount,
              extractedTextCache: inspected.extractedText,
            }).catch(console.warn);
          }
        }

        const cols = await collectionService.getAllCollections();
        if (active) setCollections(cols);
      } catch (err) {
        if (active) {
          console.error('Error loading Word document:', err);
          setError(err instanceof Error ? err.message : 'Failed to load document');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    loadDocument();

    return () => {
      active = false;
    };
  }, [documentId]);

  // Track scroll reading progress (0 - 100%)
  const handleScroll = () => {
    if (!contentScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = contentScrollRef.current;
    if (scrollHeight <= clientHeight) {
      setScrollProgress(100);
      return;
    }
    const percent = Math.min(100, Math.max(0, Math.round((scrollTop / (scrollHeight - clientHeight)) * 100)));
    setScrollProgress(percent);
  };

  // Extract Document Table of Contents / Outline from Headings
  const headings: DocHeading[] = useMemo(() => {
    if (!docxHtml) return [];
    if (typeof document === 'undefined') return [];

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = docxHtml;
    const headingElements = tempDiv.querySelectorAll('h1, h2, h3, h4');
    const list: DocHeading[] = [];

    headingElements.forEach((el, index) => {
      const text = el.textContent?.trim() || '';
      if (text) {
        const level = parseInt(el.tagName.replace('H', ''), 10) || 1;
        list.push({
          id: `heading_${index}`,
          text,
          level,
        });
      }
    });

    return list;
  }, [docxHtml]);

  // HTML with injected heading anchors and search query highlights
  const processedHtml = useMemo(() => {
    if (!docxHtml) return '';
    let html = docxHtml;

    // Inject anchor IDs for Table of Contents
    let headingCounter = 0;
    html = html.replace(/<(h[1-4])([^>]*)>(.*?)<\/\1>/gi, (match, tag, attrs, content) => {
      const id = `heading_${headingCounter++}`;
      return `<${tag} id="${id}" ${attrs} class="scroll-mt-6 font-bold tracking-tight text-white mb-3 mt-6">${content}</${tag}>`;
    });

    // Highlight search matches
    if (searchQuery.trim().length >= 2) {
      try {
        const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escaped})`, 'gi');
        const matches = html.match(regex);
        setSearchMatchCount(matches ? matches.length : 0);
        html = html.replace(regex, '<mark class="bg-amber-400 text-slate-950 px-1 py-0.5 rounded font-bold shadow-sm">$1</mark>');
      } catch {
        setSearchMatchCount(0);
      }
    } else {
      setSearchMatchCount(0);
    }

    return html;
  }, [docxHtml, searchQuery]);

  // Smooth scroll to outline heading
  const scrollToHeading = (id: string) => {
    if (!contentScrollRef.current) return;
    const target = contentScrollRef.current.querySelector(`#${id}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        setIsFullscreen(prev => !prev);
      } else if (e.key === 'p' || e.key === 'P') {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          window.print();
        }
      } else if (e.key === 'o' || e.key === 'O') {
        setShowOutline(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, onClose]);

  const handleToggleFavorite = async () => {
    if (!docItem) return;
    const next = !docItem.isFavorite;
    setDocItem(prev => (prev ? { ...prev, isFavorite: next } : null));
    await documentService.toggleFavorite(docItem.id);
    onDocumentUpdated?.();
  };

  const handleTogglePinned = async () => {
    if (!docItem) return;
    const next = !docItem.isPinned;
    setDocItem(prev => (prev ? { ...prev, isPinned: next } : null));
    await documentService.togglePinned(docItem.id);
    onDocumentUpdated?.();
  };

  const handleDownload = () => {
    if (!docItem) return;
    documentService.downloadDocument(docItem);
  };

  const handleCopyText = async () => {
    const textToCopy = rawText || docItem?.extractedTextCache || '';
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      alert('Could not copy to clipboard.');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Theme style classes
  const getThemeClasses = () => {
    switch (readerTheme) {
      case 'oled':
        return 'bg-[#000000] text-slate-100 border-slate-900 shadow-none';
      case 'sepia':
        return 'bg-[#fbf0d9] text-[#3d2e1e] border-[#eeddc0] shadow-xl';
      case 'day':
        return 'bg-[#ffffff] text-[#1e293b] border-slate-200 shadow-xl';
      case 'slate':
      default:
        return 'bg-[#0d1527] text-slate-100 border-slate-800 shadow-2xl';
    }
  };

  const getContentWidthClass = () => {
    switch (contentWidth) {
      case 'compact':
        return 'max-w-2xl';
      case 'wide':
        return 'max-w-4xl';
      case 'standard':
      default:
        return 'max-w-3xl';
    }
  };

  if (!documentId) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-[#050811] text-slate-100 select-none ${
        isFullscreen ? 'p-0' : 'p-2 sm:p-4'
      }`}
    >
      <div className="flex-1 flex flex-col rounded-2xl sm:rounded-3xl bg-[#090f1d] border border-slate-800 shadow-2xl overflow-hidden relative">
        {/* Top Word Document Toolbar */}
        <header className="h-14 px-4 bg-[#0d1527] border-b border-slate-800 flex items-center justify-between gap-3 shrink-0 z-20">
          {/* Left: Branding & Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
              title="Close Document (Esc)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0 shadow-sm">
                <FileText className="w-4 h-4" />
              </span>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
                    {docItem?.displayName || 'Word Document'}
                  </h1>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0 font-mono">
                    {docItem?.format?.toUpperCase() || 'DOCX'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate font-mono">
                  {docItem?.wordCount ? `${docItem.wordCount.toLocaleString()} words` : `${docItem?.pageCount || 1} pages`} • {docItem ? formatBytes(docItem.fileSize) : 'Loading...'}
                </p>
              </div>
            </div>
          </div>

          {/* Center: In-Document Search */}
          <div className="hidden md:flex items-center gap-2 max-w-xs w-full">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search document text... (⌘F)"
                className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {searchQuery && (
              <span className="text-[11px] font-mono text-blue-400 shrink-0 font-semibold">
                {searchMatchCount} found
              </span>
            )}
          </div>

          {/* Right Toolbar Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Outline / Table of Contents Toggle */}
            <button
              onClick={() => setShowOutline(prev => !prev)}
              className={`p-2 rounded-xl transition ${
                showOutline
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Toggle Table of Contents Outline (O)"
            >
              <List className="w-4 h-4" />
            </button>

            {/* Layout Mode Switcher: Paginated A4 Pages vs Web Scroll */}
            <div className="hidden sm:flex items-center bg-slate-900 border border-slate-700/80 rounded-xl p-0.5">
              <button
                onClick={() => setLayoutMode('pages')}
                className={`p-1.5 rounded-lg text-xs transition ${
                  layoutMode === 'pages'
                    ? 'bg-blue-500/20 text-blue-400 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="A4 Print Layout View"
              >
                <BookOpen className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setLayoutMode('web')}
                className={`p-1.5 rounded-lg text-xs transition ${
                  layoutMode === 'web'
                    ? 'bg-blue-500/20 text-blue-400 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Continuous Web Reader"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Typography Controls Popover Trigger */}
            <button
              onClick={() => setShowTypographyPanel(prev => !prev)}
              className={`p-2 rounded-xl transition ${
                showTypographyPanel
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Typography & Reading Settings"
            >
              <Sliders className="w-4 h-4" />
            </button>

            {/* Copy Full Clean Text */}
            <button
              onClick={handleCopyText}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Copy entire document text"
            >
              {copiedText ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            {/* Print Document */}
            <button
              onClick={handlePrint}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Print document (⌘P)"
            >
              <Printer className="w-4 h-4" />
            </button>

            {/* Favorites & Pins */}
            {docItem && (
              <>
                <button
                  onClick={handleTogglePinned}
                  className={`p-2 rounded-xl transition ${
                    docItem.isPinned
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-400/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  title={docItem.isPinned ? 'Unpin from Quick Access' : 'Pin to Quick Access'}
                >
                  <Bookmark className={`w-4 h-4 ${docItem.isPinned ? 'fill-sky-400' : ''}`} />
                </button>
                <button
                  onClick={handleToggleFavorite}
                  className={`p-2 rounded-xl transition ${
                    docItem.isFavorite
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-400/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  title={docItem.isFavorite ? 'Remove Favorite' : 'Mark as Favorite'}
                >
                  <Star className={`w-4 h-4 ${docItem.isFavorite ? 'fill-amber-400' : ''}`} />
                </button>
              </>
            )}

            {/* Download */}
            <button
              onClick={handleDownload}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Download original (.docx)"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Fullscreen */}
            <button
              onClick={() => setIsFullscreen(prev => !prev)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition ml-1"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Live Reading Scroll Progress Bar */}
        <div className="w-full h-1 bg-slate-800/80 shrink-0">
          <div
            className="h-full bg-blue-500 transition-all duration-150 ease-out"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>

        {/* Reading Metrics Sub-Bar */}
        <div className="px-6 py-2 bg-[#090f1d] border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-mono text-slate-300 font-semibold">
              {docItem?.wordCount ? `${docItem.wordCount.toLocaleString()} words` : `${docItem?.pageCount || 1} pages`}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 text-blue-400 font-medium">
              <Clock className="w-3.5 h-3.5" />
              <span>~{Math.max(1, Math.ceil((docItem?.wordCount || 350) / 200))} min read</span>
            </span>
            <span>•</span>
            <span className="font-mono text-[11px] text-slate-400">
              {scrollProgress}% read
            </span>
          </div>

          {/* Quick theme selector */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setReaderTheme('slate')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                readerTheme === 'slate' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Dark
            </button>
            <button
              onClick={() => setReaderTheme('sepia')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                readerTheme === 'sepia' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sepia
            </button>
            <button
              onClick={() => setReaderTheme('day')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                readerTheme === 'day' ? 'bg-white text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Paper
            </button>
          </div>
        </div>

        {/* Floating Typography Settings Menu */}
        {showTypographyPanel && (
          <div className="absolute top-24 right-4 z-30 w-80 rounded-2xl bg-[#0c1426] border border-slate-700 shadow-2xl p-4 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Reader Typography</h4>
              <button onClick={() => setShowTypographyPanel(false)} className="text-slate-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Font Family */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-400 font-medium">Font Family</label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => setFontFamily('sans')}
                  className={`py-1.5 px-2 rounded-xl text-xs font-sans transition border ${
                    fontFamily === 'sans'
                      ? 'bg-blue-600 text-white border-blue-500 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Sans
                </button>
                <button
                  onClick={() => setFontFamily('serif')}
                  className={`py-1.5 px-2 rounded-xl text-xs font-serif transition border ${
                    fontFamily === 'serif'
                      ? 'bg-blue-600 text-white border-blue-500 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Serif
                </button>
                <button
                  onClick={() => setFontFamily('mono')}
                  className={`py-1.5 px-2 rounded-xl text-xs font-mono transition border ${
                    fontFamily === 'mono'
                      ? 'bg-blue-600 text-white border-blue-500 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  Mono
                </button>
              </div>
            </div>

            {/* Font Size */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                <span>Font Size</span>
                <span className="font-mono text-white font-bold">{fontSize}px</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFontSize(s => Math.max(12, s - 1))}
                  className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
                >
                  A-
                </button>
                <input
                  type="range"
                  min={12}
                  max={26}
                  value={fontSize}
                  onChange={e => setFontSize(parseInt(e.target.value, 10))}
                  className="flex-1 accent-blue-500 cursor-pointer"
                />
                <button
                  onClick={() => setFontSize(s => Math.min(26, s + 1))}
                  className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
                >
                  A+
                </button>
              </div>
            </div>

            {/* Reading Width */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-400 font-medium">Reading Column Width</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['compact', 'standard', 'wide'] as const).map(w => (
                  <button
                    key={w}
                    onClick={() => setContentWidth(w)}
                    className={`py-1 px-2 rounded-xl text-xs capitalize transition border ${
                      contentWidth === w
                        ? 'bg-blue-600 text-white border-blue-500 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>

            {/* Line Spacing */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-slate-400 font-medium">Line Spacing</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['normal', 'relaxed', 'spacious'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setLineSpacing(s)}
                    className={`py-1 px-2 rounded-xl text-xs capitalize transition border ${
                      lineSpacing === s
                        ? 'bg-blue-600 text-white border-blue-500 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Loading & Error States */}
        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center animate-spin">
              <FileText className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-white">Rendering Word document...</p>
            <p className="text-xs text-slate-400">Formatting OpenXML paragraphs, typography, and headings</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <X className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">Could not render Word document</h3>
            <p className="text-xs text-slate-400 max-w-md">{error}</p>
            <button
              onClick={handleDownload}
              className="mt-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 transition"
            >
              Download original {docItem?.fileName || 'document'}
            </button>
          </div>
        )}

        {/* Main Document Reading Body */}
        {!isLoading && !error && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Table of Contents / Document Outline Sidebar */}
            {showOutline && (
              <aside className="w-64 bg-[#080d19] border-r border-slate-800 flex flex-col shrink-0 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">
                    Table of Contents
                  </span>
                  <span className="font-mono text-[10px] text-blue-400 font-bold bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                    {headings.length} sections
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                  {headings.length > 0 ? (
                    headings.map(h => (
                      <button
                        key={h.id}
                        onClick={() => scrollToHeading(h.id)}
                        className={`w-full text-left py-2 px-3 rounded-xl transition text-xs font-medium truncate group flex items-center gap-2 ${
                          h.level === 1
                            ? 'text-white hover:bg-blue-500/15 hover:text-blue-300 font-bold'
                            : h.level === 2
                            ? 'text-slate-300 hover:bg-slate-800 hover:text-white pl-5'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 pl-7 text-[11px]'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 opacity-60 group-hover:opacity-100" />
                        <span className="truncate">{h.text}</span>
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-500 space-y-1">
                      <p>No headings detected.</p>
                      <p className="text-[10px]">Document displays as full continuous reading flow.</p>
                    </div>
                  )}
                </div>
              </aside>
            )}

            {/* Main Document Scroll Reading Pane */}
            <main
              ref={contentScrollRef}
              onScroll={handleScroll}
              className={`flex-1 overflow-y-auto p-4 sm:p-10 flex flex-col items-center ${
                readerTheme === 'day'
                  ? 'bg-[#f1f5f9]'
                  : readerTheme === 'sepia'
                  ? 'bg-[#f2e7ce]'
                  : 'bg-[#050811]'
              }`}
            >
              {/* Document Paper Container */}
              <div
                className={`w-full ${getContentWidthClass()} ${getThemeClasses()} ${
                  layoutMode === 'pages'
                    ? 'rounded-3xl p-8 sm:p-16 border my-4 shadow-2xl'
                    : 'rounded-2xl p-6 sm:p-12 border-0 shadow-none'
                } transition-all duration-300`}
                style={{
                  fontSize: `${fontSize}px`,
                  fontFamily:
                    fontFamily === 'serif'
                      ? 'Georgia, Cambria, "Times New Roman", serif'
                      : fontFamily === 'mono'
                      ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
                      : 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  lineHeight: lineSpacing === 'spacious' ? '2.1' : lineSpacing === 'relaxed' ? '1.85' : '1.6',
                }}
              >
                {/* Paper Header */}
                <div className="pb-8 mb-8 border-b border-current opacity-25">
                  <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
                    {docItem?.displayName}
                  </h1>
                  <p className="text-xs opacity-75 mt-2 font-mono">{docItem?.fileName}</p>
                </div>

                {/* Document Body Rendered from Mammoth */}
                {processedHtml ? (
                  <div
                    className="prose max-w-none space-y-4"
                    dangerouslySetInnerHTML={{ __html: processedHtml }}
                  />
                ) : (
                  <div className="space-y-4 whitespace-pre-wrap leading-relaxed">
                    {rawText || docItem?.extractedTextCache || 'No document content available.'}
                  </div>
                )}

                {/* Paper Footer with page numbers simulation */}
                <div className="pt-10 mt-12 border-t border-current opacity-25 flex items-center justify-between text-xs font-mono">
                  <span>DocPocket Document Reader</span>
                  <span>End of Document</span>
                </div>
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
};
