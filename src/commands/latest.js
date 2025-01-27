const axios = require('axios');
const { delay } = require('../utils/helpers');

module.exports = (bot) => {
    bot.command('latest', async (ctx) => {
        try {
            const statusMsg = await ctx.reply('🔍 Fetching latest tokens...');

            // Fetch latest tokens from DexScreener
            const response = await axios.get('https://api.dexscreener.com/token-profiles/latest/v1', {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                }
            });

            if (!Array.isArray(response.data)) {
                throw new Error('Invalid API response format');
            }

            // Filter Solana tokens
            const solanaTokens = response.data.filter(token => 
                token.chainId === 'solana' && 
                token.tokenAddress && 
                token.description
            );

            if (solanaTokens.length === 0) {
                await ctx.reply('No new Solana tokens found.');
                return;
            }

            await ctx.reply(`Found ${solanaTokens.length} new Solana tokens. Displaying results...`);

            // Display tokens
            for (const token of solanaTokens) {
                try {
                    // Extract token name from description (usually first few words before any special characters)
                    const tokenName = token.description.split(/[,.()\n\r]/)[0].trim();
                    
                    // Try to get rugcheck data
                    let rugcheckInfo = '';
                    try {
                        const rugcheckResponse = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${token.tokenAddress}`, {
                            headers: {
                                'Accept': 'application/json'
                            }
                        });
                        
                        if (rugcheckResponse.data) {
                            const { score, warnings } = rugcheckResponse.data;
                            rugcheckInfo = `
🚨 *Rugcheck Score:* ${score}/100
${warnings && warnings.length > 0 ? `⚠️ *Warnings:*\n${warnings.map(w => `• ${w}`).join('\n')}` : '✅ No warnings found'}`;
                        }
                    } catch (rugcheckError) {
                        console.error('Rugcheck API error:', rugcheckError);
                        rugcheckInfo = '\n⚠️ *Rugcheck:* Unable to fetch safety data';
                    }

                    const message = `
*${tokenName}*

📝 *Description:*
${token.description}

🔗 *Token Information:*
• Chain: Solana
• Address: \`${token.tokenAddress}\`
${token.links ? '\n🌐 *Links:*' + token.links.map(link => 
    `\n• ${link.type ? `${link.type.charAt(0).toUpperCase() + link.type.slice(1)}: ` : ''}[${link.label || 'Link'}](${link.url})`
).join('') : ''}

${rugcheckInfo}

🔍 *Quick Links:*
• [DexScreener](${token.url})
• [Solscan](https://solscan.io/token/${token.tokenAddress})
• [Birdeye](https://birdeye.so/token/${token.tokenAddress})
• [Rugcheck](https://rugcheck.xyz/tokens/${token.tokenAddress})

⚠️ *Risk Warning:*
• Always DYOR before investing
• Check contract verification
• Verify liquidity & holders
• Monitor trading patterns
`;

                    await ctx.replyWithMarkdown(message, { 
                        disable_web_page_preview: true 
                    });
                    await delay(1000); // Rate limiting
                } catch (error) {
                    console.error('Error sending token message:', error);
                    continue;
                }
            }

            await ctx.reply(
                `✅ Latest tokens display complete!\n\n` +
                `💡 Tips:\n` +
                `• Always verify tokens before trading\n` +
                `• Check social media links\n` +
                `• Monitor liquidity levels\n` +
                `• Use /help for more commands`
            );

        } catch (error) {
            console.error('Error in latest command:', error);
            await ctx.reply('❌ Error fetching latest tokens. Please try again later.');
        }
    });
}; 