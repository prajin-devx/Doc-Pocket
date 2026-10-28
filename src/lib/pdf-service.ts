import * as pdfjsLib from 'pdfjs-dist';

// Ensure worker is configured to the local worker file with CDN fallback
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
  }
}

export interface PDFMetadataResult {
  pageCount: number;
  thumbnailDataUrl?: string;
  extractedTitle?: string;
  fileHash: string;
  isPasswordProtected?: boolean;
}

/**
 * Calculates a SHA-256 hex hash from an ArrayBuffer for duplicate detection
 */
export async function computeFileHash(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // fallback
    }
  }
  // Fallback checksum if SubtleCrypto is unavailable
  let hash = 0;
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < Math.min(bytes.length, 65536); i++) {
    hash = ((hash << 5) - hash) + bytes[i];
    hash |= 0;
  }
  return `chk-${Math.abs(hash)}-${buffer.byteLength}`;
}

/**
 * Inspects a PDF ArrayBuffer, extracts page count, metadata, and generates a preview thumbnail.
 * Handles password-protected PDFs gracefully.
 */
export async function inspectPDF(buffer: ArrayBuffer, password?: string): Promise<PDFMetadataResult> {
  const fileHash = await computeFileHash(buffer);

  try {
    // Clone buffer so pdfjs transfer doesn't neuter the source buffer
    const bufferClone = buffer.slice(0);
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(bufferClone),
      cMapUrl: 'https://unpkg.com/pdfjs-dist@4.0.379/cmaps/',
      cMapPacked: true,
      password: password || undefined,
    });

    const pdfDoc = await loadingTask.promise;
    const pageCount = pdfDoc.numPages;

    let extractedTitle: string | undefined;
    try {
      const meta = await pdfDoc.getMetadata();
      const info = meta?.info as Record<string, unknown> | undefined;
      if (info && typeof info.Title === 'string' && info.Title.trim().length > 0) {
        extractedTitle = info.Title.trim();
      }
    } catch {
      // Non-fatal if metadata reading fails
    }

    // Generate page 1 thumbnail
    let thumbnailDataUrl: string | undefined;
    try {
      const page = await pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 1 });

      const targetWidth = 240;
      const scale = targetWidth / viewport.width;
      const scaledViewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (ctx) {
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: ctx,
          viewport: scaledViewport,
          canvas,
        }).promise;

        thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.82);
      }
    } catch (err) {
      console.warn('Could not generate PDF thumbnail:', err);
    }

    return {
      pageCount,
      thumbnailDataUrl,
      extractedTitle,
      fileHash,
      isPasswordProtected: false,
    };
  } catch (err: unknown) {
    // Check if error is due to password protection
    if (
      err &&
      typeof err === 'object' &&
      'name' in err &&
      (err.name === 'PasswordException' || String(err).includes('password') || String(err).includes('Password'))
    ) {
      return {
        pageCount: 1,
        thumbnailDataUrl: undefined,
        extractedTitle: undefined,
        fileHash,
        isPasswordProtected: true,
      };
    }

    console.error('PDF parsing error:', err);
    throw new Error(err instanceof Error ? err.message : 'Invalid or corrupted PDF file');
  }
}
