// Pages as bottom sheets (About, Now).
//
// Clicking a link to a sheet page fetches it, copies its sheet content (plus
// any styles this page is missing) into the sheet shell every page carries, and
// pushes the page's URL onto history. The sheet slides up over the current page
// while the dock moves to the top. With a sheet already open, another sheet
// link swaps the content in place and pushes another entry, so Back steps
// between sheets before closing. Escape, the backdrop, the close button, or
// dragging the header down close the sheet outright.
//
// Loaded directly, a sheet page renders the homepage with the sheet already
// open. Its history entry is split into the homepage plus the sheet, so from
// then on every sheet behaves the same way.
//
// Listeners live at module scope and look elements up on demand, because the
// ClientRouter replaces <body> on every navigation.

// Must match the pages that render <Layout sheetOpen>
const SHEET_PATHS = new Set(['/about', '/now', '/resume']);
const DURATION_MS = 500;
const DOCK_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const DRAG_CLOSE_PX = 120;
// Dock top offset (matches .dock--top) plus the gap between dock and sheet
const DOCK_TOP_PX = 16;
const SHEET_GAP_PX = 18;
// A loose, slightly underdamped spring (damping ratio ~0.73): the dock trails
// the dragged sheet and overshoots a touch as it settles
const SPRING_STIFFNESS = 120;
const SPRING_DAMPING = 16;

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const normalizePath = (path) => path.replace(/\/$/, '') || '/';
const sheetPathOf = (url) => {
  const path = normalizePath(new URL(url, location.href).pathname);
  return SHEET_PATHS.has(path) ? path : null;
};

const els = () => ({
  sheet: document.getElementById('sheet'),
  panel: document.getElementById('sheetPanel'),
  body: document.getElementById('sheetBody'),
  dock: document.getElementById('dock'),
  main: document.querySelector('main.main'),
});

// Sheet content by path: { html, title, label, styles }. Kept across page
// swaps so Back/Forward onto a sheet entry can reopen it without a fetch.
const contents = new Map();
const pending = new Map();
// The page the sheet covers: restoring its URL, title and nav on close
let underlying = null;
// URL of the page actually rendered under the sheet, to tell whether a
// history entry's sheet can reopen over this DOM
let renderedUrl = location.href;
// Path of the sheet currently shown
let current = null;
let returnFocus = null;

const isOpen = () => els().sheet?.classList.contains('is-open') ?? false;

// ── Content ──

function fetchSheet(path) {
  if (contents.has(path)) return Promise.resolve(contents.get(path));
  if (!pending.has(path)) {
    pending.set(path, fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
        return res.text();
      })
      .then((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const body = doc.getElementById('sheetBody');
        if (!body) throw new Error(`No sheet content at ${path}`);
        const entry = {
          html: body.innerHTML,
          title: doc.title,
          label: doc.getElementById('sheetPanel')?.getAttribute('aria-label') ?? '',
          styles: [...doc.head.querySelectorAll('link[rel="stylesheet"], style')],
        };
        contents.set(path, entry);
        return entry;
      })
      .finally(() => pending.delete(path)));
  }
  return pending.get(path);
}

// A sheet page's scoped styles only ship with that page, so bring over any
// stylesheet this page doesn't already have. Resolves once linked sheets load.
function adoptStyles(styles) {
  const existingText = new Set([...document.head.querySelectorAll('style')].map((s) => s.textContent));
  const loads = [];

  styles.forEach((el) => {
    if (el.tagName === 'LINK') {
      const href = el.getAttribute('href');
      if (document.head.querySelector(`link[rel="stylesheet"][href="${CSS.escape(href)}"]`)) return;
      const copy = document.createElement('link');
      copy.rel = 'stylesheet';
      copy.href = href;
      loads.push(new Promise((resolve) => {
        copy.onload = copy.onerror = resolve;
      }));
      document.head.appendChild(copy);
    } else if (!existingText.has(el.textContent)) {
      const copy = document.createElement('style');
      [...el.attributes].forEach(({ name, value }) => copy.setAttribute(name, value));
      copy.textContent = el.textContent;
      document.head.appendChild(copy);
    }
  });

  return Promise.all(loads);
}

// innerHTML never runs scripts, and islands (like Now's orb) need Astro's
// inline island bootstrap to run to hydrate
function runScripts(root) {
  root.querySelectorAll('script').forEach((old) => {
    const script = document.createElement('script');
    [...old.attributes].forEach(({ name, value }) => script.setAttribute(name, value));
    script.textContent = old.textContent;
    old.replaceWith(script);
  });
}

async function inject(path) {
  const entry = await fetchSheet(path);
  await adoptStyles(entry.styles);
  const { body, panel } = els();
  body.innerHTML = entry.html;
  runScripts(body);
  body.scrollTop = 0;
  panel.setAttribute('aria-label', entry.label);
  document.title = entry.title;
  current = path;
  return entry;
}

// ── Dock ──

// Dock follow while dragging: a spring integrated per frame, applied through
// the individual `translate` property so it composes with the dock's centering
// transform
const spring = { x: 0, v: 0, target: 0, raf: 0, last: 0 };

function springTo(target) {
  const { dock } = els();
  if (!dock) return;
  spring.target = target;
  if (reduceMotion()) {
    spring.x = target;
    dock.style.translate = target ? `0 ${target}px` : '';
    return;
  }
  if (!spring.raf) {
    spring.last = performance.now();
    spring.raf = requestAnimationFrame(stepSpring);
  }
}

function stepSpring(now) {
  const { dock } = els();
  if (!dock) return stopSpring();
  // Clamp dt so a dropped frame can't blow up the integration
  const dt = Math.min(0.032, (now - spring.last) / 1000);
  spring.last = now;
  const accel = SPRING_STIFFNESS * (spring.target - spring.x) - SPRING_DAMPING * spring.v;
  spring.v += accel * dt;
  spring.x += spring.v * dt;

  if (Math.abs(spring.target - spring.x) < 0.5 && Math.abs(spring.v) < 5) {
    spring.x = spring.target;
    spring.v = 0;
    dock.style.translate = spring.x ? `0 ${spring.x}px` : '';
    spring.raf = 0;
    return;
  }
  dock.style.translate = `0 ${spring.x}px`;
  spring.raf = requestAnimationFrame(stepSpring);
}

function stopSpring() {
  cancelAnimationFrame(spring.raf);
  Object.assign(spring, { x: 0, v: 0, target: 0, raf: 0 });
  const { dock } = els();
  if (dock) dock.style.translate = '';
}

// FLIP between the bottom and top anchors so the move animates smoothly. The
// first measurement includes any spring offset, so a drag-to-close hands off
// from wherever the dock has trailed to.
function moveDock(toTop) {
  const { dock } = els();
  if (!dock || dock.classList.contains('dock--top') === toTop) return stopSpring();
  document.dispatchEvent(new CustomEvent('dock:close-menu'));
  const first = dock.getBoundingClientRect().top;
  stopSpring();
  dock.classList.toggle('dock--top', toTop);
  const last = dock.getBoundingClientRect().top;
  if (reduceMotion()) return;
  dock.animate(
    [{ translate: `0 ${first - last}px` }, { translate: '0 0' }],
    { duration: DURATION_MS, easing: DOCK_EASING },
  );
}

// Keep the sheet's top edge just below the dock, following its live height as
// the mobile menu expands or collapses
let dockObserver = null;

function syncSheetTop() {
  const { sheet, dock } = els();
  if (!sheet || !dock) return;
  sheet.style.setProperty('--sheet-top', `${DOCK_TOP_PX + dock.offsetHeight + SHEET_GAP_PX}px`);
}

function observeDock() {
  dockObserver?.disconnect();
  const { dock } = els();
  if (!dock) return;
  dockObserver = new ResizeObserver(syncSheetTop);
  dockObserver.observe(dock);
}

const setDockActive = (href) => {
  document.dispatchEvent(new CustomEvent('dock:set-active', { detail: { href } }));
};

// ── Open / swap / close ──

function applyOpen() {
  const { sheet, panel, main } = els();
  // Let the closed position paint first so the slide-up transition runs
  sheet.getBoundingClientRect();
  sheet.classList.add('is-open');
  panel.removeAttribute('aria-hidden');
  document.documentElement.classList.add('sheet-open');
  main?.setAttribute('inert', '');
  moveDock(true);
  setDockActive(current);
  panel.focus({ preventScroll: true });
}

function applyClose() {
  const { sheet, panel, main } = els();
  if (!sheet) return;
  sheet.classList.remove('is-open', 'is-dragging');
  panel.style.transform = '';
  sheet.querySelector('.sheet-backdrop').style.opacity = '';
  panel.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('sheet-open');
  main?.removeAttribute('inert');
  moveDock(false);
  if (underlying) {
    document.title = underlying.title;
    setDockActive(underlying.path);
  }
  if (returnFocus?.isConnected) {
    returnFocus.focus({ preventScroll: true });
  } else if (panel.contains(document.activeElement)) {
    // Nothing to return to: don't leave focus inside a hidden panel
    document.activeElement.blur();
  }
  returnFocus = null;
  current = null;
}

// Crossfade the panel's content when moving between sheets
async function swapTo(path) {
  const { body } = els();
  if (!reduceMotion()) {
    await body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }).finished;
  }
  await inject(path);
  setDockActive(path);
  if (!reduceMotion()) {
    body.getAnimations().forEach((a) => a.cancel());
    body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
  }
}

const sheetState = (path, depth) => ({
  ...history.state,
  sheet: path,
  sheetDepth: depth,
  underlying,
});

function withoutSheetState(state) {
  const { sheet, sheetDepth, underlying: _underlying, ...rest } = state ?? {};
  return rest;
}

async function openFromLink(link, path) {
  if (isOpen()) {
    if (path === current) return true;
    try {
      await fetchSheet(path);
    } catch {
      return false;
    }
    history.pushState(sheetState(path, (history.state?.sheetDepth ?? 1) + 1), '', path);
    await swapTo(path);
    return true;
  }

  if (!els().sheet) return false;
  try {
    await fetchSheet(path);
  } catch {
    return false;
  }
  underlying = { url: location.href, path: normalizePath(location.pathname), title: document.title };
  returnFocus = link;
  await inject(path);
  // Keep Astro's own state fields so its history index stays consistent
  history.pushState(sheetState(path, 1), '', path);
  applyOpen();
  return true;
}

function requestClose() {
  if (!isOpen()) return;
  const depth = history.state?.sheet ? history.state.sheetDepth : 0;
  if (depth > 0) {
    // popstate does the actual closing, so Back and close behave identically
    history.go(-depth);
    return;
  }
  history.replaceState(withoutSheetState(history.state), '', underlying.url);
  applyClose();
}

// ── Events ──

// On mobile the closed dock shows only the current page's link; tapping it
// should open the dock, not route or touch the sheet. Capture beats dock.js's
// bubble-phase listener on #dock regardless of registration order (capture
// always runs outside-in), so this has to be the one to yield.
function isClosedMobileDockTarget(target) {
  const dock = document.getElementById('dock');
  if (!dock || dock.classList.contains('is-open')) return false;
  if (!window.matchMedia('(max-width: 640px)').matches) return false;
  return dock.contains(target);
}

// Capture phase, so this runs before the ClientRouter's own link handling
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = e.target.closest?.('a[href]');
  if (!link || link.target === '_blank') return;
  if (isClosedMobileDockTarget(e.target)) return;

  const path = sheetPathOf(link.href);
  if (path) {
    e.preventDefault();
    e.stopPropagation();
    openFromLink(link, path).then((opened) => {
      if (!opened) location.href = path;
    });
    return;
  }

  // Linking back to the page under the sheet just closes the sheet
  if (isOpen() && underlying && new URL(link.href, location.href).href === underlying.url) {
    e.preventDefault();
    e.stopPropagation();
    requestClose();
  }
}, true);

// Warm the fetch as soon as intent shows, so the sheet opens without a wait
['pointerover', 'focusin', 'touchstart'].forEach((type) => {
  document.addEventListener(type, (e) => {
    const link = e.target.closest?.('a[href]');
    const path = link && sheetPathOf(link.href);
    if (path) fetchSheet(path).catch(() => {});
  }, { passive: true });
});

document.addEventListener('click', (e) => {
  if (!e.target.closest?.('[data-sheet-close]')) return;
  // With the mobile menu open, a tap outside just closes the menu (dock.js)
  if (els().dock?.classList.contains('is-open')) return;
  requestClose();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isOpen()) requestClose();
});

// Called from an inline popstate listener in Layout's <head>, which is bound
// before the ClientRouter's, so sheet-only history moves never swap the page
window.__sheetPopState = (e) => {
  const path = sheetPathOf(location.href);
  const state = e.state;

  // Onto a sheet entry that belongs over the page currently rendered
  if (path && state?.sheet === path && state.underlying?.url === renderedUrl && contents.has(path)) {
    e.stopImmediatePropagation();
    underlying = state.underlying;
    if (isOpen()) {
      if (path !== current) swapTo(path);
    } else {
      inject(path).then(applyOpen);
    }
    return;
  }

  // Back onto the page under the sheet
  if (isOpen() && underlying && location.href === underlying.url) {
    e.stopImmediatePropagation();
    applyClose();
  }
};

// Navigating elsewhere while a sheet is open: turn its entry back into the
// page underneath, so Back later lands somewhere that matches the DOM
document.addEventListener('astro:before-preparation', () => {
  // Only for link navigations: on Back/Forward the entry has already changed
  if (isOpen() && underlying && history.state?.sheet && sheetPathOf(location.href) === current) {
    history.replaceState(withoutSheetState(history.state), '', underlying.url);
  }
});

document.addEventListener('astro:page-load', () => {
  const { sheet } = els();
  current = null;
  underlying = null;
  renderedUrl = location.href;

  if (sheet?.classList.contains('is-open')) {
    // A sheet page, rendered with the homepage underneath
    const path = sheetPathOf(location.href);
    renderedUrl = new URL(sheet.dataset.underlyingUrl, location.href).href;
    underlying = { url: renderedUrl, path: normalizePath(sheet.dataset.underlyingUrl), title: sheet.dataset.underlyingTitle };
    current = path;
    // Cache a pristine copy (the live DOM has hydrated islands) so Back and
    // Forward can reopen this sheet without waiting on the network
    fetchSheet(path).catch(() => {});

    if (history.state?.sheet) {
      // Refreshed or restored sheet entry: it now sits over the homepage
      history.replaceState({ ...history.state, sheetDepth: 1, underlying }, '');
    } else {
      // Fresh load: split into the homepage entry plus the sheet entry, so
      // closing behaves exactly as if the sheet had been opened from home
      const sheetUrl = location.href;
      const sheetTitle = document.title;
      history.replaceState(withoutSheetState(history.state), '', renderedUrl);
      history.pushState(sheetState(path, 1), '', sheetUrl);
      document.title = sheetTitle;
    }
  }

  stopSpring();
  observeDock();
  initDrag();
});

// ── Drag to dismiss ──

function initDrag() {
  const handle = document.getElementById('sheetHandle');
  const { sheet, panel } = els();
  if (!handle || !sheet || !panel) return;
  const backdrop = sheet.querySelector('.sheet-backdrop');

  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let dragging = false;

  handle.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || !isOpen()) return;
    dragging = true;
    startY = lastY = e.clientY;
    lastT = e.timeStamp;
    velocity = 0;
    handle.setPointerCapture(e.pointerId);
    sheet.classList.add('is-dragging');
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = Math.max(0, e.clientY - startY);
    velocity = (e.clientY - lastY) / Math.max(1, e.timeStamp - lastT);
    lastY = e.clientY;
    lastT = e.timeStamp;
    panel.style.transform = `translateY(${dy}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 - dy / panel.offsetHeight));
    springTo(dy);
  });

  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('is-dragging');
    const dy = Math.max(0, e.clientY - startY);
    // Holding still before letting go isn't a flick, whatever the last move was
    if (e.timeStamp - lastT > 100) velocity = 0;
    if (dy > DRAG_CLOSE_PX || velocity > 0.5) {
      requestClose();
    } else {
      panel.style.transform = '';
      backdrop.style.opacity = '';
      springTo(0);
    }
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}
