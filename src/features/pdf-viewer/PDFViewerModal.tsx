import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Download,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Bookmark,
  Star,
  Tag,
  Folder,
  FileText,
  Loader2,
  AlertCircle,
  Sidebar,
  Printer,
  Info,
  Check,
  Search,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Volume2,
  VolumeX,
  Pause,
  Play,
  Square,
  Copy,
  Sun,
  Moon,
  Type,
  BookmarkCheck,
  Trash2,
  Edit3,
  Palette,
} from 'lucide-react';
import { CollectionItem, DocumentItem, PageBookmark, ReaderFilterTone } from '../../types';
import { documentService } from '../../lib/document-service';
import { collectionService } from '../../lib/collection-service';
import { formatBytes } from '../../lib/storage-service';

interface PDFViewerModalProps {
  documentId: string | null;
  onClose: () => void;
  onDocumentUpdated?: () => void;
}

interface SearchMatch {
  pageNumber: number;
  matchIndex: number;
}

export const PDFViewerModal: React.FC<PDFViewerModalProps> = ({
  documentId,
  onClose,
  onDocumentUpdated,
}) => {
  const [docItem, setDocItem] = useState<DocumentItem | null>(null);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.2);
  const [rotation, setRotation] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showThumbnails, setShowThumbnails] = useState<boolean>(true);
  const [showMetaPanel, setShowMetaPanel] = useState<boolean>(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);

  // Password Protection State
  const [isPasswordRequired, setIsPasswordRequired] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPasswordText, setShowPasswordText] = useState<boolean>(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isVerifyingPassword, setIsVerifyingPassword] = useState<boolean>(false);

  // In-Document Search State
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1);

  // Editable fields in reader
  const [editTitle, setEditTitle] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [isSavingMeta, setIsSavingMeta] = useState<boolean>(false);
  const [metaSavedNotice, setMetaSavedNotice] = useState<boolean>(false);

  // Reading Mode: 'canvas' (print layout) or 'reflow' (mobile-responsive clean text)
  const [viewMode, setViewMode] = useState<'canvas' | 'reflow'>('canvas');
  const [canvasTone, setCanvasTone] = useState<ReaderFilterTone>('normal');
  const [showToneMenu, setShowToneMenu] = useState<boolean>(false);

  // Reflow Reader State
  const [reflowFontSize, setReflowFontSize] = useState<number>(17);
  const [reflowFontFamily, setReflowFontFamily] = useState<'sans' | 'serif' | 'mono'>('sans');
  const [reflowTheme, setReflowTheme] = useState<'day' | 'sepia' | 'slate' | 'oled'>('slate');
  const [reflowText, setReflowText] = useState<string>('');
  const [isLoadingReflow, setIsLoadingReflow] = useState<boolean>(false);
  const [copiedText, setCopiedText] = useState<boolean>(false);

  // Read Aloud (Text-to-Speech)
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isSpeechPaused, setIsSpeechPaused] = useState<boolean>(false);
  const [speechRate, setSpeechRate] = useState<number>(1);

  // Sidebar Tab: 'thumbnails' | 'bookmarks'
  const [sidebarTab, setSidebarTab] = useState<'thumbnails' | 'bookmarks'>('thumbnails');
  const [isAddingBookmark, setIsAddingBookmark] = useState<boolean>(false);
  const [bookmarkTitle, setBookmarkTitle] = useState<string>('');
  const [bookmarkNote, setBookmarkNote] = useState<string>('');
  const [bookmarkColor, setBookmarkColor] = useState<string>('#38bdf8');
  const [isSavingBookmark, setIsSavingBookmark] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const cachedBinaryRef = useRef<ArrayBuffer | null>(null);

  // Touch gesture tracking for mobile swipe page navigation
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Load document metadata and binary
  useEffect(() => {
    if (!documentId) return;

    let isCancelled = false;
    setIsLoading(true);
    setError(null);
    setIsPasswordRequired(false);
    setPasswordError(null);
    setCurrentPage(1);
    setRotation(0);
    setSearchResults([]);
    setCurrentMatchIndex(-1);

    collectionService.getAllCollections().then(setCollections);

    async function loadData() {
      try {
        const item = await documentService.getDocument(documentId!);
        if (!item) {
          throw new Error('Document metadata could not be found.');
        }
        if (isCancelled) return;
        setDocItem(item);
        setEditTitle(item.displayName);
        setEditCategory(item.category);
        setEditTags(item.tags || []);
        setEditDescription(item.description || '');

        // Record document last opened timestamp
        documentService.recordOpened(item.id);

        const binary = await documentService.getDocumentBinary(documentId!);
        if (!binary) {
          throw new Error('PDF file content is missing from local IndexedDB.');
        }
        cachedBinaryRef.current = binary;

        // Clone buffer to avoid detachment issues
        const bufferClone = binary.slice(0);
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(bufferClone),
          cMapUrl: 'https://unpkg.com/pdfjs-dist@4.0.379/cmaps/',
          cMapPacked: true,
        });

        const loadedPdf = await loadingTask.promise;
        if (isCancelled) return;

        setPdfDoc(loadedPdf);
        setNumPages(loadedPdf.numPages);
        setIsLoading(false);
      } catch (err: unknown) {
        if (!isCancelled) {
          console.error('Error loading PDF in reader:', err);
          const errObj = err as { name?: string; message?: string; code?: number };
          const isPass =
            errObj?.name === 'PasswordException' ||
            errObj?.code === 1 ||
            errObj?.message?.toLowerCase().includes('password');

          if (isPass) {
            setIsPasswordRequired(true);
            setIsLoading(false);
          } else {
            setError(err instanceof Error ? err.message : 'Failed to render PDF document');
            setIsLoading(false);
          }
        }
      }
    }

    loadData();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [documentId]);

  // Handle Password Unlock
  const handleUnlockPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!cachedBinaryRef.current) return;

    setIsVerifyingPassword(true);
    setPasswordError(null);

    try {
      const bufferClone = cachedBinaryRef.current.slice(0);
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(bufferClone),
        password: passwordInput,
        cMapUrl: 'https://unpkg.com/pdfjs-dist@4.0.379/cmaps/',
        cMapPacked: true,
      });

      const loadedPdf = await loadingTask.promise;
      setPdfDoc(loadedPdf);
      setNumPages(loadedPdf.numPages);
      setIsPasswordRequired(false);
      setIsLoading(false);
    } catch (err: unknown) {
      console.warn('Password verification failed:', err);
      setPasswordError('Incorrect password. Please verify and try again.');
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  // Perform In-Document Text Search
  const handlePerformSearch = async (term: string) => {
    const q = term.trim().toLowerCase();
    if (!q || !pdfDoc) {
      setSearchResults([]);
      setCurrentMatchIndex(-1);
      return;
    }

    setIsSearching(true);
    const matches: SearchMatch[] = [];

    try {
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const page = await pdfDoc.getPage(p);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((item: any) => item.str || '')
          .join(' ')
          .toLowerCase();

        let pos = 0;
        let countOnPage = 0;
        while ((pos = pageText.indexOf(q, pos)) !== -1) {
          countOnPage++;
          matches.push({ pageNumber: p, matchIndex: countOnPage });
          pos += q.length;
        }
      }

      setSearchResults(matches);
      if (matches.length > 0) {
        setCurrentMatchIndex(0);
        setCurrentPage(matches[0].pageNumber);
      } else {
        setCurrentMatchIndex(-1);
      }
    } catch (searchErr) {
      console.warn('PDF search encountered an issue:', searchErr);
    } finally {
      setIsSearching(false);
    }
  };

  const handleNextMatch = () => {
    if (searchResults.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % searchResults.length;
    setCurrentMatchIndex(nextIdx);
    setCurrentPage(searchResults[nextIdx].pageNumber);
  };

  const handlePrevMatch = () => {
    if (searchResults.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentMatchIndex(prevIdx);
    setCurrentPage(searchResults[prevIdx].pageNumber);
  };

  // Touch Swipe Handlers for mobile phones
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    // Detect intentional horizontal swipe (min 50px delta and more horizontal than vertical)
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
      if (deltaX < 0) {
        // Swiped left -> Next page
        setCurrentPage(p => Math.min(numPages, p + 1));
      } else {
        // Swiped right -> Prev page
        setCurrentPage(p => Math.max(1, p - 1));
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Extract text for Reflow Reader Mode when currentPage or viewMode changes
  useEffect(() => {
    if (viewMode === 'reflow' && pdfDoc) {
      let isCurrent = true;
      setIsLoadingReflow(true);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        setIsSpeechPaused(false);
      }

      pdfDoc.getPage(currentPage).then(async page => {
        try {
          const content = await page.getTextContent();
          const extracted = content.items
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((item: any) => item.str || '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (isCurrent) {
            setReflowText(extracted);
            setIsLoadingReflow(false);
          }
        } catch {
          if (isCurrent) {
            setReflowText('');
            setIsLoadingReflow(false);
          }
        }
      }).catch(() => {
        if (isCurrent) setIsLoadingReflow(false);
      });

      return () => {
        isCurrent = false;
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
      };
    }
  }, [viewMode, currentPage, pdfDoc]);

  // Read Aloud / TTS Handlers
  const handlePlayTTS = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported on this device/browser.');
      return;
    }
    if (!reflowText.trim()) return;

    if (isSpeechPaused) {
      window.speechSynthesis.resume();
      setIsSpeechPaused(false);
      setIsSpeaking(true);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(reflowText);
    utterance.rate = speechRate;
    utterance.onend = () => {
      setIsSpeaking(false);
      setIsSpeechPaused(false);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsSpeechPaused(false);
    };

    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
    setIsSpeechPaused(false);
  };

  const handlePauseTTS = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
      setIsSpeechPaused(true);
    }
  };

  const handleStopTTS = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsSpeechPaused(false);
    }
  };

  const handleCopyReflowText = async () => {
    if (!reflowText.trim()) return;
    try {
      await navigator.clipboard.writeText(reflowText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleAddBookmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docItem) return;
    setIsSavingBookmark(true);
    try {
      const newBm = await documentService.addPageBookmark(docItem.id, {
        pageNumber: currentPage,
        title: bookmarkTitle.trim() || `Page ${currentPage}`,
        note: bookmarkNote.trim() || undefined,
        color: bookmarkColor,
      });

      setDocItem(prev => {
        if (!prev) return null;
        const list = prev.pageBookmarks || [];
        return {
          ...prev,
          pageBookmarks: [...list, newBm].sort((a, b) => a.pageNumber - b.pageNumber),
        };
      });

      setIsAddingBookmark(false);
      setBookmarkTitle('');
      setBookmarkNote('');
      onDocumentUpdated?.();
    } catch (err) {
      alert('Could not save bookmark: ' + (err instanceof Error ? err.message : 'Error'));
    } finally {
      setIsSavingBookmark(false);
    }
  };

  const handleDeleteBookmark = async (bmId: string) => {
    if (!docItem) return;
    try {
      await documentService.deletePageBookmark(docItem.id, bmId);
      setDocItem(prev => {
        if (!prev) return null;
        return {
          ...prev,
          pageBookmarks: (prev.pageBookmarks || []).filter(b => b.id !== bmId),
        };
      });
      onDocumentUpdated?.();
    } catch (err) {
      console.error('Failed to remove bookmark:', err);
    }
  };

  const getCanvasToneFilter = () => {
    switch (canvasTone) {
      case 'invert':
        return 'invert(0.92) hue-rotate(180deg) contrast(1.1) brightness(0.95)';
      case 'sepia':
        return 'sepia(0.65) contrast(0.95) brightness(0.95)';
      case 'contrast':
        return 'grayscale(1) contrast(1.6)';
      case 'normal':
      default:
        return 'none';
    }
  };

  // Render current page onto canvas
  const renderPage = useCallback(
    async (pageNumber: number) => {
      if (!pdfDoc || !canvasRef.current) return;

      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(pageNumber);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        const viewport = page.getViewport({ scale, rotation });

        // High DPI canvas handling
        const pixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        // Fill background white
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, viewport.width, viewport.height);

        const renderContext = {
          canvasContext: ctx,
          viewport,
          canvas: canvas as unknown as HTMLCanvasElement,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;
        await renderTask.promise;
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'name' in err &&
          err.name !== 'RenderingCancelledException'
        ) {
          console.warn('Canvas render error:', err);
        }
      }
    },
    [pdfDoc, scale, rotation]
  );

  useEffect(() => {
    if (pdfDoc && !isLoading && !error && !isPasswordRequired) {
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage, scale, rotation, isLoading, error, isPasswordRequired, renderPage]);

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'j') {
        e.preventDefault();
        setCurrentPage(p => Math.min(numPages, p + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'k') {
        e.preventDefault();
        setCurrentPage(p => Math.max(1, p - 1));
      } else if (e.key === 'Escape') {
        if (isSearchOpen) setIsSearchOpen(false);
        else if (showShortcutsModal) setShowShortcutsModal(false);
        else onClose();
      } else if (e.key === '+' || e.key === '=') {
        setScale(s => Math.min(3, +(s + 0.15).toFixed(2)));
      } else if (e.key === '-') {
        setScale(s => Math.max(0.4, +(s - 0.15).toFixed(2)));
      } else if (e.key === 'r' || e.key === 'R') {
        if (e.altKey) {
          e.preventDefault();
          setViewMode(vm => (vm === 'canvas' ? 'reflow' : 'canvas'));
        } else {
          setRotation(r => (r + 90) % 360);
        }
      } else if (e.key === 'b' || e.key === 'B') {
        setShowThumbnails(true);
        setSidebarTab('bookmarks');
        setIsAddingBookmark(true);
      } else if (e.key === 't' || e.key === 'T') {
        const tones: ReaderFilterTone[] = ['normal', 'invert', 'sepia', 'contrast'];
        setCanvasTone(prev => {
          const idx = tones.indexOf(prev);
          return tones[(idx + 1) % tones.length];
        });
      } else if (e.key === 'f' || e.key === 'F') {
        handleFitWidth();
      } else if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if (e.key === '?') {
        setShowShortcutsModal(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [numPages, isSearchOpen, showShortcutsModal, onClose]);

  const handleZoomIn = () => setScale(s => Math.min(3, +(s + 0.2).toFixed(2)));
  const handleZoomOut = () => setScale(s => Math.max(0.4, +(s - 0.2).toFixed(2)));
  const handleRotate = () => setRotation(r => (r + 90) % 360);

  const handleFitWidth = () => {
    if (!containerRef.current || !pdfDoc) return;
    pdfDoc.getPage(currentPage).then(page => {
      const naturalViewport = page.getViewport({ scale: 1, rotation });
      const availableWidth =
        (containerRef.current?.clientWidth || 800) - (showThumbnails ? 260 : 40);
      const newScale = Math.max(
        0.4,
        Math.min(2.5, (availableWidth - 40) / naturalViewport.width)
      );
      setScale(+newScale.toFixed(2));
    });
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!docItem) return;
    const newVal = await documentService.toggleFavorite(docItem.id);
    setDocItem({ ...docItem, isFavorite: newVal });
    onDocumentUpdated?.();
  };

  const handleTogglePinned = async () => {
    if (!docItem) return;
    const newVal = await documentService.togglePinned(docItem.id);
    setDocItem({ ...docItem, isPinned: newVal });
    onDocumentUpdated?.();
  };

  const handleDownload = async () => {
    if (!docItem) return;
    try {
      await documentService.downloadDocument(docItem);
    } catch (err) {
      alert('Could not download document: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  const handlePrint = async () => {
    if (!docItem) return;
    const binary = await documentService.getDocumentBinary(docItem.id);
    if (!binary) return;
    const blob = new Blob([binary], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 5000);
    };
  };

  const handleSaveMetadata = async () => {
    if (!docItem) return;
    setIsSavingMeta(true);
    try {
      await documentService.updateDocument(docItem.id, {
        displayName: editTitle.trim() || docItem.fileName,
        category: editCategory,
        tags: editTags,
        description: editDescription.trim(),
      });
      setDocItem(prev =>
        prev
          ? {
              ...prev,
              displayName: editTitle.trim() || docItem.fileName,
              category: editCategory,
              tags: editTags,
              description: editDescription.trim(),
            }
          : null
      );
      setMetaSavedNotice(true);
      setTimeout(() => setMetaSavedNotice(false), 2500);
      onDocumentUpdated?.();
    } catch (err) {
      alert('Error updating document: ' + (err instanceof Error ? err.message : 'Failed'));
    } finally {
      setIsSavingMeta(false);
    }
  };

  const handleAddTag = () => {
    const t = newTagInput.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
    if (t && !editTags.includes(t)) {
      setEditTags([...editTags, t]);
    }
    setNewTagInput('');
  };

  if (!documentId) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#070b14] text-slate-100 select-none overflow-hidden animate-in fade-in duration-200">
      {/* Top Header Toolbar */}
      <div className="h-14 px-3 sm:px-4 bg-[#0c1220] border-b border-slate-800/80 flex items-center justify-between gap-2 sm:gap-3 shrink-0 z-20">
        {/* Left: Close & Title */}
        <div className="flex items-center gap-2 sm:gap-3 overflow-hidden min-w-0">
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition shrink-0"
            title="Back to Vault (Esc)"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 overflow-hidden min-w-0">
            <span className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </span>
            <div className="truncate">
              <h1 className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
                <span>{docItem?.displayName || 'Loading document...'}</span>
                {isPasswordRequired && (
                  <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0 inline" />
                )}
              </h1>
              <p className="text-[11px] text-slate-400 truncate flex items-center gap-2">
                <span>{docItem?.fileName}</span>
                {docItem?.fileSize && (
                  <>
                    <span>•</span>
                    <span className="font-mono">{formatBytes(docItem.fileSize)}</span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Center: Pagination & Zoom Controls (Desktop / Tablet) */}
        {!isPasswordRequired && (
          <div className="hidden md:flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl p-1 text-xs">
            {/* Page navigation */}
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1 || isLoading}
              className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-slate-300"
              title="Previous Page (Left Arrow or K)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-2 font-mono text-slate-300 flex items-center gap-1 text-[11px]">
              <input
                type="number"
                min={1}
                max={numPages || 1}
                value={currentPage}
                onChange={e => {
                  const val = parseInt(e.target.value, 10);
                  if (val >= 1 && val <= numPages) setCurrentPage(val);
                }}
                className="w-10 bg-slate-800 text-center rounded py-0.5 text-white border border-slate-700 focus:outline-none"
              />
              <span className="text-slate-500">/</span>
              <span>{numPages || 1}</span>
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages || isLoading}
              className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-slate-300"
              title="Next Page (Right Arrow or J)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-800 mx-1" />

            {/* In-Document Search Toggle */}
            <button
              onClick={() => setIsSearchOpen(s => !s)}
              className={`p-1.5 rounded-lg transition ${
                isSearchOpen
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Search in PDF (/ or Ctrl+F)"
            >
              <Search className="w-3.5 h-3.5" />
            </button>

            {/* Zoom controls */}
            <button
              onClick={handleZoomOut}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleFitWidth}
              className="px-1.5 py-0.5 rounded text-[11px] font-mono hover:bg-slate-800 text-sky-400"
              title="Fit Width (F)"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={handleZoomIn}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleRotate}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300"
              title="Rotate 90° (R)"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-800 mx-1" />

            {/* Reading Mode Switcher */}
            <button
              onClick={() => setViewMode(v => (v === 'canvas' ? 'reflow' : 'canvas'))}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition font-medium text-[11px] ${
                viewMode === 'reflow'
                  ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Toggle Mobile/Responsive Reading View (Alt+R)"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{viewMode === 'reflow' ? 'Reading View' : 'Read View'}</span>
            </button>

            {/* Canvas Eye-Comfort Filter Menu */}
            <div className="relative">
              <button
                onClick={() => setShowToneMenu(m => !m)}
                className={`p-1.5 rounded-lg transition ${
                  canvasTone !== 'normal'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Canvas Eye-Comfort Tone (T)"
              >
                <Palette className="w-3.5 h-3.5" />
              </button>

              {showToneMenu && (
                <div className="absolute right-0 top-full mt-2 w-44 bg-[#0d1424] border border-slate-700 rounded-2xl shadow-2xl p-1.5 z-30 space-y-1 animate-in fade-in zoom-in-95">
                  <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Eye Comfort Tone
                  </div>
                  {[
                    { id: 'normal', label: 'Original Day', icon: Sun, color: 'text-slate-300' },
                    { id: 'invert', label: 'Night Invert', icon: Moon, color: 'text-sky-300' },
                    { id: 'sepia', label: 'Warm Sepia', icon: BookOpen, color: 'text-amber-300' },
                    { id: 'contrast', label: 'High Contrast', icon: Eye, color: 'text-emerald-300' },
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setCanvasTone(t.id as ReaderFilterTone);
                        setShowToneMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition ${
                        canvasTone === t.id
                          ? 'bg-sky-500/20 text-sky-300 font-semibold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <t.icon className={`w-3.5 h-3.5 ${t.color}`} />
                        <span>{t.label}</span>
                      </span>
                      {canvasTone === t.id && <Check className="w-3.5 h-3.5 text-sky-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right: Actions */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Mobile Reflow Reader Toggle */}
          {!isPasswordRequired && (
            <button
              onClick={() => setViewMode(v => (v === 'canvas' ? 'reflow' : 'canvas'))}
              className={`md:hidden p-2 rounded-xl transition ${
                viewMode === 'reflow'
                  ? 'bg-sky-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Reading View (Mobile Reflow)"
            >
              <BookOpen className="w-4 h-4" />
            </button>
          )}

          {/* Mobile search trigger */}
          {!isPasswordRequired && (
            <button
              onClick={() => setIsSearchOpen(s => !s)}
              className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Search"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          {/* Quick Bookmark Page Button */}
          {!isPasswordRequired && (
            <button
              onClick={() => {
                setShowThumbnails(true);
                setSidebarTab('bookmarks');
                setIsAddingBookmark(true);
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition"
              title="Bookmark Current Page (B)"
            >
              <BookmarkCheck className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={handleToggleFavorite}
            className={`p-2 rounded-xl transition ${
              docItem?.isFavorite
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Add to Favorites"
          >
            <Star className={`w-4 h-4 ${docItem?.isFavorite ? 'fill-amber-400' : ''}`} />
          </button>

          <button
            onClick={handleTogglePinned}
            className={`p-2 rounded-xl transition ${
              docItem?.isPinned
                ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Pin to Quick Access"
          >
            <Bookmark className={`w-4 h-4 ${docItem?.isPinned ? 'fill-sky-400' : ''}`} />
          </button>

          {!isPasswordRequired && (
            <button
              onClick={() => setShowThumbnails(!showThumbnails)}
              className={`p-2 rounded-xl transition ${
                showThumbnails
                  ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title="Toggle Page Navigation Drawer"
            >
              <Sidebar className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => setShowMetaPanel(!showMetaPanel)}
            className={`p-2 rounded-xl transition ${
              showMetaPanel
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Document Details & Edit"
          >
            <Info className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowShortcutsModal(true)}
            className="hidden lg:inline-flex p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Keyboard Shortcuts (?)"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <button
            onClick={handleDownload}
            className="p-2 rounded-xl text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition"
            title="Download PDF"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={handlePrint}
            className="hidden sm:inline-flex p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Print PDF"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            onClick={handleToggleFullscreen}
            className="hidden sm:inline-flex p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Close Viewer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Floating In-Document Search Toolbar Bar */}
      {isSearchOpen && (
        <div className="bg-[#0c1322] border-b border-sky-500/30 px-4 py-2.5 flex items-center justify-between gap-3 shadow-lg z-20 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2 flex-1 max-w-lg">
            <Search className="w-4 h-4 text-sky-400 shrink-0" />
            <input
              type="text"
              placeholder="Search text across document pages..."
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                handlePerformSearch(e.target.value);
              }}
              autoFocus
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
            {isSearching && <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono">
              {searchResults.length > 0 ? (
                <>
                  <span className="text-sky-300 font-semibold">{currentMatchIndex + 1}</span> of{' '}
                  <span>{searchResults.length}</span> (p. {searchResults[currentMatchIndex]?.pageNumber})
                </>
              ) : searchQuery ? (
                'No matches'
              ) : (
                'Type to find'
              )}
            </span>

            <button
              onClick={handlePrevMatch}
              disabled={searchResults.length === 0}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40"
              title="Previous Match"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              onClick={handleNextMatch}
              disabled={searchResults.length === 0}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40"
              title="Next Match"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsSearchOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Body: Sidebar Thumbnails + Canvas Viewport + Meta Drawer */}
      <div className="flex-1 flex overflow-hidden relative" ref={containerRef}>
        {/* Left Drawer: Thumbnails & Page Bookmarks */}
        {showThumbnails && numPages > 0 && !isPasswordRequired && (
          <div className="w-52 sm:w-64 shrink-0 bg-[#090e1a] border-r border-slate-800/80 p-3 overflow-y-auto flex flex-col gap-3 z-10 transition-all">
            {/* Segmented Control */}
            <div className="flex rounded-xl bg-slate-900/80 p-0.5 border border-slate-800 text-[11px] shrink-0">
              <button
                onClick={() => setSidebarTab('thumbnails')}
                className={`flex-1 py-1.5 rounded-lg font-medium transition ${
                  sidebarTab === 'thumbnails'
                    ? 'bg-sky-500/20 text-sky-300 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Pages ({numPages})
              </button>
              <button
                onClick={() => setSidebarTab('bookmarks')}
                className={`flex-1 py-1.5 rounded-lg font-medium transition flex items-center justify-center gap-1 ${
                  sidebarTab === 'bookmarks'
                    ? 'bg-sky-500/20 text-sky-300 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Bookmarks</span>
                {(docItem?.pageBookmarks?.length || 0) > 0 && (
                  <span className="font-mono text-[9px] px-1.5 py-0.2 rounded-full bg-sky-500/30 text-sky-200">
                    {docItem?.pageBookmarks?.length}
                  </span>
                )}
              </button>
            </div>

            {/* Tab 1: Thumbnails */}
            {sidebarTab === 'thumbnails' && (
              <div className="space-y-2.5">
                {Array.from({ length: numPages }, (_, i) => i + 1).map(pageIdx => {
                  const hasSearchMatch = searchResults.some(m => m.pageNumber === pageIdx);
                  const pageBookmarks = (docItem?.pageBookmarks || []).filter(b => b.pageNumber === pageIdx);
                  return (
                    <button
                      key={pageIdx}
                      onClick={() => setCurrentPage(pageIdx)}
                      className={`w-full group p-2 rounded-xl border text-left transition-all ${
                        currentPage === pageIdx
                          ? 'bg-sky-500/15 border-sky-400 shadow-md shadow-sky-500/10'
                          : hasSearchMatch
                          ? 'bg-amber-500/10 border-amber-500/40'
                          : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="aspect-[3/4] bg-white rounded-lg flex items-center justify-center text-slate-400 text-xs font-mono shadow-sm group-hover:scale-[1.02] transition-transform relative overflow-hidden">
                        {pageIdx === 1 && docItem?.thumbnailDataUrl ? (
                          <img
                            src={docItem.thumbnailDataUrl}
                            alt="Page 1"
                            className="w-full h-full object-cover rounded-lg"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-slate-400">
                            <FileText className="w-5 h-5" />
                            <span className="text-[10px]">p. {pageIdx}</span>
                          </div>
                        )}
                        {pageBookmarks.length > 0 && (
                          <div className="absolute top-1 right-1 flex gap-0.5">
                            {pageBookmarks.map(b => (
                              <span
                                key={b.id}
                                className="w-2.5 h-2.5 rounded-full shadow-sm border border-black/40"
                                style={{ backgroundColor: b.color || '#38bdf8' }}
                                title={b.title}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[11px]">
                        <span
                          className={`font-medium ${
                            currentPage === pageIdx ? 'text-sky-300 font-semibold' : 'text-slate-400'
                          }`}
                        >
                          Page {pageIdx}
                        </span>
                        {hasSearchMatch && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Search match" />
                        )}
                        {currentPage === pageIdx && !hasSearchMatch && (
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Tab 2: Bookmarks & Sticky Notes */}
            {sidebarTab === 'bookmarks' && (
              <div className="space-y-3">
                {/* Add Bookmark Action */}
                {!isAddingBookmark ? (
                  <button
                    onClick={() => {
                      setBookmarkTitle(`Page ${currentPage}`);
                      setBookmarkNote('');
                      setIsAddingBookmark(true);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-semibold text-xs transition"
                  >
                    <BookmarkCheck className="w-3.5 h-3.5" />
                    <span>Bookmark Page {currentPage}</span>
                  </button>
                ) : (
                  <form onSubmit={handleAddBookmark} className="p-3 rounded-2xl bg-slate-900 border border-sky-500/40 space-y-2.5 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-sky-300 flex items-center gap-1">
                        <Bookmark className="w-3 h-3" />
                        <span>Bookmark Page {currentPage}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsAddingBookmark(false)}
                        className="text-slate-500 hover:text-white text-xs"
                      >
                        ✕
                      </button>
                    </div>

                    <div>
                      <input
                        type="text"
                        placeholder="Bookmark label (e.g. Exam slot)"
                        value={bookmarkTitle}
                        onChange={e => setBookmarkTitle(e.target.value)}
                        autoFocus
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
                      />
                    </div>

                    <div>
                      <textarea
                        placeholder="Add personal note (optional)..."
                        value={bookmarkNote}
                        onChange={e => setBookmarkNote(e.target.value)}
                        rows={2}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-400 resize-none"
                      />
                    </div>

                    {/* Color Picker Chips */}
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-slate-400 mr-1">Color:</span>
                      {['#38bdf8', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'].map(col => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => setBookmarkColor(col)}
                          className={`w-5 h-5 rounded-full transition-transform ${
                            bookmarkColor === col ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-slate-900' : 'hover:scale-110'
                          }`}
                          style={{ backgroundColor: col }}
                        />
                      ))}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAddingBookmark(false)}
                        className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-400 font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingBookmark}
                        className="flex-1 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-[11px] disabled:opacity-50"
                      >
                        {isSavingBookmark ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Bookmark Items List */}
                <div className="space-y-2">
                  {(docItem?.pageBookmarks || []).length === 0 ? (
                    <div className="text-center py-6 px-2 text-slate-500 space-y-2">
                      <BookmarkCheck className="w-8 h-8 opacity-30 mx-auto text-sky-400" />
                      <p className="text-xs">No bookmarks yet.</p>
                      <p className="text-[10px] text-slate-500">
                        Mark important sections, exam dates, or study notes for fast 1-click access.
                      </p>
                    </div>
                  ) : (
                    (docItem?.pageBookmarks || []).map(bm => (
                      <div
                        key={bm.id}
                        className={`p-2.5 rounded-xl border transition group ${
                          currentPage === bm.pageNumber
                            ? 'bg-sky-500/10 border-sky-500/40'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <button
                            onClick={() => setCurrentPage(bm.pageNumber)}
                            className="flex-1 text-left min-w-0"
                          >
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: bm.color || '#38bdf8' }}
                              />
                              <span className="text-[10px] font-mono font-bold text-sky-300 bg-sky-500/10 px-1.5 py-0.2 rounded">
                                p. {bm.pageNumber}
                              </span>
                              <span className="text-xs font-semibold text-white truncate">
                                {bm.title}
                              </span>
                            </div>
                            {bm.note && (
                              <p className="text-[11px] text-slate-300 mt-1 line-clamp-2 italic pl-4">
                                "{bm.note}"
                              </p>
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteBookmark(bm.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition"
                            title="Delete bookmark"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Center Canvas Viewport with Touch Swiping */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="flex-1 bg-[#050811] overflow-auto flex items-center justify-center p-3 sm:p-4 relative"
        >
          {isPasswordRequired ? (
            /* Password Dialog */
            <div className="max-w-md w-full p-6 sm:p-8 rounded-3xl bg-[#0c1220] border border-amber-500/30 shadow-2xl text-center space-y-4 animate-in zoom-in-95">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <Lock className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Password Protected PDF</h3>
                <p className="text-xs text-slate-400 mt-1">
                  This document is encrypted. Enter the correct password to unlock and read it.
                </p>
              </div>

              <form onSubmit={handleUnlockPassword} className="space-y-3 pt-2">
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPasswordText ? 'text' : 'password'}
                    placeholder="Enter document password..."
                    value={passwordInput}
                    onChange={e => setPasswordInput(e.target.value)}
                    autoFocus
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showPasswordText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {passwordError && (
                  <p className="text-xs text-rose-400 flex items-center justify-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{passwordError}</span>
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isVerifyingPassword || !passwordInput}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs disabled:opacity-50 transition flex items-center justify-center gap-2"
                  >
                    {isVerifyingPassword ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    ) : (
                      <span>Unlock</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
              <p className="text-sm font-medium">Rendering PDF pages...</p>
            </div>
          ) : error ? (
            <div className="max-w-md p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-white">Could not open PDF</h3>
              <p className="text-xs text-rose-300/90">{error}</p>
              <div className="pt-2 flex justify-center gap-3">
                <button
                  onClick={() => renderPage(currentPage)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-white hover:bg-slate-700"
                >
                  Retry
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-rose-500/20 text-xs text-rose-300 hover:bg-rose-500/30"
                >
                  Close
                </button>
              </div>
            </div>
          ) : viewMode === 'reflow' ? (
            /* Responsive Text Reflow Reader View */
            <div className="w-full max-w-3xl mx-auto h-full flex flex-col justify-start py-4 px-2 sm:px-6">
              {/* Reader Sub-Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-2xl bg-[#0d1424] border border-slate-800 text-xs mb-4 shadow-xl shrink-0">
                {/* Theme Palette Switcher */}
                <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
                  {[
                    { id: 'day', label: 'Day', bg: 'bg-slate-100 text-slate-900' },
                    { id: 'sepia', label: 'Sepia', bg: 'bg-[#fbf0d9] text-[#3d2b1f]' },
                    { id: 'slate', label: 'Dark', bg: 'bg-slate-800 text-slate-200' },
                    { id: 'oled', label: 'OLED', bg: 'bg-black text-slate-100 border border-slate-800' },
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setReflowTheme(t.id as 'day' | 'sepia' | 'slate' | 'oled')}
                      className={`px-2 py-1 rounded-lg text-[11px] font-medium transition ${
                        reflowTheme === t.id
                          ? `${t.bg} font-bold shadow-sm ring-1 ring-sky-400/50`
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Font Size & Family Controls */}
                <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setReflowFontSize(s => Math.max(13, s - 1))}
                    className="p-1 px-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                    title="Smaller Text"
                  >
                    <Type className="w-3.5 h-3.5" />-
                  </button>
                  <span className="font-mono text-[11px] text-sky-400 px-1">{reflowFontSize}px</span>
                  <button
                    onClick={() => setReflowFontSize(s => Math.min(26, s + 1))}
                    className="p-1 px-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                    title="Larger Text"
                  >
                    <Type className="w-3.5 h-3.5" />+
                  </button>

                  <div className="w-px h-3 bg-slate-800 mx-0.5" />

                  <button
                    onClick={() => {
                      const next =
                        reflowFontFamily === 'sans' ? 'serif' : reflowFontFamily === 'serif' ? 'mono' : 'sans';
                      setReflowFontFamily(next);
                    }}
                    className="px-2 py-0.5 rounded-lg text-[11px] text-slate-300 hover:bg-slate-800 uppercase font-mono"
                    title="Switch Font Family"
                  >
                    {reflowFontFamily}
                  </button>
                </div>

                {/* TTS Read Aloud & Copy Actions */}
                <div className="flex items-center gap-1.5">
                  {/* TTS Read Aloud */}
                  <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
                    {!isSpeaking || isSpeechPaused ? (
                      <button
                        onClick={handlePlayTTS}
                        disabled={!reflowText.trim()}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-medium text-[11px] disabled:opacity-40 transition"
                        title="Listen to this page (Read Aloud)"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>{isSpeechPaused ? 'Resume' : 'Listen'}</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handlePauseTTS}
                          className="p-1 rounded-lg text-amber-400 hover:bg-slate-800 transition"
                          title="Pause Speech"
                        >
                          <Pause className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={handleStopTTS}
                          className="p-1 rounded-lg text-rose-400 hover:bg-slate-800 transition"
                          title="Stop Speech"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[10px] text-emerald-400 font-mono animate-pulse px-1">Speaking</span>
                      </div>
                    )}

                    <select
                      value={speechRate}
                      onChange={e => setSpeechRate(parseFloat(e.target.value))}
                      className="bg-transparent text-[10px] font-mono text-slate-400 focus:outline-none cursor-pointer pr-1"
                      title="Speech Rate"
                    >
                      <option value="0.8" className="bg-slate-900 text-white">0.8x</option>
                      <option value="1" className="bg-slate-900 text-white">1.0x</option>
                      <option value="1.25" className="bg-slate-900 text-white">1.25x</option>
                      <option value="1.5" className="bg-slate-900 text-white">1.5x</option>
                    </select>
                  </div>

                  {/* Copy Text Button */}
                  <button
                    onClick={handleCopyReflowText}
                    disabled={!reflowText.trim()}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-[11px] transition disabled:opacity-40"
                    title="Copy Page Text"
                  >
                    {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedText ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Text Body Container */}
              <div
                className={`flex-1 overflow-y-auto rounded-3xl p-6 sm:p-10 shadow-2xl transition-colors ${
                  reflowTheme === 'day'
                    ? 'bg-[#fcfdfd] text-[#0f172a] shadow-slate-900/10'
                    : reflowTheme === 'sepia'
                    ? 'bg-[#fcf5e5] text-[#3d2b1f] shadow-amber-950/20'
                    : reflowTheme === 'oled'
                    ? 'bg-black text-[#e2e8f0] border border-neutral-900'
                    : 'bg-[#0b101d] text-slate-200 border border-slate-800'
                }`}
                style={{
                  fontSize: `${reflowFontSize}px`,
                  fontFamily:
                    reflowFontFamily === 'serif'
                      ? 'Georgia, Cambria, "Times New Roman", Times, serif'
                      : reflowFontFamily === 'mono'
                      ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
                      : 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  lineHeight: '1.75',
                }}
              >
                {isLoadingReflow ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                    <p className="text-xs">Extracting readable text from Page {currentPage}...</p>
                  </div>
                ) : reflowText.trim().length > 0 ? (
                  <div className="space-y-4 select-text">
                    <div className="pb-3 border-b border-black/10 dark:border-white/10 flex items-center justify-between text-xs opacity-60">
                      <span>{docItem?.displayName}</span>
                      <span className="font-mono">Page {currentPage} of {numPages}</span>
                    </div>
                    {reflowText.split(/\n\n+/).map((para, idx) => (
                      <p key={idx} className="leading-relaxed">
                        {para}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-center gap-3 max-w-sm mx-auto">
                    <BookOpen className="w-8 h-8 opacity-40 text-sky-400" />
                    <div>
                      <p className="font-semibold text-sm">No selectable digital text on Page {currentPage}</p>
                      <p className="text-xs opacity-70 mt-1">
                        This page appears to be a scanned image or artwork. Switch back to Canvas View to inspect it directly.
                      </p>
                    </div>
                    <button
                      onClick={() => setViewMode('canvas')}
                      className="px-4 py-2 rounded-xl bg-sky-500/20 text-sky-300 font-semibold text-xs hover:bg-sky-500/30 transition"
                    >
                      Switch to Canvas View
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="shadow-2xl shadow-black/80 rounded-md overflow-hidden my-auto transition-transform">
              <canvas
                ref={canvasRef}
                style={{ filter: getCanvasToneFilter() }}
                className="block max-w-full"
              />
            </div>
          )}
        </div>

        {/* Right Details & Edit Panel */}
        {showMetaPanel && docItem && (
          <div className="w-80 shrink-0 bg-[#0c1220] border-l border-slate-800/80 p-5 overflow-y-auto space-y-5 z-10 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Info className="w-4 h-4 text-sky-400" />
                Document Info
              </h3>
              <button
                onClick={() => setShowMetaPanel(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Edit Title */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Display Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-sky-400" />
                Collection
              </label>
              <select
                value={editCategory}
                onChange={e => setEditCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
              >
                {collections.map(col => (
                  <option key={col.id} value={col.id}>
                    {col.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-sky-400" />
                Tags
              </label>
              <div className="flex gap-1.5 mb-2">
                <input
                  type="text"
                  placeholder="New tag..."
                  value={newTagInput}
                  onChange={e => setNewTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs text-slate-200"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {editTags.map(t => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-sky-300 text-[11px]"
                  >
                    #{t}
                    <button
                      type="button"
                      onClick={() => setEditTags(editTags.filter(item => item !== t))}
                      className="hover:text-rose-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Notes / Description</label>
              <textarea
                rows={3}
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 resize-none"
              />
            </div>

            {/* Technical Metadata summary */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] space-y-1.5 text-slate-400">
              <div className="flex justify-between">
                <span>Total Pages:</span>
                <span className="font-mono text-white">{numPages}</span>
              </div>
              <div className="flex justify-between">
                <span>File Size:</span>
                <span className="font-mono text-white">{formatBytes(docItem.fileSize)}</span>
              </div>
              <div className="flex justify-between">
                <span>Imported:</span>
                <span className="text-slate-300">
                  {new Date(docItem.importedAt).toLocaleDateString()}
                </span>
              </div>
              {docItem.fileHash && (
                <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                  <span>SHA-256:</span>
                  <span
                    className="font-mono text-[10px] text-slate-500 truncate max-w-[140px]"
                    title={docItem.fileHash}
                  >
                    {docItem.fileHash.substring(0, 16)}...
                  </span>
                </div>
              )}
            </div>

            {/* Save Button */}
            <div className="pt-2">
              <button
                onClick={handleSaveMetadata}
                disabled={isSavingMeta}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs shadow-md shadow-sky-500/20 transition disabled:opacity-50"
              >
                {metaSavedNotice ? (
                  <>
                    <Check className="w-4 h-4 text-slate-950" />
                    <span>Saved!</span>
                  </>
                ) : isSavingMeta ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Update Details</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Bar for Page Navigation */}
      {!isPasswordRequired && (
        <div className="md:hidden h-12 bg-[#0c1220] border-t border-slate-800 px-4 flex items-center justify-between text-xs z-20">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="flex items-center gap-1 p-1.5 text-slate-300 disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev</span>
          </button>

          <span className="font-mono text-slate-300 text-xs">
            {currentPage} / {numPages || 1}
          </span>

          <button
            onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
            className="flex items-center gap-1 p-1.5 text-slate-300 disabled:opacity-30"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Keyboard Shortcuts Cheat Sheet Modal */}
      {showShortcutsModal && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#0c1220] border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-sky-400" />
                Reader Keyboard Shortcuts
              </h3>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">Next Page</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-sky-300">
                  → / J
                </kbd>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">Prev Page</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-sky-300">
                  ← / K
                </kbd>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">Zoom In</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-sky-300">
                  +
                </kbd>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">Zoom Out</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-sky-300">
                  -
                </kbd>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">Fit Width</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-sky-300">
                  F
                </kbd>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">Rotate</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-sky-300">
                  R
                </kbd>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">Reading View</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-sky-300">
                  Alt + R
                </kbd>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">Bookmark</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-sky-300">
                  B
                </kbd>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">Eye Comfort</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-sky-300">
                  T
                </kbd>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">Find Text</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-sky-300">
                  / or Ctrl+F
                </kbd>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                <span className="text-slate-400">Close</span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] text-sky-300">
                  Esc
                </kbd>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 text-center">
              On mobile touchscreens, swipe left or right to seamlessly turn pages.
            </p>

            <button
              onClick={() => setShowShortcutsModal(false)}
              className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
