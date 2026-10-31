// Keep native details/summary semantics and an immediate reduced-motion fallback.
const running = new WeakMap();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

function cancelHeight(element) {
  running.get(element)?.cancel();
  running.delete(element);
  element.style.height = "";
  element.style.overflow = "";
}

function animateHeight(element, from, to, finish) {
  cancelHeight(element);
  if (reducedMotion.matches || !element.animate || from === to) {
    finish();
    return;
  }
  element.style.overflow = "hidden";
  const animation = element.animate(
    [{ height: `${from}px` }, { height: `${to}px` }],
    { duration: 230, easing: "cubic-bezier(.2,.7,.2,1)" },
  );
  running.set(element, animation);
  animation.onfinish = () => {
    if (running.get(element) !== animation) return;
    cancelHeight(element);
    finish();
  };
}

function setDisclosureOpen(details, open, animate = true) {
  details.dataset.opening = String(open);
  const from = details.getBoundingClientRect().height;
  cancelHeight(details);
  details.open = open;
  if (!animate) { delete details.dataset.opening; return; }
  const to = details.getBoundingClientRect().height;
  // A closing disclosure stays open until its height transition completes.
  if (!open) details.open = true;
  animateHeight(details, from, to, () => { details.open = open; delete details.dataset.opening; });
}

function setPanelOpen(panel, open) {
  const from = panel.hidden ? 0 : panel.getBoundingClientRect().height;
  cancelHeight(panel);
  panel.hidden = false;
  const to = open ? panel.getBoundingClientRect().height : 0;
  // Remove closing links from keyboard navigation immediately.
  panel.inert = !open;
  animateHeight(panel, from, to, () => { panel.hidden = !open; });
}

for (const details of document.querySelectorAll("details")) {
  details.querySelector(":scope > summary")?.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.target.closest("a,button,input")) return;
    if (details.id === "filterPanel" && !matchMedia("(max-width:740px)").matches) return;
    event.preventDefault();
    const opening = details.dataset.opening === "false" ||
      (details.dataset.opening !== "true" && !details.open);
    details.dataset.opening = String(opening);
    setDisclosureOpen(details, opening);
  });
  details.addEventListener("toggle", () => {
    if (!running.has(details)) delete details.dataset.opening;
  });
}

const DATA = JSON.parse(document.getElementById("dataset").textContent);
const CHANGES = JSON.parse(document.getElementById("changelog").textContent);
const ENTRY_REVIEWS = new Map(
  JSON.parse(document.getElementById("entry-reviews")?.textContent || "[]")
    .map(review => [review.rank, review]),
);
const $ = (id) => document.getElementById(id);
const norm = (value) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("ko")
    .replace(/[\s\p{P}\p{S}]/gu, "");
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const GENRES = [
  "로맨스",
  "액션",
  "판타지",
  "SF",
  "미스터리·공포",
  "일상·힐링",
  "드라마",
  "스포츠·음악",
];
const STORAGE_KEY = "manga-shelf-favorites-v1";
const PAGE_SIZE = 24;
const knownRanks = new Set(DATA.map((row) => row.rank));
const FILTER_IDS = ["query", "original", "start", "genre", "access", "verification"];
const isUncertain = (row) =>
  ["국내 정발 미확인", "작품 특정 불가", "미검증"].includes(row.check);
const starIcon =
  '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/></svg>';
const chevron =
  '<svg class="chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg>';
let favorites = new Set();
let view = "all";
let visibleLimit = PAGE_SIZE;
let timer;
let undoAction;
let pickedWork = null;
const expanded = new Set();
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  if (Array.isArray(saved))
    favorites = new Set(saved.filter((rank) => knownRanks.has(rank)));
} catch {
  /* The shelf also works when browser storage is unavailable. */
}

$("genre").innerHTML =
  '<option value="">모든 장르</option>' +
  GENRES.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join("") +
  '<option value="미확인">미확인</option>';
$("genreQuick").innerHTML = ["", ...GENRES]
  .map(
    (g) =>
      `<button type="button" data-genre="${esc(g)}" aria-pressed="${g === ""}"><span>${g || "전체"}</span><span class="genre-count"></span></button>`,
  )
  .join("");
$("allCount").textContent = DATA.length;
$("totalCount").textContent = DATA.length;
$("verification").options[2].textContent =
  `애니 공식 자료 확인 (${DATA.filter((r) => r.animeChecked).length}편)`;
$("verification").options[3].textContent =
  `매체 대조 (${DATA.filter((r) => r.mediumCheck === "대조").length}편)`;
$("verification").options[4].textContent =
  `작품·정발 추가 확인 (${DATA.filter(isUncertain).length}편)`;
$("verification").options[5].textContent =
  `입문 검토 기록 있는 작품 (${ENTRY_REVIEWS.size}편)`;
for (const [kind, label] of [["book", "서점"], ["watch", "OTT"]]) {
  const group = document.createElement("optgroup");
  group.label = label;
  const services = [...new Set(DATA.flatMap(r => (r.access || [])
    .filter(link => link.kind === kind).map(link => link.service)))];
  for (const service of services) {
    const option = document.createElement("option");
    option.value = `service:${service}`;
    option.textContent = `${service} 작품 페이지`;
    group.append(option);
  }
  $("access").append(group);
}
const mobile = matchMedia("(max-width:740px)");
function updateFilterPanel() {
  setDisclosureOpen($("filterPanel"), !mobile.matches, false);
}
mobile.addEventListener("change", updateFilterPanel);
updateFilterPanel();
// On desktop this panel stays visible, including keyboard-triggered toggles.
$("filterPanel").addEventListener("toggle", () => {
  if (!mobile.matches && !$("filterPanel").open) $("filterPanel").open = true;
});

function toast(message, onUndo) {
  $("toastMessage").textContent = message;
  undoAction = onUndo;
  $("toastAction").classList.toggle("hidden", !onUndo);
  $("toast").classList.remove("hidden");
  clearTimeout(timer);
  timer = setTimeout(() => {
    // Do not remove an action while a keyboard user is focused on it.
    if ($("toast").matches(":focus-within")) return;
    $("toast").classList.add("hidden");
    undoAction = undefined;
  }, 6500);
}
$("toastAction").addEventListener("click", () => {
  const action = undoAction;
  undoAction = undefined;
  action?.();
});
function saveFavorites() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
    return true;
  } catch {
    toast(
      "브라우저 저장이 제한되어 이 화면에서만 유지됩니다. 백업으로 보관해 주세요.",
    );
    return false;
  }
}
function matching(ignoreGenre = false) {
  const terms = $("query").value.trim().split(/\s+/).map(norm).filter(Boolean);
  const access = $("access").value;
  return DATA.filter(
    (r) =>
      terms.every(term => [r.title, ...r.aliases, ...r.genres, ...(r.tags || []),
        r.original, r.start, ...(r.access || []).map(link => link.service)]
        .some(value => norm(value).includes(term))) &&
      (!$("original").value || r.original === $("original").value) &&
      (!$("start").value || r.start === $("start").value) &&
      (ignoreGenre ||
        !$("genre").value ||
        r.genres.includes($("genre").value) ||
        ($("genre").value === "미확인" && !r.genres.length)) &&
      (view !== "favorites" || favorites.has(r.rank)) &&
      (!access || (r.access || []).some(link => access.startsWith("service:")
        ? link.service === access.slice(8) : link.kind === access)) &&
      (!$("verification").value ||
        ($("verification").value === "revised"
          ? ["표기 수정", "원작 수정"].includes(r.check)
          : $("verification").value === "anime"
            ? r.animeChecked
            : $("verification").value === "medium"
              ? r.mediumCheck === "대조"
              : $("verification").value === "reviewed"
                ? ENTRY_REVIEWS.has(r.rank) : isUncertain(r))),
  );
}
function filtered() {
  return matching().sort(
    $("sort").value === "name"
      ? (a, b) => a.title.localeCompare(b.title, "ko", { numeric: true })
      : (a, b) => a.rank - b.rank,
  );
}
function activeFilters() {
  const labels = {
    query: () => `검색: ${$("query").value.trim()}`,
    original: () => `${$("original").value} 원작`,
    start: () => `${$("start").value}부터 감상`,
    genre: () => $("genre").value,
    access: () => $("access").selectedOptions[0].textContent,
    verification: () =>
      $("verification").selectedOptions[0].textContent.replace(/ \(.*?\)/g, ""),
  };
  return FILTER_IDS.filter((id) => $(id).value).map((id) => ({
    id,
    label: labels[id](),
  }));
}
function updateControls(rows) {
  const filters = activeFilters();
  $("favCount").textContent = favorites.size;
  $("resultCount").textContent = rows.length;
  $("collectionTitle").textContent =
    view === "favorites" ? "관심 작품" : "전체 작품";
  $("heroTitle").textContent =
    view === "favorites" ? "마음에 담아둔 이야기." : "다음엔, 어떤 이야기?";
  $("heroIntro").textContent =
    view === "favorites"
      ? favorites.size
        ? `${favorites.size}편의 이야기, 보고 싶은 순간을 위해 모아두었어요.`
        : "언젠가 보고 싶은 이야기를, 나만의 서가에."
      : "취향이 이끄는 대로, 한 편씩 모아보세요.";
  $("resultHint").textContent = filters.length
    ? `${filters.length}개의 조건으로 찾은 이야기예요.`
    : view === "favorites" && !favorites.size
      ? "별표로 마음에 든 작품을 모아보세요."
      : "제목을 누르면 구매·시청 경로와 작품 정보를 볼 수 있어요.";
  $("clear").classList.toggle("hidden", !$("query").value);
  document
    .querySelector(".search-shortcut")
    .classList.toggle("hidden", !!$("query").value);
  const filterCount = FILTER_IDS.slice(1).filter((id) => $(id).value).length;
  $("filterCount").textContent = filterCount ? `${filterCount}개 적용` : "";
  $("reset").disabled = !filters.length && $("sort").value === "rank";
  $("exportFavorites").disabled = !favorites.size;
  $("pickWork").disabled = !rows.some(r => r.start !== "미확인" && r.original !== "미확인");
  $("pickHelp").textContent = $("pickWork").disabled
    ? rows.length ? "작품을 특정하지 못해 아직 한 편을 골라드릴 수 없어요." : "조건에 맞는 작품이 없어요. 검색이나 필터를 바꾸면 한 편을 골라드릴게요."
    : view === "favorites" ? "현재 조건에 맞는 관심 작품 중 무작위로 골라요."
      : "현재 조건에 맞는 작품 중 무작위로 골라요. 관심 목록에 없는 작품을 먼저 골라요.";
  const genreBase = matching(true);
  document.querySelectorAll("[data-genre]").forEach((b) => {
    const genre = b.dataset.genre;
    const count = genre
      ? genreBase.filter((r) => r.genres.includes(genre)).length
      : genreBase.length;
    b.querySelector(".genre-count").textContent = count;
    b.setAttribute("aria-pressed", String(genre === $("genre").value));
    b.setAttribute("aria-label", `${genre || "전체 장르"} ${count}편`);
  });
  $("activeFilters").classList.toggle("hidden", !filters.length);
  $("activeFilters").innerHTML =
    "<span>선택한 조건</span>" +
    filters
      .map(
        (f) =>
          `<button class="filter-chip" type="button" data-clear-filter="${f.id}" aria-label="${esc(f.label)} 조건 해제"><span>${esc(f.label)}</span><span aria-hidden="true">×</span></button>`,
      )
      .join("") +
    '<button class="clear-filters" type="button" data-clear-all>모두 지우기</button>';
  const shown = Math.min(rows.length, visibleLimit);
  $("live").textContent =
    rows.length > shown
      ? `${rows.length}편 중 ${shown}편 표시`
      : `${rows.length}편 표시`;
}
function renderCover(r, extraClass = "") {
  const cover = r.cover && document.body.dataset.offline !== "true" ? r.cover : null;
  return `<span class="cover-slot ${extraClass}" aria-hidden="true"><span class="cover-fallback">${esc(r.original === "미확인" ? "?" : r.original)}</span>${cover ? `<img data-cover src="${esc(cover.image)}" alt="" width="44" height="62" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}</span>`;
}
// Missing or blocked remote artwork keeps the same-sized placeholder.
document.addEventListener("error", event => {
  if (event.target.matches?.("img[data-cover]")) event.target.remove();
}, true);

function renderEntryGuide(r) {
  const review = ENTRY_REVIEWS.get(r.rank);
  if (!review) return '<p class="entry-pending">잠정 입문 제안입니다. 매체별 비교 근거는 추가 확인 중이에요.</p>';
  const label = review.status === "경합" ? "취향에 따라 갈려요" : "입문 검토 기록";
  return `<section class="entry-guide" aria-label="${esc(r.title)} 입문 추천 이유"><div class="entry-heading"><h3>${esc(r.start)}부터 권하는 이유</h3><span>${label} · 신뢰도 ${esc(review.confidence)}</span></div><p>${esc(review.reason)}</p><p class="entry-scope"><strong>비교 범위</strong> ${esc(review.scope)}</p><p class="entry-counter"><strong>다른 매체가 나은 점</strong> ${esc(review.counter)}</p><p class="entry-scope"><strong>확인 범위·한계</strong> ${esc(review.limits)}</p><div class="entry-sources">${review.sources.map((url,i) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">근거 ${i+1} ↗</a>`).join("")}<span>문헌 검토 ${esc(review.checkedAt.replaceAll('-', '.'))} · 직접 전편 감상 아님</span></div></section>`;
}

function pickSignature() {
  return JSON.stringify([view, ...FILTER_IDS.map(id => $(id).value)]);
}
function renderPick(rows) {
  if (pickedWork && (pickedWork.signature !== pickSignature() || !rows.some(r => r.rank === pickedWork.rank))) pickedWork = null;
  $("pickCard").hidden = !pickedWork;
  if (!pickedWork) { $("pickCard").innerHTML = ""; return; }
  const r = rows.find(row => row.rank === pickedWork.rank);
  const review = ENTRY_REVIEWS.get(r.rank);
  $("pickCard").innerHTML = `${renderCover(r, "pick-cover")}<div class="pick-copy"><p class="pick-eyebrow">${pickedWork.fresh && !favorites.has(r.rank) ? "아직 관심 목록에 없는 이야기" : "지금 조건에서 고른 이야기"}</p><h3>${esc(r.title)}</h3><p class="pick-meta">${esc(r.genres.join(' · '))} · ${esc(r.start)}부터</p>${review ? `<p class="pick-reason">${esc(review.reason)}</p>` : '<p class="pick-reason">입문 매체는 잠정 제안입니다. 작품 정보와 구매·시청 경로를 함께 확인해 보세요.</p>'}<div class="pick-card-actions"><button type="button" data-open-picked="${r.rank}">작품 · 입문 안내 보기 <span aria-hidden="true">↗</span></button><button type="button" data-dismiss-pick>닫기</button></div></div>`;
}

$("pickWork").addEventListener("click", () => {
  const rows = filtered().filter(r => r.start !== "미확인" && r.original !== "미확인");
  if (!rows.length) return;
  const unseen = view === "all" ? rows.filter(r => !favorites.has(r.rank)) : [];
  let pool = unseen.length ? unseen : rows;
  const fresh = pool.filter(r => r.rank !== pickedWork?.rank);
  if (fresh.length) pool = fresh;
  const r = pool[Math.floor(Math.random() * pool.length)];
  pickedWork = {rank:r.rank, signature:pickSignature(), fresh:unseen.length > 0};
  renderPick(filtered());
  $("live").textContent = `이번에 고른 작품은 ${r.title}, ${r.start}부터 감상하는 제안입니다.`;
});
$("pickCard").addEventListener("click", event => {
  if (event.target.closest("[data-dismiss-pick]")) {
    pickedWork = null;
    renderPick(filtered());
    $("pickWork").focus({preventScroll:true});
    return;
  }
  const button = event.target.closest("[data-open-picked]");
  if (!button) return;
  const rank = Number(button.dataset.openPicked);
  const index = filtered().findIndex(r => r.rank === rank);
  if (index < 0) return;
  visibleLimit = Math.max(visibleLimit, (Math.floor(index / PAGE_SIZE) + 1) * PAGE_SIZE);
  expanded.add(rank);
  render();
  const title = $("results").querySelector(`[data-detail="${rank}"]`);
  title.focus({preventScroll:true});
  title.scrollIntoView({block:"center", behavior:reducedMotion.matches ? "instant" : "smooth"});
});

function renderAccess(r) {
  const routes = r.access || [];
  const title = encodeURIComponent(r.title);
  const links = (kind) => routes.filter((link) => link.kind === kind).map((link) =>
    `<a class="access-link" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer"><span><strong>${esc(link.service)}</strong><small>${esc(link.edition)}</small><small class="access-date">${esc({"기존 서지":"서지 확인","공식 페이지·본문":"페이지 확인","공식 페이지·검색":"검색 정보 확인"}[link.method])} · ${esc(link.checkedAt.replaceAll('-', '.'))}</small></span><span aria-hidden="true">↗</span></a>`,
  ).join("");
  const uncertain = r.original === "미확인" ? '<p class="access-warning">작품을 특정하지 못한 항목입니다. 검색 결과의 제목·저자를 확인해 주세요.</p>' : '';
  return `<section class="access-guide" aria-label="${esc(r.title)} 구매와 시청 경로"><div class="access-heading"><h3>어디서 볼까요?</h3><span>국내 서비스 기준</span></div>${uncertain}<div class="access-columns"><div class="access-group"><h4>책으로 읽기</h4>${links('book') || '<p class="access-empty">등록된 서점 상품 페이지가 없어요.</p>'}<div class="access-search"><a href="https://ridibooks.com/search?keyword=${title}" target="_blank" rel="noopener noreferrer">리디 검색 ↗</a><a href="https://www.yes24.com/Product/Search?domain=ALL&amp;query=${title}" target="_blank" rel="noopener noreferrer">YES24 검색 ↗</a></div></div><div class="access-group"><h4>영상으로 보기</h4>${links('watch') || '<p class="access-empty">등록된 OTT 작품 페이지가 없어요.</p>'}<div class="access-search"><a href="https://www.justwatch.com/kr/search?q=${title}" target="_blank" rel="noopener noreferrer">OTT 통합 검색 ↗</a><a href="https://laftel.net/search?keyword=${title}" target="_blank" rel="noopener noreferrer">라프텔 검색 ↗</a></div></div></div><p class="access-note">작품 페이지 안내입니다. 현재 판매·시청 가능 여부와 가격, 권수·시즌·자막·더빙은 각 서비스에서 확인해 주세요. 검색 링크는 입점·제공을 뜻하지 않습니다.</p></section>`;
}
function renderRow(r) {
  const fav = favorites.has(r.rank);
  const open = expanded.has(r.rank);
  return `<article class="row${open ? " is-open" : ""}" data-work-id="${r.rank}">
    <div class="rank-cell">${renderCover(r)}<span class="rank ${r.rank <= 10 ? "top" : ""}" title="원본 추천 순서">${String(r.rank).padStart(2, "0")}</span></div>
    <div class="work-main"><button class="work-title" type="button" data-detail="${r.rank}" aria-expanded="${open}" aria-controls="detail-${r.rank}" aria-label="${esc(r.title)} 작품 정보"><span class="title">${esc(r.title)}</span>${chevron}</button><div class="sub"><span class="genre-tags">${esc(r.genres.length ? r.genres.join(" · ") : "분류 보류")}</span><span class="sub-separator medium-label" aria-hidden="true"></span><span class="medium-label">${esc(r.original)} 원작</span>${isUncertain(r) ? '<span class="status-uncertain">· 확인 보류</span>' : ""}</div></div>
    <span class="badge original">${esc(r.original)}</span><span class="badge start${r.start === "미확인" ? " unconfirmed" : ""}" aria-label="${esc(r.start)} 입문 추천">${r.start === "미확인" ? "미확인" : esc(r.start) + "부터"}</span>
    <button class="star" type="button" data-rank="${r.rank}" aria-pressed="${fav}" aria-label="${esc(r.title)} 관심 ${fav ? "해제" : "등록"}">${starIcon}</button>
    <div class="work-detail" id="detail-${r.rank}"${open ? "" : " hidden"}><div class="detail-body"><div class="detail-heading"><span class="detail-label">자료 확인</span><span class="badge${isUncertain(r) ? " unconfirmed" : ""}">${esc(r.check)}</span>${r.animeChecked ? '<span class="badge start">애니 공식 자료 확인</span>' : ""}</div><p>원작 <strong>${esc(r.original)}</strong> <span aria-hidden="true">·</span> 처음 추천 <strong>${esc(r.start)}</strong></p>${renderEntryGuide(r)}${renderAccess(r)}${r.tags?.length ? `<div class="detail-tags">${r.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div>` : ""}${r.aliases.length ? `<p>다른 이름: ${r.aliases.map(esc).join(", ")}</p>` : ""}${r.note ? `<p>${esc(r.note)}</p>` : ""}<div class="sources">${r.evidence.map((e, i) => `<a class="source-link" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer"><span class="source-number" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span><span><strong>${esc(e.label)}</strong><small>${esc(e.scope)}</small></span><span aria-hidden="true">↗</span></a>`).join("")}</div>${r.cover ? `<p class="cover-credit">표지: <a href="${esc(r.cover.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(r.cover.source)} 서점 판본 ↗</a> · 원작 또는 등록된 도서 판본의 표지입니다.</p>` : ""}<p class="detail-date">자료 확인일 ${esc((r.checkedAt || "2026-10-20").replaceAll("-", "."))}<br>실시간 재고와 국내 OTT 제공 여부는 별도로 확인해 주세요.</p></div></div>
  </article>`;
}
function render() {
  const rows = filtered();
  updateControls(rows);
  renderPick(rows);
  const emptyShelf = view === "favorites" && !favorites.size;
  $("results").innerHTML = rows.length
    ? rows.slice(0, visibleLimit).map(renderRow).join("")
    : `<div class="empty"><span class="empty-icon" aria-hidden="true">${starIcon}</span><strong>${emptyShelf ? "좋은 이야기를 위한 빈자리." : "이 조건의 이야기는 아직 없어요."}</strong><p>${emptyShelf ? "마음에 드는 작품의 별표를 눌러보세요.<br>보고 싶은 순간을 위해 여기에 모아둘게요." : "선택한 조건을 하나씩 지우거나<br>다른 제목이나 장르로 찾아보세요."}</p><button type="button" data-empty-action>${emptyShelf ? "전체 작품 둘러보기 →" : "검색 · 필터 초기화"}</button></div>`;
  $("loadMoreArea").classList.toggle("hidden", rows.length <= PAGE_SIZE);
  $("displayCount").textContent =
    `${Math.min(visibleLimit, rows.length)} / ${rows.length}편을 보고 있어요`;
  $("loadMore").hidden = visibleLimit >= rows.length;
  $("loadMore").innerHTML =
    `다음 ${Math.min(PAGE_SIZE, Math.max(0, rows.length - visibleLimit))}편 더 보기 <span aria-hidden="true">＋</span>`;
}
function resetFilters() {
  for (const id of FILTER_IDS) $(id).value = "";
  $("sort").value = "rank";
  visibleLimit = PAGE_SIZE;
  render();
}
function setView(next) {
  view = next;
  visibleLimit = PAGE_SIZE;
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
    b.setAttribute("aria-pressed", String(b.dataset.view === view));
  });
  render();
  window.scrollTo({
    top: 0,
    behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
      ? "instant"
      : "smooth",
  });
}
function refreshFavorite(id) {
  if (view === "favorites") {
    render();
    return;
  }
  updateControls(filtered());
  renderPick(filtered());
  const button = $("results").querySelector(`[data-rank="${id}"]`);
  if (button) {
    const row = DATA.find((r) => r.rank === id);
    button.setAttribute("aria-pressed", String(favorites.has(id)));
    button.setAttribute(
      "aria-label",
      `${row.title} 관심 ${favorites.has(id) ? "해제" : "등록"}`,
    );
  }
}
for (const id of [...FILTER_IDS, "sort"])
  $(id).addEventListener(id === "query" ? "input" : "change", () => {
    visibleLimit = PAGE_SIZE;
    render();
  });
$("clear").addEventListener("click", () => {
  $("query").value = "";
  visibleLimit = PAGE_SIZE;
  render();
  $("query").focus();
});
$("reset").addEventListener("click", resetFilters);
document
  .querySelectorAll("[data-view]")
  .forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
$("genreQuick").addEventListener("click", (e) => {
  const button = e.target.closest("[data-genre]");
  if (!button) return;
  $("genre").value = button.dataset.genre;
  visibleLimit = PAGE_SIZE;
  render();
});
$("activeFilters").addEventListener("click", (e) => {
  if (e.target.closest("[data-clear-all]")) {
    resetFilters();
    $("genreQuick").querySelector("button").focus({ preventScroll: true });
    return;
  }
  const button = e.target.closest("[data-clear-filter]");
  if (!button) return;
  const position = [
    ...$("activeFilters").querySelectorAll("[data-clear-filter]"),
  ].indexOf(button);
  $(button.dataset.clearFilter).value = "";
  visibleLimit = PAGE_SIZE;
  render();
  (
    $("activeFilters").querySelectorAll("[data-clear-filter]")[position] ||
    $("genreQuick").querySelector('[aria-pressed="true"]') ||
    $("query")
  ).focus({ preventScroll: true });
});
$("results").addEventListener("click", (e) => {
  const detailButton = e.target.closest("[data-detail]");
  if (detailButton) {
    const id = Number(detailButton.dataset.detail);
    const isOpen = !expanded.has(id);
    isOpen ? expanded.add(id) : expanded.delete(id);
    detailButton.setAttribute("aria-expanded", String(isOpen));
    setPanelOpen($(`detail-${id}`), isOpen);
    detailButton.closest(".row").classList.toggle("is-open", isOpen);
    return;
  }
  if (e.target.closest("[data-empty-action]")) {
    if (view === "favorites" && !favorites.size) setView("all");
    resetFilters();
    $("collection").focus({ preventScroll: true });
    return;
  }
  const button = e.target.closest("[data-rank]");
  if (!button) return;
  const id = Number(button.dataset.rank);
  const wasFavorite = favorites.has(id);
  const position = [...$("results").querySelectorAll("[data-rank]")].indexOf(
    button,
  );
  wasFavorite ? favorites.delete(id) : favorites.add(id);
  const saved = saveFavorites();
  refreshFavorite(id);
  if (saved)
    toast(
      wasFavorite ? "관심 작품에서 꺼냈어요." : "나의 서가에 담았어요.",
      () => {
        wasFavorite ? favorites.add(id) : favorites.delete(id);
        const restored = saveFavorites();
        refreshFavorite(id);
        if (restored) toast("이전 상태로 되돌렸어요.");
        (
          $("results").querySelector(`[data-rank="${id}"]`) ||
          document.querySelector('[data-view="favorites"]')
        ).focus({ preventScroll: true });
      },
    );
  const next =
    $("results").querySelector(`[data-rank="${id}"]`) ||
    $("results").querySelectorAll("[data-rank]")[
      Math.min(
        position,
        $("results").querySelectorAll("[data-rank]").length - 1,
      )
    ] ||
    $("results").querySelector("[data-empty-action]");
  next?.focus({ preventScroll: true });
});
$("loadMore").addEventListener("click", () => {
  const previousCount = Math.min(visibleLimit, filtered().length);
  visibleLimit += PAGE_SIZE;
  render();
  const next = $("results").querySelectorAll(".row")[previousCount];
  next?.querySelector("[data-detail]").focus({ preventScroll: true });
  next?.scrollIntoView({
    block: "start",
    behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
      ? "instant"
      : "smooth",
  });
});
$("reviewLink").addEventListener("click", () => {
  setDisclosureOpen($("review"), true);
});
document.addEventListener("keydown", (event) => {
  const editing = event.target.closest(
    "input,textarea,select,[contenteditable]",
  );
  if (
    event.key === "/" &&
    !editing &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault();
    $("query").focus();
  }
  if (
    event.key === "Escape" &&
    document.activeElement === $("query") &&
    $("query").value
  ) {
    $("query").value = "";
    visibleLimit = PAGE_SIZE;
    render();
  }
});
$("exportFavorites").addEventListener("click", () => {
  const backup = {
    app: "gamsang-shelf",
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites: [...favorites].sort((a, b) => a - b),
    titles: DATA.filter((r) => favorites.has(r.rank)).map((r) => ({
      rank: r.rank,
      title: r.title,
    })),
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "감상서가_관심목록.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`관심 작품 ${favorites.size}편을 백업했어요.`);
});
$("importFavorites").addEventListener("click", () =>
  $("favoritesFile").click(),
);
$("favoritesFile").addEventListener("change", async () => {
  const file = $("favoritesFile").files[0];
  if (!file) return;
  $("importFavorites").disabled = true;
  try {
    if (file.size > 1024 * 1024) throw new Error("oversized");
    const backup = JSON.parse(await file.text());
    if (
      backup.app !== "gamsang-shelf" ||
      backup.version !== 1 ||
      !Array.isArray(backup.favorites) ||
      !backup.favorites.every(
        (id) => Number.isInteger(id) && knownRanks.has(id),
      )
    )
      throw new Error("invalid");
    const previous = favorites.size;
    backup.favorites.forEach((id) => favorites.add(id));
    const saved = saveFavorites();
    render();
    if (saved)
      toast(
        `${favorites.size - previous}편을 추가했어요. 기존 관심 목록도 함께 보관합니다.`,
      );
  } catch {
    toast("감상 서가에서 받은 관심 목록 JSON 백업 파일을 선택해 주세요.");
  } finally {
    $("favoritesFile").value = "";
    $("importFavorites").disabled = false;
  }
});
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  try {
    const saved = JSON.parse(event.newValue || "[]");
    if (Array.isArray(saved)) {
      favorites = new Set(saved.filter((id) => knownRanks.has(id)));
      render();
      toast("다른 창에서 바뀐 관심 목록을 반영했어요.");
    }
  } catch {
    /* Ignore malformed changes from another tab. */
  }
});
$("changeCount").textContent = `· ${CHANGES.length}건`;
$("changes").innerHTML = CHANGES.map(
  (r) =>
    `<tr><td>${esc(r.before)}</td><td>${esc(r.after)}</td><td><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">자료 ↗</a></td></tr>`,
).join("");
render();
