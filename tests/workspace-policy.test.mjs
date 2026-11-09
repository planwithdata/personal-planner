import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('database policies isolate account workspaces and deny anonymous access', async () => {
  const db = new PGlite();
  const alice = '11111111-1111-4111-8111-111111111111';
  const bob = '22222222-2222-4222-8222-222222222222';
  const revision = '33333333-3333-4333-8333-333333333333';
  const migration = new URL('../supabase/migrations/20261109_daylight_workspaces.sql', import.meta.url);
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      insert into auth.users values ('${alice}'), ('${bob}');
    `);
    await db.exec(await readFile(migration, 'utf8'));
    await db.exec('set role authenticated');
    const signIn = (id) => db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    const add = (id) => db.query('insert into public.daylight_workspaces (user_id, revision, planner) values ($1, $2, $3)', [id, revision, '{}']);
    const all = () => db.query('select user_id from public.daylight_workspaces');

    await signIn(alice);
    await add(alice);
    await assert.rejects(() => add(bob), { code: '42501' });
    await signIn(bob);
    await add(bob);
    assert.deepEqual((await all()).rows, [{ user_id: bob }]);
    const forbiddenUpdate = await db.query("update public.daylight_workspaces set planner = '{\"modified\":true}' where user_id = $1", [alice]);
    assert.equal(forbiddenUpdate.affectedRows, 0);
    const ownUpdate = await db.query("update public.daylight_workspaces set planner = '{\"modified\":true}' where user_id = $1", [bob]);
    assert.equal(ownUpdate.affectedRows, 1);
    await assert.rejects(() => db.query('update public.daylight_workspaces set user_id = $1', [alice]), { code: '42501' });
    await signIn(alice);
    assert.deepEqual((await all()).rows, [{ user_id: alice }]);
    await db.exec('reset role; set role anon');
    await assert.rejects(all, { code: '42501' });
  } finally {
    await db.close();
  }
});
