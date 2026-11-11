(() => {
  const gallery = document.querySelector('#buildings .coldformed-gallery');
  if (!gallery) return;

  const photos = [...gallery.querySelectorAll('.coldformed-gallery-photo')];
  const dots = [...gallery.querySelectorAll('.coldformed-gallery-dots button')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;
  let timer;
  const show = index => {
    current = (index + photos.length) % photos.length;
    photos.forEach((photo, i) => {
      const position = i === current ? 'center' : i === (current + photos.length - 1) % photos.length ? 'left' : 'right';
      photo.dataset.position = position;
      photo.removeAttribute('aria-hidden');
    });
    dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === current)));
  };

  const stop = () => {
    clearInterval(timer);
    timer = undefined;
  };

  const start = () => {
    stop();
    if (!reducedMotion.matches && !document.hidden && !gallery.matches(':hover') && !gallery.contains(document.activeElement)) {
      timer = setInterval(() => show(current + 1), 3800);
    }
  };

  gallery.querySelector('.coldformed-gallery-prev').addEventListener('click', () => {
    stop();
    show(current - 1);
    start();
  });
  gallery.querySelector('.coldformed-gallery-next').addEventListener('click', () => {
    stop();
    show(current + 1);
    start();
  });
  dots.forEach((dot, i) => dot.addEventListener('click', () => {
    stop();
    show(i);
    start();
  }));
  photos.forEach((photo, i) => photo.addEventListener('click', () => {
    stop();
    show(i);
    start();
  }));
  gallery.addEventListener('mouseenter', stop);
  gallery.addEventListener('mouseleave', start);
  gallery.addEventListener('focusin', stop);
  gallery.addEventListener('focusout', event => {
    if (!gallery.contains(event.relatedTarget)) start();
  });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  reducedMotion.addEventListener('change', start);

  show(0);
  start();
})();
