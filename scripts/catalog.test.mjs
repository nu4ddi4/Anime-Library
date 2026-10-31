import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCsv, readCatalog } from './catalog.mjs';

const csv = await readFile('public/anime-library.csv', 'utf8');
const rows = parseCsv(csv);
const encode = table => table.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(',')).join('\r\n');
function mutated(header, value) {
  const table = rows.map(row => [...row]);
  table[1][table[0].indexOf(header)] = value;
  return encode(table);
}
test('CSV handles Korean BOM, commas, escaped quotes, multiline fields and final empty cells', () => {
  assert.deepEqual(parseCsv('\uFEFF"제목","메모",\r\n"작품, 이름","첫줄\r\n그는 ""안녕""이라고 했다",\r\n'), [['제목','메모',''], ['작품, 이름','첫줄\r\n그는 "안녕"이라고 했다','']]);
  assert.throws(() => parseCsv('"unclosed'), /Unclosed/);
  assert.throws(() => parseCsv('"closed"unexpected'), /quoting/);
});
test('catalog preserves source links and rejects invalid edits before publication', () => {
  const data = readCatalog(csv);
  assert.equal(new Set(data.map(r => r.rank)).size, data.length);
  assert.ok(data.some(r => r.evidence.length === 2));
  for (const [header, value] of [['추천 순서', rows[2][0]], ['장르','없는 장르'], ['자료 기준일','2026-02-30'], ['자료 1 URL','javascript:alert(1)'], ['애니 추천 공식 자료 확인','maybe']]) {
    assert.throws(() => readCatalog(mutated(header,value)), /CSV row/);
  }
  assert.throws(() => readCatalog(encode(rows.map(r=>r.slice(1)))), /Missing CSV column/);
});
test('website, standalone HTML and downloadable CSV use the same canonical records', async () => {
  const expected = readCatalog(csv);
  for (const path of ['dist/index.html', 'dist/shelf.html']) {
    const html = await readFile(path,'utf8');
    assert.deepEqual(JSON.parse(html.match(/<script id="dataset" type="application\/json">([\s\S]*?)<\/script>/)[1]), expected);
    assert.ok(!html.includes('__CATALOG_'));
  }
  assert.equal(await readFile('dist/anime-library.csv','utf8'), csv);
});
