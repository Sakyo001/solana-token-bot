const { Markup } = require('telegraf');

exports.delay = ms => new Promise(resolve => setTimeout(resolve, ms));

exports.getKeyboard = () => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('🔍 Explore Tokens', 'latest'),
            Markup.button.callback('❓ Help', 'help')
        ],
        // ... rest of keyboard buttons ...
    ]);
};

exports.getTokenStatus = (token) => {
    if (!token.price_usd && !token.holder_count) {
        return '🆕 Just Created';
    }
    // ... rest of status logic ...
};

// ... other helper functions ... 