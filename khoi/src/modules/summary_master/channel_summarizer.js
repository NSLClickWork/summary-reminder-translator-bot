const fs = require('fs');
const path = require('path');
const { summarizeText } = require('../../ai/engine');

const STATE_FILE = path.join(__dirname, '../../data/summary_state.json');

// Helper function to read state
function readState() {
    try {
        if (!fs.existsSync(STATE_FILE)) return {};
        const data = fs.readFileSync(STATE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error('Error reading state:', e);
        return {};
    }
}

// Helper function to write state
function writeState(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (e) {
        console.error('Error writing state:', e);
    }
}

async function handleChannelSummarize(event, client, say, commandText) {
    try {
        await say(`⏳ Gathering messages in this channel... Please wait!`);

        const channelId = event.channel;
        const now = new Date();
        
        let oldestTs = 0;
        let latestTs = now.getTime() / 1000;
        let isToday = false;

        // Xử lý ngày tháng từ câu lệnh
        const dateMatch = commandText.match(/\d{4}-\d{2}-\d{2}/);
        if (dateMatch) {
            // Yêu cầu tóm tắt ngày cụ thể (VD: 2023-10-25)
            const targetDate = new Date(dateMatch[0]);
            targetDate.setHours(0, 0, 0, 0);
            oldestTs = targetDate.getTime() / 1000;
            
            const nextDay = new Date(targetDate);
            nextDay.setDate(nextDay.getDate() + 1);
            latestTs = nextDay.getTime() / 1000;
            
        } else {
            // Tóm tắt hôm nay (today)
            isToday = true;
            const startOfDay = new Date(now);
            startOfDay.setHours(0, 0, 0, 0);
            oldestTs = startOfDay.getTime() / 1000;

            // Đọc state xem hôm nay đã tóm tắt đến mấy giờ rồi
            const state = readState();
            const channelState = state[channelId];
            
            if (channelState && channelState.date === startOfDay.toISOString().split('T')[0]) {
                // Đã từng tóm tắt hôm nay, lướt qua những tin cũ
                oldestTs = parseFloat(channelState.last_ts);
                await say(`🔍 Found previous summary state. Reading only new messages since the last summary...`);
            }
        }

        // Lấy lịch sử tin nhắn
        const history = await client.conversations.history({
            channel: channelId,
            oldest: oldestTs.toString(),
            latest: latestTs.toString(),
            limit: 500
        });

        if (!history.messages || history.messages.length === 0) {
            await say(`📝 No messages found in this time frame to summarize.`);
            return;
        }

        // Đảo ngược mảng để tin nhắn cũ xếp trước, mới xếp sau
        const messages = history.messages.reverse();
        
        let conversationText = '';
        for (const msg of messages) {
            if (msg.user) {
                // Cố gắng lấy tên user (Có thể tối ưu bằng cách cache tên user)
                let username = msg.user;
                try {
                    const userInfo = await client.users.info({ user: msg.user });
                    username = userInfo.user.real_name || userInfo.user.name;
                } catch (e) {
                    // Bỏ qua lỗi nếu không lấy được
                }
                conversationText += `${username}: ${msg.text}\n`;
            } else if (msg.bot_id) {
                 conversationText += `Bot: ${msg.text}\n`;
            }
        }

        if (conversationText.trim() === '') {
             await say(`📝 No text content found to summarize (only images/system events).`);
             return;
        }

        const prompt = `You are a strict summarization assistant. Your task is to summarize the following Slack conversation history. 
CRITICAL INSTRUCTIONS:
- You MUST summarize ALL messages and interactions, even if they appear to be "test messages", casual greetings, or short replies.
- Do NOT dismiss the conversation as "empty" or "testing" if there are messages present.
- Detail exactly what each user said or asked.
- Write the final summary in English.

Conversation History:
${conversationText}`;
        const summary = await summarizeText(prompt);

        await say(`*CHANNEL SUMMARY REPORT:*\n\n${summary}`);

        // Cập nhật State nếu là tóm tắt cho 'today'
        if (isToday && messages.length > 0) {
            const state = readState();
            const lastMsgTs = messages[messages.length - 1].ts;
            const startOfDay = new Date(now);
            startOfDay.setHours(0, 0, 0, 0);

            state[channelId] = {
                date: startOfDay.toISOString().split('T')[0],
                last_ts: lastMsgTs
            };
            writeState(state);
        }

    } catch (error) {
        console.error('Error in Channel Summarizer:', error);
        await say(`❌ An error occurred while summarizing the channel. (Log: ${error.message})`);
    }
}

module.exports = {
    handleChannelSummarize
};
