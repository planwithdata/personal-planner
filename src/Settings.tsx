import { useEffect, useRef, useState } from 'react';
import type { Planner, Task } from './domain';
import type { AccountControls } from './AccountGate';

export function Settings({ planner, account, accountActionDisabled, exportBackup, importBackup, clearWorkspace, restoreTask, setCapacity }: {
  planner: Planner; exportBackup: () => void; importBackup: (file: File | undefined) => void;
  clearWorkspace: () => void; restoreTask: (task: Task) => void; setCapacity: (minutes: number) => void;
  account: AccountControls; accountActionDisabled: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [capacity, setCapacityInput] = useState(String(planner.capacityMinutes));
  const [storage, setStorage] = useState<StorageEstimate>();
  const [persistent, setPersistent] = useState<boolean>();
  const [message, setMessage] = useState('');
  const trash = planner.tasks.filter(task => task.trashedAt);
  const daysSinceBackup = planner.lastBackupAt ? Math.floor((Date.now() - Date.parse(planner.lastBackupAt)) / 86_400_000) : null;
  const percentUsed = storage?.quota && storage.usage !== undefined ? Math.round(storage.usage / storage.quota * 100) : null;

  useEffect(() => {
    let active = true;
    navigator.storage?.estimate?.().then(value => { if (active) setStorage(value); }).catch(() => {});
    navigator.storage?.persisted?.().then(value => { if (active) setPersistent(value); }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function requestStorage() {
    try {
      const granted = await navigator.storage.persist();
      setPersistent(granted);
      setMessage(granted ? 'Your browser granted persistent storage.' : 'Your browser manages storage automatically. Keep a current JSON backup.');
    } catch { setMessage('This browser could not change its storage mode.'); }
  }

  return (
    <div className="settings-grid">
      <div>
        <section className="card settings-card">
          <h2>Keep a copy of your plans</h2>
          <p>Save a complete JSON backup with tasks, time blocks, reviews, private notes, and history.</p>
          <p className="backup-date">{planner.lastBackupAt
            ? `Last export requested ${new Date(planner.lastBackupAt).toLocaleString()}${daysSinceBackup !== null && daysSinceBackup >= 7 ? ' · Time for a fresh backup' : ''}`
            : 'No backup exported yet.'}</p>
          <button className="primary" onClick={exportBackup}>Export JSON backup</button>
          <div className="settings-divider" />
          <h3>Restore a workspace</h3>
          <p>Choose a Daylight backup. Review its record counts before replacing the workspace.</p>
          <input ref={fileRef} hidden type="file" accept=".json,application/json" aria-label="Choose backup file"
            onChange={event => { importBackup(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
          <button className="secondary" onClick={() => fileRef.current?.click()}>Choose backup file</button>
        </section>
        <section className="card settings-card reset-card">
          <h3>Recently removed tasks</h3>
          {trash.length ? trash.map(task => <div className="recovery-row" key={task.id}>
            <span>{task.title}</span><button className="text-button" onClick={() => restoreTask(task)}>Restore</button>
          </div>) : <p>Tasks moved to trash can be restored here.</p>}
        </section>
      </div>
      <div>
        <section className="card settings-card account-settings">
          <h2>Account</h2>
          {account.signedIn ? <>
            <p>{account.email ?? 'Signed in with Google'}</p>
            <p>Edits save to this device first and sync to your account when connected.</p>
            <button className="secondary" onClick={account.signOut} disabled={account.busy || accountActionDisabled}>Sign out</button>
          </> : <>
            <p>This workspace is stored on this device. To move it into an account, export a backup and restore it after signing in.</p>
            {account.configured ? <button className="secondary" onClick={account.signIn} disabled={account.busy || accountActionDisabled}>
              Continue with Google
            </button> : <p>Google sign-in is awaiting site setup.</p>}
          </>}
          {account.error && <p className="form-message" role="alert">{account.error}</p>}
        </section>
        <section className="card settings-card">
          <h2>Daily capacity</h2>
          <p>How many minutes can you usually set aside for planned work? Calendar and Today compare this with your blocks and unallocated estimates.</p>
          <form onSubmit={event => {
            event.preventDefault();
            const minutes = Number(capacity);
            if (Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440) setCapacity(minutes);
          }}>
            <label className="field">Minutes per day<input type="number" min="1" max="1440" required value={capacity} onChange={event => setCapacityInput(event.target.value)} /></label>
            <button className="secondary">Save capacity</button>
          </form>
          <div className="settings-divider" />
          <h3>Device storage</h3>
          <p>{percentUsed === null ? 'Storage quota is managed by your browser.' :
            `This site is using about ${percentUsed}% of the browser’s reported storage quota.`}</p>
          {percentUsed !== null && percentUsed >= 80 && <p className="form-message">Storage is nearly full. Export a backup now.</p>}
          {persistent && <p>Persistent storage is enabled.</p>}
          {!persistent && typeof navigator.storage?.persist === 'function' && <button className="secondary" onClick={() => void requestStorage()}>Request persistent storage</button>}
          {message && <p role="status">{message}</p>}
        </section>
        <section className="card settings-card reset-card">
          <h3>Install on iPhone</h3>
          <p>Open the deployed site in Safari. Tap Share, then Add to Home Screen. Open Daylight from the new icon.</p>
        </section>
        <section className="card settings-card reset-card">
          <h3>Clear workspace</h3>
          <p>Remove planner data from {account.signedIn ? 'this account and its synced workspace' : 'this device'}. Export a backup first to keep a copy. Published events can be managed in Google Calendar.</p>
          <button className="text-button danger-text" onClick={clearWorkspace}>Clear workspace</button>
        </section>
      </div>
    </div>
  );
}
