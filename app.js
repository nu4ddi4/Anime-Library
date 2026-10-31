const DATA = JSON.parse(document.getElementById('dataset').textContent);
const CHANGES = JSON.parse(document.getElementById('changelog').textContent);
const $ = id => document.getElementById(id);
const norm = value => value.normalize('NFKC').toLocaleLowerCase('ko').replace(/[\s\p{P}\p{S}]/gu, '');
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const GENRES = ['로맨스', '액션', '판타지', 'SF', '미스터리·공포', '일상·힐링', '드라마', '스포츠·음악'];
const STORAGE_KEY = 'manga-shelf-favorites-v1';
const knownRanks = new Set(DATA.map(row => row.rank));
const isUncertain = row => ['국내 정발 미확인', '작품 특정 불가', '미검증'].includes(row.check);
let favorites = new Set();
let view = 'all';
let timer;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  if (Array.isArray(saved)) favorites = new Set(saved.filter(rank => knownRanks.has(rank)));
} catch { /* Keep the shelf usable when browser storage is unavailable. */ }

$('genre').innerHTML = '<option value="">모든 장르</option>' + GENRES.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('') + '<option value="미확인">미확인</option>';
$('genreQuick').innerHTML = ['', ...GENRES].map(g => `<button type="button" data-genre="${esc(g)}" aria-pressed="${g === ''}">${g || '전체'}</button>`).join('');
$('allCount').textContent = DATA.length;
document.querySelector('.hero-number').firstChild.textContent = DATA.length;
$('verification').options[2].textContent = `애니 공식 자료 확인 (${DATA.filter(r => r.animeChecked).length}편)`;
$('verification').options[3].textContent = `매체 대조 (${DATA.filter(r => r.mediumCheck === '대조').length}편)`;
$('verification').options[4].textContent = `추가 확인 · 보류 (${DATA.filter(isUncertain).length}편)`;

const mobile = matchMedia('(max-width:650px)');
function updateFilterPanel() { $('filterPanel').open = !mobile.matches; }
mobile.addEventListener('change', updateFilterPanel);
updateFilterPanel();

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.remove('hidden');
  clearTimeout(timer);
  timer = setTimeout(() => $('toast').classList.add('hidden'), 4000);
}
function saveFavorites() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites])); return true; }
  catch { toast('브라우저 저장이 제한되어 관심 목록은 이 화면에서만 유지됩니다. 백업으로 보관해 주세요.'); return false; }
}
function filtered() {
  const q = norm($('query').value);
  return DATA.filter(r =>
    (!q || [r.title, ...r.aliases, ...r.genres, ...(r.tags || [])].some(s => norm(s).includes(q))) &&
    (!$('original').value || r.original === $('original').value) &&
    (!$('start').value || r.start === $('start').value) &&
    (!$('genre').value || r.genres.includes($('genre').value) || ($('genre').value === '미확인' && !r.genres.length)) &&
    (view !== 'favorites' || favorites.has(r.rank)) &&
    (!$('verification').value || ($('verification').value === 'revised' ? ['표기 수정', '원작 수정'].includes(r.check) : $('verification').value === 'anime' ? r.animeChecked : $('verification').value === 'medium' ? r.mediumCheck === '대조' : isUncertain(r)))
  ).sort($('sort').value === 'name' ? (a, b) => a.title.localeCompare(b.title, 'ko', {numeric:true}) : (a, b) => a.rank - b.rank);
}
function render() {
  const rows = filtered();
  $('resultCount').textContent = rows.length;
  $('favCount').textContent = favorites.size;
  $('resultHint').textContent = view === 'favorites' ? `/ 관심 ${favorites.size}편` : `/ 전체 ${DATA.length}편`;
  $('live').textContent = `${rows.length}편 표시`;
  $('clear').classList.toggle('hidden', !$('query').value);
  const activeFilters = ['original', 'start', 'genre', 'verification'].filter(id => $(id).value).length;
  $('filterCount').textContent = activeFilters ? `${activeFilters}개 적용` : '';
  document.querySelectorAll('[data-genre]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.genre === $('genre').value)));
  $('results').innerHTML = rows.length ? rows.map(r => {
    const fav = favorites.has(r.rank);
    return `<article class="row"><span class="rank ${r.rank <= 10 ? 'top' : ''}" title="원본 추천 순위">${String(r.rank).padStart(2, '0')}</span><div><span class="title">${esc(r.title)}</span><div class="sub"><span class="genre-tags">${esc(r.genres.length ? r.genres.join(' · ') : '분류 보류')}</span> · <span class="mobile-label">${esc(r.original)} 원작 · </span><details><summary class="${isUncertain(r) ? 'warn' : ''}">${esc(r.check)}${r.check === '작품 특정 불가' ? ' · 보류' : ''}${r.animeChecked ? ' · 애니 확인' : ''}</summary><div class="evidence">${r.aliases.length ? `<p>검색 별칭: ${r.aliases.map(esc).join(', ')}</p>` : ''}${r.tags?.length ? `<p>태그: ${r.tags.map(esc).join(' · ')}</p>` : ''}${r.note ? `<p>${esc(r.note)}</p>` : ''}${r.evidence.map(e => `<p><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.label)} ↗</a><br>${esc(e.scope)}</p>`).join('')}<p>확인일: 2026.10.20 · 실시간 재고·국내 OTT 제공은 별도 확인이 필요합니다.</p></div></details></div></div><span class="badge original">${esc(r.original)}</span><span class="badge start">${r.start === '미확인' ? '미확인' : esc(r.start) + '부터'}</span><button class="star" data-rank="${r.rank}" aria-pressed="${fav}" aria-label="${esc(r.title)} 관심 ${fav ? '해제' : '등록'}">${fav ? '★' : '☆'}</button></article>`;
  }).join('') : `<div class="empty"><strong>${view === 'favorites' && !favorites.size ? '마음에 든 이야기를 모아보세요.' : '조건에 맞는 작품이 없어요.'}</strong><p>${view === 'favorites' && !favorites.size ? '작품 옆의 별표를 누르면 여기에 모입니다.' : '검색어를 줄이거나 필터를 초기화해 보세요.'}</p><button type="button" data-empty-action>${view === 'favorites' && !favorites.size ? '전체 작품 둘러보기 →' : '검색 · 필터 초기화'}</button></div>`;
}
function resetFilters() {
  for (const id of ['query', 'original', 'start', 'genre', 'verification']) $(id).value = '';
  $('sort').value = 'rank';
  render();
}
function setView(next) {
  view = next;
  document.querySelectorAll('[data-view]').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
    b.setAttribute('aria-pressed', String(b.dataset.view === view));
  });
  render();
}
for (const id of ['query', 'original', 'start', 'genre', 'verification', 'sort']) $(id).addEventListener(id === 'query' ? 'input' : 'change', render);
$('clear').addEventListener('click', () => { $('query').value = ''; render(); $('query').focus(); });
$('reset').addEventListener('click', resetFilters);
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$('genreQuick').addEventListener('click', e => {
  const button = e.target.closest('[data-genre]');
  if (!button) return;
  $('genre').value = button.dataset.genre;
  render();
});
$('results').addEventListener('click', e => {
  if (e.target.closest('[data-empty-action]')) {
    if (view === 'favorites' && !favorites.size) setView('all');
    resetFilters();
    $('query').focus();
    return;
  }
  const button = e.target.closest('[data-rank]');
  if (!button) return;
  const id = Number(button.dataset.rank);
  const wasFavorite = favorites.has(id);
  const previousButtons = [...$('results').querySelectorAll('[data-rank]')];
  const position = previousButtons.indexOf(button);
  wasFavorite ? favorites.delete(id) : favorites.add(id);
  if (saveFavorites()) toast(wasFavorite ? '관심 작품에서 해제했어요.' : '관심 작품에 담았어요.');
  render();
  const next = $('results').querySelector(`[data-rank="${id}"]`) || $('results').querySelectorAll('[data-rank]')[Math.max(0, position - 1)] || $('results').querySelector('[data-empty-action]');
  next?.focus({preventScroll:true});
});
$('exportFavorites').addEventListener('click', () => {
  const backup = { app:'gamsang-shelf', version:1, exportedAt:new Date().toISOString(), favorites:[...favorites].sort((a,b) => a-b), titles:DATA.filter(r => favorites.has(r.rank)).map(r => ({rank:r.rank, title:r.title})) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = '감상서가_관심목록.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`관심 작품 ${favorites.size}편을 백업했어요.`);
});
$('importFavorites').addEventListener('click', () => $('favoritesFile').click());
$('favoritesFile').addEventListener('change', async () => {
  const file = $('favoritesFile').files[0];
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('oversized');
    const backup = JSON.parse(await file.text());
    if (backup.app !== 'gamsang-shelf' || backup.version !== 1 || !Array.isArray(backup.favorites) || !backup.favorites.every(id => Number.isInteger(id) && knownRanks.has(id))) throw new Error('invalid');
    const previous = favorites.size;
    backup.favorites.forEach(id => favorites.add(id));
    const saved = saveFavorites();
    render();
    if (saved) toast(`${favorites.size - previous}편을 추가했어요. 기존 관심 목록도 함께 보관합니다.`);
  } catch { toast('감상 서가에서 받은 관심 목록 JSON 백업 파일을 선택해 주세요.'); }
  finally { $('favoritesFile').value = ''; }
});
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  try {
    const saved = JSON.parse(event.newValue || '[]');
    if (Array.isArray(saved)) { favorites = new Set(saved.filter(id => knownRanks.has(id))); render(); }
  } catch { /* Ignore malformed changes from another tab. */ }
});
$('changeCount').textContent = `· ${CHANGES.length}건`;
$('changes').innerHTML = CHANGES.map(r => `<tr><td>${esc(r.before)}</td><td>${esc(r.after)}</td><td><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">자료 ↗</a></td></tr>`).join('');
render();
