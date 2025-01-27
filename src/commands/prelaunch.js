const { searchPreLaunchTokens } = require('../services/tokenService');
const { delay, getTokenStatus } = require('../utils/helpers');

module.exports = (bot) => {
    bot.command('prelaunch', async (ctx) => {
        try {
            const searchTerm = ctx.message.text.split('/prelaunch ')[1]?.toLowerCase();
            
            if (!searchTerm) {
                await ctx.reply("ℹ️ Please specify a search term. Example: /prelaunch sol");
                return;
            }

            const statusMsg = await ctx.reply(`🔍 Searching for pre-launch tokens matching "${searchTerm}"...`);
            
            const tokens = await searchPreLaunchTokens(searchTerm);

            if (!tokens.length) {
                await ctx.reply(`❌ No pre-launch tokens found matching "${searchTerm}"`);
                return;
            }

            await ctx.reply(`Found ${tokens.length} pre-launch tokens. Displaying details...`);

            // Process tokens in chunks
            const CHUNK_SIZE = 5;
            for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
                const chunk = tokens.slice(i, i + CHUNK_SIZE);
                
                for (const token of chunk) {
                    const message = `
*🚀 Pre-launch Token Found*
📝 Name: ${token.name || 'Unknown'}
💎 Symbol: ${token.symbol || 'Unknown'}
📍 Address: \`${token.address}\`
🔢 Decimals: ${token.decimals || 'Unknown'}
💰 Supply: ${token.supply ? Number(token.supply).toLocaleString() : 'Unknown'}
👥 Holders: ${token.holder_count || '0'}
🕒 Created: ${token.created_time ? new Date(token.created_time * 1000).toLocaleString() : 'Unknown'}
💵 Price: ${token.price_usd ? `$${token.price_usd}` : '⏳ Not priced yet'}
📊 Status: ${getTokenStatus(token)}

🔗 *Verification Links:*
• [Solscan](https://solscan.io/token/${token.address})
• [Birdeye](https://birdeye.so/token/${token.address})
• [Raydium](https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${token.address})
⚠️ [Token Safety](https://rugcheck.xyz/tokens/${token.address})

⚠️ *DYOR! Pre-launch tokens are extremely high risk!*
• Verify contract ownership
• Check token distribution
• Research the team
• Be cautious of scams
`;

                    await ctx.replyWithMarkdown(message, { 
                        disable_web_page_preview: true 
                    });
                    await delay(1000);
                }

                if (i + CHUNK_SIZE < tokens.length) {
                    await delay(3000);
                }
            }

            await ctx.reply(
                `✅ Displayed all ${tokens.length} pre-launch tokens.\n\n` +
                "⚠️ Important Warnings:\n" +
                "• Pre-launch tokens are extremely risky\n" +
                "• Many could be scams or rugs\n" +
                "• Always verify contracts\n" +
                "• Never invest more than you can afford to lose\n" +
                "🔄 Use /prelaunch again to refresh results"
            );

        } catch (error) {
            console.error('Error in prelaunch command:', error);
            await ctx.reply(
                `❌ Error searching pre-launch tokens: ${error.message}\n` +
                "Please try again later or contact support."
            );
        }
    });
}; 