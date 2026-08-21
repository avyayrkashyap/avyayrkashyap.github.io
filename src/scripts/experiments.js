// Entrance for the Experiments page: the sandbox line types itself in, then
// the sections below fade up one after another. Bound to astro:page-load so
// it replays on every ClientRouter navigation, matching hero.js.
document.addEventListener('astro:page-load', () => {
  const title = document.getElementById('expTitle');
  if (!title) return;

  const revealItems = [...document.querySelectorAll('.exp-reveal')];
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function revealOneByOne() {
    revealItems.forEach((item, i) => {
      setTimeout(() => {
        item.style.opacity = '1';
        item.style.transform = 'none';
      }, i * 90);
    });
  }

  if (prefersReducedMotion) return;

  revealItems.forEach((item) => {
    item.style.opacity = '0';
    item.style.transform = 'translateY(10px)';
    item.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
  });

  const fullText = title.textContent.trim();

  function start() {
    // Lock the final height first so wrapping never nudges the page mid-type
    title.style.minHeight = title.getBoundingClientRect().height + 'px';
    title.setAttribute('aria-label', fullText);

    const textSpan = document.createElement('span');
    textSpan.setAttribute('aria-hidden', 'true');
    title.textContent = '';
    title.appendChild(textSpan);
    title.classList.add('is-typing');

    const SPEED_MS = 38;
    let i = 0;

    function tick() {
      textSpan.textContent = fullText.slice(0, i);
      if (i <= fullText.length) {
        i++;
        setTimeout(tick, SPEED_MS);
      } else {
        title.classList.remove('is-typing');
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

// Screen recordings play only while whatever holds them is hovered, whether
// that's an app card or a notification figure. They ship with preload="none",
// so the file isn't fetched at all until the first hover, and pausing on the
// way out keeps an off-screen clip from decoding in the background. Touch
// devices never fire this and just keep the poster.
document.addEventListener('astro:page-load', () => {
  document.querySelectorAll('.exp-clip').forEach((clip) => {
    const card = clip.closest('.exp-app, .exp-video');
    if (!card) return;

    card.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      // play() rejects if the pointer leaves before the file is ready; that's
      // expected here rather than an error worth surfacing.
      clip.play().catch(() => {});
    });

    card.addEventListener('pointerleave', () => {
      clip.pause();
    });
  });
});
