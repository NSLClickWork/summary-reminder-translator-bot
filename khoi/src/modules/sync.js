const { EmbedBuilder, ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

function register(discordApp) {
    // No cron jobs for sync
}

async function handleInteraction(interaction) {
    if (interaction.customId === 'btn_trigger_sync') {
        // Step 1: Ask user to select a channel first (since Modals don't support ChannelSelect)
        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('select_sync_channel')
            .setPlaceholder('Select a target channel to sync with')
            .addChannelTypes(ChannelType.GuildText);
            
        const row = new ActionRowBuilder().addComponents(channelSelect);
        
        await interaction.reply({ 
            content: 'Please select the target channel you want to send your update to:', 
            components: [row], 
            ephemeral: true 
        });
    }
    else if (interaction.customId === 'select_sync_channel') {
        // Step 2: User selected a channel, now open the text input modal
        const selectedChannelId = interaction.values[0];
        
        const modal = new ModalBuilder()
            .setCustomId(`modal_sync_submit_${selectedChannelId}`)
            .setTitle('Cross-Team Sync');

        const messageInput = new TextInputBuilder()
            .setCustomId('message_input')
            .setLabel('Message / Update')
            .setPlaceholder('e.g., Marketing has finalized the Q3 budget.')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const row = new ActionRowBuilder().addComponents(messageInput);
        modal.addComponents(row);

        // Show the modal
        await interaction.showModal(modal);
    }
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_sync_submit_')) {
        // Step 3: Handle modal submission
        const targetChannelId = interaction.customId.replace('modal_sync_submit_', '');
        const message = interaction.fields.getTextInputValue('message_input');
        const senderId = interaction.user.id;

        try {
            const targetChannel = await interaction.client.channels.fetch(targetChannelId);
            
            if (targetChannel) {
                const embed = new EmbedBuilder()
                    .setColor('#9900ff')
                    .setTitle('🔄 Cross-Team Update')
                    .setDescription(message)
                    .setFooter({ text: `Update from @${interaction.user.username}` })
                    .setTimestamp();
                    
                await targetChannel.send({
                    content: `Cross-team update from <@${senderId}>`,
                    embeds: [embed]
                });
                
                await interaction.reply({ content: `✅ Your cross-team sync update was successfully sent to <#${targetChannelId}>.`, ephemeral: true });
                
                // Optionally delete the original channel select message if needed
                // But interaction.reply already resolves the modal interaction.
            } else {
                await interaction.reply({ content: `❌ Could not find the target channel.`, ephemeral: true });
            }
        } catch (error) {
            console.error('Error sending sync message:', error);
            await interaction.reply({ content: `❌ Failed to send your sync update. Please make sure the bot has permissions in that channel.`, ephemeral: true });
        }
    }
}

module.exports = { register, handleInteraction };
