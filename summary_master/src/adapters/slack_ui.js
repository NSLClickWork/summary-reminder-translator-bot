const { handleChannelSummarize } = require('../modules/summary_master/channel_summarizer');
const { runMorningBrief } = require('../modules/summary_master/morning_brief');

function registerSlackUI(slackApp) {
    // 1. Listen for App Home opened
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
                                text: '👋 Welcome to Summary Master'
                            }
                        },
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: 'I am your intelligent assistant. I condense information, summarize discussions, and generate morning briefs!'
                            },
                            accessory: {
                                type: 'button',
                                text: {
                                    type: 'plain_text',
                                    text: '📖 How it works (Read Me)',
                                    emoji: true
                                },
                                action_id: 'btn_readme_summary'
                            }
                        },
                        {
                            type: 'divider'
                        },
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: '*📝 Channel Summarizer*\nSummarize events, messages, and decisions in a specific channel. I remember where I left off so I never repeat myself!'
                            },
                            accessory: {
                                type: 'button',
                                text: {
                                    type: 'plain_text',
                                    text: 'Summarize Channel'
                                },
                                style: 'primary',
                                action_id: 'btn_summarize_channel'
                            }
                        },
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: '*🌅 Morning Brief*\nAutomatically extract decisions and generate an overview of yesterday\'s activities for the CEO.'
                            },
                            accessory: {
                                type: 'button',
                                text: {
                                    type: 'plain_text',
                                    text: 'Run Morning Brief Now'
                                },
                                action_id: 'btn_morning_brief'
                            }
                        },
                        {
                            type: 'divider'
                        },
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: '*💬 Thread Summarizer*\nTo summarize a specific thread, simply reply to that thread and tag me: `@Summary Master summarize`.'
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
    slackApp.action('btn_readme_summary', async ({ ack, body, client }) => {
        await ack();
        try {
            await client.views.open({
                trigger_id: body.trigger_id,
                view: {
                    type: 'modal',
                    title: {
                        type: 'plain_text',
                        text: 'About Summary Master'
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
                                text: '*What can I do?*\n\nI am the "Communication Brain" of NSL. I combine 4 powerful summarization features into one:\n\n*1. Daily Slack Summary*\nClick "Summarize Channel" to get a quick recap of any channel. I remember the last time you summarized it, so I only show you new events!\n\n*2. Morning Brief*\nI automatically generate an executive summary every morning at 8:00 AM (Vietnam Time) / 03:00 AM (Germany Time) for the CEO, or you can trigger it manually anytime.\n\n*3. Thread Summarizer*\nIf a conversation thread gets too long, just tag me with `@Summary Master summarize` in a reply, and I will read the whole thread and give you a short TL;DR.\n\n*4. Decision Memo*\nWhenever I detect an important decision during my channel summaries, I automatically log it into the Airtable database so it is never lost!'
                            }
                        }
                    ]
                }
            });
        } catch (error) {
            console.error('Error opening Read Me modal:', error);
        }
    });

    // 2. Handle 'btn_summarize_channel' click
    slackApp.action('btn_summarize_channel', async ({ ack, body, client }) => {
        await ack();

        // Mở Modal cho phép chọn kênh
        try {
            await client.views.open({
                trigger_id: body.trigger_id,
                view: {
                    type: 'modal',
                    callback_id: 'modal_summarize_channel',
                    title: {
                        type: 'plain_text',
                        text: 'Summarize Channel'
                    },
                    blocks: [
                        {
                            type: 'input',
                            block_id: 'select_channel_block',
                            element: {
                                type: 'channels_select',
                                action_id: 'channel_selected',
                                placeholder: {
                                    type: 'plain_text',
                                    text: 'Select a channel'
                                }
                            },
                            label: {
                                type: 'plain_text',
                                text: 'Target Channel'
                            }
                        }
                    ],
                    submit: {
                        type: 'plain_text',
                        text: 'Run Summary'
                    }
                }
            });
        } catch (error) {
            console.error('Error opening modal:', error);
        }
    });

    // 3. Handle 'btn_morning_brief' click
    slackApp.action('btn_morning_brief', async ({ ack, body, client }) => {
        await ack();

        try {
            // Send a DM or post to a default channel? 
            // We will ask for a channel to post the brief to.
            await client.views.open({
                trigger_id: body.trigger_id,
                view: {
                    type: 'modal',
                    callback_id: 'modal_morning_brief',
                    title: {
                        type: 'plain_text',
                        text: 'Morning Brief'
                    },
                    blocks: [
                        {
                            type: 'input',
                            block_id: 'select_channel_block',
                            element: {
                                type: 'channels_select',
                                action_id: 'channel_selected',
                                placeholder: {
                                    type: 'plain_text',
                                    text: 'Select a channel to analyze'
                                }
                            },
                            label: {
                                type: 'plain_text',
                                text: 'Target Channel'
                            }
                        }
                    ],
                    submit: {
                        type: 'plain_text',
                        text: 'Generate Brief'
                    }
                }
            });
        } catch (error) {
            console.error('Error opening morning brief modal:', error);
        }
    });

    // 4. Handle Modal Submissions
    slackApp.view('modal_summarize_channel', async ({ ack, body, view, client }) => {
        await ack();
        
        const channelId = view.state.values['select_channel_block']['channel_selected'].selected_channel;
        const userId = body.user.id;

        // Fake 'say' function to send message to the channel
        const say = async (text) => {
            await client.chat.postMessage({ channel: channelId, text: text });
        };
        const fakeEvent = { channel: channelId };
        
        // Notify user via DM that the bot is starting
        await client.chat.postMessage({
            channel: userId,
            text: `Starting summary for <#${channelId}>... The report will be posted directly to that channel.`
        });

        // Run summarizer in background
        handleChannelSummarize(fakeEvent, client, say, "summarize channel").catch(e => console.error(e));
    });

    slackApp.view('modal_morning_brief', async ({ ack, body, view, client }) => {
        await ack();
        
        const channelId = view.state.values['select_channel_block']['channel_selected'].selected_channel;
        const userId = body.user.id;

        // Notify user via DM
        await client.chat.postMessage({
            channel: userId,
            text: `Running Morning Brief (analyzing today's messages for testing) for <#${channelId}>...`
        });

        // Run Morning Brief in background (using useToday=true for testing)
        runMorningBrief(client, [channelId], channelId, true).catch(e => console.error(e));
    });
}

module.exports = {
    registerSlackUI
};
