import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

const result = await build({
  entryPoints: ['web/App.tsx'], bundle: true, write: false, outdir: 'dist/web',
  format: 'iife', platform: 'browser', target: 'es2022', minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'eof',
});
const script = result.outputFiles.find(file => file.path.endsWith('.js')).text.replaceAll('</script', '<\\/script');
const css = result.outputFiles.find(file => file.path.endsWith('.css')).text;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tarot · Card selection</title><style>${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>`;
await mkdir('dist', { recursive: true });
await writeFile('dist/widget.html', html);
console.log(`Built self-contained widget (${Math.round(Buffer.byteLength(html) / 1024)} KiB)`);
