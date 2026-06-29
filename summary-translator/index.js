require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const discordAdapter = require('./src/adapters/discord');

const summaryBot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Reaction, Partials.User],
});

async function main() {
    console.log('Summary & Translator Bot Initialization started...');
    discordAdapter.init(summaryBot);

    try {
        await summaryBot.login(process.env.DISCORD_SUMMARY_TOKEN);
        console.log('⚡️ Summary & Translator Bot logged in successfully!');
    } catch (error) {
        console.error('❌ Failed to login Summary Bot:', error);
    }
}

main();
