// Homepage intro: a few cursors drag out the page's layout as boxes, then the
// content fades in over them from the top down. Hard loads only: the inline
// script in index.astro sets html.sketching before first paint (and skips it
// for reduced motion or an in-site navigation back home).
const BLOCKS = [
  '.sidebar-current', '.sidebar-nav', '.sidebar-foot > *', '.sidebar-pager',
  '.hero-hello', '.hero-card', '.hero-title', '.hero-lead',
  '.work-label', '.work-cover', '.work-title', '.work-desc', '.work-tags', '.work-view',
].join(',');

// The hero's pen colours, named after the hero lead's last line
const CURSORS = [
  { name: 'Thought.', color: 'var(--color-text-accent)' },
  { name: 'Care.', color: '#8B5CF6' },
  { name: 'Craft.', color: 'var(--color-error)' },
];
const MOVE = 200; // ms to glide to a box's corner
const DRAW = 240; // ms to drag it out
const STAGGER = 45; // ms between blocks fading in
const EASE = 'cubic-bezier(.65, 0, .35, 1)';

document.addEventListener('astro:page-load', async () => {
  const root = document.documentElement;
  if (!root.classList.contains('sketching')) return;
  window.__sketched = true;

  // On a reload ClientRouter scrolls back to where you were (it keeps the
  // spot in history.state), but html's scroll-behavior: smooth makes that a
  // glide that lands after we measure. Jump there now so the cursors draw
  // what's actually on screen.
  scrollTo({ top: history.state?.scrollY ?? scrollY, behavior: 'instant' });

  // Blocks on screen get drawn; the rest just show
  const blocks = [];
  for (const el of document.querySelectorAll(BLOCKS)) {
    const r = el.getBoundingClientRect();
    const onScreen = r.width && r.height && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    if (onScreen) blocks.push({ el, r });
    else el.classList.add('sketched');
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
      await move(c, left, top, MOVE);
      const box = document.createElement('div');
      box.className = 'sketch-box';
      box.style.cssText = `left:${left}px; top:${top}px; --c:${c.color}`;
      layer.append(box);
      b.box = box;
      await Promise.all([
        move(c, left + width, top + height, DRAW),
        box.animate([{ width: '0px', height: '0px' }, { width: `${width}px`, height: `${height}px` }],
          { duration: DRAW, easing: EASE, fill: 'forwards' }).finished,
      ]);
    }
  }));

  // Cursors leave the way they came while the content fills in from the top
  cursors.forEach((c) => {
    move(c, ...c.start, 600);
    c.node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: 'forwards' });
  });
  await Promise.all(blocks.map(({ el, box }, i) => {
    const delay = i * STAGGER;
    box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay, fill: 'forwards' });
    setTimeout(() => el.classList.add('sketched'), delay);
    return el.animate([{ opacity: 0, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0)' }],
      { duration: 450, delay, easing: 'ease-out', fill: 'backwards' }).finished;
  }));

  layer.remove();
  root.classList.remove('sketching');
  document.querySelectorAll('.sketched').forEach((el) => el.classList.remove('sketched'));
});
