(function () {
  var KEY = 'cdb_cookie_consent';
  var CONSENT = localStorage.getItem(KEY);
  var GA_ID = 'G-1M0FTSFDX7';

  var isSubdir = /\/(en|fr|es|de)\//.test(location.pathname);
  var privacyUrl = isSubdir ? '../privacy.html' : 'privacy.html';

  function loadAnalytics() {
    if (window.__cdbAnalyticsLoaded) return;
    window.__cdbAnalyticsLoaded = true;
    var ga = document.createElement('script');
    ga.async = true;
    ga.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(ga);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', GA_ID);
  }

  var s = document.createElement('style');
  s.textContent =
    '#cdb-cookie-banner{position:fixed;bottom:24px;right:24px;z-index:99998;max-width:320px;width:calc(100vw - 48px);background:#0c1a2e;color:#fff;border-radius:12px;padding:20px 22px;box-shadow:0 8px 40px rgba(0,0,0,.4);font-family:inherit;font-size:.82rem;line-height:1.5;opacity:0;transform:translateY(12px);transition:opacity .35s,transform .35s}' +
    '#cdb-cookie-banner.cdb-show{opacity:1;transform:translateY(0)}' +
    '#cdb-cookie-banner h6{margin:0 0 8px;font-size:.88rem;font-weight:700;color:#c9a84c;letter-spacing:.04em;text-transform:uppercase}' +
    '#cdb-cookie-banner p{margin:0 0 16px;color:#c8d0dc}' +
    '#cdb-cookie-banner a{color:#c9a84c}' +
    '#cdb-cookie-btns{display:flex;gap:8px}' +
    '#cdb-cookie-btns button{flex:1;border:none;border-radius:6px;padding:9px 12px;font-size:.78rem;font-weight:600;cursor:pointer;letter-spacing:.02em}' +
    '#cdb-accept{background:#c9a84c;color:#0c1a2e}' +
    '#cdb-accept:hover{background:#b8933d}' +
    '#cdb-necessary{background:transparent;color:#c8d0dc;border:1px solid rgba(200,208,220,.3)!important}' +
    '#cdb-necessary:hover{background:rgba(200,208,220,.08)}' +
    '#cdb-mini{position:fixed;bottom:24px;left:24px;z-index:99997;background:#0c1a2e;color:#c9a84c;border:none;border-radius:24px;padding:8px 16px;font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.35);transition:background .2s,opacity .3s;font-family:inherit}' +
    '#cdb-mini:hover{background:#152440}' +
    '@media(max-width:520px){#cdb-mini{display:none}' +
    '#cdb-cookie-banner{top:12px;bottom:auto;right:12px;left:12px;max-width:none;width:auto;transform:translateY(-8px)}' +
    '#cdb-cookie-banner.cdb-show{transform:translateY(0)}}';
  document.head.appendChild(s);

  function createMini() {
    if (document.getElementById('cdb-mini')) return;
    var mini = document.createElement('button');
    mini.id = 'cdb-mini';
    mini.textContent = 'Cookie';
    mini.setAttribute('aria-label', 'Gestisci preferenze cookie');
    mini.addEventListener('click', function () {
      mini.remove();
      showBanner();
    });
    document.body.appendChild(mini);
  }

  function showBanner() {
    var banner = document.createElement('div');
    banner.id = 'cdb-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Preferenze cookie');
    banner.innerHTML =
      '<h6>Cookie</h6>' +
      '<p>Utilizziamo cookie tecnici (necessari al funzionamento) e analitici per migliorare la navigazione. Leggi la <a href="' + privacyUrl + '">Privacy &amp; Cookie Policy</a>.</p>' +
      '<div id="cdb-cookie-btns">' +
      '<button id="cdb-accept">Accetta tutto</button>' +
      '<button id="cdb-necessary">Solo necessari</button>' +
      '</div>';

    document.body.appendChild(banner);
    requestAnimationFrame(function () { banner.classList.add('cdb-show'); });

    function dismiss(val) {
      localStorage.setItem(KEY, val);
      banner.style.opacity = '0';
      banner.style.transform = 'translateY(12px)';
      setTimeout(function () {
        banner.remove();
        createMini();
      }, 350);
    }

    document.getElementById('cdb-accept').addEventListener('click', function () { dismiss('accepted'); loadAnalytics(); });
    document.getElementById('cdb-necessary').addEventListener('click', function () { dismiss('necessary'); });
  }

  if (!CONSENT) {
    showBanner();
  } else {
    createMini();
    if (CONSENT === 'accepted') loadAnalytics();
  }
})();
