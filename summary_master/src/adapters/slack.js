const { App } = require('@slack/bolt');
const { handleThreadSummarize } = require('../modules/summary_master/thread_summarizer');
const { handleChannelSummarize } = require('../modules/summary_master/channel_summarizer');
const { initMorningBrief, runMorningBrief } = require('../modules/summary_master/morning_brief');
const { registerSlackUI } = require('./slack_ui');

const slackApp = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true // We use Socket Mode so we don't need a public URL for local testing
});

// Feature 15: Thread Summarizer
slackApp.event('app_mention', async ({ event, client, say }) => {
    try {
        const text = event.text.toLowerCase();
        
        // Route to Thread Summarizer Module
        if (text.includes('test morning brief')) {
            await say(`🌅 Đang giả lập chạy báo cáo Morning Brief cho kênh này... Xin chờ!`);
            // Run manually for the current channel (force to read TODAY for testing)
            await runMorningBrief(client, [event.channel], event.channel, true);
        } else if (text.includes('summarize channel')) {
            await handleChannelSummarize(event, client, say, text);
        } else if (text.includes('summarize') && event.thread_ts) {
            await handleThreadSummarize(event, client, say);
        } else if (text.includes('hello') || text.includes('chào')) {
            await say(`Hello there! I am the Summary Master. Tag me in a thread and type "summarize" to summarize a discussion, or type "summarize channel" in the main chat!`);
        } else {
            // Fallback if they just tag the bot without the correct command or not in a thread
            await say(`Did you call me? To summarize messages, please reply in a Thread and tag me with "summarize", or tag me in the channel with "summarize channel".`);
        }
    } catch (error) {
        console.error('Error handling app_mention:', error);
    }
});

async function startSlackBot() {
    if (!process.env.SLACK_BOT_TOKEN) {
        console.warn('⚠️ SLACK_BOT_TOKEN is missing. Slack adapter will not start.');
        return;
    }
    await slackApp.start(process.env.PORT || 3000);
    console.log('⚡️ Summary Master (Slack Adapter) is running in Socket Mode!');

    // Initialize the Cron Job for Morning Brief (Feature 1 & 8)
    // For now, we leave the target channels empty until we have specific channel IDs, 
    // but the Cron is active.
    // Morning Brief reads MORNING_BRIEF_CHANNELS and MORNING_BRIEF_REPORT_CHANNEL from .env
    initMorningBrief(slackApp.client, [], '');

    // Initialize UI Handlers
    registerSlackUI(slackApp);
}

module.exports = {
    startSlackBot,
    slackApp
};
