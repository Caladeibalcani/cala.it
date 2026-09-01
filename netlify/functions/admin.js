// API amministrazione Cala dei Balcani (Netlify Function, senza dipendenze esterne).
//
// Non richiede variabili d'ambiente su Netlify: il token GitHub vive cifrato
// (AES-256-GCM, chiave PBKDF2 dalla password admin) dentro ./token.json, che
// viene impacchettato con la funzione e non e' mai servito al pubblico.
// La configurazione iniziale si fa una sola volta dal pannello /admin/.

const crypto = require('crypto');

let CFG = { configured: false };
try { CFG = require('./token.json'); } catch (e) { /* prima installazione */ }

const REPO = process.env.GITHUB_REPO || 'Caladeibalcani/cala.it';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const API = 'https://api.github.com';
const ITER = 150000;
const CFG_PATH = 'netlify/functions/token.json';

// ── crypto ───────────────────────────────────────────────────────────────────
function pbkdf2(password, saltB64) {
  return crypto.pbkdf2Sync(password, Buffer.from(saltB64, 'base64'), ITER, 32, 'sha256').toString('base64');
}

function encryptToken(ghToken, password) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, ITER, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(ghToken, 'utf8'), c.final(), c.getAuthTag()]);
  return [salt, iv, ct].map(b => b.toString('base64')).join('.');
}

function decryptToken(enc, password) {
  const [s, i, c] = enc.split('.').map(x => Buffer.from(x, 'base64'));
  const key = crypto.pbkdf2Sync(password, s, ITER, 32, 'sha256');
  const d = crypto.createDecipheriv('aes-256-gcm', key, i);
  d.setAuthTag(c.subarray(c.length - 16));
  return Buffer.concat([d.update(c.subarray(0, c.length - 16)), d.final()]).toString('utf8');
}

// password corretta? -> ritorna il token GitHub in chiaro, altrimenti null
function unlock(password) {
  if (!CFG.configured || !password) return null;
  const h = pbkdf2(String(password), CFG.salt);
  const a = Buffer.from(h), b = Buffer.from(CFG.hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return decryptToken(CFG.enc, String(password)); } catch { return null; }
}

// captcha aritmetico firmato (stateless); il segreto deriva dall'hash password
function capSecret() {
  return crypto.createHash('sha256').update((CFG.hash || 'setup') + '|cala-captcha').digest();
}
function hmac(s) { return crypto.createHmac('sha256', capSecret()).update(s).digest('base64url'); }
function makeChallenge() {
  const a = 1 + crypto.randomInt(9), b = 1 + crypto.randomInt(9);
  const exp = Date.now() + 5 * 60 * 1000;
  return { a, b, exp, sig: hmac(`cap|${a}|${b}|${exp}`) };
}
function checkChallenge(c, answer) {
  if (!c || answer === undefined || answer === '') return false;
  if (Number(c.exp) < Date.now()) return false;
  if (hmac(`cap|${c.a}|${c.b}|${c.exp}`) !== c.sig) return false;
  return Number(answer) === Number(c.a) + Number(c.b);
}

// cifratura del catalogo per l'area privata (compatibile WebCrypto lato pagina)
function encryptGallerie(dataObj, password) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, ITER, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(dataObj), 'utf8'), c.final(), c.getAuthTag()]);
  return `${salt.toString('base64')}.${iv.toString('base64')}.${ct.toString('base64')}`;
}

// ── GitHub ───────────────────────────────────────────────────────────────────
async function gh(token, path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'cala-admin',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GitHub ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

async function getFileText(token, path) {
  const d = await gh(token, `/repos/${REPO}/contents/${path}?ref=${BRANCH}`);
  return Buffer.from(d.content, 'base64').toString('utf8');
}

// commit atomico di piu' file (Git Data API)
async function commitFiles(token, files, message) {
  const ref = await gh(token, `/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const baseSha = ref.object.sha;
  const base = await gh(token, `/repos/${REPO}/git/commits/${baseSha}`);
  const tree = [];
  for (const f of files) {
    const content = f.base64 ? f.content : Buffer.from(f.content, 'utf8').toString('base64');
    const blob = await gh(token, `/repos/${REPO}/git/blobs`, {
      method: 'POST', body: JSON.stringify({ content, encoding: 'base64' }),
    });
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const newTree = await gh(token, `/repos/${REPO}/git/trees`, {
    method: 'POST', body: JSON.stringify({ base_tree: base.tree.sha, tree }),
  });
  const commit = await gh(token, `/repos/${REPO}/git/commits`, {
    method: 'POST', body: JSON.stringify({ message, tree: newTree.sha, parents: [baseSha] }),
  });
  await gh(token, `/repos/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH', body: JSON.stringify({ sha: commit.sha }),
  });
  return commit.sha;
}

// ── util ─────────────────────────────────────────────────────────────────────
function slugify(s) {
  return String(s).toLowerCase()
    .replace(/[àá]/g, 'a').replace(/[èé]/g, 'e').replace(/[ìí]/g, 'i')
    .replace(/[òó]/g, 'o').replace(/[ùú]/g, 'u').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 80);
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

function validGallerie(g) {
  if (!g || typeof g.titolo !== 'string' || !Array.isArray(g.categorie)) return false;
  if (g.categorie.length > 20) return false;
  for (const c of g.categorie) {
    if (typeof c.nome !== 'string' || !Array.isArray(c.foto) || c.foto.length > 200) return false;
    for (const f of c.foto) {
      for (const k of ['w', 'j']) {
        if (typeof f[k] !== 'string' || !/^img\/[a-zA-Z0-9_\/.-]+\.(jpg|jpeg|webp|png)$/.test(f[k])) return false;
      }
      if (typeof f.c !== 'string' || f.c.length > 200) return false;
    }
  }
  return true;
}

function bodyToHtml(text) {
  return String(text).replace(/\r/g, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
    .map(b => b.startsWith('## ') ? `    <h2>${esc(b.slice(3))}</h2>` : `    <p>${esc(b).replace(/\n/g, '<br>')}</p>`)
    .join('\n\n');
}

// ── handler ──────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const json = (code, obj) => ({
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(obj),
  });
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST richiesto' });

  let req;
  try { req = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON non valido' }); }

  try {
    // ── azioni pubbliche ──
    if (req.action === 'status') return json(200, { configured: !!CFG.configured });
    if (req.action === 'challenge') return json(200, { challenge: makeChallenge() });

    if (req.action === 'setup') {
      if (CFG.configured) return json(400, { error: 'Il pannello è già configurato' });
      if (!checkChallenge(req.challenge, req.answer)) return json(400, { error: 'Captcha errato o scaduto', challenge: makeChallenge() });
      const ghToken = String(req.ghToken || '').trim();
      const password = String(req.password || '');
      if (!ghToken) return json(400, { error: 'Token GitHub mancante' });
      if (password.length < 10) return json(400, { error: 'La password deve avere almeno 10 caratteri' });
      // verifica che il token abbia davvero accesso in scrittura al repo
      let repo;
      try { repo = await gh(ghToken, `/repos/${REPO}`); }
      catch (e) { return json(400, { error: 'Token non valido o senza accesso al repository. ' + e.message }); }
      if (!repo.permissions || !repo.permissions.push) {
        return json(400, { error: 'Il token non ha il permesso "Contents: Read and write" su ' + REPO });
      }
      const salt = crypto.randomBytes(16).toString('base64');
      const nuovo = {
        configured: true, salt, hash: pbkdf2(password, salt), iter: ITER,
        enc: encryptToken(ghToken, password),
      };
      await commitFiles(ghToken, [{ path: CFG_PATH, content: JSON.stringify(nuovo, null, 1) }],
        'Admin: configurazione iniziale del pannello');
      return json(200, { ok: true, note: 'Configurato. Attendi 1-2 minuti che il sito si aggiorni, poi entra con la tua password.' });
    }

    if (req.action === 'login') {
      if (!CFG.configured) return json(400, { error: 'Pannello non ancora configurato' });
      if (!checkChallenge(req.challenge, req.answer)) return json(400, { error: 'Captcha errato o scaduto', challenge: makeChallenge() });
      await new Promise(r => setTimeout(r, 400)); // rallenta i tentativi automatici
      if (!unlock(req.password)) return json(401, { error: 'Password errata', challenge: makeChallenge() });
      return json(200, { ok: true });
    }

    // ── da qui serve la password ──
    if (!CFG.configured) return json(400, { error: 'Pannello non ancora configurato' });
    const token = unlock(req.password);
    if (!token) return json(401, { error: 'Sessione scaduta o password cambiata: rientra' });

    switch (req.action) {

      case 'get_data': {
        const gallerie = JSON.parse(await getFileText(token, 'data/gallerie.json'));
        let blog = [];
        try {
          blog = (await gh(token, `/repos/${REPO}/contents/blog?ref=${BRANCH}`))
            .filter(f => f.name.endsWith('.html')).map(f => f.name);
        } catch {}
        return json(200, { gallerie, blog });
      }

      case 'save_gallery': {
        const g = req.gallerie;
        if (!validGallerie(g)) return json(400, { error: 'Dati galleria non validi' });
        const privata = JSON.parse(await getFileText(token, 'data/privata.json'));
        const payload = encryptGallerie(g, privata.password);
        const page = await getFileText(token, 'area-privata.html');
        const nuova = page.replace(/var AP_PAYLOAD = '[^']*';/, `var AP_PAYLOAD = '${payload}';`);
        if (nuova === page) return json(500, { error: 'Payload non trovato in area-privata.html' });
        await commitFiles(token, [
          { path: 'data/gallerie.json', content: JSON.stringify(g, null, 1) },
          { path: 'area-privata.html', content: nuova },
        ], 'Admin: aggiornamento gallerie area privata');
        return json(200, { ok: true, note: 'Salvato. Il sito si aggiorna in 1-2 minuti.' });
      }

      case 'upload_image': {
        if (!req.jpg) return json(400, { error: 'Immagine mancante' });
        if (req.jpg.length > 8000000) return json(400, { error: 'Immagine troppo grande' });
        const stem = slugify(req.name || 'foto') + '-' + Date.now().toString(36);
        const files = [{ path: `img/piatti-riservati/${stem}.jpg`, content: req.jpg, base64: true }];
        let w = `img/piatti-riservati/${stem}.jpg`;
        if (req.webp) {
          files.push({ path: `img/piatti-riservati/${stem}.webp`, content: req.webp, base64: true });
          w = `img/piatti-riservati/${stem}.webp`;
        }
        await commitFiles(token, files, `Admin: nuova foto galleria (${stem})`);
        return json(200, { j: `img/piatti-riservati/${stem}.jpg`, w });
      }

      case 'change_password': {
        const nuova = String(req.newPassword || '');
        if (nuova.length < 10) return json(400, { error: 'La nuova password deve avere almeno 10 caratteri' });
        const salt = crypto.randomBytes(16).toString('base64');
        const nuovo = {
          configured: true, salt, hash: pbkdf2(nuova, salt), iter: ITER,
          enc: encryptToken(token, nuova), // stesso token GitHub, ricifrato
        };
        await commitFiles(token, [{ path: CFG_PATH, content: JSON.stringify(nuovo, null, 1) }],
          'Admin: cambio password pannello');
        return json(200, { ok: true, note: 'Password cambiata. Diventa attiva tra 1-2 minuti (il tempo del riavvio del sito): fino ad allora vale ancora la vecchia.' });
      }

      case 'save_post': {
        const titolo = String(req.titolo || '').trim();
        const descrizione = String(req.descrizione || '').trim();
        const categoria = String(req.categoria || 'Ispirazione').trim().slice(0, 40);
        const corpo = String(req.corpo || '').trim();
        if (titolo.length < 8 || titolo.length > 120) return json(400, { error: 'Titolo: 8-120 caratteri' });
        if (descrizione.length < 40 || descrizione.length > 165) return json(400, { error: 'Descrizione: 40-165 caratteri' });
        if (corpo.length < 200) return json(400, { error: 'Il testo dell\'articolo è troppo corto' });
        if (!req.coverJpg) return json(400, { error: 'Foto di copertina mancante' });

        const slug = slugify(req.slug || titolo);
        const now = new Date();
        const dataIso = now.toISOString().slice(0, 10);
        const dataUmana = `${now.getDate()} ${MESI[now.getMonth()]} ${now.getFullYear()}`;
        const meseAnno = `${MESI[now.getMonth()]} ${now.getFullYear()}`;
        const coverJpg = `img/blog/${slug}.jpg`;
        const coverWebp = req.coverWebp ? `img/blog/${slug}.webp` : coverJpg;

        let tpl = await getFileText(token, 'data/blog-template.html');
        const seoTitle = titolo.length <= 52 ? `${titolo} | Blog Cala dei Balcani` : titolo.slice(0, 62);
        const vars = {
          SEO_TITLE: esc(seoTitle), DESCRIZIONE: esc(descrizione), TITOLO: esc(titolo),
          CATEGORIA: esc(categoria), DATA_ISO: dataIso, DATA_UMANA: dataUmana, MESE_ANNO: meseAnno,
          SLUG: slug, COVER_JPG: '../' + coverJpg, COVER_WEBP: '../' + coverWebp,
          COVER_ABS: 'https://caladeibalcani.it/' + coverJpg, CORPO: bodyToHtml(corpo),
        };
        for (const [k, v] of Object.entries(vars)) tpl = tpl.split('{{' + k + '}}').join(v);

        let indice = await getFileText(token, 'blog.html');
        const MARK = '<!-- ADMIN:NUOVI-ARTICOLI -->';
        if (!indice.includes(MARK)) return json(500, { error: 'Marcatore articoli mancante in blog.html' });
        indice = indice.replace(MARK, `${MARK}

        <article class="blog-card fade-up">
          <a href="blog/${slug}.html" class="blog-card__img-link" tabindex="-1" aria-hidden="true">
            <div class="blog-card__img">
              <picture>
                <source srcset="${coverWebp}" type="image/webp">
                <img src="${coverJpg}" alt="${esc(titolo)}" loading="lazy" width="600" height="400">
              </picture>
            </div>
          </a>
          <div class="blog-card__body">
            <div class="blog-card__meta">${esc(categoria)} · ${dataUmana}</div>
            <h3><a href="blog/${slug}.html">${esc(titolo)}</a></h3>
            <p>${esc(descrizione)}</p>
            <a href="blog/${slug}.html" class="blog-card__link">Leggi l'articolo →</a>
          </div>
        </article>`);

        let sitemap = await getFileText(token, 'sitemap.xml');
        sitemap = sitemap.replace(/<\/urlset>\s*$/,
          `  <url>\n    <loc>https://caladeibalcani.it/blog/${slug}.html</loc>\n    <lastmod>${dataIso}</lastmod>\n  </url>\n</urlset>`);

        const files = [
          { path: `blog/${slug}.html`, content: tpl },
          { path: 'blog.html', content: indice },
          { path: 'sitemap.xml', content: sitemap },
          { path: coverJpg, content: req.coverJpg, base64: true },
        ];
        if (req.coverWebp) files.push({ path: coverWebp, content: req.coverWebp, base64: true });
        await commitFiles(token, files, `Admin: nuovo articolo blog "${titolo}"`);
        return json(200, { ok: true, url: `https://caladeibalcani.it/blog/${slug}.html`, note: 'Articolo pubblicato: online tra 1-2 minuti.' });
      }

      // ── backup ──────────────────────────────────────────────────────────
      case 'list_backups': {
        const rel = await gh(token, `/repos/${REPO}/releases?per_page=20`);
        const backups = rel.filter(r => r.tag_name.startsWith('backup-')).map(r => {
          const a = (r.assets || [])[0] || {};
          return {
            tag: r.tag_name,
            data: (r.published_at || r.created_at || '').slice(0, 10),
            peso: a.size ? (a.size / 1048576).toFixed(0) + ' MB' : '—',
            assetId: a.id || null,
            note: (r.body || '').split('\n').find(l => l.includes('Modifiche')) || '',
          };
        });
        return json(200, { backups });
      }

      case 'download_backup': {
        const id = Number(req.assetId);
        if (!id) return json(400, { error: 'Backup non indicato' });
        // GitHub risponde con un rimando a un indirizzo temporaneo gia' autorizzato:
        // lo passiamo al browser, che scarica direttamente (la funzione non potrebbe
        // reggere centinaia di MB).
        const res = await fetch(`${API}/repos/${REPO}/releases/assets/${id}`, {
          headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/octet-stream', 'User-Agent': 'cala-admin' },
          redirect: 'manual',
        });
        const url = res.headers.get('location');
        if (!url) return json(500, { error: 'Link di download non disponibile (HTTP ' + res.status + ')' });
        return json(200, { url });
      }

      case 'request_backup': {
        await commitFiles(token, [{
          path: 'data/backup-request.json',
          content: JSON.stringify({ richiesto: new Date().toISOString(), da: 'pannello admin' }, null, 1),
        }], 'Admin: richiesta di backup manuale');
        return json(200, { ok: true, note: 'Backup avviato. Ci vogliono circa 3-5 minuti: ricarica l\'elenco tra poco.' });
      }

      default:
        return json(400, { error: 'Azione sconosciuta' });
    }
  } catch (e) {
    return json(500, { error: e.message });
  }
};
