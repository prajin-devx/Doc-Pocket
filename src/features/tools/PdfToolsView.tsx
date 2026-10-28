import React, { useState, useRef, useEffect } from 'react';
import {
  FileImage,
  Minimize2,
  UploadCloud,
  Trash2,
  RotateCw,
  ArrowUp,
  ArrowDown,
  Download,
  FolderPlus,
  Eye,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sliders,
  Sparkles,
  Layers,
  RefreshCw,
  HardDrive,
  Check,
  ChevronRight,
  ArrowRight,
  Scissors
} from 'lucide-react';
import {
  ImageToPdfItem,
  ImageToPdfOptions,
  PageSizePreset,
  PageOrientation,
  PageMargin,
  ImageFitMode,
  QualityPreset,
  CompressionPreset,
  CompressionOptions,
  CompressionResult,
  loadImageDimensions,
  convertImagesToPdf,
  compressPdfDocument,
} from '../../lib/pdf-tools-service';
import { CollectionItem, DocumentItem } from '../../types';
import { documentService } from '../../lib/document-service';
import { formatBytes } from '../../lib/storage-service';

interface PdfToolsViewProps {
  collections: CollectionItem[];
  documents: DocumentItem[];
  onOpenDocument: (doc: DocumentItem) => void;
  onRefreshVault: () => void;
  initialTab?: 'image-to-pdf' | 'compressor';
}

export function PdfToolsView({
  collections,
  documents,
  onOpenDocument,
  onRefreshVault,
  initialTab = 'image-to-pdf',
}: PdfToolsViewProps) {
  const [activeTool, setActiveTool] = useState<'image-to-pdf' | 'compressor'>(initialTab);

  // ---------------------------------------------------------------------------
  // 1. IMAGE TO PDF STATE
  // ---------------------------------------------------------------------------
  const [images, setImages] = useState<ImageToPdfItem[]>([]);
  const [pdfTitle, setPdfTitle] = useState<string>('DocPocket-Images');
  const [targetCollection, setTargetCollection] = useState<string>('inbox');
  const [pageSize, setPageSize] = useState<PageSizePreset>('a4');
  const [orientation, setOrientation] = useState<PageOrientation>('auto');
  const [margin, setMargin] = useState<PageMargin>('narrow');
  const [fitMode, setFitMode] = useState<ImageFitMode>('contain');
  const [quality, setQuality] = useState<QualityPreset>('high');

  const [isConverting, setIsConverting] = useState(false);
  const [convertProgress, setConvertProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [convertedResult, setConvertedResult] = useState<{
    bytes: Uint8Array;
    fileName: string;
    size: number;
    savedDocId?: string;
  } | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach(img => URL.revokeObjectURL(img.previewUrl));
    };
  }, []);

  const handleSelectImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setConvertError(null);
    const files = Array.from(e.target.files);

    const newItems: ImageToPdfItem[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const { width, height, previewUrl } = await loadImageDimensions(file);
        newItems.push({
          id: `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          file,
          previewUrl,
          width,
          height,
          rotation: 0,
        });
      } catch (err) {
        console.warn('Failed to load image:', file.name, err);
      }
    }

    if (newItems.length > 0) {
      setImages(prev => [...prev, ...newItems]);
      if (images.length === 0 && newItems.length > 0) {
        // Set default title based on first image name
        const base = newItems[0].file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setPdfTitle(base || 'DocPocket-Images');
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRotateImage = (id: string) => {
    setImages(prev =>
      prev.map(img => (img.id === id ? { ...img, rotation: (img.rotation + 90) % 360 } : img))
    );
  };

  const handleMoveImage = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === images.length - 1)
    ) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    setImages(prev => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleRemoveImage = (id: string) => {
    setImages(prev => {
      const found = prev.find(item => item.id === id);
      if (found) {
        URL.revokeObjectURL(found.previewUrl);
      }
      return prev.filter(item => item.id !== id);
    });
  };

  const handleStartConversion = async () => {
    if (images.length === 0) {
      setConvertError('Please select at least one image.');
      return;
    }

    setIsConverting(true);
    setConvertError(null);
    setConvertedResult(null);

    try {
      const options: ImageToPdfOptions = {
        pageSize,
        orientation,
        margin,
        fitMode,
        quality,
        title: pdfTitle.trim(),
      };

      const pdfBytes = await convertImagesToPdf(images, options, (current, total) => {
        setConvertProgress({ current, total });
      });

      const cleanFileName = (pdfTitle.trim() || 'DocPocket-Images').endsWith('.pdf')
        ? pdfTitle.trim()
        : `${pdfTitle.trim()}.pdf`;

      setConvertedResult({
        bytes: pdfBytes,
        fileName: cleanFileName,
        size: pdfBytes.byteLength,
      });
    } catch (err) {
      console.error('Image to PDF error:', err);
      setConvertError(err instanceof Error ? err.message : 'Failed to convert images to PDF');
    } finally {
      setIsConverting(false);
    }
  };

  const handleSaveConvertedToVault = async () => {
    if (!convertedResult) return;
    try {
      // Use buffer of the converted pdf
      const arrayBuffer = convertedResult.bytes.buffer.slice(
        convertedResult.bytes.byteOffset,
        convertedResult.bytes.byteOffset + convertedResult.bytes.byteLength
      );

      const importRes = await documentService.importArrayBuffer(
        arrayBuffer as ArrayBuffer,
        convertedResult.fileName,
        convertedResult.size,
        {
          category: targetCollection,
          tags: ['image-to-pdf', 'converted'],
          description: `Converted from ${images.length} images using DocPocket PDF Studio.`,
        }
      );

      setConvertedResult(prev => (prev ? { ...prev, savedDocId: importRes.document.id } : null));
      onRefreshVault();
    } catch (err) {
      alert('Could not save to Vault: ' + (err instanceof Error ? err.message : 'Error'));
    }
  };

  const handleDownloadConverted = () => {
    if (!convertedResult) return;
    const blob = new Blob([new Uint8Array(convertedResult.bytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = convertedResult.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ---------------------------------------------------------------------------
  // 2. PDF COMPRESSOR STATE
  // ---------------------------------------------------------------------------
  const [selectedSourceType, setSelectedSourceType] = useState<'upload' | 'vault'>('upload');
  const [selectedVaultDocId, setSelectedVaultDocId] = useState<string>('');
  const [compressFile, setCompressFile] = useState<File | null>(null);
  const [compressFileName, setCompressFileName] = useState<string>('');
  const [compressOriginalSize, setCompressOriginalSize] = useState<number>(0);
  const [compressBuffer, setCompressBuffer] = useState<ArrayBuffer | null>(null);

  const [compressPreset, setCompressPreset] = useState<CompressionPreset>('balanced');
  const [customDpi, setCustomDpi] = useState<number>(140);
  const [customQuality, setCustomQuality] = useState<number>(70);

  const [isCompressing, setIsCompressing] = useState(false);
  const [compressProgress, setCompressProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [compressionResult, setCompressionResult] = useState<CompressionResult | null>(null);
  const [compressError, setCompressError] = useState<string | null>(null);
  const [savedCompressedDocId, setSavedCompressedDocId] = useState<string | null>(null);

  const compressFileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectCompressFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setCompressError(null);
    setCompressionResult(null);
    setSavedCompressedDocId(null);

    const file = e.target.files[0];
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setCompressError('Please select a valid PDF file.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      setCompressFile(file);
      setCompressFileName(file.name);
      setCompressOriginalSize(file.size);
      setCompressBuffer(buffer);
    } catch (err) {
      setCompressError('Could not read the PDF file: ' + (err instanceof Error ? err.message : 'Error'));
    }

    if (compressFileInputRef.current) {
      compressFileInputRef.current.value = '';
    }
  };

  const handleSelectVaultDoc = async (docId: string) => {
    setSelectedVaultDocId(docId);
    setCompressError(null);
    setCompressionResult(null);
    setSavedCompressedDocId(null);

    if (!docId) {
      setCompressBuffer(null);
      setCompressFileName('');
      setCompressOriginalSize(0);
      return;
    }

    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    try {
      const binary = await documentService.getDocumentBinary(docId);
      if (!binary) {
        throw new Error('PDF binary could not be found in local vault.');
      }
      setCompressFileName(doc.fileName);
      setCompressOriginalSize(doc.fileSize);
      setCompressBuffer(binary);
    } catch (err) {
      setCompressError('Failed to load document from Vault: ' + (err instanceof Error ? err.message : 'Error'));
    }
  };

  const handleStartCompression = async () => {
    if (!compressBuffer) {
      setCompressError('Please upload or select a PDF first.');
      return;
    }

    setIsCompressing(true);
    setCompressError(null);
    setCompressionResult(null);
    setSavedCompressedDocId(null);

    try {
      let targetDpi = 140;
      let jpegQuality = 0.70;

      if (compressPreset === 'extreme') {
        targetDpi = 100;
        jpegQuality = 0.50;
      } else if (compressPreset === 'balanced') {
        targetDpi = 140;
        jpegQuality = 0.70;
      } else if (compressPreset === 'light') {
        targetDpi = 180;
        jpegQuality = 0.85;
      } else {
        targetDpi = customDpi;
        jpegQuality = customQuality / 100;
      }

      const options: CompressionOptions = {
        preset: compressPreset,
        targetDpi,
        jpegQuality,
      };

      const result = await compressPdfDocument(compressBuffer, options, (current, total) => {
        setCompressProgress({ current, total });
      });

      setCompressionResult(result);
    } catch (err) {
      console.error('Compression error:', err);
      setCompressError(err instanceof Error ? err.message : 'PDF compression failed');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDownloadCompressed = () => {
    if (!compressionResult) return;
    const blob = new Blob([new Uint8Array(compressionResult.compressedBytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = compressFileName.replace(/\.pdf$/i, '');
    a.download = `${baseName}-compressed.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleSaveCompressedToVault = async () => {
    if (!compressionResult) return;
    try {
      const baseName = compressFileName.replace(/\.pdf$/i, '');
      const newName = `${baseName}-compressed.pdf`;

      const arrayBuffer = compressionResult.compressedBytes.buffer.slice(
        compressionResult.compressedBytes.byteOffset,
        compressionResult.compressedBytes.byteOffset + compressionResult.compressedBytes.byteLength
      );

      const importRes = await documentService.importArrayBuffer(
        arrayBuffer as ArrayBuffer,
        newName,
        compressionResult.compressedSize,
        {
          category: 'inbox',
          tags: ['compressed', `${compressionResult.reductionPercentage}%-smaller`],
          description: `Optimized from ${formatBytes(compressionResult.originalSize)} to ${formatBytes(
            compressionResult.compressedSize
          )} (${compressionResult.reductionPercentage}% reduction).`,
        }
      );

      setSavedCompressedDocId(importRes.document.id);
      onRefreshVault();
    } catch (err) {
      alert('Could not save to Vault: ' + (err instanceof Error ? err.message : 'Error'));
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Top Banner & Tool Navigation Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-slate-900/90 via-[#0c1322] to-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                PDF Studio Tools
              </h1>
              <p className="text-xs text-slate-400">
                100% On-device image conversion & smart PDF compression. Zero cloud upload.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center p-1 bg-slate-950/80 rounded-2xl border border-slate-800 self-start sm:self-auto">
          <button
            onClick={() => setActiveTool('image-to-pdf')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTool === 'image-to-pdf'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileImage className="w-4 h-4" />
            <span>Image to PDF</span>
            {images.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">
                {images.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTool('compressor')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTool === 'compressor'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Minimize2 className="w-4 h-4" />
            <span>PDF Compressor</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. IMAGE TO PDF CONVERTER TAB */}
      {/* ========================================================================= */}
      {activeTool === 'image-to-pdf' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Image Dropzone & Reorderable List */}
          <div className="lg:col-span-2 space-y-4">
            {/* Upload Box */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-800 hover:border-sky-500/60 rounded-3xl p-6 sm:p-8 bg-[#0a0f1d]/50 hover:bg-[#0c1427]/60 transition cursor-pointer text-center group flex flex-col items-center justify-center gap-3"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/jpg,image/bmp"
                onChange={handleSelectImages}
                className="hidden"
              />
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 text-sky-400 group-hover:scale-110 group-hover:bg-sky-500/20 transition duration-200 flex items-center justify-center">
                <FileImage className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition">
                  Click to select images or drag and drop
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Supports JPG, PNG, WEBP, and BMP • Select multiple images
                </p>
              </div>
              <button
                type="button"
                className="mt-1 px-4 py-1.5 rounded-xl bg-slate-800 group-hover:bg-sky-500 group-hover:text-white text-xs font-medium text-slate-300 transition"
              >
                Browse Images
              </button>
            </div>

            {/* Error Message */}
            {convertError && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{convertError}</span>
              </div>
            )}

            {/* Image List / Cards */}
            {images.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-slate-300">
                    Selected Images ({images.length} pages in order)
                  </span>
                  <button
                    onClick={() => setImages([])}
                    className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear all</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {images.map((item, index) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800/80 hover:border-slate-700 flex items-center gap-3 transition group"
                    >
                      {/* Image Thumbnail with rotation indicator */}
                      <div className="relative w-16 h-20 rounded-xl overflow-hidden bg-slate-950 shrink-0 border border-slate-800 flex items-center justify-center">
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          style={{
                            transform: `rotate(${item.rotation}deg)`,
                            transition: 'transform 0.2s ease',
                          }}
                          className="max-w-full max-h-full object-contain"
                        />
                        <span className="absolute top-1 left-1 bg-black/70 backdrop-blur-xs text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">
                          #{index + 1}
                        </span>
                      </div>

                      {/* Details & Actions */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate" title={item.file.name}>
                          {item.file.name}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {item.width} × {item.height} px • {formatBytes(item.file.size)}
                        </p>

                        <div className="flex items-center gap-1 mt-2">
                          <button
                            onClick={() => handleRotateImage(item.id)}
                            className="p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition text-[10px] flex items-center gap-1 px-1.5"
                            title="Rotate 90° clockwise"
                          >
                            <RotateCw className="w-3 h-3 text-sky-400" />
                            <span>{item.rotation !== 0 ? `${item.rotation}°` : 'Rotate'}</span>
                          </button>

                          <button
                            disabled={index === 0}
                            onClick={() => handleMoveImage(index, 'up')}
                            className="p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>

                          <button
                            disabled={index === images.length - 1}
                            onClick={() => handleMoveImage(index, 'down')}
                            className="p-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleRemoveImage(item.id)}
                            className="p-1 rounded-lg bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition ml-auto"
                            title="Remove image"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-8 rounded-2xl bg-slate-900/30 border border-slate-800/50 text-center text-slate-500 text-xs">
                No images added yet. Click browse or drag photos above to begin creating your PDF.
              </div>
            )}
          </div>

          {/* Right Column: PDF Settings & Generation */}
          <div className="space-y-4">
            <div className="p-5 rounded-3xl bg-slate-900/70 border border-slate-800 space-y-4">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-sky-400" />
                <span>PDF Document Settings</span>
              </h2>

              {/* Title / Filename */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Document Name</label>
                <div className="relative">
                  <input
                    type="text"
                    value={pdfTitle}
                    onChange={e => setPdfTitle(e.target.value)}
                    placeholder="My Document"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-medium"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-mono">
                    .pdf
                  </span>
                </div>
              </div>

              {/* Target Collection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Save to Vault Collection</label>
                <select
                  value={targetCollection}
                  onChange={e => setTargetCollection(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                >
                  {collections.map(col => (
                    <option key={col.id} value={col.id}>
                      {col.name} {col.id === 'timetable' ? '(Timetable PDFs)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Page Format */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Page Size</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['a4', 'letter', 'fit'] as PageSizePreset[]).map(ps => (
                    <button
                      key={ps}
                      type="button"
                      onClick={() => setPageSize(ps)}
                      className={`py-1.5 px-2 rounded-xl text-xs font-medium transition capitalize ${
                        pageSize === ps
                          ? 'bg-sky-500 text-white font-bold'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {ps === 'fit' ? 'Fit Image' : ps.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Orientation */}
              {pageSize !== 'fit' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Orientation</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['auto', 'portrait', 'landscape'] as PageOrientation[]).map(ori => (
                      <button
                        key={ori}
                        type="button"
                        onClick={() => setOrientation(ori)}
                        className={`py-1.5 px-2 rounded-xl text-xs font-medium transition capitalize ${
                          orientation === ori
                            ? 'bg-sky-500 text-white font-bold'
                            : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {ori}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Margins */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Margins</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['none', 'narrow', 'normal'] as PageMargin[]).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMargin(m)}
                      className={`py-1.5 px-2 rounded-xl text-xs font-medium transition capitalize ${
                        margin === m
                          ? 'bg-sky-500 text-white font-bold'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality Preset */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Image Compression</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['high', 'medium', 'low'] as QualityPreset[]).map(q => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuality(q)}
                      className={`py-1.5 px-2 rounded-xl text-xs font-medium transition capitalize ${
                        quality === q
                          ? 'bg-sky-500 text-white font-bold'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {q === 'high' ? 'High (92%)' : q === 'medium' ? 'Mid (80%)' : 'Compact'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Convert Action Button */}
              <button
                disabled={images.length === 0 || isConverting}
                onClick={handleStartConversion}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-500/20 disabled:opacity-40 disabled:pointer-events-none transition flex items-center justify-center gap-2"
              >
                {isConverting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>
                      Converting ({convertProgress.current}/{convertProgress.total})...
                    </span>
                  </>
                ) : (
                  <>
                    <FileImage className="w-4 h-4" />
                    <span>Create PDF ({images.length} Pages)</span>
                  </>
                )}
              </button>
            </div>

            {/* Conversion Success Card */}
            {convertedResult && (
              <div className="p-5 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 space-y-3 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center gap-2.5 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <div>
                    <h3 className="text-xs font-bold text-white">PDF Created Successfully!</h3>
                    <p className="text-[11px] text-emerald-300/80 font-mono">
                      {convertedResult.fileName} • {formatBytes(convertedResult.size)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <button
                    onClick={handleDownloadConverted}
                    className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF File</span>
                  </button>

                  <button
                    disabled={!!convertedResult.savedDocId}
                    onClick={handleSaveConvertedToVault}
                    className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-xs border border-slate-700 transition flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {convertedResult.savedDocId ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Saved in Vault!</span>
                      </>
                    ) : (
                      <>
                        <FolderPlus className="w-3.5 h-3.5 text-sky-400" />
                        <span>Save to Vault ({collections.find(c => c.id === targetCollection)?.name || 'Inbox'})</span>
                      </>
                    )}
                  </button>

                  {convertedResult.savedDocId && (
                    <button
                      onClick={() => {
                        const saved = documents.find(d => d.id === convertedResult.savedDocId);
                        if (saved) onOpenDocument(saved);
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-sky-500/20 text-sky-300 font-semibold text-xs hover:bg-sky-500/30 transition flex items-center justify-center gap-2"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Open in PDF Reader</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. PDF COMPRESSOR TAB */}
      {/* ========================================================================= */}
      {activeTool === 'compressor' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Source Selection & Preview */}
          <div className="lg:col-span-2 space-y-4">
            {/* Source Mode Toggle: Upload or Pick from Vault */}
            <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-900/80 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setSelectedSourceType('upload');
                  setSelectedVaultDocId('');
                  setCompressBuffer(null);
                  setCompressFileName('');
                  setCompressionResult(null);
                }}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 ${
                  selectedSourceType === 'upload'
                    ? 'bg-sky-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <UploadCloud className="w-4 h-4" />
                <span>Upload PDF from Device</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedSourceType('vault');
                  setCompressFile(null);
                  setCompressBuffer(null);
                  setCompressFileName('');
                  setCompressionResult(null);
                }}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 ${
                  selectedSourceType === 'vault'
                    ? 'bg-sky-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <HardDrive className="w-4 h-4" />
                <span>Select from Vault ({documents.length})</span>
              </button>
            </div>

            {/* Mode A: Upload Box */}
            {selectedSourceType === 'upload' && (
              <div
                onClick={() => compressFileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-800 hover:border-sky-500/60 rounded-3xl p-8 bg-[#0a0f1d]/50 hover:bg-[#0c1427]/60 transition cursor-pointer text-center group flex flex-col items-center justify-center gap-3"
              >
                <input
                  ref={compressFileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleSelectCompressFile}
                  className="hidden"
                />
                <div className="w-14 h-14 rounded-2xl bg-sky-500/10 text-sky-400 group-hover:scale-110 group-hover:bg-sky-500/20 transition duration-200 flex items-center justify-center">
                  <Minimize2 className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition">
                    Click to select PDF or drag and drop here
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Compacted entirely in your browser using canvas downscaling
                  </p>
                </div>
                <button
                  type="button"
                  className="mt-1 px-4 py-1.5 rounded-xl bg-slate-800 group-hover:bg-sky-500 group-hover:text-white text-xs font-medium text-slate-300 transition"
                >
                  Choose PDF
                </button>
              </div>
            )}

            {/* Mode B: Vault Selection Dropdown / Cards */}
            {selectedSourceType === 'vault' && (
              <div className="p-5 rounded-3xl bg-slate-900/70 border border-slate-800 space-y-3">
                <label className="text-xs font-semibold text-slate-300 block">
                  Choose a PDF already in your DocPocket library:
                </label>
                {documents.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3 text-center">
                    No documents currently in your vault. Upload one instead!
                  </p>
                ) : (
                  <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                    {documents.map(doc => (
                      <div
                        key={doc.id}
                        onClick={() => handleSelectVaultDoc(doc.id)}
                        className={`p-3 rounded-2xl border cursor-pointer transition flex items-center justify-between gap-3 ${
                          selectedVaultDocId === doc.id
                            ? 'bg-sky-500/15 border-sky-500 text-white'
                            : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-sky-400 shrink-0">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="truncate">
                            <p className="text-xs font-semibold truncate">{doc.displayName}</p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              {doc.pageCount} pages • {formatBytes(doc.fileSize)} • {doc.category}
                            </p>
                          </div>
                        </div>
                        {selectedVaultDocId === doc.id && (
                          <div className="w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center shrink-0">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {compressError && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{compressError}</span>
              </div>
            )}

            {/* Selected File Overview Card */}
            {compressBuffer && (
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-bold text-white truncate">{compressFileName}</p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Current Size: <span className="text-amber-400 font-bold">{formatBytes(compressOriginalSize)}</span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setCompressBuffer(null);
                    setCompressFileName('');
                    setCompressOriginalSize(0);
                    setSelectedVaultDocId('');
                    setCompressionResult(null);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                  title="Remove selected PDF"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Compression Result Banner */}
            {compressionResult && (
              <div className="p-6 rounded-3xl bg-gradient-to-br from-emerald-500/10 via-slate-900 to-[#071318] border border-emerald-500/30 space-y-5 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-sm font-bold text-white">Compression Complete!</span>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-xs font-mono border border-emerald-500/30">
                    {compressionResult.reductionPercentage > 0
                      ? `-${compressionResult.reductionPercentage}% Reduced`
                      : 'Optimized'}
                  </span>
                </div>

                {/* Before and After Comparison Meter */}
                <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                      Original Size
                    </p>
                    <p className="text-base font-bold text-slate-300 font-mono">
                      {formatBytes(compressionResult.originalSize)}
                    </p>
                  </div>

                  <div className="space-y-1 border-l border-slate-800 pl-4">
                    <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">
                      New Compressed Size
                    </p>
                    <p className="text-base font-bold text-emerald-300 font-mono">
                      {formatBytes(compressionResult.compressedSize)}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    onClick={handleDownloadCompressed}
                    className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Compressed PDF</span>
                  </button>

                  <button
                    disabled={!!savedCompressedDocId}
                    onClick={handleSaveCompressedToVault}
                    className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {savedCompressedDocId ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Saved in DocPocket!</span>
                      </>
                    ) : (
                      <>
                        <FolderPlus className="w-4 h-4 text-sky-400" />
                        <span>Save as New PDF to Vault</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Compression Preset & Controls */}
          <div className="space-y-4">
            <div className="p-5 rounded-3xl bg-slate-900/70 border border-slate-800 space-y-4">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Scissors className="w-4 h-4 text-sky-400" />
                <span>Compression Settings</span>
              </h2>

              {/* Compression Presets */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Preset Level</label>

                <div
                  onClick={() => setCompressPreset('balanced')}
                  className={`p-3 rounded-2xl border cursor-pointer transition ${
                    compressPreset === 'balanced'
                      ? 'bg-sky-500/15 border-sky-500'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Balanced</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-300 font-normal">
                        Recommended
                      </span>
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400">~50-60% smaller</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Good balance between sharp text clarity and substantial file reduction (140 DPI).
                  </p>
                </div>

                <div
                  onClick={() => setCompressPreset('extreme')}
                  className={`p-3 rounded-2xl border cursor-pointer transition ${
                    compressPreset === 'extreme'
                      ? 'bg-sky-500/15 border-sky-500'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Extreme Compression</span>
                    <span className="text-[10px] font-mono text-emerald-400">~70-85% smaller</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Maximum compaction for strict email or WhatsApp attachments (100 DPI).
                  </p>
                </div>

                <div
                  onClick={() => setCompressPreset('light')}
                  className={`p-3 rounded-2xl border cursor-pointer transition ${
                    compressPreset === 'light'
                      ? 'bg-sky-500/15 border-sky-500'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Light / High Quality</span>
                    <span className="text-[10px] font-mono text-emerald-400">~25-35% smaller</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Retains crisp vectors and high resolution while shedding bloated streams (180 DPI).
                  </p>
                </div>

                <div
                  onClick={() => setCompressPreset('custom')}
                  className={`p-3 rounded-2xl border cursor-pointer transition ${
                    compressPreset === 'custom'
                      ? 'bg-sky-500/15 border-sky-500'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Custom Sliders</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Manually adjust rendering DPI and JPEG quality factor.
                  </p>
                </div>
              </div>

              {/* Custom Sliders */}
              {compressPreset === 'custom' && (
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">Resolution (DPI)</span>
                      <span className="font-mono text-sky-400 font-bold">{customDpi} DPI</span>
                    </div>
                    <input
                      type="range"
                      min="72"
                      max="220"
                      step="4"
                      value={customDpi}
                      onChange={e => setCustomDpi(Number(e.target.value))}
                      className="w-full accent-sky-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">Image Quality</span>
                      <span className="font-mono text-sky-400 font-bold">{customQuality}%</span>
                    </div>
                    <input
                      type="range"
                      min="30"
                      max="95"
                      step="5"
                      value={customQuality}
                      onChange={e => setCustomQuality(Number(e.target.value))}
                      className="w-full accent-sky-500"
                    />
                  </div>
                </div>
              )}

              {/* Compress Action Button */}
              <button
                disabled={!compressBuffer || isCompressing}
                onClick={handleStartCompression}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-500/20 disabled:opacity-40 disabled:pointer-events-none transition flex items-center justify-center gap-2"
              >
                {isCompressing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>
                      Compressing page {compressProgress.current} of {compressProgress.total}...
                    </span>
                  </>
                ) : (
                  <>
                    <Minimize2 className="w-4 h-4" />
                    <span>Compress PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
