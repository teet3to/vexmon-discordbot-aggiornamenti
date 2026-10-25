# Librerie incorporate

Non sono state aggiunte dipendenze esterne. `vendor.mjs` è il file originale
fornito nello ZIP; le licenze incorporate sono conservate. Non occorre eseguire
`npm install` per avvio, test o build.

Versioni rilevate dai percorsi di origine del bundle:

| Libreria | Versione |
| --- | --- |
| discord.js | 14.27.0 |
| express | 5.2.1 |
| cors | 2.8.6 |
| pino | 9.14.0 |
| pino-http | 10.5.0 |
| zod | 3.25.76 |

SHA-256 di `vendor.mjs`: `bb3b7921ab18e976981e10ec48d4c0281c6fda95da80557b1462d55c7bd1c139`.

Il build locale assembla questo vendor con `app.mjs` in modo deterministico;
non ricostruisce le librerie dai sorgenti upstream. Per aggiornare le librerie
servirà il progetto di build originale o una migrazione separata.
