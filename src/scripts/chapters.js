// The sidebar's chapter list (ChapterList.astro): the sections of whatever is
// being read, with a ruler of ticks beside them whose blue lens follows the
// reading position, sitting beside the current section's name and sliding
// toward the next as it gets near. Clicking a name scrolls there.
//
// Rescans when a password gate reveals a case study (gate:unlocked).

// What a page supplies: the container (its value names the page in the
// list's title), a chapter inside it, and the heading a chapter falls back
// to for its name
const CONTAINER_SELECTOR = '[data-chapters]';
const SECTION_SELECTOR = '[data-chapter][id]';
const LABEL_SELECTOR = '.type-h4';
// A section counts as reached once its top is this far past the scroller's
// top edge: a little early feels more natural than exact-0
const ACTIVATE_OFFSET = 24;
// How long a jump to a chapter takes to fly there
const SCROLL_MS = 420;
// The ruler (Paper: Chapters, desktop): 1px ticks on a 2px pitch inside 4px
// of padding, 2px wide, swelling to 8px around the reading position. Both
// the swell and the accent colour follow a smooth bell (raised cosine) of
// each tick's distance from the lens centre, which moves continuously
// rather than tick to tick. The colour fades out further below than above,
// a trail like the one in the Paper design.
const PITCH = 2;
const PAD = 4;
const TICK = 2; // plain tick width, px
const SWELL = 6; // extra width at the centre, px
const SWELL_REACH = 9; // ticks either side the swell reaches
const COLOR_ABOVE = 8; // ticks the accent reaches above the centre
const COLOR_BELOW = 16; // and below
// The lens eases toward where it's headed (the reading position, or the
// pointer while it's over the list): this share of the gap closes per frame
const FOLLOW = 0.16;
const bell = (d, reach) => (d >= reach ? 0 : (1 + Math.cos((Math.PI * d) / reach)) / 2);

let chapters = [];
// Each chapter's top in the scroller's own coordinates, and each row's
// [top, height] in the list; re-measured on resize, not on every scroll
let offsets = [];
let rows = [];
let lineHeight = 20.8;
let scroller = null;
let lensAt = null; // where the lens was last painted, in ticks (fractional)
// Where the lens is headed (px from the top of the list): the reading
// position, or the pointer while it hovers the list; and where it is now
let readY = null;
let hoverY = null;
let lensY = null;
let lensFrame = 0;
let sizeObserver = null;
let measureFrame = 0;
let scrollFrame = 0;

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const els = () => ({
  nav: document.getElementById('chapterNav'),
  title: document.getElementById('chapterTitle'),
  list: document.getElementById('chapterList'),
  ruler: document.getElementById('chapterRuler'),
});

// The document scrolls; `originTop` is where its content's top sits in
// viewport coordinates
const pageScroller = () => {
  const el = document.scrollingElement ?? document.documentElement;
  return {
    get top() { return el.scrollTop; },
    // html has scroll-behavior: smooth, which would chase every frame of the
    // tween below; 'instant' opts these writes out of it
    set top(value) { window.scrollTo({ top: value, behavior: 'instant' }); },
    get max() { return Math.max(1, el.scrollHeight - el.clientHeight); },
    originTop: () => -el.scrollTop,
  };
};

// The page's container, skipping anything still behind a password gate
function findContainer() {
  return [...document.querySelectorAll(CONTAINER_SELECTOR)].find((el) => !el.closest('[hidden]')) ?? null;
}

function labelFor(el) {
  const label = el.dataset.chapter?.trim() || el.querySelector(LABEL_SELECTOR)?.textContent.trim() || el.id;
  // Names end in a full stop, like the nav above them
  return /[.!?]$/.test(label) ? label : `${label}.`;
}

function render(title) {
  const { nav, title: titleEl, list } = els();
  titleEl.textContent = title;
  titleEl.hidden = !title;
  list.replaceChildren(...chapters.map(({ label }, i) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'chapter-row';
    row.textContent = label;
    row.dataset.chapterIndex = String(i);
    return row;
  }));
  nav.hidden = false;
  layoutRuler();
}

function hide() {
  cancelAnimationFrame(lensFrame);
  lensFrame = 0;
  readY = hoverY = lensY = null;
  chapters = [];
  offsets = [];
  rows = [];
  scroller = null;
  sizeObserver?.disconnect();
  sizeObserver = null;
  cancelAnimationFrame(measureFrame);
  const { nav } = els();
  if (nav) nav.hidden = true;
}

// As many ticks as fit the list's height, and where each row sits
function layoutRuler() {
  const { list, ruler } = els();
  if (!list || !ruler || !chapters.length) return;
  const n = Math.max(0, Math.floor((list.offsetHeight - 2 * PAD + 1) / PITCH));
  if (ruler.children.length !== n) {
    ruler.replaceChildren(...Array.from({ length: n }, () => document.createElement('span')));
    lensAt = null;
  }
  rows = [...list.children].map((r) => [r.offsetTop, r.offsetHeight]);
  if (list.firstElementChild) lineHeight = parseFloat(getComputedStyle(list.firstElementChild).lineHeight) || lineHeight;
}

// Centre the lens at y (px from the top of the list)
function paint(y) {
  const { ruler } = els();
  if (!ruler) return;
  const c = (y - PAD) / PITCH;
  if (lensAt !== null && Math.abs(c - lensAt) < 0.02) return;
  lensAt = c;
  [...ruler.children].forEach((tick, k) => {
    const d = k - c;
    const w = TICK + SWELL * bell(Math.abs(d), SWELL_REACH);
    // Full accent through the middle of the lens, easing out into ink
    const a = Math.min(1, 1.3 * bell(Math.abs(d), d < 0 ? COLOR_ABOVE : COLOR_BELOW));
    // Empty strings fall back to the plain 2px ink tick in the stylesheet
    tick.style.width = w > TICK + 0.05 ? `${w.toFixed(2)}px` : '';
    tick.style.background = a > 0.01
      ? `color-mix(in srgb, var(--color-text-accent) ${(a * 100).toFixed(1)}%, var(--color-text-strong))`
      : '';
  });
}

// Glide the lens toward its target, one frame at a time
function aim() {
  if (lensFrame) return;
  const step = () => {
    lensFrame = 0;
    const target = hoverY ?? readY;
    if (target === null) return;
    const gap = target - (lensY ?? target);
    lensY = reduceMotion() || Math.abs(gap) < 0.1 ? target : lensY + gap * FOLLOW;
    paint(lensY);
    if (lensY !== target) lensFrame = requestAnimationFrame(step);
  };
  lensFrame = requestAnimationFrame(step);
}

function measure() {
  if (!scroller) return;
  const originTop = scroller.originTop();
  offsets = chapters.map(({ el }) => el.getBoundingClientRect().top - originTop);
  layoutRuler();
}

// A gate reveal, font swap or image load reflows the page; re-measure once
// per frame however many times the observer fires
function watchSize(container) {
  sizeObserver?.disconnect();
  sizeObserver = null;
  if (!container || typeof ResizeObserver === 'undefined') return;
  sizeObserver = new ResizeObserver(() => {
    cancelAnimationFrame(measureFrame);
    measureFrame = requestAnimationFrame(() => {
      measure();
      onScroll();
    });
  });
  sizeObserver.observe(container);
}

// The lens travels from the middle of the current row's first line to the
// next row's, in step with progress through the current section
function onScroll() {
  if (!scroller || !offsets.length || rows.length !== offsets.length) return;
  const top = scroller.top;
  let i = 0;
  for (let k = 0; k < offsets.length; k++) {
    if (top + ACTIVATE_OFFSET >= offsets[k]) i = k;
  }
  const start = offsets[i];
  const end = i + 1 < offsets.length ? offsets[i + 1] : scroller.max;
  const p = end > start ? clamp((top - start) / (end - start), 0, 1) : 1;
  const from = rows[i][0] + lineHeight / 2;
  const to = i + 1 < rows.length ? rows[i + 1][0] + lineHeight / 2 : rows[i][0] + rows[i][1] - lineHeight / 2;
  readY = from + (to - from) * p;
  aim();

  const { list } = els();
  [...(list?.children ?? [])].forEach((row, k) => {
    if (k === i) row.setAttribute('aria-current', 'location');
    else row.removeAttribute('aria-current');
  });
}

function scan() {
  if (!els().nav) return;
  const container = findContainer();
  const sections = container ? [...container.querySelectorAll(SECTION_SELECTOR)] : [];
  if (!sections.length) return hide();

  scroller = pageScroller();
  chapters = sections.map((el) => ({ label: labelFor(el), el }));
  render(container.dataset.chapters?.trim() ?? '');
  watchSize(container);
  measure();
  onScroll();
}

// Driven by hand rather than scrollTo({ behavior: 'smooth' }): a page that
// reflows mid-animation (lazy images landing) makes the browser abandon a
// smooth scroll it was running
function tweenScroll(to) {
  cancelAnimationFrame(scrollFrame);
  const from = scroller.top;
  const distance = to - from;
  if (!distance) return;
  if (reduceMotion()) {
    scroller.top = to;
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / SCROLL_MS);
    scroller.top = from + distance * (1 - (1 - t) ** 3); // easeOutCubic
    if (t < 1) scrollFrame = requestAnimationFrame(step);
  };
  scrollFrame = requestAnimationFrame(step);
}

function scrollToChapter(index) {
  if (!scroller || !chapters[index]) return;
  measure();
  tweenScroll(Math.max(0, offsets[index] - 16));
}

document.addEventListener('astro:page-load', () => {
  scan();

  window.__chaptersAbort?.abort();
  const controller = new AbortController();
  window.__chaptersAbort = controller;
  const { signal } = controller;
  const { list } = els();

  window.addEventListener('scroll', onScroll, { signal, passive: true });
  const refresh = () => {
    measure();
    onScroll();
  };
  window.addEventListener('resize', refresh, { signal });
  // Web fonts arriving after first paint reflow the page and the list
  document.fonts?.ready.then(refresh);

  document.addEventListener('gate:unlocked', scan, { signal });

  // Over the list, the lens follows the pointer; leaving hands it back
  const body = list?.parentElement;
  body?.addEventListener('pointermove', (e) => {
    if (!rows.length) return;
    const y = e.clientY - list.getBoundingClientRect().top;
    hoverY = clamp(y, lineHeight / 2, list.offsetHeight - lineHeight / 2);
    aim();
  }, { signal });
  body?.addEventListener('pointerleave', () => {
    hoverY = null;
    aim();
  }, { signal });

  list?.addEventListener('click', (e) => {
    const row = e.target.closest('.chapter-row');
    if (row) scrollToChapter(Number(row.dataset.chapterIndex));
  }, { signal });
});
