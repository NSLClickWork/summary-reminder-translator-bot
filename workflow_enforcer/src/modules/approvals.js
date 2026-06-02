const schedule = require('node-schedule');
const Airtable = require('airtable');

function register(slackApp) {
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

    // 1. Cron Job: Run at 11:00 AM VN Time (04:00 UTC) every day
    // node-schedule uses UTC time by default when deployed on a UTC server
    schedule.scheduleJob('0 4 * * *', async () => {
        console.log('⏰ Running Approval Reminder Cron Job');
        try {
            // Fix #6: Only remind approvals that have been Pending for 7 days or less
            // to avoid spamming managers about stale tasks every single day.
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

            const records = await base('Approvals').select({
                filterByFormula: `AND({Status} = 'Pending', IS_AFTER({Created_Date}, '${sevenDaysAgoStr}'))`
            }).firstPage();

            for (const record of records) {
                const approverId = record.get('Approver_Slack_ID');
                const taskName = record.get('Task_Name');
                const requester = record.get('Requester');
                const recordId = record.getId();

                if (approverId) {
                    await slackApp.client.chat.postMessage({
                        channel: approverId,
                        text: `You have a pending approval: ${taskName}`,
                        blocks: [
                            {
                                type: 'section',
                                text: {
                                    type: 'mrkdwn',
                                    text: `🚨 *Approval Reminder*\n\nYou have a request pending your review.\n*Task:* ${taskName}\n*Requested by:* ${requester || 'Unknown'}`
                                }
                            },
                            {
                                type: 'actions',
                                elements: [
                                    {
                                        type: 'button',
                                        text: {
                                            type: 'plain_text',
                                            text: 'Approve'
                                        },
                                        style: 'primary',
                                        action_id: `btn_approve_${recordId}`,
                                        value: recordId
                                    },
                                    {
                                        type: 'button',
                                        text: {
                                            type: 'plain_text',
                                            text: 'Reject'
                                        },
                                        style: 'danger',
                                        action_id: `btn_reject_${recordId}`,
                                        value: recordId
                                    }
                                ]
                            }
                        ]
                    });
                }
            }
        } catch (error) {
            console.error('Error running Approval cron:', error);
        }
    });

    // 2. Action: Check Approvals Button (from App Home)
    slackApp.action('btn_check_approvals', async ({ ack, body, client }) => {
        await ack();
        const userId = body.user.id;

        try {
            const records = await base('Approvals').select({
                filterByFormula: `AND({Status} = 'Pending', {Approver_Slack_ID} = '${userId}')`
            }).firstPage();

            let blocks = [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '📋 Your Pending Approvals'
                    }
                }
            ];

            if (records.length === 0) {
                blocks.push({
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: '✅ You have no pending approvals at the moment! Great job.'
                    }
                });
            } else {
                for (const record of records) {
                    const taskName = record.get('Task_Name');
                    const requester = record.get('Requester');
                    const recordId = record.getId();

                    blocks.push({
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `*Task:* ${taskName}\n*Requested by:* ${requester || 'Unknown'}`
                        },
                        accessory: {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: 'Review'
                            },
                            action_id: `btn_review_${recordId}`,
                            value: recordId
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
                        text: 'Approvals'
                    },
                    close: {
                        type: 'plain_text',
                        text: 'Close'
                    },
                    blocks: blocks
                }
            });
        } catch (error) {
            console.error('Error fetching approvals:', error);
            await client.views.open({
                trigger_id: body.trigger_id,
                view: {
                    type: 'modal',
                    title: {
                        type: 'plain_text',
                        text: 'Approvals'
                    },
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: '⚠️ *Database not ready*\nThe `Approvals` table has not been set up in Airtable yet. Please ask the Admin to create it with fields: `Task_Name`, `Requester`, `Approver_Slack_ID`, `Status`, `Created_Date`.'
                            }
                        }
                    ]
                }
            });
        }
    });

    // 3. Fix #2: Handle Review button - opens a detail modal with Approve/Reject actions
    slackApp.action(/btn_review_/, async ({ ack, action, body, client }) => {
        await ack();
        const recordId = action.value;

        try {
            const record = await base('Approvals').find(recordId);
            const taskName = record.get('Task_Name') || 'Unknown Task';
            const requester = record.get('Requester') || 'Unknown';
            const status = record.get('Status') || 'Pending';
            const notes = record.get('Notes') || 'No additional notes.';

            await client.views.open({
                trigger_id: body.trigger_id,
                view: {
                    type: 'modal',
                    title: {
                        type: 'plain_text',
                        text: 'Review Request'
                    },
                    close: {
                        type: 'plain_text',
                        text: 'Back'
                    },
                    blocks: [
                        {
                            type: 'section',
                            fields: [
                                {
                                    type: 'mrkdwn',
                                    text: `*Task:*\n${taskName}`
                                },
                                {
                                    type: 'mrkdwn',
                                    text: `*Requested by:*\n${requester}`
                                },
                                {
                                    type: 'mrkdwn',
                                    text: `*Current Status:*\n${status}`
                                }
                            ]
                        },
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `*Notes:*\n${notes}`
                            }
                        },
                        {
                            type: 'divider'
                        },
                        {
                            type: 'actions',
                            elements: [
                                {
                                    type: 'button',
                                    text: {
                                        type: 'plain_text',
                                        text: '✅ Approve'
                                    },
                                    style: 'primary',
                                    action_id: `btn_approve_${recordId}`,
                                    value: recordId
                                },
                                {
                                    type: 'button',
                                    text: {
                                        type: 'plain_text',
                                        text: '❌ Reject'
                                    },
                                    style: 'danger',
                                    action_id: `btn_reject_${recordId}`,
                                    value: recordId
                                }
                            ]
                        }
                    ]
                }
            });
        } catch (error) {
            console.error('Error opening review modal:', error);
        }
    });

    // Handle Approve action
    slackApp.action(/btn_approve_/, async ({ ack, action, body, client }) => {
        await ack();
        const recordId = action.value;
        try {
            await base('Approvals').update(recordId, { Status: 'Approved' });
            await client.chat.postMessage({
                channel: body.user.id,
                text: `✅ You have approved the request. Airtable has been updated.`
            });
        } catch (e) {
            console.error('Error approving record:', e);
        }
    });

    // Handle Reject action
    slackApp.action(/btn_reject_/, async ({ ack, action, body, client }) => {
        await ack();
        const recordId = action.value;
        try {
            await base('Approvals').update(recordId, { Status: 'Rejected' });
            await client.chat.postMessage({
                channel: body.user.id,
                text: `❌ You have rejected the request. Airtable has been updated.`
            });
        } catch (e) {
            console.error('Error rejecting record:', e);
        }
    });
}

module.exports = { register };
