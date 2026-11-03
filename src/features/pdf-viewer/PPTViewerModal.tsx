import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Presentation,
  Search,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  Bookmark,
  Star,
  Copy,
  Check,
  LayoutGrid,
  FileText,
  Volume2,
  VolumeX,
  Clock,
  Sparkles,
  HelpCircle,
  Eye,
  Settings,
  Layers,
  ArrowRight,
  Monitor,
} from 'lucide-react';
import { CollectionItem, DocumentItem, SlideItem } from '../../types';
import { documentService } from '../../lib/document-service';
import { collectionService } from '../../lib/collection-service';
import { formatBytes } from '../../lib/storage-service';
import { inspectPptx } from '../../lib/office-service';

interface PPTViewerModalProps {
  documentId: string;
  onClose: () => void;
  onDocumentUpdated?: () => void;
}

export const PPTViewerModal: React.FC<PPTViewerModalProps> = ({
  documentId,
  onClose,
  onDocumentUpdated,
}) => {
  const [docItem, setDocItem] = useState<DocumentItem | null>(null);
  const [binaryData, setBinaryData] = useState<ArrayBuffer | null>(null);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [slides, setSlides] = useState<SlideItem[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View Modes: 'stage' (default viewer), 'grid' (slide sorter), 'present' (distraction-free presentation)
  const [viewMode, setViewMode] = useState<'stage' | 'grid' | 'present'>('stage');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '4:3'>('16:9');

  // Presentation Features
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState(5);
  const [slideTimerProgress, setSlideTimerProgress] = useState(0);
  const [showSpeakerNotes, setShowSpeakerNotes] = useState(false);
  const [laserPointerActive, setLaserPointerActive] = useState(false);
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Load document and binary from IndexedDB
  useEffect(() => {
    let active = true;

    async function loadDocument() {
      setIsLoading(true);
      setError(null);
      try {
        const item = await documentService.getDocument(documentId);
        if (!item) {
          throw new Error('PowerPoint presentation could not be found in vault.');
        }
        if (!active) return;
        setDocItem(item);

        // Record opened timestamp
        documentService.recordOpened(item.id);

        const binary = await documentService.getDocumentBinary(documentId);
        if (!binary) {
          throw new Error('Presentation binary data missing from local storage.');
        }
        if (!active) return;
        setBinaryData(binary);

        // If slides already parsed in item metadata, use them; otherwise extract from binary
        if (item.slides && item.slides.length > 0) {
          setSlides(item.slides);
        } else {
          const inspected = await inspectPptx(binary, item.fileName);
          if (active && inspected.slides && inspected.slides.length > 0) {
            setSlides(inspected.slides);
            // Cache parsed slides back to document metadata
            documentService.updateDocumentMetadata(item.id, {
              slides: inspected.slides,
              slideCount: inspected.slideCount,
            }).catch(console.warn);
          }
        }

        const cols = await collectionService.getAllCollections();
        if (active) setCollections(cols);
      } catch (err) {
        if (active) {
          console.error('Error loading PPT presentation:', err);
          setError(err instanceof Error ? err.message : 'Failed to load presentation');
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

  // Slideshow auto-advance timer
  useEffect(() => {
    if (!isPlaying || slides.length <= 1) {
      setSlideTimerProgress(0);
      return;
    }

    const intervalMs = 100;
    const totalMs = autoAdvanceSeconds * 1000;
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed += intervalMs;
      setSlideTimerProgress(Math.min(100, Math.floor((elapsed / totalMs) * 100)));

      if (elapsed >= totalMs) {
        elapsed = 0;
        setSlideTimerProgress(0);
        setActiveSlideIndex(prev => (prev + 1) % slides.length);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, slides.length, autoAdvanceSeconds, activeSlideIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Escape') {
        if (showShortcutsModal) {
          setShowShortcutsModal(false);
        } else if (viewMode === 'present') {
          setViewMode('stage');
        } else if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        setActiveSlideIndex(prev => Math.min(slides.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setActiveSlideIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveSlideIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setActiveSlideIndex(Math.max(0, slides.length - 1));
      } else if (e.key === 'g' || e.key === 'G') {
        setViewMode(prev => (prev === 'grid' ? 'stage' : 'grid'));
      } else if (e.key === 'p' || e.key === 'P') {
        setIsPlaying(prev => !prev);
      } else if (e.key === 'f' || e.key === 'F') {
        setIsFullscreen(prev => !prev);
      } else if (e.key === 'l' || e.key === 'L') {
        setLaserPointerActive(prev => !prev);
      } else if (e.key === '?') {
        setShowShortcutsModal(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slides.length, viewMode, isFullscreen, showShortcutsModal, onClose]);

  // Laser Pointer cursor tracker on stage
  const handleStageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!laserPointerActive || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    setLaserPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleStageMouseLeave = () => {
    setLaserPos(null);
  };

  // Search matches
  const matchingSlideIndices = useMemo(() => {
    if (!searchQuery.trim() || !slides) return [];
    const q = searchQuery.toLowerCase();
    const indices: number[] = [];
    slides.forEach((s, idx) => {
      if (
        s.title.toLowerCase().includes(q) ||
        s.rawText.toLowerCase().includes(q) ||
        s.bullets.some(b => b.toLowerCase().includes(q))
      ) {
        indices.push(idx);
      }
    });
    return indices;
  }, [searchQuery, slides]);

  const currentSlide: SlideItem = slides[activeSlideIndex] || {
    slideNumber: 1,
    title: docItem?.displayName || 'Presentation Slide',
    bullets: [],
    rawText: '',
  };

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

  const handleCopyTranscript = async () => {
    if (slides.length === 0) return;
    const lines = [
      `# ${docItem?.displayName || 'Presentation'}`,
      `Total Slides: ${slides.length}`,
      '',
    ];

    slides.forEach(s => {
      lines.push(`---`);
      lines.push(`## Slide ${s.slideNumber}: ${s.title}`);
      if (s.bullets.length > 0) {
        s.bullets.forEach(b => lines.push(`* ${b}`));
      } else if (s.rawText) {
        lines.push(s.rawText);
      }
      lines.push('');
    });

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedTranscript(true);
      setTimeout(() => setCopiedTranscript(false), 2000);
    } catch {
      alert('Failed to copy to clipboard.');
    }
  };

  if (!documentId) return null;

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-50 flex flex-col bg-[#050811] text-slate-100 select-none ${
        isFullscreen ? 'p-0' : 'p-2 sm:p-4'
      }`}
    >
      <div className="flex-1 flex flex-col rounded-2xl sm:rounded-3xl bg-[#090f1d] border border-slate-800 shadow-2xl overflow-hidden relative">
        {/* Top Presentation Header Bar */}
        <header className="h-14 px-4 bg-[#0d1527] border-b border-slate-800 flex items-center justify-between gap-3 shrink-0 z-20">
          {/* Left: Presentation Branding & Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
              title="Close Presentation (Esc)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400 flex items-center justify-center shrink-0 shadow-sm">
                <Presentation className="w-4 h-4" />
              </span>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
                    {docItem?.displayName || 'PowerPoint Presentation'}
                  </h1>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-orange-500/20 text-orange-400 border border-orange-500/30 shrink-0 font-mono">
                    {docItem?.format?.toUpperCase() || 'PPTX'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate font-mono">
                  {slides.length} slides • {docItem ? formatBytes(docItem.fileSize) : 'Loading...'}
                </p>
              </div>
            </div>
          </div>

          {/* Center: Slide Search Input */}
          <div className="hidden md:flex items-center gap-2 max-w-xs w-full">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search across slides... (⌘F)"
                className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
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
              <span className="text-[11px] font-mono text-orange-400 shrink-0 font-semibold">
                {matchingSlideIndices.length} matches
              </span>
            )}
          </div>

          {/* Right Toolbar Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* View Mode Switcher: Stage vs Grid */}
            <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-xl p-0.5">
              <button
                onClick={() => setViewMode('stage')}
                className={`p-1.5 rounded-lg text-xs transition ${
                  viewMode === 'stage'
                    ? 'bg-orange-500/20 text-orange-400 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Single Slide Stage (S)"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg text-xs transition ${
                  viewMode === 'grid'
                    ? 'bg-orange-500/20 text-orange-400 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Slide Sorter Grid (G)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Presentation Mode Trigger */}
            <button
              onClick={() => setViewMode(prev => (prev === 'present' ? 'stage' : 'present'))}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                viewMode === 'present'
                  ? 'bg-orange-500 text-white border-orange-400 shadow-md shadow-orange-500/30'
                  : 'bg-slate-900 border-slate-700/80 text-orange-400 hover:bg-slate-800'
              }`}
              title="Full Presentation Mode"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Present</span>
            </button>

            {/* Auto-Play Slideshow Trigger */}
            <button
              onClick={() => setIsPlaying(prev => !prev)}
              className={`p-2 rounded-xl transition ${
                isPlaying
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title={isPlaying ? 'Pause auto-slideshow (P)' : 'Play slideshow (P)'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            {/* Copy full slide transcript */}
            <button
              onClick={handleCopyTranscript}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Copy presentation text transcript"
            >
              {copiedTranscript ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            {/* Toggle Favorites & Pins */}
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

            {/* Download Original File */}
            <button
              onClick={handleDownload}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Download original presentation (.pptx)"
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

            {/* Close */}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition ml-1"
              title="Exit Reader (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Loading & Error States */}
        {isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/20 text-orange-400 flex items-center justify-center animate-spin">
              <Presentation className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-white">Extracting PowerPoint slides...</p>
            <p className="text-xs text-slate-400">Parsing OpenXML slide tree and presentation notes</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <X className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">Could not render PowerPoint presentation</h3>
            <p className="text-xs text-slate-400 max-w-md">{error}</p>
            <button
              onClick={handleDownload}
              className="mt-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 transition"
            >
              Download original {docItem?.fileName || 'presentation'}
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW MODE 1: SINGLE SLIDE STAGE (Default Studio) */}
        {/* ------------------------------------------------------------- */}
        {!isLoading && !error && viewMode === 'stage' && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left Slide Thumbnails Filmstrip */}
            <aside className="w-full md:w-64 bg-[#080d19] border-b md:border-b-0 md:border-r border-slate-800 flex flex-col shrink-0 overflow-hidden">
              <div className="px-3.5 py-3 border-b border-slate-800/80 flex items-center justify-between text-xs">
                <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">
                  Slides ({slides.length})
                </span>
                <span className="font-mono text-[10px] text-orange-400 font-bold bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">
                  Slide {activeSlideIndex + 1} / {slides.length}
                </span>
              </div>

              {/* Thumbnail Strip */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                {slides.map((s, idx) => {
                  const isActive = idx === activeSlideIndex;
                  const isMatch = matchingSlideIndices.includes(idx);

                  return (
                    <div
                      key={idx}
                      onClick={() => setActiveSlideIndex(idx)}
                      className={`group p-2.5 rounded-xl border cursor-pointer transition-all ${
                        isActive
                          ? 'bg-orange-500/15 border-orange-500/60 shadow-lg ring-1 ring-orange-500/40'
                          : isMatch
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                          : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800/80 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-slate-400 font-bold group-hover:text-white">
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
                        {s.bullets.length > 0 ? s.bullets.join(' • ') : s.rawText || 'Presentation Slide'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </aside>

            {/* Main Stage Display */}
            <main className="flex-1 flex flex-col bg-[#050811] overflow-hidden">
              {/* Slideshow Progress Bar */}
              {isPlaying && (
                <div className="w-full h-1 bg-slate-800">
                  <div
                    className="h-full bg-orange-500 transition-all duration-100 ease-linear"
                    style={{ width: `${slideTimerProgress}%` }}
                  />
                </div>
              )}

              <div
                ref={stageRef}
                onMouseMove={handleStageMouseMove}
                onMouseLeave={handleStageMouseLeave}
                className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-y-auto relative"
              >
                {/* Laser Pointer simulation */}
                {laserPointerActive && laserPos && (
                  <div
                    className="absolute w-4 h-4 rounded-full bg-red-500 pointer-events-none shadow-lg shadow-red-500/80 -translate-x-1/2 -translate-y-1/2 z-40 animate-ping opacity-75"
                    style={{ left: `${laserPos.x}px`, top: `${laserPos.y}px` }}
                  />
                )}

                {/* 16:9 Presentation Canvas Card */}
                <div
                  className={`w-full max-w-4xl ${
                    aspectRatio === '16:9' ? 'aspect-[16/9]' : 'aspect-[4/3]'
                  } rounded-3xl bg-gradient-to-br from-[#101726] to-[#090e1a] border border-slate-700/80 shadow-2xl p-6 sm:p-12 flex flex-col justify-between relative overflow-hidden transition-all duration-300`}
                >
                  {/* Subtle presentation ambient illumination */}
                  <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
                  <div className="absolute bottom-0 left-0 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

                  {/* Slide Header */}
                  <div className="relative z-10 flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="px-2 py-0.5 rounded-md bg-orange-500/20 border border-orange-500/30 text-orange-400 font-mono text-xs font-bold shadow-sm">
                          SLIDE {currentSlide.slideNumber} OF {slides.length}
                        </span>
                        {isPlaying && (
                          <span className="flex items-center gap-1 text-[11px] text-amber-400 animate-pulse font-mono">
                            <Play className="w-3 h-3 fill-amber-400" />
                            <span>Auto-advancing ({autoAdvanceSeconds}s)...</span>
                          </span>
                        )}
                      </div>
                      <h2 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
                        {currentSlide.title || `Slide ${currentSlide.slideNumber}`}
                      </h2>
                    </div>

                    <button
                      onClick={async () => {
                        const content = `${currentSlide.title}\n\n${currentSlide.bullets.map(b => `• ${b}`).join('\n')}`;
                        await navigator.clipboard.writeText(content);
                        setCopiedTranscript(true);
                        setTimeout(() => setCopiedTranscript(false), 2000);
                      }}
                      className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition shadow-sm"
                      title="Copy slide text"
                    >
                      {copiedTranscript ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Slide Bullets Content */}
                  <div className="relative z-10 flex-1 my-6 overflow-y-auto pr-2">
                    {currentSlide.bullets.length > 0 ? (
                      <ul className="space-y-3.5">
                        {currentSlide.bullets.map((bullet, bidx) => (
                          <li key={bidx} className="flex items-start gap-3">
                            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 mt-2 shrink-0 shadow-md shadow-orange-500/50" />
                            <span className="text-sm sm:text-base text-slate-200 leading-relaxed font-normal">
                              {bullet}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm sm:text-base text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {currentSlide.rawText || 'Presentation slide content'}
                      </p>
                    )}
                  </div>

                  {/* Slide Footer */}
                  <div className="relative z-10 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                    <span className="truncate max-w-sm">{docItem?.displayName}</span>
                    <span className="hidden sm:inline">Use ← → or Space to advance</span>
                  </div>
                </div>
              </div>

              {/* Bottom Stage Navigation Controls */}
              <footer className="px-6 py-3 bg-[#0d1527] border-t border-slate-800 flex items-center justify-between gap-4 shrink-0">
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
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-xs text-white font-semibold disabled:opacity-30 transition shadow-md shadow-orange-600/30"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Aspect ratio & speaker notes toggles */}
                <div className="hidden sm:flex items-center gap-2 text-xs">
                  <button
                    onClick={() => setAspectRatio(r => (r === '16:9' ? '4:3' : '16:9'))}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-mono text-[11px]"
                    title="Toggle Slide Aspect Ratio"
                  >
                    {aspectRatio}
                  </button>

                  <button
                    onClick={() => setLaserPointerActive(prev => !prev)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition ${
                      laserPointerActive
                        ? 'bg-red-500/20 text-red-400 border-red-500/40'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                    title="Toggle Laser Pointer (L)"
                  >
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span>Laser</span>
                  </button>
                </div>

                {/* Jump to Slide Input */}
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

        {/* ------------------------------------------------------------- */}
        {/* VIEW MODE 2: SLIDE SORTER GRID VIEW */}
        {/* ------------------------------------------------------------- */}
        {!isLoading && !error && viewMode === 'grid' && (
          <div className="flex-1 flex flex-col bg-[#050811] overflow-hidden">
            <div className="p-4 bg-[#090f1d] border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-white">Slide Sorter Gallery ({slides.length} slides)</span>
              <span>Click any slide to jump directly to it</span>
            </div>

            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {slides.map((s, idx) => {
                const isActive = idx === activeSlideIndex;
                const isMatch = matchingSlideIndices.includes(idx);

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setActiveSlideIndex(idx);
                      setViewMode('stage');
                    }}
                    className={`group relative aspect-[16/10] rounded-2xl p-4 border flex flex-col justify-between cursor-pointer transition-all duration-200 overflow-hidden ${
                      isActive
                        ? 'bg-orange-500/15 border-orange-500 shadow-xl ring-2 ring-orange-500/50 scale-[1.02]'
                        : isMatch
                        ? 'bg-amber-500/10 border-amber-500/40'
                        : 'bg-slate-900/80 hover:bg-slate-800/90 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-black/50 text-slate-300 font-bold">
                        #{s.slideNumber}
                      </span>
                      {isActive && (
                        <span className="text-[10px] font-bold text-orange-400 bg-orange-500/20 px-2 py-0.5 rounded-full border border-orange-500/30">
                          CURRENT
                        </span>
                      )}
                    </div>

                    <div className="my-2">
                      <h3 className="text-xs sm:text-sm font-bold text-white line-clamp-2">
                        {s.title || `Slide ${s.slideNumber}`}
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-3">
                        {s.bullets.length > 0 ? s.bullets.join(' • ') : s.rawText || 'Slide content'}
                      </p>
                    </div>

                    <div className="text-[10px] text-slate-500 font-mono">Click to view slide</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW MODE 3: FULL DISTRACTION-FREE PRESENTATION MODE */}
        {/* ------------------------------------------------------------- */}
        {!isLoading && !error && viewMode === 'present' && (
          <div
            ref={stageRef}
            onMouseMove={handleStageMouseMove}
            onMouseLeave={handleStageMouseLeave}
            className="flex-1 flex flex-col bg-black text-white relative overflow-hidden"
          >
            {/* Top Minimalist Floating Bar */}
            <div className="absolute top-4 left-6 right-6 flex items-center justify-between z-30 opacity-40 hover:opacity-100 transition-opacity">
              <span className="font-mono text-xs font-bold text-orange-400 bg-black/70 px-3 py-1.5 rounded-xl border border-orange-500/30 backdrop-blur-md">
                PRESENTATION MODE • SLIDE {currentSlide.slideNumber} OF {slides.length}
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPlaying(p => !p)}
                  className="px-3 py-1.5 rounded-xl bg-black/70 border border-slate-700 text-xs font-semibold hover:bg-slate-800 transition backdrop-blur-md flex items-center gap-1.5"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isPlaying ? 'Pause' : 'Auto-Play'}</span>
                </button>
                <button
                  onClick={() => setViewMode('stage')}
                  className="px-3 py-1.5 rounded-xl bg-black/70 border border-slate-700 text-xs font-semibold hover:bg-slate-800 transition backdrop-blur-md"
                >
                  Exit Presenter (Esc)
                </button>
              </div>
            </div>

            {/* Laser pointer in Presenter Mode */}
            {laserPointerActive && laserPos && (
              <div
                className="absolute w-4 h-4 rounded-full bg-red-500 pointer-events-none shadow-xl shadow-red-500 -translate-x-1/2 -translate-y-1/2 z-40 animate-ping"
                style={{ left: `${laserPos.x}px`, top: `${laserPos.y}px` }}
              />
            )}

            {/* Huge Presentation Screen */}
            <div className="flex-1 flex items-center justify-center p-6 sm:p-16">
              <div className="w-full max-w-5xl aspect-[16/9] rounded-3xl bg-gradient-to-br from-[#121927] to-[#0a0f1b] border border-slate-700/60 shadow-2xl p-8 sm:p-16 flex flex-col justify-between relative overflow-hidden">
                <div>
                  <span className="text-orange-400 font-mono text-sm font-bold tracking-wider uppercase mb-2 block">
                    {docItem?.displayName}
                  </span>
                  <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                    {currentSlide.title}
                  </h1>
                </div>

                <div className="my-8 flex-1 overflow-y-auto pr-4">
                  {currentSlide.bullets.length > 0 ? (
                    <ul className="space-y-5">
                      {currentSlide.bullets.map((b, i) => (
                        <li key={i} className="flex items-start gap-4">
                          <span className="w-3 h-3 rounded-full bg-orange-500 mt-2 shrink-0 shadow-lg shadow-orange-500/50" />
                          <span className="text-base sm:text-xl text-slate-100 font-normal leading-relaxed">
                            {b}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-base sm:text-xl text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {currentSlide.rawText}
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500 font-mono">
                  <span>Slide {currentSlide.slideNumber} of {slides.length}</span>
                  <span>Click anywhere or use Space to continue</span>
                </div>
              </div>
            </div>

            {/* Bottom floating nav buttons */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/80 border border-slate-800 px-4 py-2 rounded-2xl backdrop-blur-md z-30">
              <button
                disabled={activeSlideIndex === 0}
                onClick={() => setActiveSlideIndex(p => Math.max(0, p - 1))}
                className="p-2 rounded-xl hover:bg-slate-800 text-slate-300 disabled:opacity-30"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="font-mono text-xs text-slate-400">
                {activeSlideIndex + 1} / {slides.length}
              </span>
              <button
                disabled={activeSlideIndex === slides.length - 1}
                onClick={() => setActiveSlideIndex(p => Math.min(slides.length - 1, p + 1))}
                className="p-2 rounded-xl hover:bg-slate-800 text-slate-300 disabled:opacity-30"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
