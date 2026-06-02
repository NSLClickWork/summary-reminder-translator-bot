const schedule = require('node-schedule');
const Airtable = require('airtable');
const { EmbedBuilder } = require('discord.js');

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
}

module.exports = { register, handleInteraction };
