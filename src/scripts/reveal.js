// Re-runs on every ClientRouter navigation (astro:page-load fires on the
// initial hard load too), so cards re-observe against the freshly swapped-in
// DOM instead of relying on script re-execution.
document.addEventListener('astro:page-load', () => {
  const items = document.querySelectorAll('.case-study-link');
  if (!items.length) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    items.forEach((item) => item.classList.add('cs-revealed'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('cs-revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });

  items.forEach((item) => observer.observe(item));
});
