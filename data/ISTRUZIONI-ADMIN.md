# Pannello di gestione — caladeibalcani.it/admin/

Non serve alcun accesso a Netlify: il token GitHub viene salvato **cifrato**
dentro il repository (`netlify/functions/token.json`), sbloccabile solo con la
password del pannello.

## Configurazione iniziale (una volta sola, ~4 minuti)

1. Crea un token su GitHub — <https://github.com/settings/personal-access-tokens/new>
   - Token name: `cala-admin` · Expiration: 1 anno
   - Repository access: **Only select repositories** → `cala.it`
   - Permissions → Repository permissions → **Contents: Read and write**
     (Metadata: Read-only viene aggiunto da solo, è corretto così)
   - **Generate token** e copia il codice `github_pat_...`
2. Apri **https://caladeibalcani.it/admin/**: alla prima visita compare la
   schermata "Configurazione iniziale".
3. Incolla il token, scegli la password del pannello (min. 10 caratteri),
   rispondi al captcha e premi **Configura il pannello**.
4. Attendi 1-2 minuti (il sito si riavvia da solo), poi entra con la password.

Da quel momento la schermata di configurazione sparisce per sempre.

## Uso quotidiano (per Francesco)

- Indirizzo: **https://caladeibalcani.it/admin/** + password
- **Gallerie piatti**: sposta le foto con ↑/↓, cambiale di categoria, aggiungi
  didascalie, elimina, carica foto nuove. Premere sempre **Salva le modifiche**.
- **Nuovo articolo**: titolo, categoria, descrizione breve, foto di copertina e
  testo (riga vuota = nuovo paragrafo, `## ` a inizio riga = sottotitolo).
  L'articolo finisce da solo nel blog, nella pagina indice e nella sitemap.
- **Password**: si cambia da soli dalla scheda 🔑. Diventa attiva dopo 1-2 minuti.
- Ogni salvataggio è online in 1-2 minuti.

## Backup (scheda 💾 nel pannello)

**Attivazione, una volta sola:** su GitHub → repo `cala.it` → **Settings** →
**Secrets and variables** → **Actions** → **New repository secret**
- Name: `BACKUP_PASSWORD`
- Secret: la password con cui si apriranno gli archivi (scriversela!)

Da quel momento:
- ogni **lunedì mattina** parte un backup automatico, ma solo se qualcosa è
  cambiato dall'ultima volta (niente copie inutili);
- dal pannello si può farne uno **subito** e **scaricare** quelli esistenti;
- arriva un'**email** a ogni backup eseguito (è una segnalazione aperta sul repo:
  si può chiudere, serve solo da avviso);
- vengono conservate le ultime **4 copie**, le più vecchie si cancellano da sole.

L'archivio è un `.7z` con **AES-256** e nomi dei file nascosti; dentro c'è
`sito.bundle`, che contiene il sito completo con tutta la cronologia:
si ripristina con `git clone sito.bundle cala.it`.

## Note tecniche

- Le foto vengono ridimensionate a 1600px nel browser prima dell'invio (jpg+webp).
- La galleria riservata resta cifrata: a ogni salvataggio il pannello la ricifra
  con la password dell'area privata (`data/privata.json`).
- `/data/` e `/netlify/` non sono raggiungibili dal sito pubblico (vedi `_redirects`).
- **La password del pannello non è recuperabile.** Se viene persa: cancellare il
  contenuto di `netlify/functions/token.json` sostituendolo con
  `{"configured": false}` (da GitHub, matita "Edit") e rifare la configurazione
  iniziale con un nuovo token.
- Rinnovo annuale del token: rigenerarlo su GitHub e ripetere la configurazione
  iniziale con la procedura di ripristino qui sopra.
