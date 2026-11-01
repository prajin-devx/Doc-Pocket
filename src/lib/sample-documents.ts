import JSZip from 'jszip';

/**
 * Escapes XML special characters
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates valid standard PDF-1.4 binary ArrayBuffers in pure JavaScript without any external API.
 */
function createSimplePDF(title: string, subtitle: string, bodyParagraphs: string[]): ArrayBuffer {
  let streamText = `BT\n/F1 22 Tf\n50 720 Td\n(${title.replace(/[()]/g, '')}) Tj\nET\n`;
  streamText += `BT\n/F1 12 Tf\n50 690 Td\n(${subtitle.replace(/[()]/g, '')}) Tj\nET\n`;

  let y = 640;
  for (const para of bodyParagraphs) {
    streamText += `BT\n/F1 10 Tf\n50 ${y} Td\n(${para.replace(/[()]/g, '')}) Tj\nET\n`;
    y -= 22;
  }

  streamText += `0.2 0.7 0.9 RG\n2 w\n50 670 m 550 670 l S\n`;

  const streamBytes = new TextEncoder().encode(streamText);
  const streamLength = streamBytes.length;

  const objects: string[] = [];
  objects[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  objects[3] = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`;
  objects[4] = `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamText}\nendstream\nendobj\n`;
  objects[5] = `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;

  let pdfString = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (let i = 1; i <= 5; i++) {
    offsets[i] = new TextEncoder().encode(pdfString).length;
    pdfString += objects[i];
  }

  const xrefOffset = new TextEncoder().encode(pdfString).length;
  pdfString += `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) {
    pdfString += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdfString += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdfString).buffer;
}

/**
 * Generates a valid Word (.docx) OpenXML document ArrayBuffer
 */
export async function createSimpleDocx(
  title: string,
  subtitle: string,
  sections: { heading: string; paragraphs: string[] }[]
): Promise<ArrayBuffer> {
  const zip = new JSZip();

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  let docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="52"/></w:rPr><w:t>${escapeXml(title)}</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Subtitle"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="28"/><w:color w:val="666666"/></w:rPr><w:t>${escapeXml(subtitle)}</w:t></w:r></w:p>`;

  for (const sec of sections) {
    docXml += `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="34"/><w:color w:val="2563EB"/></w:rPr><w:t>${escapeXml(sec.heading)}</w:t></w:r></w:p>`;
    for (const p of sec.paragraphs) {
      docXml += `<w:p><w:r><w:sz w:val="24"/><w:t>${escapeXml(p)}</w:t></w:r></w:p>`;
    }
  }

  docXml += `
  </w:body>
</w:document>`;

  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rels);
  zip.file('word/document.xml', docXml);

  return zip.generateAsync({ type: 'arraybuffer' });
}

/**
 * Generates a valid PowerPoint (.pptx) OpenXML presentation ArrayBuffer
 */
export async function createSimplePptx(
  presentationTitle: string,
  slides: { title: string; bullets: string[] }[]
): Promise<ArrayBuffer> {
  const zip = new JSZip();

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('\n  ')}
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;

  const presRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('\n  ')}
</Relationships>`;

  const presXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    ${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>`).join('\n    ')}
  </p:sldIdLst>
</p:presentation>`;

  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rels);
  zip.file('ppt/presentation.xml', presXml);
  zip.file('ppt/_rels/presentation.xml.rels', presRels);

  slides.forEach((slide, i) => {
    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>${escapeXml(slide.title)}</a:t></a:r></a:p>
          ${slide.bullets.map(b => `<a:p><a:r><a:t>${escapeXml(b)}</a:t></a:r></a:p>`).join('\n          ')}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;
    zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml);
  });

  return zip.generateAsync({ type: 'arraybuffer' });
}

export const sampleVaultDocuments = [
  {
    fileName: 'DocPocket_Quickstart_Guide.pdf',
    displayName: 'DocPocket Quickstart & Vault Guide',
    category: 'inbox',
    tags: ['guide', 'overview', 'pwa'],
    description: 'Welcome to DocPocket. Essential overview of on-device IndexedDB storage and offline usage.',
    pageBookmarks: [
      {
        id: 'bm_sample_1',
        pageNumber: 1,
        title: 'Core Architecture Overview',
        note: 'IndexedDB on-device privacy guarantee and offline sync.',
        createdAt: 1704067200000,
        color: '#38bdf8',
      },
    ],
    generateBuffer: () =>
      createSimplePDF(
        'DocPocket Personal Vault Guide',
        'Offline-First Personal PDF Management System',
        [
          '1. On-Device Storage: All your PDF, PPT, and Word files are saved directly in browser IndexedDB.',
          '2. Privacy First: Documents never touch external servers or public cloud storage.',
          '3. Organization: Sort documents into College, Subjects, Projects, or Custom Collections.',
          '4. High-Performance Reader: Multi-page canvas rendering, slide presentation mode, and rich Word doc viewer.',
          '5. Portable Backups: Export your entire vault as a ZIP archive anytime with full manifest.',
          '6. Progressive Web App: Install directly onto your desktop, Android, or iOS home screen.'
        ]
      ),
  },
  {
    fileName: 'AI_Systems_Seminar_Slides.pptx',
    displayName: 'AI Systems & Procurement Deck',
    category: 'projects',
    tags: ['presentation', 'seminar', 'slides', 'ai'],
    description: 'Executive presentation deck covering distributed forecasting, capacity queuing, and cloud sync.',
    generateBuffer: () =>
      createSimplePptx('AI Systems & Procurement Platform', [
        {
          title: 'KrishiSetu & DocPocket Presentation',
          bullets: [
            'Empowering seamless document storage and procurement workflows',
            'Full support for PowerPoint presentations, Word documents, and PDFs',
            'Synchronized with Google Drive and offline-first IndexedDB',
          ],
        },
        {
          title: 'Key Architectural Highlights',
          bullets: [
            'Client-side zero-leakage document encryption and parsing',
            'Dynamic OpenXML extraction for instant full-text search',
            'Native slide filmstrip, presentation slideshow mode, and speaker notes',
          ],
        },
        {
          title: 'Cross-Platform Experience',
          bullets: [
            'Instant search across all slide decks and documents',
            'Google Drive organized backup in dedicated folders',
            'Lightweight responsive reading on mobile, tablet, and desktop',
          ],
        },
      ]),
  },
  {
    fileName: 'Software_Engineering_Project_Report.docx',
    displayName: 'Software Engineering Project Report',
    category: 'college',
    tags: ['report', 'word', 'college', 'specs'],
    description: 'Comprehensive specifications report with architectural diagrams, user flows, and test matrices.',
    generateBuffer: () =>
      createSimpleDocx(
        'Software Engineering Project Report',
        'Department of Computer Science & Engineering - Technical Documentation',
        [
          {
            heading: '1. Executive Summary',
            paragraphs: [
              'This project delivers a resilient personal document vault capable of storing, organizing, and reading PDFs, Microsoft PowerPoint presentations (.pptx, .ppt), and Microsoft Word documents (.docx, .doc).',
              'All binaries remain strictly stored in local IndexedDB with automatic background synchronization to Google Drive.',
            ],
          },
          {
            heading: '2. Functional Requirements',
            paragraphs: [
              'FR-1: Seamless multi-file upload supporting .pdf, .docx, .doc, .pptx, and .ppt formats.',
              'FR-2: In-browser presentation mode for slide navigation, auto-advance, and keyword search.',
              'FR-3: Word reader with customized typography, paper themes, word counters, and deep text search.',
              'FR-4: Transactional cross-platform backup into structured Google Drive subfolders.',
            ],
          },
          {
            heading: '3. Verification & Metrics',
            paragraphs: [
              'Zero external server latency on local reading operations.',
              'P99 slide rendering under 15ms using pre-parsed OpenXML trees.',
              '100% data integrity verified across IndexedDB storage and Google Drive API endpoints.',
            ],
          },
        ]
      ),
  },
  {
    fileName: 'Semester_Class_Timetable.pdf',
    displayName: 'Weekly Class & Lab Timetable',
    category: 'timetable',
    tags: ['timetable', 'routine', 'schedule', 'classes'],
    description: 'Weekly schedule for lectures, labs, seminar sessions, and faculty office hours.',
    pageBookmarks: [
      {
        id: 'bm_sample_2',
        pageNumber: 1,
        title: 'Lab Sessions & Schedule',
        note: 'Database Systems Lab Mon 11:30 AM & Web Tech Lab Wed 1:30 PM.',
        createdAt: 1704067200000,
        color: '#f59e0b',
      },
    ],
    generateBuffer: () =>
      createSimplePDF(
        'Semester VI - Weekly Class Timetable',
        'Department of Computer Science & Engineering',
        [
          'Monday: 09:00 AM - Algorithms | 11:30 AM - Database Systems Lab',
          'Tuesday: 10:00 AM - Computer Networks | 02:00 PM - Software Engineering',
          'Wednesday: 09:00 AM - Machine Learning | 01:30 PM - Web Technology Lab',
          'Thursday: 11:00 AM - Distributed Systems | 03:00 PM - Project Work',
          'Friday: 10:00 AM - Cloud Computing | 02:00 PM - Seminar & Presentation'
        ]
      ),
  },
];
