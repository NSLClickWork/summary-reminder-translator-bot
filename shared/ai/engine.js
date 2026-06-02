require('dotenv').config();
const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.AI_API_KEY,
    baseURL: process.env.AI_BASE_URL, // Supports Groq, Nvidia NIM, or OpenAI
});

const MODEL = process.env.AI_MODEL_NAME || 'llama3-70b-8192';

async function summarizeText(text) {
    try {
        const response = await openai.chat.completions.create({
            model: MODEL,
            messages: [
                { role: 'system', content: 'You are a highly efficient assistant. Summarize the following text concisely.' },
                { role: 'user', content: text }
            ],
            temperature: 0.3,
            max_tokens: 1024
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error('AI Engine Error:', error);
        return 'Sorry, I encountered an error while trying to summarize the text.';
    }
}

module.exports = {
    summarizeText
};
