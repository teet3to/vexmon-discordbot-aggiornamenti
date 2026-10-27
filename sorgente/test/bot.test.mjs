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
guild.emojis = { cache: new Collection(), async fetch() { return this.cache; } };
bot.client.application = { emojis: { cache: new Collection(), async fetch() { return this.cache; } } };

function fakeChannel(options = {}) {
  const messages = new Collection();
  const channel = {
    id: nextId(), guild, name: options.name ?? 'test', type: options.type ?? C.GuildText, topic: options.topic ?? '', createdTimestamp: Date.now(), sent: [], deleted: false, lastMessageId: undefined,
    permissionOverwrites: { cache: new Collection((options.permissionOverwrites ?? []).map(item => [item.id, { ...item, type: item.type ?? (item.id === guildId || [oldRole.id, newRole.id, adminRole.id].includes(item.id) ? 0 : 1), allow: new PermissionsBitField(item.allow ?? 0n), deny: new PermissionsBitField(item.deny ?? 0n) }])), async edit(id, values) {
      const old = this.cache.get(id); let allow = old?.allow.bitfield ?? 0n, deny = old?.deny.bitfield ?? 0n;
      for (const [name, value] of Object.entries(values)) { if (value) { allow |= P[name]; deny &= ~P[name]; } else { allow &= ~P[name]; deny |= P[name]; } }
      this.cache.set(id, { id, type: 1, allow: new PermissionsBitField(allow), deny: new PermissionsBitField(deny) });
    } },
    permissionsFor(who) { return (who?.id ?? who) === guildId ? noPermissions : fullPermissions; },
    isTextBased() { return true; },
    async setTopic(value) { this.topic = value; return this; },
    async setName(value) { this.name = value; return this; },
    async edit(options) { this.name = options.name; this.topic = options.topic; this.parentId = options.parent; this.permissionOverwrites.cache = new Collection(options.permissionOverwrites.map(item => [item.id, { ...item, allow: new PermissionsBitField(item.allow), deny: new PermissionsBitField(item.deny) }])); return this; },
    async send(payload) {
      for (const component of payload.components ?? []) component.toJSON();
      this.sent.push(payload);
      const sent = { id: nextId(), content: '', author: { id: botId, username: 'Vexmon', bot: true, displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png' }, createdTimestamp: Date.now(), system: false, mentions: { users: new Collection() }, attachments: new Collection((payload.files ?? []).map(file => { const id = nextId(); return [id, { id, name: file.name, contentType: 'text/html', size: file.attachment.length, url: `https://cdn.discordapp.com/attachments/${this.id}/${id}/${file.name}`, testContent: file.attachment.toString('utf8') }]; })), components: payload.components ?? [], embeds: [], deleted: false, async delete() { this.deleted = true; } };
      messages.set(sent.id, sent); this.lastMessageId = sent.id;
      return sent;
    },
    async bulkDelete(rows) { for (const id of rows.keys()) this.messages.cache.delete(id); return rows; },
    async delete() { this.deleted = true; channels.delete(this.id); },
    toString() { return `<#${this.id}>`; },
    messages: { async fetch(options) {
      if (typeof options === 'string' || options.message) { const message = messages.get(typeof options === 'string'?options:options.message); if (!message) throw Object.assign(new Error('Unknown Message'), { code: 10008 }); return message; }
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
after(async () => { bot.client.destroy(); (await bot.openTicketDatabase()).close(); await rm(dataDir, { recursive: true, force: true }); });


test('crea SQLite e migra configurazione lasciando intatto il vecchio JSON', async () => {
  const db=await bot.openTicketDatabase();
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode,'wal');
  assert.equal((await bot.loadConfig('oldGuild')).botAdminUserId,undefined);
  assert(JSON.parse(await readFile(join(dataDir,'ticket-config.json'),'utf8')).oldGuild.botAdminUserId);
  assert(db.prepare("SELECT value FROM settings WHERE key='ticket-config.json'").get());
});
test('prenotazione concorrente di ID univoci persistenti nel DB',async()=>{
  const ids=await Promise.all(Array.from({length:25},()=>bot.reserveTicketId()));
  assert.equal(new Set(ids).size,25);
  const db=await bot.openTicketDatabase();assert.equal(db.prepare('SELECT count(*) n FROM reserved_ids').get().n,25);
});
test('aperture multiple stesso utente salvano form, stato e identità nel DB',async()=>{
  await bot.createTicket(interactionFor(),'minecraft','vexmon',{minecraft_name:'SqlPlayer',problem:'Prima richiesta'});
  await bot.createTicket(interactionFor(),'minecraft','vexmon',{minecraft_name:'SqlPlayer',problem:'Seconda richiesta'});
  [first,second]=[...channels.values()].filter(c=>c.topic.includes('player:SqlPlayer'));
  assert(first&&second);
  const found=bot.sqliteSearch(guildId,'sqlplayer',null,'open');assert.equal(found.length,2);
  assert.equal(found[0].openerId,openerId);assert(found[0].answers.problem);
});
test('SQLite ricerca per ID ticket, ID utente, menzione e nome Discord',async()=>{
  const record=await bot.ensureTicketRegistered(first);
  for(const query of [record.id.toLowerCase(),openerId,`<@${openerId}>`,'discorduser'])assert(bot.sqliteSearch(guildId,query,null,'open').length);
  assert.equal(bot.sqliteSearch(guildId,'sqlplayer','utente-diverso','open').length,0);
  assert.equal(bot.sqliteSearch('altro-server','sqlplayer',null,'open').length,0);
});
test('query SQL con apostrofi e wildcard restano dati, senza SQL injection',()=>{
  assert.equal(bot.sqliteSearch(guildId,"' OR 1=1 --",null,'open').length,0);
  assert.equal(bot.sqliteSearch(guildId,'%',null,'open').length,0);
  assert.equal(bot.sqliteSearch(guildId,'_',null,'open').length,0);
});
test('configurazioni concorrenti e statistiche sono conservate in SQLite',async()=>{
  const a=await bot.loadConfig(guildId),b=await bot.loadConfig(guildId);a.inactivityHours=6;b.closeAfterHours=12;
  await Promise.all([bot.saveConfig(guildId,a),bot.saveConfig(guildId,b)]);
  const cfg=await bot.loadConfig(guildId);assert.equal(cfg.inactivityHours,6);assert.equal(cfg.closeAfterHours,12);
  await Promise.all(Array.from({length:8},(_,i)=>bot.recordTicket('stats',{channelId:String(i),closedAt:1})));
  assert.equal((await bot.getRecords('stats')).length,8);
});
test('classificazione confronta i canali reali e recupera cancellazioni manuali',async()=>{
  const record=await bot.ensureTicketRegistered(first);
  channels.delete(first.id);bot.reconcileTicketChannels(guild,channels);
  assert.equal((await bot.ensureTicketRegistered(second)).state,'open');
  assert.equal(bot.sqliteSearch(guildId,record.id.toLowerCase(),null,'open').length,0);
  assert.equal(bot.closedStillOpen({guildId,ticketId:record.id}),false);
  assert.equal(bot.closedStillOpen({guildId,channelName:second.name}),true);
  channels.set(first.id,first);
  await bot.updateRegistry(state=>{state.tickets[first.id].state='open';});
});
let closedId;
test('chiusura salva riferimenti e dati ticket, non HTML nel DB',async()=>{
  addHumanMessage(first,'CONTENUTO-SOLO-NEL-TRANSCRIPT');
  await bot.closeTicket(first,{id:staffId},{delayMs:0});
  const db=await bot.openTicketDatabase();
  const ticket=db.prepare('SELECT payload FROM tickets WHERE channel_id=?').get(first.id);closedId=JSON.parse(ticket.payload).id;
  assert.equal(JSON.parse(ticket.payload).state,'closed');
  const entry=db.prepare('SELECT * FROM transcripts WHERE source_channel_id=?').get(first.id);
  assert(entry);assert.equal(entry.tag,'native');assert.equal(entry.opener_id,openerId);assert(entry.message_id);
  assert(!ticket.payload.includes('<!doctype'));assert(!entry.payload.includes('CONTENUTO-SOLO-NEL-TRANSCRIPT'));
  assert.equal(bot.sqliteSearch(guildId,'sqlplayer',null,'closed').length,1);
});
test('indici e metadati resistono al riavvio',async()=>{
  const url=new URL('../app.mjs',import.meta.url).href;
  const script=`const b=await import(${JSON.stringify(url)});await b.initializeStorage();console.log(b.sqliteSearch(${JSON.stringify(guildId)},'sqlplayer',null,'closed').length);b.client.destroy();(await b.openTicketDatabase()).close();`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,DATA_DIR:dataDir},encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);assert.equal(child.stdout.trim(),'1');
});
test('errore invio transcript lascia aperto il ticket e non cancella il canale',async()=>{
  const saved=archive.send;archive.send=async()=>{throw new Error('upload failure');};
  try{await assert.rejects(bot.closeTicket(second,{id:staffId},{delayMs:0}),/upload failure/);assert(!second.deleted);}finally{archive.send=saved;}
  assert.equal((await bot.ensureTicketRegistered(second)).state,'open');
});
test('messaggio arrivato dopo snapshot causa rigenerazione prima della cancellazione',async()=>{
  addHumanMessage(second,'inizio');const before=archive.sent.length;
  await bot.closeTicket(second,{id:staffId},{delayMs:0,confirm:async()=>{addHumanMessage(second,'MESSAGGIO-TARDIVO');}});
  assert(second.deleted);assert.equal(archive.sent.length,before+2);
  const last=archive.sent.at(-1).files[0].attachment.toString();assert(last.includes('MESSAGGIO-TARDIVO'));
});
let legacyLog;
async function historicMessage(log,i){
  const card=new D.ContainerBuilder().addTextDisplayComponents(new D.TextDisplayBuilder().setContent(`Trascrizione del ticket\n**ID ticket** \`LG${String(i).padStart(4,'0')}\`\n**Canale** #archivio-${i}\n**Categoria** Assistenza account\n**Aperto da** <@${openerId}>\n**Nickname Minecraft** OldMc${i}\n**Nome Discord** UtenteStorico`));
  const msg=await log.send({components:[card],files:[{name:`old-${i}.html`,attachment:Buffer.from('<html>HTML-NON-NEL-DATABASE</html>')}]});msg.channelId=log.id;return msg;
}
test('importazione log riprende dopo errore e assegna tag legacy_log a tutti i vecchi record',async()=>{
  legacyLog=fakeChannel();channels.set(legacyLog.id,legacyLog);
  for(let i=0;i<205;i++)await historicMessage(legacyLog,i);
  const saved=legacyLog.messages.fetch;let calls=0;
  legacyLog.messages.fetch=async function(options){calls++;if(calls===2)throw Error('interruzione');return saved.call(this,options);};
  await assert.rejects(bot.importTranscriptLog(guild,legacyLog),/interruzione/);
  const db=await bot.openTicketDatabase();assert.equal(db.prepare('SELECT count(*) n FROM transcripts WHERE log_channel_id=?').get(legacyLog.id).n,100);
  legacyLog.messages.fetch=saved;await bot.importTranscriptLog(guild,legacyLog);
  assert.equal(db.prepare("SELECT count(*) n FROM transcripts WHERE log_channel_id=? AND tag='legacy_log'").get(legacyLog.id).n,205);
  assert.equal(db.prepare('SELECT backfill_complete n FROM log_sync WHERE channel_id=?').get(legacyLog.id).n,1);
  assert.equal(bot.sqliteSearch(guildId,'oldmc0',null,'closed').length,1);
  assert(!db.prepare('SELECT payload FROM transcripts WHERE log_channel_id=? LIMIT 1').get(legacyLog.id).payload.includes('HTML-NON-NEL-DATABASE'));
});
test('ricerche successive importano solo nuovi log, senza duplicare le righe',async()=>{
  const saved=legacyLog.messages.fetch;let calls=0;legacyLog.messages.fetch=async function(options){calls++;return saved.call(this,options);};
  await bot.importTranscriptLog(guild,legacyLog);assert.equal(calls,1);
  await historicMessage(legacyLog,999);await bot.importTranscriptLog(guild,legacyLog);
  const db=await bot.openTicketDatabase();assert.equal(db.prepare('SELECT count(*) n FROM transcripts WHERE log_channel_id=?').get(legacyLog.id).n,206);
  legacyLog.messages.fetch=saved;
});
test('riferimenti dei transcript vengono rinfrescati e messaggi cancellati marcati nel DB',async()=>{
  const db=await bot.openTicketDatabase();const row=JSON.parse(db.prepare('SELECT payload FROM transcripts WHERE log_channel_id=? LIMIT 1').get(legacyLog.id).payload);
  const msg=legacyLog.messages.cache.get(row.messageId);const attachment=[...msg.attachments.values()][0];attachment.url+='?updated=1';
  assert((await bot.refreshClosedEntry(guild,row,legacyLog)).attachmentUrl.endsWith('?updated=1'));
  legacyLog.messages.cache.delete(row.messageId);assert.equal(await bot.refreshClosedEntry(guild,row,legacyLog),null);
  assert(db.prepare('SELECT deleted_at FROM transcripts WHERE message_id=?').get(row.messageId).deleted_at);
});
test('politica punto 2 invariata: ruolo categoria autorizza anche senza accesso al log',()=>{
  const viewer=members.get(staffId);const destination={permissionsFor:()=>noPermissions};
  assert.equal(bot.closedCanView(viewer,config,destination,{categoryLabel:'Assistenza account'}),true);
});
test('download a flusso si ferma al limite e non usa arrayBuffer illimitato',async()=>{
  const saved=globalThis.fetch;let yielded=0;
  globalThis.fetch=async()=>({ok:true,body:{async *[Symbol.asyncIterator](){for(let i=0;i<5;i++){yielded++;yield Buffer.alloc(5);}}}});
  try{const result=await bot.attachClosedFiles(null,[{entry:{attachmentUrl:'https://cdn.discordapp.com/test',attachmentName:'file.html',attachmentSize:1}}],8);assert.equal(result.files.length,0);assert.equal(yielded,2);assert(result.reasons.length);}finally{globalThis.fetch=saved;}
});
test('ogni allegato ha un nome univoco e URL esterni sono rifiutati',async()=>{
  const saved=globalThis.fetch;globalThis.fetch=async()=>new Response('test');
  try{const result=await bot.attachClosedFiles(null,[{entry:{messageId:'a',attachmentUrl:'https://cdn.discordapp.com/a',attachmentName:'stesso.html',attachmentSize:4}},{entry:{messageId:'b',attachmentUrl:'https://cdn.discordapp.com/b',attachmentName:'stesso.html',attachmentSize:4}},{entry:{messageId:'c',attachmentUrl:'https://example.org/x',attachmentName:'file.html'}}],100);assert.equal(result.files.length,2);assert.notEqual(result.files[0].name,result.files[1].name);}finally{globalThis.fetch=saved;}
});

function searchInteraction(name,staff=staffId){
  const i=interactionFor(staff);i.commandName='search';i.channel=archive;i.member=members.get(staff);i.memberPermissions=noPermissions;
  i.options={data:[],getString:()=>name,getUser:()=>null};i.reply=i.editReply;return i;
}
test('/search restituisce il link diretto al messaggio log senza allegati',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async url=>{
    for(const message of archive.messages.cache.values())for(const attachment of message.attachments?.values()??[])if(attachment.url===url)return new Response(attachment.testContent);
    throw Error('URL inatteso');
  };
  try{
    const i=searchInteraction(closedId);await bot.handleCommand(i);
    const reply=i.replies.at(-1);const text=JSON.stringify(reply.components[0].toJSON());
    assert(text.includes(closedId));assert(text.includes('Ticket chiusi trovati'));assert.equal(reply.files.length,0);
    assert(text.includes('https://discord.com/channels/'+guildId+'/'+archive.id+'/'));
    assert(!text.includes('attachment://'));
  }finally{globalThis.fetch=original;}
});
test('/search non tenta upload degli allegati e non crea file references',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>new Response('test');
  const i=searchInteraction(closedId);const save=i.editReply;let failures=0;
  i.editReply=async function(payload){if(payload.files?.length){failures++;throw Object.assign(Error('too large'),{code:40005});}return save.call(this,payload);};
  try{
    await bot.handleCommand(i);assert.equal(failures,0);const reply=i.replies.at(-1);assert.equal(reply.files.length,0);
    const text=JSON.stringify(reply.components[0].toJSON());assert(!text.includes('attachment://'));assert(text.includes('Apri la trascrizione nel canale log'));
  }finally{globalThis.fetch=original;}
});
test('SQL archivi conserva tag e ritrova anche record senza ID ticket',async()=>{
  const card=new D.ContainerBuilder().addTextDisplayComponents(new D.TextDisplayBuilder().setContent(`Trascrizione del ticket\n**Canale** #account-storicolegacy\n**Aperto da** <@${openerId}>\n**Nickname Minecraft** SenzaIdPlayer\n**Nome Discord** DiscordUser`));
  const message=await legacyLog.send({components:[card],files:[{name:'old.html',attachment:Buffer.from('<html>old</html>')}]});message.channelId=legacyLog.id;
  await bot.importTranscriptLog(guild,legacyLog);
  const found=bot.sqliteSearch(guildId,'senzaidplayer',null,'closed');assert.equal(found.length,1);assert.equal(found[0].tag,'legacy_log');assert(!found[0].ticketId);
});

test('importazione arricchisce vecchi log dal loro HTML senza salvarne il contenuto',async()=>{
  const card=new D.ContainerBuilder().addTextDisplayComponents(new D.TextDisplayBuilder().setContent(`Trascrizione del ticket\n**Canale** #account-legacyhtml\n**Aperto da** <@${openerId}>`));
  const message=await legacyLog.send({components:[card],files:[{name:'old-form.html',attachment:Buffer.from('<html><b>Nickname Minecraft</b><br>PlayerDalFile<br><span>Aperto da</span><b>NomeVecchio</b><p>HTML-SEGRETO-NON-SALVARE</p></html>')}]});message.channelId=legacyLog.id;
  const saved=globalThis.fetch;globalThis.fetch=async()=>new Response([...message.attachments.values()][0].testContent);
  try{await bot.importTranscriptLog(guild,legacyLog);}finally{globalThis.fetch=saved;}
  const rows=bot.sqliteSearch(guildId,'playerdalfile',null,'closed');assert.equal(rows.length,1);assert.equal(rows[0].tag,'legacy_log');assert(!JSON.stringify(rows[0]).includes('HTML-SEGRETO'));
});
test('risposta durante chiusura automatica annulla la cancellazione anche alla verifica finale',async()=>{
  const i=interactionFor();await bot.createTicket(i,'minecraft','vexmon',{minecraft_name:'AutoCancel'});
  const channel=[...channels.values()].find(c=>c.topic.includes('player:AutoCancel'));let checks=0;
  const result=await bot.closeTicket(channel,{id:staffId},{delayMs:0,beforeDelete:async()=>++checks===1});
  assert.equal(result,false);assert(!channel.deleted);assert.equal((await bot.ensureTicketRegistered(channel)).state,'open');
});

test('backfill lento restituisce risultati parziali e riprende dal messaggio esatto',async()=>{
  const log=fakeChannel();channels.set(log.id,log);for(let i=0;i<3;i++)await historicMessage(log,800+i);
  const now=Date.now;const base=now();let calls=0;Date.now=()=>base+(calls++?9000:0);
  let outcome;try{outcome=await bot.importTranscriptLog(guild,log);}finally{Date.now=now;}
  assert(outcome.partial);const db=await bot.openTicketDatabase();assert.equal(db.prepare('SELECT count(*) n FROM transcripts WHERE log_channel_id=?').get(log.id).n,1);
  await bot.importTranscriptLog(guild,log);assert.equal(db.prepare('SELECT count(*) n FROM transcripts WHERE log_channel_id=?').get(log.id).n,3);
});
test('amministratore permanente resta autorizzato indipendentemente dai ruoli',async()=>{
  const i=interactionFor('1076582008270114958');i.memberPermissions=noPermissions;
  assert(await bot.isBotAdmin(i));assert(await bot.canManageTicket(i,'minecraft'));assert(await bot.canViewTicketStats(i));
});

test('recupera HTML anche quando la scheda log è stata modificata e non è più riconoscibile',async()=>{
  const card=new D.ContainerBuilder().addTextDisplayComponents(new D.TextDisplayBuilder().setContent('Archivio modificato dallo staff'));
  const msg=await archive.send({components:[card],files:[{name:'trascrizione.html',attachment:Buffer.from('<html>archivio</html>')}]});
  const row={guildId,channelId:archive.id,messageId:msg.id,ticketId:'NEW123',tag:'legacy_log'};
  const result=await bot.refreshClosedEntry(guild,row,archive);
  assert(result.attachmentUrl);assert.equal(result.ticketId,'NEW123');
});
test('forza lettura fresca del messaggio e non dipende dalla cache delle attachments',async()=>{
  const msg=[...archive.messages.cache.values()].find(m=>m.attachments?.size);
  const fetch=archive.messages.fetch;let forced=false;
  archive.messages.fetch=async function(options){forced=options.force===true&&options.message===msg.id;return fetch.call(this,options);};
  try{await bot.refreshClosedEntry(guild,{guildId,channelId:archive.id,messageId:msg.id},archive);assert(forced);}finally{archive.messages.fetch=fetch;}
});
test('/search mostra il link log anche senza poter recuperare il singolo messaggio',async()=>{
  const fetch=archive.messages.fetch;
  archive.messages.fetch=async function(options){if(options.message)throw Object.assign(Error('Missing Access'),{code:50001});return fetch.call(this,options);};
  try{
    const i=searchInteraction(closedId);await bot.handleCommand(i);
    const text=JSON.stringify(i.replies.at(-1).components[0].toJSON());
    assert(text.includes('Apri la trascrizione nel canale log'));assert(!text.includes('Al bot manca')); 
    assert(!text.includes('non più disponibile'));assert(!text.includes('Ricerca SQLite'));assert(!text.includes('Indicizzazione dei log non completata'));
  }finally{archive.messages.fetch=fetch;}
});

test('purify disconnette ripetutamente il bersaglio e si arresta con off',async()=>{
  const target=members.get(openerId);let disconnected=0;
  target.voice={channelId:'vocale',channel:{permissionsFor:()=>fullPermissions},disconnect:async()=>{disconnected++;target.voice.channelId=null;}};
  const cfg=await bot.loadConfig(guildId);cfg.purifyUserId=openerId;await bot.saveConfig(guildId,cfg);
  assert(await bot.enforcePurify(guild,openerId));target.voice.channelId='altra-vocale';assert(await bot.enforcePurify(guild,openerId));assert.equal(disconnected,2);
  const i=searchInteraction('');i.user.id='1076582008270114958';i.options.getSubcommand=()=> 'off';await bot.handlePurify(i);
  target.voice.channelId='vocale';assert.equal(await bot.enforcePurify(guild,openerId),false);assert.equal(disconnected,2);
});
test('purify nega accesso allo staff non gestore e non tocca altri utenti',async()=>{
  const i=searchInteraction('');i.options.getSubcommand=()=> 'on';
  await assert.rejects(bot.handlePurify(i),/Solo amministratori/);
  assert.equal(await bot.enforcePurify(guild,secondStaffId),false);
});

test('/purify on salva il bersaglio in SQLite e lo disconnette subito se è in vocale',async()=>{
  const i=searchInteraction('');i.user.id='1076582008270114958';i.options.getSubcommand=()=> 'on';i.options.getUser=()=>members.get(openerId).user;
  members.get(openerId).voice.channelId='vocale';
  await bot.handlePurify(i);assert.equal((await bot.loadConfig(guildId)).purifyUserId,openerId);assert.equal(members.get(openerId).voice.channelId,null);
  i.options.getSubcommand=()=> 'off';await bot.handlePurify(i);
});

test('rimuove il timeout solo all’amministratore permanente con dati forzatamente aggiornati',async()=>{
  const id='1076582008270114958';const owner=member(id);owner.moderatable=true;owner.communicationDisabledUntilTimestamp=Date.now()+60000;let removed=0;
  owner.timeout=async value=>{assert.equal(value,null);removed++;owner.communicationDisabledUntilTimestamp=null;};members.set(id,owner);
  const original=guild.members.fetch;let requested;
  guild.members.fetch=async function(options){requested=options;return original.call(this,options);};
  try{assert.equal(await bot.removePermanentAdminTimeout(guild),true);assert.equal(requested.user,id);assert.equal(requested.force,true);assert.equal(removed,1);assert.equal(await bot.removePermanentAdminTimeout(guild),false);}finally{guild.members.fetch=original;}
});
test('non tenta rimozione timeout se la gerarchia non lo consente',async()=>{
  const owner=members.get('1076582008270114958');owner.communicationDisabledUntilTimestamp=Date.now()+60000;owner.moderatable=false;
  await assert.rejects(bot.removePermanentAdminTimeout(guild),/gerarchia/);owner.moderatable=true;
});
test('controllo timeout non sovrappone cicli concorrenti',async()=>{
  const owner=members.get('1076582008270114958');owner.communicationDisabledUntilTimestamp=Date.now()+60000;
  let calls=0,release;owner.timeout=async()=>{calls++;await new Promise(r=>release=r);owner.communicationDisabledUntilTimestamp=null;};
  const running=bot.checkPermanentAdminTimeouts();
  await new Promise(r=>setImmediate(r));await bot.checkPermanentAdminTimeouts();assert.equal(calls,1);release();await running;
});
