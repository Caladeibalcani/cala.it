/* Cala dei Balcani — Main JavaScript */

// ── Hero video: start immediately, skip only on detected slow connections ──
// (guarded by tagName so this can never crash again if the hero markup changes)
(function () {
  var v = document.querySelector('.hero__video-iframe');
  if (!v || v.tagName !== 'VIDEO') return;
  var slowConnection = navigator.connection && (navigator.connection.saveData ||
    ['slow-2g', '2g'].includes(navigator.connection.effectiveType));
  if (!slowConnection) {
    v.setAttribute('preload', 'auto');
    v.load();
    var playPromise = v.play();
    if (playPromise && playPromise.catch) playPromise.catch(function () {});
  }
})();

// ── Navigation ──
const nav = document.querySelector('.nav');
const navToggle = document.querySelector('.nav__toggle');

if (nav) {
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 50);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

const navRows = document.querySelectorAll('.nav__row');

if (navToggle && navRows.length) {
  navToggle.addEventListener('click', () => {
    let anyOpen = false;
    navRows.forEach(row => {
      row.classList.toggle('open');
      if (row.classList.contains('open')) anyOpen = true;
    });
    navToggle.setAttribute('aria-expanded', String(anyOpen));
  });
  navRows.forEach(row => {
    row.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navRows.forEach(r => r.classList.remove('open'));
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  });
}

// ── Scroll animations ──
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.fade-up, .fade-left, .fade-right, .scale-in').forEach(el => observer.observe(el));

// ── Stat counter animation ──
(function () {
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function animateCount(el, target, duration) {
    const start = performance.now();
    const suffix = el.dataset.suffix || '';
    (function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      const val = Math.round(target * easeOut(t));
      el.textContent = val.toLocaleString('it-IT') + suffix;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = el.dataset.original;
    })(start);
  }

  const statObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      statObserver.unobserve(e.target);
      const numEl = e.target.querySelector('.stat__number');
      if (!numEl) return;
      const raw = numEl.textContent.trim();
      const numeric = parseFloat(raw.replace(/[^0-9.]/g, ''));
      if (!numeric || isNaN(numeric)) return;
      numEl.dataset.original = raw;
      numEl.dataset.suffix = raw.replace(/[0-9.,\s]/g, '');
      e.target.classList.add('counting');
      animateCount(numEl, numeric, 1400);
    });
  }, { threshold: 0.35 });

  document.querySelectorAll('.stat').forEach(el => statObserver.observe(el));
})();

// ── FAQ accordion ──
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item   = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
    if (!isOpen) item.classList.add('open');
  });
});

// ── Smooth scroll for # anchors ──
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
});

// Active language link is set statically in each page's HTML — no JS override needed.

// ── Slideshow ──
function initSlideshow(el) {
  const track = el.querySelector('.slideshow__track');
  const slides = el.querySelectorAll('.slideshow__slide');
  const dots = el.querySelectorAll('.slideshow__dot');
  const total = slides.length;
  if (total < 2) return;
  let cur = 0, timer, startX = 0;

  function goTo(n) {
    cur = (n + total) % total;
    track.style.transform = `translateX(-${cur * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === cur));
  }
  function next() { goTo(cur + 1); }
  function prev() { goTo(cur - 1); }
  function startAuto() { timer = setInterval(next, 4500); }
  function resetAuto() { clearInterval(timer); startAuto(); }

  el.querySelector('.slideshow__next')?.addEventListener('click', () => { next(); resetAuto(); });
  el.querySelector('.slideshow__prev')?.addEventListener('click', () => { prev(); resetAuto(); });
  dots.forEach((d, i) => d.addEventListener('click', () => { goTo(i); resetAuto(); }));

  // Touch swipe
  el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); resetAuto(); }
  }, { passive: true });

  goTo(0);
  startAuto();
}
document.querySelectorAll('.slideshow').forEach(initSlideshow);

// ── Contact forms (Netlify Forms AJAX) ──
const SUCCESS_MSG = {
  it: 'Grazie per il messaggio. Vi risponderemo entro 24 ore.',
  en: 'Thank you for your message. We will get back to you within 24 hours.',
  fr: 'Merci pour votre message. Nous vous répondrons dans les 24 heures.',
  es: 'Gracias por su mensaje. Le responderemos en menos de 24 horas.',
  de: 'Vielen Dank für Ihre Nachricht. Wir melden uns innerhalb von 24 Stunden.',
};
const pageLang = (document.documentElement.lang || 'it').slice(0, 2);
const successText = SUCCESS_MSG[pageLang] || SUCCESS_MSG.it;

// Netlify's build post-processing strips data-netlify="true" from served HTML
// (replaced by a hidden form-name field for no-JS fallback), so match on name
// instead — every real form here has one; the area-privata placeholder form does not.
document.querySelectorAll('form[name]').forEach(form => {
  form.addEventListener('submit', e => {
    e.preventDefault();
    const required = form.querySelectorAll('[required]');
    let valid = true;
    required.forEach(el => {
      const filled = el.type === 'checkbox' ? el.checked : el.value.trim();
      el.style.borderColor = filled ? '' : 'red';
      if (!filled) valid = false;
    });
    if (!valid) return;

    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(form)).toString(),
    })
      .then(() => {
        form.innerHTML = `<p style="color:var(--gold);font-family:var(--font-italic);font-style:italic;font-size:1.2rem;text-align:center;padding:40px 0">${successText}</p>`;
      })
      .catch(() => {
        if (btn) btn.disabled = false;
        alert(successText);
      });
  });
});

// ── YouTube lazy facade ──
document.querySelectorAll('.yt-facade').forEach(function(facade) {
  facade.addEventListener('click', function() {
    var ytid = facade.dataset.ytid;
    var title = facade.dataset.title || 'YouTube video';
    var iframe = document.createElement('iframe');
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + ytid + '?autoplay=1&rel=0';
    iframe.title = title;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none';
    facade.innerHTML = '';
    facade.style.cursor = 'default';
    facade.appendChild(iframe);
  });
});

// ── Floating Contact Widget ──
(function () {
  // Inject toggle pill styles inline so they always match the JS version,
  // regardless of browser CSS cache state.
  const fcwStyle = document.createElement('style');
  fcwStyle.textContent = [
    '.fcw__toggle{width:auto!important;height:46px!important;border-radius:24px!important;',
    'padding:0 18px 0 14px!important;display:flex!important;align-items:center!important;',
    'gap:8px!important;overflow:visible!important;}',
    '.fcw__toggle-label{color:#fff!important;font-size:.72rem!important;font-weight:700!important;',
    'letter-spacing:.1em!important;text-transform:uppercase!important;white-space:nowrap!important;',
    'display:inline!important;}',
  ].join('');
  document.head.appendChild(fcwStyle);

  const MAPS_URL = 'https://maps.google.com/maps?q=Via+Roma+5,+73020+Santa+Cesarea+Terme+LE+Italia';
  const TEL      = 'tel:+393349985447';
  const MAIL     = 'mailto:info@caladeibalcani.it';
  const MESSENGER= 'https://m.me/caladeibalcani';
  const INSTAGRAM= 'https://www.instagram.com/cala_dei_balcani/';

  const widget = document.createElement('div');
  widget.className = 'fcw';
  widget.setAttribute('aria-label', 'Contatti rapidi');
  widget.innerHTML = `
    <button class="fcw__toggle" aria-label="Apri contatti rapidi" aria-expanded="false">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      <span class="fcw__toggle-label">Contatti</span>
    </button>
    <div class="fcw__menu" aria-hidden="true">
      <a href="${MAPS_URL}" target="_blank" rel="noopener" class="fcw__btn fcw__btn--maps" aria-label="Vedi su mappa">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <span class="fcw__label">Mappa</span>
      </a>
      <a href="${TEL}" class="fcw__btn fcw__btn--tel" aria-label="Chiama +39 334 998 5447">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.19h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.77a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <span class="fcw__label">+39 334 998 5447</span>
      </a>
      <a href="${MAIL}" class="fcw__btn fcw__btn--mail" aria-label="Invia email">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        <span class="fcw__label">Email</span>
      </a>
      <a href="${MESSENGER}" target="_blank" rel="noopener" class="fcw__btn fcw__btn--msg" aria-label="Scrivi su Messenger">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C6.477 2 2 6.145 2 11.243c0 2.91 1.399 5.51 3.59 7.232V22l3.28-1.803A10.5 10.5 0 0 0 12 20.486c5.523 0 10-4.145 10-9.243S17.523 2 12 2zm1.084 12.457-2.557-2.726-4.988 2.726 5.49-5.83 2.62 2.726 4.924-2.726-5.489 5.83z"/></svg>
        <span class="fcw__label">Messenger</span>
      </a>
      <a href="${INSTAGRAM}" target="_blank" rel="noopener" class="fcw__btn fcw__btn--insta" aria-label="Seguici su Instagram">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
        <span class="fcw__label">Instagram</span>
      </a>
    </div>`;

  document.body.appendChild(widget);

  const toggle = widget.querySelector('.fcw__toggle');
  const menu   = widget.querySelector('.fcw__menu');

  toggle.addEventListener('click', () => {
    const isOpen = widget.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    menu.setAttribute('aria-hidden', String(!isOpen));
  });

  document.addEventListener('click', e => {
    if (!widget.contains(e.target)) {
      widget.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      menu.setAttribute('aria-hidden', 'true');
    }
  });
})();
