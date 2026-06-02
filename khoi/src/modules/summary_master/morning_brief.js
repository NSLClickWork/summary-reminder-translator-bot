const schedule = require('node-schedule');
const { summarizeText } = require('../../../../shared/ai/engine');
const { pushDecisionsToAirtable } = require('../../../../shared/utils/airtable');

/**
 * Initializes the Morning Brief Cron Job
 * @param {object} client - Slack WebClient
 * @param {Array<string>} targetChannels - List of channel IDs to scan
 * @param {string} reportChannel - Channel ID to send the final report to
 */
function initMorningBrief(client, targetChannels, reportChannel) {
    // Read channel config from .env if not passed directly
    const channels = targetChannels.length > 0
        ? targetChannels
        : (process.env.MORNING_BRIEF_CHANNELS || '').split(',').map(c => c.trim()).filter(Boolean);

    const report = reportChannel || process.env.MORNING_BRIEF_REPORT_CHANNEL || '';

    console.log('⏰ Initializing Morning Brief cron job (Runs everyday at 08:00 AM VN / 01:00 AM UTC)...');

    if (channels.length === 0 || !report) {
        console.warn('⚠️  Morning Brief: No MORNING_BRIEF_CHANNELS or MORNING_BRIEF_REPORT_CHANNEL set in .env. Cron will run but skip silently.');
    }

    // 8:00 AM Vietnam Time (UTC+7) = 01:00 AM UTC
    // Using node-schedule with UTC time to be deployment-environment agnostic
    schedule.scheduleJob('0 1 * * *', async () => {
        try {
            console.log('🚀 Running Morning Brief task...');
            if (channels.length === 0 || !report) {
                console.log('⏭️  Morning Brief skipped: No channels configured.');
                return;
            }
            await runMorningBrief(client, channels, report);
        } catch (error) {
            console.error('Error in Morning Brief job:', error);
        }
    });
}

/**
 * Fetches yesterday's data and generates a summary report
 */
async function runMorningBrief(client, targetChannels, reportChannel, useToday = false) {
    const now = new Date();
    const targetDate = new Date(now);
    if (!useToday) {
        targetDate.setDate(targetDate.getDate() - 1);
    }

    // Set time window from 00:00:00 to 23:59:59 of the target day
    targetDate.setHours(0, 0, 0, 0);
    const oldestTs = targetDate.getTime() / 1000;

    targetDate.setHours(23, 59, 59, 999);
    const latestTs = targetDate.getTime() / 1000;

    let combinedText = '';
    let activeChannelCount = 0;

    for (const channelId of targetChannels) {
        try {
            const history = await client.conversations.history({
                channel: channelId,
                oldest: oldestTs.toString(),
                latest: latestTs.toString(),
                limit: 500
            });

            if (history.messages && history.messages.length > 0) {
                activeChannelCount++;
                combinedText += `\n--- Messages from channel ${channelId} ---\n`;
                const messages = history.messages.reverse();
                for (const msg of messages) {
                    if (msg.user) {
                        combinedText += `User ${msg.user}: ${msg.text}\n`;
                    }
                }
            } else {
                // Skip channels with no activity (per user preference)
                console.log(`⏭️  Channel ${channelId} had no messages yesterday. Skipping.`);
            }
        } catch (err) {
            console.error(`Error fetching history for channel ${channelId}:`, err.message);
        }
    }

    if (combinedText.trim() === '') {
        console.log('No messages found across any channel. Skipping Morning Brief report.');
        return;
    }

    const prompt = `You are an Executive Assistant preparing a Morning Brief for the CEO. Read the following conversation logs from yesterday.
Your task is to analyze the text and output a structured report in English.

CRITICAL INSTRUCTIONS:
1. OVERVIEW: Write a concise summary of the main events, topics, or issues discussed.
2. DECISIONS & ACTION ITEMS: Explicitly extract and list any final decisions made, and any action items (who needs to do what).
3. If the logs are just test messages or casual greetings, state that there were no significant business activities.

Format your response exactly like this:
*🌅 MORNING BRIEF: YESTERDAY'S RECAP*

*🔹 Overview:*
[Your overview here]

*✅ Decisions & Action Items:*
- [Decision/Action 1]
- [Decision/Action 2]

Conversation Logs:
${combinedText}`;

    const summary = await summarizeText(prompt);

    await client.chat.postMessage({
        channel: reportChannel,
        text: summary
    });
    console.log('✅ Morning Brief sent successfully!');

    // Extract Decisions to push to Airtable
    const decisions = [];
    const decisionSectionIndex = summary.indexOf('*✅ Decisions & Action Items:*');
    if (decisionSectionIndex !== -1) {
        const decisionText = summary.substring(decisionSectionIndex);
        const lines = decisionText.split('\n');
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('- ')) {
                decisions.push(trimmedLine.substring(2).trim());
            }
        }
    }

    if (decisions.length > 0) {
        await pushDecisionsToAirtable(decisions, targetChannels.join(', '));
    }
}

module.exports = {
    initMorningBrief,
    runMorningBrief
};
