const { cmd } = require('../command');
const fs = require('fs');
const path = require('path');

// =======================
// 🔌 CONNECTION STATE HELPER
// =======================
function isConnectionReady(conn) {
  try {
    if (!conn || !conn.ws) {
      console.log('Connection or WebSocket not available');
      return false;
    }
    
    // Check WebSocket ready state (1 = OPEN)
    if (conn.ws.readyState !== 1) {
      console.log(`WebSocket not ready. State: ${conn.ws.readyState}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.log('Error checking connection state:', error);
    return false;
  }
}

// Safe reply function that checks connection state
async function safeReply(conn, reply, message, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      if (!isConnectionReady(conn)) {
        console.log(`Connection not ready, attempt ${i + 1}/${retries}`);
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
          continue;
        }
        return false;
      }
      
      await reply(message);
      return true;
    } catch (error) {
      console.log(`Reply attempt ${i + 1} failed:`, error.message);
      if (i === retries - 1) {
        console.log('All reply attempts failed');
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return false;
}

// =======================
// 📝 ATTENDANCE PLUGIN
// =======================

// Path to attendance database
const attendanceDbPath = path.join(__dirname, '../database/attendance.json');

// Ensure attendance database file exists
if (!fs.existsSync(attendanceDbPath)) {
  fs.writeFileSync(attendanceDbPath, JSON.stringify({}, null, 2));
}

// Load attendance data
let attendanceData = JSON.parse(fs.readFileSync(attendanceDbPath));

// Save attendance data
const saveAttendance = () => {
  fs.writeFileSync(attendanceDbPath, JSON.stringify(attendanceData, null, 2));
};

// Initialize user attendance record
function initAttendanceUser(user) {
  if (!attendanceData[user]) {
    attendanceData[user] = {
      lastAttendance: null,
      totalAttendances: 0,
      streak: 0,
      longestStreak: 0
    };
  }
}

// Import economy functions (if economy plugin exists)
let eco, saveEco, initUser;
try {
  const economyModule = require('./economy');
  eco = economyModule.eco;
  saveEco = economyModule.saveEco;
  initUser = economyModule.initUser;
} catch (err) {
  console.log('Economy plugin not found. Attendance will work without rewards.');
}

// =======================
// 🎯 ATTENDANCE SETTINGS
// =======================
const ATTENDANCE_SETTINGS = {
  rewardAmount: 500,
  requireImage: false,
  imageRewardBonus: 200,
  minFieldLength: 2,
  enableStreakBonus: true,
  streakBonusMultiplier: 1.5
};

// =======================
// 🛡️ ADMIN DETECTION METHODS
// =======================

const ADMIN_NUMBERS = [
  '2348111637463@s.whatsapp.net',
  '2348087654321@s.whatsapp.net',
];

async function isGroupAdmin(conn, from, sender) {
  try {
    if (!isConnectionReady(conn)) {
      return false;
    }
    
    const groupMetadata = await conn.groupMetadata(from);
    const groupAdmins = groupMetadata.participants
      .filter(participant => participant.admin === 'admin' || participant.admin === 'superadmin')
      .map(participant => participant.id);

    return groupAdmins.includes(sender);
  } catch (error) {
    console.log('Error checking group admin:', error);
    return false;
  }
}

async function isAuthorized(conn, from, sender) {
  if (ADMIN_NUMBERS.includes(sender)) {
    return true;
  }

  if (from.endsWith('@g.us')) {
    return await isGroupAdmin(conn, from, sender);
  }

  return false;
}

// =======================
// 🖼️ IMAGE DETECTION FUNCTIONS
// =======================

function hasImage(m) {
  try {
    if (m.quoted && m.quoted.mtype) {
      const quotedType = m.quoted.mtype;
      if (quotedType === 'imageMessage' || quotedType === 'stickerMessage') {
        return true;
      }
    }

    if (m.mtype) {
      const messageType = m.mtype;
      if (messageType === 'imageMessage' || messageType === 'stickerMessage') {
        return true;
      }
    }

    if (m.message) {
      if (m.message.imageMessage || m.message.stickerMessage) {
        return true;
      }

      if (m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo) {
        const contextInfo = m.message.extendedTextMessage.contextInfo;
        if (contextInfo.quotedMessage && 
            (contextInfo.quotedMessage.imageMessage || contextInfo.quotedMessage.stickerMessage)) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.log('Error checking for image:', error);
    return false;
  }
}

function getImageStatus(hasImg, isRequired) {
  if (isRequired && !hasImg) {
    return "❌ Image required but not found";
  } else if (hasImg) {
    return "📸 Image detected ✅";
  } else {
    return "📸 No image (optional)";
  }
}

// =======================
// 📋 FORM VALIDATION
// =======================

const attendanceFormRegex = /GIST\s+HQ.*?Name[:*].*?Relationship[:*]/is;

function validateAttendanceForm(body, hasImg = false) {
  const validation = {
    isValidForm: false,
    missingFields: [],
    hasWakeUpMembers: false,
    hasImage: hasImg,
    imageRequired: ATTENDANCE_SETTINGS.requireImage,
    errors: []
  };

  const hasGistHQ = /GIST\s+HQ/i.test(body);
  const hasNameField = /Name[:*]/i.test(body);
  const hasRelationshipField = /Relationship[:*]/i.test(body);

  if (!hasGistHQ || !hasNameField || !hasRelationshipField) {
    validation.errors.push("❌ Invalid attendance form format");
    return validation;
  }

  if (ATTENDANCE_SETTINGS.requireImage && !hasImg) {
    validation.missingFields.push("📸 Image (required)");
  }

  const requiredFields = [
    { name: "Name", pattern: /Name[:*]\s*(.+)/i, fieldName: "👤 Name" },
    { name: "Location", pattern: /Location[:*]\s*(.+)/i, fieldName: "🌍 Location" },
    { name: "Time", pattern: /Time[:*]\s*(.+)/i, fieldName: "⌚ Time" },
    { name: "Weather", pattern: /Weather[:*]\s*(.+)/i, fieldName: "🌥 Weather" },
    { name: "Mood", pattern: /Mood[:*]\s*(.+)/i, fieldName: "❤️‍🔥 Mood" },
    { name: "DOB", pattern: /D\.O\.B[:*]\s*(.+)/i, fieldName: "🗓 D.O.B" },
    { name: "Relationship", pattern: /Relationship[:*]\s*(.+)/i, fieldName: "👩‍❤️‍👨 Relationship" }
  ];

  requiredFields.forEach(field => {
    const match = body.match(field.pattern);
    console.log(`Checking ${field.name}:`, match ? `"${match[1].trim()}"` : 'not found');

    if (!match || !match[1] || match[1].trim() === '' || match[1].trim().length < ATTENDANCE_SETTINGS.minFieldLength) {
      validation.missingFields.push(field.fieldName);
    }
  });

  const wakeUpPattern1 = /1[:]\s*(.+)/i;
  const wakeUpPattern2 = /2[:]\s*(.+)/i;
  const wakeUpPattern3 = /3[:]\s*(.+)/i;

  const wakeUp1 = body.match(wakeUpPattern1);
  const wakeUp2 = body.match(wakeUpPattern2);
  const wakeUp3 = body.match(wakeUpPattern3);

  let missingWakeUps = [];
  if (!wakeUp1 || !wakeUp1[1] || wakeUp1[1].trim() === '' || wakeUp1[1].trim().length < ATTENDANCE_SETTINGS.minFieldLength) missingWakeUps.push("1:");
  if (!wakeUp2 || !wakeUp2[1] || wakeUp2[1].trim() === '' || wakeUp2[1].trim().length < ATTENDANCE_SETTINGS.minFieldLength) missingWakeUps.push("2:");
  if (!wakeUp3 || !wakeUp3[1] || wakeUp3[1].trim() === '' || wakeUp3[1].trim().length < ATTENDANCE_SETTINGS.minFieldLength) missingWakeUps.push("3:");

  if (missingWakeUps.length > 0) {
    validation.missingFields.push(`🔔 Wake up members (${missingWakeUps.join(", ")})`);
  } else {
    validation.hasWakeUpMembers = true;
  }

  if (validation.missingFields.length === 0) {
    validation.isValidForm = true;
  }

  return validation;
}

// =======================
// 📊 STREAK CALCULATION
// =======================
function updateStreak(userId) {
  const user = attendanceData[userId];
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  if (user.lastAttendance === yesterday) {
    user.streak += 1;
  } else if (user.lastAttendance !== today) {
    user.streak = 1;
  }

  if (user.streak > user.longestStreak) {
    user.longestStreak = user.streak;
  }

  return user.streak;
}

// =======================
// 📝 MAIN ATTENDANCE DETECTOR (FIXED)
// =======================
cmd({ on: 'body' }, async (conn, m, store, { from, sender, body, reply }) => {
  try {
    console.log('Checking for GIST HQ attendance form...');
    
    // Skip if connection is not ready
    if (!isConnectionReady(conn)) {
      console.log('Connection not ready for attendance processing');
      return;
    }
    
    if (!attendanceFormRegex.test(body)) {
      return;
    }

    console.log('✅ Attendance form detected!');

    const userId = sender;
    const today = new Date().toISOString().split('T')[0];

    initAttendanceUser(userId);

    if (attendanceData[userId].lastAttendance === today) {
      await safeReply(conn, reply, `📝 You've already marked your attendance today! Come back tomorrow.`);
      return;
    }

    const messageHasImage = hasImage(m);
    console.log('Image detection result:', messageHasImage);

    const validation = validateAttendanceForm(body, messageHasImage);

    if (!validation.isValidForm) {
      let errorMessage = `📋 *INCOMPLETE ATTENDANCE FORM* 📋\n\n`;
      errorMessage += `❌ Please complete the following fields:\n\n`;

      validation.missingFields.forEach((field, index) => {
        errorMessage += `${index + 1}. ${field}\n`;
      });

      errorMessage += `\n💡 *Please fill out all required fields and try again.*\n`;
      errorMessage += `📝 Make sure to:\n`;
      errorMessage += `• Fill your personal details completely\n`;
      errorMessage += `• Wake up 3 members (1:, 2:, 3:)\n`;

      if (ATTENDANCE_SETTINGS.requireImage) {
        errorMessage += `• Include an image with your attendance\n`;
      }

      errorMessage += `• Don't leave any field empty\n\n`;
      errorMessage += `✨ *Complete the form properly to mark your attendance!*`;

      await safeReply(conn, reply, errorMessage);
      return;
    }

    const currentStreak = updateStreak(userId);
    attendanceData[userId].lastAttendance = today;
    attendanceData[userId].totalAttendances += 1;
    saveAttendance();

    let rewardMessage = '';
    if (eco && saveEco && initUser) {
      initUser(userId);
      let finalReward = ATTENDANCE_SETTINGS.rewardAmount;

      if (messageHasImage && ATTENDANCE_SETTINGS.imageRewardBonus > 0) {
        finalReward += ATTENDANCE_SETTINGS.imageRewardBonus;
      }

      if (ATTENDANCE_SETTINGS.enableStreakBonus && currentStreak >= 3) {
        finalReward = Math.floor(finalReward * ATTENDANCE_SETTINGS.streakBonusMultiplier);
      }

      let rewardBreakdown = `💸 Reward: ₦${finalReward.toLocaleString()}`;
      let bonusDetails = [];

      if (messageHasImage && ATTENDANCE_SETTINGS.imageRewardBonus > 0) {
        bonusDetails.push(`+₦${ATTENDANCE_SETTINGS.imageRewardBonus} image bonus`);
      }

      if (ATTENDANCE_SETTINGS.enableStreakBonus && currentStreak >= 3) {
        bonusDetails.push(`${Math.floor((ATTENDANCE_SETTINGS.streakBonusMultiplier - 1) * 100)}% streak bonus`);
      }

      if (bonusDetails.length > 0) {
        rewardBreakdown += ` (${bonusDetails.join(', ')})`;
      }

      rewardMessage = rewardBreakdown + '\n';

      eco[userId].balance += finalReward;
      saveEco();
    } else {
      rewardMessage = `💸 Reward system not available\n`;
    }

    let successMessage = `✅ *ATTENDANCE APPROVED!* ✅\n\n`;
    successMessage += `📋 Form completed successfully!\n`;
    successMessage += `${getImageStatus(messageHasImage, ATTENDANCE_SETTINGS.requireImage)}\n`;
    successMessage += rewardMessage;
    successMessage += `🔥 Current streak: ${currentStreak} days\n`;
    successMessage += `📊 Total attendances: ${attendanceData[userId].totalAttendances}\n`;
    successMessage += `🏆 Longest streak: ${attendanceData[userId].longestStreak} days\n\n`;
    successMessage += `🎉 *Thank you for your consistent participation!*\n`;
    successMessage += `🧾 *Keep it up!*`;

    await safeReply(conn, reply, successMessage);

  } catch (err) {
    console.error('Attendance validation error:', err);
    // Only try to reply if connection is ready
    if (isConnectionReady(conn)) {
      await safeReply(conn, reply, `❌ Error processing attendance. Please try again.`);
    }
  }
});

// =======================
// 📊 ATTENDANCE STATS COMMAND (FIXED)
// =======================
cmd({ pattern: "attendance", desc: "Check your attendance statistics" }, async (conn, m, store, { sender, reply }) => {
  try {
    if (!isConnectionReady(conn)) {
      console.log('Connection not ready for attendance stats');
      return;
    }

    initAttendanceUser(sender);
    const user = attendanceData[sender];
    const today = new Date().toISOString().split('T')[0];

    let statsMessage = `📊 *YOUR ATTENDANCE STATS* 📊\n\n`;
    statsMessage += `📅 Last attendance: ${user.lastAttendance || 'Never'}\n`;
    statsMessage += `📋 Total attendances: ${user.totalAttendances}\n`;
    statsMessage += `🔥 Current streak: ${user.streak} days\n`;
    statsMessage += `🏆 Longest streak: ${user.longestStreak} days\n`;
    statsMessage += `✅ Today's status: ${user.lastAttendance === today ? 'Marked ✅' : 'Not marked ❌'}\n`;
    statsMessage += `📸 Image required: ${ATTENDANCE_SETTINGS.requireImage ? 'Yes' : 'No'}\n\n`;

    if (user.streak >= 7) {
      statsMessage += `🌟 *Amazing! You're on fire with a ${user.streak}-day streak!*`;
    } else if (user.streak >= 3) {
      statsMessage += `🔥 *Great job! Keep the streak going!*`;
    } else {
      statsMessage += `💪 *Mark your attendance daily to build a streak!*`;
    }

    await safeReply(conn, reply, statsMessage);
  } catch (error) {
    console.error('Error in attendance stats:', error);
  }
});

// =======================
// 🛠️ ATTENDANCE SETTINGS COMMAND (FIXED)
// =======================
cmd({ pattern: "attendancesettings", desc: "Configure attendance settings (admin only)" }, async (conn, m, store, { sender, args, reply, from }) => {
  try {
    if (!isConnectionReady(conn)) {
      console.log('Connection not ready for attendance settings');
      return;
    }

    const isAdminUser = await isAuthorized(conn, from, sender);

    if (!isAdminUser) {
      await safeReply(conn, reply, "🚫 Only admins can use this command.");
      return;
    }

    if (!args[0]) {
      let settingsMessage = `⚙️ *ATTENDANCE SETTINGS* ⚙️\n\n`;
      settingsMessage += `💰 Reward Amount: ₦${ATTENDANCE_SETTINGS.rewardAmount.toLocaleString()}\n`;
      settingsMessage += `📸 Require Image: ${ATTENDANCE_SETTINGS.requireImage ? 'Yes ✅' : 'No ❌'}\n`;
      settingsMessage += `💎 Image Bonus: ₦${ATTENDANCE_SETTINGS.imageRewardBonus.toLocaleString()}\n`;
      settingsMessage += `📏 Min Field Length: ${ATTENDANCE_SETTINGS.minFieldLength}\n`;
      settingsMessage += `🔥 Streak Bonus: ${ATTENDANCE_SETTINGS.enableStreakBonus ? 'Enabled ✅' : 'Disabled ❌'}\n`;
      settingsMessage += `📈 Streak Multiplier: ${ATTENDANCE_SETTINGS.streakBonusMultiplier}x\n\n`;
      settingsMessage += `*📋 Usage Commands:*\n`;
      settingsMessage += `• \`attendancesettings reward 1000\`\n`;
      settingsMessage += `• \`attendancesettings image on/off\`\n`;
      settingsMessage += `• \`attendancesettings imagebonus 200\`\n`;
      settingsMessage += `• \`attendancesettings streak on/off\`\n`;
      settingsMessage += `• \`attendancesettings multiplier 2.0\`\n`;
      settingsMessage += `• \`attendancesettings minlength 3\``;

      await safeReply(conn, reply, settingsMessage);
      return;
    }

    const setting = args[0].toLowerCase();
    const value = args[1];

    switch (setting) {
      case 'reward':
        if (!value || isNaN(value)) {
          await safeReply(conn, reply, "⚠️ Invalid reward amount. Use: attendancesettings reward 1000");
          return;
        }
        ATTENDANCE_SETTINGS.rewardAmount = parseInt(value);
        await safeReply(conn, reply, `✅ Attendance reward set to ₦${parseInt(value).toLocaleString()}`);
        break;

      case 'image':
        if (value === 'on' || value === 'true' || value === 'yes') {
          ATTENDANCE_SETTINGS.requireImage = true;
          await safeReply(conn, reply, "✅ Image requirement enabled 📸\n\n*Users must now include an image with their attendance form.*");
        } else if (value === 'off' || value === 'false' || value === 'no') {
          ATTENDANCE_SETTINGS.requireImage = false;
          await safeReply(conn, reply, "✅ Image requirement disabled\n\n*Images are now optional for attendance.*");
        } else {
          await safeReply(conn, reply, "⚠️ Invalid value. Use: attendancesettings image on/off");
        }
        break;

      case 'imagebonus':
        if (!value || isNaN(value)) {
          await safeReply(conn, reply, "⚠️ Invalid bonus amount. Use: attendancesettings imagebonus 200");
          return;
        }
        ATTENDANCE_SETTINGS.imageRewardBonus = parseInt(value);
        await safeReply(conn, reply, `✅ Image bonus reward set to ₦${parseInt(value).toLocaleString()}\n\n*Users will get extra ₦${parseInt(value).toLocaleString()} when they include images.*`);
        break;

      case 'streak':
        if (value === 'on' || value === 'true' || value === 'yes') {
          ATTENDANCE_SETTINGS.enableStreakBonus = true;
          await safeReply(conn, reply, "✅ Streak bonus enabled 🔥");
        } else if (value === 'off' || value === 'false' || value === 'no') {
          ATTENDANCE_SETTINGS.enableStreakBonus = false;
          await safeReply(conn, reply, "✅ Streak bonus disabled");
        } else {
          await safeReply(conn, reply, "⚠️ Invalid value. Use: attendancesettings streak on/off");
        }
        break;

      case 'multiplier':
        if (!value || isNaN(value)) {
          await safeReply(conn, reply, "⚠️ Invalid multiplier value. Use: attendancesettings multiplier 1.5");
          return;
        }
        ATTENDANCE_SETTINGS.streakBonusMultiplier = parseFloat(value);
        await safeReply(conn, reply, `✅ Streak multiplier set to ${value}x`);
        break;

      case 'minlength':
        if (!value || isNaN(value)) {
          await safeReply(conn, reply, "⚠️ Invalid length value. Use: attendancesettings minlength 3");
          return;
        }
        ATTENDANCE_SETTINGS.minFieldLength = parseInt(value);
        await safeReply(conn, reply, `✅ Minimum field length set to ${value} characters`);
        break;

      default:
        await safeReply(conn, reply, "⚠️ Unknown setting. Available options:\n• reward\n• image\n• imagebonus\n• streak\n• multiplier\n• minlength");
    }
  } catch (error) {
    console.error('Error in attendance settings:', error);
  }
});

// =======================
// 🔧 ADMIN SETUP COMMAND (FIXED)
// =======================
cmd({ pattern: "addadmin", desc: "Add yourself as admin (owner only)" }, async (conn, m, store, { sender, reply }) => {
  try {
    if (!isConnectionReady(conn)) {
      console.log('Connection not ready for admin setup');
      return;
    }

    let setupMessage = `🔧 *Admin Setup Instructions*\n\n`;
    setupMessage += `Your number: ${sender}\n\n`;
    setupMessage += `To add yourself as admin:\n`;
    setupMessage += `1. Edit the attendance.js file\n`;
    setupMessage += `2. Find the ADMIN_NUMBERS array\n`;
    setupMessage += `3. Add your number: '${sender}'\n`;
    setupMessage += `4. Save and restart the bot\n\n`;
    setupMessage += `Example:\n`;
    setupMessage += `const ADMIN_NUMBERS = [\n`;
    setupMessage += `  '${sender}',\n`;
    setupMessage += `  // Add more admins here\n`;
    setupMessage += `];`;

    await safeReply(conn, reply, setupMessage);
  } catch (error) {
    console.error('Error in admin setup:', error);
  }
});

// =======================
// 🔍 TEST ATTENDANCE FORM (FIXED)
// =======================
cmd({ pattern: "testattendance", desc: "Test attendance form validation" }, async (conn, m, store, { sender, body, reply }) => {
  try {
    if (!isConnectionReady(conn)) {
      console.log('Connection not ready for test attendance');
      return;
    }

    const testText = body.replace(/^testattendance\s*/i, '').trim();

    if (!testText) {
      await safeReply(conn, reply, `🔍 *Attendance Form Test*\n\nUsage: testattendance [paste your attendance form]\n\nThis will validate your form without submitting it.\n\n📸 *Image Detection:* Include an image with your test message to test image detection.`);
      return;
    }

    console.log('=== ATTENDANCE TEST DEBUG ===');
    const hasGistHQ = /GIST\s+HQ/i.test(testText);
    const hasNameField = /Name[:*]/i.test(testText);
    const hasRelationshipField = /Relationship[:*]/i.test(testText);

    const messageHasImage = hasImage(m);

    let result = `🔍 *Form Detection Results:*\n\n`;
    result += `📋 GIST HQ header: ${hasGistHQ ? '✅' : '❌'}\n`;
    result += `👤 Name field: ${hasNameField ? '✅' : '❌'}\n`;
    result += `👩‍❤️‍👨 Relationship field: ${hasRelationshipField ? '✅' : '❌'}\n`;
    result += `📸 Image detected: ${messageHasImage ? '✅' : '❌'}\n`;
    result += `📸 Image required: ${ATTENDANCE_SETTINGS.requireImage ? 'Yes' : 'No'}\n\n`;

    if (hasGistHQ && hasNameField && hasRelationshipField) {
      result += `🎉 *Form structure detected!*\n\n`;

      const validation = validateAttendanceForm(testText, messageHasImage);
      result += `📝 *Validation Results:*\n`;
      result += `✅ Form complete: ${validation.isValidForm ? 'YES' : 'NO'}\n`;
      result += `📸 Image status: ${getImageStatus(messageHasImage, ATTENDANCE_SETTINGS.requireImage)}\n`;

      if (!validation.isValidForm) {
        result += `❌ Missing fields (${validation.missingFields.length}):\n`;
        validation.missingFields.forEach((field, index) => {
          result += `   ${index + 1}. ${field}\n`;
        });
      } else {
        result += `🎉 *Ready to submit!*`;

        if (eco) {
          let potentialReward = ATTENDANCE_SETTINGS.rewardAmount;
          if (messageHasImage && ATTENDANCE_SETTINGS.imageRewardBonus > 0) {
            potentialReward += ATTENDANCE_SETTINGS.imageRewardBonus;
          }
          result += `\n💰 *Potential reward: ₦${potentialReward.toLocaleString()}*`;
        }
      }
    } else {
      result += `❌ *Form structure not detected*\nMake sure you're using the correct GIST HQ attendance format.`;
    }

    await safeReply(conn, reply, result);
  } catch (error) {
    console.error('Error in test attendance:', error);
  }
});

// =======================
// 📤 EXPORT MODULE
// =======================
module.exports = { 
  attendanceData, 
  saveAttendance, 
  initAttendanceUser, 
  validateAttendanceForm,
  ATTENDANCE_SETTINGS,
  hasImage,
  getImageStatus,
  isConnectionReady,
  safeReply
};
