# Vexmon Ticket Bot 2.0.1 — SQLite

Aggiornamento basato sul file definitivo `bot (10).mjs` fornito dall'utente.

[Scarica bot.mjs](https://github.com/teet3to/vexmon-discordbot-aggiornamenti/raw/refs/heads/main/bot.mjs)

## Installazione

1. Ferma il bot ed esegui il backup completo di `data`, `.env` e del vecchio bot.
2. Usa **Node.js 24 LTS**, oppure Node.js >=22.16 con `node:sqlite` disponibile.
3. Sostituisci `bot.mjs`, conserva `.env`, `assets` e `data`, poi riavvia.
4. Il bot crea automaticamente `data/tickets.sqlite`. Se imposti `DATA_DIR`, il
   DB si trova in quella cartella. Deve essere un percorso persistente e scrivibile.
5. Configurazioni, statistiche, promemoria e registro JSON precedenti vengono
   importati automaticamente. Gli originali restano invariati come backup.
6. Esegui `/search`: importa i log del canale `/setup canale-trascrizioni` nel DB.
   I log vecchi ricevono il tag **legacy_log**; gli archivi JSON **legacy_json**;
   i nuovi transcript **native**. L'importazione è riprendibile e senza limite
   arbitrario di 6000 messaggi. Su storici grandi continua in background e la
   risposta segnala risultati parziali fino al completamento.

Non occorre installare SQLite o pacchetti npm: viene usato il modulo integrato
nel runtime Node. Su un runtime troppo vecchio il modulo non è disponibile.

## Dati salvati

SQLite contiene identità del titolare, ID e stato ticket, form di apertura,
nickname, partecipanti aggiunti/rimossi, assegnazioni, statistiche, promemoria,
configurazione e riferimenti a canale/messaggio/allegato delle trascrizioni.
La conversazione completa resta nel transcript Discord: **il DB non contiene
HTML, immagini o copie binarie dei transcript**. Per i vecchi HTML può leggere
una volta nickname e nomi, conservando solo i metadati estratti.

Gli URL CDN Discord possono scadere: il bot usa il messaggio originale per
recuperare URL aggiornati prima dell'invio. Se il file non è più disponibile o
supera il limite, mantiene i link al messaggio log e segnala il problema.
Un DB non può recuperare transcript già cancellati da Discord.

## Ricerca e autorizzazioni

`/search nome:Nickname`, `/search nome:ABC123`, `/search utente:@Utente` cercano
nel DB, sia aperti sia archiviati. I nomi correnti dei membri vengono aggiornati
come alias, conservando quelli già noti. La prima importazione fa ancora richieste
Discord; le successive aggiornano solo i log nuovi.

La politica del punto 2 dell'audit **è invariata**: ruolo staff della categoria,
ruolo gestore, amministratore Discord e amministratore permanente possono
ricevere i transcript secondo i controlli esistenti, anche senza vedere il log.
L'amministratore permanente rimane `1076582008270114958`.

La grafica e le emoji del file definitivo sono conservate. `/regole minecraft`,
`/regole discord` e i pannelli mantengono la cancellazione dei messaggi prevista.

## Backup

Dopo la migrazione i vecchi JSON **non vengono aggiornati**: il dato attivo è
SQLite. Per un backup semplice, ferma il bot prima di copiare la cartella `data`.
Non cancellare `tickets.sqlite-wal` o `tickets.sqlite-shm` mentre il bot gira.
Conserva anche gli asset e i transcript nel canale Discord. Non avviare due
istanze del bot sullo stesso DB.

## Sviluppo e verifiche

```sh
cd sorgente
npm test
npm run check
npm run build
```

La build genera `sorgente/bot.mjs`; il file di distribuzione è quello alla radice.
I test usano SQLite reale e Discord simulato, senza login su un server reale.

## Correzione 2.0.1

Rimossi il messaggio tecnico di indicizzazione e il riferimento a SQLite dal
footer di ricerca. Lo stato di importazione compare soltanto in forma discreta
nel footer. Il recupero degli allegati forza la lettura aggiornata del messaggio
e accetta trascrizioni HTML anche quando la scheda originale è stata modificata.
Gli errori di accesso sono distinti dai messaggi realmente eliminati; il link al
messaggio originale resta consultabile anche se il bot non riesce ad allegare il file.
