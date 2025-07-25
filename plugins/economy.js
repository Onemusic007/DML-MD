const { cmd } = require('../command');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

// Path to eco database
const dbPath = path.join(__dirname, '../database/eco.json');

// Ensure database file exists
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, '{}');

// Load economy data
let eco = JSON.parse(fs.readFileSync(dbPath));

// Save economy data
const saveEco = () => fs.writeFileSync(dbPath, JSON.stringify(eco, null, 2));

// Initialize user if not existing
function initUser(user) {
  if (!eco[user]) {
    eco[user] = {
      balance: 0,
      bank: 0,
      lastAttendance: null,
      inventory: [],
      clan: null,
      bounty: 0,
      rank: 'Newbie'
    };
  }
}

// =======================
// 📌 BALANCE COMMAND
// =======================
cmd({ pattern: "balance", desc: "Check your balance" }, async (conn, m, store, { sender, reply }) => {
  initUser(sender);
  const user = eco[sender];
  reply(`💰 Balance: ₦${user.balance}\n🏦 Bank: ₦${user.bank}`);
});

// =======================
// 📌 Send COMMAND
// =======================
cmd({ pattern: "send", desc: "Send money to someone" }, async (conn, m, store, { body, sender, from, reply }) => {
  initUser(sender);
  const parts = body.trim().split(' ');
  const mentioned = m.mentionedJid?.[0];

  if (!mentioned || isNaN(parts[2])) return reply(`⚠️ Usage: send @user amount`);

  const amount = parseInt(parts[2]);
  if (eco[sender].balance < amount) return reply(`🚫 Insufficient balance.`);

  initUser(mentioned);
  eco[sender].balance -= amount;
  eco[mentioned].balance += amount;
  saveEco();

  await conn.sendMessage(from, {
    text: `✅ @${sender.split('@')[0]} paid ₦${amount} to @${mentioned.split('@')[0]}`,
    mentions: [sender, mentioned]
  });
});

// =======================
// 📌 DEPOSIT COMMAND
// =======================
cmd({ pattern: "deposit", desc: "Deposit money to bank" }, async (conn, m, store, { sender, body, reply }) => {
  initUser(sender);

  const args = body.trim().split(/\s+/);
  const amount = parseInt(args[1]);

  if (isNaN(amount) || amount <= 0) return reply('⚠️ Invalid amount.');
  if (eco[sender].balance < amount) return reply('🚫 Not enough balance.');

  eco[sender].balance -= amount;
  eco[sender].bank += amount;
  saveEco();
  reply(`🏦 Deposited ₦${amount} to bank.`);
});

// =======================
// 📌 WITHDRAW COMMAND
// =======================
cmd({ pattern: "withdraw", desc: "Withdraw money from bank" }, async (conn, m, store, { sender, body, reply }) => {
  initUser(sender);
  const amount = parseInt(body.split(' ')[1]);
  if (isNaN(amount) || amount <= 0) return reply('⚠️ Invalid amount.');
  if (eco[sender].bank < amount) return reply('🚫 Not enough bank balance.');

  eco[sender].bank -= amount;
  eco[sender].balance += amount;
  saveEco();
  reply(`💵 Withdrawn ₦${amount} from bank.`);
});

// =======================
// 📝 ATTENDANCE DETECTOR
// =======================
const attendanceRegex = /[*_]Name[:*]\s*[\s\S]*?[*_]Relationship[:*]/i;

cmd({ on: 'body' }, async (conn, m, store, { from, sender, body, reply }) => {
  try {
    if (!attendanceRegex.test(body)) return;

    const userId = sender;
    const today = new Date().toISOString().split('T')[0];

    initUser(userId);

    if (eco[userId].lastAttendance === today) {
      return reply(`📝 You've already been rewarded today for attendance.`);
    }

    const rewardAmount = 500;
    eco[userId].balance += rewardAmount;
    eco[userId].lastAttendance = today;
    saveEco();

    await conn.sendMessage(from, {
      text: `✅ Attendance recorded successfully!\n💸 You’ve received ₦${rewardAmount.toLocaleString()} for today.\n\n🧾 *Keep it up!*`,
      mentions: [sender]
    });
  } catch (err) {
    console.error('Attendance error:', err);
    reply(`❌ Error processing attendance reward.`);
  }
});

// =======================
// 🦹 ROB COMMAND
// =======================
const robCooldown = {}; // In-memory cooldown tracker

cmd({ pattern: "rob", desc: "Attempt to rob a user" }, async (conn, m, store, { sender, from, reply }) => {
  initUser(sender);
  const mentioned = m.mentionedJid?.[0];
  if (!mentioned) return reply("⚠️ Tag someone to rob!");

  initUser(mentioned);

  if (mentioned === sender) return reply("🧠 You can't rob yourself!");

  const now = Date.now();
  if (robCooldown[sender] && now - robCooldown[sender] < 30 * 60 * 1000) {
    const remaining = Math.ceil((30 * 60 * 1000 - (now - robCooldown[sender])) / 60000);
    return reply(`⏱️ You're on cooldown. Try again in ${remaining} minutes.`);
  }

  const target = eco[mentioned];
  const user = eco[sender];

  if (target.balance < 1000) return reply("👀 Target too broke to rob.");

  const success = Math.random() < 0.5;
  if (success) {
    const stolen = Math.floor(Math.random() * (target.balance * 0.3)) + 200;
    const amount = Math.min(stolen, target.balance);

    target.balance -= amount;
    user.balance += amount;

    robCooldown[sender] = now;
    saveEco();

    await conn.sendMessage(from, {
      text: `🦹 You successfully robbed ₦${amount} from @${mentioned.split('@')[0]} 💸`,
      mentions: [sender, mentioned]
    });
  } else {
    const penalty = 500;
    if (user.balance >= penalty) {
      user.balance -= penalty;
      target.balance += penalty;
    }

    robCooldown[sender] = now;
    saveEco();

    await conn.sendMessage(from, {
      text: `🚨 You failed the robbery and lost ₦${penalty} to @${mentioned.split('@')[0]} as compensation.`,
      mentions: [sender, mentioned]
    });
  }
});

// =======================
// 🛠️ CONFIG FILE PATH
// =======================
cmd({ pattern: "econconfig", desc: "Show config file path (admin only)" }, async (conn, m, store, { sender, reply, isAdmin }) => {
  if (!isAdmin) return reply("🚫 Admins only.");
  reply(`📁 Config file path: /database/econ-config.json`);
});

// =======================
// ⚔️ CLAN SYSTEM
// =======================

cmd({ pattern: "clan", desc: "Clan system" }, async (conn, m, store, { sender, args, reply }) => {
  initUser(sender);
  const subcmd = args[0];
  const clanName = args.slice(1).join(" ");

  if (!subcmd) return reply(`🛡️ *Clan Commands:*
- clan create [name]
- clan join [name]
- clan leave
- clan disband
- clan info`);

  switch (subcmd.toLowerCase()) {
    case 'create':
      if (!clanName) return reply("⚠️ Provide a clan name.");
      if (eco[sender].clan) return reply("🚫 You're already in a clan.");
      if (clans[clanName]) return reply("⚠️ Clan already exists.");
      clans[clanName] = {
        name: clanName,
        leader: sender,
        members: [sender],
        level: 1,
        bank: 0
      };
      eco[sender].clan = clanName;
      saveEco(); saveClans();
      return reply(`✅ Clan *${clanName}* created successfully!`);

    case 'join':
      if (!clanName || !clans[clanName]) return reply("❌ Clan not found.");
      if (eco[sender].clan) return reply("🚫 You're already in a clan.");
      clans[clanName].members.push(sender);
      eco[sender].clan = clanName;
      saveEco(); saveClans();
      return reply(`✅ You’ve joined the clan *${clanName}*!`);

    case 'leave':
      const leftClan = eco[sender].clan;
      if (!leftClan || !clans[leftClan]) return reply("⚠️ You're not in a clan.");
      if (clans[leftClan].leader === sender) return reply("🚫 Clan leaders cannot leave. Disband the clan instead.");
      clans[leftClan].members = clans[leftClan].members.filter(u => u !== sender);
      eco[sender].clan = null;
      saveEco(); saveClans();
      return reply("✅ You have left your clan.");

    case 'disband':
      const disbandClan = eco[sender].clan;
      if (!disbandClan || !clans[disbandClan]) return reply("❌ You're not in a clan.");
      if (clans[disbandClan].leader !== sender) return reply("🚫 Only the clan leader can disband the clan.");
      clans[disbandClan].members.forEach(u => { if (eco[u]) eco[u].clan = null; });
      delete clans[disbandClan];
      saveEco(); saveClans();
      return reply(`💥 Clan *${disbandClan}* has been disbanded.`);

    case 'info':
      const infoClan = eco[sender].clan;
      if (!infoClan || !clans[infoClan]) return reply("⚠️ You're not in a clan.");
      const clan = clans[infoClan];
      return reply(`🏰 *Clan Name:* ${clan.name}
👑 *Leader:* @${clan.leader.split('@')[0]}
👥 *Members:* ${clan.members.length}
🏅 *Level:* ${clan.level}
💰 *Clan Bank:* ₦${clan.bank}`);

    default:
      return reply("⚠️ Unknown clan subcommand. Try `clan info`, `clan join [name]`, etc.");
  }
});

// =======================
// 📤 EXPORT MODULE
// =======================
module.exports = { eco, saveEco, initUser };
