import { localDate, shiftDate, weekStart, type Planner, type TimeBlock } from './domain.ts';

export type CalendarMode = 'month' | 'week' | 'agenda';
export type CalendarEvent = {
  id: string; calendarId: string; title: string; calendarName: string;
  start: string; end: string; allDay: boolean; busy: boolean; blockId?: string;
};

export function daysInView(date: string, mode: CalendarMode): string[] {
  if (mode === 'agenda') return Array.from({ length: 14 }, (_, i) => shiftDate(date, i));
  const first = mode === 'week' ? weekStart(date) : weekStart(`${date.slice(0, 7)}-01`);
  return Array.from({ length: mode === 'week' ? 7 : 42 }, (_, i) => shiftDate(first, i));
}

export function dayBounds(date: string): [number, number] {
  return [Date.parse(`${date}T00:00:00`), Date.parse(`${shiftDate(date, 1)}T00:00:00`)];
}

export function intervalsOverlap(start: number, end: number, otherStart: number, otherEnd: number) {
  return start < otherEnd && otherStart < end;
}

export function eventInterval(event: CalendarEvent): [number, number] {
  const suffix = event.allDay ? 'T00:00:00' : '';
  return [Date.parse(event.start + suffix), Date.parse(event.end + suffix)];
}

export function occursOn(item: Pick<TimeBlock, 'start' | 'end'> | CalendarEvent, date: string): boolean {
  const [start, end] = 'allDay' in item ? eventInterval(item) : [Date.parse(item.start), Date.parse(item.end)];
  const [dayStart, dayEnd] = dayBounds(date);
  return intervalsOverlap(start, end, dayStart, dayEnd);
}

export function blockMinutes(block: Pick<TimeBlock, 'start' | 'end'>, date?: string): number {
  let start = Date.parse(block.start);
  let end = Date.parse(block.end);
  if (date) {
    const [dayStart, dayEnd] = dayBounds(date);
    start = Math.max(start, dayStart);
    end = Math.min(end, dayEnd);
  }
  return Math.max(0, Math.round((end - start) / 60000));
}

export function dailyLoad(planner: Planner, date: string) {
  const blocks = planner.blocks.filter(block => !block.trashedAt && occursOn(block, date));
  const blockedMinutes = blocks.reduce((total, block) => total + blockMinutes(block, date), 0);
  const unallocatedMinutes = planner.tasks.reduce((total, task) => {
    if (task.trashedAt || task.status !== 'open' || task.workState !== 'ready' || task.plannedDate !== date) return total;
    const scheduled = blocks.filter(block => block.taskId === task.id).reduce((sum, block) => sum + blockMinutes(block, date), 0);
    return total + Math.max(0, task.estimate - scheduled);
  }, 0);
  return { blockedMinutes, unallocatedMinutes, total: blockedMinutes + unallocatedMinutes };
}

export function blockConflicts(draft: Pick<TimeBlock, 'id' | 'start' | 'end'>, blocks: TimeBlock[], events: CalendarEvent[]) {
  const start = Date.parse(draft.start);
  const end = Date.parse(draft.end);
  if (!(start < end)) return [];
  const local = blocks.filter(block => !block.trashedAt && block.id !== draft.id &&
    intervalsOverlap(start, end, Date.parse(block.start), Date.parse(block.end)));
  const remote = events.filter(event => event.busy && event.blockId !== draft.id &&
    !blocks.some(block => !block.trashedAt && block.id === event.blockId) &&
    intervalsOverlap(start, end, ...eventInterval(event)));
  return [...local, ...remote].map(item => item.title);
}

export function dateTimeInput(value: string) {
  const date = new Date(value);
  const time = [date.getHours(), date.getMinutes()].map(part => String(part).padStart(2, '0')).join(':');
  return `${localDate(date)}T${time}`;
}

export function readDateTimeInput(value: string): string | null {
  const date = new Date(value);
  // A missing wall-clock time during a daylight-saving transition is not a valid selection.
  if (!Number.isFinite(date.getTime()) || dateTimeInput(date.toISOString()) !== value) return null;
  return date.toISOString();
}
