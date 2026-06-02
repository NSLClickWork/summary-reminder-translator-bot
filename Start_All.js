// NSL Bots Entry Point
// This file will boot up all individual bot modules when deployed to Railway

console.log('Booting up NSL Bots...');

// Boot up Khôi Nguyên's Bots (Summary, Reminder, Translator)
require('./khoi/index.js');

// Boot up Blobs' Bots (Backup, Content) - To be implemented
// require('./blobs/index.js');

// Boot up Sharkie's Bots (Payroll, Recruiting) - To be implemented
// require('./sharkie/index.js');

console.log('All available bots have been initialized!');
