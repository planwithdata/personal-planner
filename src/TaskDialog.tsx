import { useState, type FormEvent } from 'react';
import { uid, validDate, workStateLabels, workStates, type Project, type Task } from './domain';
import { Modal } from './ui';

export function TaskDialog({ task, projects, today, onSave, onClose, onTrash, onSchedule, exists, error }: {
  task: Task; projects: Project[]; today: string; onSave: (task: Task) => void;
  onClose: () => void; onTrash: () => void; onSchedule: (task: Task) => void; exists: boolean; error: string;
}) {
  const [draft, setDraft] = useState(task);
  const [cadence, setCadence] = useState<'' | 'daily' | 'weekly'>(task.repeat?.cadence ?? '');
  const [formError, setFormError] = useState('');
  const [subtask, setSubtask] = useState('');

  function field<K extends keyof Task>(key: K, value: Task[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function addSubtask() {
    const title = subtask.trim();
    if (!title) return;
    field('subtasks', [...draft.subtasks, { id: uid(), title, done: false }]);
    setSubtask('');
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) { setFormError('Give this task a title.'); return; }
    if (!validDate(draft.plannedDate) || !validDate(draft.dueDate)) {
      setFormError('Choose valid dates for the planned day and deadline.');
      return;
    }
    const focus = draft.focus && draft.workState === 'ready';
    const plannedDate = (focus || cadence) ? draft.plannedDate || today : draft.plannedDate;
    const repeat = cadence === task.repeat?.cadence ? task.repeat : cadence ? {
      cadence, seriesId: uid(), occurrenceDate: plannedDate
    } : null;
    const extraSubtask = subtask.trim();
    if (draft.subtasks.some(item => !item.title.trim())) {
      setFormError('Give each subtask a title or remove the empty row.');
      return;
    }
    const subtasks = draft.subtasks.map(item => ({ ...item, title: item.title.trim() }));
    if (extraSubtask) subtasks.push({ id: uid(), title: extraSubtask, done: false });
    onSave({ ...draft, notes: draft.notes.slice(0, 200000), plannedDate, focus, repeat, subtasks });
  }

  return (
    <Modal title={exists ? 'Edit task' : 'One small next step'} onClose={onClose}>
      <form onSubmit={submit} className="modal-body">
        <label className="field">What do you need to do?
          <input data-initial-focus required maxLength={200} placeholder="Give your task a clear next action"
            value={draft.title} onChange={event => field('title', event.target.value)} />
        </label>
        <label className="field">Notes
          <textarea rows={3} maxLength={200000} placeholder="Context, a link, or something to remember"
            value={draft.notes} onChange={event => field('notes', event.target.value)} />
        </label>
        <label className="field">Project
          <select value={draft.projectId ?? ''} onChange={event => field('projectId', event.target.value || null)}>
            <option value="">No project</option>
            {projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}
          </select>
        </label>
        <div className="form-columns">
          <label className="field">Planned day<input type="date" value={draft.plannedDate} onChange={event => field('plannedDate', event.target.value)} /></label>
          <label className="field">Deadline<input type="date" value={draft.dueDate} onChange={event => field('dueDate', event.target.value)} /></label>
        </div>
        <div className="form-columns">
          <label className="field">Priority
            <select value={draft.priority} onChange={event => field('priority', event.target.value as Task['priority'])}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </label>
          <label className="field">Estimated minutes
            <input type="number" min="0" max="1440" step="1" value={draft.estimate || ''} placeholder="Optional"
              onChange={event => field('estimate', Number(event.target.value))} />
          </label>
        </div>
        <div className="form-columns">
          <label className="field">Work state
            <select value={draft.workState} onChange={event => field('workState', event.target.value as Task['workState'])}>
              {workStates.map(state => <option value={state} key={state}>{workStateLabels[state]}</option>)}
            </select>
          </label>
          <label className="field">Repeat
            <select value={cadence} disabled={task.status === 'done'} onChange={event => setCadence(event.target.value as typeof cadence)}>
              <option value="">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option>
            </select>
          </label>
        </div>
        {cadence && <p className="small muted repeat-hint">Completing this occurrence adds the next one. Changing the planned day keeps the repeat schedule.</p>}
        <label className="check-label">
          <input type="checkbox" disabled={draft.workState !== 'ready'} checked={draft.focus && draft.workState === 'ready'}
            onChange={event => field('focus', event.target.checked)} />
          Make this one of my three daily priorities
        </label>
        <fieldset className="subtask-list">
          <legend>Subtasks</legend>
          {draft.subtasks.map(item => <div key={item.id} className="subtask-row">
            <input type="checkbox" checked={item.done} aria-label={`Complete subtask ${item.title}`}
              onChange={event => field('subtasks', draft.subtasks.map(candidate => candidate.id === item.id ? { ...candidate, done: event.target.checked } : candidate))} />
            <input aria-label="Subtask title" required value={item.title} maxLength={200}
              onChange={event => field('subtasks', draft.subtasks.map(candidate => candidate.id === item.id ? { ...candidate, title: event.target.value } : candidate))} />
            <button type="button" className="icon-button" aria-label={`Remove subtask ${item.title}`}
              onClick={() => field('subtasks', draft.subtasks.filter(candidate => candidate.id !== item.id))}>✕</button>
          </div>)}
          <div className="subtask-row">
            <input aria-label="New subtask" placeholder="A smaller step" value={subtask} maxLength={200}
              onChange={event => setSubtask(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addSubtask(); } }} />
            <button type="button" className="secondary" disabled={!subtask.trim()} onClick={addSubtask}>Add subtask</button>
          </div>
        </fieldset>
        {(formError || error) && <p className="form-message" role="alert">{formError || error}</p>}
        {exists && <button type="button" className="text-button" onClick={() => onSchedule(task)}>Schedule a time block for this saved task</button>}
        <div className="modal-actions">
          {exists && <button type="button" className="text-button danger-text delete-task" onClick={onTrash}>Move to trash</button>}
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" type="submit">{exists ? 'Save changes' : 'Add task'}</button>
        </div>
      </form>
    </Modal>
  );
}
