import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const index = await readFile('dist/index.html','utf8');
const assets = (await readdir('dist/assets')).filter(name => !name.endsWith('.map')).sort().map(name => `./assets/${name}`);
const publicFiles = ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const hash = createHash('sha256').update(index).update(JSON.stringify(assets));
for (const file of ['sw.js', ...publicFiles]) hash.update(await readFile(`public/${file}`));
const buildId = hash.digest('hex').slice(0,12);
const precache = ['./index.html', ...publicFiles.map(file => `./${file}`), ...assets];
const sw = (await readFile('public/sw.js', 'utf8'))
  .replaceAll('__BUILD_ID__', buildId)
  .replace('const PRECACHE = __PRECACHE__;', `const PRECACHE = ${JSON.stringify(precache)};`);
await writeFile('dist/sw.js',sw);
console.log('Offline shell prepared:',buildId);
