import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  getDoc,
  query,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { CollectionItem, DashboardSectionId, DocumentItem } from '../types';

export const firestoreService = {
  /**
   * Save or update document metadata in user's cloud Firestore collection
   */
  async syncDocumentMetadata(userId: string, docItem: DocumentItem): Promise<void> {
    const docPath = `users/${userId}/documents/${docItem.id}`;
    try {
      const payload = {
        id: docItem.id,
        userId,
        displayName: docItem.displayName,
        fileName: docItem.fileName,
        fileSize: docItem.fileSize,
        pageCount: docItem.pageCount,
        category: docItem.category,
        tags: docItem.tags || [],
        description: docItem.description || '',
        isFavorite: docItem.isFavorite,
        isPinned: docItem.isPinned,
        fileHash: docItem.fileHash || '',
        importedAt: docItem.importedAt,
        lastOpenedAt: docItem.lastOpenedAt || docItem.importedAt,
      };

      await setDoc(doc(db, 'users', userId, 'documents', docItem.id), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, docPath);
    }
  },

  /**
   * Delete document metadata from Firestore
   */
  async deleteDocumentMetadata(userId: string, docId: string): Promise<void> {
    const docPath = `users/${userId}/documents/${docId}`;
    try {
      await deleteDoc(doc(db, 'users', userId, 'documents', docId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  },

  /**
   * Fetch all cloud documents for user
   */
  async getCloudDocuments(userId: string): Promise<DocumentItem[]> {
    const collPath = `users/${userId}/documents`;
    try {
      const snap = await getDocs(collection(db, 'users', userId, 'documents'));
      return snap.docs.map(d => {
        const data = d.data();
        return {
          id: data.id,
          displayName: data.displayName,
          fileName: data.fileName,
          fileSize: data.fileSize,
          pageCount: data.pageCount,
          category: data.category,
          tags: data.tags || [],
          description: data.description || '',
          isFavorite: data.isFavorite,
          isPinned: data.isPinned,
          fileHash: data.fileHash,
          importedAt: data.importedAt,
          lastOpenedAt: data.lastOpenedAt,
        } as DocumentItem;
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, collPath);
    }
  },

  /**
   * Save custom collection to Firestore
   */
  async syncCollection(userId: string, col: CollectionItem): Promise<void> {
    const docPath = `users/${userId}/collections/${col.id}`;
    try {
      const payload = {
        id: col.id,
        userId,
        name: col.name,
        color: col.color,
        icon: col.icon,
        description: col.description || '',
        isSystem: col.isSystem,
        createdAt: col.createdAt,
      };
      await setDoc(doc(db, 'users', userId, 'collections', col.id), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, docPath);
    }
  },

  /**
   * Delete custom collection from Firestore
   */
  async deleteCollection(userId: string, colId: string): Promise<void> {
    const docPath = `users/${userId}/collections/${colId}`;
    try {
      await deleteDoc(doc(db, 'users', userId, 'collections', colId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  },

  /**
   * Save dashboard layout preferences to Firestore
   */
  async saveDashboardPreferences(
    userId: string,
    sectionOrder: DashboardSectionId[]
  ): Promise<void> {
    const docPath = `users/${userId}/preferences/dashboard`;
    try {
      const payload = {
        userId,
        sectionOrder: sectionOrder.join(','),
        firstSection: sectionOrder[0] || 'timetable',
        updatedAt: Date.now(),
      };
      await setDoc(doc(db, 'users', userId, 'preferences', 'dashboard'), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, docPath);
    }
  },

  /**
   * Load dashboard layout preferences from Firestore
   */
  async loadDashboardPreferences(
    userId: string
  ): Promise<{ sectionOrder: DashboardSectionId[]; firstSection: DashboardSectionId } | null> {
    const docPath = `users/${userId}/preferences/dashboard`;
    try {
      const snap = await getDoc(doc(db, 'users', userId, 'preferences', 'dashboard'));
      if (snap.exists()) {
        const data = snap.data();
        const orderStr = data.sectionOrder as string;
        const sectionOrder = (orderStr ? orderStr.split(',') : []) as DashboardSectionId[];
        return {
          sectionOrder,
          firstSection: data.firstSection as DashboardSectionId,
        };
      }
      return null;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, docPath);
    }
  },
};
