// Rebinds on every ClientRouter navigation, since the dock is swapped in with
// each page. astro:page-load also fires once on the initial hard load.
document.addEventListener('astro:page-load', () => {
  // ── Theme toggle ──
  const themeToggle = document.getElementById('dockThemeToggle');
  if (themeToggle) {
    const root = document.documentElement;
    themeToggle.setAttribute('aria-checked', String(root.getAttribute('data-theme') === 'dark'));
    themeToggle.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      const applyTheme = () => {
        root.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        themeToggle.setAttribute('aria-checked', String(next === 'dark'));
      };

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (typeof document.startViewTransition !== 'function' || reduceMotion) {
        applyTheme();
        return;
      }

      // Grows a circle from the toggle's own position (not the pointer's —
      // this also fires from a keyboard Enter/Space) out past the farthest
      // corner, revealing the new theme's snapshot through it. The default
      // cross-fade is suppressed only for the duration of this transition
      // (scoped by .theme-transition), so it doesn't touch Astro's own
      // page-navigation view transitions.
      const { left, top, width, height } = themeToggle.getBoundingClientRect();
      const x = left + width / 2;
      const y = top + height / 2;
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

      root.classList.add('theme-transition');
      const transition = document.startViewTransition(applyTheme);
      transition.ready.then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 500, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' },
        );
      });
      transition.finished.finally(() => root.classList.remove('theme-transition'));
    });
  }

  // Document-level listeners are replaced, not stacked, on each navigation
  window.__dockAbort?.abort();
  const controller = new AbortController();
  window.__dockAbort = controller;
  const { signal } = controller;

  // ── Nav indicator: rests under the active link, follows hover ──
  const nav = document.getElementById('dockNav');
  const indicator = document.getElementById('dockIndicator');
  if (nav && indicator) {
    const links = [...nav.querySelectorAll('.dock-link')];
    const moveTo = (link) => {
      const x = link.offsetLeft + (link.offsetWidth - indicator.offsetWidth) / 2;
      indicator.style.transform = `translateX(${x}px)`;
    };
    const rest = () => {
      const active = nav.querySelector('.dock-link.is-active');
      if (active) {
        indicator.style.opacity = '1';
        moveTo(active);
      } else {
        indicator.style.opacity = '0';
      }
    };
    rest();
    // Fonts and breakpoints can shift link positions after first paint
    document.fonts?.ready.then(rest);
    window.addEventListener('resize', rest, { signal });
    links.forEach((link) => link.addEventListener('mouseenter', () => {
      indicator.style.opacity = '1';
      moveTo(link);
    }));
    nav.addEventListener('mouseleave', rest);

    // Opening a sheet changes the "current page" without a navigation
    document.addEventListener('dock:set-active', (e) => {
      links.forEach((link) => {
        const on = link.getAttribute('href') === e.detail.href;
        link.classList.toggle('is-active', on);
        if (on) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
      nav.querySelector('.dock-current-fallback')?.toggleAttribute('hidden', links.some((l) => l.classList.contains('is-active')));
      rest();
    }, { signal });
  }

  // ── Mobile menu: expands the nav and the theme + socials sheet ──
  const dock = document.getElementById('dock');
  const menu = document.getElementById('dockMenu');
  if (dock && menu) {
    const setOpen = (open) => {
      dock.classList.toggle('is-open', open);
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };

    // Matches the CSS breakpoint the collapsed/expanding nav itself uses
    const isMobileDock = () => window.matchMedia('(max-width: 640px)').matches;

    menu.addEventListener('click', () => setOpen(!dock.classList.contains('is-open')));

    // On mobile, the closed bar shows only the current page's link (or the
    // "Menu" fallback). Tapping it should open the dock rather than route —
    // this listener sits on #dock, a closer ancestor than ClientRouter's own
    // click listener on document, so preventDefault() here reliably blocks
    // both the default navigation and Astro's soft-navigation. Once open,
    // a tap on a link is left alone and routes normally.
    dock.addEventListener('click', (e) => {
      if (!isMobileDock() || e.target.closest('.dock-menu')) return;
      if (!dock.classList.contains('is-open')) {
        if (e.target.closest('.dock-link')) e.preventDefault();
        setOpen(true);
      } else if (e.target.closest('.dock-link')) {
        setOpen(false);
      }
    }, { signal });

    document.addEventListener('click', (e) => {
      if (!dock.contains(e.target)) setOpen(false);
    }, { signal });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dock.classList.contains('is-open')) {
        setOpen(false);
        menu.focus();
      }
    }, { signal });
    document.addEventListener('dock:close-menu', () => setOpen(false), { signal });

    // Starting to scroll — the page itself, or the sheet's own scroll
    // container while one is open — collapses the expanded menu. Scroll
    // events don't bubble, so the sheet body needs its own listener.
    const collapseOnScroll = () => setOpen(false);
    window.addEventListener('scroll', collapseOnScroll, { signal, passive: true });
    document.getElementById('sheetBody')?.addEventListener('scroll', collapseOnScroll, { signal, passive: true });
  }
});
