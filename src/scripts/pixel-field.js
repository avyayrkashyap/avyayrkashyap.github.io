// Pixelated photo band at the top of the hero: the current scene is drawn into
// a low-res canvas scaled up with image-rendering: pixelated. The water sways
// gently and clicks on it send a ring outward. Scenes come from the
// .hero-dot buttons; switching shrinks the photo until the page shows around
// it, slides it off to the left as the next comes in from the right, then
// grows the new one back to fill the band. --scene-tint follows the theme.
const CELL = 7; // CSS px per pixel
const SPEED = 30; // ring speed, cells per second
const LIFE = 2.6; // seconds a ripple lasts
const WIDTH = 4; // ring thickness, cells
const SQUASH = 2.5; // how flat rings look at the bottom edge; flatter toward the horizon
const NEAR = 1.2; // perspective softness: 0 = true horizon (far rings vanish), higher = more uniform
const SLIDE = 1.2; // seconds a switch takes
const SHRINK = 0.8; // how small the photo gets while it slides
const GAP = 0.06; // space between the two photos mid-slide, as a share of the band width
const BLUR = 3; // blur (cells) at the smallest point of a switch, easing with the shrink
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

let cleanup;
document.addEventListener('astro:before-swap', () => cleanup?.());

document.addEventListener('astro:page-load', () => {
  cleanup?.();
  const card = document.querySelector('.hero-card');
  const canvas = card?.querySelector('.hero-pixels');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dots = [...card.querySelectorAll('.hero-dot')];
  const metaEl = document.getElementById('heroMeta');
  const spots = [...document.querySelectorAll('.hero-map-spot')];
  let w = 0, h = 0, o, lt, img, base, wet, hy = 0, tint, paper, raf = 0, visible = true;
  let ripples = [], scene = null, pending = null, slide = null;

  const scenes = dots.map((dot) => {
    const d = dot.dataset;
    return { dot, src: d.src, meta: d.meta, horizon: +d.horizon, top: +d.top, zoom: +d.zoom, hour: +d.hour };
  });

  // One Image per photo, loaded on first use
  const files = new Map();
  const ready = async (sc) => {
    if (!files.has(sc.src)) {
      const p = new Image();
      p.src = sc.src;
      files.set(sc.src, p.decode().then(() => p));
    }
    sc.photo = await files.get(sc.src);
    return sc;
  };

  const hex = (name) => {
    let v = getComputedStyle(card).getPropertyValue(name).trim().slice(1);
    if (v.length === 3) v = v.replace(/./g, '$&$&'); // minifier turns #FFFFFF into #fff
    const n = parseInt(v, 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  };
  // The tint is applied to every pixel later, so the page colour showing
  // around a sliding photo is stored pre-divided by it to come out exact
  const readColors = () => {
    tint = hex('--scene-tint').map((c) => c / 255);
    paper = hex('--color-bg-default').map((c, j) => clamp(c / (tint[j] || 1), 0, 255));
  };

  // Where a scene's photo lands in the band: a cover crop (pushed in by its
  // zoom), centred across, with its 'top' row at the band's top edge (as far
  // as the photo allows).
  // Returns [x, y, width, height] in cells.
  function cover(sc) {
    const p = sc.photo, k = Math.max(w / p.naturalWidth, h / p.naturalHeight) * sc.zoom;
    const pw = p.naturalWidth * k, ph = p.naturalHeight * k;
    return [(w - pw) / 2, clamp(-sc.top * ph, h - ph, 0), pw, ph];
  }

  // Resting on a scene: its pixels, plus the water map (below the waterline)
  function settle() {
    if (!scene?.photo || !w) return;
    o.clearRect(0, 0, w, h);
    const [x, y, pw, ph] = cover(scene);
    o.drawImage(scene.photo, x, y, pw, ph);
    base = o.getImageData(0, 0, w, h);
    hy = Math.ceil(y + scene.horizon * ph);
    wet = new Uint8Array(w * h).fill(1, clamp(hy, 0, h) * w);
    kick();
  }

  // Draw a scene as a band-sized frame scaled by s about the band's centre
  // and shifted dx cells, then blur it by b cells. It's cropped on its own
  // layer first, so the blur softens the frame's edges into the page too.
  function frame(sc, s, dx, b) {
    const fx = w / 2 - (w / 2) * s + dx, fy = h / 2 - (h / 2) * s;
    if (fx - b * 3 > w || fx + w * s + b * 3 < 0) return;
    const [x, y, pw, ph] = cover(sc);
    lt.clearRect(0, 0, w, h);
    lt.save();
    lt.beginPath();
    lt.rect(fx, fy, w * s, h * s);
    lt.clip();
    lt.drawImage(sc.photo, fx + x * s, fy + y * s, pw * s, ph * s);
    lt.restore();
    o.filter = b > 0.05 ? `blur(${b}px)` : 'none';
    o.drawImage(lt.canvas, 0, 0);
    o.filter = 'none';
  }

  // One frame of a switch: shrink (first 30%), slide left (middle 40%),
  // grow back (last 30%)
  function stepSlide(t) {
    const p = Math.min(1, (t - slide.t0) / SLIDE);
    const s = 1 - (1 - SHRINK) * ease(clamp(p / 0.3, 0, 1)) * ease(clamp((1 - p) / 0.3, 0, 1));
    const step = w * s + w * GAP;
    const dx = -step * ease(clamp((p - 0.3) / 0.4, 0, 1));
    o.fillStyle = `rgb(${paper.join(',')})`;
    o.fillRect(0, 0, w, h);
    // Blur tracks the shrink: none at full size, most while small
    const b = (BLUR * (1 - s)) / (1 - SHRINK);
    frame(slide.prev, s, dx, b);
    frame(slide.next, s, dx + step, b);
    base = o.getImageData(0, 0, w, h);
    if (p >= 1) {
      slide = null;
      settle();
    }
  }

  // Screen cell -> point on the water's surface, seen from just above it.
  // Things shrink with distance (1/e, e = depth below a horizon pushed up by
  // NEAR); units are scaled so one unit is one cell across at the bottom
  // edge and SQUASH cells deep there.
  const depthOf = (y) => y - hy + 0.5 + (h - hy) * NEAR;
  function toWater(x, y) {
    const e = depthOf(y), E = depthOf(h);
    return [((x - w / 2) * E) / e, (SQUASH * E * E) / e];
  }

  async function show(sc) {
    pending = sc;
    dots.forEach((d) => d.setAttribute('aria-pressed', String(d === sc.dot)));
    spots.forEach((m, i) => m.classList.toggle('is-on', scenes[i] === sc));
    metaEl.textContent = sc.meta;
    await ready(sc);
    if (pending !== sc) return; // a later click won
    if (!scene || !base || still || sc === scene) {
      scene = sc;
      slide = null;
      settle();
      return;
    }
    // The water stays calm while the photos slide
    slide = { prev: scene, next: sc, t0: performance.now() / 1000 };
    scene = sc;
    ripples = [];
    wet = new Uint8Array(w * h);
    kick();
  }

  function draw(now) {
    const t = now / 1000;
    if (slide) stepSlide(t);
    const d = img.data, src = base.data;
    const [tr, tg, tb] = tint;
    ripples = ripples.filter((r) => t - r.t < LIFE);

    for (let y = 0; y < h; y++) {
      const water = y >= hy;
      const depth = water ? (y - hy) / (h - hy || 1) : 0;
      // Idle swell: each water row sways sideways, more toward the viewer
      const sway = water ? Math.sin(y * 0.8 - t * 1.6) * (0.3 + depth * 1.2) + Math.sin(y * 0.23 + t * 0.9) * depth * 0.6 : 0;

      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const isWet = wet[i];
        let sx = isWet ? x + sway : x, sy = y, lift = 0;

        if (isWet && ripples.length) {
          const [X, Z] = toWater(x, y);
          const e = depthOf(y), E = depthOf(h);
          for (const rp of ripples) {
            const age = t - rp.t;
            const gx = X - rp.X, gz = Z - rp.Z;
            const dist = Math.hypot(gx, gz) || 1;
            const off = dist - age * SPEED;
            if (off > -WIDTH * 4 && off < WIDTH * 2) {
              const wv = Math.cos(off * 0.6) * Math.exp(-((off / WIDTH) ** 2)) * (1 - age / LIFE) ** 2;
              // Refract: push the sample outward along the ring, converted
              // back to screen cells (shrinks with distance)
              sx += (gx / dist) * (e / E) * wv * 2.5;
              sy -= (gz / dist) * ((e * e) / (SQUASH * E * E)) * wv * 2.5;
              lift += wv;
            }
          }
          sy = Math.min(h - 1, Math.max(hy, sy));
        }

        let j = Math.round(sy) * w + Math.min(w - 1, Math.max(0, Math.round(sx)));
        if (!wet[j]) j = i;
        const q = j * 4;
        let r = src[q] * tr, g = src[q + 1] * tg, b = src[q + 2] * tb;
        // Crests catch the light, troughs dip
        if (lift > 0) {
          const m = Math.min(lift, 1) * 0.3;
          r += (255 - r) * m; g += (255 - g) * m; b += (255 - b) * m;
        } else {
          r += lift * 25; g += lift * 25; b += lift * 25;
        }

        const p = i * 4;
        d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function loop(now) {
    // Book the next frame first, so one bad frame can't stall the loop
    raf = visible && !still ? requestAnimationFrame(loop) : 0;
    if (base) draw(now);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

  function resize() {
    w = Math.ceil(card.clientWidth / CELL);
    h = Math.ceil(card.clientHeight / CELL);
    canvas.width = w;
    canvas.height = h;
    // Exactly CELL px per pixel (overflowing the band slightly) so the grid
    // overlay lands on pixel edges
    canvas.style.width = `${w * CELL}px`;
    canvas.style.height = `${h * CELL}px`;
    img = ctx.createImageData(w, h);
    // A buffer to compose in, plus a layer to crop each sliding photo on
    [o, lt] = [0, 1].map(() => {
      const c = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true });
      c.imageSmoothingQuality = 'high';
      return c;
    });
    base = null;
    slide = null;
    settle();
  }

  function onPointer(e) {
    if (e.target.closest('button')) return;
    const b = card.getBoundingClientRect();
    const x = (e.clientX - b.left) / CELL, y = (e.clientY - b.top) / CELL;
    if (still || !wet?.[Math.floor(y) * w + Math.floor(x)]) return; // only the water ripples
    const [X, Z] = toWater(x, y);
    ripples.push({ X, Z, t: performance.now() / 1000 });
    kick();
  }

  const onDot = (e) => show(scenes.find((sc) => sc.dot === e.currentTarget));

  // Open on the photo shot closest to the visitor's time of day (wrapping
  // around midnight), then fetch the rest so switches start straight away
  const now = new Date();
  const hourNow = now.getHours() + now.getMinutes() / 60;
  const gap = (sc) => {
    const g = Math.abs(sc.hour - hourNow);
    return Math.min(g, 24 - g);
  };
  const first = scenes.reduce((a, b) => (gap(b) < gap(a) ? b : a));

  card.style.setProperty('--cell', `${CELL}px`);
  readColors();
  show(first).then(() => scenes.forEach(ready));
  const sizeObs = new ResizeObserver(resize);
  const themeObs = new MutationObserver(() => { readColors(); kick(); });
  const viewObs = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); });
  sizeObs.observe(card);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  viewObs.observe(card);
  card.addEventListener('pointerdown', onPointer);
  dots.forEach((d) => d.addEventListener('click', onDot));

  cleanup = () => {
    cancelAnimationFrame(raf);
    sizeObs.disconnect();
    themeObs.disconnect();
    viewObs.disconnect();
    card.removeEventListener('pointerdown', onPointer);
    dots.forEach((d) => d.removeEventListener('click', onDot));
    cleanup = null;
  };
});
