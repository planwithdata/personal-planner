import { useState, type FormEvent } from 'react';
import { analyticsPrompt, makeAnalyticsExport, type ExportOptions } from './analytics';
import { localDate, now, shiftDate, uid, weekStart, workStateLabels, type Planner, type Review, type Task, type WorkState } from './domain';
import { downloadText, prettyDate } from './ui';

export function Reviews({ planner, today, onSave, onComplete, onMove, onTrash, onEdit }: {
  planner: Planner; today: string; onSave: (review: Review) => void; onComplete: (task: Task) => void;
  onMove: (task: Task, date: string, state?: WorkState) => void; onTrash: (task: Task) => void; onEdit: (task: Task) => void;
}) {
  const [kind, setKind] = useState<Review['kind']>('daily');
  const [date, setDate] = useState(today);
  const start = kind === 'weekly' ? weekStart(date) : date;
  const end = kind === 'weekly' ? shiftDate(start, 6) : start;
  const nextDay = shiftDate(today > end ? today : end, 1);
  const active = planner.tasks.filter(task => !task.trashedAt);
  const unfinished = active.filter(task => {
    const dateToReview = task.plannedDate || task.dueDate;
    return task.status === 'open' && task.workState !== 'someday' && dateToReview && dateToReview <= end;
  });
  const complete = active.filter(task => {
    if (!task.completedAt) return false;
    const completed = localDate(new Date(task.completedAt));
    return completed >= start && completed <= end;
  });
  const stalled = active.filter(task => task.status === 'open' && (task.workState === 'blocked' || task.workState === 'waiting'));
  const missingNext = planner.projects.filter(project => project.status === 'active' &&
    !active.some(task => task.projectId === project.id && task.status === 'open' && task.workState === 'ready'));
  const saved = planner.reviews.find(review => review.kind === kind && review.periodStart === start);

  return (
    <div className="review-grid">
      <div className="review-main">
        <section className="card review-card">
          <div className="review-controls">
            <div className="segmented">
              {(['daily', 'weekly'] as const).map(item => <button key={item} className={item === kind ? 'selected capitalize' : 'capitalize'}
                aria-pressed={item === kind} onClick={() => setKind(item)}>{item}</button>)}
            </div>
            <label className="field">Review date<input type="date" value={date} onChange={event => { if (event.target.value) setDate(event.target.value); }} /></label>
          </div>
          <h2>{kind === 'daily' ? prettyDate(start, { weekday: 'long', day: 'numeric', month: 'long' }) : `${prettyDate(start)} – ${prettyDate(end)}`}</h2>
          <p>{complete.length} tasks completed · {unfinished.length} unfinished by the end of this period</p>
          <ReviewForm key={`${kind}:${start}`} saved={saved} kind={kind} periodStart={start} onSave={onSave} />
        </section>
        <section className="card review-card">
          <h2>Decide what carries forward</h2>
          <p>Choose the next step for unfinished plans and unscheduled deadlines. Moving a task keeps its deadline and existing time blocks.</p>
          {unfinished.length ? unfinished.map(task => <div className="review-task" key={task.id}>
            <button className="review-task-title" onClick={() => onEdit(task)}>{task.title}</button>
            <small>{workStateLabels[task.workState]}{task.dueDate ? ` · Due ${prettyDate(task.dueDate)}` : ''}</small>
            <div className="panel-actions">
              <button className="text-button" onClick={() => onComplete(task)}>Complete</button>
              <button className="text-button" onClick={() => onMove(task, nextDay, 'ready')}>Plan {prettyDate(nextDay)}</button>
              <button className="text-button" onClick={() => onMove(task, '', 'someday')}>Move to Someday</button>
              <button className="text-button danger-text" onClick={() => onTrash(task)}>Drop</button>
            </div>
          </div>) : <p className="muted">No unfinished tasks to review for this period.</p>}
        </section>
      </div>
      <aside className="review-side">
        <section className="card review-card">
          <h2>Needs attention</h2>
          <p>{stalled.length} waiting or blocked {stalled.length === 1 ? 'task' : 'tasks'}</p>
          {stalled.map(task => <button key={task.id} className="result-row" onClick={() => onEdit(task)}>{task.title}</button>)}
          <p>{missingNext.length} active {missingNext.length === 1 ? 'project needs' : 'projects need'} a ready next action</p>
          {missingNext.length > 0 && <ul className="attention-list">{missingNext.map(project => <li key={project.id}>{project.name}</li>)}</ul>}
        </section>
        <ExportPanel planner={planner} today={today} />
      </aside>
    </div>
  );
}

function ReviewForm({ saved, kind, periodStart, onSave }: {
  saved?: Review; kind: Review['kind']; periodStart: string; onSave: (review: Review) => void;
}) {
  const [wins, setWins] = useState(saved?.wins ?? '');
  const [blockers, setBlockers] = useState(saved?.blockers ?? '');
  const [nextActions, setNextActions] = useState(saved?.nextActions ?? '');
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({ id: saved?.id ?? uid(), kind, periodStart, wins, blockers, nextActions, updatedAt: now() });
  }
  return (
    <form onSubmit={submit} className="review-form">
      <label className="field">What moved forward?<textarea rows={3} maxLength={200000} value={wins} onChange={event => setWins(event.target.value)} /></label>
      <label className="field">What got in the way?<textarea rows={3} maxLength={200000} value={blockers} onChange={event => setBlockers(event.target.value)} /></label>
      <label className="field">What will you do next?<textarea rows={3} maxLength={200000} value={nextActions} onChange={event => setNextActions(event.target.value)} /></label>
      <div className="panel-actions">
        <button className="primary">Save review</button>
        {saved && <small className="muted">Saved {new Date(saved.updatedAt).toLocaleString()}</small>}
      </div>
    </form>
  );
}

function ExportPanel({ planner, today }: { planner: Planner; today: string }) {
  const [options, setOptions] = useState<ExportOptions>({
    kind: 'analytics', from: shiftDate(today, -29), through: today, projectId: '', includePrivateText: false
  });
  const [message, setMessage] = useState('');
  function exportJson(event: FormEvent) {
    event.preventDefault();
    try {
      const data = makeAnalyticsExport(planner, options);
      downloadText(`daylight-${options.kind}-${today}.json`, JSON.stringify(data, null, 2), 'application/json');
      setMessage(`Exported ${data.tasks.length} tasks, ${data.timeBlocks.length} blocks and ${data.activity.length} activity records.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not export this selection.');
    }
  }
  return (
    <section className="card review-card">
      <h2>Export for another chatbot</h2>
      <p>Choose an analytics period or hand off a single project with its context.</p>
      <form onSubmit={exportJson}>
        <label className="field">Export type<select value={options.kind} onChange={event => {
          const kind = event.target.value as ExportOptions['kind'];
          setOptions(current => ({ ...current, kind, includePrivateText: kind === 'project-handoff' }));
          setMessage('');
        }}><option value="analytics">Analytics</option><option value="project-handoff">Project handoff</option></select></label>
        <label className="field">Project<select value={options.projectId} required={options.kind === 'project-handoff'}
          onChange={event => setOptions(current => ({ ...current, projectId: event.target.value }))}>
          <option value="">{options.kind === 'analytics' ? 'All projects and unassigned tasks' : 'Choose a project'}</option>
          {planner.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select></label>
        {options.kind === 'analytics' && <div className="form-columns">
          <label className="field">From<input type="date" required value={options.from} onChange={event => setOptions(current => ({ ...current, from: event.target.value }))} /></label>
          <label className="field">Through<input type="date" required value={options.through} onChange={event => setOptions(current => ({ ...current, through: event.target.value }))} /></label>
        </div>}
        <label className="check-label">
          <input type="checkbox" checked={options.includePrivateText} onChange={event => setOptions(current => ({ ...current, includePrivateText: event.target.checked }))} />
          Include notes, decisions and review text
        </label>
        <p className="small muted">Task, project and time block titles are always included. Review your file before sharing.</p>
        <button className="primary">Download JSON</button>
      </form>
      {message && <p className="connection-state" role="status">{message}</p>}
      <button className="text-button prompt-download" onClick={() => downloadText('daylight-chatbot-prompt.txt', analyticsPrompt)}>Download companion prompt</button>
    </section>
  );
}
