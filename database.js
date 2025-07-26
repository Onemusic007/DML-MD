const mongoose = require('mongoose');

// MongoDB connection
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dml_md_bot', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error);
        process.exit(1);
    }
};

// User Schema
const userSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        default: ''
    },
    isPremium: {
        type: Boolean,
        default: false
    },
    banned: {
        type: Boolean,
        default: false
    },
    userData: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: new Map()
    },
    messageCount: {
        type: Number,
        default: 0
    },
    lastSeen: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Group Schema
const groupSchema = new mongoose.Schema({
    groupId: {
        type: String,
        required: true,
        unique: true
    },
    groupName: {
        type: String,
        default: ''
    },
    welcomeEnabled: {
        type: Boolean,
        default: false
    },
    antilinkEnabled: {
        type: Boolean,
        default: false
    },
    settings: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: new Map()
    }
}, {
    timestamps: true
});

// Message Log Schema
const messageLogSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true
    },
    messageText: {
        type: String,
        required: true
    },
    messageType: {
        type: String,
        default: 'text'
    },
    groupId: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Session Schema (for storing bot session data)
const sessionSchema = new mongoose.Schema({
    sessionId: {
        type: String,
        required: true,
        unique: true
    },
    sessionData: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    }
}, {
    timestamps: true
});

// Create Models
const User = mongoose.model('User', userSchema);
const Group = mongoose.model('Group', groupSchema);
const MessageLog = mongoose.model('MessageLog', messageLogSchema);
const Session = mongoose.model('Session', sessionSchema);

// Database helper class
class Database {
    
    // Initialize database connection
    static async init() {
        try {
            await connectDB();
            console.log('✅ Database initialized successfully');
        } catch (error) {
            console.error('❌ Database initialization failed:', error);
        }
    }
    
    // User management functions
    static async addUser(phoneNumber, name = '') {
        try {
            const user = await User.findOneAndUpdate(
                { phoneNumber },
                { 
                    phoneNumber,
                    name: name || undefined,
                    lastSeen: new Date()
                },
                { 
                    upsert: true, 
                    new: true,
                    setDefaultsOnInsert: true
                }
            );
            return user;
        } catch (error) {
            console.error('Error adding user:', error);
            return null;
        }
    }
    
    static async getUser(phoneNumber) {
        try {
            const user = await User.findOne({ phoneNumber });
            return user;
        } catch (error) {
            console.error('Error getting user:', error);
            return null;
        }
    }
    
    static async updateUser(phoneNumber, updates) {
        try {
            const user = await User.findOneAndUpdate(
                { phoneNumber },
                { $set: updates },
                { new: true }
            );
            return user;
        } catch (error) {
            console.error('Error updating user:', error);
            return null;
        }
    }
    
    static async banUser(phoneNumber) {
        try {
            const user = await User.findOneAndUpdate(
                { phoneNumber },
                { $set: { banned: true } },
                { new: true, upsert: true }
            );
            return user;
        } catch (error) {
            console.error('Error banning user:', error);
            return null;
        }
    }
    
    static async unbanUser(phoneNumber) {
        try {
            const user = await User.findOneAndUpdate(
                { phoneNumber },
                { $set: { banned: false } },
                { new: true }
            );
            return user;
        } catch (error) {
            console.error('Error unbanning user:', error);
            return null;
        }
    }
    
    static async isPremium(phoneNumber) {
        try {
            const user = await User.findOne({ phoneNumber });
            return user ? user.isPremium : false;
        } catch (error) {
            console.error('Error checking premium status:', error);
            return false;
        }
    }
    
    static async isBanned(phoneNumber) {
        try {
            const user = await User.findOne({ phoneNumber });
            return user ? user.banned : false;
        } catch (error) {
            console.error('Error checking ban status:', error);
            return false;
        }
    }
    
    static async setPremium(phoneNumber, isPremium = true) {
        try {
            const user = await User.findOneAndUpdate(
                { phoneNumber },
                { $set: { isPremium } },
                { new: true, upsert: true }
            );
            return user;
        } catch (error) {
            console.error('Error setting premium status:', error);
            return null;
        }
    }
    
    // User data functions (for storing custom data)
    static async setUserData(phoneNumber, key, value) {
        try {
            const user = await User.findOneAndUpdate(
                { phoneNumber },
                { $set: { [`userData.${key}`]: value } },
                { new: true, upsert: true }
            );
            return user;
        } catch (error) {
            console.error('Error setting user data:', error);
            return null;
        }
    }
    
    static async getUserData(phoneNumber, key) {
        try {
            const user = await User.findOne({ phoneNumber });
            if (user && user.userData) {
                return user.userData.get(key);
            }
            return null;
        } catch (error) {
            console.error('Error getting user data:', error);
            return null;
        }
    }
    
    static async deleteUserData(phoneNumber, key) {
        try {
            const user = await User.findOneAndUpdate(
                { phoneNumber },
                { $unset: { [`userData.${key}`]: 1 } },
                { new: true }
            );
            return user;
        } catch (error) {
            console.error('Error deleting user data:', error);
            return null;
        }
    }
    
    // Group management functions
    static async addGroup(groupId, groupName = '') {
        try {
            const group = await Group.findOneAndUpdate(
                { groupId },
                { 
                    groupId,
                    groupName: groupName || undefined
                },
                { 
                    upsert: true, 
                    new: true,
                    setDefaultsOnInsert: true
                }
            );
            return group;
        } catch (error) {
            console.error('Error adding group:', error);
            return null;
        }
    }
    
    static async getGroup(groupId) {
        try {
            const group = await Group.findOne({ groupId });
            return group;
        } catch (error) {
            console.error('Error getting group:', error);
            return null;
        }
    }
    
    static async updateGroup(groupId, updates) {
        try {
            const group = await Group.findOneAndUpdate(
                { groupId },
                { $set: updates },
                { new: true }
            );
            return group;
        } catch (error) {
            console.error('Error updating group:', error);
            return null;
        }
    }
    
    static async setGroupSetting(groupId, key, value) {
        try {
            const group = await Group.findOneAndUpdate(
                { groupId },
                { $set: { [`settings.${key}`]: value } },
                { new: true, upsert: true }
            );
            return group;
        } catch (error) {
            console.error('Error setting group setting:', error);
            return null;
        }
    }
    
    static async getGroupSetting(groupId, key) {
        try {
            const group = await Group.findOne({ groupId });
            if (group && group.settings) {
                return group.settings.get(key);
            }
            return null;
        } catch (error) {
            console.error('Error getting group setting:', error);
            return null;
        }
    }
    
    // Message logging
    static async logMessage(phoneNumber, messageText, messageType = 'text', groupId = null) {
        try {
            const messageLog = new MessageLog({
                phoneNumber,
                messageText,
                messageType,
                groupId
            });
            await messageLog.save();
            
            // Increment user message count
            await User.findOneAndUpdate(
                { phoneNumber },
                { 
                    $inc: { messageCount: 1 },
                    $set: { lastSeen: new Date() }
                },
                { upsert: true }
            );
            
            return messageLog;
        } catch (error) {
            console.error('Error logging message:', error);
            return null;
        }
    }
    
    // Get statistics
    static async getStats() {
        try {
            const userCount = await User.countDocuments();
            const groupCount = await Group.countDocuments();
            const messageCount = await MessageLog.countDocuments();
            const premiumCount = await User.countDocuments({ isPremium: true });
            const bannedCount = await User.countDocuments({ banned: true });
            
            return {
                users: userCount,
                groups: groupCount,
                messages: messageCount,
                premium: premiumCount,
                banned: bannedCount
            };
        } catch (error) {
            console.error('Error getting stats:', error);
            return { users: 0, groups: 0, messages: 0, premium: 0, banned: 0 };
        }
    }
    
    // Get premium users
    static async getPremiumUsers() {
        try {
            const users = await User.find({ isPremium: true })
                .select('phoneNumber name createdAt')
                .sort({ createdAt: -1 });
            return users;
        } catch (error) {
            console.error('Error getting premium users:', error);
            return [];
        }
    }
    
    // Get banned users
    static async getBannedUsers() {
        try {
            const users = await User.find({ banned: true })
                .select('phoneNumber name createdAt')
                .sort({ createdAt: -1 });
            return users;
        } catch (error) {
            console.error('Error getting banned users:', error);
            return [];
        }
    }
    
    // Get top active users
    static async getTopUsers(limit = 10) {
        try {
            const users = await User.find()
                .select('phoneNumber name messageCount')
                .sort({ messageCount: -1 })
                .limit(limit);
            return users;
        } catch (error) {
            console.error('Error getting top users:', error);
            return [];
        }
    }
    
    // Session management
    static async saveSession(sessionId, sessionData) {
        try {
            const session = await Session.findOneAndUpdate(
                { sessionId },
                { sessionData },
                { upsert: true, new: true }
            );
            return session;
        } catch (error) {
            console.error('Error saving session:', error);
            return null;
        }
    }
    
    static async getSession(sessionId) {
        try {
            const session = await Session.findOne({ sessionId });
            return session ? session.sessionData : null;
        } catch (error) {
            console.error('Error getting session:', error);
            return null;
        }
    }
    
    // Cleanup old data
    static async cleanup() {
        try {
            // Delete old message logs (older than 30 days)
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            await MessageLog.deleteMany({ createdAt: { $lt: thirtyDaysAgo } });
            
            // Delete old sessions (older than 7 days)  
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            await Session.deleteMany({ updatedAt: { $lt: sevenDaysAgo } });
            
            console.log('✅ Database cleanup completed');
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

// Export models and database class
module.exports = { 
    Database, 
    User, 
    Group, 
    MessageLog, 
    Session,
    connectDB 
};
