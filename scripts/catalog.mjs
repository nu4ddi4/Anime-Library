import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false;
  const finishCell = () => { row.push(cell); cell = ''; closed = false; };
  const finishRow = () => { finishCell(); if (row.some(v => v !== '')) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += ch;
    } else if (ch === ',') finishCell();
    else if (ch === '\r' || ch === '\n') { if (ch === '\r' && text[i + 1] === '\n') i++; finishRow(); }
    else if (ch === '"' && cell === '' && !closed) quoted = true;
    else if (closed || ch === '"') throw new Error(`Invalid CSV quoting near character ${i}.`);
    else cell += ch;
  }
  if (quoted) throw new Error('Unclosed quoted CSV field.');
  if (cell !== '' || closed || row.length) finishRow();
  return rows;
}
const required = ['추천 순서', '작품명', '원작 매체', '입문 추천 매체', '장르', '태그', '다른 이름', '자료 확인 상태', '매체 대조', '애니 추천 공식 자료 확인', '메모', '자료 기준일'];
const genres = new Set(['로맨스', '액션', '판타지', 'SF', '미스터리·공포', '일상·힐링', '드라마', '스포츠·음악']);
const media = new Set(['만화', '소설', '애니', '미확인']);
const split = value => value ? value.split(' / ').map(v => v.trim()).filter(Boolean) : [];
export function readCatalog(csv) {
  const [headers, ...rows] = parseCsv(csv);
  if (!headers || !rows.length) throw new Error('The catalog must contain a header and at least one work.');
  if (new Set(headers).size !== headers.length) throw new Error('Duplicate CSV column names.');
  for (const name of required) if (!headers.includes(name)) throw new Error(`Missing CSV column: ${name}`);
  const ids = new Set();
  return rows.map((cells, i) => {
    const fail = message => { throw new Error(`CSV row ${i + 2}: ${message}`); };
    if (cells.length !== headers.length) fail('column count differs from the header');
    const r = Object.fromEntries(headers.map((h, j) => [h, cells[j]]));
    if (!/^[1-9]\d*$/.test(r['추천 순서'])) fail('추천 순서 must be a positive integer');
    const rank = Number(r['추천 순서']);
    if (!Number.isSafeInteger(rank) || ids.has(rank)) fail('duplicate or invalid 추천 순서');
    ids.add(rank);
    if (!r['작품명'].trim()) fail('작품명 is required');
    if (!media.has(r['원작 매체']) || !media.has(r['입문 추천 매체'])) fail('unknown medium');
    const rowGenres = split(r['장르']);
    if (rowGenres.some(g => !genres.has(g))) fail('unknown genre');
    if (!['확인', '해당 없음'].includes(r['애니 추천 공식 자료 확인'])) fail('애니 추천 공식 자료 확인 must be 확인 or 해당 없음');
    const date = r['자료 기준일'];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) fail('invalid 자료 기준일');
    const evidence = [];
    for (const header of headers.filter(h => /^자료 \d+ URL$/.test(h))) {
      const prefix = header.replace(' URL', '');
      const url = r[header], label = r[`${prefix} 이름`] || '', scope = r[`${prefix} 확인 범위`] || '';
      if (!url && !label && !scope) continue;
      let parsed;
      try { parsed = new URL(url); } catch { fail(`${header} must be an absolute URL`); }
      if (!['https:', 'http:'].includes(parsed.protocol) || !label) fail(`${header} requires an HTTP(S) URL and a source name`);
      evidence.push({label, url, scope});
    }
    const access = [];
    for (const header of headers.filter(h => /^(서점|OTT) \d+ URL$/.test(h))) {
      const prefix = header.replace(' URL', '');
      const [service, url, edition, method, checkedAt] = ['이름', 'URL', '판본', '확인 방식', '확인일'].map(key => r[`${prefix} ${key}`] || '');
      if (![service, url, edition, method, checkedAt].some(Boolean)) continue;
      let parsed;
      try { parsed = new URL(url); } catch { fail(`${prefix} requires an absolute URL`); }
      if (parsed.protocol !== 'https:' || !service.trim() || !edition.trim()) fail(`${prefix} requires HTTPS, service and edition`);
      if (!['기존 서지', '공식 페이지·본문', '공식 페이지·검색'].includes(method)) fail(`${prefix} has an unknown verification method`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedAt) || !Number.isFinite(Date.parse(checkedAt)) || new Date(checkedAt).toISOString().slice(0, 10) !== checkedAt) fail(`${prefix} has an invalid 확인일`);
      access.push({kind:prefix.startsWith('서점') ? 'book' : 'watch', service, url, edition, method, checkedAt});
    }
    return {rank, title:r['작품명'], original:r['원작 매체'], start:r['입문 추천 매체'], note:r['메모'], aliases:split(r['다른 이름']), evidence, access, check:r['자료 확인 상태'], mediumCheck:r['매체 대조'], animeChecked:r['애니 추천 공식 자료 확인'] === '확인', genre:r['세부 장르(원본)'] || '', tags:split(r['태그']), genres:rowGenres, checkedAt:date};
  });
}
export async function loadCatalog() { return readCatalog(await readFile('public/anime-library.csv', 'utf8')); }
export function catalogMarkdown(records) {
  const safe = value => String(value).replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ');
  const header = '# 감상 서가 · 전체 작품 목록\n\n원본 데이터: anime-library.csv. 자료 기준일은 작품별 CSV 값을 따릅니다. 추천은 주관적인 입문 제안입니다.\n\n| 추천 순서 | 작품명 | 원작 | 입문 추천 | 장르 | 자료 |\n| --- | --- | --- | --- | --- | --- |\n';
  return header + records.map(r => `| ${r.rank} | ${safe(r.title)} | ${safe(r.original)} | ${safe(r.start)} | ${safe(r.genres.join(' / '))} | ${r.evidence.map(e => `[${safe(e.label)}](${e.url})`).join(' · ')} |`).join('\n') + '\n';
}
if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) console.log(`Validated ${(await loadCatalog()).length} works in public/anime-library.csv`);
