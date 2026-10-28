import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

export interface ImageToPdfItem {
  id: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  rotation: number; // 0, 90, 180, 270
}

export type PageSizePreset = 'a4' | 'letter' | 'fit';
export type PageOrientation = 'portrait' | 'landscape' | 'auto';
export type PageMargin = 'none' | 'narrow' | 'normal';
export type ImageFitMode = 'contain' | 'fill' | 'original';
export type QualityPreset = 'high' | 'medium' | 'low';

export interface ImageToPdfOptions {
  pageSize: PageSizePreset;
  orientation: PageOrientation;
  margin: PageMargin;
  fitMode: ImageFitMode;
  quality: QualityPreset; // high = 0.92, medium = 0.80, low = 0.65
  title?: string;
}

export type CompressionPreset = 'extreme' | 'balanced' | 'light' | 'custom';

export interface CompressionOptions {
  preset: CompressionPreset;
  targetDpi: number; // e.g. 96 to 220
  jpegQuality: number; // 0.30 to 0.95
}

export interface CompressionResult {
  compressedBytes: Uint8Array;
  originalSize: number;
  compressedSize: number;
  reductionPercentage: number;
  pageCount: number;
  previewUrl?: string;
}

// Standard page dimensions in points (72 points = 1 inch)
const PAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
};

const MARGIN_POINTS: Record<PageMargin, number> = {
  none: 0,
  narrow: 18, // 0.25 in / ~6.35mm
  normal: 36, // 0.5 in / ~12.7mm
};

const QUALITY_VALUES: Record<QualityPreset, number> = {
  high: 0.92,
  medium: 0.80,
  low: 0.65,
};

/**
 * Loads an image file into an HTMLImageElement and extracts original width and height
 */
export async function loadImageDimensions(file: File): Promise<{ width: number; height: number; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || img.width || 800,
        height: img.naturalHeight || img.height || 600,
        previewUrl: objectUrl,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to load image "${file.name}"`));
    };
    img.src = objectUrl;
  });
}

/**
 * Renders an image with optional rotation and quality compression to a JPEG ArrayBuffer
 */
async function processImageToJpegBytes(
  imageItem: ImageToPdfItem,
  qualityValue: number
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const rot = (imageItem.rotation % 360 + 360) % 360;
      const isRotated90or270 = rot === 90 || rot === 270;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context not available'));
        return;
      }

      const origW = img.naturalWidth || 800;
      const origH = img.naturalHeight || 600;

      if (isRotated90or270) {
        canvas.width = origH;
        canvas.height = origW;
      } else {
        canvas.width = origW;
        canvas.height = origH;
      }

      // Fill white background for transparent PNGs
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.drawImage(img, -origW / 2, -origH / 2);
      ctx.restore();

      canvas.toBlob(
        async blob => {
          if (!blob) {
            reject(new Error('Failed to encode image to blob'));
            return;
          }
          const buffer = await blob.arrayBuffer();
          resolve({
            bytes: new Uint8Array(buffer),
            width: canvas.width,
            height: canvas.height,
          });
        },
        'image/jpeg',
        qualityValue
      );
    };

    img.onerror = () => {
      reject(new Error(`Could not process image: ${imageItem.file.name}`));
    };

    img.src = imageItem.previewUrl;
  });
}

/**
 * Converts an array of image items into a pristine PDF document
 */
export async function convertImagesToPdf(
  items: ImageToPdfItem[],
  options: ImageToPdfOptions,
  onProgress?: (current: number, total: number) => void
): Promise<Uint8Array> {
  if (items.length === 0) {
    throw new Error('Please select at least one image to convert.');
  }

  const pdfDoc = await PDFDocument.create();
  if (options.title) {
    pdfDoc.setTitle(options.title);
  }
  pdfDoc.setProducer('DocPocket PDF Studio');
  pdfDoc.setCreator('DocPocket');

  const qualityValue = QUALITY_VALUES[options.quality] || 0.85;
  const marginPt = MARGIN_POINTS[options.margin] || 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (onProgress) {
      onProgress(i + 1, items.length);
    }

    const { bytes, width: imgW, height: imgH } = await processImageToJpegBytes(item, qualityValue);
    const embeddedImage = await pdfDoc.embedJpg(bytes);

    let pageWidth = 595.28;
    let pageHeight = 841.89;

    if (options.pageSize === 'fit') {
      pageWidth = imgW + marginPt * 2;
      pageHeight = imgH + marginPt * 2;
    } else {
      const baseDim = PAGE_DIMENSIONS[options.pageSize] || PAGE_DIMENSIONS.a4;
      let isLandscape = false;
      if (options.orientation === 'landscape') {
        isLandscape = true;
      } else if (options.orientation === 'portrait') {
        isLandscape = false;
      } else {
        // Auto orientation based on image aspect ratio
        isLandscape = imgW > imgH;
      }

      pageWidth = isLandscape ? Math.max(baseDim.width, baseDim.height) : Math.min(baseDim.width, baseDim.height);
      pageHeight = isLandscape ? Math.min(baseDim.width, baseDim.height) : Math.max(baseDim.width, baseDim.height);
    }

    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Usable printable area
    const printableW = Math.max(pageWidth - marginPt * 2, 10);
    const printableH = Math.max(pageHeight - marginPt * 2, 10);

    let drawW = printableW;
    let drawH = printableH;
    let drawX = marginPt;
    let drawY = marginPt;

    if (options.fitMode === 'contain' || options.pageSize === 'fit') {
      const scale = Math.min(printableW / imgW, printableH / imgH);
      drawW = imgW * scale;
      drawH = imgH * scale;
      // Center on page
      drawX = marginPt + (printableW - drawW) / 2;
      drawY = marginPt + (printableH - drawH) / 2;
    } else if (options.fitMode === 'original') {
      drawW = imgW;
      drawH = imgH;
      drawX = marginPt + Math.max(0, (printableW - drawW) / 2);
      drawY = marginPt + Math.max(0, (printableH - drawH) / 2);
    } else {
      // 'fill'
      drawW = printableW;
      drawH = printableH;
    }

    page.drawImage(embeddedImage, {
      x: drawX,
      y: drawY,
      width: drawW,
      height: drawH,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

/**
 * Compresses any PDF document by rendering pages with high-fidelity canvas downsampling and re-encoding
 */
export async function compressPdfDocument(
  pdfBuffer: ArrayBuffer,
  options: CompressionOptions,
  onProgress?: (current: number, total: number) => void
): Promise<CompressionResult> {
  const originalSize = pdfBuffer.byteLength;

  // Clone buffer so pdfjs transfer doesn't neuter source
  const bufferClone = pdfBuffer.slice(0);
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(bufferClone),
    cMapUrl: 'https://unpkg.com/pdfjs-dist@4.0.379/cmaps/',
    cMapPacked: true,
  });

  const sourcePdf = await loadingTask.promise;
  const numPages = sourcePdf.numPages;

  if (numPages === 0) {
    throw new Error('This PDF has no pages to compress.');
  }

  const compressedPdfDoc = await PDFDocument.create();
  compressedPdfDoc.setProducer('DocPocket Smart Compression Engine');
  compressedPdfDoc.setCreator('DocPocket');

  // DPI calculation: 72 points = 1 inch
  // target scale = targetDpi / 72
  const targetScale = Math.max(0.7, Math.min(2.5, options.targetDpi / 72));
  let firstPagePreviewUrl: string | undefined;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (onProgress) {
      onProgress(pageNum, numPages);
    }

    const page = await sourcePdf.getPage(pageNum);
    const originalViewport = page.getViewport({ scale: 1.0 });

    // Render page to canvas at calculated target scale
    const renderViewport = page.getViewport({ scale: targetScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(renderViewport.width);
    canvas.height = Math.round(renderViewport.height);

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error(`Canvas rendering failed on page ${pageNum}`);
    }

    // Fill white background for transparent vectors/canvases
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport: renderViewport,
      canvas,
    }).promise;

    // Capture first page preview data URL
    if (pageNum === 1) {
      try {
        firstPagePreviewUrl = canvas.toDataURL('image/jpeg', 0.8);
      } catch {
        // non-fatal
      }
    }

    // Compress to JPEG blob
    const jpegBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        },
        'image/jpeg',
        options.jpegQuality
      );
    });

    const pageJpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
    const embeddedImage = await compressedPdfDoc.embedJpg(pageJpegBytes);

    // Maintain the original PDF's physical point dimensions
    const newPage = compressedPdfDoc.addPage([originalViewport.width, originalViewport.height]);
    newPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: originalViewport.width,
      height: originalViewport.height,
    });
  }

  const compressedBytes = await compressedPdfDoc.save();
  const compressedSize = compressedBytes.byteLength;
  const reductionPercentage = Math.round(((originalSize - compressedSize) / originalSize) * 100);

  return {
    compressedBytes,
    originalSize,
    compressedSize,
    reductionPercentage,
    pageCount: numPages,
    previewUrl: firstPagePreviewUrl,
  };
}
