import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { accountClient, accountNamespace, signInWithGoogle } from './accounts';
import { createAccountStore, type WorkspaceStore } from './account-store';
import { loadPlanner, savePlanner } from './storage';
import { useReleaseStatus } from './useReleaseStatus';

export type AccountControls = {
  configured: boolean;
  signedIn: boolean;
  email?: string;
  busy: boolean;
  error: string;
  signIn: () => void;
  signOut: () => void;
};

const guestStore: WorkspaceStore = {
  load: loadPlanner,
  save: async planner => { await savePlanner(planner); return false; }
};
const guestKey = `daylight-guest:${new URL(import.meta.env.BASE_URL, location.href).pathname}`;

function rememberGuest(value: boolean) {
  try {
    if (value) sessionStorage.setItem(guestKey, 'true');
    else sessionStorage.removeItem(guestKey);
  } catch { /* The current tab can still use the guest planner. */ }
}

export function AccountGate({ children }: {
  children: (context: {
    identity: string;
    store: WorkspaceStore;
    release: ReturnType<typeof useReleaseStatus>;
    account: AccountControls;
  }) => ReactNode;
}) {
  const release = useReleaseStatus();
  const [session, setSession] = useState<Session | null | undefined>(accountClient ? undefined : null);
  const [guest, setGuest] = useState(() => {
    try { return sessionStorage.getItem(guestKey) === 'true'; }
    catch { return false; }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => new URLSearchParams(location.search).has('error')
    ? 'Google sign-in could not finish. Try again from this browser.' : '');
  const userId = session?.user.id;
  const store = useMemo(() => accountClient && userId
    ? createAccountStore(accountClient, accountNamespace, userId)
    : guestStore, [userId]);

  useEffect(() => {
    if (!accountClient) return;
    const { data: { subscription } } = accountClient.auth.onAuthStateChange((event, value) => {
      setSession(value);
      if (event === 'SIGNED_OUT') {
        rememberGuest(false);
        setGuest(false);
      }
      if (value) setError('');
      if (event === 'INITIAL_SESSION' && !value) {
        const callback = new URL(location.href);
        if (callback.searchParams.has('code')) {
          setError('Sign-in could not finish in this window. Start again here, or open Daylight in Safari to sign in there.');
          callback.searchParams.delete('code');
          history.replaceState(history.state, '', callback);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signIn() {
    setBusy(true);
    setError('');
    rememberGuest(false);
    try {
      await signInWithGoogle();
    } catch {
      setError('Could not start Google sign-in. Check your connection and try again.');
      setBusy(false);
    }
  }

  async function signOut() {
    if (!accountClient) return;
    setBusy(true);
    setError('');
    try {
      const { error } = await accountClient.auth.signOut({ scope: 'local' });
      if (error) throw error;
      setSession(null);
      setGuest(false);
    } catch {
      setError('Could not sign out. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (accountClient && (session === undefined || (!session && !guest))) {
    return (
      <main className="account-screen">
        <section className="card account-card">
          <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" width="56" height="56" />
          <h1>Welcome to Daylight</h1>
          <p>Sign in to open your personal planner and keep it with you across devices.</p>
          {session === undefined ? <p role="status">Checking your session…</p> : <>
            <button className="primary" disabled={busy || release.offline} onClick={() => void signIn()}>
              {busy ? 'Opening Google…' : 'Continue with Google'}
            </button>
            <button className="secondary" disabled={busy} onClick={() => { rememberGuest(true); setGuest(true); }}>Use on this device</button>
            {release.offline && <p role="status">Connect to the internet to sign in.</p>}
          </>}
          {error && <p className="form-message" role="alert">{error}</p>}
          {release.updateReady && <button className="text-button" onClick={release.applyUpdate}>Apply update</button>}
        </section>
      </main>
    );
  }

  return children({
    identity: userId ?? 'guest',
    store,
    release,
    account: {
      configured: Boolean(accountClient), signedIn: Boolean(userId), email: session?.user.email,
      busy, error, signIn: () => void signIn(), signOut: () => void signOut()
    }
  });
}
