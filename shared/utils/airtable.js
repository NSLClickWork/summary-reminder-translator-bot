const Airtable = require('airtable');

async function pushDecisionsToAirtable(decisions, channelId) {
    if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID || !process.env.AIRTABLE_TABLE_NAME) {
        console.warn('⚠️ Airtable configuration missing. Skipping push.');
        return;
    }

    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
    const tableName = process.env.AIRTABLE_TABLE_NAME;

    const records = decisions.map(decision => ({
        fields: {
            'Content': decision,
            'Source Channel': channelId,
            'Date': new Date().toISOString().split('T')[0]
        }
    }));

    if (records.length === 0) return;

    try {
        await base(tableName).create(records);
        console.log(`✅ Successfully pushed ${records.length} decisions to Airtable.`);
    } catch (error) {
        console.error('❌ Error pushing to Airtable:', error);
    }
}

module.exports = {
    pushDecisionsToAirtable
};
