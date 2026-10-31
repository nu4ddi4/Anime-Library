import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateReview, validateReviewFiles, reviewTable } from './media-review.mjs';

const baseline = reviewTable(await readFile('docs/media-review/baseline/anime-library.csv', 'utf8'));
const current = reviewTable(await readFile('public/anime-library.csv', 'utf8'));
const reviews = reviewTable(await readFile('public/media-review.csv', 'utf8'));
test('all baseline identities are covered, snapshot is intact, and recommendations are auditable', async () => {
  assert.deepEqual(await validateReviewFiles(), {baseline:178, reviews:178, changed:3});
  assert.deepEqual(validateReview(baseline, current, reviews, {strictScope:true}), {baseline:178, reviews:178, changed:3});
});
test('coverage gaps, identity changes and unsupported medium changes are rejected', () => {
  assert.throws(() => validateReview(baseline, current, reviews.slice(1)), /coverage/);
  const edited = structuredClone(current); edited[0]['원작 매체'] = '애니';
  assert.throws(() => validateReview(baseline, edited, reviews), /identity/);
  const held = structuredClone(current); held[0]['입문 추천 매체'] = '애니';
  const heldReviews = structuredClone(reviews); heldReviews[0]['재평가 입문 추천 매체'] = '애니'; heldReviews[0]['변경 여부'] = '변경';
  assert.throws(() => validateReview(baseline, held, heldReviews), /Unjustified/);
});
test('a confirmed decision needs dated sources; held rows cannot claim quality verification', () => {
  const noEvidence = structuredClone(reviews); noEvidence[5]['재평가 출처'] = '';
  assert.throws(() => validateReview(baseline, current, noEvidence), /sources/);
  const mislabeled = structuredClone(reviews); mislabeled[0]['재평가 검증일'] = '2026-10-31';
  assert.throws(() => validateReview(baseline, current, mislabeled), /quality-verified/);
});
