import { db, DEFAULT_COLLECTIONS } from './database';
import { CollectionItem } from '../types';

export const collectionService = {
  async getAllCollections(): Promise<CollectionItem[]> {
    const list = await db.collections.toArray();
    if (list.length === 0) {
      await db.collections.bulkAdd(DEFAULT_COLLECTIONS);
      return DEFAULT_COLLECTIONS;
    }
    return list;
  },

  async getCollection(id: string): Promise<CollectionItem | undefined> {
    return db.collections.get(id);
  },

  async createCollection(data: Omit<CollectionItem, 'id' | 'createdAt' | 'isSystem'>): Promise<CollectionItem> {
    const id = `col_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newCol: CollectionItem = {
      id,
      name: data.name.trim(),
      color: data.color || '#38bdf8',
      icon: data.icon || 'Folder',
      description: data.description?.trim() || '',
      isSystem: false,
      createdAt: Date.now(),
    };
    await db.collections.add(newCol);
    return newCol;
  },

  async updateCollection(id: string, updates: Partial<Omit<CollectionItem, 'id' | 'isSystem' | 'createdAt'>>): Promise<void> {
    await db.collections.update(id, updates);
  },

  async deleteCollection(id: string): Promise<void> {
    const col = await db.collections.get(id);
    if (!col || col.isSystem) {
      throw new Error('System collections cannot be deleted.');
    }

    // Transactionally reassign all documents belonging to this collection to 'inbox', then delete collection
    await db.transaction('rw', [db.collections, db.documents], async () => {
      await db.documents.where('category').equals(id).modify({ category: 'inbox' });
      await db.collections.delete(id);
    });
  },
};
