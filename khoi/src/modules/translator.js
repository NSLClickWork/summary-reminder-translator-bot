const { translateText } = require('../../../shared/ai/engine');

const flagMap = {
    '🇻🇳': 'Vietnamese',
    '🇬🇧': 'English',
    '🇺🇸': 'English',
    '🇩🇪': 'German',
    '🇯🇵': 'Japanese',
    '🇫🇷': 'French',
    '🇪🇸': 'Spanish',
    '🇰🇷': 'Korean',
    '🇨🇳': 'Chinese'
};

async function handleReactionAdd(reaction, user) {
    // Ignore bot's own reactions to prevent loops
    if (user.bot) return;

    // Check if the reaction is a flag we support
    const emojiName = reaction.emoji.name;
    const targetLang = flagMap[emojiName];

    if (!targetLang) return; // Not a supported flag

    try {
        // When a reaction is added to an old message, it might not be fully cached
        if (reaction.partial) {
            await reaction.fetch();
        }
        
        const message = reaction.message;
        if (message.partial) {
            await message.fetch();
        }

        const textToTranslate = message.content;
        
        // Don't translate empty messages (e.g. only attachments)
        if (!textToTranslate || textToTranslate.trim() === '') return;

        // Call Groq AI to translate
        const translatedResult = await translateText(textToTranslate, targetLang);

        // Send the translation as a Direct Message (DM) to the user so no one else knows
        await user.send(`**${emojiName} Translation of [this message](${message.url}):**\n${translatedResult}`);

    } catch (error) {
        console.error('Translation error:', error);
    }
}

async function handleContextMenu(interaction) {
    let targetLang = '';
    if (interaction.commandName === 'Translate to 🇻🇳') targetLang = 'Vietnamese';
    else if (interaction.commandName === 'Translate to 🇺🇸') targetLang = 'English';
    else if (interaction.commandName === 'Translate to 🇩🇪') targetLang = 'German';
    else return;

    await interaction.deferReply({ ephemeral: true });

    try {
        const textToTranslate = interaction.targetMessage.content;
        
        if (!textToTranslate || textToTranslate.trim() === '') {
            await interaction.editReply('No text found to translate.');
            return;
        }

        const translatedResult = await translateText(textToTranslate, targetLang);
        
        await interaction.editReply(`**${interaction.commandName}:**\n${translatedResult}`);
    } catch (error) {
        console.error('Context Menu Translation error:', error);
        await interaction.editReply('❌ Failed to translate the message.');
    }
}

module.exports = { handleReactionAdd, handleContextMenu };
