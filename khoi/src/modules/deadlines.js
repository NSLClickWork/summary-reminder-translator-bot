const schedule = require('node-schedule');
const Airtable = require('airtable');
const { EmbedBuilder, ActionRowBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');

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

// In-memory cache: stores task data between check and view interactions
const taskCache = new Map();

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
                    let notes = record.get('Notes') || '';
                    if (notes) {
                        notes = notes.length > 200 ? notes.substring(0, 200) + '...' : notes;
                    }

                    embed.addFields({
                        name: `${index + 1}. ${taskName}`,
                        value: `**Deadline:** ${deadline}\n**Status:** ${status}${notes ? `\n**Notes:** ${notes}` : ''}`
                    });
                });

                const options = records.map((record, index) => {
                    const taskName = record.get('Task_Name');
                    const deadline = record.get('Deadline') || 'No deadline';
                    const notes = record.get('Notes') || '';
                    const recordId = record.getId();
                    
                    // Cache this task's full data for later retrieval
                    taskCache.set(recordId, { taskName, deadline, notes });
                    
                    return {
                        label: `${index + 1}. ${taskName.substring(0, 50)}`,
                        description: 'Click to view full details/notes',
                        value: recordId
                    };
                });
                
                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_view_task_details')
                        .setPlaceholder('View full task details & notes...')
                        .addOptions(options)
                );

                await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
            }
        } catch (error) {
            console.error('Error fetching tasks:', error);
            await interaction.reply({ content: '⚠️ **Database not ready**\nThe `Tasks` table has not been set up in Airtable yet. Please ask the Admin to create it with fields: `Task_Name`, `Assignee_Slack_ID`, `Deadline`, `Status`.', ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_view_task_details') {
        const recordId = interaction.values[0];
        try {
            const cached = taskCache.get(recordId);
            if (!cached) {
                return await interaction.reply({ content: '❌ Task data expired. Please press **Check Deadlines** again to refresh.', ephemeral: true });
            }
            
            const { taskName, deadline, notes } = cached;
            
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`📋 Task Details: ${taskName}`)
                .addFields({ name: 'Deadline', value: deadline });
            
            let files = [];
            const notesText = notes && notes.length > 0 ? notes : 'No additional notes.';
            embed.addFields({ name: 'Notes', value: notesText.substring(0, 1024) });
            
            const payload = { embeds: [embed], ephemeral: true };
            
            await interaction.reply(payload);
        } catch (error) {
            console.error('Error fetching task details:', error);
            await interaction.reply({ content: `❌ Failed to fetch task details. Error: ${error.message}`, ephemeral: true });
        }
    }
    
    // Step 1.5: Mark as Done Button clicked
    if (interaction.isButton() && interaction.customId === 'btn_mark_done') {
        const userId = interaction.user.id;
        
        try {
            const records = await base('Tasks').select({
                filterByFormula: `AND({Status} != 'Done', {Assignee_Slack_ID} = '${userId}')`,
                sort: [{field: "Deadline", direction: "asc"}]
            }).firstPage();

            if (records.length === 0) {
                return await interaction.reply({ content: '🎉 You have no pending tasks to mark as done!', ephemeral: true });
            }

            const options = records.slice(0, 25).map(record => {
                const taskName = record.get('Task_Name');
                const deadline = record.get('Deadline') || 'No deadline';
                return {
                    label: taskName.substring(0, 100),
                    description: `Deadline: ${deadline}`.substring(0, 100),
                    value: record.id
                };
            });

            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_mark_done')
                        .setPlaceholder('Select a task you have completed...')
                        .addOptions(options)
                );

            await interaction.reply({
                content: 'Please select the task you have completed:',
                components: [row],
                ephemeral: true
            });
        } catch (error) {
            console.error('Error fetching tasks for mark done:', error);
            await interaction.reply({ content: '⚠️ Failed to fetch your tasks from Airtable.', ephemeral: true });
        }
    }

    // Step 1.6: Task selected to mark as done
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_mark_done') {
        const recordId = interaction.values[0];
        
        try {
            // Update Airtable
            const updatedRecords = await base('Tasks').update([
                {
                    "id": recordId,
                    "fields": {
                        "Status": "Done"
                    }
                }
            ]);
            
            const taskName = updatedRecords[0].get('Task_Name');
            
            await interaction.reply({ content: `✅ Successfully marked **${taskName}** as Done!`, ephemeral: true });
            
            // Notify Boss in assign channel
            const assignChannelId = process.env.ASSIGN_TASK_CHANNEL_ID;
            if (assignChannelId) {
                const assignChannel = await interaction.client.channels.fetch(assignChannelId);
                if (assignChannel) {
                    await assignChannel.send({ 
                        content: `🎉 <@${interaction.user.id}> has completed the task: **${taskName}**!`
                    });
                }
            }
        } catch (error) {
            console.error('Error updating task status:', error);
            await interaction.reply({ content: '❌ Failed to update the task status in Airtable.', ephemeral: true });
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
            .setLabel("Details / Notes (Max 1000 chars, Optional)")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(1000)
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
            
            // Build and send public notification embed
            try {
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('📋 New Task Assigned')
                    .setDescription(`You have been assigned a new task by <@${interaction.user.id}>.`)
                    .addFields(
                        { name: 'Task', value: taskName },
                        { name: 'Deadline', value: parsedDeadline }
                    );
                if (notes) {
                    embed.addFields({ name: 'Notes', value: notes.substring(0, 1024) });
                }
                    
                const assignChannelId = process.env.ASSIGN_TASK_CHANNEL_ID;
                const payload = { 
                    content: `🔔 <@${assigneeId}>, you have a new task!`,
                    embeds: [embed] 
                };

                if (assignChannelId) {
                    const assignChannel = await interaction.client.channels.fetch(assignChannelId);
                    if (assignChannel) {
                        await assignChannel.send(payload);
                    } else {
                        await interaction.channel.send(payload);
                    }
                } else {
                    await interaction.channel.send(payload);
                }
            } catch (err) {
                console.error('Error sending notification:', err);
            }
        } catch (error) {
            console.error('Error creating task:', error);
            await interaction.reply({ content: '❌ Failed to save the task to Airtable.', ephemeral: true });
        }
    }
}

module.exports = { register, handleInteraction };
