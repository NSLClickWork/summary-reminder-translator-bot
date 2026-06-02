const { summarizeText } = require('../../ai/engine');

/**
 * Handles the Thread Summarizer feature (Bot #15)
 */
async function handleThreadSummarize(event, client, say) {
    try {
        await say({ text: '⏳ Reading and summarizing this thread using Groq Llama 3...', thread_ts: event.thread_ts });
        
        // 1. Fetch the thread history
        const replies = await client.conversations.replies({
            channel: event.channel,
            ts: event.thread_ts
        });

        // 2. Format the messages for AI
        const messagesText = replies.messages.map(m => `<@${m.user}>: ${m.text}`).join('\n');
        
        // 3. Send to AI Engine
        const prompt = `You are a strict summarization assistant. Your task is to summarize the following Slack thread.
CRITICAL INSTRUCTIONS:
- You MUST summarize ALL messages and interactions, even if they appear to be "test messages", casual greetings, or short replies.
- Do NOT dismiss the conversation as "empty" or "testing" if there are messages present.
- Detail exactly what each user said or asked.
- Write the final summary in English.

Thread History:
${messagesText}`;
        const summary = await summarizeText(prompt);

        // 4. Reply with summary
        await say({
            text: `*THREAD SUMMARY:*\n\n${summary}`,
            thread_ts: event.thread_ts
        });
    } catch (error) {
        console.error('Error in Thread Summarizer:', error);
        await say({ text: '❌ An error occurred while summarizing the thread.', thread_ts: event.thread_ts });
    }
}

module.exports = {
    handleThreadSummarize
};
