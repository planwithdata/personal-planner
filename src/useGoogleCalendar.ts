import { useEffect, useRef, useState } from 'react';
import {
  CalendarError, createPlannerCalendar, googleRequest, isPlannerCalendar, listCalendars, listEvents,
  publishBlock, removeBlockEvent, READ_SCOPES, WRITE_SCOPE, type GoogleCalendar, type GoogleRequest
} from './google-calendar';
import type { TimeBlock } from './domain';
import type { CalendarEvent } from './schedule';

type OAuthResponse = { access_token?: string; expires_in?: string | number; scope?: string; error?: string };
type Identity = {
  initTokenClient(config: {
    client_id: string; scope: string; include_granted_scopes: boolean;
    callback: (response: OAuthResponse) => void;
    error_callback: (error: { type: string }) => void;
  }): { requestAccessToken(config: { prompt: string }): void };
  revoke(token: string, callback: (response: { successful: boolean }) => void): void;
};
type Token = { value: string; expiresAt: number; canWrite: boolean };

function identity() {
  return (window as Window & { google?: { accounts?: { oauth2?: Identity } } }).google?.accounts?.oauth2;
}

let identityLoad: Promise<void> | undefined;
function loadIdentity() {
  if (identity()) return Promise.resolve();
  identityLoad ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    function fail() {
      clearTimeout(timer);
      script.remove();
      reject(new Error('Could not load Google sign-in. Check your connection and retry.'));
    }
    const timer = setTimeout(fail, 12000);
    script.onload = () => {
      clearTimeout(timer);
      if (identity()) resolve();
      else fail();
    };
    script.onerror = fail;
    document.head.append(script);
  }).catch(error => { identityLoad = undefined; throw error; });
  return identityLoad;
}

function key(name: string) {
  return `daylight:${new URL(import.meta.env.BASE_URL, location.href).pathname}:${name}`;
}
function getPreference(name: string) {
  try { return localStorage.getItem(key(name)); } catch { return null; }
}
function setPreference(name: string, value: string) {
  try { localStorage.setItem(key(name), value); } catch { /* Connection works for this session. */ }
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Google Calendar could not complete the request.';
}

export function useGoogleCalendar() {
  const [clientId, setClientId] = useState(() => getPreference('clientId') || import.meta.env.VITE_GOOGLE_CLIENT_ID || '');
  const [prepared, setPrepared] = useState(false);
  const [token, setToken] = useState<Token | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [account, setAccount] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [calendarId, setCalendarId] = useState('');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [refreshed, setRefreshed] = useState<string | null>(null);
  const [range, setRange] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [fetchError, setFetchError] = useState('');
  const lock = useRef(false);

  function expire(current: Token) {
    setToken(value => value === current ? null : value);
    setError('Your Google session expired. Reconnect to refresh your calendars.');
  }

  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => expire(token), Math.max(0, token.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [token]);

  useEffect(() => {
    if (!token || !range) return;
    const controller = new AbortController();
    const [from, until] = range.split('|');
    const chosen = calendars.filter(calendar => selected.includes(calendar.id));
    const request = googleRequest(token.value);
    setFetching(true);
    setFetchError('');
    // Keep the last successful view visible when a refresh fails.
    Promise.all(chosen.map(calendar => listEvents(request, calendar, from, until, controller.signal)))
      .then(results => {
        if (controller.signal.aborted) return;
        setEvents(results.flat());
        setRefreshed(new Date().toISOString());
      }).catch(error => {
        if (controller.signal.aborted) return;
        if (error instanceof CalendarError && error.status === 401) expire(token);
        else setFetchError(errorText(error));
      }).finally(() => { if (!controller.signal.aborted) setFetching(false); });
    return () => controller.abort();
  }, [token, range, calendars, selected, refreshCount]);

  function begin() {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError('');
    return true;
  }
  function finish() {
    lock.current = false;
    setBusy(false);
  }

  async function prepare(id: string) {
    if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id.trim())) {
      setError('Enter the web OAuth client ID from Google Cloud.');
      return;
    }
    if (!begin()) return;
    try {
      await loadIdentity();
      setClientId(id.trim());
      setPreference('clientId', id.trim());
      setPrepared(true);
    } catch (error) { setError(errorText(error)); }
    finally { finish(); }
  }

  function connect() {
    const auth = identity();
    if (!prepared || !auth || !begin()) return;
    let finished = false;
    function end() {
      finished = true;
      clearTimeout(timeout);
      finish();
    }
    const timeout = setTimeout(() => {
      setError('Google sign-in took too long. Try connecting again.');
      end();
    }, 120000);
    try {
      const client = auth.initTokenClient({
        client_id: clientId,
        scope: [...READ_SCOPES, WRITE_SCOPE].join(' '),
        include_granted_scopes: false,
        error_callback: ({ type }) => {
          if (finished) return;
          setError(type === 'popup_failed_to_open' ? 'Google sign-in needs a popup. Try from Safari or Chrome.' : 'Google sign-in was closed. Try again when ready.');
          end();
        },
        callback: async response => {
          if (finished) return;
          try {
            const granted = new Set(response.scope?.split(/\s+/));
            if (response.error || !response.access_token || !READ_SCOPES.every(scope => granted.has(scope))) {
              throw new Error('Grant calendar list and event viewing access to connect.');
            }
            const next: Token = {
              value: response.access_token,
              expiresAt: Date.now() + Math.max(1, Number(response.expires_in) || 3600) * 1000,
              canWrite: granted.has(WRITE_SCOPE)
            };
            const list = await listCalendars(googleRequest(next.value));
            if (finished) return;
            const primary = list.find(calendar => calendar.primary);
            const accountId = primary?.id ?? '';
            const preference = getPreference(`calendars:${accountId}`);
            let stored: unknown;
            try { stored = preference === null ? null : JSON.parse(preference); } catch { stored = null; }
            const ids = Array.isArray(stored)
              ? list.filter(calendar => stored.includes(calendar.id)).map(calendar => calendar.id)
              : primary ? [primary.id] : list.slice(0, 1).map(calendar => calendar.id);
            const plannerCalendars = list.filter(isPlannerCalendar);
            const savedTarget = getPreference(`plannerCalendar:${accountId}`);
            setCalendarId(plannerCalendars.find(calendar => calendar.id === savedTarget)?.id ?? plannerCalendars[0]?.id ?? '');
            setSelected(ids);
            setCalendars(list);
            setAccount(accountId);
            setEvents([]);
            setRefreshed(null);
            setToken(next);
          } catch (error) {
            if (!finished) setError(errorText(error));
          } finally {
            if (!finished) end();
          }
        }
      });
      client.requestAccessToken({ prompt: 'select_account' });
    } catch (error) { setError(errorText(error)); end(); }
  }

  async function withWrite<T>(operation: (request: GoogleRequest) => Promise<T>): Promise<T | undefined> {
    if (!token?.canWrite || !begin()) return undefined;
    try { return await operation(googleRequest(token.value)); }
    catch (error) {
      if (error instanceof CalendarError && error.status === 401) expire(token);
      else setError(errorText(error));
      return undefined;
    } finally { finish(); }
  }

  function chooseCalendar(id: string) {
    setCalendarId(id);
    setPreference(`plannerCalendar:${account}`, id);
  }

  function selectCalendar(id: string, visible: boolean) {
    const next = visible ? [...new Set([...selected, id])] : selected.filter(item => item !== id);
    setSelected(next);
    setEvents(current => current.filter(event => next.includes(event.calendarId)));
    setPreference(`calendars:${account}`, JSON.stringify(next));
  }

  async function setupCalendar() {
    const calendar = await withWrite(createPlannerCalendar);
    if (!calendar) return;
    setCalendars(current => [...current.filter(item => item.id !== calendar.id), calendar]);
    chooseCalendar(calendar.id);
  }

  async function sync(block: TimeBlock, remove: boolean) {
    const target = block.google?.calendarId ?? calendarId;
    if (!calendars.some(calendar => calendar.id === target && isPlannerCalendar(calendar))) {
      setError('Connect the account that owns this block’s Personal Planner calendar.');
      return undefined;
    }
    return withWrite(async request => {
      if (remove) await removeBlockEvent(request, target, block);
      else await publishBlock(request, target, block);
      setRefreshCount(count => count + 1);
      return remove ? null : { calendarId: target, syncedAt: new Date().toISOString() };
    });
  }

  function disconnect() {
    if (busy) return;
    const auth = identity();
    if (token && auth) {
      auth.revoke(token.value, response => {
        if (!response.successful) setError('Disconnected here. You can remove Daylight’s access in your Google Account.');
      });
    }
    setToken(null);
    setCalendars([]);
    setSelected([]);
    setCalendarId('');
    setEvents([]);
    setRefreshed(null);
    setAccount('');
    setError('');
    setFetchError('');
    setFetching(false);
  }

  return {
    clientId, prepared, prepare, connected: Boolean(token), canWrite: Boolean(token?.canWrite), connect, disconnect,
    changeClient: () => { setPrepared(false); setError(''); },
    calendars, account, selected, selectCalendar, calendarId, chooseCalendar, setupCalendar, events,
    refreshed, setRange, busy, fetching: Boolean(token && fetching), error: error || fetchError,
    refresh: () => setRefreshCount(count => count + 1), sync
  };
}

export type GoogleConnection = ReturnType<typeof useGoogleCalendar>;
