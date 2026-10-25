# Vexmon Ticket Bot

Versione 1.2.0 del bot Discord, con sorgenti e pacchetto completo.

## Download

- [ZIP completo v1.2.0](https://github.com/teet3to/vexmon-discordbot-aggiornamenti/raw/refs/heads/main/downloads/bot-ticket-aggiornato-v1.2.0.zip)
- [Solo bot.mjs](https://github.com/teet3to/vexmon-discordbot-aggiornamenti/raw/refs/heads/main/bot.mjs)

Ferma il bot, sostituisci `bot.mjs`, conserva `.env`, `assets` e `data`, quindi
riavvia. Le immagini esistenti restano nella tua installazione.
Abilita Message Content Intent nel Developer Portal e carica le emoji
dell'applicazione; consulta [LEGGIMI.txt](LEGGIMI.txt) per tutti i passaggi.

## Funzionalità

ID ticket univoci di sei caratteri, ticket multipli per utente, autorizzazioni
tramite ruoli, emoji dell'applicazione, trascrizioni HTML, assegnazioni staff,
ricerca `/search` con paginazione, regolamenti aggiornati e nuovi campi per il
reset password.

`/regole minecraft`, `/regole discord` e i comandi pannello cancellano tutti i
messaggi nel canale di destinazione prima della pubblicazione.

## Sviluppo

Node.js >=22.12.0. Le librerie sono incorporate in `sorgente/vendor.mjs`;
non serve installare pacchetti.

```sh
cd sorgente
npm test
npm run check
npm run build
```

Il build genera `sorgente/bot.mjs`. Per avviare i sorgenti usa `node start.mjs`.
Non eseguire due istanze con lo stesso token o la stessa directory dati.

Validazione: 34 test con Discord simulato; nessun login a un server reale.
Le licenze delle librerie incorporate sono conservate in `vendor.mjs`.
