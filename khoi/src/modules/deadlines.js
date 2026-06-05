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
        const member = interaction.member;
        
        // Check if user has permission (CEO, CEO Assistant, Manager, Admin)
        const hasPermission = member.roles.cache.some(role => 
            ['CEO', 'CEO Assistant', 'Manager', 'Admin'].includes(role.name)
        );

        if (!hasPermission) {
            return await interaction.reply({ 
                content: '🚫 **Access Denied:** Only the Management Team (CEO) can assign tasks!', 
                ephemeral: true 
            });
        }

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
            .setLabel("What is the task (Title)?")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const deadlineInput = new TextInputBuilder()
            .setCustomId('deadline')
            .setLabel("Deadline (VD: 03/06/2026 hoặc Tomorrow)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
            
        const notesInput = new TextInputBuilder()
            .setCustomId('notes')
            .setLabel("Details / Notes (Optional)")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);

        const row1 = new ActionRowBuilder().addComponents(taskNameInput);
        const row2 = new ActionRowBuilder().addComponents(deadlineInput);
        const row3 = new ActionRowBuilder().addComponents(notesInput);

        modal.addComponents(row1, row2, row3);

        await interaction.showModal(modal);
    }
    
    // Step 3: Modal submitted, save to Airtable
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_assign_task_')) {
        const assigneeId = interaction.customId.replace('modal_assign_task_', '');
        const taskName = interaction.fields.getTextInputValue('taskName');
        const rawDeadline = interaction.fields.getTextInputValue('deadline');
        const notes = interaction.fields.getTextInputValue('notes') || '';
        
        // Parse date
        let parsedDeadline = rawDeadline;
        const lowerDeadline = rawDeadline.toLowerCase().trim();
        const today = new Date();
        
        if (lowerDeadline === 'today' || lowerDeadline === 'hôm nay') {
            parsedDeadline = today.toISOString().split('T')[0];
        } else if (lowerDeadline === 'tomorrow' || lowerDeadline === 'ngày mai') {
            const tmr = new Date(today);
            tmr.setDate(tmr.getDate() + 1);
            parsedDeadline = tmr.toISOString().split('T')[0];
        } else {
            // Check for DD/MM/YYYY or D/M/YYYY
            const parts = rawDeadline.split('/');
            if (parts.length === 3) {
                const day = parts[0].padStart(2, '0');
                const month = parts[1].padStart(2, '0');
                const year = parts[2];
                if (year.length === 4) {
                    parsedDeadline = `${year}-${month}-${day}`;
                }
            }
        }
        
        try {
            const fieldsToSave = {
                "Task_Name": taskName,
                "Assignee_Slack_ID": assigneeId,
                "Deadline": parsedDeadline,
                "Status": "To Do"
            };
            
            if (notes) {
                fieldsToSave["Notes"] = notes;
            }
            
            await base('Tasks').create([{ "fields": fieldsToSave }], { typecast: true });
            
            await interaction.reply({
                content: `✅ Successfully assigned **${taskName}** to <@${assigneeId}> with deadline **${parsedDeadline}**!`,
                ephemeral: true
            });
            
            // Send a public notification in the channel where the command was run
            try {
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('📋 New Task Assigned')
                    .setDescription(`You have been assigned a new task by <@${interaction.user.id}>.`)
                    .addFields(
                        { name: 'Task', value: taskName },
                        { name: 'Deadline', value: parsedDeadline }
                    );
                    
                const assignChannelId = process.env.ASSIGN_TASK_CHANNEL_ID;
                if (assignChannelId) {
                    const assignChannel = await interaction.client.channels.fetch(assignChannelId);
                    if (assignChannel) {
                        await assignChannel.send({ 
                            content: `🔔 <@${assigneeId}>, you have a new task!`,
                            embeds: [embed] 
                        });
                    } else {
                        await interaction.channel.send({ 
                            content: `🔔 <@${assigneeId}>, you have a new task!`,
                            embeds: [embed] 
                        });
                    }
                } else {
                    await interaction.channel.send({ 
                        content: `🔔 <@${assigneeId}>, you have a new task!`,
                        embeds: [embed] 
                    });
                }
            } catch (err) {
                console.error('Could not send notification to channel:', err);
            }
        } catch (error) {
            console.error('Error creating task:', error);
            await interaction.reply({ content: '❌ Failed to save the task to Airtable.', ephemeral: true });
        }
    }
}

module.exports = { register, handleInteraction };
