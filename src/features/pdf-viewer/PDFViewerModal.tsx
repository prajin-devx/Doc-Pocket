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
} from 'lucide-react';
import { CollectionItem, DocumentItem } from '../../types';
import { documentService } from '../../lib/document-service';
import { collectionService } from '../../lib/collection-service';
import { formatBytes } from '../../lib/storage-service';

interface PDFViewerModalProps {
  documentId: string | null;
  onClose: () => void;
  onDocumentUpdated?: () => void;
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

  // Editable fields in reader
  const [editTitle, setEditTitle] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [isSavingMeta, setIsSavingMeta] = useState<boolean>(false);
  const [metaSavedNotice, setMetaSavedNotice] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Load document metadata and binary
  useEffect(() => {
    if (!documentId) return;

    let isCancelled = false;
    setIsLoading(true);
    setError(null);
    setCurrentPage(1);
    setRotation(0);

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
      } catch (err) {
        if (!isCancelled) {
          console.error('Error loading PDF in reader:', err);
          setError(err instanceof Error ? err.message : 'Failed to render PDF document');
          setIsLoading(false);
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
        if (err && typeof err === 'object' && 'name' in err && err.name !== 'RenderingCancelledException') {
          console.warn('Canvas render error:', err);
        }
      }
    },
    [pdfDoc, scale, rotation]
  );

  useEffect(() => {
    if (pdfDoc && !isLoading && !error) {
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage, scale, rotation, isLoading, error, renderPage]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        setCurrentPage(p => Math.min(numPages, p + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setCurrentPage(p => Math.max(1, p - 1));
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        setScale(s => Math.min(3, +(s + 0.15).toFixed(2)));
      } else if (e.key === '-') {
        setScale(s => Math.max(0.4, +(s - 0.15).toFixed(2)));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [numPages, onClose]);

  const handleZoomIn = () => setScale(s => Math.min(3, +(s + 0.2).toFixed(2)));
  const handleZoomOut = () => setScale(s => Math.max(0.4, +(s - 0.2).toFixed(2)));
  const handleRotate = () => setRotation(r => (r + 90) % 360);

  const handleFitWidth = () => {
    if (!containerRef.current || !pdfDoc) return;
    pdfDoc.getPage(currentPage).then(page => {
      const naturalViewport = page.getViewport({ scale: 1, rotation });
      const availableWidth = (containerRef.current?.clientWidth || 800) - (showThumbnails ? 260 : 40);
      const newScale = Math.max(0.4, Math.min(2.5, (availableWidth - 40) / naturalViewport.width));
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
      <div className="h-14 px-4 bg-[#0c1220] border-b border-slate-800/80 flex items-center justify-between gap-3 shrink-0 z-20">
        {/* Left: Close & Title */}
        <div className="flex items-center gap-3 overflow-hidden min-w-0">
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
              <h1 className="text-sm font-semibold text-white truncate">
                {docItem?.displayName || 'Loading document...'}
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

        {/* Center: Pagination & Zoom Controls (Hidden on very small screens, responsive) */}
        <div className="hidden md:flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl p-1 text-xs">
          {/* Page navigation */}
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1 || isLoading}
            className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-40 text-slate-300"
            title="Previous Page (Left Arrow)"
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
            title="Next Page (Right Arrow)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

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
            title="Fit Width"
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
            title="Rotate 90° Clockwise"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
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

      {/* Main Body: Sidebar Thumbnails + Canvas Viewport + Meta Drawer */}
      <div className="flex-1 flex overflow-hidden relative" ref={containerRef}>
        {/* Left Thumbnails Drawer */}
        {showThumbnails && numPages > 0 && (
          <div className="w-44 sm:w-56 shrink-0 bg-[#090e1a] border-r border-slate-800/80 p-3 overflow-y-auto flex flex-col gap-3 z-10 transition-all">
            <div className="text-xs font-semibold text-slate-400 px-1 uppercase tracking-wider flex items-center justify-between">
              <span>Pages</span>
              <span className="font-mono text-[11px] text-sky-400">{numPages}</span>
            </div>
            <div className="space-y-2.5">
              {Array.from({ length: numPages }, (_, i) => i + 1).map(pageIdx => (
                <button
                  key={pageIdx}
                  onClick={() => setCurrentPage(pageIdx)}
                  className={`w-full group p-2 rounded-xl border text-left transition-all ${
                    currentPage === pageIdx
                      ? 'bg-sky-500/15 border-sky-400 shadow-md shadow-sky-500/10'
                      : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="aspect-[3/4] bg-white rounded-lg flex items-center justify-center text-slate-400 text-xs font-mono shadow-sm group-hover:scale-[1.02] transition-transform">
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
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px]">
                    <span
                      className={`font-medium ${
                        currentPage === pageIdx ? 'text-sky-300 font-semibold' : 'text-slate-400'
                      }`}
                    >
                      Page {pageIdx}
                    </span>
                    {currentPage === pageIdx && (
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Center Canvas Viewport */}
        <div className="flex-1 bg-[#050811] overflow-auto flex items-center justify-center p-4 relative">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
              <p className="text-sm">Rendering PDF pages...</p>
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
          ) : (
            <div className="shadow-2xl shadow-black/80 rounded-md overflow-hidden my-auto transition-transform">
              <canvas ref={canvasRef} className="block max-w-full" />
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
                  <span className="font-mono text-[10px] text-slate-500 truncate max-w-[140px]" title={docItem.fileHash}>
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
    </div>
  );
};
