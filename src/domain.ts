export type View = 'today' | 'inbox' | 'projects' | 'ideas' | 'calendar' | 'reviews' | 'settings';
export type Priority = 'high' | 'medium' | 'low';
export const workStates = ['ready', 'waiting', 'blocked', 'someday'] as const;
export type WorkState = typeof workStates[number];
export const workStateLabels: Record<WorkState, string> = {
  ready: 'Ready', waiting: 'Waiting on someone', blocked: 'Blocked', someday: 'Someday'
};
export type Subtask = { id: string; title: string; done: boolean };
export type Repeat = { cadence: 'daily' | 'weekly'; seriesId: string; occurrenceDate: string };
export type Task = {
  id: string; title: string; notes: string; projectId: string | null; ideaId: string | null;
  status: 'open' | 'done'; priority: Priority; plannedDate: string; dueDate: string; estimate: number;
  focus: boolean; createdAt: string; updatedAt: string; completedAt: string | null;
  workState: WorkState; subtasks: Subtask[]; repeat: Repeat | null; trashedAt: string | null;
};
export type Project = { id: string; name: string; outcome: string; color: string; status: 'active' | 'paused' | 'done'; createdAt: string; updatedAt: string };
export type Idea = { id: string; title: string; context: string; options: string; decision: string; nextSteps: string; projectId: string | null; createdAt: string; updatedAt: string };
export type Activity = {
  id: string; entityId: string; action: string; at: string; details?: string;
  projectId?: string | null; plannedDateBefore?: string; plannedDateAfter?: string;
};
export type TimeBlock = {
  id: string; title: string; taskId: string | null; start: string; end: string;
  actualMinutes: number | null; createdAt: string; updatedAt: string; trashedAt: string | null;
  google: { calendarId: string; syncedAt: string } | null;
};
export type Review = {
  id: string; kind: 'daily' | 'weekly'; periodStart: string;
  wins: string; blockers: string; nextActions: string; updatedAt: string;
};
export type Planner = {
  schemaVersion: 2; projects: Project[]; tasks: Task[]; ideas: Idea[]; activity: Activity[];
  blocks: TimeBlock[]; reviews: Review[]; capacityMinutes: number; isDemo: boolean; lastBackupAt: string | null;
};
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export function localDate(date = new Date()): string { return `${String(date.getFullYear()).padStart(4,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function shiftDate(value: string, days: number): string { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate()+days); return localDate(date); }
export function emptyPlanner(): Planner {
  return { schemaVersion: 2, projects: [], tasks: [], ideas: [], activity: [],
    blocks: [], reviews: [], capacityMinutes: 240, isDemo: false, lastBackupAt: null };
}
const taskDefaults = { workState: 'ready', subtasks: [], repeat: null, trashedAt: null } as const;
export function taskDraft(date = ''): Task {
  const time = now();
  return { ...taskDefaults, subtasks: [], id: uid(), title: '', notes: '', projectId: null,
    ideaId: null, status: 'open', priority: 'medium', plannedDate: date, dueDate: '',
    estimate: 0, focus: false, createdAt: time, updatedAt: time, completedAt: null };
}
export function toggleTask(task: Task): Task { const done = task.status !== 'done'; return { ...task, status: done ? 'done' : 'open', completedAt: done ? now() : null, updatedAt: now() }; }
export function noteActivity(planner: Planner, entityId: string, action: string, metadata: Partial<Omit<Activity,'id'|'entityId'|'action'|'at'>> = {}): Planner {
  return { ...planner, activity: [...planner.activity, { id: uid(), entityId, action, at: now(), ...metadata }] };
}

export function changeTaskCompletion(planner: Planner, id: string): Planner {
  const task = planner.tasks.find(item => item.id === id && !item.trashedAt);
  if (!task) return planner;
  const updated = toggleTask(task);
  const tasks = planner.tasks.map(item => item.id === id ? updated : item);
  if (updated.status === 'open' && !hasFocusRoom(tasks, updated)) updated.focus = false;
  const metadata = { projectId: task.projectId };
  let next = noteActivity({ ...planner, tasks }, id, updated.status === 'done' ? 'task.completed' : 'task.reopened', metadata);
  if (updated.status !== 'done' || !task.repeat) return next;

  const { cadence, seriesId, occurrenceDate } = task.repeat;
  const date = shiftDate(occurrenceDate, cadence === 'daily' ? 1 : 7);
  if (!validDate(date) || next.tasks.some(item => item.repeat?.seriesId === seriesId && item.repeat.occurrenceDate === date)) return next;
  const dueOffset = task.dueDate ? (Date.parse(task.dueDate) - Date.parse(occurrenceDate)) / 86_400_000 : 0;
  const nextDue = task.dueDate ? shiftDate(date, dueOffset) : '';
  const occurrence: Task = {
    ...taskDraft(date),
    title: task.title, notes: task.notes, projectId: task.projectId, ideaId: task.ideaId,
    priority: task.priority, estimate: task.estimate, dueDate: validDate(nextDue) ? nextDue : '',
    repeat: { cadence, seriesId, occurrenceDate: date },
    subtasks: task.subtasks.map(subtask => ({ ...subtask, id: uid(), done: false }))
  };
  next = { ...next, tasks: [...next.tasks, occurrence] };
  return noteActivity(next, occurrence.id, 'task.occurrence_created', { ...metadata, plannedDateAfter: date });
}

export function hasFocusRoom(tasks: Task[], task: Task): boolean {
  return tasks.filter(item => item.id !== task.id && !item.trashedAt &&
    item.status === 'open' && item.focus && item.workState === 'ready' && item.plannedDate === task.plannedDate).length < 3;
}

export function moveTask(planner: Planner, id: string, plannedDate: string, workState?: WorkState): Planner {
  const task = planner.tasks.find(item => item.id === id && !item.trashedAt && item.status === 'open');
  if (!task) return planner;
  const updated = { ...task, plannedDate, workState: workState ?? task.workState, updatedAt: now() };
  if (updated.workState !== 'ready' || !plannedDate || !hasFocusRoom(planner.tasks, updated)) updated.focus = false;
  return noteActivity({ ...planner, tasks: planner.tasks.map(item => item.id === id ? updated : item) },
    id, workState === 'someday' ? 'task.deferred' : 'task.rescheduled',
    { projectId: task.projectId, plannedDateBefore: task.plannedDate, plannedDateAfter: plannedDate });
}
export function seedPlanner(): Planner {
  const time = now(), today = localDate();
  const projects: Project[] = [
    { id: uid(), name: 'A space of my own', outcome: 'Make my home workspace a place where I can focus and feel good.', color: 'sage', status: 'active', createdAt: time, updatedAt: time },
    { id: uid(), name: 'Personal planner', outcome: 'Build a daily planning routine that actually fits my life.', color: 'clay', status: 'active', createdAt: time, updatedAt: time },
    { id: uid(), name: 'Learn something new', outcome: 'Choose one skill and make a small, steady start.', color: 'lavender', status: 'active', createdAt: time, updatedAt: time }
  ];
  const tasks: Task[] = [
    { ...taskDraft(today), title: 'Choose the three things that matter today', projectId: projects[1].id, estimate: 10, focus: true, priority: 'high' },
    { ...taskDraft(today), title: 'Sketch a few ideas for my workspace', projectId: projects[0].id, estimate: 30, focus: true },
    { ...taskDraft(today), title: 'Find a beginner-friendly course', projectId: projects[2].id, estimate: 20, priority: 'low' },
    { ...taskDraft(), title: 'Make a list of things I want to learn', projectId: null, estimate: 15 },
    { ...taskDraft(shiftDate(today,1)), title: 'Review the week ahead', projectId: projects[1].id, estimate: 15 }
  ];
  return { ...emptyPlanner(), isDemo: true, projects, tasks, ideas: [{ id: uid(), title: 'What would a better morning look like?', context: 'I want a little space before the day gets busy. This is a sample idea — make it your own.', options: 'A short walk\nTen minutes to plan\nRead a few pages over coffee', decision: '', nextSteps: 'Try a ten-minute planning session tomorrow', projectId: null, createdAt: time, updatedAt: time }] };
}
export function makeBackup(planner: Planner) { return { ...planner, exportedAt: now(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, application: 'Daylight', kind: 'backup' }; }
export function validDate(value: unknown): value is string { if (value === '') return true; if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const d = new Date(`${value}T12:00:00Z`); return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10) === value; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.length <= 200000; }
function timestamp(value: unknown) { return typeof value === 'string' && !Number.isNaN(Date.parse(value)); }
function nullableTimestamp(value: unknown) { return value === null || timestamp(value); }
function minutes(value: unknown, minimum = 0) { return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= 1440; }
export function validateBackup(input: unknown): Planner {
  if (!record(input) || (input.schemaVersion !== 1 && input.schemaVersion !== 2) ||
    (input.kind !== undefined && input.kind !== 'backup')) {
    throw new Error('This file is not a supported Daylight backup.');
  }
  const legacy = input.schemaVersion === 1;
  const keys = legacy ? ['tasks', 'projects', 'ideas', 'activity'] : ['tasks', 'projects', 'ideas', 'activity', 'blocks', 'reviews'];
  for (const key of keys) {
    const list = input[key];
    if (!Array.isArray(list) || list.length > 100000) throw new Error(`Invalid ${key} records.`);
  }
  const data = (legacy ? {
    ...emptyPlanner(), ...input, schemaVersion: 2, blocks: [], reviews: [], capacityMinutes: 240,
    tasks: (input.tasks as unknown[]).map(task => record(task) ? { ...task, ...taskDefaults } : task)
  } : input) as unknown as Planner;
  if (typeof data.isDemo !== 'boolean' || !(data.lastBackupAt === null || timestamp(data.lastBackupAt))) throw new Error('Invalid workspace metadata.');
  if (!minutes(data.capacityMinutes, 1)) throw new Error('Invalid daily capacity.');
  const ids = new Set<string>();
  function checkId(item: unknown): asserts item is Record<string, unknown> {
    if (!record(item) || !text(item.id) || !item.id || ids.has(item.id)) throw new Error('Backup contains missing or duplicate IDs.');
    ids.add(item.id);
  }
  for (const item of [...data.projects,...data.tasks,...data.ideas,...data.activity,...data.blocks,...data.reviews]) checkId(item);
  for (const p of data.projects) if (!text(p.name) || !p.name.trim() || !text(p.outcome) || !['sage','clay','lavender','blue'].includes(p.color) || !['active','paused','done'].includes(p.status) || !timestamp(p.createdAt) || !timestamp(p.updatedAt)) throw new Error('Invalid project data.');
  const projectIds = new Set(data.projects.map(p=>p.id)), ideaIds = new Set(data.ideas.map(i=>i.id));
  const occurrences = new Set<string>();
  for (const task of data.tasks) {
    if (!text(task.title) || !task.title.trim() || !text(task.notes) ||
      !['open', 'done'].includes(task.status) || !['high', 'medium', 'low'].includes(task.priority) ||
      !workStates.includes(task.workState) || !validDate(task.plannedDate) || !validDate(task.dueDate) ||
      !minutes(task.estimate) || typeof task.focus !== 'boolean' ||
      !(task.projectId === null || projectIds.has(task.projectId)) || !(task.ideaId === null || ideaIds.has(task.ideaId)) ||
      !timestamp(task.createdAt) || !timestamp(task.updatedAt) || !nullableTimestamp(task.completedAt) ||
      (task.status === 'done') !== (task.completedAt !== null) || !nullableTimestamp(task.trashedAt)) {
      throw new Error('Invalid task data or missing project/idea reference.');
    }
    if (!Array.isArray(task.subtasks) || task.subtasks.length > 10000) throw new Error('Invalid subtasks.');
    for (const subtask of task.subtasks) {
      checkId(subtask);
      if (!text(subtask.title) || !subtask.title.trim() || typeof subtask.done !== 'boolean') throw new Error('Invalid subtask.');
    }
    if (task.repeat !== null) {
      if (!record(task.repeat) || !['daily', 'weekly'].includes(task.repeat.cadence) ||
        !text(task.repeat.seriesId) || !task.repeat.seriesId || !validDate(task.repeat.occurrenceDate) || !task.repeat.occurrenceDate) {
        throw new Error('Invalid recurring task.');
      }
      const key = JSON.stringify([task.repeat.seriesId, task.repeat.occurrenceDate]);
      if (occurrences.has(key)) throw new Error('Duplicate recurring task occurrence.');
      occurrences.add(key);
    }
  }
  for (const i of data.ideas) if (![i.title,i.context,i.options,i.decision,i.nextSteps].every(text) || !(i.projectId === null || projectIds.has(i.projectId)) || !timestamp(i.createdAt) || !timestamp(i.updatedAt)) throw new Error('Invalid idea data.');
  for (const a of data.activity) {
    if (!text(a.entityId) || !text(a.action) || !timestamp(a.at) ||
      !(a.details === undefined || text(a.details)) ||
      !(a.projectId === undefined || a.projectId === null || text(a.projectId)) ||
      !(a.plannedDateBefore === undefined || validDate(a.plannedDateBefore)) ||
      !(a.plannedDateAfter === undefined || validDate(a.plannedDateAfter))) throw new Error('Invalid activity history.');
  }
  const taskIds = new Set(data.tasks.map(task => task.id));
  for (const block of data.blocks) {
    const length = Date.parse(block.end) - Date.parse(block.start);
    if (!text(block.title) || !block.title.trim() || !(block.taskId === null || taskIds.has(block.taskId)) ||
      !timestamp(block.start) || !timestamp(block.end) || length <= 0 || length > 86_400_000 ||
      !(block.actualMinutes === null || minutes(block.actualMinutes)) || !timestamp(block.createdAt) ||
      !timestamp(block.updatedAt) || !nullableTimestamp(block.trashedAt) ||
      !(block.google === null || (record(block.google) && text(block.google.calendarId) && block.google.calendarId && timestamp(block.google.syncedAt)))) {
      throw new Error('Invalid time block or missing task reference.');
    }
  }
  const reviewPeriods = new Set<string>();
  for (const review of data.reviews) {
    const key = `${review.kind}:${review.periodStart}`;
    if (!['daily', 'weekly'].includes(review.kind) || !validDate(review.periodStart) || !review.periodStart ||
      ![review.wins, review.blockers, review.nextActions].every(text) || !timestamp(review.updatedAt) ||
      (review.kind === 'weekly' && weekStart(review.periodStart) !== review.periodStart) || reviewPeriods.has(key)) {
      throw new Error('Invalid or duplicate review.');
    }
    reviewPeriods.add(key);
  }
  const { tasks, projects, ideas, activity, blocks, reviews, capacityMinutes, isDemo, lastBackupAt } = data;
  return { schemaVersion: 2, tasks, projects, ideas, activity, blocks, reviews, capacityMinutes, isDemo, lastBackupAt };
}

export function weekStart(date: string): string {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return shiftDate(date, -((weekday + 6) % 7));
}
