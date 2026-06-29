const { REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, GatewayIntentBits, Partials, ApplicationCommandType, ChannelSelectMenuBuilder, ChannelType, StringSelectMenuBuilder } = require('discord.js');

const approvals = require('../modules/approvals');
const deadlines = require('../modules/deadlines');
const sync = require('../modules/sync');

const reminderCommands = [
    {
        name: 'setup_reminder_dashboard',
        description: 'Deploy the Pinned Dashboard for the Reminder Bot (Admin only)',
    }
];

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

function init(reminderBot) {
    reminderBot.on('ready', async () => {
        console.log(`[Reminder Bot] Logged in as ${reminderBot.user.tag}!`);
        await registerSlashCommands(process.env.DISCORD_REMINDER_CLIENT_ID, process.env.DISCORD_REMINDER_TOKEN, reminderCommands);
        
        approvals.register(reminderBot);
        deadlines.register(reminderBot);
        sync.register(reminderBot);
    });

    reminderBot.on('interactionCreate', async interaction => {
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
                            .setCustomId('btn_mark_done')
                            .setLabel('✅ Mark as Done')
                            .setStyle(ButtonStyle.Success)
                    );

                await interaction.reply({ embeds: [embed], components: [row] });
            }
        }

        if (interaction.isButton()) {
            const btnId = interaction.customId;
            
            if (btnId === 'btn_check_approvals' || btnId.startsWith('btn_review_') || btnId.startsWith('btn_approve_') || btnId.startsWith('btn_reject_')) {
                await approvals.handleInteraction(interaction);
            } 
            else if (btnId === 'btn_check_deadlines' || btnId === 'btn_assign_task' || btnId === 'btn_mark_done') {
                await deadlines.handleInteraction(interaction);
            }
            else if (btnId === 'btn_trigger_sync') {
                await sync.handleInteraction(interaction);
            }
        }

        if (interaction.isChannelSelectMenu()) {
            if (interaction.customId === 'select_sync_channel') {
                await sync.handleInteraction(interaction);
            }
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'select_mark_done' || interaction.customId === 'select_view_task_details') {
                await deadlines.handleInteraction(interaction);
            }
        }

        if (interaction.isUserSelectMenu()) {
            if (interaction.customId === 'select_assignee') {
                await deadlines.handleInteraction(interaction);
            }
        }

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
