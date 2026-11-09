import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PLANNER_MARKER } from '../../src/google-calendar';

const appUrl = 'http://127.0.0.1:4174/personal-planner/';

function today(page: Page) {
  return page.evaluate(() => new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date()));
}

async function createTask(page: Page, title: string) {
  await page.getByRole('button', { name: 'Add task', exact: true }).first().click();
  await page.getByLabel('What do you need to do?').fill(title);
  await page.getByRole('dialog').getByRole('button', { name: 'Add task', exact: true }).click();
}

test('mobile task recurrence, review, JSON handoff, and restore', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  const mobile = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(page.getByRole('heading', { name: 'Make room for what matters.' })).toBeVisible();
  await page.getByRole('button', { name: 'Add task', exact: true }).first().click();
  await expect(page.getByLabel('What do you need to do?')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add task', exact: true }).first().click();
  await page.getByLabel('What do you need to do?').fill('Morning journal');
  await page.getByLabel('Notes', { exact: true }).fill('Private review note');
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption({ label: 'Personal planner' });
  await page.getByRole('combobox', { name: 'Repeat', exact: true }).selectOption('daily');
  await page.getByLabel('New subtask').fill('Write three lines');
  await page.getByRole('button', { name: 'Add subtask' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add task', exact: true }).click();
  await page.getByRole('button', { name: 'Complete Morning journal', exact: true }).click();

  await mobile.getByRole('button', { name: 'Projects' }).click();
  await expect(page.getByRole('button', { name: 'Complete Morning journal', exact: true })).toHaveCount(1);
  await page.locator('.task-main').filter({ hasText: 'Morning journal' }).click();
  await expect(page.getByRole('checkbox', { name: 'Complete subtask Write three lines' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Move to trash' }).click();
  await mobile.getByRole('button', { name: 'More' }).click();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByText('Tasks moved to trash can be restored here.')).toBeVisible();

  await mobile.getByRole('button', { name: 'Reviews' }).click();
  await page.getByLabel('What moved forward?').fill('Private reflection');
  await page.getByRole('button', { name: 'Save review' }).click();
  await expect(page.getByText('Review saved.', { exact: true })).toBeVisible();
  const analyticsDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
  const analytics = JSON.parse(await readFile((await (await analyticsDownload).path())!, 'utf8'));
  expect(analytics.kind).toBe('analytics');
  expect(analytics.tasks.some((task: { title: string }) => task.title === 'Morning journal')).toBe(true);
  expect(JSON.stringify(analytics)).not.toMatch(/Private (review note|reflection)/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('combobox', { name: 'Export type' }).selectOption('project-handoff');
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption({ label: 'Personal planner' });
  const handoffDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
  const handoff = JSON.parse(await readFile((await (await handoffDownload).path())!, 'utf8'));
  expect(handoff.kind).toBe('project-handoff');
  expect(handoff.projects.map((project: { name: string }) => project.name)).toEqual(['Personal planner']);
  expect(JSON.stringify(handoff)).toContain('Private review note');

  await mobile.getByRole('button', { name: 'More' }).click();
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON backup', exact: true }).click();
  const backup = await readFile((await (await backupDownload).path())!);
  const file = page.locator('input[type=file]');
  await file.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{ invalid') });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await file.setInputFiles({ name: 'daylight-backup.json', mimeType: 'application/json', buffer: backup });
  await page.getByRole('button', { name: 'Replace workspace' }).click();
  await expect(page.getByText('Workspace restored.', { exact: true })).toBeVisible();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await mobile.getByRole('button', { name: 'Reviews' }).click();
  await expect(page.getByLabel('What moved forward?')).toHaveValue('Private reflection');
  expect(errors).toEqual([]);
});

test('legacy device data survives migration, concurrent edits, offline reload, and worker update', async ({ page, context, request }) => {
  await page.goto('http://127.0.0.1:4174/seed');
  const date = await today(page);
  await page.evaluate(async date => {
    const at = new Date().toISOString();
    const original = {
      schemaVersion: 1, isDemo: false, lastBackupAt: null, projects: [], ideas: [],
      tasks: [{
        id: 'legacy-task', title: 'Keep my existing task', notes: 'Original notes', projectId: null, ideaId: null,
        status: 'open', priority: 'medium', plannedDate: date, dueDate: '', estimate: 20, focus: false,
        createdAt: at, updatedAt: at, completedAt: null
      }],
      activity: [{ id: 'legacy-event', entityId: 'legacy-task', action: 'task.created', at }]
    };
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('daylight-planner', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('workspace');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('workspace', 'readwrite');
        tx.objectStore('workspace').put(original, 'current');
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, date);

  await page.goto(appUrl);
  await expect(page.getByText('Keep my existing task', { exact: true })).toBeVisible();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  const second = await context.newPage();
  await second.goto(appUrl);
  await expect(second.getByText('Keep my existing task', { exact: true })).toBeVisible();
  await createTask(second, 'Saved from the second tab');
  await expect(second.getByText('Saved on this device', { exact: true })).toBeVisible();
  await createTask(page, 'Unsaved from the stale tab');
  await expect(page.getByRole('alert')).toContainText('Another Daylight tab saved');
  await second.close();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Keep my existing task', { exact: true })).toBeVisible();
  await expect(page.getByText('Saved from the second tab', { exact: true })).toBeVisible();
  await expect(page.getByText('Unsaved from the stale tab', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Offline · Local planning and backups are available.')).toBeVisible();
  await createTask(page, 'Captured without a connection');
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Captured without a connection', { exact: true })).toBeVisible();

  await context.setOffline(false);
  expect((await request.post('http://127.0.0.1:4174/test-worker-update')).status()).toBe(204);
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
  const apply = page.getByRole('button', { name: 'Apply update' });
  await expect(apply).toBeEnabled();
  const loaded = page.waitForEvent('load');
  await apply.click();
  await loaded;
  await expect(page.getByText('Captured without a connection', { exact: true })).toBeVisible();
});

test('calendar lists Google events and can publish, update, and remove a block', async ({ page }) => {
  const primary = { id: 'primary', primary: true, summary: 'Personal', accessRole: 'owner' };
  const planner = { id: 'planner', summary: 'Personal Planner', description: PLANNER_MARKER, accessRole: 'owner' };
  let created = false;
  let event: Record<string, unknown> | undefined;
  let insertCount = 0;
  let date = '';
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({
    contentType: 'text/javascript',
    body: `window.google = {accounts:{oauth2:{initTokenClient: config => ({requestAccessToken: () => config.callback({access_token:'fake-token', expires_in:3600, scope:config.scope})})}}};`
  }));
  await page.route('https://www.googleapis.com/calendar/v3/**', async route => {
    const { pathname } = new URL(route.request().url());
    const path = pathname.slice('/calendar/v3'.length);
    const method = route.request().method();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type,if-match',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
    const json = (body: unknown, status = 200) => route.fulfill({ headers, status, json: body });
    if (method === 'OPTIONS') return route.fulfill({ headers, status: 204 });
    if (path === '/users/me/calendarList') return json({ items: created ? [primary, planner] : [primary] });
    if (path === '/users/me/calendarList/planner') return json(planner);
    if (path === '/calendars/primary/events') return json({
      items: [{ id: 'external', summary: 'Google commitment', start: { dateTime: date + 'T09:00:00+05:30' }, end: { dateTime: date + 'T10:00:00+05:30' } }]
    });
    if (path === '/calendars' && method === 'POST') { created = true; return json(planner); }
    if (path === '/calendars/planner/events' && method === 'POST') {
      insertCount++;
      event = route.request().postDataJSON();
      return json(event);
    }
    if (path.startsWith('/calendars/planner/events/')) {
      if (!event) return json({ error: { message: 'Not found' } }, 404);
      if (method === 'PATCH') event = { ...event, ...route.request().postDataJSON() };
      if (method === 'DELETE') { event = undefined; return route.fulfill({ headers, status: 204 }); }
      return json(event);
    }
    return json({ error: { message: `Unexpected ${method} ${path}` } }, 500);
  });
  await page.goto('./');
  date = await today(page);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Calendar' }).click();
  await page.locator('summary').filter({ hasText: 'Google Calendar' }).click();
  await page.getByLabel('Google web OAuth client ID').fill('test.apps.googleusercontent.com');
  await page.getByRole('button', { name: 'Prepare Google sign-in' }).click();
  await page.getByRole('button', { name: 'Connect Google Calendar', exact: true }).click();
  await expect(page.getByText('Google commitment', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create Personal Planner calendar' }).click();
  await page.getByRole('button', { name: 'Add time block', exact: true }).click();
  await page.getByLabel('Block title').fill('Focused planning');
  await expect(page.getByText('Overlaps with Google commitment.')).toBeVisible();
  await page.getByRole('button', { name: 'Save block' }).click();
  await page.getByRole('button', { name: /Focused planning/ }).click();
  await page.getByRole('button', { name: 'Publish to Google' }).click();
  await expect(page.getByRole('button', { name: 'Update Google event' })).toBeEnabled();
  await page.getByRole('button', { name: 'Update Google event' }).click();
  await expect.poll(() => insertCount).toBe(1);
  await expect(page.getByRole('button', { name: 'Remove Google copy' })).toBeEnabled();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Remove Google copy' }).click();
  await expect(page.getByRole('button', { name: 'Publish to Google' })).toBeEnabled();
  expect(event).toBeUndefined();
});
