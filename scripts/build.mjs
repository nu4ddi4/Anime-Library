import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';

const html = await readFile('index.html', 'utf8');
const css = await readFile('styles.css', 'utf8');
const js = await readFile('app.js', 'utf8');
const favicon = await readFile('public/favicon.svg', 'utf8');
const catalog = await readFile('public/catalog.md');
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const file of ['index.html', 'styles.css', 'app.js']) await cp(file, `dist/${file}`);
await cp('public', 'dist', { recursive: true });
const offline = html
  .replace('<link rel="stylesheet" href="./styles.css">', () => `<style>${css}</style>`)
  .replace('<script src="./app.js"></script>', () => `<script>${js}</script>`)
  .replaceAll('./catalog.md', `data:text/markdown;charset=utf-8;base64,${catalog.toString('base64')}`)
  .replaceAll('./favicon.svg', `data:image/svg+xml,${encodeURIComponent(favicon)}`)
  .replace('href="./shelf.html"', 'href=""');
await writeFile('dist/shelf.html', offline);
console.log('Built static site and standalone HTML in dist/');
