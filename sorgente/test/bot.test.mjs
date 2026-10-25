import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dataDir = await mkdtemp(join(tmpdir(), 'vexmon-test-'));
process.env.DATA_DIR = dataDir;
process.env.NODE_ENV = 'production';
await writeFile(join(dataDir, 'ticket-config.json'), JSON.stringify({ oldGuild: { botAdminUserId: '111111111111111111', categories: {} } }));
const bot = await import('../app.mjs');
const { require_src2 } = await import('../vendor.mjs');
const D = require_src2();
const { Collection, PermissionsBitField, PermissionFlagsBits: P, ChannelType: C } = D;
await bot.initializeStorage();
const guildId = '100000000000000001', openerId = '100000000000000002', botId = '100000000000000003';
const staffId = '100000000000000004', secondStaffId = '100000000000000005';
let sequence = 100000000000000100n;
const nextId = () => String(++sequence);
const role = id => ({ id, name: id, comparePositionTo: () => 0 });
const oldRole = role('100000000000000010'), newRole = role('100000000000000011'), adminRole = role('100000000000000012');
const fullPermissions = new PermissionsBitField(PermissionsBitField.All);
const noPermissions = new PermissionsBitField(0n);
const member = (id, roles = []) => ({ id, displayName: `Member-${id}`, user: { id, username: `user${id}`, bot: false }, permissions: noPermissions, roles: { cache: new Collection(roles.map(r => [r.id, r])) } });
const members = new Collection([[openerId, member(openerId)], [staffId, member(staffId, [oldRole])], [secondStaffId, member(secondStaffId, [newRole])]]);
const guild = { id: guildId, name: 'Test guild', client: bot.client, roles: { everyone: { id: guildId }, cache: new Collection([[guildId, role(guildId)], [oldRole.id, oldRole], [newRole.id, newRole], [adminRole.id, adminRole]]), async fetch(id) { return id ? this.cache.get(id) : this.cache; } }, members: { me: { id: botId, permissions: fullPermissions }, cache: members, async fetch(id) { return members.get(typeof id === 'string' ? id : id.user) ?? null; }, async fetchMe() { return this.me; } } };
const channels = new Collection();
guild.channels = { cache: channels, async fetch(id) { return id ? channels.get(id) ?? null : channels; }, async create(options) { const channel = fakeChannel(options); channels.set(channel.id, channel); return channel; } };
bot.client.user = { id: botId, bot: true };
bot.client.guilds.cache.set(guildId, guild);
bot.client.application = { emojis: { cache: new Collection(), async fetch() { return this.cache; } } };

function fakeChannel(options = {}) {
  const messages = new Collection();
  const channel = {
    id: nextId(), guild, name: options.name ?? 'test', type: options.type ?? C.GuildText, topic: options.topic ?? '', createdTimestamp: Date.now(), sent: [], deleted: false, lastMessageId: undefined,
    permissionOverwrites: { cache: new Collection((options.permissionOverwrites ?? []).map(item => [item.id, { ...item, type: item.type ?? (item.id === guildId || [oldRole.id, newRole.id, adminRole.id].includes(item.id) ? 0 : 1), allow: new PermissionsBitField(item.allow ?? 0n), deny: new PermissionsBitField(item.deny ?? 0n) }])) },
    permissionsFor(who) { return (who?.id ?? who) === guildId ? noPermissions : fullPermissions; },
    isTextBased() { return true; },
    async setTopic(value) { this.topic = value; return this; },
    async setName(value) { this.name = value; return this; },
    async edit(options) { this.name = options.name; this.topic = options.topic; this.parentId = options.parent; this.permissionOverwrites.cache = new Collection(options.permissionOverwrites.map(item => [item.id, { ...item, allow: new PermissionsBitField(item.allow), deny: new PermissionsBitField(item.deny) }])); return this; },
    async send(payload) {
      for (const component of payload.components ?? []) component.toJSON();
      this.sent.push(payload);
      const sent = { id: nextId(), content: '', author: { id: botId, username: 'Vexmon', bot: true, displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png' }, createdTimestamp: Date.now(), system: false, mentions: { users: new Collection() }, attachments: new Collection(), components: payload.components ?? [], embeds: [], deleted: false, async delete() { this.deleted = true; } };
      messages.set(sent.id, sent); this.lastMessageId = sent.id;
      return sent;
    },
    async bulkDelete(rows) { for (const id of rows.keys()) this.messages.cache.delete(id); return rows; },
    async delete() { this.deleted = true; channels.delete(this.id); },
    toString() { return `<#${this.id}>`; },
    messages: { async fetch(options) {
      if (typeof options === 'string') { const message = messages.get(options); if (!message) throw Object.assign(new Error('Unknown Message'), { code: 10008 }); return message; }
      const rows = [...messages.values()].filter(m => m.content !== undefined && (!options.before || BigInt(m.id) < BigInt(options.before))).sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1).slice(0, options.limit);
      return new Collection(rows.map(m => [m.id, m]));
    }, cache: messages }
  };
  return channel;
}
const category = fakeChannel({ type: C.GuildCategory }), destCategory = fakeChannel({ type: C.GuildCategory }), archive = fakeChannel();
for (const channel of [category, destCategory, archive]) channels.set(channel.id, channel);
const config = { botAdminRoleId: adminRole.id, transcriptChannelId: archive.id, categories: Object.fromEntries(['minecraft', 'account', 'report', 'appeal', 'store', 'discord'].map(type => [type, { roleId: type === 'discord' ? newRole.id : oldRole.id, categoryId: type === 'discord' ? destCategory.id : category.id }])) };
await bot.saveConfig(guildId, config);
function interactionFor(userId = openerId) {
  return { guild, user: { id: userId, username: 'DiscordUser', toString() { return `<@${userId}>`; } }, deferred: false, replied: false, replies: [], async deferReply() { this.deferred = true; }, async editReply(payload) { for (const c of payload.components ?? []) c.toJSON(); this.replies.push(payload); this.replied = true; } };
}
function addHumanMessage(channel, content = 'Ciao, il mio problema è questo.') {
  const id = nextId();
  const message = { id, content, author: { id: openerId, username: 'DiscordUser', bot: false, displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png' }, member: members.get(openerId), system: false, createdTimestamp: Date.now(), attachments: new Collection(), mentions: { users: new Collection() }, components: [], embeds: [] };
  message.delete = async () => { channel.messages.cache.delete(id); message.deleted = true; };
  channel.messages.cache.set(id, message); channel.lastMessageId = id;
  return message;
}
let first, second;
after(async () => { bot.client.destroy(); await rm(dataDir, { recursive: true, force: true }); });

test('rimuove tutte le assegnazioni amministrative personali dai dati', async () => {
  const saved = JSON.parse(await readFile(join(dataDir, 'ticket-config.json'), 'utf8'));
  assert.equal(saved.oldGuild.botAdminUserId, undefined);
  const config = await bot.loadConfig('oldGuild'); assert.equal(config.botAdminUserId, undefined);
  assert.equal(bot.commands.find(c => c.name === 'ticket-setup').options.some(o => o.name === 'utente-admin-bot'), false);
});
test('ID di sei caratteri: collisioni controllate e nessun riutilizzo', () => {
  const state = { reserved: { AAAAAA: 1 } }; let calls = 0;
  const id = bot.allocateTicketId(state, () => calls++ < 6 ? 0 : 1);
  assert.equal(id, 'BBBBBB');
  const seen = new Set();
  for (let i = 0; i < 2000; i++) { const id = bot.allocateTicketId(state); assert.match(id, /^[A-Z0-9]{6}$/); assert(!seen.has(id)); seen.add(id); }
});
test('prenotazioni simultanee persistono senza collisioni', async () => {
  const ids = await Promise.all(Array.from({ length: 20 }, () => bot.reserveTicketId()));
  assert.equal(new Set(ids).size, 20);
  const state = JSON.parse(await readFile(join(dataDir, 'ticket-registry.json'), 'utf8'));
  assert(ids.every(id => Object.hasOwn(state.reserved, id)));
});
test('scritture configurazioni concorrenti non perdono gli altri server', async () => {
  await Promise.all(['guild-a', 'guild-b', 'guild-c'].map(id => bot.saveConfig(id, { categories: {}, label: id, botAdminUserId: 'arbitrary-person' })));
  const saved = JSON.parse(await readFile(join(dataDir, 'ticket-config.json'), 'utf8'));
  for (const id of ['guild-a', 'guild-b', 'guild-c']) { assert.equal(saved[id].label, id); assert.equal(saved[id].botAdminUserId, undefined); }
});
test('file JSON corrotto viene preservato e blocca la riscrittura', async () => {
  const path = join(dataDir, 'corrotto.json'); await writeFile(path, '{bad json');
  await assert.rejects(bot.readJson(path), /Dati non leggibili/);
  await assert.rejects(bot.atomicJson(path, {}), /Dati non leggibili/);
  assert.equal(await readFile(path, 'utf8'), '{bad json');
});
test('lo stesso utente può aprire più ticket con nickname identico', async () => {
  await bot.createTicket(interactionFor(), 'minecraft', 'vexmon', { minecraft_name: 'Steve123', problem: 'Test' });
  await bot.createTicket(interactionFor(), 'minecraft', 'vexmon', { minecraft_name: 'Steve123', problem: 'Altro test' });
  [first, second] = [...channels.values()].filter(c => c.topic.includes('opener:'));
  assert(first && second); assert.notEqual(first.id, second.id);
  const a = await bot.ensureTicketRegistered(first), b = await bot.ensureTicketRegistered(second);
  assert.notEqual(a.id, b.id); assert.match(a.id, /^[A-Z0-9]{6}$/);
  assert(JSON.stringify(first.sent[0].components.map(c => c.toJSON())).includes(a.id));
  assert(first.name.endsWith(a.id.toLowerCase()));
});
test('un canale normale con prefisso ticket non viene riconosciuto', () => {
  assert.equal(bot.ticketTypeForChannel(fakeChannel({ name: 'supporto-discord-generale' })), undefined);
});
test('ticket precedenti ricevono un ID stabile anche dopo rinomina e riavvio', async () => {
  const legacy = fakeChannel({ topic: `Ticket di qualcuno | opener:${openerId} | type:account` }); channels.set(legacy.id, legacy);
  const record = await bot.ensureTicketRegistered(legacy);
  legacy.name = 'nome-completamente-diverso';
  assert.equal((await bot.ensureTicketRegistered(legacy)).id, record.id);
  const code = `const m=await import(${JSON.stringify(new URL('../app.mjs', import.meta.url).href)}); console.log((await m.loadRegistry()).tickets[${JSON.stringify(legacy.id)}].id);m.client.destroy();`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, DATA_DIR: dataDir }, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr); assert.equal(child.stdout.trim(), record.id);
});
test('spostamento aggiorna ruoli, categoria e metadati mantenendo partecipanti e ID', async () => {
  const before = await bot.ensureTicketRegistered(first);
  const participant = '100000000000000090';
  first.permissionOverwrites.cache.set(participant, { id: participant, type: 1, allow: new PermissionsBitField(P.ViewChannel), deny: noPermissions });
  await bot.moveTicket(first, 'discord');
  assert.equal(first.parentId, destCategory.id);
  assert(!first.permissionOverwrites.cache.has(oldRole.id));
  assert(first.permissionOverwrites.cache.get(newRole.id).allow.has(P.ViewChannel));
  assert(first.permissionOverwrites.cache.get(participant).allow.has(P.ViewChannel));
  assert(first.permissionOverwrites.cache.get(botId).allow.has(P.ViewChannel));
  assert(first.permissionOverwrites.cache.get(guildId).deny.has(P.ViewChannel));
  const after = await bot.ensureTicketRegistered(first);
  assert.equal(after.id, before.id); assert.equal(after.type, 'discord');
  assert.equal(bot.ticketTypeForChannel(first), 'discord');
});
test('presa in carico esclusiva; un altro staffer non può sottrarla', async () => {
  await bot.claimTicket(first, staffId);
  await assert.rejects(bot.claimTicket(first, secondStaffId), /già in carico/);
  await assert.rejects(bot.claimTicket(first, secondStaffId, true), /già in carico/);
  await bot.claimTicket(first, secondStaffId, true, true);
  assert.equal((await bot.ensureTicketRegistered(first)).claimedBy, undefined);
});
test('emoji vengono risolte dalla applicazione senza accesso alle emoji server', () => {
  const emoji = { id: '100000000000000099', name: 'ticket', animated: false, toString: () => '<:ticket:100000000000000099>' };
  bot.client.application.emojis.cache.set(emoji.id, emoji);
  assert.equal(bot.customEmoji(guild, 'ticket'), emoji.toString());
  assert.equal(bot.emojiOption(guild, 'ticket').id, emoji.id);
  assert.equal(bot.emojiOption(guild, 'inesistente').name, '🎫');
});
test('trascrizione contiene ID, testo utente ed escaping HTML', async () => {
  addHumanMessage(first, 'Richiesta <script>alert(1)</script>');
  const record = await bot.ensureTicketRegistered(first);
  const report = await bot.buildTicketReport(first, guild, 'discord', { id: staffId }, []);
  assert(report.html.includes(record.id));
  assert(report.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.equal(report.record.ticketId, record.id);
  assert.equal(report.meta.truncated, false);
});
test('chiusure simultanee: una sola trascrizione finale e una sola cancellazione', async () => {
  const before = archive.sent.length;
  const results = await Promise.allSettled([bot.closeTicket(first, { id: staffId }, { delayMs: 0 }), bot.closeTicket(first, { id: staffId }, { delayMs: 0 })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(archive.sent.length, before + 1); assert(first.deleted);
  const records = await bot.getRecords(guildId); assert.equal(records.filter(r => r.channelId === first.id).length, 1);
});
test('errore invio trascrizione impedisce la cancellazione del ticket', async () => {
  const send = archive.send; archive.send = async () => { throw new Error('Errore rete'); };
  try { await assert.rejects(bot.closeTicket(second, { id: staffId }, { delayMs: 0 }), /Errore rete/); assert.equal(second.deleted, false); }
  finally { archive.send = send; }
  assert.equal((await bot.ensureTicketRegistered(second)).state, 'open');
});
test('una risposta prima della chiusura automatica annulla la cancellazione', async () => {
  const result = await bot.closeTicket(second, { id: botId, bot: true }, { delayMs: 0, beforeDelete: async () => false });
  assert.equal(result, false); assert.equal(second.deleted, false);
  assert.equal((await bot.ensureTicketRegistered(second)).state, 'open');
});
test('conservazione: cancella solo trascrizioni scadute e create da questo bot', async () => {
  const cfg = await bot.loadConfig(guildId); cfg.retentionDays = 1; await bot.saveConfig(guildId, cfg);
  await bot.updateRegistry(state => { for (const item of state.archives) item.createdAt = Date.now() - 2 * 86400000; });
  const ids = (await bot.loadRegistry()).archives.map(item => item.messageId);
  const protectedMessage = archive.messages.cache.get(ids[0]); protectedMessage.author = { id: 'different-bot' };
  await bot.purgeExpiredTranscripts();
  assert.equal(protectedMessage.deleted, false);
  assert(archive.messages.cache.get(ids[1]).deleted);
});
test('statistiche parallele e aggiornamento della stessa chiusura sono idempotenti', async () => {
  await Promise.all(Array.from({ length: 10 }, (_, i) => bot.recordTicket('stats-server', { channelId: `c${i}`, closedAt: Date.now() })));
  await bot.recordTicket('stats-server', { channelId: 'c1', closedAt: Date.now(), revised: true });
  const rows = await bot.getRecords('stats-server'); assert.equal(rows.length, 10); assert(rows.find(r => r.channelId === 'c1').revised);
});

test('aggiornamenti concorrenti della stessa configurazione preservano campi indipendenti', async () => {
  const a = await bot.loadConfig(guildId), b = await bot.loadConfig(guildId);
  a.pendingTickets = { sample: { since: 1, by: staffId } }; b.inactivityHours = 48;
  await Promise.all([bot.saveConfig(guildId, a), bot.saveConfig(guildId, b)]);
  const config = await bot.loadConfig(guildId);
  assert(config.pendingTickets.sample); assert.equal(config.inactivityHours, 48);
});
test('configurazioni individuali precedenti non concedono accesso ai comandi', async () => {
  const i = interactionFor(); i.channel = second; i.member = members.get(openerId); i.memberPermissions = noPermissions;
  assert.equal(await bot.isBotAdmin(i), false);
  assert.equal(await bot.canManageTicket(i, 'minecraft'), false);
});
test('dopo lo spostamento solo il ruolo della nuova categoria può gestire il ticket', async () => {
  const moved = [...channels.values()].find(c => c.topic.includes('type:account'));
  await bot.moveTicket(moved, 'discord');
  const oldStaff = interactionFor(staffId); oldStaff.channel = moved; oldStaff.member = members.get(staffId); oldStaff.memberPermissions = noPermissions;
  const newStaff = interactionFor(secondStaffId); newStaff.channel = moved; newStaff.member = members.get(secondStaffId); newStaff.memberPermissions = noPermissions;
  assert.equal(await bot.canManageTicket(oldStaff, 'discord'), false);
  assert.equal(await bot.canManageTicket(newStaff, 'discord'), true);
});
test('trascrizione parziale viene segnalata quando esistono più di 4000 messaggi', async () => {
  const channel = fakeChannel({ topic: `Ticket di qualcuno | opener:${openerId} | type:minecraft` }); channels.set(channel.id, channel);
  for (let i = 0; i < 4001; i++) addHumanMessage(channel, `Messaggio ${i}`);
  const messages = await bot.fetchAllMessages(channel);
  assert.equal(messages.length, 4000); assert.equal(messages.truncated, true);
  assert(!messages.some(m => m.content === 'Messaggio 0'));
});
test('canale trascrizioni pubblico viene rifiutato prima di creare un ticket', async () => {
  const original = archive.permissionsFor;
  archive.permissionsFor = () => fullPermissions;
  const count = channels.size;
  try { await assert.rejects(bot.createTicket(interactionFor(), 'minecraft', 'vexmon', { minecraft_name: 'Steve' }), /deve essere privato/); }
  finally { archive.permissionsFor = original; }
  assert.equal(channels.size, count);
});

test('modulo reset password: cinque campi validi, ultimo accesso e screenshot compilabili', async () => {
  const interaction = interactionFor();
  interaction.customId = 'ticket:choose:account:reset-password';
  let modal;
  interaction.showModal = async value => { modal = value.toJSON(); };
  await bot.handleButton(interaction);
  assert.equal(modal.components.length, 5);
  const fields = modal.components.flatMap(row => row.components);
  assert.deepEqual(fields.map(field => field.custom_id), ['minecraft_name', 'ip_address', 'premium', 'last_server_login', 'gameplay_screenshots']);
  assert(fields.every(field => field.label.length <= 45 && field.placeholder.length <= 100));
  assert(fields.find(field => field.custom_id === 'last_server_login').placeholder.includes('approssimative'));
  assert(fields.find(field => field.custom_id === 'gameplay_screenshots').placeholder.includes('dopo l’apertura'));
});
test('risposte reset password vengono salvate nel benvenuto e nella trascrizione HTML', async () => {
  const answers = { minecraft_name: 'SteveReset', ip_address: '192.0.2.1', premium: 'Sì', last_server_login: 'Circa tre settimane fa, in serata', gameplay_screenshots: 'Sì, li allegherò nel ticket dopo l’apertura.' };
  const interaction = interactionFor(); interaction.customId = 'ticket:modal:account:reset-password';
  interaction.fields = { getTextInputValue: id => answers[id] };
  await bot.handleModalSubmit(interaction);
  const channel = [...channels.values()].find(channel => channel.topic.includes('player:SteveReset'));
  assert(channel);
  const welcome = JSON.stringify(channel.sent[0].components.map(component => component.toJSON()));
  assert(welcome.includes(answers.last_server_login)); assert(welcome.includes(answers.gameplay_screenshots));
  const report = await bot.buildTicketReport(channel, guild, 'account', { id: staffId }, []);
  assert(report.html.includes(answers.last_server_login)); assert(report.html.includes(answers.gameplay_screenshots));
});

function searchInteraction({ name = null, user = null, staff = staffId } = {}) {
  const interaction = interactionFor(staff);
  interaction.commandName = 'search'; interaction.channel = archive;
  interaction.member = members.get(staff); interaction.memberPermissions = noPermissions;
  interaction.options = { data: [], getString: key => key === 'nome' ? name : null, getUser: key => key === 'utente' ? user : null };
  interaction.reply = interaction.editReply;
  return interaction;
}
function payloadText(payload) {
  const visit = node => (node.content ?? '') + (node.components ?? []).map(visit).join('\n');
  return payload.components.map(c => visit(c.toJSON())).join('\n');
}
let searchRecords = [];
test('/search è registrato e non richiede permessi amministrativi Discord', () => {
  const command = bot.commands.find(c => c.name === 'search');
  assert(command); assert.deepEqual(command.options.map(o => o.name), ['nome', 'utente']);
  assert(!command.default_member_permissions);
});
test('tutto lo staff ticket può cercare da un canale normale, anche in altre categorie accessibili', async () => {
  for (let i = 0; i < 12; i++) {
    const channel = fakeChannel({ topic: `Ticket di DiscordUser | opener:${openerId} | player:NomeMcRicerca | type:${i % 2 ? 'minecraft' : 'discord'} | discord_name:DiscordUser`, name: `ricerca-${i}` });
    channel.createdTimestamp = Date.now() + i * 1000;
    channels.set(channel.id, channel);
    searchRecords.push(await bot.ensureTicketRegistered(channel));
  }
  const interaction = searchInteraction({ user: { id: openerId, username: 'DiscordUser' } });
  await bot.handleCommand(interaction);
  const text = payloadText(interaction.replies.at(-1));
  assert(text.includes('Ricerca ticket')); assert(text.includes('Pagina:** 1/'));
  assert(text.includes(searchRecords.at(-1).id)); assert(text.includes(searchRecords.at(-2).id));
  assert.equal(interaction.replies.at(-1).allowedMentions.parse.length, 0);
});
test('ricerca per ID ticket e nome Minecraft, senza dipendere dal nome del canale', async () => {
  const target = searchRecords[1];
  channels.get(target.channelId).name = 'canale-rinominato';
  const byId = searchInteraction({ name: target.id.toLowerCase() }); await bot.handleCommand(byId);
  assert(payloadText(byId.replies.at(-1)).includes(`Ticket \`${target.id}\``));
  const byMc = searchInteraction({ name: 'NomeMcRicerca' }); await bot.handleCommand(byMc);
  const text = payloadText(byMc.replies.at(-1));
  assert(text.includes('Nickname Minecraft:** NomeMcRicerca'));
  assert(!text.includes(searchRecords[0].id));
});
test('ricerca per nome Discord attuale e menzione restituisce i ticket del titolare', async () => {
  const person = members.get(openerId); const before = person.user.username;
  person.user.username = 'NomeDiscordAggiornato';
  try {
    const byName = searchInteraction({ name: 'NomeDiscordAggiornato' }); await bot.handleCommand(byName);
    assert(payloadText(byName.replies.at(-1)).includes(searchRecords.at(-1).id));
    const mention = searchInteraction({ name: `<@${openerId}>` }); await bot.handleCommand(mention);
    assert(payloadText(mention.replies.at(-1)).includes(searchRecords.at(-1).id));
  } finally { person.user.username = before; }
});
test('paginazione permette di consultare anche gli ultimi risultati', async () => {
  const interaction = searchInteraction({ user: { id: openerId, username: 'DiscordUser' } }); await bot.handleCommand(interaction);
  const card = interaction.replies.at(-1).components[0].toJSON();
  const next = card.components.flatMap(c => c.components ?? []).find(c => c.label === 'Successiva');
  assert(next);
  const [, , token] = next.custom_id.split(':');
  const totalPages = Number(payloadText(interaction.replies.at(-1)).match(/Pagina:\*\* 1\/(\d+)/)[1]);
  const texts = [];
  for (let page = 0; page < totalPages; page++) {
    await bot.renderSearchPage(interaction, token, page);
    texts.push(payloadText(interaction.replies.at(-1)));
  }
  for (const record of searchRecords) assert(texts.some(text => text.includes(record.id)));
  await bot.renderSearchPage(interaction, token, 999);
  const lastText = payloadText(interaction.replies.at(-1));
  assert(lastText.includes(`Pagina:** ${totalPages}/${totalPages}`));
  assert(!lastText.includes(searchRecords.at(-1).id));
});
test('ricerca nega accesso ai non staff e non rivela ticket privati o chiusi', async () => {
  const unauthorized = searchInteraction({ name: 'DiscordUser', staff: openerId }); await bot.handleCommand(unauthorized);
  assert(payloadText(unauthorized.replies.at(-1)).includes('Solo lo staff'));
  assert(!payloadText(unauthorized.replies.at(-1)).includes(searchRecords[0].id));
  const hidden = channels.get(searchRecords[0].channelId), previous = hidden.permissionsFor;
  hidden.permissionsFor = () => noPermissions;
  try {
    const search = searchInteraction({ name: searchRecords[0].id }); await bot.handleCommand(search);
    assert(payloadText(search.replies.at(-1)).includes('Ticket aperti trovati:** 0'));
  } finally { hidden.permissionsFor = previous; }
  await bot.updateRegistry(state => { state.tickets[searchRecords[0].channelId].state = 'closed'; });
  const closed = searchInteraction({ name: searchRecords[0].id }); await bot.handleCommand(closed);
  assert(payloadText(closed.replies.at(-1)).includes('Ticket aperti trovati:** 0'));
});
test('le pagine ricontrollano i permessi e sono vincolate all’autore', async () => {
  const interaction = searchInteraction({ name: 'DiscordUser' }); await bot.handleCommand(interaction);
  const card = interaction.replies.at(-1).components[0].toJSON();
  const next = card.components.flatMap(c => c.components ?? []).find(c => c.label === 'Successiva');
  const token = next.custom_id.split(':')[2];
  const other = searchInteraction({ staff: secondStaffId });
  await bot.renderSearchPage(other, token, 1);
  assert(payloadText(other.replies.at(-1)).includes('non disponibile per questo utente'));
  const staff = members.get(staffId), previous = staff.roles.cache; staff.roles.cache = new Collection();
  try { await bot.renderSearchPage(interaction, token, 1); assert(payloadText(interaction.replies.at(-1)).includes('Solo lo staff')); }
  finally { staff.roles.cache = previous; }
});
test('regolamenti usano le nuove emoji e rispettano i limiti di testo Discord', () => {
  for (const name of ['servermute', 'voicechat', 'domanda', 'money', 'ghost', 'voice', '955026animatedsearchlm', 'info', 'discord', 'ban', 'account', 'redx', 'spada', 'minecraft', 'vexmon']) {
    const id = nextId(); bot.client.application.emojis.cache.set(id, { id, name, animated: false, toString: () => `<:${name}:${id}>` });
  }
  const mc = payloadText({ components: [bot.minecraftRulesContainer(guild)] });
  const discord = payloadText({ components: [bot.discordRulesContainer(guild)] });
  assert(mc.includes('<:servermute:')); assert(mc.includes('<:voicechat:'));
  assert(mc.includes('**Crate: Key e inventario pieno**'));
  assert.match(mc, /<:domanda:\d+> \*\*Crate/);
  assert(mc.includes('si riserva di valutare ogni caso')); assert(mc.includes('ticket di appello'));
  assert(discord.includes('<:voicechat:')); assert(discord.includes('<:ghost:'));
  assert(discord.includes('Applicazione del regolamento')); assert(discord.includes('ticket di appello'));
  assert(mc.length <= 4000); assert(discord.length <= 4000);
  assert(bot.customEmoji(guild, 'search').includes('955026animatedsearchlm'));
});

test('/regole minecraft e discord cancellano tutti i messaggi, anche vecchi e di utenti', async () => {
  for (const kind of ['minecraft', 'discord']) {
    const channel = fakeChannel(); channels.set(channel.id, channel);
    const old = addHumanMessage(channel, 'Messaggio vecchio'); old.createdTimestamp = Date.now() - 20 * 86400000;
    addHumanMessage(channel, 'Messaggio utente recente 1'); addHumanMessage(channel, 'Messaggio utente recente 2');
    const before = [...channel.messages.cache.keys()];
    const interaction = searchInteraction(); interaction.memberPermissions = fullPermissions;
    interaction.options = { getSubcommand: () => kind, getChannel: () => channel, getBoolean: () => false };
    await bot.handleRules(interaction);
    assert(before.every(id => !channel.messages.cache.has(id)));
    assert.equal(channel.sent.length, 1); assert(old.deleted);
    assert(payloadText(channel.sent[0]).includes(kind === 'minecraft' ? 'Regolamento Minecraft' : 'Regolamento Discord'));
  }
});
test('schede ricerca con tutte le emoji e cinque risultati rispettano 4000 caratteri', async () => {
  const interaction = searchInteraction({ name: 'DiscordUser' }); await bot.handleCommand(interaction);
  const text = payloadText(interaction.replies.at(-1));
  assert(text.includes('<:955026animatedsearchlm:'));
  assert(text.length <= 4000);
});
