require('dotenv').config();
const OpenAI = require('openai');

let openai = null;
const MODELS = [
    process.env.AI_MODEL_NAME || 'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b',
    'groq/compound-mini'
];

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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function summarizeText(text) {
    if (!text || text.trim() === '') return '';

    // Truncate text to avoid token limits (keep the most recent 14,000 characters)
    let cleanedText = text;
    if (cleanedText.length > 14000) {
        cleanedText = '...[older messages truncated for brevity]...\n' + cleanedText.slice(cleanedText.length - 14000);
    }

    const ai = getOpenAI();

    for (let i = 0; i < MODELS.length; i++) {
        const model = MODELS[i];
        try {
            const response = await ai.chat.completions.create({
                model: model,
                messages: [
                    { role: 'system', content: 'You are an Executive Assistant. Summarize the given chat logs concisely in English with Key Decisions and Action Items.' },
                    { role: 'user', content: cleanedText }
                ],
                temperature: 0.3,
                max_tokens: 1024
            });

            if (response && response.choices && response.choices[0] && response.choices[0].message) {
                return response.choices[0].message.content;
            }
        } catch (error) {
            console.warn(`[AI Engine] Model ${model} failed (${error.status || error.message}). Attempting fallback...`);
            // Brief pause before trying fallback model to respect rate limits
            if (i < MODELS.length - 1) {
                await sleep(2000);
            }
        }
    }

    console.error('[AI Engine] All AI models failed to summarize.');
    return '*Không có cập nhật kinh doanh đáng chú ý hoặc AI đang tạm thời đạt giới hạn tần suất.*';
}

async function translateText(text, targetLang) {
    if (!text || text.trim() === '') return '';

    const ai = getOpenAI();

    for (let i = 0; i < MODELS.length; i++) {
        const model = MODELS[i];
        try {
            const response = await ai.chat.completions.create({
                model: model,
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

            if (response && response.choices && response.choices[0] && response.choices[0].message) {
                return response.choices[0].message.content.trim();
            }
        } catch (error) {
            console.warn(`[AI Engine] Translate with ${model} failed (${error.status || error.message}). Trying fallback...`);
            if (i < MODELS.length - 1) {
                await sleep(1500);
            }
        }
    }

    throw new Error('All AI models failed during translation.');
}

module.exports = {
    summarizeText,
    translateText
};
