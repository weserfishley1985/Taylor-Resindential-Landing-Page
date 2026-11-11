/* Reveal each text group and hero card once, preserving their final positions. */
(() => {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (preference.matches || !('IntersectionObserver' in window)) return;

  const groups = [
    '.hero .hero-copy > h1, .hero .hero-copy > p, .hero .hero-actions',
    '.hero .hero-feature-card',
    '.roofing-backdrop .coldformed-content > h2',
    '.roofing-backdrop .cf-benefit',
    '.roofing-backdrop .coldformed-explore',
    '.roofing-backdrop .el-heading .el-eyebrow, .roofing-backdrop .el-heading h2, .roofing-backdrop .el-intro',
    '.roofing-backdrop .el-benefits > h3',
    '.roofing-backdrop .el-benefit-list > li',
    '.roofing-backdrop .el-benefits > .el-actions',
    '.feature-row .feature-copy > h3, .feature-row .feature-copy > p, .feature-row .feature-actions',
    '.news .news-grid > div > .text-link, .news .news-grid h2, .news .news-grid p, .news .news-actions',
    '.news .metal-roof-benefits > li',
    '.projects .section-title, .projects .sub',
    '.projects .project > span',
    '.projects .gallery-link',
    '.inspiration h2, .inspiration p, .inspiration .inspiration-actions',
    '.footer .footer-newsletter .eyebrow, .footer .footer-newsletter h2, .footer .footer-newsletter > div > p:not(.eyebrow)'
  ];
  const pending = new Set();
  const finish = element => {
    element.removeAttribute('data-text-reveal');
    element.style.removeProperty('--text-reveal-delay');
    pending.delete(element);
  };
  const reveal = element => {
    observer.unobserve(element);
    element.dataset.textReveal = 'entering';
  };
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) reveal(entry.target);
    });
  }, { threshold: 0, rootMargin: '0px 0px 32px 0px' });

  // Read all positions before writing styles to avoid repeated forced layout at startup.
  const targets = [];
  groups.forEach(selector => {
    document.querySelectorAll(selector).forEach((element, index) => {
      // Preserve the normal reading state when opening a deep link or restoring scroll.
      if (element.getBoundingClientRect().bottom <= 0) return;
      const delay = element.matches('.hero-feature-card') ? 140 + index * 160 : Math.min(index * 70, 210);
      targets.push({ element, delay });
    });
  });
  targets.forEach(({ element, delay }) => {
    pending.add(element);
    element.style.setProperty('--text-reveal-delay', `${delay}ms`);
    element.dataset.textReveal = 'pending';
    element.addEventListener('animationend', event => {
      if (event.target === element && ['taylor-text-entrance', 'taylor-hero-card-entrance'].includes(event.animationName)) finish(element);
    });
    observer.observe(element);
  });

  // Keyboard navigation never has to wait for an entrance animation.
  document.addEventListener('focusin', event => {
    const element = event.target.closest('[data-text-reveal]');
    if (element) { observer.unobserve(element); finish(element); }
  });
  preference.addEventListener('change', event => {
    if (!event.matches) return;
    observer.disconnect();
    [...pending].forEach(finish);
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    observer.disconnect();
    [...pending].forEach(finish);
  });
})();
