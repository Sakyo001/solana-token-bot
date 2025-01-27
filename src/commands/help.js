module.exports = (bot) => {
    bot.command('help', async (ctx) => {
        try {
            const helpMessage = 
                `📚 *Available Commands:*\n\n` +
                `• /start - Show welcome message\n` +
                `• /latest - View latest Solana tokens\n` +
                `• /search <term> - Search for specific tokens\n` +
                `• /prelaunch <term> - Search pre-launch tokens\n` +
                `• /filter - Show token filters\n` +
                `• /newmints - View newest token mints\n` +
                `• /help - Show this help message\n\n` +
                `💡 *Tips:*\n` +
                `• Use /prelaunch to find tokens before launch\n` +
                `• Use /filter to find tokens by market cap\n` +
                `• Always verify contracts and team\n` +
                `• Research thoroughly before investing\n` +
                `• Be extremely careful with new tokens`;

            await ctx.replyWithMarkdown(helpMessage);
        } catch (error) {
            console.error('Error in help command:', error);
            await ctx.reply('❌ Error showing help message. Please try again.');
        }
    });
}; 