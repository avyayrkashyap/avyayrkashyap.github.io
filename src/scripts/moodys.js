// Delays revealing the page content until the shared "moodys-cover" image
// has finished morphing into the banner. Astro flags an in-flight
// ClientRouter transition with [data-astro-transition] on <html> and
// removes it once the transition (including its animation) has fully
// finished, so that's the reliable signal to wait on — a direct/hard load
// never sets the attribute, so this is a no-op there.
document.addEventListener('astro:page-load', () => {
  const content = document.querySelector('.ms-content');
  if (!content) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const html = document.documentElement;
  if (!html.hasAttribute('data-astro-transition')) return;

  content.style.opacity = '0';
  content.style.transform = 'translateY(16px)';
  content.style.transition = 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)';

  let revealed = false;
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    observer.disconnect();
    content.style.opacity = '1';
    content.style.transform = 'none';
  };

  const observer = new MutationObserver(() => {
    if (!html.hasAttribute('data-astro-transition')) reveal();
  });
  observer.observe(html, { attributes: true, attributeFilter: ['data-astro-transition'] });

  // Safety net: never leave content hidden if the attribute is somehow
  // never removed.
  setTimeout(reveal, 1000);
});
