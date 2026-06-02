const schedule = require('node-schedule');
const Airtable = require('airtable');
const { EmbedBuilder, ActionRowBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

function register(discordApp) {
    // 1. Cron Job: Run at 11:00 AM VN Time (04:00 UTC) every day
    schedule.scheduleJob('0 4 * * *', async () => {
        console.log('⏰ Running Deadline Monitor Cron Job');
        try {
            const records = await base('Tasks').select({
                filterByFormula: "AND({Status} != 'Done', {Deadline} != '')"
            }).firstPage();

            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const todayStr = today.toISOString().split('T')[0];
            const tomorrowStr = tomorrow.toISOString().split('T')[0];

            for (const record of records) {
                const assigneeId = record.get('Assignee_Slack_ID'); // Using Slack ID field but it should contain Discord ID now
                const taskName = record.get('Task_Name');
                const deadline = record.get('Deadline'); // format YYYY-MM-DD

                if (assigneeId && (deadline === todayStr || deadline === tomorrowStr)) {
                    const urgency = deadline === todayStr ? 'TODAY' : 'TOMORROW';
                    
                    try {
                        const user = await discordApp.users.fetch(assigneeId);
                        
                        const embed = new EmbedBuilder()
                            .setColor(deadline === todayStr ? '#ff0000' : '#ff9900')
                            .setTitle('🚨 Deadline Alert')
                            .setDescription(`Hi <@${assigneeId}>! Friendly reminder that the following task is due **${urgency}**:\n\n**Task:** ${taskName}\n**Deadline:** ${deadline}`);

                        await user.send({ embeds: [embed] });
                    } catch (e) {
                        console.error(`Could not DM user ${assigneeId} for deadline:`, e);
                    }
                }
            }
        } catch (error) {
            console.error('Error running Deadline cron:', error);
        }
    });
}

async function handleInteraction(interaction) {
    if (interaction.customId === 'btn_check_deadlines') {
        const userId = interaction.user.id;
        
        try {
            const records = await base('Tasks').select({
                filterByFormula: `AND({Status} != 'Done', {Assignee_Slack_ID} = '${userId}')`,
                sort: [{field: "Deadline", direction: "asc"}]
            }).firstPage();

            const embed = new EmbedBuilder()
                .setColor('#ff3333')
                .setTitle('⏳ Your Active Tasks');

            if (records.length === 0) {
                embed.setDescription('🎉 You have no pending tasks or deadlines! Enjoy your day.');
            } else {
                embed.setDescription('Here are your pending tasks sorted by deadline:');
                
                records.forEach((record, index) => {
                    const taskName = record.get('Task_Name');
                    const deadline = record.get('Deadline') || 'No deadline';
                    const status = record.get('Status') || 'To Do';

                    embed.addFields({
                        name: `${index + 1}. ${taskName}`,
                        value: `**Deadline:** ${deadline}\n**Status:** ${status}`
                    });
                });
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error('Error fetching tasks:', error);
            await interaction.reply({ content: '⚠️ **Database not ready**\nThe `Tasks` table has not been set up in Airtable yet. Please ask the Admin to create it with fields: `Task_Name`, `Assignee_Slack_ID`, `Deadline`, `Status`.', ephemeral: true });
        }
    }
    
    // Step 1: Assign Task Button clicked
    if (interaction.isButton() && interaction.customId === 'btn_assign_task') {
        const row = new ActionRowBuilder()
            .addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId('select_assignee')
                    .setPlaceholder('Select the assignee...')
            );
            
        await interaction.reply({ 
            content: 'Please select the team member you want to assign this task to:', 
            components: [row], 
            ephemeral: true 
        });
    }
    
    // Step 2: User selected, show Modal
    if (interaction.isUserSelectMenu() && interaction.customId === 'select_assignee') {
        const assigneeId = interaction.values[0];
        
        const modal = new ModalBuilder()
            .setCustomId(`modal_assign_task_${assigneeId}`)
            .setTitle('Assign New Task');

        const taskNameInput = new TextInputBuilder()
            .setCustomId('taskName')
            .setLabel("What is the task?")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const deadlineInput = new TextInputBuilder()
            .setCustomId('deadline')
            .setLabel("Deadline (e.g. 2026-06-03 or Tomorrow)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const row1 = new ActionRowBuilder().addComponents(taskNameInput);
        const row2 = new ActionRowBuilder().addComponents(deadlineInput);

        modal.addComponents(row1, row2);

        await interaction.showModal(modal);
    }
    
    // Step 3: Modal submitted, save to Airtable
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_assign_task_')) {
        const assigneeId = interaction.customId.replace('modal_assign_task_', '');
        const taskName = interaction.fields.getTextInputValue('taskName');
        const deadline = interaction.fields.getTextInputValue('deadline');
        
        try {
            await base('Tasks').create([
                {
                    "fields": {
                        "Task_Name": taskName,
                        "Assignee_Slack_ID": assigneeId,
                        "Deadline": deadline,
                        "Status": "To Do"
                    }
                }
            ]);
            
            await interaction.reply({
                content: `✅ Successfully assigned **${taskName}** to <@${assigneeId}> with deadline **${deadline}**!`,
                ephemeral: true
            });
            
            // Optionally try to notify the assignee
            try {
                const user = await interaction.client.users.fetch(assigneeId);
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('📋 New Task Assigned')
                    .setDescription(`You have been assigned a new task by <@${interaction.user.id}>.`)
                    .addFields(
                        { name: 'Task', value: taskName },
                        { name: 'Deadline', value: deadline }
                    );
                await user.send({ embeds: [embed] });
            } catch (err) {
                console.error('Could not notify user:', err);
            }
        } catch (error) {
            console.error('Error creating task:', error);
            await interaction.reply({ content: '❌ Failed to save the task to Airtable.', ephemeral: true });
        }
    }
}

module.exports = { register, handleInteraction };
