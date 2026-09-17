// Re-run on every ClientRouter navigation so the typewriter restarts when the
// hero is swapped back in. astro:page-load also covers the initial hard load.
let cycleTimer;

// Stop the loop before the page is swapped out, or it keeps ticking against
// a detached node
document.addEventListener('astro:before-swap', () => clearTimeout(cycleTimer));

document.addEventListener('astro:page-load', () => {
  clearTimeout(cycleTimer);

  const wordEl = document.getElementById('heroWord');
  const caret = document.getElementById('heroCaret');
  const lead = document.getElementById('heroLead');
  if (!wordEl || !caret) return;

  const WORDS = ['designer.', 'builder.', 'tinkerer.', 'human.'];

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // No motion: show the whole line at once instead of cycling
    wordEl.textContent = WORDS.join(' ');
    return;
  }

  const TYPE_MS = 70;
  const DELETE_MS = 40;
  const HOLD_MS = 1600;
  const GAP_MS = 250;

  if (lead) {
    lead.style.opacity = '0';
    lead.style.transform = 'translateY(6px)';
    lead.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
  }

  let leadShown = false;
  function revealLead() {
    if (leadShown || !lead) return;
    leadShown = true;
    lead.style.opacity = '';
    lead.style.transform = 'none';
  }

  let wordIdx = 0;
  let charIdx = 0;
  let deleting = false;

  function tick() {
    const word = WORDS[wordIdx];
    wordEl.textContent = word.slice(0, charIdx);

    if (!deleting && charIdx < word.length) {
      caret.classList.add('is-typing');
      charIdx++;
      cycleTimer = setTimeout(tick, TYPE_MS);
    } else if (!deleting) {
      // Word fully typed: rest on it with a blinking caret
      caret.classList.remove('is-typing');
      revealLead();
      deleting = true;
      cycleTimer = setTimeout(tick, HOLD_MS);
    } else if (charIdx > 0) {
      caret.classList.add('is-typing');
      charIdx--;
      cycleTimer = setTimeout(tick, DELETE_MS);
    } else {
      deleting = false;
      wordIdx = (wordIdx + 1) % WORDS.length;
      cycleTimer = setTimeout(tick, GAP_MS);
    }
  }

  function start() {
    wordEl.textContent = '';
    caret.classList.add('is-on');
    tick();
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(start);
  } else {
    start();
  }
});
