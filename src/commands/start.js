const { getKeyboard } = require('../utils/helpers');

module.exports = (bot) => {
    bot.command('start', async (ctx) => {
        try {
            const firstName = ctx.from.first_name || 'there';
            
            const welcomeMessage = 
                `🚀 *Welcome to Solana Token Bot!* 🚀\n\n` +
                `Hello ${firstName}! I can help you track and discover Solana tokens.\n\n` +
                `📚 *Available Commands:*\n` +
                `• /search <term> - Search for tokens\n` +
                `• /filter - View token filters\n` +
                `• /newmints - See newest tokens\n` +
                `• /prelaunch - Find pre-launch tokens\n` +
                `• /help - Show all commands\n\n` +
                `💡 *Tips:*\n` +
                `• Always DYOR before investing\n` +
                `• Check token safety and contracts\n` +
                `• Start with small amounts\n` +
                `• Be aware of scams and risks`;

            await ctx.replyWithMarkdown(welcomeMessage, { 
                disable_web_page_preview: true,
                parse_mode: 'Markdown',
                reply_markup: getKeyboard()
            });

            console.log(`Welcome message sent to user: ${firstName}`);

        } catch (error) {
            console.error('Error in start command:', error);
            await ctx.reply('❌ Error showing welcome message. Please try again.');
        }
    });
}; 