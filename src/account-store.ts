import type { SupabaseClient } from '@supabase/supabase-js';
import { emptyPlanner, validateBackup, type Planner } from './domain';
import { database, readWorkspace, WorkspaceConflictError } from './storage';

type AccountCache = {
  version: string;
  revision: string;
  syncedRevision: string | null;
  sentRevision: string | null;
  planner: Planner;
};
type RemoteWorkspace = { revision: string; planner: Planner };

export interface WorkspaceStore {
  load(): Promise<Planner>;
  save(planner: Planner): Promise<boolean>;
  sync?(): Promise<void>;
  useCloudCopy?(): Promise<Planner>;
}

export class CloudWorkspaceConflictError extends Error {
  constructor() {
    super('Another device saved a newer cloud copy. Export your local edits before switching to the cloud copy.');
  }
}

export function createAccountStore(client: SupabaseClient, namespace: string, userId: string): WorkspaceStore {
  const key = `account:${namespace}:${userId}`;
  const table = 'daylight_workspaces';
  let current: AccountCache | null = null;
  let lastPlanner: Planner | null = null;
  let queued: Promise<unknown> = Promise.resolve();

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = queued.then(work);
    queued = next.catch(() => {});
    return next;
  }

  function dirty() {
    return Boolean(current && current.revision !== current.syncedRevision);
  }

  async function readRemote(): Promise<RemoteWorkspace | null> {
    const { data, error } = await client.from(table).select('revision, planner').eq('user_id', userId).maybeSingle();
    if (error) throw new Error(`Could not open your cloud workspace. ${error.message}`);
    return data ? { revision: data.revision, planner: validateBackup(data.planner) } : null;
  }

  async function writeCache(record: Omit<AccountCache, 'version'> | null) {
    const next = record && { ...record, version: crypto.randomUUID() };
    const expected = current?.version;
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('workspace', 'readwrite');
      const store = tx.objectStore('workspace');
      const request = store.get(key);
      let conflict = false;
      request.onsuccess = () => {
        if (request.result?.version !== expected) {
          conflict = true;
          tx.abort();
          return;
        }
        if (next) store.put(next, key);
        else store.delete(key);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(conflict ? new WorkspaceConflictError() : tx.error ?? new Error('Could not save the device copy.'));
    });
    current = next;
  }

  async function adoptRemote(remote: RemoteWorkspace | null) {
    if (remote) {
      await writeCache({ ...remote, syncedRevision: remote.revision, sentRevision: null });
      lastPlanner = remote.planner;
    } else {
      if (current) await writeCache(null);
      lastPlanner = emptyPlanner();
    }
    return lastPlanner;
  }

  return {
    load: () => enqueue(async () => {
      const cached = await readWorkspace(key) as AccountCache | undefined;
      current = cached ? { ...cached, planner: validateBackup(cached.planner) } : null;
      if (current && (dirty() || !navigator.onLine)) {
        lastPlanner = current.planner;
        return lastPlanner;
      }
      let remote: RemoteWorkspace | null;
      try {
        remote = await readRemote();
      } catch (error) {
        if (!current) throw error;
        lastPlanner = current.planner;
        return lastPlanner;
      }
      return adoptRemote(remote);
    }),
    save: planner => enqueue(async () => {
      if (planner !== lastPlanner) {
        await writeCache({
          revision: crypto.randomUUID(),
          syncedRevision: current?.syncedRevision ?? null,
          sentRevision: current?.sentRevision ?? null,
          planner
        });
        lastPlanner = planner;
      }
      return dirty();
    }),
    sync: () => enqueue(async () => {
      if (!current || !dirty()) return;
      const remote = await readRemote();
      const remoteRevision = remote?.revision ?? null;
      if (remoteRevision === current.revision) {
        await writeCache({ ...current, syncedRevision: current.revision, sentRevision: null });
        return;
      }
      // A prior request can have reached the server even when its response was lost.
      if (current.sentRevision && remoteRevision === current.sentRevision) {
        await writeCache({ ...current, syncedRevision: remoteRevision, sentRevision: null });
      }
      if (!current || remoteRevision !== current.syncedRevision) throw new CloudWorkspaceConflictError();
      const { revision, planner } = current;
      await writeCache({ ...current, sentRevision: revision });
      const query = client.from(table);
      const result = remoteRevision
        ? await query.update({ revision, planner }).eq('user_id', userId).eq('revision', remoteRevision).select('revision').maybeSingle()
        : await query.insert({ user_id: userId, revision, planner }).select('revision').single();
      if (result.error?.code === '23505' || (!result.error && result.data?.revision !== revision)) {
        throw new CloudWorkspaceConflictError();
      }
      if (result.error) throw new Error(`Cloud sync could not finish. ${result.error.message}`);
      if (current) await writeCache({ ...current, syncedRevision: revision, sentRevision: null });
    }),
    useCloudCopy: () => enqueue(async () => adoptRemote(await readRemote()))
  };
}
