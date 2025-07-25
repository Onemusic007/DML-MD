// =======================
// 📦 SIMPLE INTERACTIVE INVESTMENT PLUGIN
// =======================
const { cmd } = require('../command');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { eco, saveEco, initUser } = require('./economy');

const companyPath = path.join(__dirname, '../database/companies.json');
let companyData = JSON.parse(fs.readFileSync(companyPath));

function getDaysFromDuration(dur) {
  const match = dur?.toLowerCase().match(/(\d+)([dw])/);
  if (!match) return null;
  const num = parseInt(match[1]);
  return match[2] === 'w' ? num * 7 : num;
}

function initShares(user) {
  if (!eco[user].shares) eco[user].shares = {};
}

// 🏢 Show all available companies with numbers
function showCompanies() {
  let msg = `🏢 *Available Companies to Invest In:*\n\n`;

  let count = 0;
  for (let key in companyData) {
    count++;
    let data = companyData[key];
    const displayName = key.charAt(0).toUpperCase() + key.slice(1);
    msg += `${count}. *${displayName}*\n`;
    msg += `   💰 ₦${data.price}/share | 📊 ${data.rarity}\n\n`;
  }

  msg += `📝 *Next step:*\n`;
  msg += `Type: *company [number]* (e.g., "company 1" or "company 2")\n`;
  msg += `Or: *company [name]* (e.g., "company google")`;

  return msg;
}

// 📈 Show specific company details
function showCompanyDetails(companyKey) {
  const data = companyData[companyKey];
  const displayName = companyKey.charAt(0).toUpperCase() + companyKey.slice(1);

  let msg = `📈 *${displayName} Investment Details*\n\n`;
  msg += `📝 *About:* ${data.description || 'Premium investment opportunity'}\n`;
  msg += `💵 *Share Price:* ₦${data.price}\n`;
  msg += `📊 *ROI Range:* ${data.roiRange[0]}x to ${data.roiRange[1]}x\n`;
  msg += `🔒 *Risk Level:* ${data.rarity}\n\n`;

  msg += `📝 *To invest:*\n`;
  msg += `Type: *buy ${companyKey} [amount] [duration]*\n`;
  msg += `Example: *buy ${companyKey} 2000 7d*\n`;
  msg += `Example: *buy ${companyKey} 5000 2w*`;

  return msg;
}

// 🎯 Main invest command
cmd({ pattern: "invest", desc: "Show available companies" }, async (conn, m, store, { sender, reply }) => {
  initUser(sender);
  initShares(sender);
  return reply(showCompanies());
});

// 🏢 Company selection command
cmd({ pattern: "company", desc: "Select a company to invest in" }, async (conn, m, store, { sender, reply, text }) => {
  initUser(sender);
  initShares(sender);

  if (!text) {
    return reply("❌ Please specify a company!\nExample: *company 1* or *company google*");
  }

  const input = text.toLowerCase().trim();
  let selectedCompany = null;

  // Check if input is a number
  if (/^\d+$/.test(input)) {
    const companyIndex = parseInt(input) - 1;
    const companies = Object.keys(companyData);
    if (companyIndex >= 0 && companyIndex < companies.length) {
      selectedCompany = companies[companyIndex];
    }
  } else {
    // Text-based search
    for (let companyKey in companyData) {
      if (companyKey.toLowerCase().includes(input)) {
        selectedCompany = companyKey;
        break;
      }
    }
  }

  if (!selectedCompany) {
    return reply("❌ Company not found!\n\nType *invest* to see the list again.");
  }

  return reply(showCompanyDetails(selectedCompany));
});

// 💰 Buy shares command
cmd({ pattern: "buy", desc: "Buy company shares" }, async (conn, m, store, { sender, reply, text }) => {
  initUser(sender);
  initShares(sender);

  if (!text) {
    return reply("❌ Please specify: *buy [company] [amount] [duration]*\nExample: *buy google 2000 7d*");
  }

  const parts = text.trim().split(/\s+/);
  if (parts.length !== 3) {
    return reply("❌ Wrong format!\nUse: *buy [company] [amount] [duration]*\nExample: *buy google 2000 7d*");
  }

  const [companyInput, amountStr, durationStr] = parts;
  const company = companyInput.toLowerCase();
  const amount = parseInt(amountStr);
  const duration = getDaysFromDuration(durationStr);

  // Validate company
  if (!companyData[company]) {
    return reply(`❌ Company "${company}" not found!\nType *invest* to see available companies.`);
  }

  // Validate amount and duration
  if (!amount || !duration || amount <= 0 || duration > 30) {
    return reply("⚠️ Invalid input:\n• Amount must be positive number\n• Duration: 1-30 days (e.g., '7d', '2w')\nExample: *buy google 2000 7d*");
  }

  const data = companyData[company];
  const price = data.price;
  const quantity = Math.floor(amount / price);
  const totalCost = quantity * price;

  if (quantity <= 0) {
    return reply(`❌ Amount too low. Minimum needed: ₦${price} for 1 share.`);
  }

  if (eco[sender].balance < totalCost) {
    return reply(`🚫 Insufficient balance!\n💰 You have: ₦${eco[sender].balance}\n💵 You need: ₦${totalCost}\n📦 For ${quantity} shares`);
  }

  // Process investment
  eco[sender].balance -= totalCost;
  eco[sender].shares[company] = {
    quantity,
    boughtAt: price,
    totalInvested: totalCost,
    lockedUntil: moment().add(duration, 'days').format('YYYY-MM-DD'),
    dateBought: moment().format('YYYY-MM-DD'),
    duration
  };

  saveEco();

  const displayName = company.charAt(0).toUpperCase() + company.slice(1);

  return reply(`✅ *Investment Successful!*\n\n🏢 *Company:* ${displayName}\n📦 *Shares:* ${quantity} at ₦${price}/share\n💰 *Total invested:* ₦${totalCost}\n🔒 *Lock period:* ${duration} days\n🔓 *Unlock date:* ${moment().add(duration, 'days').format('MMM DD, YYYY')}\n💳 *New balance:* ₦${eco[sender].balance}\n\n🎉 Happy investing!`);
});

// 📊 Portfolio command
cmd({ pattern: "portfolio", desc: "View your investment portfolio" }, async (conn, m, store, { sender, reply }) => {
  initUser(sender);
  initShares(sender);

  const shares = eco[sender].shares;

  if (!shares || Object.keys(shares).length === 0) {
    return reply("📈 Your portfolio is empty.\n\nType *invest* to start investing!");
  }

  let msg = `📊 *Your Investment Portfolio*\n\n`;
  let totalInvested = 0;
  let totalCurrent = 0;

  for (let company in shares) {
    const share = shares[company];
    const data = companyData[company];
    const displayName = company.charAt(0).toUpperCase() + company.slice(1);
    const currentValue = share.quantity * (data?.price || share.boughtAt);
    const isLocked = moment().isBefore(moment(share.lockedUntil));
    const daysLeft = isLocked ? moment(share.lockedUntil).diff(moment(), 'days') : 0;

    totalInvested += share.totalInvested;
    totalCurrent += currentValue;

    msg += `🏢 *${displayName}*\n`;
    msg += `📦 ${share.quantity} shares @ ₦${share.boughtAt}\n`;
    msg += `💰 Invested: ₦${share.totalInvested}\n`;
    msg += `📈 Current: ₦${currentValue}\n`;
    msg += `${isLocked ? `🔒 Locked (${daysLeft} days left)` : '🔓 Unlocked'}\n\n`;
  }

  const profit = totalCurrent - totalInvested;
  const profitPercent = totalInvested > 0 ? ((profit / totalInvested) * 100).toFixed(2) : '0.00';

  msg += `📈 *Portfolio Summary*\n`;
  msg += `💵 Total Invested: ₦${totalInvested}\n`;
  msg += `💰 Current Value: ₦${totalCurrent}\n`;
  msg += `${profit >= 0 ? '📈' : '📉'} P&L: ₦${profit} (${profitPercent}%)\n`;
  msg += `💳 Available Balance: ₦${eco[sender].balance}`;

  return reply(msg);
});

// 📋 Help command
cmd({ pattern: "investhelp", desc: "Investment commands help" }, async (conn, m, store, { sender, reply }) => {
  const msg = `📋 *Investment Commands:*\n\n` +
             `🎯 *invest* - See available companies\n` +
             `🏢 *company [number/name]* - Select company\n` +
             `💰 *buy [company] [amount] [duration]* - Buy shares\n` +
             `📊 *portfolio* - View your investments\n\n` +
             `💡 *Example flow:*\n` +
             `1. Type: *invest*\n` +
             `2. Type: *company 1* or *company google*\n` +
             `3. Type: *buy google 2000 7d*\n\n` +
             `⏰ Duration format: 7d (days) or 2w (weeks)`;

  return reply(msg);
});

module.exports = {};