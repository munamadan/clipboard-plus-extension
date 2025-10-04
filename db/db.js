// IndexedDB Wrapper for ClipBoard+
// Simplified wrapper - main logic is in background.js

const DB_NAME = 'ClipboardDB';
const DB_VERSION = 1;
const STORE_NAME = 'clipboardItems';

class ClipboardDB {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('pinned', 'pinned', { unique: false });
        }
      };
    });
  }

  async add(item) {
    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await store.put(item);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(item);
    });
  }

  async getAll() {
    const tx = this.db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
  }

  async delete(id) {
    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await store.delete(id);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
    });
  }

  async clear() {
    const tx = this.db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await store.clear();
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
    });
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ClipboardDB;
}