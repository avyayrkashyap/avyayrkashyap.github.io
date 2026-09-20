// Chapter pill + TOC for long pages that opt in — pages read inside a sheet
// (About, Now, Resume) and ordinary routes that scroll the window (the case
// studies) both work the same way.
//
// ── How a page opts in ──
// Markup only, no per-page script:
//
//   <div class="ms-content" data-chapters>
//     <section class="ms-section" id="context" data-chapter>
//       <h2 class="ms-section-label type-h4">Context</h2>
//     </section>
//     <div class="ms-theme" id="building-swan" data-chapter="Building Swan">…</div>
//   </div>
//
// data-chapters marks the container to scan; data-chapter marks a chapter
// inside it, and its id is the jump target, so it has to be stable and
// unique. The name the pill types is data-chapter's own value when it has
// one, else the text of the first .type-h4 inside (the site's section-label
// primitive), else the id. Give the value outright whenever a section's
// first .type-h4 isn't its label, or when the visible heading is a sentence
// rather than a name — the pill types it out a character at a time, in a
// slot barely wide enough for a few words.
//
// Only elements actually marked count, at any depth under the container, so
// a page can promote a nested group to a chapter (Moody's themes) without
// every block inside it becoming one.
//
// ── Which scroller ──
// A sheet on top is what's being read, so its chapters win while one is open
// and #sheetBody does the scrolling; otherwise the page's own container is
// used and the document scrolls. Measurement, scroll-spy, progress and the
// smooth jump all run against whichever of the two `scroller` currently
// holds, so nothing below this point knows which kind of page it's on.
//
// Rescans whenever sheet.js says the sheet's content changed or closed
// (sheet:content-changed / sheet:closed), and when a password gate reveals a
// case study (gate:unlocked) — never on a raw timer or MutationObserver,
// since each of those events already knows exactly when content appeared.
// Finding no chapters hides everything back down to the plain
// Home/About/Now/Resume dock.

// What a page must supply: the container, a chapter inside it, and the
// heading a chapter falls back to for its name
const CONTAINER_SELECTOR = '[data-chapters]';
const SECTION_SELECTOR = '[data-chapter][id]';
const LABEL_SELECTOR = '.type-h4';
// Section becomes "active" once its top has scrolled this far past the
// scroller's own top edge — a little early feels more natural than exact-0
const ACTIVATE_OFFSET = 24;
// The pill waits this long after a page arrives before revealing itself, so
// it appears once a sheet's own 0.5s slide-up (or a route's transition) has
// mostly settled
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
// Offsets are only as good as the layout they were taken against, and a page
// keeps settling after load: a password gate reveals the content, web fonts
// swap, images land. Timed re-measures can only guess at when that finishes,
// and on the gated case study they guessed wrong, leaving the pill a chapter
// behind. Watching the container's own size catches every one of those.
let sizeObserver = null;
let measureFrame = 0;
// Set when a nav link is tapped from an expanded dock (dock.js): the dock
// collapses to route, and if what arrives has chapters, its list takes the
// space the nav links just gave up rather than waiting to be asked for.
let expandOnArrival = false;
// True once the entrance has reached its text stage. Until then the name is
// set silently — typewriting it while it's still faded out would burn the
// effect off-screen, and it could even finish before anyone sees it start.
let textReady = false;
// Whether a sheet is the thing being read. Taken from sheet.js's own events
// rather than from what #sheetBody happens to contain: a closed sheet keeps
// its last content in the DOM, and a sheet opened over a page is injected
// before it's marked open, so containment answers this wrong at both ends.
let sheetActive = false;

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

// ── Scrollers ──
// The two kinds of page, behind one shape. `root` is where a chapter is
// looked up again by id at measure time, and `originTop` is where the
// scrolled content's very top sits in viewport coordinates — the only two
// things that genuinely differ between them.

// A sheet body holds its place on screen while its content scrolls inside
// it, so its content starts however far it has been scrolled above its own
// top edge.
const sheetScroller = (body) => ({
  root: body,
  get top() { return body.scrollTop; },
  set top(value) { body.scrollTop = value; },
  get max() { return Math.max(1, body.scrollHeight - body.clientHeight); },
  originTop: () => body.getBoundingClientRect().top - body.scrollTop,
});

// The document is itself the thing that moves, so its content starts exactly
// scrollTop above the viewport — measuring its element's rect the way the
// sheet does would count the scroll twice.
const pageScroller = () => {
  const el = document.scrollingElement ?? document.documentElement;
  return {
    root: document,
    get top() { return el.scrollTop; },
    // Global CSS sets scroll-behavior: smooth on html and body, which would
    // have the browser smoothly chase every frame this tween writes — two
    // animations running the same scroll, arriving late and sliding past
    // each other. 'instant' opts this one write out of that.
    set top(value) { window.scrollTo({ top: value, behavior: 'instant' }); },
    get max() { return Math.max(1, el.scrollHeight - el.clientHeight); },
    originTop: () => -el.scrollTop,
  };
};

let scroller = null;

// The container being tracked, and with it which scroller moves it
function findContainer() {
  const { sheetBody } = els();
  if (sheetActive && sheetBody) return sheetBody.querySelector(CONTAINER_SELECTOR);
  // A page's own container, ignoring both the sheet's leftover markup and
  // anything still behind a password gate — a hidden container has no layout
  // to measure, and the gate says when that changes
  return [...document.querySelectorAll(CONTAINER_SELECTOR)]
    .find((el) => !sheetBody?.contains(el) && !el.closest('[hidden]')) ?? null;
}

function labelFor(el) {
  const explicit = el.dataset.chapter?.trim();
  if (explicit) return explicit;
  return el.querySelector(LABEL_SELECTOR)?.textContent.trim() || el.id;
}

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
  // Dropped along with the chapters they belong to: a scroll landing between
  // hide() and the teardown below would otherwise still spy against them and
  // set a name the teardown is about to clear
  offsets = [];
  scroller = null;
  sizeObserver?.disconnect();
  sizeObserver = null;
  cancelAnimationFrame(measureFrame);
  // Landed somewhere with nothing to list, so the intent doesn't carry on
  // to whatever is opened next
  expandOnArrival = false;
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

// Each chapter's top, in the active scroller's own scroll coordinates —
// recomputed whenever chapters change or the window resizes, not on every
// scroll tick
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
  if (!scroller) return;
  const originTop = scroller.originTop();
  // Looked up by id rather than trusting the node captured at scan time. On a
  // direct load of a sheet page the body's content is replaced after that
  // first scan, which left every chapter holding a detached node: those
  // measure as a rect of zeros, so every offset collapsed to the top of the
  // page and jumping to a chapter scrolled nowhere.
  offsets = chapters.map(({ id, el }) => {
    const node = scroller.root.querySelector(`[id="${CSS.escape(id)}"]`) ?? el;
    return node.getBoundingClientRect().top - originTop;
  });
}

// Coalesced to one re-measure per frame: a gate reveal or a font swap can
// fire the observer several times in a row.
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

function onScroll() {
  if (!scroller || !offsets.length) return;
  const scrollTop = scroller.top;
  const maxScroll = scroller.max;

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
  const { chapter } = els();
  if (!chapter) return;

  const container = findContainer();
  const sections = container ? [...container.querySelectorAll(SECTION_SELECTOR)] : [];
  if (!sections.length) {
    hide();
    return;
  }

  const { sheetBody } = els();
  scroller = sheetBody?.contains(container) ? sheetScroller(sheetBody) : pageScroller();
  const found = sections.map((el) => ({
    id: el.id,
    label: labelFor(el),
    el,
  }));

  // Several things can ask for a rescan in quick succession — a gated case
  // study scans on arrival and again when the gate opens, and a sheet closing
  // over a page scans a frame later. Replaying the entrance for chapters we
  // are already tracking blanks the name and retypes it, and the second pass
  // re-spies against a layout that has not settled, so it can put up the
  // wrong chapter. Same chapters means refresh the measurements, nothing more.
  const sameSet = chapters.length === found.length && chapters.every((c, i) => c.id === found[i].id);
  if (sameSet) {
    chapters = found;
    watchSize(container);
    measure();
    onScroll();
    return;
  }

  chapters = found;
  watchSize(container);
  activeIndex = -1;
  renderRows();
  measure();

  // Reveal (and the name's first typewrite-in) waits until the page has
  // mostly finished arriving. Clearing .is-visible and forcing a reflow
  // first means the CSS entrance animation replays even if the pill was
  // already visible a moment ago (closing and reopening About quickly).
  clearTimeout(revealTimer);
  clearTimeout(stageTimer);
  // Cancels an exit still rotating out from the sheet or page we just left,
  // so its teardown can't land in the middle of this entrance
  clearTimeout(leaveTimer);
  // And any name still typing itself out for the chapters we just replaced
  clearTimeout(typeTimer);
  textReady = false;
  chapter.classList.remove('is-visible', 'is-leaving');
  void chapter.offsetWidth;
  measureWidth();
  revealTimer = setTimeout(() => {
    chapter.classList.add('is-visible');
    const { dock, sheetPanel } = els();
    // Mobile: the pill takes the bar's main row, so the page label steps
    // aside (the rule lives in Dock.astro, which owns that label)
    dock?.classList.add('dock--chapters');
    // Arrived from an expanded dock, or the dock is expanded right now: the
    // list unfurls alongside the pill's entrance. A direct load, or a link
    // tapped from the page body, leaves it shut.
    sheetPanel?.classList.toggle('is-open', expandOnArrival || Boolean(dock?.classList.contains('is-open')));
    expandOnArrival = false;
    // Offsets taken at scan time were read off a page still animating in (a
    // route transition holds the case studies' content offset until it
    // settles, and images finish loading around then too), so they're taken
    // again now that it's had those 600ms to land. Transform-invariant for
    // the sheet, whose content is measured against its own scroll origin,
    // so this costs the sheet nothing but a repeat.
    measure();
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
      // Last look before the name is committed to screen, for a page whose
      // arrival animation outran the measurement above
      measure();
      onScroll();
    }, TEXT_STAGE_MS);
  }, REVEAL_DELAY_MS);
}

// Driven by hand rather than left to scrollTo({ behavior: 'smooth' }).
// Jumping to a chapter also closes the panels, which resizes the dock, and
// sheet.js resizes the sheet under it to match — a scroller resized
// mid-animation is reason enough for the browser to abandon a smooth scroll
// it was running, so the jump simply never moved. Nothing cancels this one.
function tweenScroll(to) {
  cancelAnimationFrame(scrollFrame);
  const from = scroller.top;
  const distance = to - from;
  if (!distance) return;
  if (reduceMotion()) {
    scroller.top = to;
    return;
  }

  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / SCROLL_MS);
    // easeOutCubic: leaves quickly, settles gently, like the pill's own motion
    scroller.top = from + distance * (1 - (1 - t) ** 3);
    if (t < 1) scrollFrame = requestAnimationFrame(step);
  };
  scrollFrame = requestAnimationFrame(step);
}

function scrollToChapter(index) {
  if (!scroller || !chapters[index]) return;
  measure();
  const top = Math.max(0, offsets[index] - 16);

  closeDropdown();
  // Mobile: the list only exists because the dock's menu is open, so closing
  // that is what puts the list away — closing the list on its own here would
  // leave the menu behind, still showing the nav links
  document.dispatchEvent(new CustomEvent('dock:close-menu'));

  tweenScroll(top);
}

document.addEventListener('astro:page-load', () => {
  // A sheet page loaded directly renders with its sheet already open, and
  // nothing will announce that after the fact
  sheetActive = document.documentElement.classList.contains('sheet-open');
  scan();

  window.__chaptersAbort?.abort();
  const controller = new AbortController();
  window.__chaptersAbort = controller;
  const { signal } = controller;

  const { sheetBody, tocDesktop, dropdown, sheetPanel, chapter } = els();

  // Both scrollers are listened to for the life of the page: scroll events
  // don't bubble out of a sheet body, and which of the two is live changes
  // with every sheet that opens or closes. onScroll is a no-op until a scan
  // has found chapters, so the idle one costs nothing.
  window.addEventListener('scroll', onScroll, { signal, passive: true });
  sheetBody?.addEventListener('scroll', onScroll, { signal, passive: true });
  window.addEventListener('resize', () => {
    // Crossing the mobile breakpoint changes the pill's width to or from 0
    measureWidth();
    measure();
    onScroll();
  }, { signal });
  // Web fonts arriving after first paint reflow everything the offsets were
  // taken against, and retype the pill's own label at a different width —
  // dock.js re-places its indicator on the same signal. Both measurements
  // no-op if the page has moved on by then.
  document.fonts?.ready.then(() => {
    measureWidth();
    measure();
    onScroll();
  });

  document.addEventListener('sheet:content-changed', () => {
    sheetActive = true;
    scan();
  }, { signal });
  document.addEventListener('sheet:closed', () => {
    sheetActive = false;
    hide();
    // The page underneath can have chapters of its own now that sheets open
    // over the case studies too. sheet.js announces the close before it acts
    // on it, so the rescan waits a frame for the sheet to actually be gone.
    requestAnimationFrame(scan);
  }, { signal });
  // A gated case study only becomes readable once the password lands
  document.addEventListener('gate:unlocked', scan, { signal });
  // Routed here from a dock that was expanded — scan() reopens the list on
  // arrival rather than making you ask for it again
  document.addEventListener('dock:route-from-open', () => { expandOnArrival = true; }, { signal });
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
