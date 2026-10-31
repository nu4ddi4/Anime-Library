import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './catalog.mjs';

function table(text) {
  const [headers, ...rows] = parseCsv(text);
  if (!headers || new Set(headers).size !== headers.length) throw new Error('Invalid review headers');
  return rows.map(row => {
    if (row.length !== headers.length) throw new Error('Review CSV column count mismatch');
    return Object.fromEntries(headers.map((h, i) => [h, row[i]]));
  });
}

export function validateReview(baseline, current, reviews, {strictScope = false} = {}) {
  const byId = new Map(current.map(r => [r['추천 순서'], r]));
  const reviewById = new Map(reviews.map(r => [r['추천 순서'], r]));
  if (reviews.length !== baseline.length || reviewById.size !== reviews.length) throw new Error('Review coverage or duplicate ID error');
  const statuses = new Set(['변경 권고', '유지 권고', '경합', '보류']);
  const ratings = new Set(['우수', '양호', '비슷', '열세', '판단 불가']);
  for (const old of baseline) {
    const id = old['추천 순서'], next = byId.get(id), review = reviewById.get(id);
    if (!next || !review) throw new Error(`Missing baseline work ${id}`);
    for (const key of ['추천 순서', '작품명', '원작 매체']) {
      if (old[key] !== next[key] || old[key] !== review[key]) throw new Error(`Protected identity changed: ${id} ${key}`);
    }
    if (!statuses.has(review['재평가 상태'])) throw new Error(`Invalid review status: ${id}`);
    if (!['높음', '보통', '낮음'].includes(review['추천 신뢰도'])) throw new Error(`Invalid review confidence: ${id}`);
    if (review['기존 입문 추천 매체'] !== old['입문 추천 매체'] || review['재평가 입문 추천 매체'] !== next['입문 추천 매체']) throw new Error(`Recommendation audit mismatch: ${id}`);
    const changed = next['입문 추천 매체'] !== old['입문 추천 매체'];
    if (review['변경 여부'] !== (changed ? '변경' : '없음')) throw new Error(`Change flag mismatch: ${id}`);
    if (changed && (review['재평가 상태'] !== '변경 권고' || !['애니', '만화', '소설'].includes(next['입문 추천 매체']))) throw new Error(`Unjustified entry-medium change: ${id}`);
    if (!changed && review['재평가 상태'] === '변경 권고') throw new Error(`Change recommendation has no diff: ${id}`);
    for (const key of ['추천 근거', '반대 논거', '각색 평가', '비교 대상', '부족한 정보']) if (!review[key]?.trim()) throw new Error(`Missing review reasoning: ${id} ${key}`);
    for (const key of ['서사 충실도', '감정 전달', '연출', '그림·영상', '전체 경험']) if (!ratings.has(review[key])) throw new Error(`Invalid rubric: ${id} ${key}`);
    const urls = review['재평가 출처'].split('\n').filter(Boolean);
    for (const url of urls) if (!/^https?:\/\//.test(url)) throw new Error(`Invalid review source: ${id}`);
    if (review['재평가 상태'] !== '보류' && (!review['재평가 검증일'] || urls.length < 2)) throw new Error(`Missing decision date or sources: ${id}`);
    if (review['재평가 상태'] === '보류' && review['재평가 검증일']) throw new Error(`Held work marked quality-verified: ${id}`);
    const allowed = new Set(['입문 추천 매체', '애니 추천 공식 자료 확인', '자료 2 이름', '자료 2 URL', '자료 2 확인 범위']);
    for (const key of strictScope ? Object.keys(old) : []) {
      if (old[key] === next[key]) continue;
      if (!changed || !allowed.has(key)) throw new Error(`Unrelated baseline data changed: ${id} ${key}`);
      if (key.startsWith('자료 2') && old[key]) throw new Error(`Existing bibliography overwritten: ${id}`);
    }
  }
  return { baseline: baseline.length, reviews: reviews.length, changed: reviews.filter(r => r['변경 여부'] === '변경').length };
}

export async function validateReviewFiles() {
  const baselineBytes = await readFile('docs/media-review/baseline/anime-library.csv');
  const manifest = JSON.parse(await readFile('docs/media-review/baseline/manifest.json', 'utf8'));
  if (createHash('sha256').update(baselineBytes).digest('hex') !== manifest.sha256) throw new Error('Baseline snapshot modified');
  const current = table(await readFile('public/anime-library.csv', 'utf8'));
  const reviews = table(await readFile('public/media-review.csv', 'utf8'));
  const result = validateReview(table(baselineBytes.toString('utf8')), current, reviews);
  return result;
}

export { table as reviewTable };

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) console.log(await validateReviewFiles());
