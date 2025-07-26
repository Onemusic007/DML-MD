// ADD THESE IMPORTS AT THE TOP OF YOUR index.js (after your existing requires)
require('dotenv').config();
const { Database } = require('./database.js');

// REPLACE your existing connectToWA function with this updated version:
async function connectToWA() {
  console.log("Connecting to WhatsApp ⏳️...");
  
  // Initialize MongoDB database first
  try {
    await Database.init();
    console.log('✅ MongoDB connected and initialized');
    
    // Run cleanup on startup
    await Database.cleanup();
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    console.log('⚠️ Bot will continue without database functionality');
  }
  
  const { state, saveCreds } = await useMultiFileAuthState(__dirname + '/sessions/')
  var { version } = await fetchLatestBaileysVersion()

  const conn = makeWASocket({
          logger: P({ level: 'silent' }),
          printQRInTerminal: false,
          browser: Browsers.macOS("Firefox"),
          syncFullHistory: true,
          auth: state,
          version
          })

  conn.ev.on('connection.update', (update) => {
  const { connection, lastDisconnect } = update
  if (connection === 'close') {
  if (lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut) {
  connectToWA()
  }
  } else if (connection === 'open') {
  console.log('🧬 Installing Plugins')
  const path = require('path');
  fs.readdirSync("./plugins/").forEach((plugin) => {
  if (path.extname(plugin).toLowerCase() == ".js") {
  require("./plugins/" + plugin);
  }
  });
  console.log('Plugins installed successful ✅')
  console.log('Bot connected to whatsapp ✅')

  let up = `╭─〔 *🤖 Groq AI* 〕  
├─▸ *Ultra Super Fast Powerfull ⚠️*  
│     *World Best AI* 
╰─➤ *Your Smart WhatsApp Bot is Ready To use 🍁!*  

- *🖤 Thank You for Choosing Groq!* 

╭──〔 🔗 *Information* 〕  
├─ ↪ Prefix:= ${prefix}
├─ 📢 Join Channel:  
│    https://whatsapp.com/channel/0029Vb2hoPpDZ4Lb3mSkVI3C  
├─ 🌟 Star the Repo:  
│    https://github.com/MLILA17/DML-MD  
╰─🚀 *Powered by Alex Macksyn*`;
    conn.sendMessage(conn.user.id, { image: { url: `https://files.catbox.moe/vcdwmp.jpg` }, caption: up })
  }
  })
  conn.ev.on('creds.update', saveCreds)

  //==============================

  conn.ev.on('messages.update', async updates => {
    for (const update of updates) {
      if (update.update.message === null) {
        console.log("Delete Detected:", JSON.stringify(update, null, 2));
        await AntiDelete(conn, updates);
      }
    }
  });
  //============================== 

  conn.ev.on("group-participants.update", async (update) => {
    // Handle group events AND database updates
    GroupEvents(conn, update);
    
    // Add group to database if not exists
    try {
      const groupMetadata = await conn.groupMetadata(update.id).catch(() => null);
      const groupName = groupMetadata ? groupMetadata.subject : '';
      await Database.addGroup(update.id, groupName);
      
      // Handle welcome messages if enabled
      if (update.action === 'add') {
        const welcomeEnabled = await Database.getGroupSetting(update.id, 'welcomeEnabled');
        if (welcomeEnabled) {
          for (const participant of update.participants) {
            await conn.sendMessage(update.id, {
              text: `👋 Welcome to the group! 🎉`
            });
          }
        }
      }
    } catch (error) {
      console.error('Error handling group update:', error);
    }
  });	  

  //=============readstatus=======

  conn.ev.on('messages.upsert', async(mek) => {
    mek = mek.messages[0]
    if (!mek.message) return
    mek.message = (getContentType(mek.message) === 'ephemeralMessage') 
    ? mek.message.ephemeralMessage.message 
    : mek.message;

  if (config.READ_MESSAGE === 'true') {
    await conn.readMessages([mek.key]);
    console.log(`Marked message from ${mek.key.remoteJid} as read.`);
  }
    if(mek.message.viewOnceMessageV2)
    mek.message = (getContentType(mek.message) === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
    if (mek.key && mek.key.remoteJid === 'status@broadcast' && config.AUTO_STATUS_SEEN === "true"){
      await conn.readMessages([mek.key])
    }
  if (mek.key && mek.key.remoteJid === 'status@broadcast' && config.AUTO_STATUS_REACT === "true"){
    const jawadlike = await conn.decodeJid(conn.user.id);
    const emojis = ['❤️', '💸', '😇', '🍂', '💥', '💯', '🔥', '💫', '💎', '💗', '🤍', '🖤', '👀', '🙌', '🙆', '🚩', '🥰', '💐', '😎', '🤎', '✅', '🫀', '🧡', '😁', '😄', '🌸', '🕊️', '🌷', '⛅', '🌟', '🗿', '🇵🇰', '💜', '💙', '🌝', '🖤', '💚'];
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    await conn.sendMessage(mek.key.remoteJid, {
      react: {
        text: randomEmoji,
        key: mek.key,
      } 
    }, { statusJidList: [mek.key.participant, jawadlike] });
  }                       
  if (mek.key && mek.key.remoteJid === 'status@broadcast' && config.AUTO_STATUS_REPLY === "true"){
  const user = mek.key.participant
  const text = `${config.AUTO_STATUS_MSG}`
  await conn.sendMessage(user, { text: text, react: { text: '💜', key: mek.key } }, { quoted: mek })
            }
            await Promise.all([
              saveMessage(mek),
            ]);
  const m = sms(conn, mek)
  const type = getContentType(mek.message)
  const content = JSON.stringify(mek.message)
  const from = mek.key.remoteJid
  const quoted = type == 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo != null ? mek.message.extendedTextMessage.contextInfo.quotedMessage || [] : []
  const body = (type === 'conversation') ? mek.message.conversation : (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : (type == 'imageMessage') && mek.message.imageMessage.caption ? mek.message.imageMessage.caption : (type == 'videoMessage') && mek.message.videoMessage.caption ? mek.message.videoMessage.caption : ''
  const isCmd = body.startsWith(prefix)
  var budy = typeof mek.text == 'string' ? mek.text : false;
  const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : ''
  const args = body.trim().split(/ +/).slice(1)
  const q = args.join(' ')
  const text = args.join(' ')
  const isGroup = from.endsWith('@g.us')
  const sender = mek.key.fromMe ? (conn.user.id.split(':')[0]+'@s.whatsapp.net' || conn.user.id) : (mek.key.participant || mek.key.remoteJid)
  const senderNumber = sender.split('@')[0]
  const botNumber = conn.user.id.split(':')[0]
  const pushname = mek.pushName || 'Sin Nombre'
  const isMe = botNumber.includes(senderNumber)
  const isOwner = ownerNumber.includes(senderNumber) || isMe
  const botNumber2 = await jidNormalizedUser(conn.user.id);
  const groupMetadata = isGroup ? await conn.groupMetadata(from).catch(e => {}) : ''
  const groupName = isGroup ? groupMetadata.subject : ''
  const participants = isGroup ? await groupMetadata.participants : ''
  const groupAdmins = isGroup ? await getGroupAdmins(participants) : ''
  const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false
  const isAdmins = isGroup ? groupAdmins.includes(sender) : false
  const isReact = m.message.reactionMessage ? true : false
  const reply = (teks) => {
  conn.sendMessage(from, { text: teks }, { quoted: mek })
  }

  // MONGODB INTEGRATION - Add user to database and check ban status
  try {
    // Add user to database if not exists (for both private and group messages)
    await Database.addUser(senderNumber, pushname);
    
    // Add group to database if it's a group message
    if (isGroup) {
      await Database.addGroup(from, groupName);
    }
    
    // Check if user is banned via database
    const isBannedDB = await Database.isBanned(senderNumber);
    if (isBannedDB) {
      console.log(`Banned user ${senderNumber} tried to use bot`);
      return; // Exit early if user is banned in database
    }
    
    // Log message to database
    if (config.LOG_MESSAGES === 'true' && body) {
      await Database.logMessage(senderNumber, body, type, isGroup ? from : null);
    }
    
  } catch (error) {
    console.error('Database operations error:', error);
  }

  const udp = botNumber.split('@')[0];
    const jawadop = ('2348111637463', '2348089782988');

    const ownerFilev2 = JSON.parse(fs.readFileSync('./lib/sudo.json', 'utf-8'));  

    let isCreator = [udp, ...jawadop, config.DEV + '@s.whatsapp.net', ...ownerFilev2]
    .map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net') 
    .includes(mek.sender);

    // ADD MONGODB DATABASE COMMANDS HERE (before your existing command handling)
    
    // Database Admin Commands
    if (isCreator || isOwner) {
      // Ban user command
      if (body.startsWith(`${prefix}dban `) || body.startsWith(`${prefix}bandb `)) {
        try {
          const targetNumber = args[0]?.replace(/[^0-9]/g, '');
          if (!targetNumber) return reply('❌ Please provide a phone number to ban\n\nExample: `.dban 2348123456789`');
          
          await Database.banUser(targetNumber);
          reply(`✅ User ${targetNumber} has been banned from database`);
        } catch (error) {
          reply('❌ Error banning user: ' + error.message);
        }
        return;
      }
      
      // Unban user command
      if (body.startsWith(`${prefix}dunban `) || body.startsWith(`${prefix}unbandb `)) {
        try {
          const targetNumber = args[0]?.replace(/[^0-9]/g, '');
          if (!targetNumber) return reply('❌ Please provide a phone number to unban\n\nExample: `.dunban 2348123456789`');
          
          await Database.unbanUser(targetNumber);
          reply(`✅ User ${targetNumber} has been unbanned from database`);
        } catch (error) {
          reply('❌ Error unbanning user: ' + error.message);
        }
        return;
      }
      
      // Add premium user
      if (body.startsWith(`${prefix}addprem `) || body.startsWith(`${prefix}premium `)) {
        try {
          const targetNumber = args[0]?.replace(/[^0-9]/g, '');
          if (!targetNumber) return reply('❌ Please provide a phone number\n\nExample: `.addprem 2348123456789`');
          
          await Database.setPremium(targetNumber, true);
          reply(`✅ User ${targetNumber} is now premium`);
        } catch (error) {
          reply('❌ Error adding premium: ' + error.message);
        }
        return;
      }
      
      // Remove premium user
      if (body.startsWith(`${prefix}delprem `) || body.startsWith(`${prefix}unpremium `)) {
        try {
          const targetNumber = args[0]?.replace(/[^0-9]/g, '');
          if (!targetNumber) return reply('❌ Please provide a phone number\n\nExample: `.delprem 2348123456789`');
          
          await Database.setPremium(targetNumber, false);
          reply(`✅ Premium removed for ${targetNumber}`);
        } catch (error) {
          reply('❌ Error removing premium: ' + error.message);
        }
        return;
      }
      
      // Database stats
      if (body === `${prefix}dbstats` || body === `${prefix}databasestats`) {
        try {
          const stats = await Database.getStats();
          const statsMsg = `📊 *Database Statistics*\n\n👥 Users: ${stats.users}\n🏘️ Groups: ${stats.groups}\n💬 Messages: ${stats.messages}\n⭐ Premium Users: ${stats.premium}\n🚫 Banned Users: ${stats.banned}`;
          reply(statsMsg);
        } catch (error) {
          reply('❌ Error getting stats: ' + error.message);
        }
        return;
      }
      
      // Top active users
      if (body === `${prefix}topusers` || body === `${prefix}activeusers`) {
        try {
          const topUsers = await Database.getTopUsers(10);
          let msg = '🏆 *Top Active Users*\n\n';
          topUsers.forEach((user, index) => {
            msg += `
