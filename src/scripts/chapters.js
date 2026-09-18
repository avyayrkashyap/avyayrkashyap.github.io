// Chapter pill + TOC for pages with headings inside a sheet (About, today).
//
// Rescans whenever sheet.js says the sheet's content changed or closed
// (sheet:content-changed / sheet:closed) — never on a raw timer or
// MutationObserver, since sheet.js already knows exactly when content swaps.
// Finding zero headings (any other sheet) just hides everything back down to
// the plain Home/About/Now/Resume dock.
//
// Scroll-spy and the smooth-scroll-to-chapter both operate on #sheetBody,
// since chapters only ever live inside a sheet, never a plain page.

// What counts as a "chapter": every element matching this, in DOM order,
// read via its own text for the chapter name
const SECTION_SELECTOR = '#sheetBody .ab-section[id]';
const LABEL_SELECTOR = '.ab-section-label';
// Section becomes "active" once its top has scrolled this far past the
// sheet's own top edge — a little early feels more natural than exact-0
const ACTIVATE_OFFSET = 24;
// The pill waits this long after the sheet opens before revealing itself,
// so it appears once the sheet's own 0.5s slide-up has mostly settled
const REVEAL_DELAY_MS = 600;
// Both match the staged animations in ChapterPill.astro: the entrance runs
// grow -> flip -> picture -> text, and the name/progress stage starts at
// TEXT_STAGE_MS; the exit reverses that and finishes at LEAVE_MS.
const TEXT_STAGE_MS = 700;
const LEAVE_MS = 700;
// Same cadence as the hero headline's word cycle (hero.js), so the two
// typewriter effects on the site feel like the same voice
const TYPE_MS = 70;
const DELETE_MS = 40;
const GAP_MS = 150;
// How long a jump to a chapter takes to fly there
const SCROLL_MS = 420;

let chapters = [];
let activeIndex = -1;
let revealTimer = null;
let typeTimer = null;
let leaveTimer = null;
let stageTimer = null;
let scrollFrame = 0;
// True once the entrance has reached its text stage. Until then the name is
// set silently — typewriting it while it's still faded out would burn the
// effect off-screen, and it could even finish before anyone sees it start.
let textReady = false;

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const els = () => ({
  chapter: document.getElementById('dockChapter'),
  pill: document.getElementById('chapterPill'),
  name: document.getElementById('chapterName'),
  fill: document.getElementById('chapterProgressFill'),
  dropdown: document.getElementById('chapterDropdown'),
  sheetPanel: document.getElementById('chapterSheet'),
  tocDesktop: document.getElementById('chapterTocDesktop'),
  dock: document.getElementById('dock'),
  sheetBody: document.getElementById('sheetBody'),
});

function buildRow(label, index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chapter-row';
  button.textContent = label;
  button.dataset.chapterIndex = String(index);
  return button;
}

function renderRows() {
  const { dropdown, sheetPanel } = els();
  if (!dropdown || !sheetPanel) return;
  [dropdown, sheetPanel].forEach((container) => {
    container.innerHTML = '';
    chapters.forEach(({ label }, index) => container.appendChild(buildRow(label, index)));
  });
}

// Desktop's dropdown. The mobile list isn't touched here: it mirrors the
// dock's own menu button, so closing it is the dock's business (see the
// dock:menu-toggle listener) and doing it here too would desync the two.
function closeDropdown() {
  const { dropdown, tocDesktop } = els();
  dropdown?.classList.remove('is-open');
  tocDesktop?.setAttribute('aria-expanded', 'false');
}

// Everything, for when the chapters themselves go away
function closePanels() {
  const { sheetPanel } = els();
  closeDropdown();
  sheetPanel?.classList.remove('is-open');
}

function hide() {
  clearTimeout(revealTimer);
  clearTimeout(typeTimer);
  clearTimeout(leaveTimer);
  clearTimeout(stageTimer);
  chapters = [];
  activeIndex = -1;
  progressHold = false;
  textReady = false;
  const { chapter, name, dropdown, sheetPanel } = els();
  closePanels();

  const teardown = () => {
    const { dock } = els();
    chapter?.classList.remove('is-visible', 'is-leaving');
    // Hands the mobile bar's main row back to the page label
    dock?.classList.remove('dock--chapters');
    if (name) name.textContent = '';
    if (dropdown) dropdown.innerHTML = '';
    if (sheetPanel) sheetPanel.innerHTML = '';
  };

  // Nothing on screen to animate away (or motion is off): drop it right away
  if (!chapter?.classList.contains('is-visible') || reduceMotion()) {
    teardown();
    return;
  }

  // Keep .is-visible on for now so the pill holds its place in the dock
  // while it rotates back out; .is-leaving supplies the exit animation.
  chapter.classList.add('is-leaving');
  leaveTimer = setTimeout(teardown, LEAVE_MS);
}

// Erases whatever the name currently shows, then types the new label —
// same erase/type/pause rhythm as the hero headline's word cycle. Skips
// straight to the plain label under reduced motion. onDone fires once the
// new label is fully typed (or immediately, under reduced motion).
function typewriteTo(el, text, onDone) {
  clearTimeout(typeTimer);
  if (!el) return;
  if (reduceMotion()) {
    el.textContent = text;
    onDone?.();
    return;
  }

  const from = el.textContent;
  let i = from.length;
  const erase = () => {
    i--;
    el.textContent = from.slice(0, Math.max(0, i));
    if (i > 0) {
      typeTimer = setTimeout(erase, DELETE_MS);
    } else {
      typeTimer = setTimeout(type, GAP_MS);
    }
  };
  let j = 0;
  function type() {
    j++;
    el.textContent = text.slice(0, j);
    if (j < text.length) typeTimer = setTimeout(type, TYPE_MS);
    else onDone?.();
  }

  if (from) erase();
  else type();
}

function setActive(index) {
  if (index === activeIndex) return;
  // False only on the chapter the reveal starts on — there's no prior
  // chapter's bar value to clash with, so it can just fill in normally
  const changingChapter = activeIndex !== -1;
  activeIndex = index;
  const { name, dropdown, sheetPanel } = els();
  const label = chapters[index]?.label ?? '';
  [dropdown, sheetPanel].forEach((container) => {
    container?.querySelectorAll('.chapter-row').forEach((row, i) => {
      row.classList.toggle('is-active', i === index);
    });
  });

  // Scroll events (and their onScroll -> setActive calls) keep firing while
  // the pill is still hidden or mid-entrance. Keep the text in sync silently
  // until its stage arrives; that stage forces one fresh empty->label
  // typewrite of its own (see scan()).
  if (!textReady) {
    if (name) name.textContent = label;
    return;
  }

  if (changingChapter) {
    // Moving to a new chapter used to recompute the fill against the new
    // chapter's span the instant the scroll threshold crossed — while the
    // name was still blank mid-erase, well before it finished retyping. The
    // two visibly disagreeing read as a jump. Filling to "done" and holding
    // there until the new name has finished typing keeps them in step: old
    // chapter completes, name changes, then the bar resets for the new one.
    progressHold = true;
    setProgress(1);
  }
  typewriteTo(name, label, () => {
    progressHold = false;
    onScroll();
  });
}

function setProgress(fraction) {
  const { fill } = els();
  if (fill) fill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}

// Each chapter's top, in #sheetBody's own scroll coordinates — recomputed
// whenever chapters change or the sheet resizes, not on every scroll tick
let offsets = [];
// While true, setActive has pinned the bar at "done" until the new chapter
// name finishes typing (see setActive) — onScroll must not fight that
let progressHold = false;

// The width the nav has to grow by to fit the pill, handed to CSS so the
// grow/shrink keyframes have a real target instead of a guess. The pill keeps
// its natural width even while the clip around it is collapsed (flex-shrink:
// 0), so this reads true whether or not the pill is currently shown — and
// reads 0 on mobile, where the pill is display:none and the nav shouldn't
// grow at all.
function measureWidth() {
  const { chapter, pill } = els();
  if (!chapter || !pill) return;
  chapter.style.setProperty('--chapter-width', `${pill.offsetWidth}px`);
}

function measure() {
  const { sheetBody } = els();
  if (!sheetBody) return;
  const bodyTop = sheetBody.getBoundingClientRect().top - sheetBody.scrollTop;
  // Looked up by id rather than trusting the node captured at scan time. On a
  // direct load of a sheet page the body's content is replaced after that
  // first scan, which left every chapter holding a detached node: those
  // measure as a rect of zeros, so every offset collapsed to the top of the
  // page and jumping to a chapter scrolled nowhere.
  offsets = chapters.map(({ id, el }) => {
    const node = sheetBody.querySelector(`[id="${CSS.escape(id)}"]`) ?? el;
    return node.getBoundingClientRect().top - bodyTop;
  });
}

function onScroll() {
  const { sheetBody } = els();
  if (!sheetBody || !offsets.length) return;
  const scrollTop = sheetBody.scrollTop;
  const maxScroll = Math.max(1, sheetBody.scrollHeight - sheetBody.clientHeight);

  let index = 0;
  for (let i = 0; i < offsets.length; i++) {
    if (scrollTop + ACTIVATE_OFFSET >= offsets[i]) index = i;
  }
  setActive(index);
  if (progressHold) return;

  const start = offsets[index];
  const end = index + 1 < offsets.length ? offsets[index + 1] : maxScroll;
  setProgress(end > start ? (scrollTop - start) / (end - start) : 1);
}

function scan() {
  const { sheetBody, chapter } = els();
  if (!sheetBody || !chapter) return;

  const sections = [...sheetBody.querySelectorAll(SECTION_SELECTOR)];
  if (!sections.length) {
    hide();
    return;
  }

  chapters = sections.map((el) => ({
    id: el.id,
    label: el.querySelector(LABEL_SELECTOR)?.textContent.trim() ?? el.id,
    el,
  }));
  activeIndex = -1;
  renderRows();
  measure();

  // Reveal (and the name's first typewrite-in) waits until the sheet has
  // mostly finished sliding up. Clearing .is-visible and forcing a reflow
  // first means the CSS entrance animation replays even if the pill was
  // already visible a moment ago (closing and reopening About quickly).
  clearTimeout(revealTimer);
  clearTimeout(stageTimer);
  // Cancels an exit still rotating out from the sheet we just left, so its
  // teardown can't land in the middle of this entrance
  clearTimeout(leaveTimer);
  textReady = false;
  chapter.classList.remove('is-visible', 'is-leaving');
  void chapter.offsetWidth;
  measureWidth();
  revealTimer = setTimeout(() => {
    chapter.classList.add('is-visible');
    // Mobile: the pill takes the bar's main row, so the page label steps
    // aside (the rule lives in Dock.astro, which owns that label)
    els().dock?.classList.add('dock--chapters');
    // The entrance's own stages take it from here (grow, flip, picture);
    // the name and progress bar wait for their stage below.
    stageTimer = setTimeout(() => {
      // Forces setActive to see a real change and start from nothing, so the
      // name always visibly types in as the text fades up, however much
      // scrolling happened earlier in the entrance
      textReady = true;
      activeIndex = -1;
      progressHold = false;
      const { name } = els();
      if (name) name.textContent = '';
      onScroll();
    }, TEXT_STAGE_MS);
  }, REVEAL_DELAY_MS);
}

// Driven by hand rather than left to scrollTo({ behavior: 'smooth' }).
// Jumping to a chapter also closes the panels, which resizes the dock, and
// sheet.js resizes the sheet under it to match — a scroller resized
// mid-animation is reason enough for the browser to abandon a smooth scroll
// it was running, so the jump simply never moved. Nothing cancels this one.
function tweenScroll(el, to) {
  cancelAnimationFrame(scrollFrame);
  const from = el.scrollTop;
  const distance = to - from;
  if (!distance) return;
  if (reduceMotion()) {
    el.scrollTop = to;
    return;
  }

  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / SCROLL_MS);
    // easeOutCubic: leaves quickly, settles gently, like the pill's own motion
    el.scrollTop = from + distance * (1 - (1 - t) ** 3);
    if (t < 1) scrollFrame = requestAnimationFrame(step);
  };
  scrollFrame = requestAnimationFrame(step);
}

function scrollToChapter(index) {
  const { sheetBody } = els();
  const target = chapters[index];
  if (!sheetBody || !target) return;
  measure();
  const top = Math.max(0, offsets[index] - 16);

  closeDropdown();
  // Mobile: the list only exists because the dock's menu is open, so closing
  // that is what puts the list away — closing the list on its own here would
  // leave the menu behind, still showing the nav links
  document.dispatchEvent(new CustomEvent('dock:close-menu'));

  tweenScroll(sheetBody, top);
}

document.addEventListener('astro:page-load', () => {
  scan();

  window.__chaptersAbort?.abort();
  const controller = new AbortController();
  window.__chaptersAbort = controller;
  const { signal } = controller;

  const { sheetBody, tocDesktop, dropdown, sheetPanel, chapter } = els();

  sheetBody?.addEventListener('scroll', onScroll, { signal, passive: true });
  window.addEventListener('resize', () => {
    // Crossing the mobile breakpoint changes the pill's width to or from 0
    measureWidth();
    measure();
    onScroll();
  }, { signal });

  document.addEventListener('sheet:content-changed', scan, { signal });
  document.addEventListener('sheet:closed', hide, { signal });
  // Mobile: the dock's grid button reveals the chapter list alongside the
  // nav links, so the list simply follows the menu's state
  document.addEventListener('dock:menu-toggle', (e) => {
    const { sheetPanel } = els();
    sheetPanel?.classList.toggle('is-open', Boolean(e.detail?.open) && chapters.length > 0);
  }, { signal });

  tocDesktop?.addEventListener('click', () => {
    const open = !dropdown.classList.contains('is-open');
    dropdown.classList.toggle('is-open', open);
    tocDesktop.setAttribute('aria-expanded', String(open));
  });

  [dropdown, sheetPanel].forEach((container) => {
    container?.addEventListener('click', (e) => {
      const row = e.target.closest('.chapter-row');
      if (row) scrollToChapter(Number(row.dataset.chapterIndex));
    });
  });

  document.addEventListener('click', (e) => {
    if (!chapter || chapter.contains(e.target)) return;
    closeDropdown();
  }, { signal });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
  }, { signal });
});
