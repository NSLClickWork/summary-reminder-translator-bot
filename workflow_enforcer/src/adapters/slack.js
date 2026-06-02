const approvalsModule = require('../modules/approvals');
const syncModule = require('../modules/sync');
const deadlinesModule = require('../modules/deadlines');
const { registerSlackUI } = require('./slack_ui');

/**
 * Khởi tạo Slack Adapter và đăng ký các listeners
 * @param {import('@slack/bolt').App} slackApp
 */
function init(slackApp) {
    // Đăng ký các module
    approvalsModule.register(slackApp);
    syncModule.register(slackApp);
    deadlinesModule.register(slackApp);
    
    // Đăng ký Giao diện App Home
    registerSlackUI(slackApp);
}

module.exports = {
    init
};
