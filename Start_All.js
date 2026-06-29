// NSL Bots Entry Point
// This file will boot up all individual bot modules when deployed to Railway

console.log('Booting up NSL Bots...');

// Boot up Summary & Translator Bots
require('./summary-translator/index.js');

// Boot up Reminder Bot
require('./reminder/index.js');

console.log('All available bots have been initialized!');
