// Re-run on every ClientRouter navigation so the typewriter/reveal replays
// when the hero is swapped back in. astro:page-load also covers the initial
// hard load, replacing the old run-once-immediately IIFE.
document.addEventListener('astro:page-load', () => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const revealItems = [
    ...document.querySelectorAll('.hero-logos > *'),
    ...document.querySelectorAll('.hero-links > *'),
  ].filter((item) => getComputedStyle(item).display !== 'none');

  function revealOneByOne() {
    revealItems.forEach((item, i) => {
      setTimeout(() => {
        item.style.opacity = '1';
        item.style.transform = 'none';
      }, i * 70);
    });
  }

  if (prefersReducedMotion) return;

  // Hide logos/links up front; revealed one by one once the title finishes typing
  revealItems.forEach((item) => {
    item.style.opacity = '0';
    item.style.transform = 'translateY(8px)';
    item.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
  });

  const el = document.getElementById('heroTitle');
  if (!el) {
    revealOneByOne();
    return;
  }

  const fullText = el.textContent.trim();

  function start() {
    // Lock the box to its final (fully-typed) height so wrapping never shifts layout mid-type
    el.style.minHeight = el.getBoundingClientRect().height + 'px';
    el.setAttribute('aria-label', fullText);

    const textSpan = document.createElement('span');
    textSpan.setAttribute('aria-hidden', 'true');

    const cursor = document.createElement('span');
    cursor.className = 'hero-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.textContent = '|';

    el.textContent = '';
    el.appendChild(textSpan);
    el.appendChild(cursor);

    const SPEED_MS = 20;
    let i = 0;

    function tick() {
      textSpan.textContent = fullText.slice(0, i);
      if (i <= fullText.length) {
        i++;
        setTimeout(tick, SPEED_MS);
      } else {
        cursor.classList.add('hero-cursor--done');
        revealOneByOne();
      }
    }
    tick();
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(start);
  } else {
    start();
  }
});
