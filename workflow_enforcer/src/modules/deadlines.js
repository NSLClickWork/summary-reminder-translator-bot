const schedule = require('node-schedule');
const Airtable = require('airtable');

function register(slackApp) {
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

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
                const assigneeId = record.get('Assignee_Slack_ID');
                const taskName = record.get('Task_Name');
                const deadline = record.get('Deadline'); // format YYYY-MM-DD

                if (assigneeId && (deadline === todayStr || deadline === tomorrowStr)) {
                    const urgency = deadline === todayStr ? 'TODAY' : 'TOMORROW';
                    
                    await slackApp.client.chat.postMessage({
                        channel: assigneeId,
                        text: `Deadline Reminder: ${taskName} is due ${urgency}`,
                        blocks: [
                            {
                                type: 'header',
                                text: {
                                    type: 'plain_text',
                                    text: '🚨 Deadline Alert',
                                    emoji: true
                                }
                            },
                            {
                                type: 'section',
                                text: {
                                    type: 'mrkdwn',
                                    text: `Hi <@${assigneeId}>! Friendly reminder that the following task is due *${urgency}*:\n\n*Task:* ${taskName}\n*Deadline:* ${deadline}`
                                }
                            }
                        ]
                    });
                }
            }
        } catch (error) {
            console.error('Error running Deadline cron:', error);
        }
    });

    // 2. Action: Check Deadlines Button (from App Home)
    slackApp.action('btn_check_deadlines', async ({ ack, body, client }) => {
        await ack();
        const userId = body.user.id;
        
        try {
            const records = await base('Tasks').select({
                filterByFormula: `AND({Status} != 'Done', {Assignee_Slack_ID} = '${userId}')`,
                sort: [{field: "Deadline", direction: "asc"}]
            }).firstPage();

            let blocks = [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '⏳ Your Active Tasks'
                    }
                }
            ];

            if (records.length === 0) {
                blocks.push({
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: '🎉 You have no pending tasks or deadlines! Enjoy your day.'
                    }
                });
            } else {
                for (const record of records) {
                    const taskName = record.get('Task_Name');
                    const deadline = record.get('Deadline') || 'No deadline';
                    const status = record.get('Status') || 'To Do';

                    blocks.push({
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `*Task:* ${taskName}\n*Deadline:* ${deadline}\n*Status:* ${status}`
                        }
                    });
                }
            }

            await client.views.open({
                trigger_id: body.trigger_id,
                view: {
                    type: 'modal',
                    title: {
                        type: 'plain_text',
                        text: 'My Deadlines'
                    },
                    close: {
                        type: 'plain_text',
                        text: 'Close'
                    },
                    blocks: blocks
                }
            });
        } catch (error) {
            console.error('Error fetching tasks:', error);
            await client.views.open({
                trigger_id: body.trigger_id,
                view: {
                    type: 'modal',
                    title: {
                        type: 'plain_text',
                        text: 'My Deadlines'
                    },
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: '⚠️ *Database not ready*\nThe `Tasks` table has not been set up in Airtable yet. Please ask the Admin to create it with fields: `Task_Name`, `Assignee_Slack_ID`, `Deadline`, `Status`.'
                            }
                        }
                    ]
                }
            });
        }
    });
}

module.exports = { register };
