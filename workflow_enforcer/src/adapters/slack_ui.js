function registerSlackUI(slackApp) {
    // Listen for App Home opened
    slackApp.event('app_home_opened', async ({ event, client, logger }) => {
        try {
            await client.views.publish({
                user_id: event.user,
                view: {
                    type: 'home',
                    blocks: [
                        {
                            type: 'header',
                            text: {
                                type: 'plain_text',
                                text: '🏢 Workflow Enforcer'
                            }
                        },
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: 'Welcome! I am your automated HR and Workflow assistant. My job is to ensure processes run smoothly and deadlines are met.'
                            },
                            accessory: {
                                type: 'button',
                                text: {
                                    type: 'plain_text',
                                    text: '📖 How it works (Read Me)',
                                    emoji: true
                                },
                                action_id: 'btn_readme_workflow'
                            }
                        },
                        {
                            type: 'divider'
                        },
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: '*✅ Pending Approvals*\nReview and approve tasks, documents, or requests that are waiting for your approval.'
                            },
                            accessory: {
                                type: 'button',
                                text: {
                                    type: 'plain_text',
                                    text: 'Check Approvals'
                                },
                                style: 'primary',
                                action_id: 'btn_check_approvals'
                            }
                        },
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: '*🔄 Cross-Team Sync*\nBroadcast an important decision or update from your team to another department.'
                            },
                            accessory: {
                                type: 'button',
                                text: {
                                    type: 'plain_text',
                                    text: 'Sync Update'
                                },
                                action_id: 'btn_cross_team_sync'
                            }
                        },
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: '*⏳ My Deadlines*\nView a list of your upcoming tasks and approaching deadlines.'
                            },
                            accessory: {
                                type: 'button',
                                text: {
                                    type: 'plain_text',
                                    text: 'Check Deadlines'
                                },
                                action_id: 'btn_check_deadlines'
                            }
                        }
                    ]
                }
            });
        } catch (error) {
            logger.error(error);
        }
    });

    // Handle Read Me button click
    slackApp.action('btn_readme_workflow', async ({ ack, body, client }) => {
        await ack();
        try {
            await client.views.open({
                trigger_id: body.trigger_id,
                view: {
                    type: 'modal',
                    title: {
                        type: 'plain_text',
                        text: 'About Workflow Enforcer'
                    },
                    close: {
                        type: 'plain_text',
                        text: 'Got it'
                    },
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: '*What can I do?*\n\nI combine 3 powerful workflow features into one:\n\n*1. Approval Reminder*\nI track pending approvals in Airtable and remind managers to review them. You can also manually check your pending items.\n\n*2. Cross-Team Sync*\nI help you easily forward important decisions or updates from your department to others to ensure everyone stays on the same page.\n\n*3. Deadline Monitor*\nI check your tasks every morning at 11:00 AM (Vietnam Time) / 06:00 AM (Germany Time). If you have a deadline today or tomorrow, I will send you a direct message so nothing falls through the cracks!'
                            }
                        }
                    ]
                }
            });
        } catch (error) {
            console.error('Error opening Read Me modal:', error);
        }
    });
}

module.exports = {
    registerSlackUI
};
