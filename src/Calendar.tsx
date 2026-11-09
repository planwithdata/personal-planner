import { useEffect, useState, type FormEvent } from 'react';
import { localDate, now, shiftDate, uid, type Planner, type Task, type TimeBlock } from './domain';
import { isPlannerCalendar } from './google-calendar';
import {
  blockConflicts, blockMinutes, dailyLoad, daysInView, dateTimeInput, occursOn, readDateTimeInput,
  type CalendarEvent, type CalendarMode
} from './schedule';
import { duration, Modal, prettyDate } from './ui';
import type { GoogleConnection } from './useGoogleCalendar';

export function newTimeBlock(date: string, task?: Task): TimeBlock {
  const start = new Date(`${date}T09:00:00`);
  const end = new Date(start.getTime() + Math.min(task?.estimate || 30, 180) * 60000);
  const at = now();
  return {
    id: uid(), title: task?.title ?? '', taskId: task?.id ?? null,
    start: start.toISOString(), end: end.toISOString(), actualMinutes: null,
    createdAt: at, updatedAt: at, trashedAt: null, google: null
  };
}

function GoogleSettings({ google }: { google: GoogleConnection }) {
  const [clientId, setClientId] = useState(google.clientId);
  const plannerCalendars = google.calendars.filter(isPlannerCalendar);
  return (
    <details className="card google-settings">
      <summary>Google Calendar <span>{google.connected ? 'Connected' : 'Connect'}</span></summary>
      <div className="google-settings-body">
        {!google.connected ? (
          <>
            <p>See selected calendars alongside your plans. Publish time blocks to a dedicated Personal Planner calendar.</p>
            {!google.prepared ? (
              <form onSubmit={event => { event.preventDefault(); void google.prepare(clientId); }}>
                <label className="field">Google web OAuth client ID
                  <input value={clientId} onChange={event => setClientId(event.target.value)}
                    placeholder="…apps.googleusercontent.com" spellCheck={false} autoCapitalize="off" required />
                </label>
                <button className="secondary" disabled={google.busy}>Prepare Google sign-in</button>
              </form>
            ) : <div className="panel-actions">
              <button className="primary" disabled={google.busy} onClick={google.connect}>Connect Google Calendar</button>
              <button className="text-button" disabled={google.busy} onClick={google.changeClient}>Change client ID</button>
            </div>}
            <p className="small muted">Use your Google Cloud OAuth client. Google sessions expire and can be reconnected here.</p>
          </>
        ) : (
          <>
            <div className="panel-actions">
              <button className="secondary" onClick={google.refresh} disabled={google.fetching}>Refresh events</button>
              <button className="text-button" onClick={google.disconnect} disabled={google.busy}>Disconnect</button>
            </div>
            <fieldset className="calendar-picker">
              <legend>Show these calendars</legend>
              {google.calendars.map(calendar => (
                <label key={calendar.id} className="check-label">
                  <input type="checkbox" checked={google.selected.includes(calendar.id)}
                    onChange={event => google.selectCalendar(calendar.id, event.target.checked)} />
                  {calendar.summaryOverride ?? calendar.summary}
                </label>
              ))}
            </fieldset>
            {google.canWrite ? (
              plannerCalendars.length ? (
                <label className="field">Publish new blocks to
                  <select value={google.calendarId} disabled={google.busy} onChange={event => google.chooseCalendar(event.target.value)}>
                    {plannerCalendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.summary}</option>)}
                  </select>
                </label>
              ) : <button className="secondary" disabled={google.busy} onClick={() => void google.setupCalendar()}>Create Personal Planner calendar</button>
            ) : <p className="small muted">Viewing is enabled. To publish blocks, disconnect and grant the permission to create and manage a planner calendar.</p>}
          </>
        )}
        <p className="connection-state" role="status">
          {google.busy ? 'Working with Google…' : google.fetching ? 'Refreshing events…' :
            google.refreshed ? `Events last refreshed ${new Date(google.refreshed).toLocaleString()}` : 'No Google events loaded yet.'}
        </p>
        {google.error && <p className="form-message" role="alert">{google.error}</p>}
      </div>
    </details>
  );
}

type Entry = { id: string; title: string; label: string; type: 'task' | 'deadline' | 'block' | 'google'; open?: () => void };
function timeLabel(item: Pick<TimeBlock, 'start' | 'end'>) {
  const format = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${format.format(new Date(item.start))} – ${format.format(new Date(item.end))}`;
}

export function Calendar({ planner, today, date, setDate, google, editTask, addTask, addBlock, editBlock, restoreBlock, syncBlock }: {
  planner: Planner; today: string; date: string; setDate: (date: string) => void; google: GoogleConnection;
  editTask: (task: Task) => void; addTask: (date: string) => void; addBlock: (date: string) => void;
  editBlock: (block: TimeBlock) => void; restoreBlock: (block: TimeBlock) => void;
  syncBlock: (block: TimeBlock, remove: boolean) => Promise<void>;
}) {
  const [mode, setMode] = useState<CalendarMode>('week');
  const days = daysInView(date, mode);
  const rangeStart = new Date(`${days[0]}T00:00:00`).toISOString();
  const rangeEnd = new Date(`${shiftDate(days.at(-1)!, 1)}T00:00:00`).toISOString();
  const setRange = google.setRange;
  useEffect(() => {
    setRange(`${rangeStart}|${rangeEnd}`);
    return () => setRange('');
  }, [rangeStart, rangeEnd, setRange]);

  const tasks = planner.tasks.filter(task => !task.trashedAt && (task.workState !== 'someday' || task.status === 'done'));
  const blocks = planner.blocks.filter(block => !block.trashedAt);
  const events = google.events.filter(event => !blocks.some(block =>
    block.id === event.blockId && (block.google?.calendarId ?? google.calendarId) === event.calendarId));
  const removed = planner.blocks.filter(block => block.trashedAt);

  function entries(day: string): Entry[] {
    const timedBlocks = blocks.filter(block => occursOn(block, day)).map(block => ({
      id: block.id, title: block.title, label: timeLabel(block), type: 'block' as const,
      open: () => editBlock(block), start: Date.parse(block.start)
    }));
    const googleEntries = events.filter(event => occursOn(event, day)).map(event => ({
      id: `${event.calendarId}:${event.id}`, title: event.title,
      label: `${event.allDay ? 'All day' : timeLabel(event)} · ${event.calendarName}`, type: 'google' as const,
      start: event.allDay ? -Infinity : Date.parse(event.start)
    }));
    const taskEntries = tasks.flatMap(task => {
      const result: Entry[] = [];
      if (task.plannedDate === day) result.push({
        id: `plan:${task.id}`, title: task.title, label: task.status === 'done' ? 'Completed' : 'Planned task',
        type: 'task', open: () => editTask(task)
      });
      if (task.dueDate === day) result.push({
        id: `due:${task.id}`, title: task.title, label: task.status === 'done' ? 'Deadline · completed' : 'Deadline',
        type: 'deadline', open: () => editTask(task)
      });
      return result;
    });
    const timed = [...timedBlocks, ...googleEntries].sort((a, b) => a.start - b.start);
    return [...timed, ...taskEntries];
  }

  function navigate(amount: number) {
    if (mode === 'month') {
      const next = new Date(`${date.slice(0, 7)}-01T12:00:00`);
      next.setMonth(next.getMonth() + amount);
      setDate(localDate(next));
    } else setDate(shiftDate(date, amount * (mode === 'week' ? 7 : 14)));
  }

  function dayAgenda(day: string, showEmpty: boolean) {
    const items = entries(day);
    if (!showEmpty && !items.length && day !== date) return null;
    const load = dailyLoad(planner, day);
    return (
      <section className="agenda-day" key={day}>
        <div className="agenda-day-head">
          <div>
            <h3>{prettyDate(day, { weekday: 'long', day: 'numeric', month: 'short' })}{day === today ? ' · Today' : ''}</h3>
            {load.total > 0 && <span className={load.total > planner.capacityMinutes ? 'overdue-text' : 'muted'}>
              {duration(load.total)} planned / {duration(planner.capacityMinutes)} capacity
            </span>}
          </div>
          <button className="text-button" onClick={() => addBlock(day)} aria-label={`Add time block on ${day}`}>+ Block</button>
        </div>
        {items.length ? items.map(item => {
          const content = <><span className={`entry-dot ${item.type}`} /><span><strong>{item.title}</strong><small>{item.label}</small></span></>;
          return item.open
            ? <button key={item.id} className="schedule-entry" onClick={item.open}>{content}</button>
            : <div key={item.id} className="schedule-entry">{content}</div>;
        }) : <p className="empty-day">Nothing scheduled.</p>}
        {day === date && <button className="inline-add" onClick={() => addTask(day)}>+ Plan a task on this day</button>}
      </section>
    );
  }

  return (
    <div className="calendar-layout">
      <GoogleSettings google={google} />
      <section className="card calendar-card">
        <div className="card-heading calendar-heading">
          <div className="calendar-title">
            <button className="icon-button" aria-label={`Previous ${mode === 'agenda' ? 'two weeks' : mode}`} onClick={() => navigate(-1)}>←</button>
            <h2>{mode === 'month' ? prettyDate(date, { month: 'long', year: 'numeric' }) : `${prettyDate(days[0])} – ${prettyDate(days.at(-1)!)}`}</h2>
            <button className="icon-button" aria-label={`Next ${mode === 'agenda' ? 'two weeks' : mode}`} onClick={() => navigate(1)}>→</button>
          </div>
          <div className="calendar-controls">
            <button className="text-button" onClick={() => setDate(today)}>Today</button>
            <div className="segmented">
              {(['week', 'month', 'agenda'] as const).map(item => <button key={item} aria-pressed={mode === item}
                className={mode === item ? 'selected capitalize' : 'capitalize'} onClick={() => setMode(item)}>{item}</button>)}
            </div>
          </div>
        </div>
        <div className="calendar-note"><i className="dot sage" /> Time blocks, planned tasks, deadlines, and selected Google events</div>
        {mode === 'month' && <>
          <div className="weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div>
          <div className="month-grid">{days.map(day => {
            const items = entries(day);
            return (
              <div key={day} className={`calendar-day ${day.slice(0, 7) !== date.slice(0, 7) ? 'other-month' : ''} ${day === today ? 'is-today' : ''} ${day === date ? 'selected-day' : ''}`}>
                <button className="day-number" aria-label={`Show ${day}`} aria-pressed={day === date} onClick={() => setDate(day)}>{Number(day.slice(-2))}</button>
                {items.slice(0, 2).map(item => <button className={`calendar-task ${item.type}`} key={item.id}
                  onClick={() => { setDate(day); item.open?.(); }}>{item.title}</button>)}
                {items.length > 2 && <button className="calendar-more" onClick={() => setDate(day)}>+{items.length - 2} more</button>}
              </div>
            );
          })}</div>
        </>}
        {mode === 'week' && <div className="week-strip">{days.map(day => <button key={day} aria-pressed={day === date}
          className={day === date ? 'selected' : ''} onClick={() => setDate(day)}>
          <span>{prettyDate(day, { weekday: 'short' })}</span><strong>{Number(day.slice(-2))}</strong><small>{entries(day).length} items</small>
        </button>)}</div>}
        <div className="agenda">{mode === 'agenda' ? days.map(day => dayAgenda(day, false)) : dayAgenda(date, true)}</div>
      </section>
      {removed.length > 0 && <details className="card google-settings">
        <summary>Recently removed time blocks <span>{removed.length}</span></summary>
        <div className="google-settings-body">
          <p>Restore a block or remove its published Google copy. Local removal keeps the Google copy available for you to manage.</p>
          {removed.map(block => <div className="recovery-row" key={block.id}>
            <span>{block.title}</span>
            <button className="text-button" onClick={() => restoreBlock(block)}>Restore</button>
            {google.canWrite && (block.google || google.calendarId) && <button className="text-button danger-text" disabled={google.busy}
              onClick={() => void syncBlock(block, true)}>Remove Google copy</button>}
          </div>)}
          {google.error && <p className="form-message" role="alert">{google.error}</p>}
        </div>
      </details>}
    </div>
  );
}

export function TimeBlockDialog({ block, stored, planner, google, onSave, onClose, onTrash, onSync }: {
  block: TimeBlock; stored?: TimeBlock; planner: Planner; google: GoogleConnection;
  onSave: (block: TimeBlock) => void; onClose: () => void; onTrash: (block: TimeBlock) => void;
  onSync: (block: TimeBlock, remove: boolean) => Promise<void>;
}) {
  const [title, setTitle] = useState(block.title);
  const [taskId, setTaskId] = useState(block.taskId ?? '');
  const [startInput, setStart] = useState(dateTimeInput(block.start));
  const [endInput, setEnd] = useState(dateTimeInput(block.end));
  const [actual, setActual] = useState(block.actualMinutes?.toString() ?? '');
  const [error, setError] = useState('');
  const start = stored && dateTimeInput(stored.start) === startInput ? stored.start : readDateTimeInput(startInput);
  const end = stored && dateTimeInput(stored.end) === endInput ? stored.end : readDateTimeInput(endInput);
  const validDuration = start && end ? Date.parse(end) - Date.parse(start) : 0;
  const dirty = !stored || title.trim() !== stored.title || taskId !== (stored.taskId ?? '') ||
    start !== stored.start || end !== stored.end || actual !== (stored.actualMinutes?.toString() ?? '');
  const conflicts = start && end ? blockConflicts({ id: block.id, start, end }, planner.blocks, google.events) : [];
  const taskOptions = planner.tasks.filter(task => !task.trashedAt || task.id === taskId);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) { setError('Give this time block a title.'); return; }
    if (!start || !end || validDuration <= 0 || validDuration > 86_400_000) {
      setError('Choose a valid start and end time up to 24 hours apart.');
      return;
    }
    onSave({ ...block, google: stored?.google ?? null, title: title.trim(), taskId: taskId || null,
      start, end, actualMinutes: actual === '' ? null : Number(actual), updatedAt: now() });
  }

  function confirmRemove() {
    if (stored && confirm('Remove this block’s event from Google Calendar? The local block will remain.')) void onSync(stored, true);
  }

  return (
    <Modal title={stored ? 'Edit time block' : 'Reserve a time block'} onClose={onClose}>
      <form className="modal-body" onSubmit={submit}>
        <label className="field">Block title<input required maxLength={200} data-initial-focus value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label className="field">Linked task
          <select value={taskId} onChange={event => setTaskId(event.target.value)}>
            <option value="">Standalone block</option>
            {taskOptions.map(task => <option key={task.id} value={task.id}>{task.title}{task.trashedAt ? ' (removed)' : ''}</option>)}
          </select>
        </label>
        <div className="block-times">
          <label className="field">Starts<input required type="datetime-local" value={startInput} onChange={event => setStart(event.target.value)} /></label>
          <label className="field">Ends<input required type="datetime-local" value={endInput} onChange={event => setEnd(event.target.value)} /></label>
        </div>
        <p className="small muted">Times shown in {timeZone}.{start && end && validDuration > 0 ? ` Planned duration ${duration(blockMinutes({ start, end }))}.` : ''}</p>
        <label className="field">Actual minutes (optional)
          <input type="number" min="0" max="1440" step="1" value={actual} onChange={event => setActual(event.target.value)} placeholder="Leave blank until measured" />
        </label>
        {conflicts.length > 0 && <p className="form-message" role="status">Overlaps with {conflicts.slice(0, 4).join(', ')}{conflicts.length > 4 ? ` and ${conflicts.length - 4} more` : ''}.</p>}
        {error && <p className="form-message" role="alert">{error}</p>}
        {stored && <div className="publish-panel">
          <p>{stored.google ? (stored.updatedAt > stored.google.syncedAt ? 'Local changes are ready to publish.' : 'This block was published to Google Calendar.') :
            'This time block is saved on this device.'}</p>
          <div className="panel-actions">
            <button type="button" className="secondary" disabled={dirty || !google.canWrite || !google.calendarId || google.busy}
              onClick={() => void onSync(stored, false)}>{stored.google ? 'Update Google event' : 'Publish to Google'}</button>
            {stored.google && <button type="button" className="text-button danger-text" disabled={!google.canWrite || google.busy}
              onClick={confirmRemove}>Remove Google copy</button>}
          </div>
          {dirty && <p className="small muted">Save changes before publishing.</p>}
          {!google.canWrite && <p className="small muted">Connect Google Calendar and set up a planner calendar to publish.</p>}
          {google.error && <p className="form-message" role="alert">{google.error}</p>}
        </div>}
        <div className="modal-actions">
          {stored && <button type="button" className="text-button danger-text delete-task" disabled={google.busy}
            onClick={() => onTrash(stored)}>Move to trash</button>}
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={google.busy}>Save block</button>
        </div>
      </form>
    </Modal>
  );
}
