require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const discordAdapter = require('./src/adapters/discord');

const reminderBot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

async function main() {
    console.log('Reminder Bot Initialization started...');
    discordAdapter.init(reminderBot);

    try {
        await reminderBot.login(process.env.DISCORD_REMINDER_TOKEN);
        console.log('⚡️ Reminder Bot logged in successfully!');
    } catch (error) {
        console.error('❌ Failed to login Reminder Bot:', error);
    }
}

main();
