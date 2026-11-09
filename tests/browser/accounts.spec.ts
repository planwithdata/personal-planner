import { expect, test, type Page } from '@playwright/test';
import { emptyPlanner, taskDraft, type Planner } from '../../src/domain';

const users = {
  alice: { id: '11111111-1111-4111-8111-111111111111', email: 'alice@example.test' },
  bob: { id: '22222222-2222-4222-8222-222222222222', email: 'bob@example.test' }
};
type Person = keyof typeof users;
type Row = { user_id: string; revision: string; planner: Planner };

function jwt(person: Person) {
  const json = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${json({ alg: 'HS256', typ: 'JWT' })}.${json({ sub: users[person].id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })}.test`;
}

async function addTask(page: Page, title: string) {
  await page.getByRole('button', { name: 'Add task', exact: true }).first().click();
  await page.getByLabel('What do you need to do?').fill(title);
  await page.getByRole('dialog').getByRole('button', { name: 'Add task', exact: true }).click();
}

async function openSettings(page: Page) {
  const more = page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'More' });
  if (await more.isVisible()) await more.click();
  else await page.getByRole('button', { name: 'Settings & backup' }).click();
}

test('Google account switching keeps private workspaces separate and syncs offline edits', async ({ page, context }) => {
  test.setTimeout(60000);
  let nextPerson: Person = 'alice';
  const rows = new Map<string, Row>();
  const tokens = new Map<string, string>();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  await context.route('https://daylight-test.supabase.co/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info,prefer,accept,accept-profile,content-profile,x-supabase-api-version',
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS'
    };
    const json = (body: unknown, status = 200) => route.fulfill({ status, headers, json: body });
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname === '/auth/v1/authorize') {
      expect(url.searchParams.get('provider')).toBe('google');
      expect(url.searchParams.get('code_challenge_method')).toBe('s256');
      const callback = new URL(url.searchParams.get('redirect_to')!);
      expect(callback.pathname).toBe('/personal-planner/');
      callback.searchParams.set('code', nextPerson);
      return route.fulfill({ status: 302, headers: { ...headers, location: callback.href } });
    }
    if (url.pathname === '/auth/v1/token') {
      const { auth_code: person, code_verifier: verifier } = request.postDataJSON() as { auth_code: Person; code_verifier: string };
      expect(verifier.length).toBeGreaterThan(30);
      const user = users[person];
      const token = jwt(person);
      tokens.set(token, user.id);
      return json({
        access_token: token, refresh_token: `refresh-${person}`, expires_in: 3600, token_type: 'bearer',
        user: { ...user, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'google' }, user_metadata: {} }
      });
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers });
    if (url.pathname === '/rest/v1/daylight_workspaces') {
      const owner = tokens.get((request.headers().authorization ?? '').replace('Bearer ', ''));
      if (!owner) return json({ message: 'Login required' }, 401);
      if (method === 'POST') {
        const row = request.postDataJSON() as Row;
        expect(row.user_id).toBe(owner);
        if (rows.has(owner)) return json({ code: '23505', message: 'Conflict' }, 409);
        rows.set(owner, row);
        return json({ revision: row.revision }, 201);
      }
      expect(url.searchParams.get('user_id')).toBe(`eq.${owner}`);
      const old = rows.get(owner);
      if (method === 'GET') return json(old ? [old] : []);
      if (method === 'PATCH') {
        if (!old || url.searchParams.get('revision') !== `eq.${old.revision}`) return json([]);
        const patch = request.postDataJSON() as Pick<Row, 'planner' | 'revision'>;
        rows.set(owner, { ...old, ...patch });
        return json([{ revision: patch.revision }]);
      }
    }
    return json({ message: `Unexpected request: ${method} ${url.pathname}` }, 500);
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Welcome to Daylight' })).toBeVisible();
  await page.getByRole('button', { name: 'Use on this device' }).click();
  await addTask(page, 'Guest note');
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await openSettings(page);
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('heading', { name: 'Make room for what matters.' })).toBeVisible();
  await expect(page.getByText('Guest note', { exact: true })).toHaveCount(0);
  await expect(page.getByText('A STARTING POINT')).toHaveCount(0);
  await addTask(page, 'Alice’s private task');
  await expect.poll(() => rows.get(users.alice.id)?.planner.tasks.length).toBe(1);
  await expect(page.getByText('Saved to your account')).toBeVisible();

  await context.setOffline(true);
  await addTask(page, 'Alice offline task');
  await expect(page.getByText('Saved on this device · waiting to sync')).toBeVisible();
  expect(rows.get(users.alice.id)?.planner.tasks.length).toBe(1);
  await context.setOffline(false);
  await expect.poll(() => rows.get(users.alice.id)?.planner.tasks.length).toBe(2);
  await expect(page.getByText('Saved to your account')).toBeVisible();

  await openSettings(page);
  await expect(page.getByText(users.alice.email)).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  nextPerson = 'bob';
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('heading', { name: 'Make room for what matters.' })).toBeVisible();
  await expect(page.getByText('Alice’s private task', { exact: true })).toHaveCount(0);
  await addTask(page, 'Bob’s private task');
  await expect.poll(() => rows.get(users.bob.id)?.planner.tasks.length).toBe(1);
  await expect(page.getByText('Saved to your account')).toBeVisible();

  // A write from another device wins until the user explicitly chooses how to recover.
  rows.set(users.bob.id, { user_id: users.bob.id, revision: 'other-device', planner: {
    ...emptyPlanner(), tasks: [{ ...taskDraft(), title: 'Bob’s latest cloud task' }]
  } });
  await addTask(page, 'Bob’s conflicting task');
  await expect(page.getByRole('alert')).toContainText('Another device saved a newer cloud copy');
  expect(rows.get(users.bob.id)?.revision).toBe('other-device');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Use cloud copy' }).click();
  await expect(page.getByText('Saved to your account')).toBeVisible();
  await expect(page.getByText('Bob’s conflicting task', { exact: true })).toHaveCount(0);
  expect(rows.get(users.alice.id)?.planner.tasks.map(task => task.title)).toEqual(['Alice’s private task', 'Alice offline task']);
  expect(errors).toEqual([]);
});
