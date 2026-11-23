// Click-to-expand for case-study images and videos shown much smaller than
// they could be. One counts as "too small" when the viewer would show it at
// least 1.5x bigger than it appears on the page (capped by its own pixels and
// the window). That's re-checked whenever it resizes, which also covers media
// inside content that starts hidden (the Moody's password gate). Videos ship
// with preload="none", so they're checked once their size is known.
// The viewer is a native <dialog>: Esc closes it, and so does any click.

const GAIN = 1.5;
let dialog;
let observer;

const size = (el) => el.tagName === 'VIDEO'
  ? [el.videoWidth, el.videoHeight]
  : [el.naturalWidth, el.naturalHeight];

// What the media shows, for the button label: alt text, or a video's label
const describe = (el) => el.alt || el.dataset.label || '';

function viewerWidth(el) {
  const [w, h] = size(el);
  return Math.min(w, innerWidth * 0.92, innerHeight * 0.9 * (w / h));
}

function mark(el) {
  const shown = el.clientWidth;
  const small = size(el)[0] > 0 && shown > 0 && viewerWidth(el) > shown * GAIN;
  el.classList.toggle('zoomable', small);
  if (small) {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `Expand: ${describe(el)}`);
  } else {
    el.removeAttribute('tabindex');
    el.removeAttribute('role');
    // Videos get their own label back; images rely on alt
    if (el.dataset.label) el.setAttribute('aria-label', el.dataset.label);
    else el.removeAttribute('aria-label');
  }
}

function open(el) {
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'zoom-viewer';
    dialog.innerHTML = '<img alt="" hidden /><video muted loop playsinline hidden></video>';
    dialog.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.querySelector('video').pause());
    document.body.append(dialog);
  }
  const img = dialog.querySelector('img');
  const video = dialog.querySelector('video');
  const isVideo = el.tagName === 'VIDEO';
  img.hidden = isVideo;
  video.hidden = !isVideo;
  if (isVideo) {
    // Picks up where the small one is, so it reads as the same clip, larger
    video.src = el.currentSrc || el.src;
    video.setAttribute('aria-label', describe(el));
    video.currentTime = el.currentTime;
    video.play().catch(() => {});
  } else {
    img.src = el.currentSrc || el.src;
    img.alt = el.alt;
  }
  dialog.showModal();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('.zoomable');
  if (el) open(el);
});

document.addEventListener('keydown', (e) => {
  const el = e.target.closest?.('.zoomable');
  if (el && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    open(el);
  }
});

// Re-bound on every ClientRouter navigation, against the swapped-in page
document.addEventListener('astro:page-load', () => {
  observer?.disconnect();
  // The router swaps <body>, taking the old viewer with it
  dialog = undefined;
  observer = new ResizeObserver((entries) => entries.forEach((e) => mark(e.target)));

  document.querySelectorAll('.case-study img').forEach((img) => {
    // Skip links and decorative images (empty alt), like the app icons
    if (img.closest('a') || !img.alt) return;
    observer.observe(img);
    if (!img.complete) img.addEventListener('load', () => mark(img), { once: true });
  });

  document.querySelectorAll('.case-study video[aria-label]').forEach((video) => {
    if (video.closest('a')) return;
    video.dataset.label = video.getAttribute('aria-label');
    observer.observe(video);
    if (video.readyState >= 1) mark(video);
    else video.addEventListener('loadedmetadata', () => mark(video), { once: true });
  });
});
