require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const discordAdapter = require('./src/adapters/discord');

// Initialize Summary Bot
const summaryBot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Reaction, Partials.User],
});

// Initialize Reminder Bot
const reminderBot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

async function main() {
    console.log('Khôi Nguyên\'s Bots Initialization started...');
    
    // Register event listeners and cron jobs
    discordAdapter.init(summaryBot, reminderBot);

    // Login both bots
    try {
        await summaryBot.login(process.env.DISCORD_SUMMARY_TOKEN);
        console.log('⚡️ Summary Bot logged in successfully!');
        
        await reminderBot.login(process.env.DISCORD_REMINDER_TOKEN);
        console.log('⚡️ Reminder Bot logged in successfully!');
    } catch (error) {
        console.error('❌ Failed to login bots:', error);
    }
}

main();
