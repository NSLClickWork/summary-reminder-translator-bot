const { REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, GatewayIntentBits, Partials, ApplicationCommandType } = require('discord.js');
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
        name: 'Translate to 🇻🇳',
        type: ApplicationCommandType.Message,
    },
    {
        name: 'Translate to 🇺🇸',
        type: ApplicationCommandType.Message,
    },
    {
        name: 'Translate to 🇩🇪',
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
        // morningBrief.initMorningBrief(summaryBot, [], ''); // Refactoring needed inside
    });

    summaryBot.on('interactionCreate', async interaction => {
        if (interaction.isMessageContextMenuCommand()) {
            await translator.handleContextMenu(interaction);
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        if (interaction.commandName === 'summary') {
            await interaction.reply({ content: '⏳ Gathering data and summarizing. Please wait...', ephemeral: true });
            
            // Call the refactored runMorningBrief passing interaction instead of slack client
            try {
                await morningBrief.runMorningBrief(interaction);
            } catch (err) {
                console.error(err);
                await interaction.editReply('❌ An error occurred while generating the summary.');
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
                    .setColor('#0099ff');

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('btn_check_approvals')
                            .setLabel('📋 Review Approvals')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('btn_check_deadlines')
                            .setLabel('⏰ Check Deadlines')
                            .setStyle(ButtonStyle.Danger),
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
            else if (btnId === 'btn_check_deadlines') {
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

        // Handle Modal Submissions
        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('modal_sync_submit_')) {
                await sync.handleInteraction(interaction);
            }
        }
    });
}

module.exports = { init };
