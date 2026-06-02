function register(slackApp) {
    // 1. Action: Cross-Team Sync Button (from App Home)
    slackApp.action('btn_cross_team_sync', async ({ ack, body, client }) => {
        await ack();
        
        try {
            await client.views.open({
                trigger_id: body.trigger_id,
                view: {
                    type: 'modal',
                    callback_id: 'modal_sync_submit',
                    title: {
                        type: 'plain_text',
                        text: 'Cross-Team Sync'
                    },
                    submit: {
                        type: 'plain_text',
                        text: 'Send Update'
                    },
                    close: {
                        type: 'plain_text',
                        text: 'Cancel'
                    },
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: 'Share an important update or decision with another team.'
                            }
                        },
                        {
                            type: 'input',
                            block_id: 'target_channel_block',
                            element: {
                                type: 'channels_select',
                                action_id: 'target_channel',
                                placeholder: {
                                    type: 'plain_text',
                                    text: 'Select a channel'
                                }
                            },
                            label: {
                                type: 'plain_text',
                                text: 'Target Channel'
                            }
                        },
                        {
                            type: 'input',
                            block_id: 'message_block',
                            element: {
                                type: 'plain_text_input',
                                action_id: 'message_input',
                                multiline: true,
                                placeholder: {
                                    type: 'plain_text',
                                    text: 'e.g., Marketing has finalized the Q3 budget.'
                                }
                            },
                            label: {
                                type: 'plain_text',
                                text: 'Message / Update'
                            }
                        }
                    ]
                }
            });
        } catch (error) {
            console.error('Error opening Sync modal:', error);
        }
    });

    // 2. Handle Sync Modal Submission
    slackApp.view('modal_sync_submit', async ({ ack, body, view, client }) => {
        await ack();

        const channelId = view.state.values.target_channel_block.target_channel.selected_channel;
        const message = view.state.values.message_block.message_input.value;
        const sender = body.user.id;

        try {
            await client.chat.postMessage({
                channel: channelId,
                text: `Cross-team update from <@${sender}>`,
                blocks: [
                    {
                        type: 'header',
                        text: {
                            type: 'plain_text',
                            text: '🔄 Cross-Team Update',
                            emoji: true
                        }
                    },
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `*From:* <@${sender}>\n\n${message}`
                        }
                    }
                ]
            });
            
            // Optionally, send a confirmation to the user
            await client.chat.postMessage({
                channel: sender,
                text: `✅ Your cross-team sync update was successfully sent to <#${channelId}>.`
            });
        } catch (error) {
            console.error('Error sending sync message:', error);
            await client.chat.postMessage({
                channel: sender,
                text: `❌ Failed to send your sync update. Please make sure the bot is invited to the target channel.`
            });
        }
    });
}

module.exports = { register };
