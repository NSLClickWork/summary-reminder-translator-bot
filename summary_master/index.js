require('dotenv').config();
const { startSlackBot } = require('./src/adapters/slack');

// Start Slack Adapter
startSlackBot().catch(err => {
    console.error('Failed to start Slack adapter:', err);
});


// Future: Start Discord Adapter
// const { startDiscordBot } = require('./src/adapters/discord');
// startDiscordBot();

console.log('Summary Master Bot Initialization started...');
