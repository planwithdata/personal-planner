import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve(process.env.DAYLIGHT_TEST_BUILD ?? 'dist');
const port = Number(process.env.DAYLIGHT_TEST_PORT ?? 4174);
const prefix = '/personal-planner/';
let workerRevision = 0;
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (pathname === '/test-worker-update' && request.method === 'POST') {
      workerRevision++;
      response.writeHead(204).end();
      return;
    }
    if (!pathname.startsWith(prefix)) throw new Error('Outside repository path.');
    const relative = decodeURIComponent(pathname.slice(prefix.length)) || 'index.html';
    const file = resolve(root, relative);
    if (!file.startsWith(root + sep)) throw new Error('Outside build.');
    let body = await readFile(file);
    if (relative === 'sw.js' && workerRevision) {
      body = Buffer.from(body.toString().replace(/const CACHE = PREFIX \+ '([a-f0-9]+)';/,
        (_, hash) => `const CACHE = PREFIX + '${hash}-test-${workerRevision}';`));
    }
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
  }
}).listen(port, '127.0.0.1');
