import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const index = await readFile('dist/index.html', 'utf8');
assert.doesNotMatch(index, /src="\/?src\/.*\.tsx?"/, 'Publish dist, not the source HTML');
assert.match(index, /src="\/personal-planner\/assets\/[^"]+\.js"/, 'The entry bundle must resolve under the Pages repository path');
for (const [, path] of index.matchAll(/(?:src|href)="((?:\.\/|\/personal-planner\/)[^"]+)"/g)) {
  const file = path.replace(/^(?:\.\/|\/personal-planner\/)/, '');
  assert.ok((await readFile(`dist/${file}`)).length, `Missing asset: ${path}`);
}
const manifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'));
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');
for (const icon of manifest.icons) {
  const file = await readFile(`dist/${icon.src.slice(2)}`);
  const [width, height] = icon.sizes.split('x').map(Number);
  assert.equal(file.readUInt32BE(16), width);
  assert.equal(file.readUInt32BE(20), height);
}

const events = {};
const precached = [];
const deleted = [];
const otherScope = 'daylight:/other-app/:previous';
const oldCache = 'daylight:/personal-planner/:previous';
let claimed = false;
let activated = false;
const indexUrl = 'https://example.github.io/personal-planner/index.html';
const context = {
  URL,
  self: {
    location: new URL('https://example.github.io/personal-planner/sw.js'),
    addEventListener: (name, fn) => { events[name] = fn; },
    clients: { claim: async () => { claimed = true; } },
    skipWaiting: async () => { activated = true; }
  },
  caches: {
    open: async () => ({
      addAll: async files => precached.push(...files),
      match: async url => url === indexUrl ? 'offline shell' : undefined
    }),
    keys: async () => [oldCache, otherScope],
    delete: async key => deleted.push(key)
  },
  fetch: async () => { throw new Error('offline'); }
};
vm.runInNewContext(await readFile('dist/sw.js', 'utf8'), context);
function waitFor(name, properties = {}) {
  let work;
  events[name]({ ...properties, waitUntil: promise => { work = promise; } });
  return work;
}
await waitFor('install');
assert.ok(precached.includes('./index.html'));
for (const asset of await readdir('dist/assets')) {
  if (!asset.endsWith('.map')) assert.ok(precached.includes(`./assets/${asset}`));
}
await waitFor('message', { data: 'APPLY_UPDATE' });
assert.equal(activated, true);
await waitFor('activate');
assert.equal(claimed, true);
assert.deepEqual(deleted, [oldCache]);
let response;
function navigate(url) {
  response = undefined;
  events.fetch({ request: { url, method: 'GET', mode: 'navigate' }, respondWith: value => { response = value; } });
  return response;
}
assert.equal(navigate('https://example.github.io/other-app/'), undefined);
assert.equal(await navigate('https://example.github.io/personal-planner/?source=install'), 'offline shell');
console.log('Build assets, iPhone icons, offline shell, and repository scope checks passed.');
