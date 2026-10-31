import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { loadCatalog, catalogMarkdown } from './catalog.mjs';
import { validateReviewFiles } from './media-review.mjs';

await validateReviewFiles();
const records = await loadCatalog();
const template = await readFile('index.html', 'utf8');
if (!template.includes('__CATALOG_DATA__')) throw new Error('Catalog placeholder missing.');
// CSV is authoritative. Both the website and offline file get this generated snapshot.
const dates = [...new Set(records.map(r => r.checkedAt))].sort();
const period = dates.length === 1 ? dates[0] : `${dates[0]}~${dates.at(-1)}`;
const summary = `자료 기준 ${period.replaceAll('-', '.')} · 매체 대조 ${records.filter(r => r.mediumCheck === '대조').length}편 · 애니 공식 자료 ${records.filter(r => r.animeChecked).length}편`;
const html = template
  .replace('__CATALOG_DATA__', () => JSON.stringify(records).replaceAll('<', '\\u003c'))
  .replaceAll('__CATALOG_TOTAL__', String(records.length))
  .replaceAll('__CATALOG_SUMMARY__', summary);
const css = await readFile('styles.css', 'utf8');
const js = await readFile('app.js', 'utf8');
const favicon = await readFile('public/favicon.svg', 'utf8');
const csv = await readFile('public/anime-library.csv');
const reviews = await readFile('public/media-review.csv');
const catalog = Buffer.from(catalogMarkdown(records), 'utf8');
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
await writeFile('dist/index.html', html);
for (const file of ['styles.css', 'app.js']) await cp(file, `dist/${file}`);
await cp('public', 'dist', { recursive: true });
await writeFile('dist/catalog.md', catalog);
const offline = html
  .replace('<link rel="stylesheet" href="./styles.css">', () => `<style>${css}</style>`)
  .replace('<script src="./app.js"></script>', () => `<script>${js}</script>`)
  .replaceAll('./catalog.md', `data:text/markdown;charset=utf-8;base64,${catalog.toString('base64')}`)
  .replaceAll('./anime-library.csv', `data:text/csv;charset=utf-8;base64,${csv.toString('base64')}`)
  .replaceAll('./media-review.csv', `data:text/csv;charset=utf-8;base64,${reviews.toString('base64')}`)
  .replaceAll('./favicon.svg', `data:image/svg+xml,${encodeURIComponent(favicon)}`)
  .replace('href="./shelf.html"', 'href=""');
await writeFile('dist/shelf.html', offline);
console.log(`Built static site and offline HTML from ${records.length} CSV records.`);
