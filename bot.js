const { Telegraf } = require('telegraf');
const express = require('express');
require('dotenv').config();

// Import config
const { BOT_TOKEN, port } = require('./src/config/config');

// Import commands
const startCommand = require('./src/commands/start');
const searchCommand = require('./src/commands/search');
const filterCommand = require('./src/commands/filter');
const prelaunchCommand = require('./src/commands/prelaunch');
const newmintsCommand = require('./src/commands/newmints');
const helpCommand = require('./src/commands/help');
const latestCommand = require('./src/commands/latest');

// Setup express server
const app = express();
const keepAlive = require('./keep_alive.js');

// Initialize bot
const bot = new Telegraf(BOT_TOKEN);

// Verify environment variables
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN not found in environment variables');
    process.exit(1);
}

// Setup basic web server
app.get('/', (req, res) => {
    res.send('Bot is running!');
});

// Start server with error handling
const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} is busy, trying ${port + 1}`);
        server.listen(port + 1);
    } else {
        console.error('Server error:', err);
    }
});

// Register commands
startCommand(bot);
searchCommand(bot);
filterCommand(bot);
prelaunchCommand(bot);
newmintsCommand(bot);
helpCommand(bot);
latestCommand(bot);

// Launch bot
bot.launch().then(() => {
    console.log('Bot started successfully');
    keepAlive();
}).catch((error) => {
    console.error('Error starting bot:', error);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
