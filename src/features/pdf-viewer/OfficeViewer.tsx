import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Presentation,
  FileText,
  Search,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  Bookmark,
  Star,
  Tag,
  Folder,
  Layers,
  Copy,
  Check,
  Type,
  Sun,
  Moon,
  BookmarkCheck,
  Clock,
  Printer,
  Sparkles,
} from 'lucide-react';
import { CollectionItem, DocumentItem, SlideItem } from '../../types';
import { documentService } from '../../lib/document-service';
import { collectionService } from '../../lib/collection-service';
import { formatBytes } from '../../lib/storage-service';
import { inspectDocx, inspectPptx } from '../../lib/office-service';

interface OfficeViewerProps {
  document: DocumentItem;
  binary: ArrayBuffer;
  onClose: () => void;
  onDocumentUpdated?: () => void;
}

export const OfficeViewer: React.FC<OfficeViewerProps> = ({
  document: initialDoc,
  binary,
  onClose,
  onDocumentUpdated,
}) => {
  const [docItem, setDocItem] = useState<DocumentItem>(initialDoc);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSlideNotes, setShowSlideNotes] = useState(false);
  const [isPlayingSlideshow, setIsPlayingSlideshow] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(4000);
  const [copiedText, setCopiedText] = useState(false);

  // Word Reader Controls
  const [readerTheme, setReaderTheme] = useState<'dark' | 'light' | 'sepia'>('dark');
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>('sans');

  // Loaded slides and HTML content
  const [slides, setSlides] = useState<SlideItem[]>(initialDoc.slides || []);
  const [docxHtml, setDocxHtml] = useState<string>(initialDoc.docxHtml || '');
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const isPpt = docItem.format === 'pptx' || docItem.format === 'ppt';
  const isWord = docItem.format === 'docx' || docItem.format === 'doc';

  // Load collections
  useEffect(() => {
    collectionService.getAllCollections().then(setCollections);
  }, []);

  // Parse slides or HTML if not already cached in doc metadata
  useEffect(() => {
    let isCancelled = false;

    async function loadOfficeContent() {
      if (isPpt && (!slides || slides.length === 0)) {
        setIsLoadingContent(true);
        try {
          const meta = await inspectPptx(binary, docItem.fileName);
          if (!isCancelled && meta.slides) {
            setSlides(meta.slides);
          }
        } catch (err) {
          console.warn('Could not inspect slides dynamically:', err);
        } finally {
          if (!isCancelled) setIsLoadingContent(false);
        }
      } else if (isWord && !docxHtml) {
        setIsLoadingContent(true);
        try {
          const meta = await inspectDocx(binary, docItem.fileName);
          if (!isCancelled && meta.docxHtml) {
            setDocxHtml(meta.docxHtml);
          }
        } catch (err) {
          console.warn('Could not inspect docx dynamically:', err);
        } finally {
          if (!isCancelled) setIsLoadingContent(false);
        }
      }
    }

    loadOfficeContent();

    return () => {
      isCancelled = true;
    };
  }, [isPpt, isWord, binary, docItem.fileName, slides, docxHtml]);

  // Slideshow timer
  useEffect(() => {
    if (!isPlayingSlideshow || !slides || slides.length <= 1) return;

    const timer = setInterval(() => {
      setActiveSlideIndex(prev => (prev + 1) % slides.length);
    }, slideshowInterval);

    return () => clearInterval(timer);
  }, [isPlayingSlideshow, slides, slideshowInterval]);

  // Keyboard navigation
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
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        if (isPpt && slides.length > 0) {
          e.preventDefault();
          setActiveSlideIndex(prev => Math.min(slides.length - 1, prev + 1));
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (isPpt && slides.length > 0) {
          e.preventDefault();
          setActiveSlideIndex(prev => Math.max(0, prev - 1));
        }
      } else if (e.key === 'Home') {
        if (isPpt) setActiveSlideIndex(0);
      } else if (e.key === 'End') {
        if (isPpt && slides.length > 0) setActiveSlideIndex(slides.length - 1);
      } else if (e.key === 'f' || e.key === 'F') {
        setIsFullscreen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPpt, slides.length, isFullscreen, onClose]);

  // Slide Search
  const matchingSlideIndices = useMemo(() => {
    if (!searchQuery.trim() || !slides) return [];
    const q = searchQuery.toLowerCase();
    const matches: number[] = [];
    slides.forEach((s, idx) => {
      if (
        s.title.toLowerCase().includes(q) ||
        s.rawText.toLowerCase().includes(q) ||
        s.bullets.some(b => b.toLowerCase().includes(q))
      ) {
        matches.push(idx);
      }
    });
    return matches;
  }, [searchQuery, slides]);

  const currentSlide = slides[activeSlideIndex] || {
    slideNumber: 1,
    title: docItem.displayName,
    bullets: [],
    rawText: '',
  };

  const handleToggleFavorite = async () => {
    const next = !docItem.isFavorite;
    setDocItem(prev => ({ ...prev, isFavorite: next }));
    await documentService.toggleFavorite(docItem.id);
    onDocumentUpdated?.();
  };

  const handleTogglePinned = async () => {
    const next = !docItem.isPinned;
    setDocItem(prev => ({ ...prev, isPinned: next }));
    await documentService.togglePinned(docItem.id);
    onDocumentUpdated?.();
  };

  const handleDownload = () => {
    documentService.downloadDocument(docItem);
  };

  const handleCopySlideText = () => {
    if (!currentSlide) return;
    const content = `${currentSlide.title}\n\n${currentSlide.bullets.map(b => `• ${b}`).join('\n')}`;
    navigator.clipboard.writeText(content);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Word Document Text Search Highlight
  const highlightedDocxHtml = useMemo(() => {
    if (!docxHtml) return '';
    if (!searchQuery.trim()) return docxHtml;

    try {
      const q = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${q})`, 'gi');
      return docxHtml.replace(regex, '<mark class="bg-amber-400 text-slate-950 px-1 rounded font-bold">$1</mark>');
    } catch {
      return docxHtml;
    }
  }, [docxHtml, searchQuery]);

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-50 flex flex-col bg-[#070b14] text-slate-100 ${
        isFullscreen ? 'p-0' : 'p-2 sm:p-4'
      }`}
    >
      <div className="flex-1 flex flex-col rounded-2xl sm:rounded-3xl bg-[#0b1220] border border-slate-800 shadow-2xl overflow-hidden">
        {/* Top Header Toolbar */}
        <header className="px-4 py-3 bg-[#0e1628] border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {isPpt ? (
              <span className="w-9 h-9 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center shrink-0 shadow-sm">
                <Presentation className="w-5 h-5" />
              </span>
            ) : (
              <span className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0 shadow-sm">
                <FileText className="w-5 h-5" />
              </span>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-white truncate max-w-xs sm:max-w-md">
                  {docItem.displayName}
                </h2>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 border ${
                    isPpt
                      ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                      : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  }`}
                >
                  {docItem.format || (isPpt ? 'PPTX' : 'DOCX')}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate font-mono">
                {docItem.fileName} • {formatBytes(docItem.fileSize)}
              </p>
            </div>
          </div>

          {/* Center Search Input */}
          <div className="hidden md:flex items-center gap-2 max-w-xs w-full">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isPpt ? 'Search slides...' : 'Search document...'}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
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
            {isPpt && searchQuery && (
              <span className="text-[11px] font-mono text-amber-400 shrink-0">
                {matchingSlideIndices.length} found
              </span>
            )}
          </div>

          {/* Right Action Icons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Quick Favorites & Pins */}
            <button
              onClick={handleTogglePinned}
              className={`p-2 rounded-xl transition ${
                docItem.isPinned
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-400/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title={docItem.isPinned ? 'Unpin' : 'Pin to Quick Access'}
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
              title={docItem.isFavorite ? 'Remove Favorite' : 'Favorite'}
            >
              <Star className={`w-4 h-4 ${docItem.isFavorite ? 'fill-amber-400' : ''}`} />
            </button>

            {/* Word Reader Theme Toggles */}
            {isWord && (
              <div className="hidden sm:flex items-center gap-1 bg-slate-900 border border-slate-700/80 rounded-xl p-1">
                <button
                  onClick={() => setReaderTheme('dark')}
                  className={`p-1.5 rounded-lg text-xs transition ${
                    readerTheme === 'dark' ? 'bg-sky-500/20 text-sky-400' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Dark mode"
                >
                  <Moon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setReaderTheme('sepia')}
                  className={`p-1.5 rounded-lg text-xs transition ${
                    readerTheme === 'sepia' ? 'bg-amber-500/20 text-amber-400' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Sepia warm mode"
                >
                  <Sun className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setReaderTheme('light')}
                  className={`p-1.5 rounded-lg text-xs transition ${
                    readerTheme === 'light' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Paper light mode"
                >
                  <Type className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Download native file */}
            <button
              onClick={handleDownload}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title={`Download original ${docItem.fileName}`}
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(prev => !prev)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close Modal */}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition ml-1"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Presentation Slide View */}
        {isPpt && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left Slide Thumbnails Filmstrip Sidebar */}
            <aside className="w-full md:w-64 bg-[#090e1a] border-b md:border-b-0 md:border-r border-slate-800 flex flex-col shrink-0 overflow-hidden">
              <div className="p-3 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">
                  Slides ({slides.length})
                </span>
                <button
                  onClick={() => setIsPlayingSlideshow(prev => !prev)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition ${
                    isPlayingSlideshow
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                  title={isPlayingSlideshow ? 'Pause Slideshow' : 'Play Auto-advance Slideshow'}
                >
                  {isPlayingSlideshow ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>{isPlayingSlideshow ? 'Pause' : 'Play'}</span>
                </button>
              </div>

              {/* Slide List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {slides.map((s, idx) => {
                  const isActive = idx === activeSlideIndex;
                  const isMatch = matchingSlideIndices.includes(idx);

                  return (
                    <div
                      key={idx}
                      onClick={() => setActiveSlideIndex(idx)}
                      className={`group p-2.5 rounded-xl border cursor-pointer transition-all ${
                        isActive
                          ? 'bg-orange-500/15 border-orange-400/50 shadow-md ring-1 ring-orange-500/30'
                          : isMatch
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                          : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800/80 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-slate-400 group-hover:text-white">
                          #{s.slideNumber}
                        </span>
                        {isMatch && (
                          <span className="text-[9px] font-bold text-amber-400 bg-amber-500/20 px-1.5 py-0.2 rounded">
                            MATCH
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-semibold text-white mt-1.5 line-clamp-1">
                        {s.title || `Slide ${s.slideNumber}`}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                        {s.bullets.length > 0 ? s.bullets.join(' • ') : s.rawText || 'Empty slide'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </aside>

            {/* Main Center Presentation Display */}
            <main className="flex-1 flex flex-col bg-[#070b14] overflow-hidden">
              <div className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-y-auto">
                {/* 16:9 Presentation Canvas Card */}
                <div className="w-full max-w-4xl aspect-[16/10] sm:aspect-[16/9] rounded-3xl bg-gradient-to-br from-[#111a2e] to-[#0b101d] border border-slate-700/80 shadow-2xl p-6 sm:p-12 flex flex-col justify-between relative overflow-hidden group">
                  {/* Subtle presentation background ambient lighting */}
                  <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
                  <div className="absolute bottom-0 left-0 w-80 h-80 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

                  {/* Slide Header */}
                  <div className="relative z-10 flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="px-2 py-0.5 rounded-md bg-orange-500/20 border border-orange-500/30 text-orange-400 font-mono text-xs font-bold">
                          SLIDE {currentSlide.slideNumber} OF {slides.length}
                        </span>
                        {isPlayingSlideshow && (
                          <span className="flex items-center gap-1 text-[11px] text-amber-400 animate-pulse font-mono">
                            <Play className="w-3 h-3 fill-amber-400" />
                            <span>Auto-advancing...</span>
                          </span>
                        )}
                      </div>
                      <h1 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight">
                        {currentSlide.title || `Slide ${currentSlide.slideNumber}`}
                      </h1>
                    </div>

                    <button
                      onClick={handleCopySlideText}
                      className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition shadow-sm"
                      title="Copy slide content"
                    >
                      {copiedText ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Slide Content Bullets */}
                  <div className="relative z-10 flex-1 my-6 overflow-y-auto pr-2">
                    {currentSlide.bullets.length > 0 ? (
                      <ul className="space-y-3.5">
                        {currentSlide.bullets.map((bullet, bidx) => (
                          <li key={bidx} className="flex items-start gap-3">
                            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 mt-2 shrink-0 shadow-sm shadow-orange-500/50" />
                            <span className="text-sm sm:text-base text-slate-200 leading-relaxed font-normal">
                              {bullet}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm sm:text-base text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {currentSlide.rawText || 'No text extracted for this slide.'}
                      </p>
                    )}
                  </div>

                  {/* Slide Footer Branding & Navigation */}
                  <div className="relative z-10 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                    <span>{docItem.displayName}</span>
                    <span>Use ← → Arrow Keys to Navigate</span>
                  </div>
                </div>
              </div>

              {/* Bottom Presentation Control Bar */}
              <footer className="px-6 py-3 bg-[#0e1628] border-t border-slate-800 flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    disabled={activeSlideIndex === 0}
                    onClick={() => setActiveSlideIndex(prev => Math.max(0, prev - 1))}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 disabled:opacity-30 transition font-medium"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </button>

                  <button
                    disabled={activeSlideIndex === slides.length - 1}
                    onClick={() => setActiveSlideIndex(prev => Math.min(slides.length - 1, prev + 1))}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-xs text-white font-semibold disabled:opacity-30 transition shadow-sm"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                  <span>Slide</span>
                  <input
                    type="number"
                    min={1}
                    max={slides.length}
                    value={activeSlideIndex + 1}
                    onChange={e => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val >= 1 && val <= slides.length) {
                        setActiveSlideIndex(val - 1);
                      }
                    }}
                    className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center text-white focus:outline-none focus:border-orange-500 font-mono"
                  />
                  <span>of {slides.length}</span>
                </div>
              </footer>
            </main>
          </div>
        )}

        {/* Word Document Reading View */}
        {isWord && (
          <div className="flex-1 flex flex-col bg-[#070b14] overflow-hidden">
            {/* Word Formatting Sub-bar */}
            <div className="px-6 py-2.5 bg-[#0a101e] border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-3">
                <span className="font-mono text-slate-400">
                  {docItem.wordCount ? `${docItem.wordCount.toLocaleString()} words` : `${docItem.pageCount} estimated pages`}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                  <span>
                    ~{Math.max(1, Math.ceil((docItem.wordCount || 350) / 200))} min read
                  </span>
                </span>
              </div>

              {/* Font Size & Family Controls */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/80 rounded-xl px-2 py-1">
                  <button
                    onClick={() => setFontSize(s => Math.max(12, s - 2))}
                    className="px-1.5 py-0.5 rounded text-slate-400 hover:text-white"
                    title="Decrease font size"
                  >
                    A-
                  </button>
                  <span className="font-mono text-[11px] text-slate-300 px-1">{fontSize}px</span>
                  <button
                    onClick={() => setFontSize(s => Math.min(28, s + 2))}
                    className="px-1.5 py-0.5 rounded text-slate-400 hover:text-white"
                    title="Increase font size"
                  >
                    A+
                  </button>
                </div>

                <div className="flex items-center rounded-xl bg-slate-900 border border-slate-700/80 p-0.5">
                  <button
                    onClick={() => setFontFamily('sans')}
                    className={`px-2 py-1 rounded-lg text-xs font-sans transition ${
                      fontFamily === 'sans' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Sans
                  </button>
                  <button
                    onClick={() => setFontFamily('serif')}
                    className={`px-2 py-1 rounded-lg text-xs font-serif transition ${
                      fontFamily === 'serif' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Serif
                  </button>
                  <button
                    onClick={() => setFontFamily('mono')}
                    className={`px-2 py-1 rounded-lg text-xs font-mono transition ${
                      fontFamily === 'mono' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Mono
                  </button>
                </div>
              </div>
            </div>

            {/* Document Content Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-10 flex justify-center">
              <div
                className={`w-full max-w-3xl rounded-3xl p-6 sm:p-12 shadow-2xl transition-all duration-300 border ${
                  readerTheme === 'light'
                    ? 'bg-[#ffffff] text-[#1e293b] border-slate-200'
                    : readerTheme === 'sepia'
                    ? 'bg-[#fbf0d9] text-[#433422] border-[#e8d5b5]'
                    : 'bg-[#0f172a] text-[#f1f5f9] border-slate-800'
                }`}
                style={{
                  fontSize: `${fontSize}px`,
                  fontFamily:
                    fontFamily === 'serif'
                      ? 'Georgia, Cambria, serif'
                      : fontFamily === 'mono'
                      ? 'ui-monospace, monospace'
                      : 'system-ui, -apple-system, sans-serif',
                  lineHeight: '1.75',
                }}
              >
                {/* Document Header inside reader */}
                <div className="pb-6 mb-6 border-b border-current opacity-30">
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                    {docItem.displayName}
                  </h1>
                  <p className="text-xs opacity-75 mt-1 font-mono">{docItem.fileName}</p>
                </div>

                {/* Rendered HTML from Mammoth */}
                {docxHtml ? (
                  <div
                    className="prose max-w-none space-y-4"
                    dangerouslySetInnerHTML={{ __html: highlightedDocxHtml }}
                  />
                ) : (
                  <div className="space-y-4 whitespace-pre-wrap leading-relaxed">
                    {docItem.extractedTextCache || 'No document text content available.'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
