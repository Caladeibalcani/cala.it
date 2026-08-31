# Pannello di gestione — caladeibalcani.it/admin/

## Attivazione (da fare una sola volta, ~5 minuti)

Il pannello salva le modifiche sul repository GitHub; serve un token:

1. Vai su https://github.com/settings/personal-access-tokens/new
   (accedi con l'account GitHub proprietario del repo `cala.it`)
2. Token name: `cala-admin` — Expiration: 1 anno
   Repository access: **Only select repositories** → `cala.it`
   Permissions → Repository permissions → **Contents: Read and write**
3. Genera e copia il token (inizia con `github_pat_...`)
4. Vai su Netlify → sito caladeibalcani → **Site configuration → Environment variables**
   → Add a variable → Key: `GITHUB_TOKEN` → Value: (incolla il token) → Save
5. Fai un "Trigger deploy" (Deploys → Trigger deploy → Deploy site)

## Uso quotidiano (per Francesco)

- Indirizzo: **https://caladeibalcani.it/admin/**
- Password iniziale: `CalaAdmin2026!` → cambiarla subito dalla scheda "Password"
- **Gallerie piatti**: sposta le foto con ↑/↓, cambiale di categoria, eliminale,
  aggiungine di nuove. Premere sempre **Salva le modifiche**.
- **Nuovo articolo**: titolo, categoria, descrizione breve, foto di copertina,
  testo (riga vuota = nuovo paragrafo, `## ` a inizio riga = sottotitolo).
  L'articolo appare nel blog, nella pagina indice e nella sitemap da solo.
- Ogni salvataggio va online in 1-2 minuti (rideploy automatico).

## Note tecniche

- Le foto caricate vengono ridimensionate a 1600px direttamente nel browser.
- La galleria riservata resta cifrata: il pannello la ricifra a ogni salvataggio
  con la password dell'area privata (in `data/privata.json`).
- La cartella `/data/` e `/netlify/` non sono raggiungibili dal sito pubblico.
- Il rinnovo del token GitHub (una volta l'anno) ripete i passi 1-4.
