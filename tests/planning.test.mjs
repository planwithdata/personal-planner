import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';
import { changeTaskCompletion, emptyPlanner, makeBackup, moveTask, now, seedPlanner, taskDraft, validateBackup } from '../src/domain.ts';
import { blockConflicts, dailyLoad, daysInView, occursOn } from '../src/schedule.ts';
import { makeAnalyticsExport } from '../src/analytics.ts';
import { CalendarError, googleEventId, PLANNER_MARKER, publishBlock, removeBlockEvent } from '../src/google-calendar.ts';

const day = '2026-11-09';
const time = (value) => new Date(value).toISOString();
function block(overrides = {}) {
  return {
    id: 'block-1', title: 'Deep work', taskId: null, start: time(day + 'T09:00:00'), end: time(day + 'T10:00:00'),
    createdAt: now(), updatedAt: now(), actualMinutes: null, trashedAt: null, google: null, ...overrides
  };
}

test('a Phase 1 backup keeps IDs, dates, relationships and activity when it migrates', () => {
  const data = seedPlanner();
  const { blocks, reviews, capacityMinutes, ...base } = data;
  const legacyTasks = data.tasks.map(({ subtasks, workState, trashedAt, repeat, ...original }) => original);
  const restored = validateBackup({ ...base, schemaVersion: 1, tasks: legacyTasks });
  assert.deepEqual(restored, data);
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(makeBackup(restored)))), restored);
});

test('reopening and recompleting a moved occurrence keeps one next instance and its deadline', () => {
  const task = {
    ...taskDraft(day), title: 'Weekly check', dueDate: '2026-11-11',
    repeat: { cadence: 'weekly', seriesId: 'weekly', occurrenceDate: day },
    subtasks: [{ id: 'subtask', title: 'Check balance', done: true }]
  };
  let data = moveTask({ ...emptyPlanner(), tasks: [task] }, task.id, '2026-11-10');
  data = changeTaskCompletion(data, task.id);
  const next = data.tasks[1];
  assert.equal(next.plannedDate, '2026-11-16');
  assert.equal(next.dueDate, '2026-11-18');
  assert.equal(next.subtasks[0].done, false);
  assert.notEqual(next.subtasks[0].id, 'subtask');
  assert.equal(data.tasks[0].dueDate, '2026-11-11');
  data = changeTaskCompletion(changeTaskCompletion(data, task.id), task.id);
  assert.equal(data.tasks.length, 2);
  assert.equal(data.activity.filter(event => event.action === 'task.occurrence_created').length, 1);
  assert.equal(data.activity[0].plannedDateBefore, day);
  assert.equal(data.activity[0].plannedDateAfter, '2026-11-10');
  assert.doesNotThrow(() => validateBackup(makeBackup(data)));
});

test('capacity avoids double-counting task estimates and overlapping days are split', () => {
  const task = { ...taskDraft(day), title: 'Estimate', estimate: 90 };
  const linked = block({ taskId: task.id });
  const overnight = block({ id: 'overnight', start: time(day + 'T23:30:00'), end: time('2026-11-10T00:30:00') });
  const data = { ...emptyPlanner(), tasks: [task], blocks: [linked, overnight] };
  assert.deepEqual(dailyLoad(data, day), { blockedMinutes: 90, unallocatedMinutes: 30, total: 120 });
  assert.equal(dailyLoad(data, '2026-11-10').total, 30);
  assert.equal(daysInView(day, 'week')[0], day);
});

test('Google all-day ends are exclusive and transparent events do not cause conflicts', () => {
  const event = {
    id: 'event', calendarId: 'primary', title: 'All day away', calendarName: 'Personal',
    allDay: true, busy: true, start: day, end: '2026-11-10'
  };
  assert.equal(occursOn(event, day), true);
  assert.equal(occursOn(event, '2026-11-10'), false);
  const adjacent = block({ id: 'later', start: time(day + 'T10:00:00'), end: time(day + 'T11:00:00') });
  assert.deepEqual(blockConflicts(block(), [adjacent], [event, { ...event, busy: false, title: 'Free' }]), ['All day away']);
});

test('analytics exports validate, preserve measured effort, and omit private text and Google data by default', async () => {
  const schema = JSON.parse(await readFile(new URL('../docs/daylight-analytics.schema.json', import.meta.url), 'utf8'));
  const validate = new Ajv({ strict: false }).compile(schema);
  const data = seedPlanner();
  const projectId = data.projects[0].id;
  const task = { ...taskDraft(day), title: 'Actual work', notes: 'Private task note', projectId, estimate: 120 };
  data.tasks = [task, { ...taskDraft(day), title: 'Other project', projectId: data.projects[1].id }];
  data.ideas = [{ ...data.ideas[0], decision: 'Private decision', projectId }];
  data.blocks = [
    block({ taskId: task.id, google: { calendarId: 'private-calendar', syncedAt: now() } }),
    block({ id: 'actual', taskId: task.id, actualMinutes: 0 })
  ];
  const filtered = makeAnalyticsExport(data, { kind: 'analytics', from: day, through: day, projectId, includePrivateText: false });
  assert.equal(validate(filtered), true, JSON.stringify(validate.errors));
  assert.equal(filtered.tasks.length, 1);
  assert.equal(filtered.tasks[0].estimatedMinutes, 120);
  assert.deepEqual(filtered.timeBlocks.map(item => item.actualMinutes), [null, 0]);
  assert.doesNotMatch(JSON.stringify(filtered), /Private task note|Private decision|private-calendar|Other project/);
  const handoff = makeAnalyticsExport(data, { kind: 'project-handoff', from: '', through: '', projectId, includePrivateText: true });
  assert.equal(validate(handoff), true, JSON.stringify(validate.errors));
  assert.equal(handoff.ideas[0].decision, 'Private decision');
  assert.equal(handoff.scope.from, null);
  assert.throws(() => validateBackup(handoff), /supported/);
});

test('Google publishing uses a stable id on retries and rejects an event with another owner marker', async () => {
  const draft = block();
  const eventId = await googleEventId(draft.id);
  assert.match(eventId, /^[0-9a-v]+$/);
  const calendar = { id: 'owned', accessRole: 'owner', description: PLANNER_MARKER };
  let event;
  const methods = [];
  const request = async (path, options = {}) => {
    if (path.startsWith('/users/me/calendarList/')) return calendar;
    methods.push(options.method ?? 'GET');
    if (options.method === 'POST') {
      event = JSON.parse(options.body);
      assert.equal(event.id, eventId);
      assert.equal(event.extendedProperties.private.daylightBlockId, draft.id);
      return event;
    }
    if (!event) throw new CalendarError(404, 'missing');
    if (options.method === 'DELETE') { event = undefined; return; }
    if (options.method === 'PATCH') event = { ...event, ...JSON.parse(options.body) };
    return event;
  };
  await publishBlock(request, 'owned', draft);
  await publishBlock(request, 'owned', { ...draft, title: 'Updated' });
  assert.equal(event.summary, 'Updated');
  assert.equal(methods.filter(method => method === 'POST').length, 1);
  event.extendedProperties.private.daylightBlockId = 'other';
  await assert.rejects(() => removeBlockEvent(request, 'owned', draft), /does not belong/);
  event.extendedProperties.private.daylightBlockId = draft.id;
  await removeBlockEvent(request, 'owned', draft);
  await removeBlockEvent(request, 'owned', draft);
  assert.equal(methods.filter(method => method === 'DELETE').length, 1);
});
