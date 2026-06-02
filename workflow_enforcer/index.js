require('dotenv').config();
const { App } = require('@slack/bolt');
const slackAdapter = require('./src/adapters/slack');

// Initialize the Slack Bolt App
const slackApp = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
    port: process.env.PORT || 3000
});

async function main() {
    console.log('Workflow Enforcer Bot Initialization started...');
    
    // Register Slack listeners
    slackAdapter.init(slackApp);

    try {
        await slackApp.start();
        console.log('⚡️ Workflow Enforcer (Slack Adapter) is running in Socket Mode!');
    } catch (error) {
        console.error('❌ Failed to start Slack app:', error);
    }
}

main();
