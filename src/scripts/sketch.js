// The first time a page is opened in a session, a few cursors drag out its
// layout as boxes, then the content fades in over them from the top down.
// The pages already drawn are kept in sessionStorage ('sketched').
//
// A fresh load: the inline script in Layout.astro sets html.sketching before
// first paint, which hides the page outright (global.css) until we've found
// the blocks to draw. A page change inside the site: we hide the incoming
// page's blocks right after the swap, before the browser shows it. Either
// way each block waits behind .sketch-wait until its box is drawn. A card
// morphing in from the page before (data-cover, Layout.astro) is left out:
// it lands visible while the cursors draw around it. Reduced motion skips it.

// The hero's pen colours, named after the hero lead's last line
const CURSORS = [
  { name: 'Thought.', color: 'var(--color-text-accent)' },
  { name: 'Care.', color: '#8B5CF6' },
  { name: 'Craft.', color: 'var(--color-error)' },
];
const MOVE = 200; // ms to glide to a box's corner
const DRAW = 240; // ms to drag it out
const BUDGET = 1800; // ms the drawing may take at most; busy pages draw faster
const STAGGER = 45; // ms between blocks fading in (less on busy pages)
const SMALL = 48; // px: a container this short is drawn as one box, not opened up
const EASE = 'cubic-bezier(.65, 0, .35, 1)';
const MEDIA = new Set(['IMG', 'VIDEO', 'CANVAS', 'SVG', 'PICTURE', 'FIGURE', 'IFRAME']);

const root = document.documentElement;
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let waiting = null; // the blocks hidden for this page, once found

const seen = () => {
  try { return JSON.parse(sessionStorage.getItem('sketched') || '[]'); } catch { return []; }
};
const markSeen = () => {
  try { sessionStorage.setItem('sketched', JSON.stringify([...new Set([...seen(), location.pathname])])); } catch { /* private mode: draw again next time */ }
};

// The boxes to draw: walking down from `el`, anything that reads as one
// thing (media, decoration, a picture box with a fixed ratio, an element
// with text of its own, an empty shape, or anything short) is a block; anything else is
// opened up to look at its children.
function blocksIn(el, out = []) {
  for (const c of el?.children ?? []) {
    if (c.matches('script, style, template, .sketch-layer')) continue;
    // A wrapper with no box of its own (the desktop sidebar's): look inside
    if (getComputedStyle(c).display === 'contents') {
      blocksIn(c, out);
      continue;
    }
    if (c.checkVisibility && !c.checkVisibility({ visibilityProperty: true })) continue;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (c.matches('[data-cover]') && c.style.viewTransitionName) continue; // morphing in on its own
    // Decoration (aria-hidden, like the chapter ruler) is one box, not dozens
    const block = MEDIA.has(c.tagName.toUpperCase()) || c.getAttribute('role') === 'img' || c.getAttribute('aria-hidden') === 'true'
      || !c.children.length
      || [...c.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      || getComputedStyle(c).aspectRatio !== 'auto'
      || r.height <= SMALL;
    if (block) out.push(c);
    else blocksIn(c, out);
  }
  return out;
}

// Hide this page's blocks and show the rest (section backgrounds and the
// like stay up, as the layout the boxes are drawn on)
function hide(withSidebar) {
  waiting = blocksIn(document.querySelector('.main'));
  if (withSidebar) waiting.push(...blocksIn(document.querySelector('.sidebar-bar')), ...blocksIn(document.querySelector('.sidebar-panel')));
  waiting.forEach((el) => el.classList.add('sketch-wait'));
  root.classList.add('sketching', 'sketch-ready');
}

// The page around the sidebar changes; the sidebar itself is only drawn on a
// fresh load
document.addEventListener('astro:after-swap', () => {
  if (!still() && !seen().includes(location.pathname)) hide(false);
});

document.addEventListener('astro:page-load', async () => {
  if (!root.classList.contains('sketching')) return;
  markSeen();
  const fresh = !waiting;
  if (fresh) {
    // On a reload ClientRouter scrolls back to where you were (it keeps the
    // spot in history.state), but html's scroll-behavior: smooth makes that
    // a glide that lands after we measure. Jump there now so the cursors
    // draw what's actually on screen.
    scrollTo({ top: history.state?.scrollY ?? scrollY, behavior: 'instant' });
    hide(true);
  }
  const all = waiting;
  waiting = null;

  // Blocks on screen get drawn; the rest just show
  const blocks = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    const onScreen = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    if (onScreen) blocks.push({ el, r });
    else el.classList.remove('sketch-wait');
  }
  blocks.sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);

  const layer = document.createElement('div');
  layer.className = 'sketch-layer';
  layer.setAttribute('aria-hidden', 'true');

  // Each cursor starts off a different edge
  const starts = [[-40, innerHeight * 0.3], [innerWidth * 0.6, innerHeight + 40], [innerWidth + 40, innerHeight * 0.15]];
  const cursors = CURSORS.map(({ name, color }, i) => {
    const node = document.createElement('div');
    node.className = 'sketch-cursor';
    node.style.setProperty('--c', color);
    node.innerHTML = `<svg viewBox="0 0 16 20" width="16" height="20"><path d="M1 1l13 10.5-6 .8 3.3 6.2-2.6 1.3L5.4 13.6 1 18z"/></svg><span>${name}</span>`;
    layer.append(node);
    const [x, y] = starts[i];
    const c = { node, color, x, y, start: [x, y], queue: [] };
    node.style.transform = `translate(${x}px, ${y}px)`;
    return c;
  });
  blocks.forEach((b, i) => cursors[i % cursors.length].queue.push(b));
  document.body.append(layer);

  // A long queue draws each box faster so the whole thing fits the budget
  const pace = Math.min(1, BUDGET / ((MOVE + DRAW) * Math.ceil(blocks.length / cursors.length) || 1));
  const stagger = STAGGER * Math.min(1, 12 / (blocks.length || 1));

  const move = (c, x, y, duration) => {
    const a = c.node.animate(
      [{ transform: `translate(${c.x}px, ${c.y}px)` }, { transform: `translate(${x}px, ${y}px)` }],
      { duration, easing: EASE, fill: 'forwards' },
    );
    c.x = x;
    c.y = y;
    return a.finished;
  };

  // Every cursor works through its boxes at the same time
  await Promise.all(cursors.map(async (c) => {
    for (const b of c.queue) {
      const { left, top, width, height } = b.r;
      await move(c, left, top, MOVE * pace);
      const box = document.createElement('div');
      box.className = 'sketch-box';
      box.style.cssText = `left:${left}px; top:${top}px; --c:${c.color}`;
      layer.append(box);
      b.box = box;
      await Promise.all([
        move(c, left + width, top + height, DRAW * pace),
        box.animate([{ width: '0px', height: '0px' }, { width: `${width}px`, height: `${height}px` }],
          { duration: DRAW * pace, easing: EASE, fill: 'forwards' }).finished,
      ]);
    }
  }));

  // Cursors leave the way they came while the content fills in from the top
  cursors.forEach((c) => {
    move(c, ...c.start, 600);
    c.node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: 'forwards' });
  });
  await Promise.all(blocks.map(({ el, box }, i) => {
    const delay = i * stagger;
    box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay, fill: 'forwards' });
    setTimeout(() => el.classList.remove('sketch-wait'), delay);
    return el.animate([{ opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0)' }],
      { duration: 450, delay, easing: 'ease-out', fill: 'backwards' }).finished;
  }));

  layer.remove();
  // Unless a page change has already hidden the next page's blocks
  if (!waiting) root.classList.remove('sketching', 'sketch-ready');
});
