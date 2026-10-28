/**
 * Generates valid standard PDF-1.4 binary ArrayBuffers in pure JavaScript without any external API.
 * This guarantees the user can immediately experience the reader, search, collections, and backup.
 */

function createSimplePDF(title: string, subtitle: string, bodyParagraphs: string[]): ArrayBuffer {
  // Format text stream
  let streamText = `BT\n/F1 22 Tf\n50 720 Td\n(${title.replace(/[()]/g, '')}) Tj\nET\n`;
  streamText += `BT\n/F1 12 Tf\n50 690 Td\n(${subtitle.replace(/[()]/g, '')}) Tj\nET\n`;

  let y = 640;
  for (const para of bodyParagraphs) {
    streamText += `BT\n/F1 10 Tf\n50 ${y} Td\n(${para.replace(/[()]/g, '')}) Tj\nET\n`;
    y -= 22;
  }

  // Draw header accent line
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

export const sampleVaultDocuments = [
  {
    fileName: 'DocPocket_Quickstart_Guide.pdf',
    displayName: 'DocPocket Quickstart & Vault Guide',
    category: 'inbox',
    tags: ['guide', 'overview', 'pwa'],
    description: 'Welcome to DocPocket. Essential overview of on-device IndexedDB storage and offline usage.',
    generateBuffer: () =>
      createSimplePDF(
        'DocPocket Personal Vault Guide',
        'Offline-First Personal PDF Management System',
        [
          '1. On-Device Storage: All your PDF files are saved directly in browser IndexedDB.',
          '2. Privacy First: Documents never touch external servers or public cloud storage.',
          '3. Organization: Sort documents into College, Subjects, Projects, or Custom Collections.',
          '4. High-Performance Reader: Multi-page canvas rendering, zoom, rotation, and printing.',
          '5. Portable Backups: Export your entire vault as a ZIP archive anytime with full manifest.',
          '6. Progressive Web App: Install directly onto your desktop, Android, or iOS home screen.'
        ]
      ),
  },
  {
    fileName: 'Advanced_Database_Syllabus.pdf',
    displayName: 'Advanced Database Systems Syllabus',
    category: 'college',
    tags: ['college', 'syllabus', 'sem6'],
    description: 'Course outline covering B-Trees, transaction isolation, concurrency control, and index structures.',
    generateBuffer: () =>
      createSimplePDF(
        'CS-402: Advanced Database Systems',
        'Department of Computer Science - Semester VI',
        [
          'Module 1: Query Execution Engines, Relational Algebra, Cost Estimation.',
          'Module 2: Transaction Management, ACID Properties, Two-Phase Locking (2PL).',
          'Module 3: Crash Recovery, Write-Ahead Logging (WAL), ARIES algorithm.',
          'Module 4: Distributed Databases, Two-Phase Commit (2PC), Paxos & Raft consensus.',
          'Textbook: Database System Concepts, 7th Edition by Silberschatz, Korth, Sudarshan.'
        ]
      ),
  },
  {
    fileName: 'Semester_Class_Timetable.pdf',
    displayName: 'Weekly Class & Lab Timetable',
    category: 'timetable',
    tags: ['timetable', 'routine', 'schedule', 'classes'],
    description: 'Weekly schedule for lectures, labs, seminar sessions, and faculty office hours.',
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
  {
    fileName: 'Full_Stack_Cloud_Architecture.pdf',
    displayName: 'Modern Offline Web App Architecture',
    category: 'projects',
    tags: ['architecture', 'engineering', 'pwa'],
    description: 'Technical reference for IndexedDB persistence, service workers, and client-side ZIP packaging.',
    generateBuffer: () =>
      createSimplePDF(
        'Engineering Spec: Offline Personal Vault',
        'Architecture Overview & Memory Management',
        [
          'Component 1: IndexedDB Binary Table stores raw ArrayBuffers without RAM overload.',
          'Component 2: Metadata Table preserves titles, tags, colors, and SHA-256 hashes.',
          'Component 3: PDF.js Worker offloads canvas rasterization to background worker.',
          'Component 4: JSZip Client-side Archiver bundles binary files with JSON manifest.',
          'Component 5: Service Worker precaches core static bundles for zero-network operation.'
        ]
      ),
  },
];
