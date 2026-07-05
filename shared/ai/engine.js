require('dotenv').config();
const OpenAI = require('openai');

let openai = null;
const MODEL = process.env.AI_MODEL_NAME || 'llama-3.3-70b-versatile';

function getOpenAI() {
    if (!openai) {
        if (!process.env.AI_API_KEY) {
            console.warn('⚠️ AI_API_KEY is missing! AI features will fail if triggered.');
        }
        openai = new OpenAI({
            apiKey: process.env.AI_API_KEY || 'placeholder_to_avoid_crash',
            baseURL: process.env.AI_BASE_URL, 
        });
    }
    return openai;
}

async function summarizeText(text) {
    try {
        const ai = getOpenAI();
        const response = await ai.chat.completions.create({
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

async function translateText(text, targetLang) {
    if (!text || text.trim() === '') return '';

    try {
        const ai = getOpenAI();
        const response = await ai.chat.completions.create({
            model: MODEL,
            messages: [
                {
                    role: "system",
                    content: `You are a professional translator for a corporate environment. Translate the given text to ${targetLang}. Preserve the original tone and formatting. Do not add any conversational text, just output the translation.`
                },
                {
                    role: "user",
                    content: text
                }
            ],
            temperature: 0.1,
            max_tokens: 1024,
        });

        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error('Groq Translation Error:', error);
        throw error;
    }
}

module.exports = {
    summarizeText,
    translateText
};
