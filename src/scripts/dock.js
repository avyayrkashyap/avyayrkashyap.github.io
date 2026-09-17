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
      root.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      themeToggle.setAttribute('aria-checked', String(next === 'dark'));
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

    menu.addEventListener('click', () => setOpen(!dock.classList.contains('is-open')));
    document.addEventListener('click', (e) => {
      if (!dock.contains(e.target)) setOpen(false);
    }, { signal });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dock.classList.contains('is-open')) {
        setOpen(false);
        menu.focus();
      }
    }, { signal });
    dock.querySelectorAll('.dock-link').forEach((link) => {
      link.addEventListener('click', () => setOpen(false));
    });
    document.addEventListener('dock:close-menu', () => setOpen(false), { signal });
  }
});
