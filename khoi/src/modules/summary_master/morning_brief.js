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
 * Fetches yesterday's (or recent) data and generates a summary report for Discord
 */
async function runMorningBrief(interaction) {
    const channel = interaction.channel;
    
    // In Discord, fetching by date requires snowflake math, or we just fetch the last 100 messages for the demo.
    // Let's fetch the last 100 messages to quickly summarize the channel.
    let combinedText = '';
    
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        
        if (messages.size > 0) {
            combinedText += `\n--- Messages from channel #${channel.name} ---\n`;
            // Discord messages are fetched newest first. Reverse them for chronological order.
            const sortedMessages = Array.from(messages.values()).reverse();
            for (const msg of sortedMessages) {
                if (!msg.author.bot) { // ignore bot messages
                    combinedText += `User ${msg.author.username}: ${msg.content}\n`;
                }
            }
        }
    } catch (err) {
        console.error(`Error fetching history for channel ${channel.id}:`, err.message);
        throw err;
    }

    if (combinedText.trim() === '') {
        await interaction.editReply('No human messages found in this channel recently. Skipping summary.');
        return;
    }

    const prompt = `You are an Executive Assistant preparing a Summary Brief for the CEO. Read the following conversation logs.
Your task is to analyze the text and output a structured report in English.

CRITICAL INSTRUCTIONS:
1. OVERVIEW: Write a concise summary of the main events, topics, or issues discussed.
2. DECISIONS & ACTION ITEMS: Explicitly extract and list any final decisions made, and any action items (who needs to do what).
3. If the logs are just test messages or casual greetings, state that there were no significant business activities.

--- LOGS START ---
${combinedText}
--- LOGS END ---

Format your response exactly like this:
*🌅 MORNING BRIEF: YESTERDAY'S RECAP*

*🔹 Overview:*
[Your overview here]

*✅ Decisions & Action Items:*
- [Decision/Action 1]
- [Decision/Action 2]
`;

    const aiSummary = await summarizeText(prompt);

    // Post the result back via the interaction
    await interaction.editReply(`**Daily Summary for #${channel.name}**\n\n${aiSummary}`);

    // Extract Decisions to push to Airtable
    const decisions = [];
    const decisionSectionIndex = aiSummary.indexOf('*✅ Decisions & Action Items:*');
    if (decisionSectionIndex !== -1) {
        const decisionText = aiSummary.substring(decisionSectionIndex);
        const lines = decisionText.split('\n');
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('- ')) {
                decisions.push(trimmedLine.substring(2).trim());
            }
        }
    }

    if (decisions.length > 0) {
        await pushDecisionsToAirtable(decisions, `#${channel.name}`);
    }
}

module.exports = {
    initMorningBrief,
    runMorningBrief
};
