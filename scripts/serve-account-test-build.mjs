import { build } from 'vite';

await build({ build: { outDir: 'dist-accounts' } });
process.env.DAYLIGHT_TEST_BUILD = 'dist-accounts';
process.env.DAYLIGHT_TEST_PORT = '4175';
await import('./postbuild.mjs');
await import('./serve-test-build.mjs');
