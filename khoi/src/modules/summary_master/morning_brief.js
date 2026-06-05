const schedule = require('node-schedule');
const { summarizeText } = require('../../../../shared/ai/engine');
const { pushDecisionsToAirtable } = require('../../../../shared/utils/airtable');

/**
 * Initializes the Morning Brief Cron Job
 * @param {import('discord.js').Client} client - Discord Client
 */
function initMorningBrief(client) {
    console.log('⏰ Morning Brief cron job is temporarily DISABLED as requested.');

    // 11:00 AM Vietnam Time (UTC+7) = 04:00 AM UTC
    // schedule.scheduleJob('0 4 * * *', async () => {
    //     try {
    //         console.log('🚀 Running Morning Brief task...');
    //         // Fetch summary for ALL active channels and post into their respective channels
    //         await runMorningBriefCron(client);
    //     } catch (error) {
    //         console.error('Error in Morning Brief job:', error);
    //     }
    // });
}

async function runMorningBriefCron(client) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // List of channels to explicitly ignore
    const excludeChannels = ['welcome', 'roles-selection', 'daily-summary', 'bot', 'shift-report', 'assign-task', 'attendance-shift-report', '-test-bot-just_for_it', '-bot-dev-just_for_it', 'support'];

    // Get all text channels
    const allChannels = client.channels.cache.filter(c => c.isTextBased() && !excludeChannels.includes(c.name));

    for (const [id, sourceChannel] of allChannels) {
        let combinedText = '';
        try {
            const messages = await sourceChannel.messages.fetch({ limit: 100 });
            if (messages.size > 0) {
                // Check if there is at least one valid human message in the last 24 hours
                const hasRecentActivity = messages.some(msg => !msg.author.bot && msg.content.trim() !== '' && msg.createdAt > oneDayAgo);
                
                if (!hasRecentActivity) {
                    console.log(`No recent human activity in #${sourceChannel.name || sourceChannel.id}. Skipping.`);
                    continue;
                }

                // If active, combine ALL 100 messages for full context (including older ones)
                const sortedMessages = Array.from(messages.values()).reverse();
                for (const msg of sortedMessages) {
                    if (!msg.author.bot && msg.content.trim() !== '') {
                        combinedText += `User ${msg.author.username}: ${msg.content}\n`;
                    }
                }
            }
        } catch (err) {
            console.error(`Error fetching history for channel ${sourceChannel.name || sourceChannel.id}:`, err.message);
            continue;
        }

        if (combinedText.trim() === '') continue;

        const prompt = `You are an Executive Assistant preparing a Summary Brief for the CEO. Read the following conversation logs from channel #${sourceChannel.name}.
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

        await sourceChannel.send(`**🌅 Báo cáo tự động (Morning Brief):**\n\n${aiSummary}`);
    }
}

/**
 * Fetches yesterday's (or recent) data and generates a summary report for Discord
 */
async function runMorningBrief(interaction, targetChannel = null) {
    const channel = targetChannel || interaction.channel;
    
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
    runMorningBrief,
    runMorningBriefCron
};
