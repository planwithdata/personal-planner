import { seedPlanner, validateBackup, type Planner } from './domain';

type Snapshot = { format: 'daylight-device'; revision: string; planner: Planner };
let revision: string | null = null;
let loaded: Planner | undefined;
let dbPromise: Promise<IDBDatabase> | undefined;
let writes = Promise.resolve();

export class WorkspaceConflictError extends Error {
  constructor() { super('Another Daylight tab saved a newer workspace. Export these edits as a backup before reloading.'); }
}

function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<Snapshot>;
  return snapshot.format === 'daylight-device' && typeof snapshot.revision === 'string';
}

function revisionOf(value: unknown): string | null {
  if (isSnapshot(value)) return value.revision;
  return value === undefined ? null : 'legacy';
}

function database(): Promise<IDBDatabase> {
  return dbPromise ??= new Promise((resolve,reject)=>{
    const req = indexedDB.open('daylight-planner',1);
    req.onupgradeneeded = () => req.result.createObjectStore('workspace');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Close other Daylight tabs to open storage.'));
  });
}
export async function loadPlanner(): Promise<Planner> {
  const db = await database();
  const saved = await new Promise<unknown>((resolve,reject)=>{
    const req = db.transaction('workspace').objectStore('workspace').get('current');
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  revision = revisionOf(saved);
  if (saved === undefined) return seedPlanner();
  const planner = validateBackup(isSnapshot(saved) ? saved.planner : saved);
  // A read-only tab should not create a new revision just by opening the app.
  loaded = isSnapshot(saved) ? planner : undefined;
  return planner;
}
export function savePlanner(data: Planner): Promise<void> {
  if (data === loaded) return Promise.resolve();
  const snapshot: Snapshot = { format: 'daylight-device', revision: crypto.randomUUID(), planner: structuredClone(data) };
  const write = writes.catch(() => {}).then(async () => {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('workspace', 'readwrite');
      const store = tx.objectStore('workspace');
      const previous = store.get('current');
      let conflict = false;
      previous.onsuccess = () => {
        if (revisionOf(previous.result) !== revision) {
          conflict = true;
          tx.abort();
          return;
        }
        store.put(snapshot, 'current');
      };
      tx.oncomplete = () => { revision = snapshot.revision; resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(conflict ? new WorkspaceConflictError() : tx.error ?? new Error('Save interrupted.'));
    });
  });
  writes = write;
  return write;
}
