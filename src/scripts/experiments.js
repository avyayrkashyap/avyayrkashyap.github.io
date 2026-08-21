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

// Screen recordings play on their own and loop, rather than waiting for a
// hover. They're started when they scroll into view and paused when they
// leave it: the viewer sees a clip already running whenever one is on screen,
// while a clip further down the page costs nothing until it gets there. They
// ship with preload="none", so play() is also what triggers the download.
//
// Under prefers-reduced-motion the clips stay on their posters and play on
// hover instead, so the content is still reachable without motion nobody
// asked for.
document.addEventListener('astro:page-load', () => {
  const clips = document.querySelectorAll('.exp-clip');
  if (!clips.length) return;

  // play() rejects if the clip is paused again before the file is ready,
  // which is expected here rather than an error worth surfacing.
  const play = (clip) => clip.play().catch(() => {});

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    clips.forEach((clip) => {
      const host = clip.closest('.exp-app, .exp-video');
      if (!host) return;

      host.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'touch') return;
        play(clip);
      });

      host.addEventListener('pointerleave', () => clip.pause());
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          play(entry.target);
        } else {
          entry.target.pause();
        }
      });
    },
    { threshold: 0.2 }
  );

  clips.forEach((clip) => observer.observe(clip));
});
