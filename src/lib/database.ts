import Dexie, { Table } from 'dexie';
import { CollectionItem, DocumentBinary, DocumentItem } from '../types';

export const DEFAULT_COLLECTIONS: CollectionItem[] = [
  {
    id: 'inbox',
    name: 'Inbox',
    color: '#94a3b8',
    icon: 'Inbox',
    description: 'Unsorted documents and quick imports',
    isSystem: true,
    createdAt: 1704067200000,
  },
  {
    id: 'timetable',
    name: 'Timetable',
    color: '#06b6d4',
    icon: 'Calendar',
    description: 'Class routines, exam schedules, and weekly timetables',
    isSystem: true,
    createdAt: 1704067200001,
  },
  {
    id: 'college',
    name: 'College',
    color: '#38bdf8',
    icon: 'GraduationCap',
    description: 'Syllabus, notes, assignments, university records',
    isSystem: true,
    createdAt: 1704067200002,
  },
  {
    id: 'subjects',
    name: 'Subjects',
    color: '#818cf8',
    icon: 'BookOpen',
    description: 'Course textbooks, reference papers, and study guides',
    isSystem: true,
    createdAt: 1704067200003,
  },
  {
    id: 'certificates',
    name: 'Certificates',
    color: '#f59e0b',
    icon: 'Award',
    description: 'Credentials, degrees, workshop verifications',
    isSystem: true,
    createdAt: 1704067200004,
  },
  {
    id: 'projects',
    name: 'Projects',
    color: '#10b981',
    icon: 'Briefcase',
    description: 'Project briefs, reports, research documents',
    isSystem: true,
    createdAt: 1704067200005,
  },
  {
    id: 'personal',
    name: 'Personal',
    color: '#ec4899',
    icon: 'User',
    description: 'Identity cards, medical records, financial papers',
    isSystem: true,
    createdAt: 1704067200006,
  },
];

export class DocPocketDB extends Dexie {
  documents!: Table<DocumentItem, string>;
  binaries!: Table<DocumentBinary, string>;
  collections!: Table<CollectionItem, string>;
  settings!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('DocPocketVaultDB');
    this.version(1).stores({
      documents: 'id, displayName, fileName, category, isFavorite, isPinned, importedAt, lastOpenedAt, fileSize, *tags, fileHash',
      binaries: 'id',
      collections: 'id, name, isSystem, createdAt',
      settings: 'key',
    });
  }
}

export const db = new DocPocketDB();

export async function initializeDatabase(): Promise<void> {
  const existingCount = await db.collections.count();
  if (existingCount === 0) {
    await db.collections.bulkAdd(DEFAULT_COLLECTIONS);
  } else {
    // Ensure timetable exists for existing vaults
    const timetableCol = await db.collections.get('timetable');
    if (!timetableCol) {
      await db.collections.add({
        id: 'timetable',
        name: 'Timetable',
        color: '#06b6d4',
        icon: 'Calendar',
        description: 'Class routines, exam schedules, and weekly timetables',
        isSystem: true,
        createdAt: 1704067200001,
      });
    }
  }
}
