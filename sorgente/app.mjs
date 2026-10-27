// Codice applicativo ricostruito dal bundle JavaScript fornito.
import { __toESM, require_express2, require_lib3, require_logger, require_pino, require_src2, objectType, stringType } from './vendor.mjs';
// VEXMON_APPLICATION_BODY
// src/app.ts
var import_express3 = __toESM(require_express2(), 1);
var import_cors = __toESM(require_lib3(), 1);
var import_pino_http = __toESM(require_logger(), 1);

// src/routes/index.ts
var import_express2 = __toESM(require_express2(), 1);

// src/routes/health.ts
var import_express = __toESM(require_express2(), 1);

// ../../lib/api-zod/src/generated/api.ts
var HealthCheckResponse = objectType({
  status: stringType()
});

// src/routes/health.ts
var router = (0, import_express.Router)();
router.get('/readyz', (_req, res) => {
  const ready = client.isReady() && discordInitialized;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', discord: ready });
});
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});
var health_default = router;

// src/routes/index.ts
var router2 = (0, import_express2.Router)();
router2.use(health_default);
var routes_default = router2;

// src/lib/logger.ts
var import_pino = __toESM(require_pino(), 1);
var logger = (0, import_pino.default)({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']"
  ],

});

// src/app.ts
var app = (0, import_express3.default)();
app.use(
  (0, import_pino_http.default)({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0]
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode
        };
      }
    }
  })
);
app.use((0, import_cors.default)());
app.use(import_express3.default.json());
app.use(import_express3.default.urlencoded({ extended: true }));
app.use("/api", routes_default);
var app_default = app;

// src/discord/bot.ts
var import_discord4 = __toESM(require_src2(), 1);
import { existsSync } from "node:fs";
import { dirname as dirname2, resolve as resolve3 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/discord/config.ts
import { mkdir, readFile, writeFile, rename, copyFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { chmod } from "node:fs/promises";
import { randomInt, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var dataDir = process.env["DATA_DIR"] ?? resolve(dirname(fileURLToPath(import.meta.url)), "data");
// SQLite is local to the bot host. No transcript HTML or image bytes are stored.
var ticketDb;
var databaseOpening;
var databasePath = resolve(dataDir, 'tickets.sqlite');
async function openTicketDatabase() {
  if (ticketDb) return ticketDb;
  databaseOpening ??= (async () => {
    await mkdir(dataDir, { recursive: true });
    const db = new DatabaseSync(databasePath);
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS schema_version(version INTEGER NOT NULL);
      INSERT INTO schema_version SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM schema_version);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reserved_ids(id TEXT PRIMARY KEY,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tickets(channel_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,ticket_id TEXT NOT NULL,opener_id TEXT,state TEXT NOT NULL,minecraft_name TEXT,discord_name TEXT,channel_name TEXT,payload TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS tickets_id ON tickets(ticket_id);
      CREATE INDEX IF NOT EXISTS tickets_owner ON tickets(guild_id,opener_id,state);
      CREATE TABLE IF NOT EXISTS transcripts(message_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,log_channel_id TEXT NOT NULL,ticket_id TEXT,source_channel_id TEXT,opener_id TEXT,minecraft_name TEXT,discord_name TEXT,channel_name TEXT,created_at INTEGER,tag TEXT NOT NULL,deleted_at INTEGER,payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS transcripts_owner ON transcripts(guild_id,opener_id);
      CREATE INDEX IF NOT EXISTS transcripts_ticket ON transcripts(guild_id,ticket_id);
      CREATE INDEX IF NOT EXISTS transcripts_log ON transcripts(guild_id,log_channel_id);
      CREATE TABLE IF NOT EXISTS user_names(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(guild_id,user_id,name));
      CREATE INDEX IF NOT EXISTS names_lookup ON user_names(guild_id,name,user_id);
      CREATE TABLE IF NOT EXISTS log_sync(guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,newest_id TEXT,oldest_cursor TEXT,backfill_complete INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,channel_id));
      CREATE TABLE IF NOT EXISTS ticket_events(id INTEGER PRIMARY KEY,guild_id TEXT,channel_id TEXT,at INTEGER NOT NULL,event TEXT NOT NULL,payload TEXT NOT NULL);
    `);
    if (db.prepare('SELECT version FROM schema_version').get().version !== 1) { db.close(); throw new Error('Versione database non supportata: conserva il DB e aggiorna il bot.'); }
    await chmod(databasePath, 0o600);
    ticketDb = db;
    return db;
  })();
  return databaseOpening;
}
function dbTransaction(work) {
  ticketDb.exec('BEGIN IMMEDIATE');
  try { const value = work(); ticketDb.exec('COMMIT'); return value; }
  catch (error) { ticketDb.exec('ROLLBACK'); throw error; }
}
function storageKey(path) {
  const names = ['ticket-config.json','ticket-stats.json','ticket-reminders.json','ticket-registry.json'];
  return names.find(name => path === resolve(dataDir, name));
}
function dbRememberName(guildId, userId, name) {
  if (userId && name) ticketDb.prepare('INSERT OR IGNORE INTO user_names VALUES(?,?,?)').run(guildId, userId, normalizedTicketSearch(name));
}
function persistTicket(row) {
  const existed=ticketDb.prepare('SELECT 1 FROM tickets WHERE channel_id=?').get(row.channelId);
  const meta = row.closureReport?.meta;
  const mc = row.minecraftName ?? meta?.minecraftName ?? '';
  const discordName = row.discordName ?? meta?.discordName ?? '';
  ticketDb.prepare(`INSERT INTO tickets VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(channel_id) DO UPDATE SET guild_id=excluded.guild_id,ticket_id=excluded.ticket_id,opener_id=excluded.opener_id,state=excluded.state,minecraft_name=excluded.minecraft_name,discord_name=excluded.discord_name,channel_name=excluded.channel_name,payload=excluded.payload`).run(row.channelId,row.guildId,row.id,row.openerId??'',row.state??'open',mc,discordName,row.channelName??'',JSON.stringify(row));
  if(!existed)auditTicketEvent(row.guildId,row.channelId,'registered',{ticketId:row.id});
  dbRememberName(row.guildId,row.openerId,discordName);
  dbRememberName(row.guildId,row.openerId,meta?.opener?.name);
}
function persistTranscript(row) {
  if (!row.messageId || !row.guildId || !row.channelId) return;
  ticketDb.prepare(`INSERT INTO transcripts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(message_id) DO UPDATE SET log_channel_id=excluded.log_channel_id,ticket_id=excluded.ticket_id,source_channel_id=excluded.source_channel_id,opener_id=excluded.opener_id,minecraft_name=excluded.minecraft_name,discord_name=excluded.discord_name,channel_name=excluded.channel_name,tag=excluded.tag,deleted_at=excluded.deleted_at,payload=excluded.payload`).run(row.messageId,row.guildId,row.channelId,row.ticketId??'',row.sourceChannelId??'',row.openerId??'',row.minecraftName??'',row.discordName??'',row.channelName??'',row.createdAt??row.closedAt??Date.now(),row.tag??'native',row.deletedAt??null,JSON.stringify(row));
  dbRememberName(row.guildId,row.openerId,row.discordName);
}
function readRegistryDatabase() {
  return { version: 1, tickets: Object.fromEntries(ticketDb.prepare('SELECT channel_id,payload FROM tickets').all().map(row=>[row.channel_id,JSON.parse(row.payload)])), reserved: Object.fromEntries(ticketDb.prepare('SELECT id,created_at FROM reserved_ids').all().map(row=>[row.id,row.created_at])), archives: ticketDb.prepare('SELECT payload FROM transcripts').all().map(row=>JSON.parse(row.payload)) };
}
function persistRegistryDatabase(value) {
  const oldTickets = new Map(ticketDb.prepare('SELECT channel_id,payload FROM tickets').all().map(row=>[row.channel_id,row.payload]));
  const oldArchives = new Map(ticketDb.prepare('SELECT message_id,payload FROM transcripts').all().map(row=>[row.message_id,row.payload]));
  dbTransaction(() => {
    for (const row of Object.values(value.tickets)) if (oldTickets.get(row.channelId)!==JSON.stringify(row)) persistTicket(row);
    for (const row of value.archives) if (oldArchives.get(row.messageId)!==JSON.stringify(row)) persistTranscript(row);
    const reserve = ticketDb.prepare('INSERT OR IGNORE INTO reserved_ids VALUES(?,?)');
    for (const [id,time] of Object.entries(value.reserved)) reserve.run(id,time);
  });
}
async function databaseReadLegacy(path, fallback) {
  await openTicketDatabase();
  const key = storageKey(path);
  if (!key) return null;
  const imported = ticketDb.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (key==='ticket-registry.json' && imported) return readRegistryDatabase();
  if (imported) return JSON.parse(imported.value);
  let value;
  try { value=JSON.parse(await readFile(path,'utf8')); }
  catch(error) { if(error.code!=='ENOENT') throw new Error(`Migrazione interrotta: ${path}: ${error.message}. Il file originale non è stato modificato.`); value=structuredClone(fallback); }
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error(`Formato dati non valido: ${path}`);
  if(key==='ticket-registry.json') {
    if(value.version!==1 || !value.tickets || !value.reserved || !Array.isArray(value.archives)) throw new Error('Registro precedente non valido: migrazione interrotta.');
    // Old JSON archives get an explicit provenance tag, never overwrite native rows.
    for(const archive of value.archives) archive.tag ??= 'legacy_json';
    persistRegistryDatabase(value);
    ticketDb.prepare('INSERT OR IGNORE INTO settings VALUES(?,?)').run(key,'{"migrated":true}');
    return readRegistryDatabase();
  }
  ticketDb.prepare('INSERT OR IGNORE INTO settings VALUES(?,?)').run(key,JSON.stringify(value));
  return value;
}
function auditTicketEvent(guildId, channelId, event, payload={}) {
  ticketDb.prepare('INSERT INTO ticket_events(guild_id,channel_id,at,event,payload) VALUES(?,?,?,?,?)').run(guildId,channelId,Date.now(),event,JSON.stringify(payload));
}
function sqliteSearch(guildId, query, selectedUserId, kind) {
  const table=kind==='open'?'tickets':'transcripts';
  const names=kind==='open'?'t.discord_name':'t.discord_name';
  const identityId=/^<@!?(\d{15,25})>$/.exec(query)?.[1]??(/^\d{15,25}$/.test(query)?query:null);
  const clauses=['t.guild_id=?'];const args=[guildId];
  if(kind==='open') clauses.push("t.state NOT IN ('closed','closing')");else clauses.push('t.deleted_at IS NULL');
  if(selectedUserId){clauses.push('t.opener_id=?');args.push(selectedUserId);}
  if(identityId){clauses.push('t.opener_id=?');args.push(identityId);}
  else {
    const like='%'+query.replace(/[\\%_]/g,'\\$&')+'%';
    clauses.push(`(lower(t.ticket_id)=? OR lower(t.minecraft_name) LIKE ? ESCAPE '\\' OR lower(${names}) LIKE ? ESCAPE '\\' OR lower(t.channel_name) LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM user_names n WHERE n.guild_id=t.guild_id AND n.user_id=t.opener_id AND n.name LIKE ? ESCAPE '\\'))`);
    args.push(query,like,like,like,like);
  }
  return ticketDb.prepare(`SELECT t.payload FROM ${table} t WHERE ${clauses.join(' AND ')} ORDER BY ${kind==='open'?'t.rowid':'t.created_at'} DESC`).all(...args).map(row=>JSON.parse(row.payload));
}

var configPath = resolve(dataDir, "ticket-config.json");
var defaultConfig = () => ({
  categories: {
    minecraft: {},
    account: {},
    report: {},
    appeal: {},
    store: {},
    discord: {}
  }
});
var configs = /* @__PURE__ */ new Map();
var configSnapshots = new WeakMap();
// Each data file is written atomically. Corrupt or unreadable data stops the
// operation instead of silently replacing existing configuration or statistics.
var fileQueues = new Map();
async function readJson(path, fallback = {}) {
  if (storageKey(path)) return databaseReadLegacy(path, fallback);
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Oggetto JSON atteso');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(fallback);
    throw new Error(`Dati non leggibili in ${path}: ${error.message}. Ripristina il backup prima di continuare.`);
  }
}
function serializeFile(path, work) {
  const next = (fileQueues.get(path) ?? Promise.resolve()).catch(() => {}).then(work);
  fileQueues.set(path, next);
  next.finally(() => { if (fileQueues.get(path) === next) fileQueues.delete(path); }).catch(() => {});
  return next;
}
async function atomicJson(path, value) {
  if (storageKey(path)) {
    await openTicketDatabase();
    if (storageKey(path)==='ticket-registry.json') persistRegistryDatabase(value);
    else ticketDb.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(storageKey(path),JSON.stringify(value));
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  // Validate the previous file before preserving it as the last good backup.
  try { await readJson(path); await copyFile(path, path + '.bak'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(temp, path);
}
async function loadConfig(guildId) {
  if (!configs.has(guildId)) {
    const all = await readJson(configPath);
    const saved = all[guildId] ?? {};
    const config = { ...defaultConfig(), ...saved, categories: { ...defaultConfig().categories, ...saved.categories } };
    delete config.botAdminUserId;
    configs.set(guildId, config);
  }
  const copy = structuredClone(configs.get(guildId));
  configSnapshots.set(copy, structuredClone(copy));
  return copy;
}
async function saveConfig(guildId, config) {
  const snapshot = structuredClone(config);
  const original = configSnapshots.get(config);
  delete snapshot.botAdminUserId;
  await serializeFile(configPath, async () => {
    const all = await readJson(configPath);
    // Personal administrative grants are never preserved, for any guild.
    for (const value of Object.values(all)) delete value.botAdminUserId;
    // Apply only changes made since this caller read the configuration, so a
    // concurrent /pending or /setup cannot erase an unrelated setting.
    const mergeChanges = (before, after, latest) => {
      if (!before || typeof before !== 'object' || Array.isArray(before) || !after || typeof after !== 'object' || Array.isArray(after)) return structuredClone(after);
      const result = { ...(latest ?? {}) };
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
        if (!Object.hasOwn(after, key)) delete result[key];
        else result[key] = mergeChanges(before[key], after[key], result[key]);
      }
      return result;
    };
    all[guildId] = original ? mergeChanges(original, snapshot, all[guildId] ?? defaultConfig()) : snapshot;
    delete all[guildId].botAdminUserId;
    await atomicJson(configPath, all);
    configs.set(guildId, all[guildId]);
    configSnapshots.set(config, structuredClone(snapshot));
  });
}

// Stable ticket IDs are reserved before creating a channel, never reused, and
// stored independently of nicknames, renames and channel/category changes.
var registryPath = resolve(dataDir, 'ticket-registry.json');
var registry;
var registryLoad;
async function loadRegistry() {
  if (registry) return registry;
  registryLoad ??= readJson(registryPath, { version: 1, tickets: {}, reserved: {}, archives: [] }).then(value => {
    if (value.version !== 1 || !value.tickets || !value.reserved || !Array.isArray(value.archives)) throw new Error('Registro ticket non valido');
    return registry = value;
  });
  return registryLoad;
}
async function updateRegistry(change) {
  return serializeFile(registryPath, async () => {
    const next = structuredClone(await loadRegistry());
    const result = await change(next);
    await atomicJson(registryPath, next);
    registry = next;
    return result;
  });
}
var TICKET_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function allocateTicketId(state, pick = randomInt) {
  for (let attempt = 0; attempt < 10000; attempt++) {
    let id = '';
    for (let i = 0; i < 6; i++) id += TICKET_ID_ALPHABET[pick(TICKET_ID_ALPHABET.length)];
    if (!Object.hasOwn(state.reserved, id)) { state.reserved[id] = Date.now(); return id; }
  }
  throw new Error('Impossibile riservare un ID ticket univoco.');
}
async function reserveTicketId() { return updateRegistry(state => allocateTicketId(state)); }
function ticketTypeForChannel(channel) {
  if (!channel?.guild || channel.type !== import_discord4.ChannelType.GuildText) return undefined;
  const saved = registry?.tickets[channel.id];
  if (saved && saved.guildId === channel.guild.id && ticketTypes.includes(saved.type) && saved.state !== 'closed') return saved.type;
  // Compatibility for tickets created by the previous version: require both
  // metadata fields, never infer a destructive action from a channel name.
  const type = ticketTopicValue(channel, 'type');
  const owner = ticketTopicValue(channel, 'opener');
  return ticketTypes.includes(type) && /^\d{15,25}$/.test(owner) && !saved ? type : undefined;
}
async function ensureTicketRegistered(channel) {
  await loadRegistry();
  const type = ticketTypeForChannel(channel);
  if (!type) throw new Error('Questo canale non è un ticket registrato.');
  if (registry.tickets[channel.id]) return structuredClone(registry.tickets[channel.id]);
  const record = await updateRegistry(state => {
    if (state.tickets[channel.id]) return structuredClone(state.tickets[channel.id]);
    const requested = ticketTopicValue(channel, 'ticket_id').toUpperCase();
    const reusable = /^[A-Z0-9]{6}$/.test(requested) && !Object.values(state.tickets).some(item => item.id === requested);
    const id = reusable ? requested : allocateTicketId(state);
    state.reserved[id] ??= Date.now();
    const entry = { id, channelId: channel.id, guildId: channel.guild.id, type, openerId: ticketTopicValue(channel, 'opener'), state: 'open', createdAt: channel.createdTimestamp ?? Date.now() };
    state.tickets[channel.id] = entry;
    return structuredClone(entry);
  });
  // The registry is authoritative if an existing topic cannot be updated.
  const topic = channel.topic ?? '';
  if (!ticketTopicValue(channel, 'ticket_id') && topic.length + 20 <= 1024) {
    await channel.setTopic(`${topic} | ticket_id:${record.id}`, 'Assegnazione ID ticket').catch(error => logger.warn({ channelId: channel.id, message: error.message }, 'ID salvato nel registro; topic non aggiornato'));
  }
  return record;
}
function ticketSetting(config, key, fallback) {
  const value = config[key];
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
var ticketOperations = new Set();
async function ticketOperation(channelId, work) {
  if (ticketOperations.has(channelId)) throw new Error('È già in corso un’operazione su questo ticket. Riprova tra poco.');
  ticketOperations.add(channelId);
  try { return await work(); } finally { ticketOperations.delete(channelId); }
}

// src/discord/catalog.ts
var import_discord = __toESM(require_src2(), 1);
var TICKET_CATALOG = {
  "minecraft": {
    "label": "Supporto Minecraft",
    "emoji": "minecraft",
    "description": "Apri un ticket per ricevere assistenza su:\n- :vexmon: Problemi generali del server Minecraft Vexmon",
    "slug": "supporto-minecraft",
    "color": 10980346
  },
  "account": {
    "label": "Assistenza account",
    "emoji": "account",
    "description": "Apri un ticket per ricevere assistenza su:\n- :domanda: Reimpostazione della password dimenticata\n- :redx: Disattivazione della modalità premium attivata per errore con /premium\n- :info: Problemi durante la registrazione",
    "slug": "account",
    "color": 10980346
  },
  "report": {
    "label": "Segnalazioni Minecraft",
    "emoji": "spada",
    "description": "Apri un ticket per:\n- :report: Segnalare un utente del server Minecraft\n- :minecraft: Segnalare un bug del server Minecraft",
    "slug": "segnalazione-bug",
    "color": 10980346
  },
  "store": {
    "label": "Assistenza store",
    "emoji": "store",
    "description": "Apri un ticket per ricevere assistenza su:\n- :soldi: Acquisti tramite gift card\n- :account: Migrazione di un account\n- :info: Domande o problemi relativi allo store",
    "slug": "supporto-store",
    "color": 10980346
  },
  "discord": {
    "label": "Assistenza e segnalazioni Discord",
    "emoji": "discord",
    "description": "Apri un ticket per:\n- :info: Fare una domanda o segnalare un problema del server Discord\n- :report: Segnalare un utente del server Discord\n- :discord: Segnalare un bug del server Discord",
    "slug": "supporto-discord",
    "color": 10980346
  },
  "appeal": {
    "label": "Appello per ban o mute",
    "emoji": "ban",
    "description": "Ritieni di aver ricevuto un ban o un mute ingiustamente?\nApri un ticket per richiedere una revisione della sanzione e attendi la risposta dello staff.",
    "slug": "appello-sanzione",
    "color": 10980346
  }
};
var ticketTypes = ["minecraft", "account", "report", "store", "discord", "appeal"];
var TICKET_SUBCATEGORIES = {
  minecraft: [
    { value: "vexmon", label: "Assistenza generale Vexmon", slug: "vexmon", emoji: "vexmon", fields: [
      { id: "minecraft_name", label: "Nickname Minecraft", style: import_discord.TextInputStyle.Short, placeholder: "Ad esempio: Steve123" },
      { id: "problem", label: "Descrivi il problema", style: import_discord.TextInputStyle.Paragraph, placeholder: "Descrivi il problema e indica da quando si verifica." },
      { id: "proof", label: "Prove (facoltative)", style: import_discord.TextInputStyle.Paragraph, required: false, placeholder: "Screenshot, video o link, se disponibili" }
    ] }
  ],
  account: [
    { value: "reset-password", label: "Reimpostazione della password", slug: "reset-password", emoji: "domanda", fields: [
      { id: "minecraft_name", label: "Nickname Minecraft", style: import_discord.TextInputStyle.Short, placeholder: "Ad esempio: Steve123" },
      { id: "ip_address", label: "Indirizzo IP", style: import_discord.TextInputStyle.Short, placeholder: "Il tuo indirizzo IP attuale" },
      { id: "premium", label: "Hai un account premium?", style: import_discord.TextInputStyle.Short, placeholder: "Sì oppure no" },
      { id: "last_server_login", label: "Quando hai effettuato l’ultimo accesso?", style: import_discord.TextInputStyle.Short, placeholder: "Al server: indica data e ora approssimative. Se non le ricordi, scrivilo." },
      { id: "gameplay_screenshots", label: "Hai screenshot delle tue sessioni di gioco?", style: import_discord.TextInputStyle.Paragraph, placeholder: "Sul server: sì/no. Se disponibili, inserisci un link o allegali nel ticket dopo l’apertura." }
    ] },
    { value: "remove-premium", label: "Disattivazione della modalità premium", slug: "rimozione-premium", emoji: "redx", fields: [
      { id: "minecraft_name", label: "Nickname Minecraft", style: import_discord.TextInputStyle.Short, placeholder: "Ad esempio: Steve123" },
      { id: "ip_address", label: "Indirizzo IP", style: import_discord.TextInputStyle.Short, placeholder: "Il tuo indirizzo IP attuale" },
      { id: "removal_reason", label: "Perché vuoi disattivare la modalità premium?", style: import_discord.TextInputStyle.Paragraph, placeholder: "Spiega il motivo della tua richiesta." }
    ] },
    { value: "registration", label: "Assistenza per la registrazione", slug: "registrazione", emoji: "info", fields: [
      { id: "minecraft_name", label: "Nickname Minecraft", style: import_discord.TextInputStyle.Short, placeholder: "Ad esempio: Steve123" },
      { id: "registration_problem", label: "Descrivi il problema", style: import_discord.TextInputStyle.Paragraph, placeholder: "Cosa succede quando provi a registrarti?" }
    ] }
  ],
  report: [
    { value: "user-report", label: "Segnalazione di un utente", slug: "segnalazione-utente", emoji: "report", fields: [
      { id: "minecraft_name", label: "Il tuo nickname Minecraft", style: import_discord.TextInputStyle.Short, placeholder: "Ad esempio: Steve123" },
      { id: "reported_player", label: "Nickname del giocatore segnalato", style: import_discord.TextInputStyle.Short, placeholder: "Inserisci il nickname del giocatore che vuoi segnalare." },
      { id: "proof", label: "Prove", style: import_discord.TextInputStyle.Paragraph, placeholder: "Inserisci link a screenshot o video e descrivi i fatti." },
      { id: "additional_info", label: "Informazioni aggiuntive (facoltative)", style: import_discord.TextInputStyle.Paragraph, required: false, placeholder: "Aggiungi eventuali dettagli utili alla richiesta." }
    ] },
    { value: "bug-report", label: "Segnalazione di un bug", slug: "segnalazione-bug", emoji: "minecraft", fields: [
      { id: "minecraft_name", label: "Nickname Minecraft", style: import_discord.TextInputStyle.Short, placeholder: "Ad esempio: Steve123" },
      { id: "bug", label: "Descrivi il bug", style: import_discord.TextInputStyle.Paragraph, placeholder: "Descrivi cosa accade e quale comportamento ti aspettavi." },
      { id: "proof", label: "Prove (facoltative)", style: import_discord.TextInputStyle.Paragraph, required: false, placeholder: "Screenshot o video, se disponibili" }
    ] }
  ],
  store: [
    { value: "gift-card", label: "Acquisto tramite gift card", slug: "gift-card", emoji: "soldi", fields: [
      { id: "minecraft_name", label: "Nickname Minecraft", style: import_discord.TextInputStyle.Short, placeholder: "Ad esempio: Steve123" },
      { id: "gift_card_type", label: "Tipo di gift card", style: import_discord.TextInputStyle.Short, placeholder: "Ad esempio: Amazon, Google Play" },
      { id: "package", label: "Pacchetto da acquistare", style: import_discord.TextInputStyle.Short, placeholder: "Indica il nome del pacchetto o del prodotto." }
    ] },
    { value: "account-migration", label: "Migrazione di un account", slug: "migrazione-account", emoji: "account", fields: [
      { id: "old_account", label: "Nickname Minecraft attuale", style: import_discord.TextInputStyle.Short, placeholder: "Inserisci il nickname dell'account di origine." },
      { id: "new_account", label: "Nuovo nickname Minecraft", style: import_discord.TextInputStyle.Short, placeholder: "Inserisci il nickname dell'account di destinazione." },
      { id: "migration_purchased", label: "Hai acquistato la migrazione?", style: import_discord.TextInputStyle.Short, placeholder: "Sì oppure no" }
    ] },
    { value: "store-question", label: "Domande sullo store", slug: "domande-store", emoji: "info", fields: [
      { id: "store_question", label: "La tua domanda", style: import_discord.TextInputStyle.Paragraph, placeholder: "Scrivi la tua domanda o descrivi il problema." },
      { id: "proof", label: "Prove (facoltative)", style: import_discord.TextInputStyle.Paragraph, required: false, placeholder: "Inserisci eventuali link a screenshot o ricevute." }
    ] }
  ],
  discord: [
    { value: "discord-question", label: "Domande sul server Discord", slug: "domande-discord", emoji: "info", fields: [
      { id: "discord_question", label: "La tua domanda", style: import_discord.TextInputStyle.Paragraph, placeholder: "Scrivi la tua domanda o descrivi il problema." },
      { id: "additional_info", label: "Informazioni aggiuntive (facoltative)", style: import_discord.TextInputStyle.Paragraph, required: false, placeholder: "Aggiungi eventuali dettagli utili alla richiesta." }
    ] },
    { value: "discord-user-report", label: "Segnalazione di un utente Discord", slug: "segnalazione-utente", emoji: "report", fields: [
      { id: "reported_user", label: "Utente segnalato", style: import_discord.TextInputStyle.Short, placeholder: "Indica il nome utente, la menzione o l’ID Discord." },
      { id: "infraction", label: "Quale comportamento vuoi segnalare?", style: import_discord.TextInputStyle.Paragraph, placeholder: "Descrivi i fatti e indica quando sono avvenuti." },
      { id: "proof", label: "Prove", style: import_discord.TextInputStyle.Paragraph, placeholder: "Inserisci link a screenshot o ai messaggi segnalati." }
    ] },
    { value: "discord-bug-report", label: "Segnalazione di un bug Discord", slug: "segnalazione-bug", emoji: "discord", fields: [
      { id: "bug", label: "Descrivi il bug", style: import_discord.TextInputStyle.Paragraph, placeholder: "Descrivi cosa accade e quale comportamento ti aspettavi." },
      { id: "proof", label: "Prove (facoltative)", style: import_discord.TextInputStyle.Paragraph, required: false, placeholder: "Screenshot o video, se disponibili" }
    ] }
  ]
};
var APPEAL_SUBCATEGORY = {
  value: "appeal",
  label: "Appello per ban o mute",
  slug: "appello",
  emoji: "ban",
  fields: [
    { id: "ban_reason", label: "Perch\xE9 dovremmo revocare la sanzione?", style: import_discord.TextInputStyle.Paragraph, placeholder: "Spiega perché chiedi una revisione della sanzione." },
    { id: "proof", label: "Prove (facoltative)", style: import_discord.TextInputStyle.Paragraph, required: false, placeholder: "Screenshot o altro materiale a tuo favore" }
  ]
};
for (const type of ticketTypes.filter((t) => t !== "discord")) {
  const forms = type === "appeal" ? [APPEAL_SUBCATEGORY] : TICKET_SUBCATEGORIES[type];
  for (const form of forms) {
    if (!form.fields.some((f) => f.id === "minecraft_name" || f.id === "old_account")) {
      form.fields.unshift({ id: "minecraft_name", label: "Nickname Minecraft", style: import_discord.TextInputStyle.Short, placeholder: "Inserisci il tuo nickname in Minecraft.", required: true });
    }
  }
}
// Ordine di ricerca delle emoji: 1) emoji del SERVER (quelle già caricate, come nella 1.2),
// 2) emoji dell'APPLICAZIONE. Se non esiste da nessuna parte l'emoji viene omessa (nessun fallback Unicode).
const EMOJI_ALIASES = { search: ['955026animatedsearchlm', 'search'], soldi: ['money', 'soldi'], money: ['money', 'soldi'] };
function findGuildEmoji(guild, name) {
  const cache = guild?.emojis?.cache;
  if (!cache?.size) return undefined;
  const saved = configs.get(guild.id)?.emojiReplacements?.[name]?.id;
  if (saved && cache.has(saved)) return cache.get(saved);
  const numbered = /^(.+)~(\d+)$/.exec(name);
  if (numbered) {
    // "report~1" = seconda emoji con lo stesso nome (ordine di creazione) oppure "report_1".
    const base = numbered[1], nth = Number(numbered[2]);
    const exact = cache.find(emoji => emoji.name === name || emoji.name === `${base}_${nth}`);
    if (exact) return exact;
    const same = [...cache.filter(emoji => emoji.name === base).values()].sort((x, y) => BigInt(x.id) < BigInt(y.id) ? -1 : 1);
    return same[nth] ?? same[0];
  }
  for (const candidate of EMOJI_ALIASES[name] ?? [name]) {
    const found = cache.find(emoji => emoji.name === candidate);
    if (found) return found;
  }
  return undefined;
}
function findApplicationEmoji(guild, name) {
  const emojis = guild?.client?.application?.emojis?.cache ?? client?.application?.emojis?.cache;
  if (!emojis?.size) return undefined;
  const normalized = name.replace(/~(\d+)$/, '_$1');
  for (const candidate of EMOJI_ALIASES[normalized] ?? [normalized, name]) {
    const found = emojis.find(emoji => emoji.name === candidate);
    if (found) return found;
  }
  return undefined;
}
function findEmoji(guild, name) {
  return findGuildEmoji(guild, name) ?? findApplicationEmoji(guild, name);
}
function customEmoji(guild, name) {
  return findEmoji(guild, name)?.toString() ?? '';
}
function emojiOption(guild, name) {
  const emoji = findEmoji(guild, name);
  return emoji ? { id: emoji.id, name: emoji.name ?? name, animated: Boolean(emoji.animated) } : undefined;
}
function withEmoji(builder, emoji) { return emoji ? builder.setEmoji(emoji) : builder; }
function tidy(text) { return String(text).replace(/^(#{1,3} |-# )[ \t]+/gm, '$1').replace(/^ (?=\S)/gm, ''); }

// src/discord/format.ts
var import_discord2 = __toESM(require_src2(), 1);

// src/discord/stats.ts
import { mkdir as mkdir2, readFile as readFile2, writeFile as writeFile2 } from "node:fs/promises";
import { resolve as resolve2 } from "node:path";
var statsPath = resolve2(dataDir, "ticket-stats.json");
async function recordTicket(guildId, record) {
  await serializeFile(statsPath, async () => {
    const all = await readJson(statsPath);
    const list = all[guildId] ?? [];
    if (!Array.isArray(list)) throw new Error('Statistiche non valide');
    const index = list.findIndex(item => item.channelId === record.channelId);
    if (index >= 0) list[index] = record; else list.push(record);
    all[guildId] = list;
    await atomicJson(statsPath, all);
  });
}
async function getRecords(guildId, sinceMs) {
  const list = (await readJson(statsPath))[guildId] ?? [];
  if (!Array.isArray(list)) throw new Error('Statistiche non valide');
  return sinceMs === undefined ? list : list.filter(record => record.closedAt >= sinceMs);
}

var average = (values) => values.length === 0 ? void 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
function summarize(records) {
  const entries = /* @__PURE__ */ new Map();
  const entryFor = (userId) => {
    let entry = entries.get(userId);
    if (!entry) {
      entry = { userId, handled: 0, messages: 0, closed: 0, firstResponses: 0, responseTimes: [] };
      entries.set(userId, entry);
    }
    return entry;
  };
  const byType = {};
  const responseTimes = [];
  let withStaffReply = 0;
  for (const record of records) {
    byType[record.type] = (byType[record.type] ?? 0) + 1;
    const staffIds = Object.keys(record.staff);
    if (staffIds.length > 0) withStaffReply++;
    for (const userId of staffIds) {
      const entry = entryFor(userId);
      entry.handled++;
      entry.messages += record.staff[userId] ?? 0;
    }
    if (record.closedBy) entryFor(record.closedBy).closed++;
    if (record.firstResponderId && record.firstResponseMs !== void 0) {
      const entry = entryFor(record.firstResponderId);
      entry.firstResponses++;
      entry.responseTimes.push(record.firstResponseMs);
      responseTimes.push(record.firstResponseMs);
    }
  }
  const leaderboard = [...entries.values()].map(({ responseTimes: times, ...entry }) => ({ ...entry, avgFirstResponseMs: average(times) })).filter((entry) => entry.handled > 0 || entry.closed > 0).sort((a, b) => b.handled - a.handled || b.messages - a.messages || b.closed - a.closed || (a.avgFirstResponseMs ?? Infinity) - (b.avgFirstResponseMs ?? Infinity));
  return {
    tickets: records.length,
    withStaffReply,
    avgFirstResponseMs: average(responseTimes),
    avgDurationMs: average(records.map((record) => record.closedAt - record.createdAt)),
    byType,
    leaderboard
  };
}
function formatDuration(ms) {
  if (ms === void 0 || !Number.isFinite(ms)) return "n/d";
  const minutes = Math.round(ms / 6e4);
  if (minutes < 1) return "meno di 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min`;
  const days = Math.floor(hours / 24);
  return `${days} g ${hours % 24} h`;
}

// src/discord/format.ts
var BRAND_COLOR = 10980346;
var BUTTON_ONLY_TYPES = /* @__PURE__ */ new Set(["minecraft", "appeal"]);
function uiEmoji(guild, name) {
  return guild ? customEmoji(guild, name) : '';
}
function uiText(container, content) {
  return container.addTextDisplayComponents(new import_discord2.TextDisplayBuilder().setContent(tidy(content)));
}
function uiSeparator(container, large = false) {
  return container.addSeparatorComponents(s => s.setDivider(true).setSpacing(large ? import_discord2.SeparatorSpacingSize.Large : import_discord2.SeparatorSpacingSize.Small));
}
function uiLine(guild, label, value) {
  return `**${label}** ${value}`;
}
function commandCard(guild, title, sections, { icon = 'ticket', color = BRAND_COLOR, footer = 'VEXMON • Assistenza' } = {}) {
  const container = new import_discord2.ContainerBuilder().setAccentColor(color);
  uiText(container, `## ${uiEmoji(guild, icon)} **${title}**`);
  for (const section of sections.filter(Boolean)) {
    uiSeparator(container);
    uiText(container, section);
  }
  if (footer) { uiSeparator(container); uiText(container, `-# ${uiEmoji(guild, 'info')} ${footer}`); }
  return container;
}
function commandNotice(guild, text, accentColor = BRAND_COLOR) {
  const lines = text.trim().split('\n');
  const isHeading = /^#{1,3}\s/.test(lines[0]);
  const denied = /^(Solo |Non posso |Impossibile |Operazione non completata|Si è verificato|Questa categoria non|La selezione non|Invio .*non completato|Aggiornamento .*non completato)/i.test(text);
  const success = /salvat|aggiornat|inviat|creato|spostato|rinominato|aggiunto|rimosso|taggato/i.test(lines[0]);
  let title = denied ? 'Operazione non disponibile' : success ? 'Operazione completata' : 'Informazioni sul ticket';
  if (isHeading || (lines.length > 1 && lines[0].length < 100 && !denied)) {
    title = lines.shift().replace(/^#{1,3}\s*/, '').replace(/<a?:\w+:\d+>|:[a-z_]+:/g, '').replace(/\*\*/g, '').trim();
  }
  const body = lines.join('\n').trim() || text;
  const sections = body.split(/\n\s*\n/).map(part => part);
  return commandCard(guild, title, sections, { icon: denied ? 'redx' : success ? 'spunta' : 'ticket', color: accentColor });
}
function transcriptContainer(guild, meta, messageCount, htmlName) {
  const staff = meta.staff.length ? meta.staff.map(s => `<@${s.id}> (${s.messages} msg)`).join(', ') : 'Nessuno';
  const card = commandCard(guild, 'Trascrizione del ticket', [
    [uiLine(guild, 'ID ticket', `\`${meta.ticketId}\``), uiLine(guild, 'Canale', `#${meta.channelName}`), uiLine(guild, 'Categoria', meta.categoryLabel)].join('\n'),
    [uiLine(guild, 'Aperto da', meta.opener ? `<@${meta.opener.id}>` : 'Sconosciuto'), uiLine(guild, 'Chiuso da', meta.closedBy ? `<@${meta.closedBy.id}>` : 'Non disponibile'), meta.discordName ? uiLine(guild, 'Nome Discord', meta.discordName.replace(/\s+/g, ' ').slice(0, 100)) : '', meta.minecraftName ? uiLine(guild, 'Nickname Minecraft', meta.minecraftName.replace(/\s+/g, ' ').slice(0, 100)) : ''].filter(Boolean).join('\n'),
    [uiLine(guild, 'Durata', formatDuration(meta.closedAt - meta.createdAt)), uiLine(guild, 'Messaggi', String(messageCount)), uiLine(guild, 'Staff intervenuto', staff), ...(meta.truncated ? ['-# Cronologia parziale: esportati i messaggi più recenti.'] : [])].join('\n')
  ], { footer: 'Apri il file HTML nel browser per consultare la conversazione e le risposte al modulo.' });
  return card.addFileComponents(new import_discord2.FileBuilder().setURL(`attachment://${htmlName}`));
}
function ticketStatsContainer(guild, summary, periodLabel, focusUserId) {
  const sections = [[uiLine(guild, 'Periodo', periodLabel), uiLine(guild, 'Ticket chiusi', String(summary.tickets)), uiLine(guild, 'Con risposta dello staff', String(summary.withStaffReply)), uiLine(guild, 'Tempo medio di prima risposta', formatDuration(summary.avgFirstResponseMs)), uiLine(guild, 'Durata media', formatDuration(summary.avgDurationMs))].join('\n')];
  if (!summary.tickets) sections.push(`${uiEmoji(guild, 'freccia')} Nessun ticket registrato in questo periodo. Le statistiche vengono salvate alla chiusura.`);
  else if (focusUserId) {
    const index = summary.leaderboard.findIndex(e => e.userId === focusUserId);
    const entry = summary.leaderboard[index];
    sections.push(entry ? [`### ${uiEmoji(guild, 'account')} <@${focusUserId}>`, uiLine(guild, 'Posizione', `#${index + 1} su ${summary.leaderboard.length}`), uiLine(guild, 'Ticket gestiti', String(entry.handled)), uiLine(guild, 'Messaggi', String(entry.messages)), uiLine(guild, 'Ticket chiusi', String(entry.closed)), uiLine(guild, 'Prime risposte', String(entry.firstResponses)), uiLine(guild, 'Tempo medio di risposta', formatDuration(entry.avgFirstResponseMs))].join('\n') : `${uiEmoji(guild, 'freccia')} <@${focusUserId}> non ha gestito ticket in questo periodo.`);
  } else {
    const board = summary.leaderboard.slice(0, 10).map((e, i) => `**${i + 1}.** <@${e.userId}> — **${e.handled}** ticket · ${e.messages} msg\n-# Chiusi: ${e.closed} · Tempo medio di risposta: ${formatDuration(e.avgFirstResponseMs)}`).join('\n');
    sections.push(`### ${uiEmoji(guild, 'account')} Classifica dello staff\n${board || 'Nessuna risposta dello staff nel periodo selezionato.'}`);
    const categories = ticketTypes.filter(t => summary.byType[t] > 0).map(t => uiLine(guild, TICKET_CATALOG[t].label, String(summary.byType[t]))).join('\n');
    if (categories) sections.push(`### ${uiEmoji(guild, 'ticket')} Per categoria\n${categories}`);
  }
  return commandCard(guild, 'Statistiche dello staff', sections, { footer: 'Classifica ordinata per numero di ticket gestiti e, a parità, per numero di messaggi.' });
}

function ticketPanel(guild) {
  const container = new import_discord2.ContainerBuilder().setAccentColor(BRAND_COLOR).addSectionComponents(
    new import_discord2.SectionBuilder().addTextDisplayComponents(new import_discord2.TextDisplayBuilder().setContent(tidy(
      `# ${customEmoji(guild, "ticket")} **Apri un ticket**

Apri un ticket per ricevere **assistenza rapida** dal nostro staff. Scegli qui sotto la categoria pi\xF9 adatta alla tua richiesta.`
    ))).setThumbnailAccessory(
      new import_discord2.ThumbnailBuilder().setURL("attachment://vexmon-logo.webp").setDescription("Vexmon")
    )
  ).addSeparatorComponents((separator) => separator.setSpacing(import_discord2.SeparatorSpacingSize.Small));
  for (const type of ticketTypes) {
    const item = TICKET_CATALOG[type];
    const description = item.description.replace(/:([a-z0-9_-]+):/g, (_match, name) => customEmoji(guild, name));
    const text = `## ${customEmoji(guild, item.emoji)} **${item.label}**

${description}`;
    const button = new import_discord2.ButtonBuilder().setCustomId(BUTTON_ONLY_TYPES.has(type) ? `ticket:create:${type}` : `ticket:choose:${type}`).setLabel(BUTTON_ONLY_TYPES.has(type) ? "Apri un ticket" : "Scegli il tipo").setStyle(BUTTON_ONLY_TYPES.has(type) ? import_discord2.ButtonStyle.Primary : import_discord2.ButtonStyle.Secondary);
    withEmoji(button, emojiOption(guild, item.emoji));
    container.addSectionComponents(
      new import_discord2.SectionBuilder().addTextDisplayComponents(new import_discord2.TextDisplayBuilder().setContent(tidy(text))).setButtonAccessory(button)
    );
    container.addSeparatorComponents((separator) => separator.setSpacing(import_discord2.SeparatorSpacingSize.Small));
  }
  return container.addActionRowComponents(new import_discord2.ActionRowBuilder().addComponents(
    withEmoji(new import_discord2.ButtonBuilder().setLabel("Il mio IP").setStyle(import_discord2.ButtonStyle.Link).setURL("https://whatismyipaddress.com/"), emojiOption(guild, "freccia")),
    withEmoji(new import_discord2.ButtonBuilder().setCustomId("ticket:help").setLabel("Come funziona?").setStyle(import_discord2.ButtonStyle.Secondary), emojiOption(guild, "info"))
  )).addMediaGalleryComponents(
    new import_discord2.MediaGalleryBuilder().addItems(
      new import_discord2.MediaGalleryItemBuilder().setURL("attachment://tickets.png").setDescription("TICKETS")
    )
  );
}
function ticketTypePicker(guild, type) {
  const item = TICKET_CATALOG[type];
  const subcategories = TICKET_SUBCATEGORIES[type];
  const container = commandNotice(guild, 
    `# ${customEmoji(guild, item.emoji)} **${item.label}: scegli la richiesta**

Seleziona il motivo della richiesta per compilare il modulo e aprire un ticket.`
  );
  container.addActionRowComponents(
    new import_discord2.ActionRowBuilder().addComponents(
      new import_discord2.StringSelectMenuBuilder().setCustomId(`ticket:subcategory:${type}`).setPlaceholder("Seleziona il motivo della richiesta").addOptions(subcategories.map((subcategory) => ({
        label: subcategory.label,
        value: subcategory.value,
        ...(emojiOption(guild, subcategory.emoji) ? { emoji: emojiOption(guild, subcategory.emoji) } : {})
      })))
    )
  );
  return container;
}
function ticketWelcome(guild, type, user, subcategory, answers = {}, ticketId) {
  const item = TICKET_CATALOG[type];
  const sections = [`${uiEmoji(guild, 'freccia')} Ciao ${user}, il tuo ticket è stato **creato correttamente**.\n**ID ticket:** \`${ticketId}\`.`];
  if (subcategory) sections.push(`### ${uiEmoji(guild, subcategory.emoji || item.emoji)} ${subcategory.label}\n\n${subcategory.fields.map(field => `**${field.label}**\n${answers[field.id] || 'Non specificato'}`).join('\n\n')}`);
  return commandCard(guild, item.label, sections, { icon: item.emoji, color: item.color, footer: 'Attendi la risposta dello staff e aggiungi eventuali aggiornamenti in questo ticket.' });
}
function ticketClosed(guild) {
  return commandCard(guild, 'Ticket chiuso', [uiLine(guild, 'Trascrizione', 'Inviata allo staff.'), uiLine(guild, 'Canale', 'Verrà eliminato tra pochi secondi.')], { icon: 'spunta', footer: 'VEXMON • Assistenza conclusa' });
}
function ticketConfig(guild, config) {
  const sections = [[`### ${uiEmoji(guild, 'info')} Impostazioni generali`, uiLine(guild, 'Canale delle trascrizioni', config.transcriptChannelId ? `<#${config.transcriptChannelId}>` : 'Non impostato'), uiLine(guild, 'Ruolo degli amministratori', config.botAdminRoleId ? `<@&${config.botAdminRoleId}>` : 'Non impostato'), uiLine(guild, 'Ruolo statistiche', config.statsRoleId ? `<@&${config.statsRoleId}>` : 'Solo amministratori e gestori'), uiLine(guild, 'Inattività', `${ticketSetting(config, 'inactivityHours', 12)} ore + ${ticketSetting(config, 'closeAfterHours', 24)} ore per rispondere`), uiLine(guild, 'Conservazione trascrizioni', config.retentionDays ? `${config.retentionDays} giorni` : 'Senza cancellazione automatica')].join('\n')];
  for (const type of ticketTypes) {
    const item = TICKET_CATALOG[type], value = config.categories[type];
    sections.push([`### ${uiEmoji(guild, item.emoji)} ${item.label}`, uiLine(guild, 'Categoria', value.categoryId ? `<#${value.categoryId}>` : 'Non impostata'), uiLine(guild, 'Ruolo dello staff', value.roleId ? `<@&${value.roleId}>` : 'Non impostato')].join('\n'));
  }
  return commandCard(guild, 'Configurazione dei ticket', sections, { footer: 'Usa /setup per aggiornare canali e ruoli e /ticket-setup per impostare gli amministratori.' });
}
function ticketHelp(guild, inTicket = false) {
  const a = uiEmoji(guild, 'info');
  return commandCard(guild, "Come funziona l'assistenza", [
    `### ${a} 1. Scegli la categoria\nDal pannello scegli Minecraft, account, segnalazioni, store, Discord o appello per ban o mute. Seleziona la voce più vicina alla tua richiesta.`,
    `### ${a} 2. Seleziona la richiesta\nPremi **Scegli il tipo** e usa il menu. Minecraft e Appello per ban o mute aprono direttamente il modulo.`,
    `### ${a} 3. Compila il modulo\nInserisci il nickname richiesto, descrivi il problema e aggiungi le prove disponibili. **Non inviare password o codici di verifica.**`,
    `### ${a} 4. Continua nel ticket\n${inTicket ? 'Scrivi qui gli aggiornamenti e allega eventuali prove.' : 'Dopo il modulo si apre un canale privato: scrivi lì gli aggiornamenti e allega eventuali prove.'} Il ticket è visibile a te e allo staff autorizzato. Lo staff può usare /claim e /unclaim per la presa in carico e /search per cercare i ticket aperti. Puoi aprire più ticket per richieste diverse. Comunica allo staff l’ID a 6 caratteri del ticket.`,
    `### ${a} 5. Attendi lo staff\nControlla le risposte nel ticket. Alla chiusura la trascrizione viene inviata al canale configurato e il ticket viene eliminato.`
  ], { icon: 'info', footer: `${uiEmoji(guild, 'freccia')} Tieni tutte le informazioni nello stesso ticket.` });
}

// src/discord/ticket-report.ts
var import_discord3 = __toESM(require_src2(), 1);

// src/discord/transcript.ts
var MAX_MESSAGES = 4000;
var IMAGE_TYPES = /* @__PURE__ */ new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
var MAX_IMAGE_BYTES = 25e5;
var MAX_TOTAL_IMAGE_BYTES = 6e6;
var MAX_IMAGES = 25;
async function fetchAllMessages(channel) {
  const all = /* @__PURE__ */ new Map();
  let before;
  do {
    const page = await channel.messages.fetch({ limit: 100, ...before ? { before } : {} });
    for (const message of page.values()) all.set(message.id, message);
    before = page.size === 100 && all.size < MAX_MESSAGES ? page.last()?.id : void 0;
  } while (before);
  const messages = [...all.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  messages.truncated = false;
  if (all.size >= MAX_MESSAGES && messages.length) {
    const older = await channel.messages.fetch({ limit: 1, before: messages[0].id });
    messages.truncated = older.size > 0;
  }
  return messages;
}
function extractCards(message) {
  const cards = [];
  const walk = (node, out) => {
    if (!node || typeof node !== "object") return;
    if (node.type === 10 && typeof node.content === "string") out.push(node.content);
    if (Array.isArray(node.components)) for (const child of node.components) walk(child, out);
  };
  for (const component of message.components) {
    const json = typeof component?.toJSON === "function" ? component.toJSON() : component;
    const pieces = [];
    walk(json, pieces);
    if (pieces.length > 0) cards.push({ color: json?.accent_color ?? void 0, text: pieces.join("\n\n") });
  }
  for (const embed of message.embeds) {
    const pieces = [];
    if (embed.title) pieces.push(`**${embed.title}**`);
    if (embed.description) pieces.push(embed.description);
    for (const field of embed.fields) pieces.push(`**${field.name}**
${field.value}`);
    if (embed.footer?.text) pieces.push(embed.footer.text);
    if (pieces.length > 0) cards.push({ color: embed.color ?? void 0, text: pieces.join("\n\n") });
  }
  return cards;
}
var esc = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var timeZone = "Europe/Rome";
var fmtDateTime = (ms) => new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone }).format(ms);
var fmtTime = (ms) => new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone }).format(ms);
var fmtDay = (ms) => new Intl.DateTimeFormat("it-IT", { dateStyle: "full", timeZone }).format(ms);
var dayKey = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(ms);
function renderMarkdown(raw, ctx) {
  const stash = [];
  const keep = (html2) => `\0${stash.push(html2) - 1}\0`;
  let text = raw;
  text = text.replace(/```(?:[a-zA-Z0-9_+-]*\n)?([\s\S]*?)```/g, (_m, code) => keep(`<pre><code>${esc(code.replace(/\n$/, ""))}</code></pre>`));
  text = text.replace(/`([^`\n]+)`/g, (_m, code) => keep(`<code>${esc(code)}</code>`));
  text = text.replace(/https?:\/\/[^\s<>]+/g, (url) => keep(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>`));
  text = text.replace(/<(a?):(\w+):(\d+)>/g, (_m, animated, name, id) => keep(`<img class="emoji" src="https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "webp"}?size=44" alt=":${esc(name)}:" title=":${esc(name)}:">`));
  text = text.replace(/<@!?(\d+)>/g, (_m, id) => keep(`<span class="mention">@${esc(ctx.names.get(id) ?? "utente sconosciuto")}</span>`));
  text = text.replace(/<@&(\d+)>/g, (_m, id) => keep(`<span class="mention">@${esc(ctx.guild.roles.cache.get(id)?.name ?? "ruolo")}</span>`));
  text = text.replace(/<#(\d+)>/g, (_m, id) => keep(`<span class="mention">#${esc(ctx.guild.channels.cache.get(id)?.name ?? "canale")}</span>`));
  text = text.replace(/<t:(\d+)(?::[a-zA-Z])?>/g, (_m, ts) => keep(esc(fmtDateTime(Number(ts) * 1e3))));
  text = text.replace(/@(everyone|here)\b/g, (_m, word) => keep(`<span class="mention">@${word}</span>`));
  text = esc(text);
  const inline = (line) => line.replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/__(.+?)__/g, "<u>$1</u>").replace(/(?<![\w*])\*(?![\s*])(.+?)(?<![\s*])\*(?!\*)/g, "<i>$1</i>").replace(/(?<!\w)_(?![\s_])(.+?)(?<![\s_])_(?!\w)/g, "<i>$1</i>").replace(/~~(.+?)~~/g, "<s>$1</s>").replace(/\|\|(.+?)\|\|/g, '<span class="spoiler">$1</span>');
  const lines = text.split("\n");
  let html = "";
  lines.forEach((line, index) => {
    const heading = /^(#{1,3}) (.*)$/.exec(line);
    const quote = /^&gt; ?(.*)$/.exec(line);
    const item = /^[-*] (.*)$/.exec(line);
    const isLast = index === lines.length - 1;
    if (heading) html += `<div class="h h${heading[1].length}">${inline(heading[2])}</div>`;
    else if (quote) html += `<div class="quote">${inline(quote[1])}</div>`;
    else if (item) html += `<div class="li">\u2022 ${inline(item[1])}</div>`;
    else html += inline(line) + (isLast ? "" : "<br>");
  });
  return html.replace(/\u0000(\d+)\u0000/g, (_m, i) => stash[Number(i)] ?? "");
}
async function resolveNames(messages, guild, extra = []) {
  const names = /* @__PURE__ */ new Map();
  for (const message of messages) {
    names.set(message.author.id, message.member?.displayName ?? message.author.globalName ?? message.author.username);
    for (const user of message.mentions.users.values()) {
      if (!names.has(user.id)) names.set(user.id, guild.members.cache.get(user.id)?.displayName ?? user.globalName ?? user.username);
    }
  }
  const wanted = new Set(extra);
  for (const message of messages) {
    const texts = [message.content, ...extractCards(message).map((card) => card.text)];
    for (const text of texts) for (const match of text.matchAll(/<@!?(\d+)>/g)) wanted.add(match[1]);
  }
  let lookups = 0;
  for (const id of wanted) {
    if (names.has(id) || lookups >= 40) continue;
    lookups++;
    const member = await guild.members.fetch(id).catch(() => null);
    if (member) {
      names.set(id, member.displayName);
      continue;
    }
    const user = await guild.client.users.fetch(id).catch(() => null);
    if (user) names.set(id, user.globalName ?? user.username);
  }
  return names;
}
async function downloadImages(messages) {
  const images = /* @__PURE__ */ new Map();
  let total = 0;
  for (const message of messages) {
    for (const attachment of message.attachments.values()) {
      if (images.size >= MAX_IMAGES) return images;
      const type = (attachment.contentType ?? "").split(";")[0].trim();
      if (!IMAGE_TYPES.has(type) || attachment.size > MAX_IMAGE_BYTES || total + attachment.size > MAX_TOTAL_IMAGE_BYTES) continue;
      try {
        const response = await fetch(attachment.url, { signal: AbortSignal.timeout(8e3) });
        if (!response.ok) continue;
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > MAX_IMAGE_BYTES || total + size > MAX_TOTAL_IMAGE_BYTES) throw new Error('Immagine oltre i limiti');
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        total += buffer.length;
        images.set(attachment.id, `data:${type};base64,${buffer.toString("base64")}`);
      } catch {
      }
    }
  }
  return images;
}
function parseCommandLines(lines) {
  const events = [];
  for (const line of lines) {
    const match = /^\[(.+?)\] (.+?): (\/.*)$/.exec(line);
    const ts = match ? Date.parse(match[1]) : NaN;
    if (match && !Number.isNaN(ts)) events.push({ ts, text: `${match[2]} ha usato ${match[3]}` });
  }
  return events;
}
var cssColor = (color) => `#${(color ?? 10980346).toString(16).padStart(6, "0")}`;
var formatBytes = (bytes) => bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
function durationLabel(ms) {
  const minutes = Math.max(0, Math.round(ms / 6e4));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} g ${hours % 24} h`;
}
var STYLE = `
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;background:#313338;color:#dbdee1;font:15px/1.45 "gg sans","Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:920px;margin:0 auto;padding:24px 16px 48px}
.head{background:#2b2d31;border-radius:12px;padding:20px 22px;border-left:5px solid #a78bfa;margin-bottom:22px}
.head h1{margin:0 0 4px;font-size:22px;color:#fff}.head .sub{color:#949ba4;margin-bottom:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px 18px}
.grid div span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#949ba4}
.grid div b{font-weight:600;color:#f2f3f5}
.staff{margin-top:14px;color:#b5bac1;font-size:13px}.staff b{color:#f2f3f5}
.day{display:flex;align-items:center;gap:12px;margin:22px 0 6px;color:#949ba4;font-size:12px;font-weight:600}
.day:before,.day:after{content:"";flex:1;height:1px;background:#3f4147}
.msg{display:flex;gap:14px;padding:3px 8px;border-radius:6px}.msg:hover{background:#2e3035}
.msg.first{margin-top:14px}
.av{width:40px;flex:none}.av img{width:40px;height:40px;border-radius:50%;display:block;background:#1e1f22}
.body{min-width:0;flex:1}.meta{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.name{font-weight:600;color:#fff}.tag{background:#5865f2;color:#fff;border-radius:4px;font-size:10px;padding:1px 5px;font-weight:700}
.tag.staff{background:#a78bfa;color:#1e1f22}.tag.opener{background:#3ba55d}
.time{color:#949ba4;font-size:11px}.edited{color:#949ba4;font-size:10px}
.text{word-wrap:break-word;overflow-wrap:anywhere}.gutter{width:40px;flex:none;color:#949ba4;font-size:10px;opacity:0;padding-top:4px;text-align:center}
.msg:hover .gutter{opacity:1}
.reply{color:#949ba4;font-size:12px;margin-bottom:2px;border-left:2px solid #4e5058;padding-left:8px}
.card{margin-top:6px;background:#2b2d31;border-left:4px solid #a78bfa;border-radius:6px;padding:10px 14px;max-width:640px}
.mention{background:#5865f240;color:#c9cdfb;border-radius:4px;padding:0 3px}
code{background:#1e1f22;border-radius:4px;padding:1px 4px;font:13px Consolas,monospace}
pre{background:#1e1f22;border:1px solid #232428;border-radius:6px;padding:8px 10px;overflow:auto;margin:4px 0}pre code{padding:0;background:none}
.quote{border-left:4px solid #4e5058;padding-left:10px;color:#b5bac1}.li{padding-left:6px}
.h{font-weight:700;color:#fff;margin:4px 0}.h1{font-size:20px}.h2{font-size:17px}.h3{font-size:15px}
a{color:#00a8fc;text-decoration:none}a:hover{text-decoration:underline}
.emoji{width:22px;height:22px;vertical-align:-5px}
.spoiler{background:#1e1f22;color:transparent;border-radius:3px;cursor:pointer}.spoiler:hover{color:inherit;background:#3b3d44}
.att{margin-top:6px}.att img{max-width:100%;max-height:420px;border-radius:8px;display:block}
.file{display:inline-block;background:#2b2d31;border:1px solid #3f4147;border-radius:6px;padding:6px 10px;margin-top:6px}
.event{margin:8px 0 8px 54px;color:#949ba4;font-size:12px;font-style:italic}
.foot{text-align:center;color:#6d6f78;font-size:12px;margin-top:36px}
@media print{body{background:#fff;color:#000}.head,.card{background:#f2f3f5}}
`;
STYLE += '\nbody{background:#100e18;color:#e8e3f2;line-height:1.6}.wrap{max-width:1080px;padding:36px 24px 56px}\n.head{background:linear-gradient(120deg,#292039,#1b1825);border:1px solid #443354;border-top:4px solid #bca0ed;padding:28px;border-radius:16px;box-shadow:0 12px 40px #0003}\n.head h1{font-size:28px;overflow-wrap:anywhere}.head .sub{color:#bcb0cb}.grid{gap:12px;margin-top:22px}.grid>div{padding:12px;background:#ffffff05;border:1px solid #ffffff09;border-radius:8px}.grid div span{color:#b5a8c7}\n.brand{font-size:11px;letter-spacing:.2em;font-weight:800;color:#c4a7e7;margin-bottom:12px}.staff{color:#beb3ce}.tag.staff{margin:0;font-size:10px;color:#20172f}\n.msg{padding:9px 12px}.msg:hover{background:#ffffff05}.card{background:#211c2c;max-width:100%;border-color:#b99be8}.day{color:#b6a5c9;margin:28px 0 12px}.day:before,.day:after{background:#393044}.time,.gutter{color:#b0a5bc}.gutter{opacity:1}.file{background:#211c2c;border-color:#443354}.foot{color:#aa9abb}\n.tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:20px 0}.tools input{flex:1;min-width:180px;background:#211c2c;border:1px solid #514060;border-radius:8px;padding:12px;color:#fff;font:inherit}.tools button{background:#c4a7e7;color:#21132f;border:0;border-radius:8px;padding:12px 18px;font:inherit;cursor:pointer}.tools label{color:#c4b7d2}.tools output{color:#bcb0cb;font-size:12px}.msg[hidden]{display:none}\n@media(max-width:600px){.wrap{padding:16px 10px}.head{padding:18px}.head h1{font-size:21px}.grid{grid-template-columns:1fr 1fr}.msg{gap:8px;padding:8px 2px}.av,.gutter{width:30px}.av img{width:30px;height:30px}.card{padding:10px}.event{margin-left:38px}}\n@media print{.tools{display:none}.wrap{max-width:none;padding:0}body{background:#fff;color:#222}.head,.card,.grid>div{background:#fff;box-shadow:none;border-color:#aaa}.head h1,.name,.h,.grid div b,.staff b{color:#111}.text,.staff,.foot,.time,.head .sub{color:#444}.msg{break-inside:avoid}.spoiler{color:inherit;background:#eee}a{color:#333}}\n';
async function renderTranscriptHtml(messages, meta, guild, commandLines = [], embedImages = true) {
  const names = await resolveNames(messages, guild, [meta.opener?.id, meta.closedBy?.id, ...meta.staff.map((s) => s.id)].filter((id) => Boolean(id)));
  if (meta.opener) names.set(meta.opener.id, meta.opener.name);
  const ctx = { names, guild };
  const images = embedImages ? await downloadImages(messages) : /* @__PURE__ */ new Map();
  const staffIds = new Set(meta.staff.map((entry) => entry.id));
  const byId = new Map(messages.map((message) => [message.id, message]));
  const rows = [
    ...messages.filter((message) => !message.system).map((message) => ({ kind: "message", ts: message.createdTimestamp, message })),
    ...parseCommandLines(commandLines).map((event) => ({ kind: "event", ts: event.ts, text: event.text }))
  ].sort((a, b) => a.ts - b.ts);
  let body = "";
  let lastDay = "";
  let lastAuthor = "";
  let lastTs = 0;
  for (const row of rows) {
    const day = dayKey(row.ts);
    if (day !== lastDay) {
      body += `<div class="day">${esc(fmtDay(row.ts))}</div>`;
      lastDay = day;
      lastAuthor = "";
    }
    if (row.kind === "event") {
      body += `<div class="event">\u203A ${fmtTime(row.ts)} \xB7 ${esc(row.text)}</div>`;
      continue;
    }
    const { message } = row;
    const grouped = lastAuthor === message.author.id && row.ts - lastTs < 7 * 6e4 && !message.reference;
    lastAuthor = message.author.id;
    lastTs = row.ts;
    const authorName = names.get(message.author.id) ?? message.author.username;
    const parts = [];
    if (message.reference?.messageId) {
      const target = byId.get(message.reference.messageId);
      if (target) {
        const snippet = (target.content || extractCards(target)[0]?.text || "[allegato]").replace(/\s+/g, " ").slice(0, 90);
        parts.push(`<div class="reply">\u203A ${esc(names.get(target.author.id) ?? target.author.username)}: ${esc(snippet)}</div>`);
      }
    }
    if (message.content.trim()) parts.push(`<div class="text">${renderMarkdown(message.content, ctx)}</div>`);
    for (const card of extractCards(message)) {
      parts.push(`<div class="card" style="border-left-color:${cssColor(card.color)}">${renderMarkdown(card.text, ctx)}</div>`);
    }
    for (const attachment of message.attachments.values()) {
      const embedded = images.get(attachment.id);
      const type = (attachment.contentType ?? "").split(";")[0].trim();
      if (embedded) parts.push(`<div class="att"><a href="${embedded}" target="_blank"><img src="${embedded}" alt="${esc(attachment.name)}"></a></div>`);
      else if (IMAGE_TYPES.has(type)) parts.push(`<div class="att"><a href="${esc(attachment.url)}" target="_blank"><img src="${esc(attachment.url)}" alt="${esc(attachment.name)}" loading="lazy"></a></div>`);
      else parts.push(`<a class="file" href="${esc(attachment.url)}" target="_blank" rel="noopener">\u{1F4CE} ${esc(attachment.name)} (${formatBytes(attachment.size)})</a>`);
    }
    if (parts.length === 0) continue;
    const badges = [
      message.author.bot ? '<span class="tag">BOT</span>' : "",
      meta.opener?.id === message.author.id ? '<span class="tag opener">UTENTE</span>' : "",
      staffIds.has(message.author.id) ? '<span class="tag staff">STAFF</span>' : ""
    ].join("");
    const edited = message.editedTimestamp ? '<span class="edited">(modificato)</span>' : "";
    if (grouped) {
      body += `<div class="msg"><div class="gutter">${fmtTime(row.ts)}</div><div class="body">${parts.join("")}</div></div>`;
    } else {
      body += `<div class="msg first"><div class="av"><img src="${esc(message.author.displayAvatarURL({ size: 64, extension: "png" }))}" alt=""></div><div class="body"><div class="meta"><span class="name">${esc(authorName)}</span>${badges}<span class="time">${esc(fmtDateTime(row.ts))}</span>${edited}</div>${parts.join("")}</div></div>`;
    }
  }
  const people = new Set(messages.filter((message) => !message.author.bot).map((message) => message.author.id));
  const staffLine = meta.staff.length > 0 ? `<div class="staff">Staff intervenuto: ${meta.staff.map((entry) => `<b>${esc(entry.name)}</b> (${entry.messages} msg)`).join(" \xB7 ")}</div>` : "";
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ticket ${esc(meta.ticketId)} — ${esc(meta.channelName)}</title><style>${STYLE}</style></head><body><div class="wrap">
<div class="head"><div class="brand">VEXMON / ARCHIVIO TICKET</div><h1>Trascrizione #${esc(meta.channelName)}</h1><div class="sub">${esc(meta.guildName)} \xB7 ${esc(meta.categoryLabel)}</div>
<div class="grid">
<div><span>ID ticket</span><b>${esc(meta.ticketId)}</b></div>
${meta.truncated ? `<div><span>Cronologia</span><b>Parziale: solo i messaggi più recenti</b></div>
` : ""}<div><span>Aperto da</span><b>${esc(meta.opener?.name ?? "sconosciuto")}</b></div>
<div><span>Chiuso da</span><b>${esc(meta.closedBy?.name ?? "n/d")}</b></div>
<div><span>Aperto il</span><b>${esc(fmtDateTime(meta.createdAt))}</b></div>
<div><span>Chiuso il</span><b>${esc(fmtDateTime(meta.closedAt))}</b></div>
<div><span>Durata</span><b>${esc(durationLabel(meta.closedAt - meta.createdAt))}</b></div>
<div><span>Messaggi / partecipanti</span><b>${messages.filter((m) => !m.system).length} / ${people.size}</b></div>
</div>${staffLine}</div>
<div class="tools"><label for="search">Cerca nella conversazione</label><input id="search" type="search" placeholder="Nome, messaggio o allegato…"><button id="print" type="button">Stampa / PDF</button><output id="count" aria-live="polite"></output></div>
${body || '<div class="event">Nessun messaggio.</div>'}
<div class="foot">Generata dal bot Vexmon \xB7 orari in fuso Europe/Rome \xB7 immagini incorporate quando possibile; allegati esterni e avatar richiedono Internet</div>
</div><script>
const input=document.getElementById('search');
const rows=Array.from(document.querySelectorAll('.msg'));
let author='';for(const row of rows){const name=row.querySelector('.name');if(name)author=name.textContent;row.dataset.search=(author+' '+row.textContent).toLocaleLowerCase('it');}
input.addEventListener('input',()=>{const q=input.value.trim().toLocaleLowerCase('it');let shown=0;for(const row of rows){row.hidden=!row.dataset.search.includes(q);if(!row.hidden)shown++;}document.getElementById('count').textContent=q?shown+' messaggi trovati':'';});
document.getElementById('print').addEventListener('click',()=>window.print());
</script></body></html>`;
}
// src/discord/ticket-report.ts
var MAX_HTML_BYTES = 8e6;
function memberIsStaff(member, config, type) {
  if (isPermanentAdminId(member.id ?? member.user?.id)) return true;
  if (member.permissions.has("Administrator")) return true;
  if (config.botAdminRoleId && member.roles.cache.has(config.botAdminRoleId)) return true;
  const roleId = config.categories[type].roleId;
  return Boolean(roleId && member.roles.cache.has(roleId));
}
function findOpenerId(channel, messages, botId) {
  const fromTopic = /opener:(\d{15,25})/.exec(channel.topic ?? "");
  if (fromTopic) return fromTopic[1];
  for (const message of messages) {
    if (!message.author.bot) continue;
    const texts = [message.content, ...extractCards(message).map((card) => card.text)];
    for (const text of texts) {
      const match = /Ciao <@!?(\d{15,25})>/.exec(text);
      if (match) return match[1];
    }
  }
  return channel.permissionOverwrites.cache.find((overwrite) => overwrite.type === import_discord3.OverwriteType.Member && overwrite.id !== botId && overwrite.id !== PERMANENT_BOT_ADMIN_ID)?.id;
}
async function displayName(guild, id) {
  const member = guild.members.cache.get(id) ?? await guild.members.fetch(id).catch(() => null);
  if (member) return member.displayName;
  const user = await guild.client.users.fetch(id).catch(() => null);
  return user ? user.globalName ?? user.username : "utente sconosciuto";
}
async function buildTicketReport(channel, guild, type, closer, commandLines) {
  const messages = await fetchAllMessages(channel);
  const config = await loadConfig(guild.id);
  const ticket = await ensureTicketRegistered(channel);
  const effectiveType = ticket.type;
  const openerId = findOpenerId(channel, messages, guild.client.user.id);
  const createdAt = channel.createdTimestamp ?? messages[0]?.createdTimestamp ?? Date.now();
  const closedAt = Date.now();
  const staffMessages = {};
  const staffCache = /* @__PURE__ */ new Map();
  let firstResponderId;
  let firstResponseMs;
  let humanMessages = 0;
  for (const message of messages) {
    if (message.author.bot || message.system) continue;
    humanMessages++;
    const authorId = message.author.id;
    if (authorId === openerId) continue;
    if (!staffCache.has(authorId)) {
      const member = guild.members.cache.get(authorId) ?? await guild.members.fetch(authorId).catch(() => null);
      staffCache.set(authorId, member ? memberIsStaff(member, config, effectiveType) : false);
    }
    if (!staffCache.get(authorId)) continue;
    staffMessages[authorId] = (staffMessages[authorId] ?? 0) + 1;
    if (!firstResponderId) {
      firstResponderId = authorId;
      firstResponseMs = Math.max(0, message.createdTimestamp - createdAt);
    }
  }
  const staff = await Promise.all(Object.entries(staffMessages).sort((a, b) => b[1] - a[1]).map(async ([id, count]) => ({ id, name: await displayName(guild, id), messages: count })));
  const meta = {
    ticketId: ticket.id,
    truncated: Boolean(messages.truncated),
    guildName: guild.name,
    channelName: channel.name,
    categoryLabel: TICKET_CATALOG[effectiveType].label,
    opener: openerId ? { id: openerId, name: await displayName(guild, openerId) } : void 0,
    discordName: (openerId ? (guild.members.cache.get(openerId) ?? await guild.members.fetch(openerId).catch(() => null))?.user?.username : '') || ticketTopicValue(channel, 'discord_name') || /^Ticket di (.*?)\s*\|/.exec(channel.topic ?? '')?.[1] || '',
    minecraftName: ticket.minecraftName ?? (effectiveType !== 'discord' ? ticketTopicValue(channel, 'player') : ''),
    closedBy: closer ? { id: closer.id, name: await displayName(guild, closer.id) } : void 0,
    createdAt,
    closedAt,
    staff
  };
  let html = await renderTranscriptHtml(messages, meta, guild, commandLines, true);
  const attachmentLimit = Math.min(MAX_HTML_BYTES, guild.maximumFileSize ?? MAX_HTML_BYTES);
  if (Buffer.byteLength(html) > attachmentLimit) html = await renderTranscriptHtml(messages, meta, guild, commandLines, false);
  if (Buffer.byteLength(html) > attachmentLimit) throw new Error('Trascrizione oltre il limite degli allegati: ticket conservato. Esporta o suddividi la cronologia prima di chiudere.');
  const record = {
    channelId: channel.id,
    ticketId: ticket.id,
    truncated: Boolean(messages.truncated),
    type: effectiveType,
    openerId,
    createdAt,
    closedAt,
    closedBy: closer?.bot ? undefined : closer?.id,
    messages: humanMessages,
    staff: staffMessages,
    firstResponderId,
    firstResponseMs
  };
  return { html, meta, record, messageCount: humanMessages, snapshotMessageId: messages.filter(message=>!message.author.bot&&!message.system).at(-1)?.id??null };
}

// src/discord/bot.ts
var botToken = process.env.DISCORD_BOT_TOKEN;
var client = new import_discord4.Client({
  intents: [import_discord4.GatewayIntentBits.Guilds, import_discord4.GatewayIntentBits.GuildMessages, import_discord4.GatewayIntentBits.MessageContent, import_discord4.GatewayIntentBits.GuildExpressions],
  presence: { status: "online", activities: [{ name: "play.vexmon.it", type: import_discord4.ActivityType.Playing }] }
});
var discordInitialized = false;
var commandLogs = /* @__PURE__ */ new Map();
var emojiAssets = {
  minecraft: "emojis/minecraft.png",
  ticket: "emojis/ticket.png",
  store: "emojis/store.png",
  ban: "emojis/ban.png",
  spada: "emojis/spada.png",
  discord: "emojis/discord.png",
  donazione: "emojis/donazione.png",
  redx: "emojis/redx.png",
  spunta: "emojis/spunta.png",
  info: "emojis/info.png",
  domanda: "emojis/domanda.png",
  account: "emojis/account.png",
  vexmon: "emojis/vexmon.webp",
  website: "emojis/ticket.png"
};
var moduleDirectory = dirname2(fileURLToPath2(import.meta.url));
var assetDirectory = existsSync(resolve3(moduleDirectory, "assets")) ? resolve3(moduleDirectory, "assets") : resolve3(moduleDirectory, "../assets");
var ticketPanelImagePath = resolve3(assetDirectory, "tickets.png");
var ticketPanelBrandImagePath = resolve3(assetDirectory, "vexmon-logo.webp");
var replacementEmojiImages = {"soldi": "iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAACgUlEQVR4Xu2cvTpDQRCG5TpwW7T66Ogo6ejotdwWriNOiEJ2Js+3+cbJCa/SM/sz734zs3t2mR3U/yzquyztcVbZW2lnq4kB0FwhAAJQJ0AI66xCy1EALha1UT27PdXcvn6J7Ep9Lu0sKyIA1Nb726qRGwABmBIghPvE0Vj3ANy6EszfLqRpPhzeSXZmEZHGUI0AqJJK7AAIwA0E4n2giexncxRo4swAlu7lzt8vt56mWliiAdRxH59etfkFigbggA6AiX5Q4ACGEB4gqEqIhLQPAKWC4UDQMrRuVQ3VzYEANKswAAGoh3+UighhnV9Y0MoBqp+fOuYtmUaOzM+OpbZOYXE+jy1PIk0OBGCyZslRDoDGLR8KHMRGCJtHvr8D8Oi+TT43J83vqgsLAJOcr1ZmAALwi8AjISzteVOjfQUYOTSdvWGkSm+dSlvLdyI7O50A0FvwMKy9Lktbo0ATJwALAG796soZW82p6mZYnYuzaV4em9fHCT8mqJNx7ADo0BvaAhCAnwQI4UwI4p9IhABHeVUfTFANa0f8UVFyCgsAl2FY/UkfBSYaVy+VAAjANE2OkgOdZK6eHKK8s7h6bhwf41XYpF4mALDjlBDFCQABmG8z1SpMDjSrsAPQCWv1hFFdWCZVRABo5kAAAnC3RQQF/oICpwTVKRjynUh1FQagur/osFNPLGqX6tYGBSZEAahKbR8Amr40zdWcqoa18wm+wzfp3yGMcisHwI5li0wBCMCUACGci0POgaa+mualz4OrL4Gi04QDQKLcOQAAO4GtmwMQgDoBQlhnFVqOAtCcY3XzUp9LO1t5upM31x2US30u7QyAHcu4wRQFmhz/FcAPwXNTQoCDM2UAAAAASUVORK5CYII=", "report": "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"};
var commandArrowImage = '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';
async function loadApplicationEmojis() {
  await client.application.emojis.fetch().catch(error => logger.warn({ message: error.message }, 'Emoji applicazione non leggibili'));
}
// Aggiorna le cache di entrambe le fonti: emoji del server e emoji dell'applicazione.
async function loadEmojis(guild) {
  await Promise.all([
    guild?.emojis?.fetch?.().catch(error => logger.warn({ guildId: guild.id, message: error.message }, 'Emoji del server non leggibili')),
    loadApplicationEmojis()
  ]);
}
async function emojiImage(name, relative) {
  if (name === 'freccia') return Buffer.from(commandArrowImage, 'base64');
  if (replacementEmojiImages[name]) return Buffer.from(replacementEmojiImages[name], 'base64');
  if (!relative) return null;
  try { return await readFile(resolve3(assetDirectory, relative)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
var guildEmojiJobs = new Map();
// Crea soltanto le emoji che mancano sia nel server sia nell'applicazione. Non cancella né rinomina nulla.
async function ensureGuildEmojis(guild) {
  if (guildEmojiJobs.has(guild.id)) return guildEmojiJobs.get(guild.id);
  const job = (async () => {
    await loadEmojis(guild);
    const result = { created: [], skipped: [], missing: [], failed: [] };
    const assets = { ...emojiAssets, freccia: null, soldi: null, report: null };
    for (const [name, relative] of Object.entries(assets)) {
      if (findEmoji(guild, name)) { result.skipped.push(name); continue; }
      let attachment;
      try { attachment = await emojiImage(name, relative); } catch (error) { result.failed.push(`${name} (${error.message})`); continue; }
      if (!attachment) { result.missing.push(name); continue; }
      if (attachment.length > 256 * 1024) { result.failed.push(`${name} (immagine oltre 256 KiB)`); continue; }
      try {
        await guild.emojis.create({ attachment, name, reason: 'Vexmon ticket bot: emoji mancante' });
        result.created.push(name);
      } catch (serverError) {
        // Nessun permesso o slot esauriti nel server: ripiega sulle emoji dell'applicazione.
        try {
          await client.application.emojis.create({ name, attachment });
          result.created.push(`${name} (applicazione)`);
        } catch (appError) {
          result.failed.push(`${name} (${serverError.message})`);
          logger.warn({ guildId: guild.id, name, message: serverError.message, appMessage: appError.message }, 'Impossibile creare l’emoji mancante');
        }
      }
    }
    return result;
  })();
  guildEmojiJobs.set(guild.id, job);
  try { return await job; } finally { guildEmojiJobs.delete(guild.id); }
}

var panelUpdateChannels = new Set();
async function clearPanelChannel(channel, keepId = null) {
  let before;
  let deleted = 0;
  while (true) {
    const fetched = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!fetched.size) break;
    before = fetched.last().id;
    const page = keepId ? fetched.filter((m) => m.id !== keepId) : fetched;
    const recent = page.filter((m) => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000 - 60000);
    const old = page.filter((m) => !recent.has(m.id));
    if (recent.size > 1) deleted += (await channel.bulkDelete(recent)).size;
    else if (recent.size === 1) { await recent.first().delete(); deleted++; }
    for (const message of old.values()) {
      try { await message.delete(); deleted++; }
      catch (error) { if (error.code !== 10008) throw error; }
    }
  }
  return deleted;
}
// ---- /regole (Minecraft / Discord) ----
var MC_RULES = {
  mute: [
    ["Insulti allo Staff", "3d – 7d", "a discrezione dello Staffer"],
    ["Insulti al server", "7d"],
    ["Insulti", "3h – 7d", "a discrezione dello Staffer"],
    ["Tossicità in chat", "3h"],
    ["Flood", "1h"],
    ["Augurio di Morte", "3d"],
    ["Discriminazione", "3d"],
    ["Apologie Inappropriate", "3d"],
    ["Spam Social", "12h"],
    ["Wall of Text", "1h"],
    ["Flame", "1h – 6h", "a discrezione dello Staffer"]
  ],
  ban: [
    { title: "Cheat e Hack", rules: [
      ["Utilizzo di Cheat o Client modificati", "14d"],
      ["Ammissione di Utilizzo di Cheat o Client modificati", "7d"],
      ["Modifica File del Sistema", "14d"],
      ["Rifiuto controllo Hack/Logs", "14d"],
      ["Utilizzo Print Mode (LiteMatica)", "3d"],
      ["Bug Abuse", "3d – Permaban", "a discrezione dell'HeadStaff"]
    ] },
    { title: "Minacce e Attacchi", rules: [
      ["Minacce di Dox/DDoS", "14d"],
      ["Dox", "BlackList"],
      ["Attacco DDoS", "BlackList"]
    ] },
    { title: "Evasioni e Account", rules: [
      ["Evasione Ban", "Permanente", "su entrambi gli account"],
      ["Evasione Mute", "1d", "su entrambi gli account"],
      ["DupeIP", "4d"],
      ["Condivisione Account", "Permaban", "se l'account condiviso ha un VIP"],
      ["Utilizzo di VPN o Proxy", "Permaban"],
      ["NickName Inappropriato", "Permaban"],
      ["Skin Inappropriata", "1 Kick – 1d"]
    ] },
    { title: "Truffe, Spam e Impersonificazione", rules: [
      ["Truffare UP", "Permaban"],
      ["Truffa InGame", "3d – 7d", "a discrezione dello Staffer"],
      ["Tentato Scam Staff", null, "a discrezione dell'HeadStaff"],
      ["Spam IP", "3d"],
      ["Spam siti inappropriati", "7d"],
      ["Chiedere l'AnyDesk di un Giocatore", "3d"],
      ["Impersonificazione Staff", "7d"]
    ] },
    { title: "Build e Griefing", rules: [
      ["Build Inappropriate", "1d"],
      ["Griefing", "Ban 1d – 7d", "a discrezione dello Staffer"],
      ["Near Flan Building", "Ban 1d – 3d", "a discrezione dello Staffer"]
    ] }
  ],
  voice: [
    ["Insulti allo Staff (VoiceChat)", "Ban 1d"],
    ["Insulti al server (VoiceChat)", "Ban 1d"],
    ["Insulti Pesanti (VoiceChat)", "Ban 6h – 3d", "a discrezione dello Staffer"],
    ["Augurio di Morte (VoiceChat)", "Ban 1d"],
    ["Discriminazione (VoiceChat)", "Ban 1d"],
    ["Soundboard Inopportune (VoiceChat)", "Ban 1d"]
  ]
};
var DISCORD_RULES = [
  { title: "Termini di Servizio", sanction: "ban", text: "Ogni utente è chiamato a seguire i **Termini di Servizio** imposti da Discord." },
  { title: "Tossicità", sanction: "warn → ban", text: "La **tossicità** non sarà tollerata in questo server. Vogliamo mantenere il server un luogo sicuro per tutti e affinché tutti siano felici nella nostra comunità." },
  { title: "Spam / Flood / Caps", sanction: "warn", text: "Lo **spam / flood / caps** non è consentito in nessuno dei canali del nostro server e lo **spam-ping** non sarà tollerato in modo che i nostri membri possano rimanere indisturbati." },
  { title: "Rispetto dello Staff", sanction: "warn → ban", text: "Rispetta lo **staff** del server. Il personale del server dedica del tempo per assicurarsi che la nostra comunità sia sicura e protetta e dovrebbe essere trattato con rispetto." },
  { title: "Contenuti NSFW", sanction: "ban", text: "I contenuti e i discorsi **pornografici / NSFW** non trovano posto in questo server. Con questo intendiamo che non ti è consentito inviare o caricare immagini / video espliciti e non puoi avere un pfp o un banner NSFW / pornografico." },
  { title: "Estremismo e Odio", sanction: "ban", text: "**L'estremismo, l'incitamento all'odio e il razzismo** non saranno tollerati. Tutti sono ammessi sul nostro server, non importa razza, religione o sessualità. Nessuno dovrebbe essere odiato perché potrebbe essere diverso da te, quindi non ci aspettiamo di vedere nessuno essere odiato nel nostro server." },
  { title: "Menzioni vietate", sanction: "warn", text: "Non ti è consentito taggare il ruolo {ROLES}." },
  { title: "Canali e Argomenti", sanction: "warn", text: "Rimani in tema e usa tutti i canali correttamente." },
  { title: "Soundboard e Voice Changer", sanction: "warn", text: "Sono vietate le **soundboard** e il **clownfish** (o qualsiasi altro programma che permette la modifica della voce)." },
  { title: "Argomenti sensibili", sanction: "warn", text: "Evitare di parlare di argomenti sensibili, legati al **suicidio** ed **autolesionismo**: alcuni utenti potrebbero essere turbati dall'argomento oppure da vostre esperienze legate a questo." }
];
var DISCORD_RULE_MENTIONS = ["owner"];
function formatMentionRoles(guild) {
  return DISCORD_RULE_MENTIONS.map((name) => {
    const role = guild.roles.cache.find((r) => r.name.toLowerCase() === name.toLowerCase());
    return role ? `<@&${role.id}>` : `**@${name}**`;
  }).join(", ");
}
function rulesText(content) {
  return new import_discord4.TextDisplayBuilder().setContent(tidy(content));
}
function rulesSeparator(container, size = import_discord4.SeparatorSpacingSize.Small) {
  return container.addSeparatorComponents((separator) => separator.setDivider(true).setSpacing(size));
}
function rulesEmoji(guild, name) {
  return findEmoji(guild, name)?.toString() ?? uiEmoji(guild, name.replace(/~\d+$/, ''));
}

function formatRuleTime(time) {
  const severe = (part) => /permaban|permanente|blacklist/i.test(part);
  const parts = time.split(" – ");
  if (!parts.some(severe)) return `\`${time}\``;
  return parts.map((part) => severe(part) ? `**${part.toUpperCase()}**` : `\`${part}\``).join(" – ");
}
function minecraftRuleLine([name, time, note]) {
  const parts = [`▸ **${name}**`];
  if (time) parts.push(formatRuleTime(time));
  if (note) parts.push(`*${note}*`);
  return parts.join("  ➜  ");
}
function minecraftRulesContainer(guild) {
  const e = (name) => rulesEmoji(guild, name);
  const container = new import_discord4.ContainerBuilder().setAccentColor(BRAND_COLOR);
  const gap = () => container.addSeparatorComponents((separator) => separator.setDivider(false).setSpacing(import_discord4.SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(rulesText(`## ${e("vexmon")} **Regolamento Minecraft**\nSanzioni previste per le infrazioni sul server Minecraft.\n-# **h** = ore  ·  **d** = giorni  ·  in *corsivo* le note e i casi a discrezione dello Staff`));
  rulesSeparator(container, import_discord4.SeparatorSpacingSize.Large);
  container.addTextDisplayComponents(rulesText(`### ${e("servermute")} **MUTE**\n-# Infrazioni in chat\n${MC_RULES.mute.map(minecraftRuleLine).join("\n")}`));
  rulesSeparator(container, import_discord4.SeparatorSpacingSize.Large);
  container.addTextDisplayComponents(rulesText(`### ${e("ban")} **BAN**\n-# Infrazioni in gioco e sugli account`));
  MC_RULES.ban.forEach((group, index) => {
    if (index > 0) gap();
    container.addTextDisplayComponents(rulesText(`### ${e(["spada", "ban", "account", "money", "minecraft"][index])} ${group.title}\n${group.rules.map(minecraftRuleLine).join("\n")}`));
  });
  rulesSeparator(container, import_discord4.SeparatorSpacingSize.Large);
  container.addTextDisplayComponents(rulesText(`### ${e("voicechat")} **VOICECHAT**\n-# Infrazioni in chat vocale\n${MC_RULES.voice.map(minecraftRuleLine).join("\n")}`));
  rulesSeparator(container);
  container.addTextDisplayComponents(rulesText(`-# ${e("info")} Lo **staff si riserva di valutare ogni caso** e di adeguare le sanzioni alla gravità dei fatti, alle prove disponibili e alle eventuali recidive. Le decisioni possono essere sottoposte a revisione tramite un ticket di appello.`));
  rulesSeparator(container);
  container.addTextDisplayComponents(rulesText(`### ${e("domanda")} **Crate: Key e inventario pieno**\n▸ Prima di ricevere le **Key**, assicurati di avere spazio nell’inventario. Le Key non ricevute a causa dell’**inventario pieno** non vengono rimborsate né reinviate dallo staff.\n▸ ${e("money")} **Eccezione:** questa regola non si applica alle Key acquistate nello **Store**; in caso di problemi, apri un ticket di assistenza store.`));
  rulesSeparator(container);
  container.addTextDisplayComponents(rulesText(`-# ${e("info")} VEXMON • Regolamento Minecraft • Per chiarimenti, apri un ticket.`));
  return container;
}
function discordRulesContainer(guild) {
  const e = (name) => rulesEmoji(guild, name);
  const container = new import_discord4.ContainerBuilder().setAccentColor(BRAND_COLOR);
  container.addTextDisplayComponents(rulesText(`## ${e("discord")} **Regolamento Discord**`));
  rulesSeparator(container, import_discord4.SeparatorSpacingSize.Large);
  const icons = ["info", "servermute", "servermute", "account", "redx", "ban", "ghost", "discord", "voicechat", "domanda"];
  DISCORD_RULES.forEach((rule, index) => {
    const icon = rule.sanction === "warn" ? e("redx") : e("ban");
    const text = rule.text.replace("{ROLES}", formatMentionRoles(guild));
    container.addTextDisplayComponents(rulesText(`### ${e(icons[index])} **${index + 1}. ${rule.title}**\n${text}\n-# ${icon} Sanzione: **${rule.sanction}**`));
    rulesSeparator(container);
  });
  container.addTextDisplayComponents(rulesText(`## ${e("domanda")} **Applicazione del regolamento**\n▸ Partecipando al server, sei tenuto a rispettare questo regolamento e le linee guida di Discord.\n▸ ${e("info")} Lo **staff valuta ogni caso** in base alla gravità dei fatti, alle prove e alle eventuali recidive, adottando misure proporzionate per tutelare la comunità. Per chiedere chiarimenti o contestare una sanzione, apri un ticket di appello.`));
  rulesSeparator(container);
  container.addTextDisplayComponents(rulesText(`-# ${e("info")} VEXMON • Regolamento Discord • Rispetta gli altri e segui le indicazioni dello staff.`));
  return container;
}
async function deferInteraction(interaction, options) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply(options);
}
async function respondToInteraction(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    const edited = { ...payload };
    if (typeof edited.flags === 'number') edited.flags &= ~import_discord4.MessageFlags.Ephemeral;
    return interaction.editReply(edited);
  }
  return interaction.reply(payload);
}
async function handleRules(interaction) {
  const reply = (text) => respondToInteraction(interaction, { components: [commandNotice(interaction.guild, text)], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
  if (!interaction.guild || !await canManage(interaction)) return void reply("Solo gli amministratori possono inviare il regolamento.");
  const guild = interaction.guild;
  const kind = interaction.options.getSubcommand();
  const targetChannel = interaction.options.getChannel("canale", true);
  const everyone = interaction.options.getBoolean("everyone") ?? false;
  if (targetChannel.type !== import_discord4.ChannelType.GuildText && targetChannel.type !== import_discord4.ChannelType.GuildAnnouncement) return void reply("Scegli un canale di testo.");
  if (panelUpdateChannels.has(targetChannel.id)) return void reply("Aggiornamento già in corso in questo canale.");
  panelUpdateChannels.add(targetChannel.id);
  try {
    await deferInteraction(interaction, { flags: import_discord4.MessageFlags.Ephemeral });
    const me = await guild.members.fetchMe();
    const P = import_discord4.PermissionFlagsBits;
    const needed = [P.ViewChannel, P.ReadMessageHistory, P.ManageMessages, P.SendMessages, ...(everyone ? [P.MentionEveryone] : [])];
    if (!targetChannel.permissionsFor(me)?.has(needed)) throw new Error(`Al bot servono i permessi Visualizzare canale, Leggere cronologia, Gestire messaggi e Inviare messaggi${everyone ? " e Menzionare @everyone" : ""} in ${targetChannel}.`);
    await loadEmojis(guild);
    await guild.roles.fetch();
    // Build and validate everything before deleting channel history.
    const container = kind === "minecraft" ? minecraftRulesContainer(guild) : discordRulesContainer(guild);
    const components = everyone ? [rulesText("@everyone"), container] : [container];
    components.forEach((component) => component.toJSON());
    let deleted = await clearPanelChannel(targetChannel);
    const sentRules = await targetChannel.send({
      components,
      flags: import_discord4.MessageFlags.IsComponentsV2,
      allowedMentions: everyone ? { parse: ["everyone"] } : { parse: [] }
    });
    // Messaggi scritti da altri durante l'invio: resta soltanto il messaggio nuovo del bot.
    deleted += await clearPanelChannel(targetChannel, sentRules?.id).catch(() => 0);
    await interaction.editReply({ flags: import_discord4.MessageFlags.IsComponentsV2, components: [commandNotice(interaction.guild, `Regolamento ${kind === "minecraft" ? "Minecraft" : "Discord"} inviato in ${targetChannel}. Eliminati ${deleted} messaggi.`)] });
  } catch (error) {
    logger.error({ code: error.code, message: error.message, guildId: guild.id, channelId: targetChannel.id }, "Could not send rules");
    await interaction.editReply({ flags: import_discord4.MessageFlags.IsComponentsV2, components: [commandNotice(interaction.guild, `Invio del regolamento non completato in ${targetChannel}: ${error.message}. Eventuali messaggi già cancellati non sono recuperabili.`)] }).catch(() => {});
  } finally {
    panelUpdateChannels.delete(targetChannel.id);
  }
}

var commands = [
  new import_discord4.SlashCommandBuilder().setName("pending").setDescription("Segna il ticket in elaborazione e sospende l’inattività fino a /inattività"),
  new import_discord4.SlashCommandBuilder().setName("inattività").setDescription("Avvisa il titolare e chiude il ticket alla scadenza configurata"),
  new import_discord4.SlashCommandBuilder().setName("tag").setDescription("Avvisa un utente e invia un promemoria ogni 24 ore fino alla sua risposta")
    .addUserOption((o) => o.setName("utente").setDescription("Utente da avvisare su Discord").setRequired(true)),
  new import_discord4.SlashCommandBuilder().setName('search').setDescription('Cerca i ticket aperti e chiusi di un utente: ID, nickname MC o nome Discord')
    .addStringOption(o => o.setName('nome').setDescription('ID ticket, nickname Minecraft, nome Discord, ID utente o menzione').setMinLength(1).setMaxLength(100))
    .addUserOption(o => o.setName('utente').setDescription('Utente Discord di cui cercare i ticket aperti e chiusi')),
  new import_discord4.SlashCommandBuilder().setName("setup").setDescription("Configura il sistema ticket").addChannelOption((o) => o.setName("canale-trascrizioni").setDescription("Canale dove inviare le trascrizioni").addChannelTypes(import_discord4.ChannelType.GuildText)).addChannelOption((o) => o.setName("categoria-minecraft").setDescription("Categoria per Supporto Minecraft").addChannelTypes(import_discord4.ChannelType.GuildCategory)).addChannelOption((o) => o.setName("categoria-account").setDescription("Categoria per Account").addChannelTypes(import_discord4.ChannelType.GuildCategory)).addChannelOption((o) => o.setName("categoria-segnalazioni").setDescription("Categoria per Segnalazioni / Bug").addChannelTypes(import_discord4.ChannelType.GuildCategory)).addChannelOption((o) => o.setName("categoria-appelli").setDescription("Categoria per Appelli Ban / Mute").addChannelTypes(import_discord4.ChannelType.GuildCategory)).addChannelOption((o) => o.setName("categoria-store").setDescription("Categoria per Supporto Store").addChannelTypes(import_discord4.ChannelType.GuildCategory)).addChannelOption((o) => o.setName("categoria-discord").setDescription("Categoria per Supporto Discord").addChannelTypes(import_discord4.ChannelType.GuildCategory)).addRoleOption((o) => o.setName("ruolo-minecraft").setDescription("Ruolo per Supporto Minecraft")).addRoleOption((o) => o.setName("ruolo-account").setDescription("Ruolo per Account")).addRoleOption((o) => o.setName("ruolo-segnalazioni").setDescription("Ruolo per Segnalazioni / Bug Minecraft")).addRoleOption((o) => o.setName("ruolo-appelli").setDescription("Ruolo per Appello Ban / Mute")).addRoleOption((o) => o.setName("ruolo-store").setDescription("Ruolo per Supporto Store")).addRoleOption((o) => o.setName("ruolo-discord").setDescription("Ruolo per Supporto / Segnalazioni Discord"))
    .addRoleOption(o => o.setName('ruolo-statistiche').setDescription('Ruolo minimo per leggere le statistiche'))
    .addIntegerOption(o => o.setName('ore-inattivita').setDescription('Ore dopo la risposta staff prima dell’avviso (0 disattiva)').setMinValue(0).setMaxValue(8760))
    .addIntegerOption(o => o.setName('ore-chiusura').setDescription('Ore concesse al titolare dopo l’avviso').setMinValue(1).setMaxValue(8760))
    .addIntegerOption(o => o.setName('conservazione-giorni').setDescription('Giorni di conservazione delle trascrizioni gestite dal bot (0 illimitata)').setMinValue(0).setMaxValue(3650)),
  new import_discord4.SlashCommandBuilder().setName("ticket-setup").setDescription("Imposta l'amministratore del bot").addRoleOption((o) => o.setName("ruolo-admin-bot").setDescription("Ruolo che pu\xF2 usare ogni comando del bot")),
  new import_discord4.SlashCommandBuilder().setName("ticket-panel").setDescription("Invia il pannello per aprire i ticket").addChannelOption((o) => o.setName("canale").setDescription("Canale di destinazione (opzionale se impostato con /setup)").addChannelTypes(import_discord4.ChannelType.GuildText)),
  new import_discord4.SlashCommandBuilder().setName("config").setDescription("Mostra la configurazione del sistema ticket"),
  new import_discord4.SlashCommandBuilder().setName("close").setDescription("Chiudi il ticket corrente"),
  new import_discord4.SlashCommandBuilder().setName("add").setDescription("Aggiungi un utente al ticket").addUserOption((o) => o.setName("utente").setDescription("Utente da aggiungere").setRequired(true)),
  new import_discord4.SlashCommandBuilder().setName("kick").setDescription("Rimuovi un utente dal ticket corrente").addUserOption((o) => o.setName("utente").setDescription("Utente da rimuovere dal ticket").setRequired(true)),
  new import_discord4.SlashCommandBuilder().setName("rename").setDescription("Rinomina il ticket corrente").addStringOption((o) => o.setName("nome").setDescription("Nuovo nome del ticket").setRequired(true).setMinLength(1).setMaxLength(40)),
  new import_discord4.SlashCommandBuilder().setName("move").setDescription("Sposta il ticket in un'altra categoria").addStringOption((o) => o.setName("categoria").setDescription("Nuova categoria").setRequired(true).addChoices(...ticketTypes.map((type) => ({ name: TICKET_CATALOG[type].label, value: type })))),
  new import_discord4.SlashCommandBuilder().setName("ticket-stats").setDescription("Classifica e statistiche dello staff nei ticket (accesso riservato)").addStringOption((o) => o.setName("periodo").setDescription("Periodo da analizzare (predefinito: ultimi 30 giorni)").addChoices({ name: "Ultimi 7 giorni", value: "7" }, { name: "Ultimi 30 giorni", value: "30" }, { name: "Sempre", value: "all" })).addUserOption((o) => o.setName("staff").setDescription("Mostra le statistiche di un singolo membro dello staff")),
  new import_discord4.SlashCommandBuilder().setName("help").setDescription("Mostra i comandi disponibili"),
  new import_discord4.SlashCommandBuilder().setName("regole").setDescription("Invia il regolamento in un canale")
    .addSubcommand((o) => o.setName("minecraft").setDescription("Invia il regolamento Minecraft (mute, ban, voicechat)")
      .addChannelOption((c) => c.setName("canale").setDescription("Canale dove inviare il regolamento (tutti i messaggi presenti verranno eliminati)").addChannelTypes(import_discord4.ChannelType.GuildText, import_discord4.ChannelType.GuildAnnouncement).setRequired(true))
      .addBooleanOption((b) => b.setName("everyone").setDescription("Aggiungi un @everyone sopra il regolamento (default: no)")))
    .addSubcommand((o) => o.setName("discord").setDescription("Invia il regolamento del server Discord")
      .addChannelOption((c) => c.setName("canale").setDescription("Canale dove inviare il regolamento (tutti i messaggi presenti verranno eliminati)").addChannelTypes(import_discord4.ChannelType.GuildText, import_discord4.ChannelType.GuildAnnouncement).setRequired(true))
      .addBooleanOption((b) => b.setName("everyone").setDescription("Aggiungi un @everyone sopra il regolamento (default: no)"))),
  new import_discord4.SlashCommandBuilder().setName("claim").setDescription("Prendi in carico il ticket corrente"),
  new import_discord4.SlashCommandBuilder().setName("unclaim").setDescription("Rilascia il ticket corrente"),
  new import_discord4.SlashCommandBuilder().setName("emoji-sync").setDescription("Crea le emoji mancanti del bot nel server (solo amministratori Discord)")
].map((command) => command.setDMPermission(false).toJSON());
// Amministratore permanente del bot ticket: autorizzato in ogni controllo del bot,
// indipendentemente da ruoli e permessi Discord. Non riceve Administrator, Mention
// Everyone o altri privilegi del server: solo accesso ai ticket e ai comandi del bot.
var PERMANENT_BOT_ADMIN_ID = '1076582008270114958';
function isPermanentAdminId(id) { return String(id ?? '') === PERMANENT_BOT_ADMIN_ID; }
function permanentAccessBits() {
  const P = import_discord4.PermissionFlagsBits;
  return P.ViewChannel | P.SendMessages | P.ReadMessageHistory | P.AttachFiles;
}
var permanentAccessBusy = new Set();
async function grantPermanentTicketAccess(channel) {
  const wanted = permanentAccessBits();
  const current = channel.permissionOverwrites?.cache?.get(PERMANENT_BOT_ADMIN_ID);
  if (current && (current.allow.bitfield & wanted) === wanted && (current.deny.bitfield & wanted) === 0n) return false;
  if (permanentAccessBusy.has(channel.id)) return false;
  permanentAccessBusy.add(channel.id);
  try {
    await channel.permissionOverwrites.edit(PERMANENT_BOT_ADMIN_ID, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true }, { type: import_discord4.OverwriteType.Member, reason: 'Accesso amministratore permanente ticket' });
    return true;
  } finally { permanentAccessBusy.delete(channel.id); }
}
async function ensurePermanentTicketAccess(guild, channels) {
  const list = channels ?? await guild.channels.fetch();
  let updated = 0;
  for (const channel of list.values()) {
    if (!channel || !ticketTypeForChannel(channel)) continue;
    try { if (await grantPermanentTicketAccess(channel)) updated++; }
    catch (error) { logger.warn({ channelId: channel.id, message: error.message }, 'Accesso amministratore permanente non applicato'); }
  }
  return updated;
}
function isAdministrator(interaction) {
  return interaction.memberPermissions?.has(import_discord4.PermissionFlagsBits.Administrator) ?? false;
}
async function isBotAdmin(interaction) {
  if (isPermanentAdminId(interaction.user?.id)) return true;
  if (!interaction.guild) return false;
  const config = await loadConfig(interaction.guild.id);
  if (!config.botAdminRoleId) return false;
  const member = interaction.member;
  if (!member || typeof member === "string" || !("roles" in member)) return false;
  return Array.isArray(member.roles) ? member.roles.includes(config.botAdminRoleId) : member.roles.cache.has(config.botAdminRoleId);
}
async function canManage(interaction) {
  return isAdministrator(interaction) || isBotAdmin(interaction);
}
async function canManageTicket(interaction, ticketType) {
  if (await canManage(interaction)) return true;
  if (!interaction.guild) return false;
  const roleId = (await loadConfig(interaction.guild.id)).categories[ticketType].roleId;
  if (!roleId) return false;
  const member = interaction.member;
  if (!member || typeof member === "string" || !("roles" in member)) return false;
  const hasRole = Array.isArray(member.roles) ? member.roles.includes(roleId) : member.roles.cache.has(roleId);
  return hasRole && Boolean(interaction.channel?.permissionsFor(interaction.user.id)?.has(import_discord4.PermissionFlagsBits.ViewChannel));
}
function logCommand(interaction) {
  if (!interaction.channel || interaction.channel.type !== import_discord4.ChannelType.GuildText) return;
  if (!ticketTypeForChannel(interaction.channel)) return;
  const options = interaction.options.data.flatMap((option) => {
    const value = option.value ?? option.user?.id ?? option.role?.id ?? option.channel?.id;
    return value === void 0 ? [] : [`${option.name}=${value}`];
  }).join(" ");
  const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${interaction.user.tag}: /${interaction.commandName}${options ? ` ${options}` : ""}`;
  const entries = commandLogs.get(interaction.channel.id) ?? [];
  entries.push(line);
  if (entries.length > 1000) entries.splice(0, entries.length - 1000);
  commandLogs.set(interaction.channel.id, entries);
}

function ticketTopicValue(channel, key) {
  const raw = new RegExp(`(?:^|\\s\\|\\s)${key}:([^|]*)`).exec(channel.topic ?? '')?.[1]?.trim();
  if (!raw) return '';
  try { return decodeURIComponent(raw); } catch { return raw; }
}
function ticketChannelSlug(channel, type) {
  if (type === 'report' && (ticketTopicValue(channel, 'subcategory') === 'user-report' || channel.name.startsWith('segnalazione-utente-'))) return 'segnalazione-utente';
  return TICKET_CATALOG[type].slug;
}
function ticketNamePrefix(channel, type) {
  return channel.name.startsWith('segnalazione-utente-') ? 'segnalazione-utente' : TICKET_CATALOG[type].slug;
}
function newTicketSlug(type, subcategory) {
  return type === 'report' && subcategory.value === 'user-report' ? subcategory.slug : TICKET_CATALOG[type].slug;
}
function normalizedTicketSearch(value) {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('it').replace(/^@/, '');
}
function ticketSearchIdentity(channel, member) {
  const saved = registry?.tickets[channel.id];
  const openerId = saved?.openerId ?? ticketTopicValue(channel, 'opener');
  const originalUsername = /^Ticket di (.*?)\s*\|/.exec(channel.topic ?? '')?.[1] ?? '';
  const initialType = saved?.initialType ?? saved?.type ?? ticketTopicValue(channel, 'type');
  const player = saved?.minecraftName ?? (initialType !== 'discord' ? ticketTopicValue(channel, 'player') : '');
  return {
    openerId,
    ticketId: saved?.id ?? ticketTopicValue(channel, 'ticket_id'),
    player,
    discordName: member?.user?.username ?? ticketTopicValue(channel, 'discord_name') ?? originalUsername,
    names: [player, originalUsername, ticketTopicValue(channel, 'discord_name'), member?.user?.username, member?.user?.globalName, member?.displayName].filter(Boolean)
  };
}
function ticketSearchScore(identity, query) {
  const id = /^<@!?(\d{15,25})>$/.exec(query)?.[1] ?? (/^\d{15,25}$/.test(query) ? query : null);
  if (id) return identity.openerId === id ? 4 : 0;
  if (normalizedTicketSearch(identity.ticketId) === query) return 4;
  const names = identity.names.map(normalizedTicketSearch);
  return names.some(name => name === query) ? 2 : names.some(name => name.includes(query)) ? 1 : 0;
}
async function searchViewer(interaction) {
  if (!interaction.guild) return null;
  const config = await loadConfig(interaction.guild.id);
  const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true }).catch(() => null);
  if (!member) return null;
  const roleIds = [config.botAdminRoleId, ...Object.values(config.categories).map(item => item.roleId)].filter(Boolean);
  const allowed = isPermanentAdminId(member.id) || member.permissions.has(import_discord4.PermissionFlagsBits.Administrator) || roleIds.some(id => member.roles.cache.has(id));
  return allowed ? member : null;
}
function searchCanView(channel, viewer) {
  return Boolean(ticketTypeForChannel(channel) && registry?.tickets[channel.id]?.state !== 'closing' && channel.permissionsFor(viewer)?.has(import_discord4.PermissionFlagsBits.ViewChannel));
}
var searchSessions = new Map();
var SEARCH_PAGE_SIZE = 3;
function cleanSearchSessions() {
  for (const [id, session] of searchSessions) if (session.expiresAt <= Date.now()) searchSessions.delete(id);
}
function searchSafe(value, limit = 60) {
  return import_discord4.escapeMarkdown(String(value ?? '').replace(/\s+/g, ' ').slice(0, limit));
}
// ---- Ticket chiusi: ricerca nel canale log delle trascrizioni ----
// Full log history is indexed in resumable SQLite batches; no silent scan cap.
var CLOSED_FILE_LIMIT = 8 * 1024 * 1024;
var CLOSED_FILES_TOTAL = 20 * 1024 * 1024;
var transcriptLogCache = new Map();
function invalidateTranscriptLog(guildId) { transcriptLogCache.delete(guildId); }
function componentTexts(node, out = []) {
  const data = typeof node?.toJSON === 'function' ? node.toJSON() : node;
  if (!data || typeof data !== 'object') return out;
  if (typeof data.content === 'string') out.push(data.content);
  for (const child of data.components ?? []) componentTexts(child, out);
  if (data.accessory) componentTexts(data.accessory, out);
  return out;
}
function embedTexts(message) {
  return (message.embeds ?? []).flatMap(embed => {
    const data = typeof embed?.toJSON === 'function' ? embed.toJSON() : embed;
    return [data?.title, data?.description, ...(data?.fields ?? []).map(f => `**${f.name}** ${f.value}`)].filter(Boolean);
  });
}
function parseTranscriptMessage(message, botId) {
  if (message.author?.id !== botId) return null;
  const text = [message.content, ...(message.components ?? []).flatMap(component => componentTexts(component)), ...embedTexts(message)].filter(Boolean).join('\n');
  // Il valore può stare sulla stessa riga ("**Canale** #x") oppure sotto l'etichetta; il grassetto può essere assente.
  const field = (label, pattern) => new RegExp(`(?:\\*\\*)?${label}(?:\\*\\*)?:?\\s*${pattern}`).exec(text)?.[1]?.trim();
  const ticketId = field('ID ticket', '`([A-Z0-9]{6})`') ?? '';
  const files = message.attachments?.values ? [...message.attachments.values()] : [];
  const attachment = files.find(item => /\.html?$/i.test(item.name ?? '')) ?? files[0];
  const channelName = field('Canale', '#([^\\s`*]+)');
  // Trascrizioni create prima della 1.3.0: nessun ID, ma stessa scheda "Trascrizione del ticket" con canale e allegato HTML.
  const looksLikeTranscript = /Trascrizione (del )?ticket/i.test(text) || (channelName && /\.html?$/i.test(attachment?.name ?? ''));
  if (!ticketId && !(looksLikeTranscript && channelName)) return null;
  return {
    ticketId, legacy: !ticketId, messageId: message.id, channelId: message.channelId ?? message.channel?.id,
    closedAt: message.createdTimestamp, channelName,
    openerId: field('Aperto da', '<@!?(\\d{15,25})>'), closedById: field('Chiuso da', '<@!?(\\d{15,25})>'),
    categoryLabel: field('Categoria', '([^\\n]+)'), minecraftName: field('Nickname Minecraft', '([^\\n]+)'), discordName: field('Nome Discord', '([^\\n]+)'),
    attachmentName: attachment?.name, attachmentUrl: attachment?.url, attachmentSize: attachment?.size
  };
}
var logImportJobs = new Map();
var backgroundLogImports = new Set();
async function loadClosedTranscripts(guild, config) {
  await loadRegistry();
  const result = { channelId: config.transcriptChannelId, channel: null };
  if (!config.transcriptChannelId) return result;
  result.channel = await guild.channels.fetch(config.transcriptChannelId).catch(() => null);
  if (!result.channel?.messages) return result;
  const key = guild.id + ':' + result.channel.id;
  if(backgroundLogImports.has(key)){result.partial=true;return result;}
  if (!logImportJobs.has(key)) {
    const job = importTranscriptLog(guild, result.channel);
    logImportJobs.set(key, job);
    job.finally(() => { if(logImportJobs.get(key)===job) logImportJobs.delete(key); }).catch(()=>{});
  }
  const outcome=await logImportJobs.get(key);
  result.partial=Boolean(outcome?.partial);
  if(result.partial&&!backgroundLogImports.has(key)) {
    backgroundLogImports.add(key);
    void (async()=>{try{while((await importTranscriptLog(guild,result.channel))?.partial){} }catch(error){logger.warn({message:error.message},'Importazione log sospesa: riprenderà con /search');}finally{backgroundLogImports.delete(key);}})();
  }
  return result;
}
async function legacyTranscriptMetadata(entry) {
  if(!entry.attachmentUrl||!transcriptUrlAllowed(entry.attachmentUrl)||entry.attachmentSize>CLOSED_FILE_LIMIT)return {};
  const response=await fetch(entry.attachmentUrl,{signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const parts=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>CLOSED_FILE_LIMIT)throw new Error('HTML storico oltre il limite di lettura');parts.push(chunk);}
  const html=Buffer.concat(parts).toString('utf8');
  const plain=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,'\n').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  return {minecraftName:/(?:^|\n)\s*(?:Nickname Minecraft(?: attuale)?|Nome Minecraft)\s*\n+\s*([^\n]+)/i.exec(plain)?.[1]?.trim().slice(0,100),discordName:/(?:^|\n)\s*Aperto da\s*\n+\s*([^\n]+)/i.exec(plain)?.[1]?.trim().slice(0,100)};
}
async function importTranscriptLog(guild, channel) {
  ticketDb.prepare('INSERT OR IGNORE INTO log_sync(guild_id,channel_id) VALUES(?,?)').run(guild.id,channel.id);
  const sync = ticketDb.prepare('SELECT * FROM log_sync WHERE guild_id=? AND channel_id=?').get(guild.id,channel.id);
  const backfill = !sync.backfill_complete;
  const started=Date.now();
  let before=backfill ? sync.oldest_cursor : undefined, newest=null;
  while(true) {
    const page=await channel.messages.fetch({limit:100,...(before?{before}:{})});
    newest ??= page.first()?.id ?? null;
    let reached=false,paused=false,processed=null;
    const entries=[];
    for(const message of page.values()) {
      if(backfill&&processed&&Date.now()-started>=8000){paused=true;break;}
      if(!backfill && sync.newest_id && BigInt(message.id)<=BigInt(sync.newest_id)){reached=true;break;}
      processed=message.id;
      const parsed=parseTranscriptMessage(message,guild.client.user.id);
      if(!parsed)continue;
      const previous=ticketDb.prepare('SELECT payload FROM transcripts WHERE message_id=?').get(message.id);
      const prior=previous?JSON.parse(previous.payload):{};
      const entry={...prior,...Object.fromEntries(Object.entries(parsed).filter(([,value])=>value!==undefined&&value!=='')),guildId:guild.id,channelId:channel.id,tag:prior.tag??'legacy_log',createdAt:parsed.closedAt};
      const saved=entry.ticketId?savedTicketById(entry.ticketId):null;
      if(saved){entry.sourceChannelId??=saved.channelId;entry.openerId??=saved.openerId;entry.minecraftName||=saved.minecraftName??saved.closureReport?.meta?.minecraftName;entry.discordName||=saved.discordName??saved.closureReport?.meta?.discordName;}
      if((!entry.minecraftName||!entry.discordName)&&!prior.metadataAttempted){
        try{const meta=await legacyTranscriptMetadata(entry);entry.minecraftName||=meta.minecraftName;entry.discordName||=meta.discordName;entry.metadataStatus='read';}
        catch(error){entry.metadataStatus='unavailable';logger.warn({messageId:entry.messageId,message:error.message},'Metadati HTML storici non disponibili; riferimento salvato comunque');}
        entry.metadataAttempted=true;
      }
      entries.push(entry);
    }
    const done=!paused&&(!page.size||page.size<100||reached);
    dbTransaction(()=>{
      for(const entry of entries)persistTranscript(entry);
      if(backfill)ticketDb.prepare('UPDATE log_sync SET newest_id=COALESCE(newest_id,?),oldest_cursor=COALESCE(?,oldest_cursor),backfill_complete=? WHERE guild_id=? AND channel_id=?').run(newest,processed,done?1:0,guild.id,channel.id);
      else if(done)ticketDb.prepare('UPDATE log_sync SET newest_id=COALESCE(?,newest_id) WHERE guild_id=? AND channel_id=?').run(newest,guild.id,channel.id);
    });
    for(const entry of entries){const i=registry.archives.findIndex(row=>row.messageId===entry.messageId);if(i<0)registry.archives.push(entry);else registry.archives[i]=entry;}
    if(paused)return {partial:true};
    if(done)break;
    before=page.last().id;
  }
}
function reconcileTicketChannels(guild,channels) {
  const changed=[];
  for(const row of Object.values(registry.tickets)) {
    if(row.guildId!==guild.id)continue;
    const channel=channels.get(row.channelId);
    if(!channel && row.state!=='closed') {row.state='closed';row.closedAt??=Date.now();row.closeReason??='channel_missing';changed.push(row);}
    if(channel) {
      const mc=row.minecraftName??(row.initialType!=='discord'&&row.type!=='discord'?ticketTopicValue(channel,'player'):'');
      const discord=ticketTopicValue(channel,'discord_name');
      if(row.channelName!==channel.name || (!row.minecraftName&&mc) || (!row.discordName&&discord)) {row.channelName=channel.name;if(mc)row.minecraftName=mc;if(discord)row.discordName=discord;changed.push(row);}
    }
  }
  dbTransaction(()=>{
    for(const row of changed)persistTicket(row);
    for(const member of guild.members.cache.values())for(const name of [member.user?.username,member.user?.globalName,member.displayName])dbRememberName(guild.id,member.id,name);
  });
}
function savedTicketById(ticketId) {
  if (!ticketId) return undefined;
  return Object.values(registry?.tickets ?? {}).find(item => item.id === ticketId);
}
var closedUserCache = new Map();
// Nomi dell'utente che ha aperto un ticket chiuso: membro in cache, altrimenti utente Discord (anche se ha lasciato il server).
async function resolveClosedUsers(guild, entries) {
  const ids = [...new Set(entries.map(entry => entry.openerId).filter(Boolean))]
    .filter(id => !guild.members?.cache?.has(id) && !(closedUserCache.get(id) && Date.now() - closedUserCache.get(id).at < 6 * 3600000))
    .slice(0, 300);
  for (let offset = 0; offset < ids.length; offset += 5) await Promise.all(ids.slice(offset, offset + 5).map(async id => {
    const user = await guild.client?.users?.fetch?.(id).catch(() => null);
    closedUserCache.set(id, { at: Date.now(), names: user ? [user.username, user.globalName].filter(Boolean) : [] });
  }));
}
function closedUserNames(guild, openerId) {
  if (!openerId) return [];
  const cached = guild.members?.cache?.get(openerId);
  if (cached) return [cached.user?.username, cached.user?.globalName, cached.displayName].filter(Boolean);
  return closedUserCache.get(openerId)?.names ?? [];
}
function closedEntryType(entry) {
  const saved = savedTicketById(entry.ticketId);
  if (saved?.type && ticketTypes.includes(saved.type)) return saved.type;
  return ticketTypes.find(type => TICKET_CATALOG[type].label === entry.categoryLabel);
}
function closedCanView(viewer, config, destination, entry) {
  const P = import_discord4.PermissionFlagsBits;
  if (isPermanentAdminId(viewer.id) || viewer.permissions?.has(P.Administrator)) return true;
  if (config.botAdminRoleId && viewer.roles.cache.has(config.botAdminRoleId)) return true;
  if (destination?.permissionsFor(viewer)?.has(P.ViewChannel)) return true;
  const roleId = config.categories[closedEntryType(entry)]?.roleId;
  return Boolean(roleId && viewer.roles.cache.has(roleId));
}
function closedIdentity(entry, member, extraNames = []) {
  const saved = savedTicketById(entry.ticketId);
  const prefixes = [...Object.values(TICKET_CATALOG).map(item => item.slug), 'segnalazione-utente'].sort((a, b) => b.length - a.length);
  let rest = entry.channelName ?? '';
  const prefix = prefixes.find(item => rest.startsWith(`${item}-`));
  if (prefix) rest = rest.slice(prefix.length + 1);
  const suffix = entry.ticketId ? `-${entry.ticketId.toLowerCase()}` : '';
  if (suffix && rest.endsWith(suffix)) rest = rest.slice(0, -suffix.length);
  const player = saved?.minecraftName ?? entry.minecraftName ?? '';
  return {
    openerId: entry.openerId ?? saved?.openerId ?? '', ticketId: entry.ticketId, player,
    discordName: entry.discordName ?? member?.user?.username ?? extraNames[0] ?? '',
    names: [player, entry.minecraftName, entry.discordName, member?.user?.username, member?.user?.globalName, member?.displayName, ...extraNames, rest, entry.channelName].filter(Boolean)
  };
}
function closedStillOpen(entry) {
  const guild=client.guilds.cache.get(entry.guildId);
  const saved=savedTicketById(entry.ticketId);
  const source=entry.sourceChannelId||saved?.channelId;
  if(source && guild)return guild.channels.cache.has(source);
  if(guild && entry.channelName)return [...guild.channels.cache.values()].some(channel=>channel.name===entry.channelName&&ticketTypeForChannel(channel));
  return Boolean(saved&&saved.state!=='closed');
}
function transcriptUrlAllowed(raw) {
  try{const url=new URL(raw);return url.protocol==='https:'&&['cdn.discordapp.com','cdn.discord.com','media.discordapp.net'].includes(url.hostname);}catch{return false;}
}
async function refreshClosedEntry(guild,entry,destination) {
  const channel=destination?.id===entry.channelId ? destination : await guild.channels.fetch(entry.channelId);
  if(!channel?.messages)throw Object.assign(new Error('Canale log non disponibile'),{code:10003});
  try {
    // Force a fresh API response: cached messages can contain expired signed URLs
    // or partial attachment metadata from an earlier indexing pass.
    const message=await channel.messages.fetch({message:String(entry.messageId),force:true});
    if(message.author?.id!==guild.client.user.id)throw Object.assign(new Error('Autore trascrizione inatteso'),{code:'TRANSCRIPT_AUTHOR'});
    const attachments=[...(message.attachments?.values()??[])];
    const attachment=attachments.find(item=>/\.html?$/i.test(item.name??''))??attachments.find(item=>/text\/html/i.test(item.contentType??''));
    // A log card may have been edited since import: the HTML attachment, not the
    // exact wording of its labels, determines whether it can still be delivered.
    const parsed=parseTranscriptMessage(message,guild.client.user.id)??{};
    const fresh={...entry,...Object.fromEntries(Object.entries(parsed).filter(([,value])=>value!==undefined&&value!=='')),channelId:channel.id,messageId:message.id};
    if(!attachment?.url)throw Object.assign(new Error('Il messaggio esiste ma non contiene un file HTML'),{code:'TRANSCRIPT_ATTACHMENT'});
    Object.assign(fresh,{attachmentUrl:attachment.url,attachmentName:attachment.name??'transcript.html',attachmentSize:attachment.size,deletedAt:null});
    persistTranscript(fresh);
    const saved=registry.archives.find(item=>item.messageId===entry.messageId);if(saved)Object.assign(saved,fresh);
    return fresh;
  }catch(error){
    if(Number(error.code)===10008){const row={...entry,deletedAt:Date.now()};persistTranscript(row);const found=registry.archives.find(item=>item.messageId===entry.messageId);if(found)found.deletedAt=row.deletedAt;return null;}
    throw error;
  }
}
async function attachClosedFiles(card,items,uploadLimit) {
  const files=[];let total=0;const reasons=[];
  for(let offset=0;offset<items.length;offset+=2) {
    await Promise.all(items.slice(offset,offset+2).map(async item=>{
    const entry=item.entry;
    if(!entry.attachmentUrl||!entry.attachmentName||!transcriptUrlAllowed(entry.attachmentUrl)){reasons.push('Allegato non disponibile: usa il messaggio originale nel log.');return;}
    const limit=Math.min(CLOSED_FILE_LIMIT,uploadLimit);
    if((entry.attachmentSize??0)>limit||total+(entry.attachmentSize??0)>Math.min(CLOSED_FILES_TOTAL,uploadLimit)){reasons.push('Allegato oltre il limite di invio: usa il messaggio nel log.');return;}
    try {
      const response=await fetch(entry.attachmentUrl,{signal:AbortSignal.timeout(10000),redirect:'error'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const chunks=[];let size=0;
      for await(const chunk of response.body){size+=chunk.length;if(size>limit||total+size>Math.min(CLOSED_FILES_TOTAL,uploadLimit))throw new Error('Limite allegati superato');chunks.push(chunk);}
      if(total+size>Math.min(CLOSED_FILES_TOTAL,uploadLimit)){reasons.push('Limite totale allegati: usa il messaggio nel log.');return;}
      const buffer=Buffer.concat(chunks);total+=size;
      const name=`transcript-${entry.messageId}.html`;
      files.push({attachment:buffer,name});
    }catch(error){reasons.push('Allegato non scaricabile: usa il messaggio originale nel log.');logger.warn({message:error.message,ticketId:entry.ticketId},'Transcript download failed');}
    }));
  }
  return {files,reasons:[...new Set(reasons)]};
}
async function renderSearchPage(interaction, token, requestedPage = 0) {
  cleanSearchSessions();
  const session = searchSessions.get(token);
  const guild = interaction.guild;
  const flags = import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral;
  const notice = text => respondToInteraction(interaction, { components: [commandNotice(guild, text)], flags, allowedMentions: { parse: [] } });
  if (!session || session.userId !== interaction.user.id || session.guildId !== guild?.id) return notice('Ricerca scaduta o non disponibile per questo utente. Esegui di nuovo /search.');
  const viewer = await searchViewer(interaction);
  if (!viewer) return notice('Solo lo staff dei ticket può cercare i ticket.');
  await loadRegistry();
  const channels = await guild.channels.fetch();
  const config = await loadConfig(guild.id);
  const destination = config.transcriptChannelId ? channels.get(config.transcriptChannelId) ?? null : null;
  // Recheck live access and open state on each page, never trust stale results.
  const open = session.channelIds.map(id => channels.get(id)).filter(channel => channel && searchCanView(channel, viewer)).map(channel => ({ kind: 'open', channel }));
  const closed = (session.closed ?? []).filter(entry => closedCanView(viewer, config, destination, entry) && !closedStillOpen(entry)).map(entry => ({ kind: 'closed', entry }));
  const results = [...open, ...closed];
  const pages = Math.max(1, Math.ceil(results.length / SEARCH_PAGE_SIZE));
  const page = Math.min(Math.max(0, Number.isInteger(requestedPage) ? requestedPage : 0), pages - 1);
  const e = name => uiEmoji(guild, name);
  const sections = [
    `${e('search')} **Ricerca** ${searchSafe(session.label, 100)}\n\n${e('ticket')} **Ticket aperti trovati:** ${open.length}\n${e('spunta')} **Ticket chiusi trovati:** ${closed.length}\n${e('info')} **Pagina:** ${page + 1}/${pages}`
  ];

  if (!results.length) sections.push(`${e('domanda')} Nessun ticket aperto o chiuso accessibile corrisponde alla ricerca. Prova un ID ticket, un nickname Minecraft, un nome Discord o seleziona un utente.`);
  const visible = results.slice(page * SEARCH_PAGE_SIZE, (page + 1) * SEARCH_PAGE_SIZE);
  // Risultati divisi in gruppi (aperti / chiusi), ognuno con il suo titolo; in ogni scheda prima chi è, poi i dettagli.
  let lastKind = null;
  let position = page * SEARCH_PAGE_SIZE;
  for (const item of visible) {
    if (item.kind !== lastKind) {
      lastKind = item.kind;
      sections.push(item.kind === 'open'
        ? `## ${e('ticket')} **Ticket aperti** · ${open.length}`
        : `## ${e('spunta')} **Ticket chiusi** · ${closed.length}`);
    }
    position++;
    if (item.kind === 'open') {
      const channel = item.channel;
      const openerId = registry?.tickets[channel.id]?.openerId ?? ticketTopicValue(channel, 'opener');
      const member = guild.members.cache.get(openerId) ?? await guild.members.fetch(openerId).catch(() => null);
      const identity = ticketSearchIdentity(channel, member);
      sections.push([
        `### ${e('ticket')} \`${identity.ticketId}\` · <#${channel.id}>`,
        [
          `${e('account')} **Aperto da** <@${identity.openerId}>`,
          `${e('discord')} **Nome Discord** ${searchSafe(identity.discordName || 'Non disponibile')}`,
          identity.player ? `${e('minecraft')} **Nickname Minecraft** ${searchSafe(identity.player)}` : ''
        ].filter(Boolean).join('\n'),
        [
          `${e('info')} **Categoria** ${TICKET_CATALOG[ticketTypeForChannel(channel)].label}`,
          `${e('freccia')} [Apri il ticket](https://discord.com/channels/${guild.id}/${channel.id})`
        ].join('\n')
      ].join('\n\n'));
    } else {
      const entry = item.entry;

      const member = entry.openerId ? guild.members.cache.get(entry.openerId) ?? null : null;
      const identity = closedIdentity(entry, member, closedUserNames(guild, entry.openerId));
      const closedUnix = Math.floor((entry.closedAt ?? Date.now()) / 1000);
      sections.push([
        `### ${e('spunta')} ${entry.ticketId ? `\`${entry.ticketId}\`` : '(senza ID, precedente alla 1.3)'} · #${searchSafe(entry.channelName || 'canale-eliminato', 60)}`,
        [
          identity.openerId ? `${e('account')} **Aperto da** <@${identity.openerId}>` : '',
          identity.discordName ? `${e('discord')} **Nome Discord** ${searchSafe(identity.discordName)}` : '',
          identity.player ? `${e('minecraft')} **Nickname Minecraft** ${searchSafe(identity.player)}` : ''
        ].filter(Boolean).join('\n'),
        [
          `${e('info')} **Categoria** ${searchSafe(entry.categoryLabel || 'Non disponibile')}`,
          `${e('redx')} **Chiuso** <t:${closedUnix}:f>${entry.closedById ? ` da <@${entry.closedById}>` : ''}`,
          `${e('freccia')} [Apri la trascrizione nel canale log](https://discord.com/channels/${guild.id}/${entry.channelId ?? config.transcriptChannelId}/${entry.messageId})`,
          ''
        ].join('\n')
      ].filter(Boolean).join('\n\n'));
    }
  }
  const card = commandCard(guild, 'Ricerca ticket', sections, { icon: 'search', footer: session.logError ? 'VEXMON • Assistenza • Storico in aggiornamento' : 'VEXMON • Assistenza' });
  if (pages > 1) card.addActionRowComponents(new import_discord4.ActionRowBuilder().addComponents(
    withEmoji(new import_discord4.ButtonBuilder().setCustomId(`search:page:${token}:${page - 1}`).setLabel('Precedente').setStyle(import_discord4.ButtonStyle.Secondary), emojiOption(guild, 'freccia')).setDisabled(page === 0),
    withEmoji(new import_discord4.ButtonBuilder().setCustomId(`search:page:${token}:${page + 1}`).setLabel('Successiva').setStyle(import_discord4.ButtonStyle.Secondary), emojiOption(guild, 'search')).setDisabled(page === pages - 1)
  ));
  return respondToInteraction(interaction,{components:[card],flags,allowedMentions:{parse:[]},files:[],attachments:[]});
}
async function handleTicketSearch(interaction) {
  const guild = interaction.guild;
  const flags = import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral;
  const notice = text => respondToInteraction(interaction, { components: [commandNotice(guild, text)], flags, allowedMentions: { parse: [] } });
  if (!guild) return notice('Usa questo comando nel server Discord.');
  const viewer = await searchViewer(interaction);
  if (!viewer) return notice('Solo lo staff dei ticket può cercare i ticket.');
  const rawName = (interaction.options.getString('nome') ?? '').trim();
  const selectedUser = interaction.options.getUser('utente');
  const query = normalizedTicketSearch(rawName || selectedUser?.id);
  if (!query) return notice('Inserisci nome: con un ID ticket, un nickname Minecraft o un nome Discord, oppure seleziona utente:.');
  await loadRegistry();
  const config = await loadConfig(guild.id);
  const channels = await guild.channels.fetch();
  reconcileTicketChannels(guild,channels);
  const matches=sqliteSearch(guild.id,query,selectedUser?.id,'open').map(row=>({channel:channels.get(row.channelId)})).filter(item=>item.channel&&searchCanView(item.channel,viewer));
  let closedMatches=[],logError=false;
  try {
    const log=await loadClosedTranscripts(guild,config);
    if(config.transcriptChannelId&&!log.channel||log.partial)logError=true;
    const rows=sqliteSearch(guild.id,query,selectedUser?.id,'closed').filter(entry=>entry.channelId===config.transcriptChannelId&&!closedStillOpen(entry)&&closedCanView(viewer,config,log.channel,entry));
    const seen=new Set();
    for(const entry of rows){const key=entry.ticketId||entry.sourceChannelId||entry.messageId;if(seen.has(key))continue;seen.add(key);closedMatches.push({entry});}
  }catch(error){logError=true;logger.warn({message:error.message},'Indicizzazione incompleta: riprendere la ricerca per completare i log');
    closedMatches=sqliteSearch(guild.id,query,selectedUser?.id,'closed').filter(entry=>entry.channelId===config.transcriptChannelId&&!closedStillOpen(entry)&&closedCanView(viewer,config,channels.get(config.transcriptChannelId),entry)).map(entry=>({entry}));
  }
  cleanSearchSessions();
  // Bound ephemeral session memory; expired sessions need a new slash command.
  while (searchSessions.size >= 500) searchSessions.delete(searchSessions.keys().next().value);
  const token = randomUUID();
  searchSessions.set(token, { userId: interaction.user.id, guildId: guild.id, label: rawName || selectedUser.username || selectedUser.id, channelIds: matches.map(item => item.channel.id), closed: closedMatches.map(item => item.entry), logError, expiresAt: Date.now() + 15 * 60000 });
  return renderSearchPage(interaction, token);
}

async function removeDeprecatedGlobalCommands(rest, applicationId) {
  try {
    const globalCommands = await rest.get(import_discord4.Routes.applicationCommands(applicationId));
    for (const command of globalCommands) {
      if (['purify', 'protection', 'gestore-tornei', 'area51'].includes(command.name)) await rest.delete(import_discord4.Routes.applicationCommand(applicationId, command.id));
    }
  } catch (error) {
    logger.warn({ code: error.code, message: error.message }, 'Impossibile rimuovere il comando globale obsoleto');
  }
}


async function transcriptDestination(guild, config) {
  if (!config.transcriptChannelId) throw new Error('Configura il canale trascrizioni con /setup.');
  const channel = await guild.channels.fetch(config.transcriptChannelId);
  if (!channel || channel.type !== import_discord4.ChannelType.GuildText) throw new Error('Canale trascrizioni non valido.');
  const me = guild.members.me ?? await guild.members.fetchMe();
  const P = import_discord4.PermissionFlagsBits;
  if (!channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.AttachFiles, P.ReadMessageHistory])) throw new Error('Il bot non può leggere e inviare file nel canale trascrizioni.');
  if (channel.permissionsFor(guild.roles.everyone)?.has(P.ViewChannel)) throw new Error('Il canale trascrizioni deve essere privato: rimuovi Visualizza canale da @everyone.');
  return channel;
}
async function validateConfiguredResources(guild, config) {
  const roles = await guild.roles.fetch();
  for (const id of [config.botAdminRoleId, config.statsRoleId, ...Object.values(config.categories).map(item => item.roleId)].filter(Boolean)) {
    if (id === guild.id || !roles.has(id)) throw new Error('Uno dei ruoli configurati non esiste oppure è @everyone.');
  }
  for (const id of [...new Set(Object.values(config.categories).map(item => item.categoryId).filter(Boolean))]) {
    const channel = await guild.channels.fetch(id);
    if (channel?.type !== import_discord4.ChannelType.GuildCategory) throw new Error('Una delle categorie configurate non è valida.');
  }
  if (config.transcriptChannelId) await transcriptDestination(guild, config);
}
async function validateTicketSetup(guild, config, type) {
  if (!ticketTypes.includes(type)) throw new Error('Categoria ticket non valida.');
  const P = import_discord4.PermissionFlagsBits;
  const roleId = config.categories[type]?.roleId;
  const role = roleId ? await guild.roles.fetch(roleId) : null;
  if (!role || role.id === guild.id) throw new Error('Configura un ruolo staff valido per questa categoria con /setup.');
  const categoryId = config.categories[type]?.categoryId ?? config.ticketParentCategoryId;
  const category = categoryId ? await guild.channels.fetch(categoryId) : null;
  if (category?.type !== import_discord4.ChannelType.GuildCategory) throw new Error('Configura una categoria Discord valida con /setup.');
  const me = guild.members.me ?? await guild.members.fetchMe();
  if (!category.permissionsFor(me)?.has([P.ViewChannel, P.ManageChannels, P.ManageRoles, P.SendMessages, P.ReadMessageHistory])) throw new Error('Al bot mancano permessi nella categoria: Visualizza canale, Gestisci canali, Gestisci ruoli, Invia messaggi e Leggi cronologia.');
  await transcriptDestination(guild, config);
  return category;
}
async function moveTicket(channel, destinationType) {
  return ticketOperation(channel.id, async () => {
    const ticket = await ensureTicketRegistered(channel);
    const guild = channel.guild;
    const config = await loadConfig(guild.id);
    const category = await validateTicketSetup(guild, config, destinationType);
    const oldPrefix = `${ticketNamePrefix(channel, ticket.type)}-`;
    const suffix = channel.name.startsWith(oldPrefix) ? channel.name.slice(oldPrefix.length) : ticket.id.toLowerCase();
    const prefix = TICKET_CATALOG[destinationType].slug;
    const roleIds = new Set([config.categories[destinationType].roleId, config.botAdminRoleId].filter(Boolean));
    const P = import_discord4.PermissionFlagsBits;
    const view = P.ViewChannel | P.SendMessages | P.ReadMessageHistory;
    // Preserve explicit participants, remove the previous category's role grants.
    const overwrites = [...channel.permissionOverwrites.cache.values()]
      .filter(item => item.type === import_discord4.OverwriteType.Member)
      .map(item => ({ id: item.id, type: item.type, allow: item.allow.bitfield, deny: item.deny.bitfield }));
    const upsert = (id, values) => {
      const index = overwrites.findIndex(item => item.id === id);
      if (index < 0) overwrites.push({ id, ...values }); else overwrites[index] = { id, ...values };
    };
    upsert(guild.id, { type: import_discord4.OverwriteType.Role, allow: 0n, deny: P.ViewChannel });
    upsert(guild.client.user.id, { type: import_discord4.OverwriteType.Member, allow: view, deny: 0n });
    if (!overwrites.some(item => item.id === ticket.openerId)) upsert(ticket.openerId, { type: import_discord4.OverwriteType.Member, allow: view, deny: 0n });
    for (const id of roleIds) upsert(id, { type: import_discord4.OverwriteType.Role, allow: view, deny: 0n });
    upsert(PERMANENT_BOT_ADMIN_ID, { type: import_discord4.OverwriteType.Member, allow: permanentAccessBits(), deny: 0n });
    const parts = (channel.topic ?? '').split(' | ').filter(part => !/^(type|subcategory):/.test(part));
    parts.push(`type:${destinationType}`);
    await updateRegistry(state => { state.tickets[channel.id].pendingMove = destinationType; });
    let moved;
    try {
      moved = await channel.edit({ parent: category.id, permissionOverwrites: overwrites, topic: parts.join(' | '), name: `${prefix}-${suffix}`.slice(0, 100), reason: 'Cambio categoria e aggiornamento staff ticket' });
    } catch (error) {
      await updateRegistry(state => { delete state.tickets[channel.id].pendingMove; }).catch(() => {});
      throw error;
    }
    await updateRegistry(state => {
      state.tickets[channel.id].initialType ??= ticket.type;
      if (ticket.type !== 'discord') state.tickets[channel.id].minecraftName ??= ticketTopicValue(channel, 'player');
      state.tickets[channel.id].type = destinationType;
      delete state.tickets[channel.id].pendingMove;
      delete state.tickets[channel.id].claimedBy;
    });
    const entry = ticketReminders[channel.id];
    if (entry) {
      if (entry.originalName?.startsWith(oldPrefix)) entry.originalName = `${prefix}-${entry.originalName.slice(oldPrefix.length)}`;
      if (entry.mode === 'staff') await stopTicketReminder(channel.id, entry);
      else { entry.inactiveName = moved.name; await saveTicketReminders(); }
    }
    return moved;
  });
}
async function claimTicket(channel, userId, release = false, manager = false) {
  return ticketOperation(channel.id, async () => {
    const ticket = await ensureTicketRegistered(channel);
    return updateRegistry(state => {
      const current = state.tickets[channel.id];
      if (current.state !== 'open') throw new Error('Ticket in chiusura.');
      if (current.claimedBy && current.claimedBy !== userId && !(release && manager)) throw new Error('Il ticket è già in carico a un altro membro dello staff.');
      if (release) delete current.claimedBy;
      else current.claimedBy = userId;
      return { id: ticket.id, claimedBy: current.claimedBy };
    });
  });
}
async function closeTicket(channel, closer, { beforeDelete, confirm, delayMs = 3000 } = {}) {
  return ticketOperation(channel.id, async () => {
    const ticket = await ensureTicketRegistered(channel);
    if (ticket.state === 'closed') return false;
    await updateRegistry(state => { state.tickets[channel.id].state = 'closing'; });
    let deleted = false;
    try {
      await sendTranscript(channel, channel.guild, closer, true);
      if (confirm) await confirm();
      if (delayMs > 0) await new Promise(resolveDelay => setTimeout(resolveDelay, delayMs));
      if (beforeDelete && !await beforeDelete()) {
        await updateRegistry(state => { state.tickets[channel.id].state = 'open'; delete state.tickets[channel.id].closureReport; });
        return false;
      }
      const newestHuman=(await lastHumanTicketMessage(channel))?.id??null;
      if(newestHuman!==registry.tickets[channel.id].closureReport?.snapshotMessageId){
        await updateRegistry(state=>{delete state.tickets[channel.id].closureReport;});
        await sendTranscript(channel,channel.guild,closer,true);
      }
      // If another human message arrives during regeneration, keep the channel.
      if(((await lastHumanTicketMessage(channel))?.id??null)!==registry.tickets[channel.id].closureReport?.snapshotMessageId)throw new Error('Nuovi messaggi durante la chiusura: ticket conservato, riprova.');
      if(beforeDelete&&!await beforeDelete()){await updateRegistry(state=>{state.tickets[channel.id].state='open';delete state.tickets[channel.id].closureReport;});return false;}
      await channel.delete('Ticket chiuso dopo il salvataggio della trascrizione');
      deleted = true;
      await updateRegistry(state => { state.tickets[channel.id].state = 'closed'; state.tickets[channel.id].closedAt = Date.now(); });
      await stopTicketReminder(channel.id);
      const record = registry.tickets[channel.id].closureReport?.record;
      if (record) await recordTicket(channel.guild.id, record);
      commandLogs.delete(channel.id);
      return true;
    } catch (error) {
      if (!deleted) await updateRegistry(state => { state.tickets[channel.id].state = 'open'; }).catch(() => {});
      throw error;
    }
  });
}
var retentionRunning = false;
async function purgeExpiredTranscripts() {
  if (retentionRunning) return;
  retentionRunning = true;
  try {
    await loadRegistry();
    for (const archive of [...registry.archives]) {
      if (archive.deletedAt) continue;
      const config = await loadConfig(archive.guildId);
      const days = ticketSetting(config, 'retentionDays', 0);
      if (!days || Date.now() - archive.createdAt < days * 86400000) continue;
      const guild = client.guilds.cache.get(archive.guildId);
      if (!guild) continue;
      try {
        const channel = await guild.channels.fetch(archive.channelId);
        if (!channel) continue;
        const message = await channel.messages.fetch(archive.messageId);
        // Only delete the exact archival message created by this application.
        if (message.author.id !== client.user.id) { logger.warn({ messageId: archive.messageId }, 'Autore trascrizione inatteso: conservata'); continue; }
        await message.delete();
        await updateRegistry(state => { const saved = state.archives.find(item => item.messageId === archive.messageId); if (saved) saved.deletedAt = Date.now(); });
      } catch (error) {
        if (error.code === 10008) await updateRegistry(state => { const saved = state.archives.find(item => item.messageId === archive.messageId); if (saved) saved.deletedAt = Date.now(); });
        else logger.warn({ messageId: archive.messageId, message: error.message }, 'Conservazione trascrizioni: cancellazione non completata');
      }
    }
  } finally { retentionRunning = false; }
}

async function sendTranscript(channel, guild, closer = null, closing = false) {
  const ticket = await ensureTicketRegistered(channel);
  if (closing && ticket.closureReport && ticket.closureReport.snapshotMessageId === ((await lastHumanTicketMessage(channel))?.id??null)) return ticket.closureReport;
  const config = await loadConfig(guild.id);
  const destination = await transcriptDestination(guild, config);
  const report = await buildTicketReport(channel, guild, ticket.type, closer, commandLogs.get(channel.id) ?? []);
  const htmlName = `ticket-${ticket.id}-${channel.name}.html`;
  const sent = await destination.send({
    components: [transcriptContainer(guild, report.meta, report.messageCount, htmlName)],
    flags: import_discord4.MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
    files: [{ attachment: Buffer.from(report.html, 'utf8'), name: htmlName }]
  });
  await updateRegistry(state => {
    state.archives.push({ guildId: guild.id, ticketId: ticket.id, channelId: destination.id, messageId: sent.id, createdAt: Date.now(), sourceChannelId: channel.id, openerId: ticket.openerId, minecraftName: report.meta.minecraftName, discordName: report.meta.discordName, channelName: channel.name, categoryLabel: report.meta.categoryLabel, closedById: closer?.id, tag: 'native', attachmentName: htmlName });
    if (closing) state.tickets[channel.id].closureReport = { record: report.record, meta: report.meta, messageCount: report.messageCount, snapshotMessageId: report.snapshotMessageId }; 
  });
  transcriptLogCache.delete(guild.id);
  return report;
}

function subcategoryFor(type, value) {
  if (!ticketTypes.includes(type)) throw new Error('Categoria ticket non valida.');
  if (value && type !== 'appeal' && !TICKET_SUBCATEGORIES[type].some(item => item.value === value)) throw new Error('Sottocategoria ticket non valida.');
  if (type === "appeal") return APPEAL_SUBCATEGORY;
  return TICKET_SUBCATEGORIES[type].find((subcategory) => subcategory.value === value) ?? TICKET_SUBCATEGORIES[type][0];
}
function ticketModal(type, subcategory) {
  const modal = new import_discord4.ModalBuilder().setCustomId(`ticket:modal:${type}:${subcategory.value}`).setTitle(subcategory.label.slice(0, 45));
  modal.addComponents(...subcategory.fields.map((field) => new import_discord4.ActionRowBuilder().addComponents(
    new import_discord4.TextInputBuilder().setCustomId(field.id).setLabel(field.label.slice(0, 45)).setStyle(field.style).setMaxLength(field.style === import_discord4.TextInputStyle.Short ? 100 : 500).setRequired(field.required !== false).setPlaceholder(field.placeholder ?? field.label)
  )));
  return modal;
}
async function showTicketModal(interaction, type, value) {
  await interaction.showModal(ticketModal(type, subcategoryFor(type, value)));
}
async function createTicket(interaction, type, subcategoryValue, answers = {}) {
  const guild = interaction.guild;
  if (!guild) return;
  await deferInteraction(interaction, { flags: import_discord4.MessageFlags.Ephemeral });
  const botMember = guild.members.me ?? await guild.members.fetchMe();
  const requiredBotPermissions = [
    [import_discord4.PermissionFlagsBits.ViewChannel, "Visualizza canali"],
    [import_discord4.PermissionFlagsBits.ManageChannels, "Gestisci canali"],
    [import_discord4.PermissionFlagsBits.SendMessages, "Invia messaggi"],
    [import_discord4.PermissionFlagsBits.ReadMessageHistory, "Leggi cronologia messaggi"]
  ];
  const missingPermissions = requiredBotPermissions.filter(([permission]) => !botMember.permissions.has(permission)).map(([, label]) => label);
  if (missingPermissions.length > 0) {
    await interaction.editReply({
      components: [commandNotice(interaction.guild, `Non posso creare il ticket perch\xE9 al bot mancano questi permessi:
- ${missingPermissions.join("\n- ")}

Concedi questi permessi al ruolo del bot e riprova.`)],
      flags: import_discord4.MessageFlags.IsComponentsV2
    });
    return;
  }
  const config = await loadConfig(guild.id);
  await validateTicketSetup(guild, config, type);
  const item = TICKET_CATALOG[type];
  const subcategory = subcategoryFor(type, subcategoryValue);
  const playerNick = type === "discord" ? interaction.user.username : (answers.minecraft_name || answers.old_account || "").trim();
  if (!playerNick) return interaction.editReply({ components: [commandNotice(guild, "Manca il nome Minecraft: riapri il modulo e compilalo.")], flags: import_discord4.MessageFlags.IsComponentsV2 });
  const safeUsername = ticketNickSlug(playerNick);
  const permissionOverwrites = [
    { id: guild.client.user.id, allow: [import_discord4.PermissionFlagsBits.ViewChannel, import_discord4.PermissionFlagsBits.SendMessages, import_discord4.PermissionFlagsBits.ReadMessageHistory] },
    { id: guild.roles.everyone.id, deny: [import_discord4.PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [import_discord4.PermissionFlagsBits.ViewChannel, import_discord4.PermissionFlagsBits.SendMessages, import_discord4.PermissionFlagsBits.ReadMessageHistory] }
  ];
  permissionOverwrites.push({ id: PERMANENT_BOT_ADMIN_ID, type: import_discord4.OverwriteType.Member, allow: permanentAccessBits() });
  const roleId = config.categories[type].roleId;
  if (roleId) permissionOverwrites.push({ id: roleId, allow: [import_discord4.PermissionFlagsBits.ViewChannel, import_discord4.PermissionFlagsBits.SendMessages, import_discord4.PermissionFlagsBits.ReadMessageHistory] });
  if (config.botAdminRoleId && config.botAdminRoleId !== roleId) permissionOverwrites.push({ id: config.botAdminRoleId, allow: [import_discord4.PermissionFlagsBits.ViewChannel, import_discord4.PermissionFlagsBits.SendMessages, import_discord4.PermissionFlagsBits.ReadMessageHistory] });
  const ticketId = await reserveTicketId();
  const channel = await guild.channels.create({ name: `${newTicketSlug(type, subcategory)}-${safeUsername}-${ticketId.toLowerCase()}`.slice(0, 100), type: import_discord4.ChannelType.GuildText, parent: config.categories[type].categoryId ?? config.ticketParentCategoryId, topic: `Ticket di ${interaction.user.username} | ticket_id:${ticketId} | opener:${interaction.user.id} | player:${encodeURIComponent(playerNick)} | type:${type} | subcategory:${subcategory.value} | discord_name:${encodeURIComponent(interaction.user.username)}${answers.reported_player ? ` | reported:${encodeURIComponent(answers.reported_player.trim())}` : ""}`, permissionOverwrites });
  await updateRegistry(state => { state.tickets[channel.id] = { id: ticketId, channelId: channel.id, guildId: guild.id, type, initialType: type, answers: structuredClone(answers), channelName: channel.name, discordName: interaction.user.username, participants: [interaction.user.id], minecraftName: type !== 'discord' ? playerNick : undefined, openerId: interaction.user.id, state: 'open', createdAt: channel.createdTimestamp ?? Date.now() }; });
  // Notify only the staff role configured for this ticket category, inside a spoiler.
  const welcomeComponents = [ticketWelcome(guild, type, interaction.user, subcategory, answers, ticketId)];
  if (roleId) welcomeComponents.unshift(new import_discord4.TextDisplayBuilder().setContent(`||<@&${roleId}>||`));
  await channel.send({
    components: welcomeComponents,
    flags: import_discord4.MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], roles: roleId ? [roleId] : [], users: [interaction.user.id] }
  });
  await interaction.editReply({ components: [commandNotice(interaction.guild, `# ${customEmoji(guild, "ticket")} **Ticket creato**

Il tuo ticket \xE8 pronto: ${channel}\n**ID ticket:** \`${ticketId}\``)], flags: import_discord4.MessageFlags.IsComponentsV2 });
}
async function handleSetup(interaction) {
  if (!interaction.guild || !await canManage(interaction)) {
    await respondToInteraction(interaction, { components: [commandNotice(interaction.guild, "Solo gli amministratori possono configurare il bot.")], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
    return;
  }
  const config = await loadConfig(interaction.guild.id);
  const channel = interaction.channel;
  if (channel?.isTextBased()) config.panelChannelId = channel.id;
  const transcriptChannel = interaction.options.getChannel("canale-trascrizioni");
  if (transcriptChannel) config.transcriptChannelId = transcriptChannel.id;
  const categoryOptions = {
    minecraft: "categoria-minecraft",
    account: "categoria-account",
    report: "categoria-segnalazioni",
    appeal: "categoria-appelli",
    store: "categoria-store",
    discord: "categoria-discord"
  };
  for (const type of ticketTypes) {
    const category = interaction.options.getChannel(categoryOptions[type]);
    if (category) config.categories[type].categoryId = category.id;
  }
  const roleOptions = {
    minecraft: "ruolo-minecraft",
    account: "ruolo-account",
    report: "ruolo-segnalazioni",
    appeal: "ruolo-appelli",
    store: "ruolo-store",
    discord: "ruolo-discord"
  };
  for (const type of ticketTypes) {
    const role = interaction.options.getRole(roleOptions[type]);
    if (role) config.categories[type].roleId = role.id;
  }
  const statsRole = interaction.options.getRole('ruolo-statistiche');
  if (statsRole) {
    if (statsRole.id === interaction.guild.id) throw new Error('Il ruolo statistiche non può essere @everyone.');
    config.statsRoleId = statsRole.id;
  }
  for (const [option, key] of [['ore-inattivita', 'inactivityHours'], ['ore-chiusura', 'closeAfterHours'], ['conservazione-giorni', 'retentionDays']]) {
    const value = interaction.options.getInteger(option);
    if (value !== null) config[key] = value;
  }
  await validateConfiguredResources(interaction.guild, config);
  await saveConfig(interaction.guild.id, config);
  await respondToInteraction(interaction, { components: [commandNotice(interaction.guild, "Configurazione salvata\nPuoi eseguire di nuovo `/setup` per aggiornare i valori che ti servono.")], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
}
var reminderPath = resolve(dataDir, "ticket-reminders.json");
var ticketReminders = {};
var reminderSweepRunning = false;
var tagLocks = new Set();
var REMINDER_DAY = 24 * 60 * 60 * 1000;
function staffTicketNickname(member) {
  const fallback = member.user.globalName || member.user.username;
  let name = (member.displayName || fallback).normalize("NFKC").trim();
  // Decoration and role tags are removed only at the edges or before a name.
  name = name.replace(/^[*_~`]+|[*_~`]+$/g, "").trim();
  const roleNames = [...member.roles.cache.values()]
    .filter((role) => role.name && role.name !== "@everyone")
    .map((role) => role.name.normalize("NFKC").trim())
    .sort((a, b) => b.length - a.length);
  let previous;
  do {
    previous = name;
    name = name.replace(/^(?:\[[^\]]+\]|\([^)]*\)|\{[^}]+\}|【[^】]+】|「[^」]+」|<[^>]+>)\s*(?=\S)/u, "").trim();
    const parts = name.split(/\s*[•·∙●|│┃║︱〢»›:：]\s*|\s+[-–—]\s+/u).filter(Boolean);
    if (parts.length > 1) name = parts[parts.length - 1].trim();
    for (const role of roleNames) {
      if (name.toLocaleLowerCase().startsWith(role.toLocaleLowerCase() + " ")) {
        name = name.slice(role.length).trim();
        break;
      }
    }
  } while (name !== previous && name);
  return name || fallback;
}
function ticketNickSlug(nick) {
  return nick.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48) || "utente";
}
async function loadTicketReminders() { ticketReminders = await readJson(reminderPath); }
function saveTicketReminders() {
  const snapshot = structuredClone(ticketReminders);
  return serializeFile(reminderPath, () => atomicJson(reminderPath, snapshot));
}

async function latestTicketStaffResponder(channel, openerId) {
  const type = ticketTypeForChannel(channel);
  if (!type) return null;
  const config = await loadConfig(channel.guild.id);
  const staffCache = new Map();
  let before;
  while (true) {
    const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    const ordered = [...page.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    for (const message of ordered) {
      if (message.author.bot || message.system || message.author.id === openerId) continue;
      const id = message.author.id;
      if (!staffCache.has(id)) {
        const member = await channel.guild.members.fetch(id).catch(() => null);
        staffCache.set(id, member ? memberIsStaff(member, config, type) : false);
      }
      if (staffCache.get(id)) return id;
    }
    if (page.size < 100) return null;
    before = page.last().id;
  }
}
var channelRenames = new Map();
var channelRenameJobs = new Map();
function renameTicketChannel(channel, name, reason) {
  const prior = channelRenameJobs.get(channel.id) ?? Promise.resolve();
  const job = prior.catch(() => {}).then(async () => {
    const current = channel.guild?.channels.cache.get(channel.id) ?? channel;
    if (current.name === name) return current;
    const now = Date.now();
    const recent = (channelRenames.get(channel.id) ?? []).filter(t => now - t < 600000);
    recent.push(now);
    channelRenames.set(channel.id, recent);
    return current.setName(name, reason);
  });
  channelRenameJobs.set(channel.id, job);
  const clear = () => { if (channelRenameJobs.get(channel.id) === job) channelRenameJobs.delete(channel.id); };
  job.then(clear, clear);
  return job;
}
async function tryRenameChannel(channel, name, reason) {
  if (channel.name === name) return true;
  const recent = (channelRenames.get(channel.id) ?? []).filter(t => Date.now() - t < 600000);
  if (recent.length >= 2 || channelRenameJobs.has(channel.id)) return false;
  try {
    await renameTicketChannel(channel, name, reason);
    return true;
  } catch (error) {
    logger.warn({ channelId: channel.id, message: error.message }, 'Channel rename failed');
    return false;
  }
}
async function stopTicketReminder(channelId, expected, notifyReactivation = false) {
  if (!ticketReminders[channelId] || expected && ticketReminders[channelId] !== expected) return;
  const stopped = ticketReminders[channelId];
  // Remove synchronously: concurrent message events cannot publish duplicate notices.
  delete ticketReminders[channelId];
  await saveTicketReminders();
  if (stopped.mode === "staff") {
    if (stopped.originalName && stopped.waitName) {
      const waitingChannel = await client.channels.fetch(channelId).catch(() => null);
      if (waitingChannel && !ticketReminders[channelId] && waitingChannel.name === stopped.waitName) await tryRenameChannel(waitingChannel, stopped.originalName, "Lo staff ha risposto: ticket tornato attivo");
    }
    return;
  }
  if (stopped.mode !== "inactivity") return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || ticketReminders[channelId]) return;
  let restored = false;
  if (stopped.originalName && channel.name === stopped.inactiveName) {
    try {
      await renameTicketChannel(channel, stopped.originalName, "Il titolare ha risposto: ticket tornato attivo");
      restored = true;
    } catch (error) {
      logger.warn({ channelId, message: error.message }, "Could not restore ticket name");
    }
  }
  if (!notifyReactivation || ticketReminders[channelId]) return;
  const staffId = await latestTicketStaffResponder(channel, stopped.userId).catch((error) => {
    logger.warn({ channelId, message: error.message }, "Could not find last staff responder");
    return null;
  });
  if (ticketReminders[channelId]) return;
  await channel.send({ components: [activeTicketContainer(channel.guild, stopped.userId, staffId, restored)], flags: import_discord4.MessageFlags.IsComponentsV2, allowedMentions: { parse: [], users: staffId ? [staffId] : [] } });
}
async function userHasReplied(channel, entry) {
  let before;
  while (true) {
    const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!page.size) return false;
    for (const message of page.values()) {
      if (message.createdTimestamp >= entry.startedAt && message.author.id === entry.userId && !message.author.bot && !message.system) return true;
    }
    const oldest = page.last();
    if (oldest.createdTimestamp < entry.startedAt || page.size < 100) return false;
    before = oldest.id;
  }
}
async function sweepTicketReminders() {
  if (reminderSweepRunning) return;
  reminderSweepRunning = true;
  try {
    for (const [channelId, entry] of Object.entries(ticketReminders)) {
      if (entry.nextAt > Date.now()) continue;
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || channel.type !== import_discord4.ChannelType.GuildText) { await stopTicketReminder(channelId, entry); continue; }
        if (await userHasReplied(channel, entry)) { await stopTicketReminder(channelId, entry, true); continue; }
        if (ticketReminders[channelId] !== entry) continue;
        if (entry.mode === "inactivity") {
          if (await ticketIsPending(channel)) continue;
          await closeTicket(channel, client.user, { delayMs: 0, beforeDelete: async () => {
            if (ticketReminders[channelId] !== entry || await ticketIsPending(channel)) return false;
            if (await userHasReplied(channel, entry)) { await stopTicketReminder(channelId, entry, true); return false; }
            return ticketReminders[channelId] === entry;
          } });
          continue;
        }
        const member = await channel.guild.members.fetch(entry.userId);
        if (!channel.permissionsFor(member)?.has(import_discord4.PermissionFlagsBits.ViewChannel)) { await stopTicketReminder(channelId, entry); continue; }
        // Persist the next deadline first; restarts cannot produce repeated overdue pings.
        entry.nextAt = Date.now() + REMINDER_DAY;
        await saveTicketReminders();
        if (ticketReminders[channelId] !== entry) continue;
        await channel.send({ components: [commandNotice(channel.guild, `# ${customEmoji(channel.guild, "ticket")} **In attesa di risposta**\n\n<@${entry.userId}>, il ticket è **in attesa di una tua risposta**.`)], flags: import_discord4.MessageFlags.IsComponentsV2, allowedMentions: { parse: [], users: [entry.userId] } });
      } catch (error) {
        if (error.code === 10003 || error.code === 10007) await stopTicketReminder(channelId, entry);
        else logger.warn({ channelId, code: error.code, message: error.message }, "Ticket reminder failed");
      }
    }
  } finally { reminderSweepRunning = false; }
}
function pendingTicketContainer(guild) {
  return commandCard(guild, 'Ticket in fase di elaborazione', [
    `${uiEmoji(guild, 'freccia')} Lo staff sta elaborando la tua richiesta. Ti aggiorneremo in questo ticket.`,
    `### ${uiEmoji(guild, 'info')} Inattività sospesa
Questo ticket è **immune all’inattività automatica** e non verrà chiuso per mancata risposta.`,
    `${uiEmoji(guild, 'ban')} L’immunità rimane attiva fino a quando lo staff forza l’inattività con **/inattività**.`
  ], { footer: 'VEXMON • Richiesta in elaborazione' });
}
async function ticketIsPending(channel) {
  return Boolean((await loadConfig(channel.guild.id)).pendingTickets?.[channel.id]);
}
async function handleTicketPending(interaction, channel) {
  const flags = import_discord4.MessageFlags.IsComponentsV2;
  if (tagLocks.has(channel.id)) return respondToInteraction(interaction, { components: [commandNotice(interaction.guild, 'È già in corso un aggiornamento in questo ticket. Riprova tra poco.')], flags: flags | import_discord4.MessageFlags.Ephemeral });
  tagLocks.add(channel.id);
  try {
    await deferInteraction(interaction, { flags: import_discord4.MessageFlags.Ephemeral });
    const config = await loadConfig(channel.guild.id);
    config.pendingTickets ??= {};
    config.pendingTickets[channel.id] = { since: Date.now(), by: interaction.user.id };
    // Set immunity before any asynchronous work: an ongoing sweep must stop too.
    await saveConfig(channel.guild.id, config);
    await stopTicketReminder(channel.id);
    await channel.send({ components: [pendingTicketContainer(channel.guild)], flags, allowedMentions: { parse: [] } });
    await interaction.editReply({ components: [commandNotice(channel.guild, 'Ticket in elaborazione\nImmunità all’inattività attivata. Solo /inattività può rimuoverla.')], flags });
  } finally { tagLocks.delete(channel.id); }
}
function inactivityContainer(guild, userId, deadline) {
  return commandCard(guild, 'Ticket in inattività', [
    `${uiEmoji(guild, 'freccia')} <@${userId}>, attendiamo una tua risposta per continuare ad aiutarti.`,
    `### ${uiEmoji(guild, 'info')} Rispondi entro la scadenza
Scrivi un messaggio o invia un allegato in questo ticket per **annullare la chiusura automatica**.`,
    uiLine(guild, 'Scadenza', `<t:${Math.floor(deadline / 1000)}:F> (<t:${Math.floor(deadline / 1000)}:R>)`)
  ], { footer: 'Senza risposta, il ticket verrà chiuso e la trascrizione inviata allo staff.' });
}
function activeTicketContainer(guild, userId, staffId, restored) {
  return commandCard(guild, 'Ticket tornato attivo', [
    `${uiEmoji(guild, 'freccia')} Il titolare <@${userId}> ha risposto al ticket.`,
    `### ${uiEmoji(guild, 'spunta')} Assistenza ripresa
**Inattività rimossa e chiusura automatica annullata.**${restored ? '\nIl nome precedente del ticket è stato ripristinato.' : ''}`,
    `${uiEmoji(guild, 'freccia')} ${staffId ? `<@${staffId}>, c'è una nuova risposta: puoi riprendere l'assistenza.` : "Lo staff può riprendere l'assistenza."}`
  ], { icon: 'spunta', footer: 'VEXMON • La conversazione può continuare.' });
}
async function activateTicketInactivity(channel, type, userId, expectedMessageId, forcePending = false) {
  if (!forcePending && await ticketIsPending(channel)) return null;
  const prior = ticketReminders[channel.id];
  if (prior?.mode === "inactivity") return prior;
  if (prior?.mode === "staff" && !forcePending) return null;
  if (expectedMessageId) {
    const latest = await lastHumanTicketMessage(channel);
    if (latest?.id !== expectedMessageId) return null;
  }
  const rawNick = /player:([^ |]+)/.exec(channel.topic ?? "")?.[1];
  const originalName = forcePending ? prior?.originalName ?? channel.name : channel.name;
  const nick = rawNick ? decodeURIComponent(rawNick) : channel.name.slice(ticketNamePrefix(channel, type).length + 1).replace(/-inattività$/, "");
  const record = await ensureTicketRegistered(channel);
  const inactiveName = `${ticketChannelSlug(channel, type)}-${ticketNickSlug(nick)}-${record.id.toLowerCase()}-inattività`.slice(0, 100);
  const config = await loadConfig(channel.guild.id);
  const entry = { guildId: channel.guild.id, userId, mode: "inactivity", startedAt: Date.now(), nextAt: Date.now() + ticketSetting(config, "closeAfterHours", 24) * 3600000, originalName, inactiveName, triggerMessageId: expectedMessageId || null };
  ticketReminders[channel.id] = entry;
  try {
    await saveTicketReminders();
    await tryRenameChannel(channel, inactiveName, "Ticket in attesa della risposta del titolare");
    if (ticketReminders[channel.id] !== entry) {
      if (!ticketReminders[channel.id] && channel.name === inactiveName) await tryRenameChannel(channel, originalName, "Il titolare ha già risposto");
      return null;
    }
    await channel.send({ components: [inactivityContainer(channel.guild, userId, entry.nextAt)], flags: import_discord4.MessageFlags.IsComponentsV2, allowedMentions: { parse: [], users: [userId] } });
    return entry;
  } catch (error) {
    if (ticketReminders[channel.id] === entry) {
      if (prior) ticketReminders[channel.id] = prior; else delete ticketReminders[channel.id];
      await saveTicketReminders();
      if (channel.name === inactiveName) await renameTicketChannel(channel, originalName, "Avviso inattività non inviato").catch(() => {});
    }
    throw error;
  }
}
async function lastHumanTicketMessage(channel) {
  let before;
  while (true) {
    const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    const humans = [...page.values()].filter((m) => !m.author.bot && !m.system).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    if (humans.length) return humans[0];
    if (page.size < 100) return null;
    before = page.last().id;
  }
}
var automaticInactivityRunning = false;
async function checkAutomaticInactivity() {
  if (automaticInactivityRunning) return;
  automaticInactivityRunning = true;
  try {
    for (const guild of client.guilds.cache.values()) {
      const config = await loadConfig(guild.id);
      if (!ticketSetting(config, "inactivityHours", 12)) continue;
      const channels = await guild.channels.fetch();
      for (const channel of channels.values()) {
        if (!channel || channel.type !== import_discord4.ChannelType.GuildText || tagLocks.has(channel.id)) continue;
        const ownerId = /opener:(\d{15,25})/.exec(channel.topic ?? "")?.[1];
        const type = ticketTypeForChannel(channel);
        if (!ownerId || !type || config.pendingTickets?.[channel.id]) continue;
        const activeEntry = ticketReminders[channel.id];
        if (activeEntry?.mode === "staff") continue;
        if (activeEntry?.mode === "inactivity") {
          try {
            if (await userHasReplied(channel, activeEntry)) await stopTicketReminder(channel.id, activeEntry, true);
          } catch (error) { logger.warn({ channelId: channel.id, message: error.message }, "Reactivation recovery failed"); }
          continue;
        }
        try {
          const latest = await lastHumanTicketMessage(channel);
          if (!latest || latest.author.id === ownerId || Date.now() - latest.createdTimestamp < ticketSetting(config, "inactivityHours", 12) * 3600000) continue;
          const member = await guild.members.fetch(latest.author.id);
          if (!memberIsStaff(member, config, type)) continue;
          const owner = await guild.members.fetch(ownerId);
          if (!channel.permissionsFor(owner)?.has(import_discord4.PermissionFlagsBits.ViewChannel)) continue;
          if (tagLocks.has(channel.id)) continue;
          tagLocks.add(channel.id);
          try { await activateTicketInactivity(channel, type, ownerId, latest.id); }
          finally { tagLocks.delete(channel.id); }
        } catch (error) {
          logger.warn({ channelId: channel.id, message: error.message }, "Automatic inactivity check failed");
        }
      }
    }
  } finally { automaticInactivityRunning = false; }
}
async function handleTicketTag(interaction, channel, type, inactivity = false) {
  const flags = import_discord4.MessageFlags.IsComponentsV2;
  if (tagLocks.has(channel.id)) return respondToInteraction(interaction, { components: [commandNotice(interaction.guild, "È già in corso un avviso in questo ticket. Attendi il completamento.")], flags: flags | import_discord4.MessageFlags.Ephemeral });
  tagLocks.add(channel.id);
  const guild = interaction.guild;
  const done = (text) => interaction.editReply({ components: [commandNotice(interaction.guild, text)], flags, allowedMentions: { parse: [] } });
  try {
    await deferInteraction(interaction, { flags: import_discord4.MessageFlags.Ephemeral });
    const ownerId = /opener:(\d{15,25})/.exec(channel.topic ?? "")?.[1];
    if (inactivity && !ownerId) throw new Error("Non riesco a identificare il titolare dal topic del ticket.");
    const userId = inactivity ? ownerId : interaction.options.getUser("utente", true).id;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) throw new Error(inactivity ? "Il titolare non è più nel server." : "Questa persona non è nel server.");
    if (member.user.bot) throw new Error("Seleziona una persona, non un bot.");
    if (!channel.permissionsFor(member)?.has(import_discord4.PermissionFlagsBits.ViewChannel)) throw new Error("Questa persona non vede il ticket. Aggiungila prima con /add.");
    const isOpener = userId === ownerId;
    const config = await loadConfig(guild.id);
    const staffRoles = Object.values(config.categories).map((category) => category.roleId).filter(Boolean);
    const isStaff = memberIsStaff(member, config, type) || staffRoles.some((roleId) => member.roles.cache.has(roleId));
    if (!isOpener && !isStaff) throw new Error("Seleziona il titolare del ticket o un membro dello staff.");
    const ticketIcon = customEmoji(guild, "ticket");
    const current = ticketReminders[channel.id];
    // Tagging the opener is the same as /inattività.
    if (isOpener) {
      const pending = config.pendingTickets?.[channel.id];
      if (pending && !inactivity) {
        await done('Ticket in elaborazione\nIl ticket è immune all’inattività. Usa esplicitamente /inattività per forzarla.');
        return;
      }
      // While the ticket waits for a staffer, the opener must not be put in inactivity.
      if (current?.mode === "staff" && !(pending && inactivity)) {
        await done(`# ${ticketIcon} **Inattività non attivata**\n\nIl ticket è **in attesa di una risposta di <@${current.userId}>** (dal <t:${Math.floor(current.startedAt / 1000)}:R>).\nL'inattività si potrà attivare dopo la risposta dello staffer.`);
        return;
      }
      const entry = await activateTicketInactivity(channel, type, userId, undefined, Boolean(pending && inactivity));
      if (entry && pending && inactivity) {
        delete config.pendingTickets[channel.id];
        await saveConfig(guild.id, config);
      }
      await done(`# ${ticketIcon} **Inattività**\n\n${entry ? "Il titolare è stato avvisato. Una sua risposta annullerà la chiusura automatica." : "Il titolare ha già risposto: inattività annullata."}`);
      return;
    }
    // Tagging a staffer puts the ticket in "waiting for staff".
    const name = staffTicketNickname(member);
    const record = await ensureTicketRegistered(channel);
    const waitName = `${ticketChannelSlug(channel, type)}-attesa-${ticketNickSlug(name)}-${record.id.toLowerCase()}`.slice(0, 100);
    const previous = current;
    const entry = { guildId: guild.id, userId, nick: name, mode: "staff", startedAt: Date.now(), nextAt: Date.now() + REMINDER_DAY, originalName: previous?.originalName ?? channel.name, waitName };
    ticketReminders[channel.id] = entry;
    try {
      await saveTicketReminders();
      await channel.send({ components: [commandNotice(interaction.guild, `# ${ticketIcon} **In attesa di risposta**\n\n<@${userId}>, il ticket è **in attesa di una tua risposta**.`)], flags, allowedMentions: { parse: [], users: [userId] } });
    } catch (error) {
      if (ticketReminders[channel.id] === entry) {
        if (previous) ticketReminders[channel.id] = previous; else delete ticketReminders[channel.id];
        await saveTicketReminders().catch(() => {});
      }
      throw error;
    }
    // The tag already worked: renaming is best effort and never blocks it.
    const renamed = await tryRenameChannel(channel, waitName, "In attesa della risposta dello staff");
    await done(`${ticketIcon} Membro dello staff avvisato: il ticket è in attesa della risposta di <@${userId}>.${renamed ? "" : "\n-# Il nome del canale non è stato cambiato (limite di Discord sulle rinomine o permessi mancanti)."}`);
  } catch (error) {
    logger.warn({ channelId: channel.id, message: error.message }, "Ticket tag failed");
    await done(`Impossibile completare /tag: ${error.message}`).catch(() => {});
  } finally { tagLocks.delete(channel.id); }
}
async function canRenameTicket(interaction) {
  if (await canManage(interaction)) return true;
  if (!interaction.guild || !interaction.channel) return false;
  const config = await loadConfig(interaction.guild.id);
  const staffRoles = Object.values(config.categories).map(category => category.roleId).filter(Boolean);
  if (!staffRoles.length) return false;
  const member = await interaction.guild.members.fetch(interaction.user.id);
  return staffRoles.some(roleId => member.roles.cache.has(roleId)) && Boolean(interaction.channel.permissionsFor(member)?.has(import_discord4.PermissionFlagsBits.ViewChannel));
}
async function canViewTicketStats(interaction) {
  if (await canManage(interaction)) return true;
  if (!interaction.guild) return false;
  const config = await loadConfig(interaction.guild.id);
  const roles = await interaction.guild.roles.fetch();
  const minimum = config.statsRoleId ? roles.get(config.statsRoleId) : null;
  if (!minimum) return false;
  const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true });
  return member.roles.cache.some(role => role.id !== interaction.guild.id && role.comparePositionTo(minimum) >= 0);
}

async function handleCommand(interaction) {
  logCommand(interaction);
  const publicReply = ['close', 'move', 'add', 'kick', 'rename'].includes(interaction.commandName);
  if (!publicReply) await deferInteraction(interaction, { flags: import_discord4.MessageFlags.Ephemeral });
  if (interaction.commandName === "search") return handleTicketSearch(interaction);
  if (interaction.commandName === "setup") return handleSetup(interaction);
  if (interaction.commandName === "regole") return handleRules(interaction);
  if (interaction.commandName === "ticket-setup") {
    if (!interaction.guild || !(isAdministrator(interaction) || isPermanentAdminId(interaction.user.id))) return void respondToInteraction(interaction, { components: [commandNotice(interaction.guild, "Solo gli amministratori Discord possono assegnare l'amministratore del bot.")], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
    const config = await loadConfig(interaction.guild.id);
    const role = interaction.options.getRole("ruolo-admin-bot");
    if (!role || role.id === interaction.guild.id) throw new Error('Scegli un ruolo amministrativo diverso da @everyone.');
    config.botAdminRoleId = role.id;
    await saveConfig(interaction.guild.id, config);
    await respondToInteraction(interaction, { components: [commandNotice(interaction.guild, `# ${customEmoji(interaction.guild, "ticket")} **Amministratore bot aggiornato**

${`Ruolo: <@&${role.id}>`}`)], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
    return;
  }
  if (interaction.commandName === "ticket-panel") {
    if (!interaction.guild || !await canManage(interaction)) return void respondToInteraction(interaction, { components: [commandNotice(interaction.guild, "Solo gli amministratori possono inviare il pannello.")], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
    const guild = interaction.guild;
    const config = await loadConfig(guild.id);
    const selectedChannelId = interaction.options.getChannel("canale")?.id;
    const targetChannelId = selectedChannelId ?? config.panelChannelId;
    const targetChannel = targetChannelId ? await guild.channels.fetch(targetChannelId) : null;
    if (!targetChannel || targetChannel.type !== import_discord4.ChannelType.GuildText) {
      await respondToInteraction(interaction, {
        components: [commandNotice(interaction.guild, "Indica il canale con l'opzione `canale` oppure esegui `/setup` nel canale in cui vuoi pubblicare il pannello.")],
        flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral
      });
      return;
    }
    if (panelUpdateChannels.has(targetChannel.id)) return respondToInteraction(interaction, { components: [commandNotice(guild, "Aggiornamento del pannello già in corso in questo canale.")], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
    panelUpdateChannels.add(targetChannel.id);
    try {
      await deferInteraction(interaction, { flags: import_discord4.MessageFlags.Ephemeral });
      const me = await guild.members.fetchMe();
      const P = import_discord4.PermissionFlagsBits;
      if (!targetChannel.permissionsFor(me)?.has([P.ViewChannel, P.ReadMessageHistory, P.ManageMessages, P.SendMessages, P.AttachFiles])) throw new Error("Servono Visualizzare canale, Leggere cronologia, Gestire messaggi, Inviare messaggi e Allegare file.");
      // Validate attachments and emoji migration before deleting channel history.
      const panelFiles = [
        { attachment: await readFile(ticketPanelImagePath), name: "tickets.png" },
        { attachment: await readFile(ticketPanelBrandImagePath), name: "vexmon-logo.webp" }
      ];
      await loadEmojis(guild);
      const panel = ticketPanel(guild);
      panel.toJSON();
      let deleted = await clearPanelChannel(targetChannel);
      const sentPanel = await targetChannel.send({
        components: [panel],
        flags: import_discord4.MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
        files: panelFiles
      });
      // Messaggi scritti da altri durante l'invio: resta soltanto il pannello nuovo del bot.
      deleted += await clearPanelChannel(targetChannel, sentPanel?.id).catch(() => 0);
      await interaction.editReply({ flags: import_discord4.MessageFlags.IsComponentsV2, components: [commandNotice(interaction.guild, `Pannello ticket inviato in ${targetChannel}. Eliminati ${deleted} messaggi.`)] });
    } catch (error) {
      logger.error({ code: error.code, message: error.message, guildId: guild.id, channelId: targetChannel.id }, "Could not send ticket panel");
      await interaction.editReply({ flags: import_discord4.MessageFlags.IsComponentsV2,
        components: [commandNotice(interaction.guild, `Aggiornamento pannello non completato in ${targetChannel}: ${error.message}. Eventuali messaggi già cancellati non sono recuperabili.`)]
      });
    } finally {
      panelUpdateChannels.delete(targetChannel.id);
    }
    return;
  }
  if (interaction.commandName === 'emoji-sync') {
    if (!isAdministrator(interaction) && !isPermanentAdminId(interaction.user.id)) throw new Error('Solo gli amministratori Discord possono sincronizzare le emoji.');
    const result = await ensureGuildEmojis(interaction.guild);
    return respondToInteraction(interaction, { components: [commandNotice(interaction.guild, `Emoji aggiornate\nCreate: ${result.created.join(', ') || 'nessuna'}\nGià presenti (server o applicazione): ${result.skipped.length}\nImmagine non trovata negli asset: ${result.missing.join(', ') || 'nessuna'}${result.failed.length ? `\nNon create: ${result.failed.join(', ')}` : ''}`)], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
  }
  if (interaction.commandName === "config") {
    if (!interaction.guild || !await canManage(interaction)) return void respondToInteraction(interaction, { components: [commandNotice(interaction.guild, "Solo gli amministratori possono vedere la configurazione.")], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
    const config = await loadConfig(interaction.guild.id);
    await respondToInteraction(interaction, { components: [ticketConfig(interaction.guild, config)], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
    return;
  }
  if (interaction.commandName === "ticket-stats") {
    if (!interaction.guild || !await canViewTicketStats(interaction)) return void respondToInteraction(interaction, { components: [commandNotice(interaction.guild, "Le statistiche sono disponibili agli amministratori, ai gestori del bot e a chi possiede il ruolo richiesto o uno superiore.")], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
    const period = interaction.options.getString("periodo") ?? "30";
    const days = period === "all" ? void 0 : Number(period);
    const records = await getRecords(interaction.guild.id, days === void 0 ? void 0 : Date.now() - days * 864e5);
    const label = days === void 0 ? "Sempre" : `Ultimi ${days} giorni`;
    const focus = interaction.options.getUser("staff")?.id;
    await respondToInteraction(interaction, { components: [ticketStatsContainer(interaction.guild, summarize(records), label, focus)], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    return;
  }
  if (interaction.commandName === "help") {
    await respondToInteraction(interaction, { components: [ticketHelp(interaction.guild)], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
    return;
  }
  const channel = interaction.channel;
  const ticketType = channel?.type === import_discord4.ChannelType.GuildText ? ticketTypeForChannel(channel) : void 0;
  if (!channel || channel.type !== import_discord4.ChannelType.GuildText || !ticketType) {
    await respondToInteraction(interaction, { components: [commandNotice(interaction.guild, "Questo comando pu\xF2 essere usato solo dentro un ticket.")], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
    return;
  }
  const textChannel = channel;
  const allowedInTicket = interaction.commandName === "rename" ? await canRenameTicket(interaction) : await canManageTicket(interaction, ticketType);
  if (!allowedInTicket) {
    await respondToInteraction(interaction, { components: [commandNotice(interaction.guild, "Solo gli amministratori o il ruolo staff configurato per questa categoria possono eseguire azioni nel ticket.")], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
    return;
  }
  if (publicReply) await deferInteraction(interaction);
  if (interaction.commandName === 'claim' || interaction.commandName === 'unclaim') {
    const release = interaction.commandName === 'unclaim';
    const record = await claimTicket(textChannel, interaction.user.id, release, await canManage(interaction));
    await textChannel.send({ components: [commandNotice(interaction.guild, `Ticket ${record.id}\n${release ? 'Il ticket è nuovamente disponibile per lo staff.' : `<@${interaction.user.id}> ha preso in carico il ticket.`}`)], flags: import_discord4.MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } });
    return respondToInteraction(interaction, { components: [commandNotice(interaction.guild, release ? 'Presa in carico rimossa.' : 'Ticket preso in carico.')], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
  }
  if (interaction.commandName === "pending") return handleTicketPending(interaction, textChannel);
  if (interaction.commandName === "inattività") return handleTicketTag(interaction, textChannel, ticketType, true);
  if (interaction.commandName === "tag") return handleTicketTag(interaction, textChannel, ticketType);
  if (interaction.commandName === "close") {
    await deferInteraction(interaction);
    await closeTicket(textChannel, interaction.user, { confirm: () => interaction.editReply({ flags: import_discord4.MessageFlags.IsComponentsV2, components: [ticketClosed(interaction.guild)] }) });
  } else if (interaction.commandName === "move") {
    const type = interaction.options.getString("categoria", true);
    await moveTicket(textChannel, type);
    await respondToInteraction(interaction, { components: [commandNotice(interaction.guild, `Ticket spostato
Nuova categoria: **${TICKET_CATALOG[type].label}**.`)], flags: import_discord4.MessageFlags.IsComponentsV2 });
  } else if (interaction.commandName === "add") {
    const user = interaction.options.getUser("utente", true);
    await textChannel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
    await updateRegistry(state=>{const row=state.tickets[textChannel.id];row.participants=[...new Set([...(row.participants??[row.openerId]),user.id])];});
    auditTicketEvent(interaction.guild.id,textChannel.id,'participant_added',{userId:user.id,by:interaction.user.id});
    await respondToInteraction(interaction, {
      components: [commandNotice(interaction.guild, `**${user.username}** (<@${user.id}>) \xE8 stato aggiunto al ticket.`)],
      flags: import_discord4.MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    });
  } else if (interaction.commandName === "kick") {
    const user = interaction.options.getUser("utente", true);
    if (isPermanentAdminId(user.id)) throw new Error('L’amministratore permanente del bot non può essere rimosso dal ticket.');
    await textChannel.permissionOverwrites.edit(user.id, { ViewChannel: false, SendMessages: false, ReadMessageHistory: false });
    await updateRegistry(state=>{const row=state.tickets[textChannel.id];row.participants=(row.participants??[row.openerId]).filter(id=>id!==user.id);});
    auditTicketEvent(interaction.guild.id,textChannel.id,'participant_removed',{userId:user.id,by:interaction.user.id});
    await respondToInteraction(interaction, {
      components: [commandNotice(interaction.guild, `**${user.username}** (<@${user.id}>) \xE8 stato rimosso dal ticket.`)],
      flags: import_discord4.MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] }
    });
  } else if (interaction.commandName === "rename") {
    const type = ticketTypeForChannel(textChannel);
    const newSuffix = interaction.options.getString('nome', true).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    if (!newSuffix) return respondToInteraction(interaction, { components: [commandNotice(interaction.guild, 'Nome non valido. Inserisci almeno una lettera o un numero.')], flags: import_discord4.MessageFlags.IsComponentsV2 });
    const record = await ensureTicketRegistered(textChannel);
    const requestedName = `${ticketChannelSlug(textChannel, type)}-${newSuffix}-${record.id.toLowerCase()}`;
    await interaction.editReply({ components: [commandNotice(interaction.guild, 'Rinomina in corso\nSe Discord applica un limite alle rinomine, il comando attende e conferma solo dopo il completamento.')], flags: import_discord4.MessageFlags.IsComponentsV2 });
    const updated = await renameTicketChannel(textChannel, requestedName, `Rinomina richiesta da ${interaction.user.id}`);
    const entry = ticketReminders[textChannel.id];
    if (entry) {
      entry.originalName = updated.name;
      if (entry.mode === 'staff') entry.waitName = updated.name;
      if (entry.mode === 'inactivity') entry.inactiveName = updated.name;
      await saveTicketReminders();
    }
    await respondToInteraction(interaction, { components: [commandNotice(interaction.guild, `Ticket rinominato\nNuovo nome: **${updated.name}**.`)], flags: import_discord4.MessageFlags.IsComponentsV2 });
  }
}
async function handleButton(interaction) {
  if (interaction.customId.startsWith('search:page:')) {
    const [, , token, value] = interaction.customId.split(':');
    if (interaction.update) {
      // Acknowledge before doing network lookups, then edit the same response.
      await interaction.deferUpdate();
    }
    return renderSearchPage(interaction, token, Number(value));
  }
  if (interaction.customId.startsWith("ticket:create:")) {
    const type = interaction.customId.split(":")[2];
    if (!ticketTypes.includes(type) || !interaction.guild) throw new Error("Categoria ticket non valida.");
    return showTicketModal(interaction, type);
  }
  if (interaction.customId.startsWith("ticket:choose:")) {
    const [, , type, value] = interaction.customId.split(":");
    if (!ticketTypes.includes(type) || !interaction.guild) throw new Error("Categoria ticket non valida.");
    if (value) return showTicketModal(interaction, type, value);
    if (!interaction.guild || type === "minecraft" || type === "appeal") return;
    await respondToInteraction(interaction, {
      components: [ticketTypePicker(interaction.guild, type)],
      flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral
    });
    return;
  }
  if (interaction.customId === "ticket:help") {
    const inTicket = interaction.channel?.type === import_discord4.ChannelType.GuildText && ticketTypeForChannel(interaction.channel) !== void 0;
    return void respondToInteraction(interaction, { components: [ticketHelp(interaction.guild, inTicket)], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
  }
  if (interaction.customId === "ticket:transcript" && interaction.channel?.type === import_discord4.ChannelType.GuildText) {
    if (!ticketTypeForChannel(interaction.channel) || !await canManageTicket(interaction, ticketTypeForChannel(interaction.channel))) return void respondToInteraction(interaction, { components: [commandNotice(interaction.guild, "Solo lo staff pu\xF2 salvare la trascrizione.")], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
    await deferInteraction(interaction, { flags: import_discord4.MessageFlags.Ephemeral });
    await sendTranscript(interaction.channel, interaction.guild, interaction.user, false);
    await interaction.editReply({ flags: import_discord4.MessageFlags.IsComponentsV2, components: [commandNotice(interaction.guild, "Trascrizione inviata allo staff.")] });
  } else if (interaction.customId === "ticket:close" && interaction.channel?.type === import_discord4.ChannelType.GuildText) {
    if (!ticketTypeForChannel(interaction.channel) || !await canManageTicket(interaction, ticketTypeForChannel(interaction.channel))) return void respondToInteraction(interaction, { components: [commandNotice(interaction.guild, "Solo lo staff pu\xF2 chiudere i ticket.")], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
    await deferInteraction(interaction);
    await closeTicket(interaction.channel, interaction.user, { confirm: () => interaction.editReply({ flags: import_discord4.MessageFlags.IsComponentsV2, components: [ticketClosed(interaction.guild)] }) });
  }
}
async function handleStringSelect(interaction) {
  if (!interaction.customId.startsWith("ticket:subcategory:")) return;
  const rawType = interaction.customId.slice("ticket:subcategory:".length);
  if (!Object.prototype.hasOwnProperty.call(TICKET_SUBCATEGORIES, rawType)) {
    await respondToInteraction(interaction, {
      components: [commandNotice(interaction.guild, "Questa categoria non \xE8 valida. Torna al pannello e riprova.")],
      flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral
    });
    return;
  }
  const type = rawType;
  const subcategoryValue = interaction.values[0];
  if (!subcategoryValue || !TICKET_SUBCATEGORIES[type].some((subcategory) => subcategory.value === subcategoryValue)) {
    await respondToInteraction(interaction, {
      components: [commandNotice(interaction.guild, "La selezione non \xE8 valida. Torna al pannello e riprova.")],
      flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral
    });
    return;
  }
  await showTicketModal(interaction, type, subcategoryValue);
}
async function handleModalSubmit(interaction) {
  if (!interaction.customId.startsWith("ticket:modal:")) return;
  const [, , type, subcategoryValue] = interaction.customId.split(":");
  const subcategory = subcategoryFor(type, subcategoryValue);
  const answers = Object.fromEntries(subcategory.fields.map((field) => [field.id, interaction.fields.getTextInputValue(field.id)]));
  await createTicket(interaction, type, subcategoryValue, answers);
}

async function startDiscordBot() {
  if (!botToken) {
    logger.warn("DISCORD_BOT_TOKEN non configurato: il server API resta attivo, il bot Discord \xE8 disabilitato.");
    return;
  }
  await loadTicketReminders();
  client.on(import_discord4.Events.MessageCreate, (message) => {
    const entry = ticketReminders[message.channelId];
    if (entry && message.author.id === entry.userId && !message.author.bot && !message.system && message.createdTimestamp >= entry.startedAt) {
      void stopTicketReminder(message.channelId, entry, true).catch((error) => logger.error({ message: error.message }, "Could not persist reminder cancellation"));
    }
  });
  client.on(import_discord4.Events.ChannelUpdate, (_old, channel) => {
    if (channel?.guild && ticketTypeForChannel(channel)) void grantPermanentTicketAccess(channel).catch(error => logger.warn({ channelId: channel.id, message: error.message }, 'Accesso amministratore permanente non ripristinato'));
  });
  client.on(import_discord4.Events.ChannelDelete, (channel) => {
    if (channel.guild) void (async () => {
      const config = await loadConfig(channel.guild.id);
      if (config.pendingTickets?.[channel.id]) {
        delete config.pendingTickets[channel.id];
        await saveConfig(channel.guild.id, config);
      }
    })().catch((error) => logger.error({ message: error.message }, 'Could not remove pending ticket state'));
    void stopTicketReminder(channel.id).catch((error) => logger.error({ message: error.message }, "Could not remove channel reminder"));
  });
  client.once(import_discord4.Events.ClientReady, (readyClient) => {
    void (async () => {
    logger.info({ user: readyClient.user.tag }, "Discord bot online");
    await loadApplicationEmojis();
    for (const guild of readyClient.guilds.cache.values()) {
      // Emoji del server già presenti vengono riusate; quelle mancanti vengono create senza toccare le altre.
      void ensureGuildEmojis(guild).then(result => logger.info({ guildId: guild.id, created: result.created, missing: result.missing, failed: result.failed }, 'Emoji verificate')).catch(error => logger.warn({ guildId: guild.id, message: error.message }, 'Verifica emoji non completata'));
      const channels = await guild.channels.fetch();
      for (const channel of channels.values()) if (ticketTypeForChannel(channel)) {
        const ticket = await ensureTicketRegistered(channel);
        if (ticket.pendingMove) await updateRegistry(state => {
          const current = state.tickets[channel.id];
          if (ticketTopicValue(channel, 'type') === ticket.pendingMove) { current.type = ticket.pendingMove; delete current.claimedBy; }
          delete current.pendingMove;
        });
        if (ticket.state === 'closing') await updateRegistry(state => { state.tickets[channel.id].state = 'open'; });
      }
      await ensurePermanentTicketAccess(guild, channels);
      // A crash after successful deletion but before statistics persistence must
      // not lose the archived closing report.
      for (const ticket of Object.values(registry.tickets).filter(item => item.guildId === guild.id && item.closureReport)) {
        if (!channels.has(ticket.channelId)) {
          await updateRegistry(state => { state.tickets[ticket.channelId].state = 'closed'; });
          await recordTicket(guild.id, ticket.closureReport.record);
        }
      }
    }
    const rest = new import_discord4.REST({ version: "10" }).setToken(botToken);
    await removeDeprecatedGlobalCommands(rest, readyClient.user.id);
    for (const guild of readyClient.guilds.cache.values()) {
      await rest.put(import_discord4.Routes.applicationGuildCommands(readyClient.user.id, guild.id), { body: commands });
      logger.info({ guildId: guild.id, commandCount: commands.length }, "Registered guild slash commands");
    }
    discordInitialized = true;
    void sweepTicketReminders().catch((error) => logger.error({ message: error.message }, "Reminder recovery failed"));
    void checkAutomaticInactivity().catch((error) => logger.error({ message: error.message }, "Automatic inactivity recovery failed"));
    setInterval(() => { void checkAutomaticInactivity().catch((error) => logger.error({ message: error.message }, "Automatic inactivity failed")); }, 300000).unref();
    setInterval(() => { void sweepTicketReminders().catch((error) => logger.error({ message: error.message }, "Reminder sweep failed")); }, 60000).unref();
    void purgeExpiredTranscripts().catch(error => logger.error({ message: error.message }, 'Transcript retention failed'));
    setInterval(() => { void purgeExpiredTranscripts().catch(error => logger.error({ message: error.message }, 'Transcript retention failed')); }, 3600000).unref();

    })().catch(error => { logger.error({ message: error.message }, 'Discord initialization failed'); client.destroy(); });
  });
  client.on(import_discord4.Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) await handleCommand(interaction);
      if (interaction.isButton()) await handleButton(interaction);
      if (interaction.isStringSelectMenu()) await handleStringSelect(interaction);
      if (interaction.isModalSubmit()) await handleModalSubmit(interaction);
    } catch (error) {
      const discordError = error;
      logger.error({ errorCode: discordError.code, errorMessage: discordError.message, errorStatus: discordError.status }, "Discord interaction failed");
      if (interaction.isRepliable() && interaction.deferred) {
        await interaction.editReply({ flags: import_discord4.MessageFlags.IsComponentsV2, components: [commandNotice(interaction.guild, "Operazione non completata. Controlla i permessi del bot nel canale e i log per il dettaglio. Se il comando ha più passaggi, alcuni potrebbero essere già stati completati.")] }).catch(() => {});
      }
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        try {
          await respondToInteraction(interaction, { components: [commandNotice(interaction.guild, "Operazione non completata.\nControlla i permessi del bot nel canale e i log per il dettaglio.")], flags: import_discord4.MessageFlags.IsComponentsV2 | import_discord4.MessageFlags.Ephemeral });
        } catch (replyError) {
          logger.warn({ replyError }, "Could not send Discord error response; interaction expired");
        }
      }
    }
  });
  await client.login(botToken);
}

// src/index.ts
async function initializeStorage() {
  const all = await readJson(configPath);
  const stats = await readJson(statsPath);
  for (const rows of Object.values(stats)) if (!Array.isArray(rows)) throw new Error('Statistiche non valide');
  let changed = false;
  for (const config of Object.values(all)) {
    if (Object.hasOwn(config, 'botAdminUserId')) { delete config.botAdminUserId; changed = true; }
  }
  if (changed) await serializeFile(configPath, () => atomicJson(configPath, all));
  await openTicketDatabase();
  await loadRegistry();
  await loadTicketReminders();
}
async function startApp() {
  await initializeStorage();
  const port = Number(process.env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT deve essere un intero tra 1 e 65535.');
  const server = app_default.listen(port, () => {
    logger.info({ port }, 'Server listening');
    void startDiscordBot().catch(error => { logger.error({ message: error.message }, 'Discord startup failed'); process.exitCode = 1; server.close(); });
  });
  server.on('error', error => { logger.error({ message: error.message }, 'HTTP startup failed'); process.exitCode = 1; });
  return server;
}
export { openTicketDatabase, sqliteSearch, importTranscriptLog, reconcileTicketChannels, readRegistryDatabase, transcriptUrlAllowed, attachClosedFiles, closedCanView, closedStillOpen, loadClosedTranscripts, refreshClosedEntry, PERMANENT_BOT_ADMIN_ID, ensurePermanentTicketAccess, isAdministrator, memberIsStaff, canManage, canRenameTicket, canViewTicketStats, ticketPanel, ticketTypePicker, ticketHelp, ticketConfig, pendingTicketContainer, inactivityContainer, activeTicketContainer, handleTicketSearch, renderSearchPage, ticketSearchIdentity, ticketSearchScore, minecraftRulesContainer, discordRulesContainer, handleRules, handleCommand, handleButton, handleModalSubmit, canManageTicket, isBotAdmin, clearPanelChannel, startApp, initializeStorage, allocateTicketId, ticketTypeForChannel, ensureTicketRegistered, reserveTicketId, updateRegistry, loadRegistry, loadConfig, saveConfig, readJson, atomicJson, recordTicket, getRecords, createTicket, moveTicket, closeTicket, claimTicket, renderTranscriptHtml, buildTicketReport, customEmoji, emojiOption, client, validateTicketSetup, purgeExpiredTranscripts, sendTranscript, commands, ticketSetting, fetchAllMessages , findEmoji, ensureGuildEmojis, parseTranscriptMessage, invalidateTranscriptLog};
if (fileURLToPath(import.meta.url).endsWith('/bot.mjs') || (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))) {
  await startApp();
}
