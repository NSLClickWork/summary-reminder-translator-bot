const schedule = require('node-schedule');
const Airtable = require('airtable');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

function register(discordApp) {
    // 1. Cron Job: Run at 11:00 AM VN Time (04:00 UTC) every day
    schedule.scheduleJob('0 4 * * *', async () => {
        console.log('⏰ Running Approval Reminder Cron Job');
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

            const records = await base('Approvals').select({
                filterByFormula: `AND({Status} = 'Pending', IS_AFTER({Created_Date}, '${sevenDaysAgoStr}'))`
            }).firstPage();

            for (const record of records) {
                const approverId = record.get('Approver_Slack_ID'); // Using Slack ID field but it should contain Discord ID now
                const taskName = record.get('Task_Name');
                const requester = record.get('Requester');
                const recordId = record.getId();

                if (approverId) {
                    try {
                        const user = await discordApp.users.fetch(approverId);
                        
                        const embed = new EmbedBuilder()
                            .setColor('#ff9900')
                            .setTitle('🚨 Approval Reminder')
                            .setDescription(`You have a request pending your review.\n\n**Task:** ${taskName}\n**Requested by:** ${requester || 'Unknown'}`);
                            
                        const row = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`btn_approve_${recordId}`)
                                    .setLabel('Approve')
                                    .setStyle(ButtonStyle.Success),
                                new ButtonBuilder()
                                    .setCustomId(`btn_reject_${recordId}`)
                                    .setLabel('Reject')
                                    .setStyle(ButtonStyle.Danger)
                            );

                        await user.send({ embeds: [embed], components: [row] });
                    } catch (e) {
                        console.error(`Could not DM user ${approverId}:`, e);
                    }
                }
            }
        } catch (error) {
            console.error('Error running Approval cron:', error);
        }
    });
}

async function handleInteraction(interaction) {
    const btnId = interaction.customId;

    if (btnId === 'btn_check_approvals') {
        const userId = interaction.user.id;
        try {
            const records = await base('Approvals').select({
                filterByFormula: `AND({Status} = 'Pending', {Approver_Slack_ID} = '${userId}')`
            }).firstPage();

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📋 Your Pending Approvals');

            const components = [];

            if (records.length === 0) {
                embed.setDescription('✅ You have no pending approvals at the moment! Great job.');
            } else {
                embed.setDescription('Here are your pending requests:');
                
                records.forEach((record, index) => {
                    const taskName = record.get('Task_Name');
                    const requester = record.get('Requester');
                    const recordId = record.getId();

                    embed.addFields({
                        name: `${index + 1}. ${taskName}`,
                        value: `Requested by: ${requester || 'Unknown'}`
                    });

                    // Add a button for each record (max 5 buttons per row)
                    if (index < 5) {
                        if (index === 0) components.push(new ActionRowBuilder());
                        components[0].addComponents(
                            new ButtonBuilder()
                                .setCustomId(`btn_review_${recordId}`)
                                .setLabel(`Review #${index + 1}`)
                                .setStyle(ButtonStyle.Primary)
                        );
                    }
                });
            }

            await interaction.reply({ embeds: [embed], components: components, ephemeral: true });
        } catch (error) {
            console.error('Error fetching approvals:', error);
            await interaction.reply({ content: '⚠️ **Database not ready**\nThe `Approvals` table has not been set up in Airtable yet. Please ask the Admin to create it with fields: `Task_Name`, `Requester`, `Approver_Slack_ID`, `Status`, `Created_Date`.', ephemeral: true });
        }
    } 
    else if (btnId.startsWith('btn_review_')) {
        const recordId = btnId.replace('btn_review_', '');
        
        try {
            const record = await base('Approvals').find(recordId);
            const taskName = record.get('Task_Name') || 'Unknown Task';
            const requester = record.get('Requester') || 'Unknown';
            const status = record.get('Status') || 'Pending';
            const notes = record.get('Notes') || 'No additional notes.';

            const embed = new EmbedBuilder()
                .setColor('#ffcc00')
                .setTitle('🔍 Review Request')
                .addFields(
                    { name: 'Task', value: taskName, inline: true },
                    { name: 'Requested by', value: requester, inline: true },
                    { name: 'Current Status', value: status, inline: true },
                    { name: 'Notes', value: notes }
                );

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`btn_approve_${recordId}`)
                        .setLabel('✅ Approve')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`btn_reject_${recordId}`)
                        .setLabel('❌ Reject')
                        .setStyle(ButtonStyle.Danger)
                );

            // Update the ephemeral message with the review details
            await interaction.update({ embeds: [embed], components: [row] });
        } catch (error) {
            console.error('Error opening review:', error);
            await interaction.reply({ content: '❌ Failed to load review details.', ephemeral: true });
        }
    }
    else if (btnId.startsWith('btn_approve_')) {
        const recordId = btnId.replace('btn_approve_', '');
        try {
            await base('Approvals').update(recordId, { Status: 'Approved' });
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Request Approved')
                .setDescription('You have approved the request. Airtable has been updated.');
                
            await interaction.update({ embeds: [embed], components: [] }); // Remove buttons
        } catch (e) {
            console.error('Error approving record:', e);
            await interaction.reply({ content: '❌ Failed to approve record.', ephemeral: true });
        }
    }
    else if (btnId.startsWith('btn_reject_')) {
        const recordId = btnId.replace('btn_reject_', '');
        try {
            await base('Approvals').update(recordId, { Status: 'Rejected' });
            
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Request Rejected')
                .setDescription('You have rejected the request. Airtable has been updated.');
                
            await interaction.update({ embeds: [embed], components: [] }); // Remove buttons
        } catch (e) {
            console.error('Error rejecting record:', e);
            await interaction.reply({ content: '❌ Failed to reject record.', ephemeral: true });
        }
    }
}

module.exports = { register, handleInteraction };
