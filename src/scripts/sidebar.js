// Re-run on every ClientRouter navigation (not just the first load) since
// this rebuilds the tick field and rebinds listeners against the swapped-in
// sidebar DOM. astro:page-load also fires once on the initial hard load, so
// this replaces the old run-once-immediately IIFE entirely.
document.addEventListener('astro:page-load', () => {
    // ── Dark mode toggle ────────────────────────────────────────────────────
    const themeToggle = document.getElementById('themeToggle');
    const themeChangeListeners = [];
    if (themeToggle) {
        themeToggle.setAttribute('aria-checked', document.documentElement.getAttribute('data-theme') === 'dark');
        themeToggle.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const next = isDark ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            themeToggle.setAttribute('aria-checked', String(!isDark));
            themeChangeListeners.forEach(fn => fn());
        });
    }

    // ── Mobile sidebar toggle ──────────────────────────────────────────────
    const toggleBtn = document.getElementById('sidebar-toggle');
    const overlay   = document.getElementById('sidebar-overlay');

    // Start closed on mobile
    if (window.innerWidth <= 768) {
        document.body.classList.add('sidebar-closed');
    }

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-closed');
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            document.body.classList.add('sidebar-closed');
        });
    }

    // Re-open sidebar automatically when resizing back to desktop
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            document.body.classList.remove('sidebar-closed');
        }
    });


    const sidebarNav = document.getElementById('sidebarNav');
    const tickField  = document.getElementById('tickField');
    const sidebar    = document.querySelector('.sidebar');
    const navLinks   = document.querySelectorAll('.nav-link');

    if (!tickField || !sidebar || !sidebarNav) return;

    const hasSubnav = sidebarNav.dataset.subnav === 'true';

    // NAV_Y: Y positions of each main nav label within the tick field
    // On case study pages, About/Experiments/Now are pushed down to make room for sub-nav
    const NAV_Y      = hasSubnav ? [8, 252, 292, 332] : [8, 48, 88, 128];
    const TICK_COUNT = hasSubnav ? 44 : 18;
    const TICK_STEP  = 8;
    const MIN_W      = 16;
    const MAX_W      = 32;
    const SIGMA      = 24;
    const NAV_TOP    = 114;

    // Build ticks
    const ticks = [];
    for (let i = 0; i < TICK_COUNT; i++) {
        const el = document.createElement('div');
        el.className = 'tick';
        tickField.appendChild(el);
        ticks.push(el);
    }

    // Position main nav labels vertically
    navLinks.forEach((link, i) => {
        link.style.top = (NAV_Y[i] - 8) + 'px';
    });

    function gaussian(dist) {
        return Math.exp(-0.5 * (dist / SIGMA) ** 2);
    }

    function setWidths(targetY) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const idle   = isDark ? [90, 100, 120]  : [200, 220, 250];
        const active = isDark ? [92, 151, 255] : [26, 108, 240];
        ticks.forEach((tick, i) => {
            const cy = i * TICK_STEP + 1;
            const g  = gaussian(Math.abs(cy - targetY));
            const w  = MIN_W + (MAX_W - MIN_W) * g;
            tick.style.width = w + 'px';
            const r  = Math.round(idle[0] + (active[0] - idle[0]) * g);
            const gr = Math.round(idle[1] + (active[1] - idle[1]) * g);
            const b  = Math.round(idle[2] + (active[2] - idle[2]) * g);
            tick.style.backgroundColor = `rgb(${r}, ${gr}, ${b})`;
        });
    }

    // Derive initial active index from DOM (set by Astro server-side)
    let activeIdx = 0;
    navLinks.forEach((link, i) => {
        if (link.classList.contains('active')) activeIdx = i;
    });

    // activeTickY: the Y the ticks rest at when not hovering.
    // Starts at the active main-nav item; updated by sub-nav scroll.
    let activeTickY = NAV_Y[activeIdx];
    let hovering = false;

    setWidths(activeTickY);
    themeChangeListeners.push(() => setWidths(activeTickY));

    navLinks.forEach((link, i) => {
        link.addEventListener('mouseenter', () => { activeIdx = i; });
    });

    sidebar.addEventListener('mousemove', (e) => {
        hovering = true;
        const cursorY = e.clientY - sidebar.getBoundingClientRect().top - NAV_TOP;
        setWidths(cursorY);
    });

    sidebar.addEventListener('mouseleave', () => {
        hovering = false;
        setWidths(activeTickY);
    });

    // ── Sub-nav: highlight active section on scroll ──
    if (!hasSubnav) return;
    const subLinks = document.querySelectorAll('.cs-subnav-link');

    const sections = Array.from(subLinks).map(link => {
        const id = link.getAttribute('href').replace('#', '');
        return { link, el: document.getElementById(id) };
    }).filter(s => s.el);

    // Measure each sub-nav link's Y center relative to the tick field top.
    // Done after layout settles (requestAnimationFrame).
    let subTickYs = [];
    requestAnimationFrame(() => {
        const tfTop = tickField.getBoundingClientRect().top;
        subLinks.forEach(link => {
            const r = link.getBoundingClientRect();
            subTickYs.push(r.top + r.height / 2 - tfTop);
        });
        // Set initial resting position to first sub-nav item
        if (subTickYs.length) {
            activeTickY = subTickYs[0];
            if (!hovering) setWidths(activeTickY);
        }
    });

    function onScroll() {
        const scrollY = window.scrollY + window.innerHeight * 0.25;
        let activeI = 0;
        for (let i = 0; i < sections.length; i++) {
            if (sections[i].el.offsetTop <= scrollY) activeI = i;
        }
        subLinks.forEach(l => l.classList.remove('active'));
        sections[activeI].link.classList.add('active');

        // Update resting tick position to match active sub-nav link
        if (subTickYs[activeI] !== undefined) {
            activeTickY = subTickYs[activeI];
            if (!hovering) setWidths(activeTickY);
        }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
});
