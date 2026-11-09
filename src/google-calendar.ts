import type { TimeBlock } from './domain.ts';
import type { CalendarEvent } from './schedule.ts';

const SCOPE = 'https://www.googleapis.com/auth/';
export const READ_SCOPES = [SCOPE + 'calendar.calendarlist.readonly', SCOPE + 'calendar.events.readonly'];
export const WRITE_SCOPE = SCOPE + 'calendar.app.created';
export const PLANNER_MARKER = 'Time blocks managed by Daylight (daylight-planner-v1)';

export type GoogleCalendar = {
  id: string; summary: string; summaryOverride?: string; description?: string;
  accessRole: string; primary?: boolean;
};

type GoogleEvent = {
  id: string; summary?: string; status?: string; etag?: string; transparency?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
  attendees?: unknown[];
};

type Page<T> = { items?: T[]; nextPageToken?: string };
export class CalendarError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type GoogleRequest = <T>(path: string, options?: RequestInit) => Promise<T>;
export function googleRequest(token: string): GoogleRequest {
  return async <T>(path: string, options: RequestInit = {}): Promise<T> => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timeout = setTimeout(abort, 20000);
    const { signal, ...rest } = options;
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const headers = new Headers(rest.headers);
      headers.set('Authorization', `Bearer ${token}`);
      if (rest.body) headers.set('Content-Type', 'application/json');
      const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
        ...rest, headers, signal: controller.signal
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        const message = typeof error?.error?.message === 'string' ? error.error.message : `Google Calendar returned ${response.status}.`;
        throw new CalendarError(response.status, message);
      }
      return response.status === 204 ? undefined as T : await response.json() as T;
    } catch (error) {
      if (controller.signal.aborted && !signal?.aborted) throw new Error('Google Calendar timed out. Try again.');
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  };
}

async function pages<T>(request: GoogleRequest, path: string, params: URLSearchParams, signal?: AbortSignal) {
  const records: T[] = [];
  const seen = new Set<string>();
  while (true) {
    const page = await request<Page<T>>(`${path}?${params}`, { signal });
    records.push(...(page.items ?? []));
    if (!page.nextPageToken) return records;
    if (seen.has(page.nextPageToken)) throw new Error('Google Calendar returned a repeated page.');
    seen.add(page.nextPageToken);
    params.set('pageToken', page.nextPageToken);
  }
}

export function listCalendars(request: GoogleRequest) {
  return pages<GoogleCalendar>(request, '/users/me/calendarList', new URLSearchParams({ showHidden: 'true' }));
}

export function isPlannerCalendar(calendar: GoogleCalendar) {
  return calendar.accessRole === 'owner' && calendar.description === PLANNER_MARKER && !calendar.primary;
}

export async function listEvents(request: GoogleRequest, calendar: GoogleCalendar, from: string, until: string, signal?: AbortSignal): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({ timeMin: from, timeMax: until, singleEvents: 'true', showDeleted: 'false', maxResults: '250' });
  const events = await pages<GoogleEvent>(request, `/calendars/${encodeURIComponent(calendar.id)}/events`, params, signal);
  return events.flatMap(event => {
    const allDay = Boolean(event.start?.date);
    const start = allDay ? event.start?.date : event.start?.dateTime;
    const end = allDay ? event.end?.date : event.end?.dateTime;
    if (event.status === 'cancelled' || !start || !end || !(Date.parse(start) < Date.parse(end))) return [];
    return [{
      id: event.id, calendarId: calendar.id, calendarName: calendar.summaryOverride ?? calendar.summary,
      title: event.summary || 'Busy', start, end, allDay,
      busy: event.transparency !== 'transparent',
      blockId: isPlannerCalendar(calendar) ? event.extendedProperties?.private?.daylightBlockId : undefined
    }];
  });
}

export async function createPlannerCalendar(request: GoogleRequest) {
  const calendars = await listCalendars(request);
  const existing = calendars.filter(isPlannerCalendar);
  if (existing.length) return existing[0];
  const created = await request<GoogleCalendar>('/calendars', {
    method: 'POST',
    body: JSON.stringify({
      summary: 'Personal Planner', description: PLANNER_MARKER,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    })
  });
  return { ...created, accessRole: 'owner' };
}

export async function googleEventId(blockId: string) {
  // Google accepts base32hex event IDs. Hex is a subset of that alphabet.
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(blockId));
  return 'dl' + Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function missing(error: unknown) {
  return error instanceof CalendarError && (error.status === 404 || error.status === 410);
}

async function ownedCalendarPath(request: GoogleRequest, calendarId: string) {
  const id = encodeURIComponent(calendarId);
  const calendar = await request<GoogleCalendar>(`/users/me/calendarList/${id}`);
  if (!isPlannerCalendar(calendar)) throw new Error('Select a calendar created by Daylight before publishing blocks.');
  return `/calendars/${id}/events`;
}

async function existingEvent(request: GoogleRequest, path: string) {
  try { return await request<GoogleEvent>(path); }
  catch (error) { if (missing(error)) return null; throw error; }
}

function checkOwnership(event: GoogleEvent, block: TimeBlock) {
  if (event.extendedProperties?.private?.daylightBlockId !== block.id) {
    throw new Error('This Google event does not belong to this time block.');
  }
  if (event.attendees?.length) throw new Error('Manage this event with guests directly in Google Calendar.');
}

export async function publishBlock(request: GoogleRequest, calendarId: string, block: TimeBlock) {
  if (block.trashedAt) throw new Error('Restore this time block before publishing it.');
  if (block.google && block.google.calendarId !== calendarId) throw new Error('Reconnect to the calendar where this block was published.');
  const eventsPath = await ownedCalendarPath(request, calendarId);
  const id = await googleEventId(block.id);
  const path = `${eventsPath}/${id}`;
  const body = {
    summary: block.title, visibility: 'private',
    start: { dateTime: block.start }, end: { dateTime: block.end },
    extendedProperties: { private: { daylightBlockId: block.id } }
  };
  let existing = await existingEvent(request, path);
  if (!existing) {
    try {
      await request(eventsPath + '?sendUpdates=none', { method: 'POST', body: JSON.stringify({ id, ...body }) });
      return;
    } catch (error) {
      if (!(error instanceof CalendarError) || error.status !== 409) throw error;
      existing = await existingEvent(request, path);
    }
  }
  if (!existing || existing.status === 'cancelled') {
    throw new Error('Google still holds this deleted event ID. Create a new time block to publish a new event.');
  }
  checkOwnership(existing, block);
  await request(path + '?sendUpdates=none', {
    method: 'PATCH', body: JSON.stringify(body), headers: existing.etag ? { 'If-Match': existing.etag } : undefined
  });
}

export async function removeBlockEvent(request: GoogleRequest, calendarId: string, block: TimeBlock) {
  if (block.google && block.google.calendarId !== calendarId) throw new Error('Reconnect to the calendar where this block was published.');
  const eventsPath = await ownedCalendarPath(request, calendarId);
  const path = `${eventsPath}/${await googleEventId(block.id)}`;
  const event = await existingEvent(request, path);
  if (!event || event.status === 'cancelled') return;
  checkOwnership(event, block);
  try {
    await request(path + '?sendUpdates=none', {
      method: 'DELETE', headers: event.etag ? { 'If-Match': event.etag } : undefined
    });
  } catch (error) {
    if (!missing(error)) throw error;
  }
}
