const TokenService = require('../services/tokenService');
const { delay } = require('../utils/helpers');

module.exports = (bot) => {
    bot.command('search', async (ctx) => {
        try {
            const searchTerm = ctx.message.text.split('/search ')[1]?.toLowerCase();
            
            if (!searchTerm) {
                await ctx.reply("Please specify a search term. Example: /search solana");
                return;
            }

            const statusMsg = await ctx.reply(`🔍 Searching for "${searchTerm}"...`);
            
            const tokens = await TokenService.searchSolanaTokens(searchTerm);
            
            if (!tokens || tokens.length === 0) {
                await ctx.reply(`No tokens found matching "${searchTerm}"`);
                return;
            }

            await ctx.reply(`Found ${tokens.length} tokens. Displaying results...`);

            for (const token of tokens) {
                const isDexScreenerToken = !!token.dexscreener_data;
                
                const message = `
*${token.name} (${token.symbol.toUpperCase()})*

💰 *Price Information:*
• Current Price: $${token.market_data?.current_price?.usd?.toFixed(8) || 'Unknown'}
• 24h Change: ${token.market_data?.price_change_percentage_24h?.toFixed(2) || 0}%
${isDexScreenerToken ? `• Liquidity: $${Number(token.dexscreener_data?.liquidity).toLocaleString() || 'Unknown'}
• DEX: ${token.dexscreener_data?.dex || 'Unknown'}` : `• 7d Change: ${token.market_data?.price_change_percentage_7d?.toFixed(2) || 0}%`}

📊 *Market Data:*
• Market Cap: $${token.market_data?.market_cap?.usd ? Number(token.market_data.market_cap.usd).toLocaleString() : 'Unknown'}
• FDV: $${token.market_data?.fully_diluted_valuation?.usd ? Number(token.market_data.fully_diluted_valuation.usd).toLocaleString() : 'Unknown'}
• 24h Volume: $${token.market_data?.total_volume?.usd ? Number(token.market_data.total_volume.usd).toLocaleString() : 'Unknown'}

${isDexScreenerToken ? `⏰ *Launch Information:*
• Created: ${new Date(token.dexscreener_data.created_at).toLocaleString()}
• Pair Address: ${token.dexscreener_data.pairs}` : ''}

🔍 *Verification Links:*
• [Solscan](https://solscan.io/token/${token.contract_address || ''})
• [Birdeye](https://birdeye.so/token/${token.contract_address || ''})
• [DexScreener](https://dexscreener.com/solana/${token.contract_address || ''})
• [RugCheck](https://rugcheck.xyz/tokens/${token.contract_address || ''})

⚠️ *Risk Warning:*
• Always DYOR before investing
• Check contract verification
• Verify liquidity & holders
• Monitor trading patterns
• Start with small amounts
• Be aware of potential risks
`;

                await ctx.replyWithMarkdown(message, { 
                    disable_web_page_preview: true 
                });
                await delay(1000);
            }

            await ctx.reply(
                "✅ Search complete!\n\n" +
                "💡 Tips:\n" +
                "• Always verify tokens before trading"
            );

        } catch (error) {
            console.error('Error in search command:', error);
            await ctx.reply('❌ Error searching tokens. Please try again.');
        }
    });
}; 