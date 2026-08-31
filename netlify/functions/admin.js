// API amministrazione Cala dei Balcani (Netlify Function, senza dipendenze).
// Autenticazione con password (hash PBKDF2 in data/admin-auth.json) + captcha,
// modifiche committate sul repo GitHub => Netlify rideploya il sito.
// Richiede la variabile d'ambiente GITHUB_TOKEN (fine-grained, contents read/write).

const crypto = require('crypto');

const REPO = process.env.GITHUB_REPO || 'dedonnoantonio75-create/cala.it';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const TOKEN = process.env.GITHUB_TOKEN || '';
const API = 'https://api.github.com';
const ITER = 150000;
const TOKEN_TTL = 2 * 60 * 60 * 1000; // 2 ore

// ── GitHub helpers ───────────────────────────────────────────────────────────
async function gh(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Authorization': 'Bearer ' + TOKEN,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'cala-admin',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GitHub ${res.status} su ${path}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

async function getFileText(path) {
  const d = await gh(`/repos/${REPO}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${BRANCH}`);
  return Buffer.from(d.content, 'base64').toString('utf8');
}

async function listDir(path) {
  return gh(`/repos/${REPO}/contents/${path}?ref=${BRANCH}`);
}

// commit atomico di piu' file (Git Data API)
async function commitFiles(files, message) {
  const ref = await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
  const baseCommit = ref.object.sha;
  const base = await gh(`/repos/${REPO}/git/commits/${baseCommit}`);
  const tree = [];
  for (const f of files) {
    const blob = await gh(`/repos/${REPO}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: f.base64 ? f.content : Buffer.from(f.content, 'utf8').toString('base64'), encoding: 'base64' }),
    });
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const newTree = await gh(`/repos/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: base.tree.sha, tree }),
  });
  const commit = await gh(`/repos/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [baseCommit] }),
  });
  await gh(`/repos/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  });
  return commit.sha;
}

// ── auth ─────────────────────────────────────────────────────────────────────
function pbkdf2(password, saltB64) {
  return crypto.pbkdf2Sync(password, Buffer.from(saltB64, 'base64'), ITER, 32, 'sha256').toString('base64');
}

async function loadAuth() {
  return JSON.parse(await getFileText('data/admin-auth.json'));
}

function secretFrom(auth) {
  return crypto.createHash('sha256').update(auth.hash + '|' + TOKEN).digest();
}

function hmac(secret, s) {
  return crypto.createHmac('sha256', secret).update(s).digest('base64url');
}

function makeToken(auth) {
  const body = Buffer.from(JSON.stringify({ exp: Date.now() + TOKEN_TTL })).toString('base64url');
  return body + '.' + hmac(secretFrom(auth), body);
}

function checkToken(auth, token) {
  if (!token) return false;
  const [body, sig] = token.split('.');
  if (!body || !sig) return false;
  const good = hmac(secretFrom(auth), body);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return false;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()).exp > Date.now(); }
  catch { return false; }
}

// captcha aritmetico firmato (stateless)
function makeChallenge(auth) {
  const a = 1 + crypto.randomInt(9), b = 1 + crypto.randomInt(9);
  const exp = Date.now() + 5 * 60 * 1000;
  const sig = hmac(secretFrom(auth), `cap|${a}|${b}|${exp}`);
  return { a, b, exp, sig };
}

function checkChallenge(auth, c, answer) {
  if (!c || typeof answer === 'undefined') return false;
  if (Number(c.exp) < Date.now()) return false;
  const sig = hmac(secretFrom(auth), `cap|${c.a}|${c.b}|${c.exp}`);
  if (sig !== c.sig) return false;
  return Number(answer) === Number(c.a) + Number(c.b);
}

// ── cifratura payload area privata (compatibile WebCrypto AES-GCM) ───────────
function encryptGallerie(dataObj, password) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, ITER, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(dataObj), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return `${salt.toString('base64')}.${iv.toString('base64')}.${ct.toString('base64')}`;
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
  for (const c of g.categorie) {
    if (typeof c.nome !== 'string' || !Array.isArray(c.foto)) return false;
    for (const f of c.foto) {
      for (const k of ['w', 'j']) {
        if (typeof f[k] !== 'string' || !/^img\/[a-zA-Z0-9_\/.-]+\.(jpg|jpeg|webp|png)$/.test(f[k])) return false;
      }
      if (typeof f.c !== 'string' || f.c.length > 200) return false;
    }
  }
  return g.categorie.length <= 20 && g.categorie.every(c => c.foto.length <= 100);
}

// corpo articolo: testo semplice -> HTML (## = sottotitolo, riga vuota = paragrafo)
function bodyToHtml(text) {
  const blocks = String(text).replace(/\r/g, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  return blocks.map(b => {
    if (b.startsWith('## ')) return `    <h2>${esc(b.slice(3))}</h2>`;
    return `    <p>${esc(b).replace(/\n/g, '<br>')}</p>`;
  }).join('\n\n');
}

// ── handler ──────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const json = (code, obj) => ({ statusCode: code, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST richiesto' });
  if (!TOKEN) return json(500, { error: 'GITHUB_TOKEN non configurato su Netlify (Site settings → Environment variables)' });

  let req;
  try { req = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'JSON non valido' }); }

  let auth;
  try { auth = await loadAuth(); } catch (e) { return json(500, { error: 'Impossibile leggere admin-auth: ' + e.message }); }

  const bearer = (event.headers.authorization || '').replace(/^Bearer\s+/i, '');

  try {
    switch (req.action) {

      case 'challenge':
        return json(200, { challenge: makeChallenge(auth) });

      case 'login': {
        if (!checkChallenge(auth, req.challenge, req.answer)) {
          return json(400, { error: 'Captcha errato o scaduto', challenge: makeChallenge(auth) });
        }
        await new Promise(r => setTimeout(r, 400)); // rallenta i tentativi
        if (pbkdf2(String(req.password || ''), auth.salt) !== auth.hash) {
          return json(401, { error: 'Password errata', challenge: makeChallenge(auth) });
        }
        return json(200, { token: makeToken(auth) });
      }

      case 'me':
        return json(200, { ok: checkToken(auth, bearer) });
    }

    // da qui in poi serve il token
    if (!checkToken(auth, bearer)) return json(401, { error: 'Sessione scaduta: rientra' });

    switch (req.action) {

      case 'get_data': {
        const gallerie = JSON.parse(await getFileText('data/gallerie.json'));
        let blog = [];
        try { blog = (await listDir('blog')).filter(f => f.name.endsWith('.html')).map(f => f.name); } catch {}
        return json(200, { gallerie, blog });
      }

      case 'save_gallery': {
        const g = req.gallerie;
        if (!validGallerie(g)) return json(400, { error: 'Dati galleria non validi' });
        const privata = JSON.parse(await getFileText('data/privata.json'));
        const payload = encryptGallerie(g, privata.password);
        let page = await getFileText('area-privata.html');
        const nuova = page.replace(/var AP_PAYLOAD = '[^']*';/, `var AP_PAYLOAD = '${payload}';`);
        if (nuova === page && !page.includes(payload)) return json(500, { error: 'Payload non trovato nella pagina' });
        await commitFiles([
          { path: 'data/gallerie.json', content: JSON.stringify(g, null, 1) },
          { path: 'area-privata.html', content: nuova },
        ], 'Admin: aggiornamento gallerie area privata');
        return json(200, { ok: true, note: 'Salvato. Il sito si aggiorna in 1-2 minuti.' });
      }

      case 'upload_image': {
        const stem = slugify(req.name || 'foto') + '-' + Date.now().toString(36);
        if (!req.jpg) return json(400, { error: 'Immagine mancante' });
        if (req.jpg.length > 8_000_000) return json(400, { error: 'Immagine troppo grande' });
        const files = [{ path: `img/piatti-riservati/${stem}.jpg`, content: req.jpg, base64: true }];
        let w = `img/piatti-riservati/${stem}.jpg`;
        if (req.webp) {
          files.push({ path: `img/piatti-riservati/${stem}.webp`, content: req.webp, base64: true });
          w = `img/piatti-riservati/${stem}.webp`;
        }
        await commitFiles(files, `Admin: nuova foto galleria (${stem})`);
        return json(200, { j: `img/piatti-riservati/${stem}.jpg`, w });
      }

      case 'change_password': {
        const nuova = String(req.newPassword || '');
        if (pbkdf2(String(req.oldPassword || ''), auth.salt) !== auth.hash) return json(401, { error: 'Vecchia password errata' });
        if (nuova.length < 10) return json(400, { error: 'La nuova password deve avere almeno 10 caratteri' });
        const salt = crypto.randomBytes(16).toString('base64');
        const nuovoAuth = { salt, hash: pbkdf2(nuova, salt), iter: ITER };
        await commitFiles([{ path: 'data/admin-auth.json', content: JSON.stringify(nuovoAuth, null, 1) }], 'Admin: cambio password');
        return json(200, { ok: true, note: 'Password cambiata: al prossimo accesso usa quella nuova.' });
      }

      case 'save_post': {
        const titolo = String(req.titolo || '').trim();
        const descrizione = String(req.descrizione || '').trim();
        const categoria = String(req.categoria || 'Ispirazione').trim().slice(0, 40);
        const corpo = String(req.corpo || '').trim();
        if (titolo.length < 8 || titolo.length > 120) return json(400, { error: 'Titolo: 8-120 caratteri' });
        if (descrizione.length < 40 || descrizione.length > 165) return json(400, { error: 'Descrizione: 40-165 caratteri (va nei risultati Google)' });
        if (corpo.length < 200) return json(400, { error: 'Il testo è troppo corto' });
        if (!req.coverJpg) return json(400, { error: 'Foto di copertina mancante' });

        const slug = slugify(req.slug || titolo);
        const now = new Date();
        const dataIso = now.toISOString().slice(0, 10);
        const dataUmana = `${now.getDate()} ${MESI[now.getMonth()]} ${now.getFullYear()}`;
        const meseAnno = `${MESI[now.getMonth()]} ${now.getFullYear()}`;
        const coverJpg = `img/blog/${slug}.jpg`;
        const coverWebp = req.coverWebp ? `img/blog/${slug}.webp` : coverJpg;

        let tpl = await getFileText('data/blog-template.html');
        const seoTitle = titolo.length <= 52 ? `${titolo} | Blog Cala dei Balcani` : titolo.slice(0, 62);
        const vars = {
          SEO_TITLE: esc(seoTitle), DESCRIZIONE: esc(descrizione), TITOLO: esc(titolo),
          CATEGORIA: esc(categoria), DATA_ISO: dataIso, DATA_UMANA: dataUmana, MESE_ANNO: meseAnno,
          SLUG: slug, COVER_JPG: '../' + coverJpg, COVER_WEBP: '../' + coverWebp,
          COVER_ABS: 'https://caladeibalcani.it/' + coverJpg,
          CORPO: bodyToHtml(corpo),
        };
        for (const [k, v] of Object.entries(vars)) tpl = tpl.split('{{' + k + '}}').join(v);

        // card nell'indice del blog
        let indice = await getFileText('blog.html');
        const MARK = '<!-- ADMIN:NUOVI-ARTICOLI -->';
        if (!indice.includes(MARK)) return json(500, { error: 'Marcatore articoli mancante in blog.html' });
        const card = `${MARK}

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
        </article>`;
        indice = indice.replace(MARK, card);

        // sitemap
        let sitemap = await getFileText('sitemap.xml');
        const voce = `  <url>\n    <loc>https://caladeibalcani.it/blog/${slug}.html</loc>\n    <lastmod>${dataIso}</lastmod>\n  </url>\n</urlset>`;
        sitemap = sitemap.replace(/<\/urlset>\s*$/, voce);

        const files = [
          { path: `blog/${slug}.html`, content: tpl },
          { path: 'blog.html', content: indice },
          { path: 'sitemap.xml', content: sitemap },
          { path: coverJpg, content: req.coverJpg, base64: true },
        ];
        if (req.coverWebp) files.push({ path: coverWebp, content: req.coverWebp, base64: true });
        await commitFiles(files, `Admin: nuovo articolo blog "${titolo}"`);
        return json(200, { ok: true, url: `https://caladeibalcani.it/blog/${slug}.html`, note: 'Articolo pubblicato. Online in 1-2 minuti.' });
      }

      default:
        return json(400, { error: 'Azione sconosciuta' });
    }
  } catch (e) {
    return json(500, { error: e.message });
  }
};
