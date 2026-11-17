const DATABASE = 'strata-local';
const VERSION = 1;
const STORE = 'sources';

type StoredSource = { id: string; name: string; type: string; bytes: Blob; savedAt: string };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support local file recovery.'));
      return;
    }
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'));
  });
}

export async function saveSourceFile(id: string, file: File): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({
        id, name: file.name, type: file.type, bytes: file, savedAt: new Date().toISOString(),
      } satisfies StoredSource);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not save the source file.'));
      tx.onabort = () => reject(tx.error ?? new Error('Saving the source file was aborted.'));
    });
  } finally { db.close(); }
}

export async function readSourceFile(id: string): Promise<File | null> {
  const db = await openDatabase();
  try {
    return await new Promise<File | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => {
        const record = request.result as StoredSource | undefined;
        resolve(record ? new File([record.bytes], record.name, { type: record.type, lastModified: Date.parse(record.savedAt) || Date.now() }) : null);
      };
      request.onerror = () => reject(request.error ?? new Error('Could not recover the source file.'));
    });
  } finally { db.close(); }
}

export async function deleteSourceFile(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not delete the local source file.'));
    });
  } finally { db.close(); }
}
