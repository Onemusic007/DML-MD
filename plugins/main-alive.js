const { cmd } = require('../command');
const os = require("os");
const { runtime } = require('../lib/functions');
const config = require('../config');

cmd({
    pattern: "alive",
    alias: ["status", "online", "a"],
    desc: "Check bot is alive or not",
    category: "main",
    react: "📌",
    filename: __filename
},
async (conn, mek, m, { from, sender, reply }) => {
    try {
        // Check if connection is ready before sending
        if (!conn || conn.ws?.readyState !== 1) {
            console.log("Connection not ready, skipping alive command");
            return;
        }

        const status = `
╭─🔴──〔 *🤖 ${config.BOT_NAME} STATUS* 〕───◉
│✨ *Bot is Active & Online!*
│
│🧠 *Owner:* ${config.OWNER_NAME}
│⚡ *Version:* 4.1.0
│📝 *Prefix:* [${config.PREFIX}]
│📳 *Mode:* [${config.MODE}]
│💾 *RAM:* ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB / ${(os.totalmem() / 1024 / 1024).toFixed(2)}MB
│↪ *Uptime:* ${runtime(process.uptime())}
╰─🔴───────────────────◉
> ${config.DESCRIPTION}`;

        await conn.sendMessage(from, {
            image: { url: config.MENU_IMAGE_URL },
            caption: status,
            contextInfo: {
                mentionedJid: [m.sender],
                forwardingScore: 1000,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363387497418815@newsletter',
                    newsletterName: 'DML-MD',
                    serverMessageId: 143
                }
            }
        }, { quoted: mek });

    } catch (e) {
        console.error("Alive Error:", e);
        // Only reply if connection is still active
        try {
            if (conn && conn.ws?.readyState === 1) {
                await reply(`Bot is online but encountered an error: ${e.message}`);
            }
        } catch (replyError) {
            console.error("Failed to send error reply:", replyError.message);
        }
    }
});
