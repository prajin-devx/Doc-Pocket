import JSZip from 'jszip';
import mammoth from 'mammoth';
import { computeFileHash } from './pdf-service';
import { DocumentFormat, SlideItem } from '../types';

export interface OfficeDocumentMetadata {
  format: DocumentFormat;
  mimeType: string;
  pageCount: number;
  slideCount?: number;
  wordCount?: number;
  slides?: SlideItem[];
  docxHtml?: string;
  extractedTitle?: string;
  thumbnailDataUrl?: string;
  fileHash: string;
  extractedText: string;
}

/**
 * Determines document format from filename extension or MIME type
 */
export function getDocumentFormat(fileName: string, mimeType?: string): DocumentFormat {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.pdf') || mimeType === 'application/pdf') {
    return 'pdf';
  }
  if (
    lowerName.endsWith('.docx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  if (lowerName.endsWith('.doc') || mimeType === 'application/msword') {
    return 'doc';
  }
  if (
    lowerName.endsWith('.pptx') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return 'pptx';
  }
  if (lowerName.endsWith('.ppt') || mimeType === 'application/vnd.ms-powerpoint') {
    return 'ppt';
  }
  return 'pdf';
}

/**
 * Returns standard MIME type for given format or filename
 */
export function getDocumentMimeType(fileName: string, format?: DocumentFormat): string {
  const fmt = format || getDocumentFormat(fileName);
  switch (fmt) {
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'doc':
      return 'application/msword';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'ppt':
      return 'application/vnd.ms-powerpoint';
    case 'pdf':
    default:
      return 'application/pdf';
  }
}

/**
 * Generates an on-canvas thumbnail for Word (.docx, .doc)
 */
export function generateWordThumbnail(title: string, subtitle?: string): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background gradient: Elegant rich dark navy
  const grad = ctx.createLinearGradient(0, 0, 320, 200);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(1, '#090d16');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 320, 200);

  // Top header bar: Word Blue
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(0, 0, 320, 32);

  // Word Badge Icon
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('W', 14, 21);

  ctx.fillStyle = '#93c5fd';
  ctx.font = '600 11px sans-serif';
  ctx.fillText('Word Document', 36, 21);

  // Simulated Page Card
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(24, 46, 272, 138, 8);
  ctx.fill();
  ctx.stroke();

  // Document Title inside card
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 13px sans-serif';
  const cleanTitle = title.length > 32 ? title.substring(0, 30) + '...' : title;
  ctx.fillText(cleanTitle, 38, 72);

  // Subtitle / preview snippet
  if (subtitle) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    const cleanSub = subtitle.length > 40 ? subtitle.substring(0, 38) + '...' : subtitle;
    ctx.fillText(cleanSub, 38, 92);
  }

  // Simulated lines of text
  ctx.fillStyle = '#38bdf8';
  ctx.globalAlpha = 0.4;
  ctx.fillRect(38, 110, 240, 4);
  ctx.fillRect(38, 122, 200, 4);
  ctx.fillRect(38, 134, 220, 4);
  ctx.fillRect(38, 146, 140, 4);
  ctx.globalAlpha = 1.0;

  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Generates an on-canvas thumbnail for PowerPoint (.pptx, .ppt)
 */
export function generatePptxThumbnail(title: string, slideCount: number): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background: Deep dark slate
  const grad = ctx.createLinearGradient(0, 0, 320, 200);
  grad.addColorStop(0, '#1c1917');
  grad.addColorStop(1, '#0c0a09');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 320, 200);

  // Top header bar: PowerPoint Orange
  ctx.fillStyle = '#ea580c';
  ctx.fillRect(0, 0, 320, 32);

  // PPT Badge Icon
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('P', 14, 21);

  ctx.fillStyle = '#fdba74';
  ctx.font = '600 11px sans-serif';
  ctx.fillText('Presentation', 34, 21);

  // Slide count pill on top right
  ctx.fillStyle = '#7c2d12';
  ctx.beginPath();
  ctx.roundRect(230, 7, 76, 18, 4);
  ctx.fill();
  ctx.fillStyle = '#ffedd5';
  ctx.font = 'bold 10px monospace';
  ctx.fillText(`${slideCount} slides`, 238, 20);

  // Simulated 16:9 Slide Canvas
  ctx.fillStyle = '#292524';
  ctx.strokeStyle = '#44403c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(24, 46, 272, 138, 8);
  ctx.fill();
  ctx.stroke();

  // Slide 1 Title
  ctx.fillStyle = '#fafaf9';
  ctx.font = 'bold 14px sans-serif';
  const cleanTitle = title.length > 30 ? title.substring(0, 28) + '...' : title;
  ctx.fillText(cleanTitle, 38, 82);

  // Accent underline
  ctx.fillStyle = '#f97316';
  ctx.fillRect(38, 92, 48, 3);

  // Bullet items simulation
  ctx.fillStyle = '#fdba74';
  ctx.beginPath();
  ctx.arc(42, 118, 3, 0, Math.PI * 2);
  ctx.arc(42, 138, 3, 0, Math.PI * 2);
  ctx.arc(42, 158, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#a8a29e';
  ctx.fillRect(52, 116, 180, 4);
  ctx.fillRect(52, 136, 210, 4);
  ctx.fillRect(52, 156, 140, 4);

  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * Inspects a Word (.docx) ArrayBuffer using mammoth and JSZip
 */
export async function inspectDocx(
  buffer: ArrayBuffer,
  fileName: string
): Promise<OfficeDocumentMetadata> {
  const fileHash = await computeFileHash(buffer);

  let rawText = '';
  let docxHtml = '';
  try {
    const textResult = await mammoth.extractRawText({ arrayBuffer: buffer });
    rawText = textResult.value || '';
  } catch (err) {
    console.warn('Could not extract raw text from docx with mammoth:', err);
  }

  try {
    const htmlResult = await mammoth.convertToHtml({ arrayBuffer: buffer });
    docxHtml = htmlResult.value || '';
  } catch (err) {
    console.warn('Could not convert docx to html with mammoth:', err);
  }

  // Calculate words and estimated pages (standard ~380 words per page in Word)
  const words = rawText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const pageCount = Math.max(1, Math.ceil(wordCount / 380));

  // Determine extracted title
  let extractedTitle: string | undefined;
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 0 && lines[0].length < 80) {
    extractedTitle = lines[0];
  }

  const cleanTitle = extractedTitle || fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  const subtitleSnippet = lines.slice(1, 3).join(' ').trim();
  const thumbnailDataUrl = generateWordThumbnail(cleanTitle, subtitleSnippet);

  return {
    format: 'docx',
    mimeType: getDocumentMimeType(fileName, 'docx'),
    pageCount,
    wordCount,
    docxHtml,
    extractedTitle,
    thumbnailDataUrl,
    fileHash,
    extractedText: rawText,
  };
}

/**
 * Inspects a PowerPoint (.pptx) ArrayBuffer using JSZip
 */
export async function inspectPptx(
  buffer: ArrayBuffer,
  fileName: string
): Promise<OfficeDocumentMetadata> {
  const fileHash = await computeFileHash(buffer);
  const zip = await new JSZip().loadAsync(buffer);

  // Identify all slide XML files (e.g. ppt/slides/slide1.xml)
  const slideEntries: { index: number; name: string }[] = [];
  const slideRegex = /^ppt\/slides\/slide([0-9]+)\.xml$/i;

  zip.forEach((path) => {
    const match = path.match(slideRegex);
    if (match) {
      slideEntries.push({
        index: parseInt(match[1], 10),
        name: path,
      });
    }
  });

  // Sort slides in natural numerical order
  slideEntries.sort((a, b) => a.index - b.index);

  const slides: SlideItem[] = [];
  const fullTextParts: string[] = [];

  const parser = typeof DOMParser !== 'undefined' ? new DOMParser() : null;

  for (let i = 0; i < slideEntries.length; i++) {
    const entry = slideEntries[i];
    const xmlContent = await zip.file(entry.name)?.async('text');
    if (!xmlContent) continue;

    let slideTitle = '';
    const bullets: string[] = [];
    const slideTextParts: string[] = [];

    if (parser) {
      try {
        const doc = parser.parseFromString(xmlContent, 'application/xml');
        // Extract paragraphs
        const paragraphs = doc.getElementsByTagName('a:p');
        for (let p = 0; p < paragraphs.length; p++) {
          const para = paragraphs[p];
          const textNodes = para.getElementsByTagName('a:t');
          let paraText = '';
          for (let t = 0; t < textNodes.length; t++) {
            paraText += textNodes[t].textContent || '';
          }
          paraText = paraText.trim();
          if (!paraText) continue;

          slideTextParts.push(paraText);

          // Check if this is the slide title
          if (!slideTitle) {
            slideTitle = paraText;
          } else {
            bullets.push(paraText);
          }
        }
      } catch (xmlErr) {
        console.warn('DOMParser failed on slide XML:', xmlErr);
      }
    }

    // Fallback regex text extraction if DOMParser was unavailable or yielded nothing
    if (slideTextParts.length === 0) {
      const textMatches = xmlContent.match(/<a:t>([^<]+)<\/a:t>/g) || [];
      const extractedTokens = textMatches.map(m => m.replace(/<\/?a:t>/g, '').trim()).filter(Boolean);
      if (extractedTokens.length > 0) {
        slideTitle = extractedTokens[0];
        bullets.push(...extractedTokens.slice(1));
        slideTextParts.push(...extractedTokens);
      }
    }

    const slideCombinedText = slideTextParts.join(' ');
    fullTextParts.push(`[Slide ${i + 1}: ${slideTitle || 'Untitled'}] ${slideCombinedText}`);

    slides.push({
      slideNumber: i + 1,
      title: slideTitle || `Slide ${i + 1}`,
      bullets,
      rawText: slideCombinedText,
    });
  }

  const slideCount = slides.length > 0 ? slides.length : 1;
  const firstSlideTitle = slides[0]?.title || fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  const thumbnailDataUrl = generatePptxThumbnail(firstSlideTitle, slideCount);

  return {
    format: 'pptx',
    mimeType: getDocumentMimeType(fileName, 'pptx'),
    pageCount: slideCount,
    slideCount,
    slides,
    extractedTitle: firstSlideTitle,
    thumbnailDataUrl,
    fileHash,
    extractedText: fullTextParts.join('\n\n'),
  };
}

/**
 * Fallback inspector for legacy binary formats (.doc, .ppt)
 */
export async function inspectLegacyOffice(
  buffer: ArrayBuffer,
  fileName: string,
  format: 'doc' | 'ppt'
): Promise<OfficeDocumentMetadata> {
  const fileHash = await computeFileHash(buffer);
  const cleanTitle = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

  // Extract readable ASCII string chunks for basic text search
  let extractedText = '';
  try {
    const bytes = new Uint8Array(buffer);
    const chars: string[] = [];
    for (let i = 0; i < Math.min(bytes.length, 100000); i++) {
      const b = bytes[i];
      if ((b >= 32 && b <= 126) || b === 10 || b === 13) {
        chars.push(String.fromCharCode(b));
      } else if (chars.length > 0 && chars[chars.length - 1] !== ' ') {
        chars.push(' ');
      }
    }
    extractedText = chars.join('').replace(/\s+/g, ' ').trim();
  } catch {
    extractedText = cleanTitle;
  }

  const pageCount = format === 'ppt' ? 5 : 2;
  const thumbnail =
    format === 'ppt'
      ? generatePptxThumbnail(cleanTitle, pageCount)
      : generateWordThumbnail(cleanTitle);

  return {
    format,
    mimeType: getDocumentMimeType(fileName, format),
    pageCount,
    slideCount: format === 'ppt' ? pageCount : undefined,
    extractedTitle: cleanTitle,
    thumbnailDataUrl: thumbnail,
    fileHash,
    extractedText,
  };
}
