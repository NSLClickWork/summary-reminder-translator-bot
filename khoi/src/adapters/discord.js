const { REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, GatewayIntentBits, Partials, ApplicationCommandType, ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
const schedule = require('node-schedule');

// Import logic from modules (will be refactored to support Discord instead of Slack)
const morningBrief = require('../modules/summary_master/morning_brief');
const approvals = require('../modules/approvals');
const deadlines = require('../modules/deadlines');
const sync = require('../modules/sync');
const translator = require('../modules/translator');

// Slash commands for Summary Bot
const summaryCommands = [
    {
        name: 'summary',
        description: 'Get an immediate summary of yesterday\'s activities',
    },
    {
        name: 'setup_summary_dashboard',
        description: 'Deploy the Pinned Dashboard for the Summary Bot (Admin only)'
    },
    {
        name: 'trigger_morning_brief',
        description: 'Admin only: Manually trigger the morning brief cron job for all active channels'
    },
    {
        name: 'Translate to VN',
        type: ApplicationCommandType.Message,
    },
    {
        name: 'Translate to EN',
        type: ApplicationCommandType.Message,
    },
    {
        name: 'Translate to DE',
        type: ApplicationCommandType.Message,
    }
];

// Slash commands for Reminder Bot
const reminderCommands = [
    {
        name: 'setup_reminder_dashboard',
        description: 'Deploy the Pinned Dashboard for the Reminder Bot (Admin only)',
    }
];

/**
 * Register slash commands globally for the bot
 */
async function registerSlashCommands(clientId, token, botCommands) {
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        console.log(`Started refreshing application (/) commands for client ${clientId}.`);
        await rest.put(Routes.applicationCommands(clientId), { body: botCommands });
        console.log(`Successfully reloaded application (/) commands for client ${clientId}.`);
    } catch (error) {
        console.error(error);
    }
}

/**
 * Main initialization for Discord Adapters
 * @param {import('discord.js').Client} summaryBot
 * @param {import('discord.js').Client} reminderBot
 */
function init(summaryBot, reminderBot) {
    
    // ==========================================
    // SUMMARY BOT EVENTS
    // ==========================================
    summaryBot.on('ready', async () => {
        console.log(`[Summary Bot] Logged in as ${summaryBot.user.tag}!`);
        await registerSlashCommands(process.env.DISCORD_SUMMARY_CLIENT_ID, process.env.DISCORD_SUMMARY_TOKEN, summaryCommands);
        
        // Init the cron job for Morning Brief (using discord client instead of slack)
        morningBrief.initMorningBrief(summaryBot);
    });

    summaryBot.on('interactionCreate', async interaction => {
        if (interaction.isMessageContextMenuCommand()) {
            await translator.handleContextMenu(interaction);
            return;
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'btn_summary_all') {
                await interaction.deferReply({ ephemeral: true });
                const member = interaction.member;
                const hasPerm = member.roles.cache.some(role => ['CEO'].includes(role.name));
                if (!hasPerm) {
                    return await interaction.editReply('🚫 **Access Denied:** Only the Management Team (CEO) can run the global summary.');
                }
                await interaction.editReply('🚀 Triggering global Morning Brief for all active channels...');
                try {
                    await morningBrief.runMorningBriefCron(summaryBot);
                    await interaction.editReply('✅ Global Morning Brief completed!');
                } catch (error) {
                    console.error(error);
                    await interaction.editReply('❌ An error occurred while generating the global summary.');
                }
                return;
            }
            if (interaction.customId === 'btn_translation_guide') {
                await interaction.reply({
                    ephemeral: true,
                    content: "**📖 Translation Guide / Hướng dẫn Dịch:**\n\n" +
                             "**[EN]** To translate any message, simply Right-Click on the message (or Long Press on mobile) -> select **Apps** -> choose **Translate to 🇻🇳 / 🇺🇸 / 🇩🇪**. The translation will be sent to you privately!\n\n" +
                             "**[VN]** Để dịch bất kỳ tin nhắn nào, bạn chỉ cần Click Chuột Phải vào tin nhắn đó (hoặc Đè dính trên điện thoại) -> chọn **Ứng dụng (Apps)** -> chọn **Translate to 🇻🇳 / 🇺🇸 / 🇩🇪**. Bản dịch sẽ được gửi riêng cho bạn không ai thấy!"
                });
                return;
            }
        }

        if (interaction.isChannelSelectMenu() && interaction.customId === 'select_summary_channel') {
            await interaction.deferReply({ ephemeral: true });
            const channelId = interaction.values[0];
            const targetChannel = await summaryBot.channels.fetch(channelId);
            
            try {
                await morningBrief.runMorningBrief(interaction, targetChannel);
            } catch (error) {
                console.error(error);
                await interaction.editReply('❌ An error occurred while generating the summary.');
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        if (interaction.commandName === 'setup_summary_dashboard') {
            const embed = new EmbedBuilder()
                .setTitle('🌅 SUMMARY BOT: Daily Recap Dashboard')
                .setDescription(
                    '**Welcome to the Summary Dashboard!**\n\n' +
                    '⚠️ **Warning:** The "Summary All Channels" button will scan ALL active channels and post a summary directly into each channel. / **Cảnh báo:** Nút "Summary All" sẽ quét TOÀN BỘ kênh và gửi thẳng báo cáo vào từng kênh.\n\n' +
                    '👇 **Tip:** Use the dropdown menu below to summarize a specific channel. **You can type the channel name to search! (Gõ tên kênh để tìm nhanh)**'
                )
                .setColor('#10b981')
                .setFooter({ text: 'NSL Bot System • Designed by Khoi Nguyen (Tom)' });

            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_summary_all')
                        .setLabel('🌐 Summary All Channels')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('btn_translation_guide')
                        .setLabel('📖 Translation Guide')
                        .setStyle(ButtonStyle.Secondary)
                );

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ChannelSelectMenuBuilder()
                        .setCustomId('select_summary_channel')
                        .setPlaceholder('🔍 Select or type a channel name to search...')
                        .addChannelTypes(ChannelType.GuildText)
                );

            await interaction.reply({ embeds: [embed], components: [row1, row2] });
            return;
        }

        if (interaction.commandName === 'summary') {
            await interaction.deferReply({ ephemeral: true });
            
            try {
                await morningBrief.runMorningBrief(interaction);
            } catch (error) {
                console.error(error);
                await interaction.editReply('❌ An error occurred while generating the summary.');
            }
        }
        
        if (interaction.commandName === 'trigger_morning_brief') {
            await interaction.deferReply({ ephemeral: true });
            
            // Check if user has permission
            const member = interaction.member;
            const hasPermission = member.roles.cache.some(role => 
                ['CEO', 'CEO Assistant', 'Admin', 'IT'].includes(role.name)
            );

            if (!hasPermission) {
                return await interaction.editReply('🚫 **Access Denied:** Only Admins can manually trigger the morning brief.');
            }

            await interaction.editReply('🚀 Triggering Morning Brief for all active channels... (This might take a moment to scan)');
            
            try {
                await morningBrief.runMorningBriefCron(summaryBot);
                await interaction.followUp({ content: '✅ Manual Morning Brief trigger completed successfully!', ephemeral: true });
            } catch (error) {
                console.error(error);
                await interaction.followUp({ content: '❌ An error occurred while triggering the summary.', ephemeral: true });
            }
        }
    });

    summaryBot.on('messageReactionAdd', async (reaction, user) => {
        await translator.handleReactionAdd(reaction, user);
    });

    // ==========================================
    // REMINDER BOT EVENTS
    // ==========================================
    reminderBot.on('ready', async () => {
        console.log(`[Reminder Bot] Logged in as ${reminderBot.user.tag}!`);
        await registerSlashCommands(process.env.DISCORD_REMINDER_CLIENT_ID, process.env.DISCORD_REMINDER_TOKEN, reminderCommands);
        
        // Pass reminder bot to the modules to setup their own crons
        approvals.register(reminderBot);
        deadlines.register(reminderBot);
        sync.register(reminderBot);
    });

    reminderBot.on('interactionCreate', async interaction => {
        // Handle Slash Command: Setup Dashboard
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'setup_reminder_dashboard') {
                const embed = new EmbedBuilder()
                    .setTitle('🗂️ OPS Team: Daily Workflow Dashboard')
                    .setDescription('Click the buttons below to interact with your daily tasks. No commands needed!')
                    .setColor('#0099ff')
                    .setFooter({ text: 'NSL Bot System • Designed by Khoi Nguyen (Tom)' });

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('btn_check_deadlines')
                            .setLabel('⏰ Check Deadlines')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId('btn_assign_task')
                            .setLabel('✍️ Assign Task')
                            .setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder()
                            .setCustomId('btn_trigger_sync')
                            .setLabel('🔄 Trigger Sync')
                            .setStyle(ButtonStyle.Success)
                    );

                await interaction.reply({ embeds: [embed], components: [row] });
                // Note: The admin should then pin this message in Discord manually.
            }
        }

        // Handle Button Clicks
        if (interaction.isButton()) {
            const btnId = interaction.customId;
            
            if (btnId === 'btn_check_approvals' || btnId.startsWith('btn_review_') || btnId.startsWith('btn_approve_') || btnId.startsWith('btn_reject_')) {
                await approvals.handleInteraction(interaction);
            } 
            else if (btnId === 'btn_check_deadlines' || btnId === 'btn_assign_task') {
                await deadlines.handleInteraction(interaction);
            }
            else if (btnId === 'btn_trigger_sync') {
                await sync.handleInteraction(interaction);
            }
        }

        // Handle Channel Select Menus
        if (interaction.isChannelSelectMenu()) {
            if (interaction.customId === 'select_sync_channel') {
                await sync.handleInteraction(interaction);
            }
        }
        
        // Handle User Select Menus
        if (interaction.isUserSelectMenu()) {
            if (interaction.customId === 'select_assignee') {
                await deadlines.handleInteraction(interaction);
            }
        }

        // Handle Modal Submissions
        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('modal_sync_submit_')) {
                await sync.handleInteraction(interaction);
            } else if (interaction.customId.startsWith('modal_assign_task_')) {
                await deadlines.handleInteraction(interaction);
            }
        }
    });
}

module.exports = { init };
